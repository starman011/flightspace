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
	issPoller *controllers.ISSPoller,
	pushCtrl *controllers.PushController,
	jwtSecret string,
	nasaAPIKey string,
	googleClientID string,
	appleClientID string,
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
	lunar    := controllers.NewLunarController(rdb)
	desi     := controllers.NewDESIController()
	desi.StartBackgroundFetch() // pre-fetch 1M galaxies on boot, refresh every 24h
	oauth    := controllers.NewOAuthController(pool, rdb, jwtSecret, googleClientID, appleClientID)

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
	mux.Handle("GET /api/v1/aircraft/{icao24}/route", rateLimit(authOpt(http.HandlerFunc(aircraft.GetRoute))))
	mux.Handle("GET /api/v1/aircraft/{icao24}/history", rateLimit(authOpt(http.HandlerFunc(aircraft.GetHistory))))

	// Auth
	mux.Handle("POST /api/v1/auth/register", rateLimit(http.HandlerFunc(auth.Register)))
	mux.Handle("POST /api/v1/auth/login", rateLimit(http.HandlerFunc(auth.Login)))
	mux.Handle("POST /api/v1/auth/logout", rateLimit(http.HandlerFunc(auth.Logout)))
	mux.Handle("POST /api/v1/auth/google", rateLimit(http.HandlerFunc(oauth.GoogleLogin)))
	mux.Handle("POST /api/v1/auth/apple", rateLimit(http.HandlerFunc(oauth.AppleLogin)))

	// User (authenticated + rate limited)
	mux.Handle("GET /api/v1/user/preferences", rateLimit(authReq(http.HandlerFunc(user.GetPreferences))))
	mux.Handle("PUT /api/v1/user/preferences", rateLimit(authReq(http.HandlerFunc(user.UpdatePreferences))))
	mux.Handle("GET /api/v1/user/watchlist", rateLimit(authReq(http.HandlerFunc(user.GetWatchlist))))
	mux.Handle("POST /api/v1/user/watchlist", rateLimit(authReq(http.HandlerFunc(user.AddWatchlist))))
	mux.Handle("DELETE /api/v1/user/watchlist/{id}", rateLimit(authReq(http.HandlerFunc(user.DeleteWatchlist))))
	mux.Handle("GET /api/v1/user/pinned-launches", rateLimit(authReq(http.HandlerFunc(user.GetPinnedLaunches))))
	mux.Handle("POST /api/v1/user/pinned-launches", rateLimit(authReq(http.HandlerFunc(user.AddPinnedLaunch))))
	mux.Handle("DELETE /api/v1/user/pinned-launches/{id}", rateLimit(authReq(http.HandlerFunc(user.DeletePinnedLaunch))))

	// Space data
	mux.Handle("GET /api/v1/launches", rateLimit(http.HandlerFunc(launch.GetLaunches)))
	mux.Handle("GET /api/v1/asteroids", rateLimit(http.HandlerFunc(asteroid.GetAsteroids)))
	mux.Handle("GET /api/v1/apod", rateLimit(http.HandlerFunc(apod.GetAPOD)))
	mux.Handle("GET /api/v1/lunar/orbiters", rateLimit(http.HandlerFunc(lunar.GetOrbiters)))

	// Airports
	mux.Handle("GET /api/v1/airports/{iata}/arrivals", rateLimit(http.HandlerFunc(airport.GetArrivals)))
	mux.Handle("GET /api/v1/airports/{iata}/departures", rateLimit(http.HandlerFunc(airport.GetDepartures)))

	// Waitlist
	mux.Handle("POST /api/v1/waitlist", rateLimit(http.HandlerFunc(waitlist.Subscribe)))
	mux.Handle("GET /api/v1/admin/waitlist.csv", http.HandlerFunc(waitlist.Export))

	// DESI deep space catalog
	mux.Handle("GET /api/v1/desi/galaxies", rateLimit(http.HandlerFunc(desi.GetGalaxies)))
	mux.Handle("GET /api/v1/desi/galaxies.bin", rateLimit(http.HandlerFunc(desi.GetGalaxiesBinary)))
	mux.Handle("GET /api/v1/desi/galaxy/{targetid}", rateLimit(http.HandlerFunc(desi.GetGalaxyDetail)))
	mux.Handle("GET /api/v1/desi/enrich", rateLimit(http.HandlerFunc(desi.GetGalaxyEnrichment)))
	mux.Handle("GET /api/v1/desi/search", rateLimit(http.HandlerFunc(desi.SearchGalaxies)))

	// Weather
	weather := controllers.NewWeatherController(rdb)
	mux.Handle("GET /api/v1/weather/wind", rateLimit(http.HandlerFunc(weather.GetWind)))

	// ISS
	mux.Handle("GET /api/v1/iss/crew", rateLimit(http.HandlerFunc(aircraft.GetISSCrew)))
	mux.Handle("GET /api/v1/iss/stream", rateLimit(http.HandlerFunc(issPoller.GetStream)))

	// Push notifications (optional — nil when VAPID keys not set)
	// Always register vapid-key so frontend gets { enabled: false } instead of 404
	mux.Handle("GET /api/v1/push/vapid-key", rateLimit(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if pushCtrl != nil {
			pushCtrl.HandleGetVAPIDKey(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"enabled":false}`))
	})))
	if pushCtrl != nil {
		mux.Handle("POST /api/v1/push/subscribe", rateLimit(http.HandlerFunc(pushCtrl.HandleSubscribe)))
		mux.Handle("POST /api/v1/push/unsubscribe", rateLimit(http.HandlerFunc(pushCtrl.HandleUnsubscribe)))
		mux.Handle("GET /api/v1/push/check", rateLimit(http.HandlerFunc(pushCtrl.HandleCheckSubscription)))
	}

	// WebSocket
	mux.HandleFunc("GET /ws", ws.ServeWS)
}
