package controllers

import (
	"encoding/json"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/skydot/backend/src/models"
	"github.com/skydot/backend/src/utils"
)

var icaoRe = regexp.MustCompile(`^[0-9a-f]{6}$`)

const trailLimit = 200 // last N positions, no time constraint

// AircraftController handles aircraft detail and search endpoints.
type AircraftController struct {
	pool *pgxpool.Pool
	rdb  *redis.Client
}

// NewAircraftController creates an AircraftController.
func NewAircraftController(pool *pgxpool.Pool, rdb *redis.Client) *AircraftController {
	return &AircraftController{pool: pool, rdb: rdb}
}

// GetDetail handles GET /api/v1/aircraft/{icao24}.
func (ac *AircraftController) GetDetail(w http.ResponseWriter, r *http.Request) {
	icao24 := r.PathValue("icao24")
	if icao24 == "" {
		utils.Error(w, http.StatusBadRequest, "missing icao24")
		return
	}
	icao24 = strings.ToLower(strings.TrimSpace(icao24))
	if !icaoRe.MatchString(icao24) {
		utils.Error(w, http.StatusBadRequest, "invalid icao24 format")
		return
	}
	ctx := r.Context()

	resp := models.AircraftDetailResponse{
		ICAO24: icao24,
		Trail:  []models.TrailPoint{},
	}

	// Static data from PostgreSQL
	var aircraft models.Aircraft
	err := ac.pool.QueryRow(ctx,
		`SELECT icao24, registration, type_code, type_description, operator_icao, operator_name, owner, is_helicopter, last_updated
		 FROM aircraft_static WHERE icao24 = $1`,
		icao24,
	).Scan(
		&aircraft.ICAO24, &aircraft.Registration, &aircraft.TypeCode, &aircraft.TypeDescription,
		&aircraft.OperatorICAO, &aircraft.OperatorName, &aircraft.Owner, &aircraft.IsHelicopter, &aircraft.LastUpdated,
	)
	if err == nil {
		resp.Registration = aircraft.Registration
		resp.TypeCode = aircraft.TypeCode
		resp.TypeDescription = aircraft.TypeDescription
		resp.IsHelicopter = aircraft.IsHelicopter
		if aircraft.OperatorName != nil {
			resp.Operator = aircraft.OperatorName
		} else {
			resp.Operator = aircraft.OperatorICAO
		}
	}

	// Current position from Redis
	raw, err := ac.rdb.HGet(ctx, aircraftLiveKey, icao24).Result()
	if err == nil {
		var live models.LiveAircraft
		if err := json.Unmarshal([]byte(raw), &live); err == nil {
			resp.Callsign = live.Callsign
			ts := time.Unix(live.TS, 0)
			cp := &models.CurrentPosition{
				Latitude:  live.Lat,
				Longitude: live.Lon,
				OnGround:  live.Grnd,
				Timestamp: ts,
			}
			cp.Altitude = live.Alt
			cp.Velocity = live.Vel
			cp.Heading = live.Hdg
			cp.VerticalRate = live.VR
			resp.Current = cp
		}
	} else if resp.Registration == nil {
		// Not in Redis and not in static DB — unknown aircraft
		utils.Error(w, http.StatusNotFound, "aircraft not found")
		return
	}

	// Last N positions from PostgreSQL (no time window — works even when poller is rate-limited)
	rows, err := ac.pool.Query(ctx,
		`SELECT latitude, longitude, baro_altitude, time_position
		 FROM aircraft_positions
		 WHERE icao24 = $1
		 ORDER BY time_position DESC
		 LIMIT $2`,
		icao24, trailLimit,
	)
	if err == nil {
		defer rows.Close()
		var pts []models.TrailPoint
		for rows.Next() {
			var tp models.TrailPoint
			if err := rows.Scan(&tp.Latitude, &tp.Longitude, &tp.Altitude, &tp.Timestamp); err == nil {
				pts = append(pts, tp)
			}
		}
		// Reverse so trail is ordered oldest → newest (ASC by time)
		for i, j := 0, len(pts)-1; i < j; i, j = i+1, j-1 {
			pts[i], pts[j] = pts[j], pts[i]
		}
		resp.Trail = pts
	}

	utils.JSON(w, http.StatusOK, resp)
}

// Search handles GET /api/v1/aircraft/search?q=&limit=.
func (ac *AircraftController) Search(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		utils.Error(w, http.StatusBadRequest, "query parameter 'q' is required")
		return
	}
	if len(q) > 100 {
		utils.Error(w, http.StatusBadRequest, "query too long")
		return
	}
	q = strings.ToUpper(q)

	limit := 10
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 50 {
			limit = n
		}
	}

	ctx := r.Context()

	// Fetch all live aircraft from Redis and filter
	raw, err := ac.rdb.HGetAll(ctx, aircraftLiveKey).Result()
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "failed to fetch aircraft")
		return
	}

	type scoredResult struct {
		result models.SearchResult
		score  int
	}

	var scored []scoredResult
	for _, v := range raw {
		var a models.LiveAircraft
		if err := json.Unmarshal([]byte(v), &a); err != nil {
			continue
		}

		score := 0
		callsign := ""
		if a.Callsign != nil {
			callsign = strings.ToUpper(*a.Callsign)
		}
		icao := strings.ToUpper(a.ID)

		// Exact callsign match
		if callsign == q || icao == q {
			score = 100
		} else if strings.HasPrefix(callsign, q) || strings.HasPrefix(icao, q) {
			score = 50
		} else if strings.Contains(callsign, q) || strings.Contains(icao, q) {
			score = 10
		} else {
			continue
		}

		sr := models.SearchResult{
			ICAO24:   a.ID,
			Callsign: a.Callsign,
			Latitude: a.Lat,
			Longitude: a.Lon,
			Altitude:  a.Alt,
			OnGround:  a.Grnd,
		}
		scored = append(scored, scoredResult{result: sr, score: score})
	}

	// Sort by score descending
	sort.Slice(scored, func(i, j int) bool {
		return scored[i].score > scored[j].score
	})

	// Enrich top results with static data
	results := make([]models.SearchResult, 0, limit)
	for i, sr := range scored {
		if i >= limit {
			break
		}
		// Try to get type info from PostgreSQL
		var typeDesc, operator *string
		_ = ac.pool.QueryRow(ctx,
			`SELECT type_description, COALESCE(operator_name, operator_icao) FROM aircraft_static WHERE icao24 = $1`,
			sr.result.ICAO24,
		).Scan(&typeDesc, &operator)
		sr.result.TypeDescription = typeDesc
		sr.result.Operator = operator
		results = append(results, sr.result)
	}

	utils.JSON(w, http.StatusOK, map[string]interface{}{
		"results": results,
		"count":   len(results),
	})
}
