package main

import (
	"context"
	"crypto/tls"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/skydot/backend/src/controllers"
	dbpkg "github.com/skydot/backend/src/db"
	"github.com/skydot/backend/src/middlewares"
	"github.com/skydot/backend/src/routes"
	"golang.org/x/crypto/acme/autocert"
)

// App holds all application dependencies and wires them together.
type App struct {
	cfg    *Config
	db     *pgxpool.Pool
	redis  *redis.Client
	hub    *controllers.Hub
	server *http.Server
}

// NewApp initialises the database, Redis, and all application services.
func NewApp(cfg *Config) (*App, error) {
	ctx := context.Background()

	// Connect to PostgreSQL
	pool, err := dbpkg.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("postgres: %w", err)
	}

	// Run migrations
	if err := dbpkg.RunMigrations(cfg.DatabaseURL); err != nil {
		pool.Close()
		return nil, fmt.Errorf("migrations: %w", err)
	}
	log.Println(`{"level":"info","service":"app","msg":"migrations applied"}`)

	// Connect to Redis
	rdb, err := dbpkg.ConnectRedis(ctx, cfg.RedisURL)
	if err != nil {
		pool.Close()
		return nil, fmt.Errorf("redis: %w", err)
	}

	hub := controllers.NewHub(rdb)

	return &App{
		cfg:   cfg,
		db:    pool,
		redis: rdb,
		hub:   hub,
	}, nil
}

// Start begins all background goroutines and starts the HTTP server.
// Blocks until a shutdown signal is received, then gracefully stops.
func (a *App) Start() error {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start WebSocket hub
	go a.hub.Run(ctx)

	// Start aircraft poller (adsb.lol)
	poller := controllers.NewPoller(a.db, a.redis, a.cfg.OpenSkyUser, a.cfg.OpenSkyPass)
	go poller.Start(ctx)

	// Start satellite poller (CelesTrak TLE + SGP4)
	satPoller := controllers.NewSatellitePoller(a.redis)
	go satPoller.Start(ctx)

	// Start ship poller (AISStream.io — optional, disabled when AISSTREAM_KEY not set)
	shipPoller := controllers.NewShipPoller(a.redis, a.cfg.AISStreamKey)
	go shipPoller.Start(ctx)

	// Start solar system poller (NASA Horizons — planet positions every 5 min)
	solarPoller := controllers.NewSolarPoller(a.redis, a.hub)
	go solarPoller.Start(ctx)

	// Start NEO/asteroid poller (NASA NeoWs — hourly)
	neoPoller := controllers.NewNEOPoller(a.redis, a.hub, a.cfg.NASAAPIKey)
	go neoPoller.Start(ctx)

	// Start ISS live tracker (Open Notify — every 5s)
	issPoller := controllers.NewISSPoller(a.redis)
	go issPoller.Start(ctx)

	// Start launch manifest poller (Launch Library 2 — every 15 min)
	launchPoller := controllers.NewLaunchPoller(a.redis, a.cfg.LL2BaseURL)
	go launchPoller.Start(ctx)

	// Start data retention cleanup
	go startCleanup(ctx, a.db, a.cfg.RetentionHours)

	// Build handler chain: logging → CORS → routes
	mux := http.NewServeMux()
	routes.Setup(mux, a.db, a.redis, a.hub, a.cfg.JWTSecret)

	handler := middlewares.RequestLogger(middlewares.SecurityHeaders(middlewares.CORS(mux)))

	// Graceful shutdown on SIGINT / SIGTERM
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	if a.cfg.TLSDomain != "" {
		// Direct TLS mode: autocert obtains and auto-renews a Let's Encrypt certificate.
		// Use this when the server is directly internet-facing (no TLS-terminating proxy).
		// Set TLS_DOMAIN=skydot.app (or your domain) to activate.
		mgr := &autocert.Manager{
			Prompt:     autocert.AcceptTOS,
			HostPolicy: autocert.HostWhitelist(a.cfg.TLSDomain),
			Cache:      autocert.DirCache("/var/cache/autocert"),
		}

		// :80 — ACME HTTP-01 challenges + redirect to HTTPS
		httpRedirect := &http.Server{
			Addr:         ":80",
			Handler:      mgr.HTTPHandler(nil),
			ReadTimeout:  5 * time.Second,
			WriteTimeout: 5 * time.Second,
		}
		go func() {
			if err := httpRedirect.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Printf(`{"level":"warn","service":"app","msg":"http redirect error","error":%q}`, err)
			}
		}()

		a.server = &http.Server{
			Addr:    ":443",
			Handler: handler,
			TLSConfig: &tls.Config{
				GetCertificate: mgr.GetCertificate,
				MinVersion:     tls.VersionTLS12,
			},
			ReadTimeout:  15 * time.Second,
			WriteTimeout: 15 * time.Second,
			IdleTimeout:  60 * time.Second,
		}
		go func() {
			log.Printf(`{"level":"info","service":"app","msg":"server starting (TLS)","domain":%q}`, a.cfg.TLSDomain)
			if err := a.server.ListenAndServeTLS("", ""); err != nil && err != http.ErrServerClosed {
				log.Printf(`{"level":"error","service":"app","msg":"server error","error":%q}`, err)
			}
		}()
	} else {
		// Proxy mode: plain HTTP on configured port; TLS is handled upstream.
		a.server = &http.Server{
			Addr:         ":" + a.cfg.Port,
			Handler:      handler,
			ReadTimeout:  15 * time.Second,
			WriteTimeout: 15 * time.Second,
			IdleTimeout:  60 * time.Second,
		}
		go func() {
			log.Printf(`{"level":"info","service":"app","msg":"server starting","port":%q}`, a.cfg.Port)
			if err := a.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Printf(`{"level":"error","service":"app","msg":"server error","error":%q}`, err)
			}
		}()
	}

	<-quit
	log.Println(`{"level":"info","service":"app","msg":"shutting down"}`)

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	if err := a.server.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("server shutdown: %w", err)
	}

	a.db.Close()
	a.redis.Close()
	log.Println(`{"level":"info","service":"app","msg":"server stopped"}`)
	return nil
}

// startCleanup periodically deletes old positions and expired sessions.
func startCleanup(ctx context.Context, pool *pgxpool.Pool, retentionHours int) {
	if retentionHours <= 0 {
		retentionHours = 6
	}
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			runCleanup(ctx, pool, retentionHours)
		}
	}
}

func runCleanup(ctx context.Context, pool *pgxpool.Pool, retentionHours int) {
	result, err := pool.Exec(ctx,
		`DELETE FROM aircraft_positions WHERE received_at < NOW() - make_interval(hours => $1)`,
		retentionHours,
	)
	if err != nil {
		log.Printf(`{"level":"error","service":"cleanup","msg":"positions cleanup failed","error":%q}`, err)
		return
	}
	log.Printf(`{"level":"info","service":"cleanup","msg":"positions purged","rows":%d}`, result.RowsAffected())

	// Clean up expired anonymous sessions
	result, err = pool.Exec(ctx, `DELETE FROM anonymous_sessions WHERE expires_at < NOW()`)
	if err != nil {
		log.Printf(`{"level":"error","service":"cleanup","msg":"sessions cleanup failed","error":%q}`, err)
		return
	}
	log.Printf(`{"level":"info","service":"cleanup","msg":"sessions purged","rows":%d}`, result.RowsAffected())
}
