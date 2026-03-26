package controllers

import (
	"encoding/json"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	dbpkg "github.com/skydot/backend/src/db"
)

// HealthStatus holds the result of a dependency health check.
type HealthStatus struct {
	Status   string            `json:"status"` // "ok" | "degraded" | "error"
	Services map[string]string `json:"services"`
	Uptime   int64             `json:"uptime_seconds"`
	Version  string            `json:"version"`
}

// MetricsResponse is the payload for GET /api/v1/metrics.
type MetricsResponse struct {
	WebSocketConnections int64             `json:"websocket_connections"`
	AircraftTracked      int64             `json:"aircraft_tracked"`
	OpenSkyLastPoll      *time.Time        `json:"opensky_last_poll,omitempty"`
	OpenSkyPollStatus    string            `json:"opensky_poll_status"` // "ok" | "degraded" | "unknown"
	DBPool               map[string]int32  `json:"db_pool"`
	RedisInfo            map[string]string `json:"redis_info,omitempty"`
	RedisCounts          map[string]int64  `json:"redis_counts,omitempty"`
}

var (
	startTime       = time.Now()
	lastPollTime    atomic.Pointer[time.Time]
	lastPollSuccess atomic.Bool
	wsConnCount     atomic.Int64
	aircraftCount   atomic.Int64
)

// RecordPoll is called by the poller to update health metrics.
func RecordPoll(success bool) {
	now := time.Now()
	lastPollTime.Store(&now)
	lastPollSuccess.Store(success)
}

// IncrWSConns increments or decrements the active WebSocket connection counter.
func IncrWSConns(delta int64) {
	wsConnCount.Add(delta)
}

// SetAircraftCount updates the tracked aircraft count.
func SetAircraftCount(n int64) {
	aircraftCount.Store(n)
}

// HealthController handles health and metrics endpoints.
type HealthController struct {
	pool *pgxpool.Pool
	rdb  *redis.Client
}

// NewHealthController creates a HealthController.
func NewHealthController(pool *pgxpool.Pool, rdb *redis.Client) *HealthController {
	return &HealthController{pool: pool, rdb: rdb}
}

// GetHealth handles GET /api/v1/health.
func (h *HealthController) GetHealth(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	services := map[string]string{}
	overallStatus := "ok"

	// Check PostgreSQL
	if err := dbpkg.HealthCheckPostgres(ctx, h.pool); err != nil {
		services["database"] = "error"
		overallStatus = "degraded"
	} else {
		services["database"] = "ok"
	}

	// Check Redis
	if err := dbpkg.HealthCheckRedis(ctx, h.rdb); err != nil {
		services["redis"] = "error"
		overallStatus = "degraded"
	} else {
		services["redis"] = "ok"
	}

	// Check OpenSky freshness
	pt := lastPollTime.Load()
	if pt == nil {
		services["opensky"] = "unknown"
	} else if time.Since(*pt) > 60*time.Second {
		services["opensky"] = "stale"
		overallStatus = "degraded"
	} else if !lastPollSuccess.Load() {
		services["opensky"] = "error"
		overallStatus = "degraded"
	} else {
		services["opensky"] = "ok"
	}

	resp := HealthStatus{
		Status:   overallStatus,
		Services: services,
		Uptime:   int64(time.Since(startTime).Seconds()),
		Version:  "1.0.0",
	}

	statusCode := http.StatusOK
	if overallStatus != "ok" {
		statusCode = http.StatusServiceUnavailable
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(resp)
}

// GetMetrics handles GET /api/v1/metrics.
func (h *HealthController) GetMetrics(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	poolStats := dbpkg.GetPoolStats(h.pool)
	dbPool := map[string]int32{
		"total":     poolStats["total"],
		"acquired":  poolStats["acquired"],
		"idle":      poolStats["idle"],
		"max_conns": poolStats["max_conns"],
	}

	pollStatus := "unknown"
	var pollTime *time.Time
	if pt := lastPollTime.Load(); pt != nil {
		pollTime = pt
		if lastPollSuccess.Load() && time.Since(*pt) < 60*time.Second {
			pollStatus = "ok"
		} else {
			pollStatus = "degraded"
		}
	}

	resp := MetricsResponse{
		WebSocketConnections: wsConnCount.Load(),
		AircraftTracked:      aircraftCount.Load(),
		OpenSkyLastPoll:      pollTime,
		OpenSkyPollStatus:    pollStatus,
		DBPool:               dbPool,
	}

	// Redis hash counts — quickly shows how many entities each poller has written
	counts := map[string]int64{}
	for _, key := range []string{"aircraft:live", "satellite:live", "ship:live"} {
		if n, err := h.rdb.HLen(ctx, key).Result(); err == nil {
			counts[key] = n
		}
	}
	resp.RedisCounts = counts

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
