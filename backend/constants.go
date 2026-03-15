package main

import (
	"fmt"
	"os"
	"strconv"
)

// Config holds all application configuration loaded from environment variables.
type Config struct {
	Port           string
	DatabaseURL    string
	RedisURL       string
	JWTSecret      string
	OpenSkyUser    string
	OpenSkyPass    string
	AISStreamKey   string
	AllowedOrigin  string
	PollIntervalS  int
	MaxWSConns     int
	RetentionHours int
	// TLSDomain: when set, the server binds on :443 with autocert (Let's Encrypt)
	// and redirects :80 → HTTPS. Leave empty when running behind a TLS-terminating
	// proxy (Railway, Cloudflare, etc.) — the proxy already handles certificates.
	TLSDomain string
}

// LoadConfig reads configuration from environment variables with sensible defaults.
// Returns an error if any required variable is missing.
func LoadConfig() (*Config, error) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		return nil, fmt.Errorf("REDIS_URL is required")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET environment variable is required")
	}

	allowedOrigin := os.Getenv("ALLOWED_ORIGIN")
	if allowedOrigin == "" {
		allowedOrigin = "http://localhost:5173"
	}

	pollInterval := 15
	if v := os.Getenv("POLL_INTERVAL_S"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			pollInterval = n
		}
	}

	return &Config{
		Port:           port,
		DatabaseURL:    dbURL,
		RedisURL:       redisURL,
		JWTSecret:      jwtSecret,
		OpenSkyUser:    os.Getenv("OPENSKY_USER"),
		OpenSkyPass:    os.Getenv("OPENSKY_PASS"),
		AISStreamKey:   os.Getenv("AISSTREAM_KEY"),
		AllowedOrigin:  allowedOrigin,
		PollIntervalS:  pollInterval,
		MaxWSConns:     100,
		RetentionHours: 6,
		TLSDomain:      os.Getenv("TLS_DOMAIN"),
	}, nil
}

// Application-wide constants (not configurable via env)
const (
	AppVersion = "1.0.0"

	// OpenSky API
	OpenSkyURL         = "https://opensky-network.org/api/states/all"
	OpenSkyTimeout     = 15 // seconds
	StaleThresholdS    = 120
	FadeThresholdS     = 60

	// Session
	SessionTokenPrefix = "skd_anon_"
	SessionTTLDays     = 30
	SessionCacheTTLS   = 3600

	// JWT
	JWTExpiryDays = 7

	// WebSocket
	WSPingIntervalS  = 30
	WSIdleTimeoutMin = 5
	WSDeltaIntervalS = 5

	// Rate limiting
	RateLimitRequests = 100
	RateLimitWindowS  = 60

	// Redis keys
	RedisKeyLiveAircraft = "aircraft:live"
	RedisKeyWSConns      = "ws:connections"
	RedisKeySessionPrefix = "session:"
	RedisKeyRatePrefix    = "ratelimit:"
)
