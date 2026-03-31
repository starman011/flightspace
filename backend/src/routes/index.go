package routes

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/skydot/backend/src/controllers"
	"github.com/skydot/backend/src/middlewares"
)

// Setup registers all API routes onto mux.
func Setup(
	mux *http.ServeMux,
	pool *pgxpool.Pool,
	rdb *redis.Client,
	hub *controllers.Hub,
	launchPoller *controllers.LaunchPoller,
	jwtSecret string,
	nasaAPIKey string,
) {
	health  := controllers.NewHealthController(pool, rdb)
	session := controllers.NewSessionController(pool, rdb, jwtSecret)
	aircraft := controllers.NewAircraftController(pool, rdb)
	auth   := controllers.NewAuthController(pool, rdb, jwtSecret)
	user   := controllers.NewUserController(pool, rdb)
	ws     := controllers.NewWSController(hub, jwtSecret)
	launch   := controllers.NewLaunchController(rdb, launchPoller)
	asteroid := controllers.NewAsteroidController(rdb)
	apod     := controllers.NewAPODController(rdb, nasaAPIKey)
	waitlist := controllers.NewWaitlistController(pool)
	airport  := controllers.NewAirportController(rdb)

	authOpt := middlewares.AuthOptional(jwtSecret)
	authReq := middlewares.AuthRequired(jwtSecret)
	rateLimit := middlewares.RateLimit(rdb)

	// Health & metrics (no auth, no rate limiting)
	mux.HandleFunc("GET /api/v1/health", health.GetHealth)
	mux.HandleFunc("GET /api/v1/metrics", health.GetMetrics)

	// Session
	mux.Handle("POST /api/v1/session", rateLimit(http.HandlerFunc(session.CreateSession)))

	// Aircraft
	mux.Handle("GET /api/v1/aircraft/search", rateLimit(authOpt(http.HandlerFunc(aircraft.Search))))
	mux.Handle("GET /api/v1/aircraft/{icao24}", rateLimit(authOpt(http.HandlerFunc(aircraft.GetDetail))))

	// Auth
	mux.Handle("POST /api/v1/auth/register", rateLimit(http.HandlerFunc(auth.Register)))
	mux.Handle("POST /api/v1/auth/login", rateLimit(http.HandlerFunc(auth.Login)))
	mux.Handle("POST /api/v1/auth/logout", http.HandlerFunc(auth.Logout))

	// User (authenticated)
	mux.Handle("GET /api/v1/user/preferences", authReq(http.HandlerFunc(user.GetPreferences)))
	mux.Handle("PUT /api/v1/user/preferences", authReq(http.HandlerFunc(user.UpdatePreferences)))
	mux.Handle("GET /api/v1/user/watchlist", authReq(http.HandlerFunc(user.GetWatchlist)))
	mux.Handle("POST /api/v1/user/watchlist", authReq(http.HandlerFunc(user.AddWatchlist)))
	mux.Handle("DELETE /api/v1/user/watchlist/{id}", authReq(http.HandlerFunc(user.DeleteWatchlist)))

	// Space data
	mux.Handle("GET /api/v1/launches", rateLimit(http.HandlerFunc(launch.GetLaunches)))
	mux.Handle("GET /api/v1/asteroids", rateLimit(http.HandlerFunc(asteroid.GetAsteroids)))
	mux.Handle("GET /api/v1/apod", rateLimit(http.HandlerFunc(apod.GetAPOD)))

	// Airports
	mux.Handle("GET /api/v1/airports/{iata}/arrivals", rateLimit(http.HandlerFunc(airport.GetArrivals)))

	// Waitlist
	mux.Handle("POST /api/v1/waitlist", rateLimit(http.HandlerFunc(waitlist.Subscribe)))

	// WebSocket
	mux.HandleFunc("GET /ws", ws.ServeWS)
}
