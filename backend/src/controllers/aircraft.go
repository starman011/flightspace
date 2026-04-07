package controllers

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/skydot/backend/src/data"
	"github.com/skydot/backend/src/models"
	"github.com/skydot/backend/src/utils"
)

var icaoRe = regexp.MustCompile(`^[0-9a-f]{6}$`)

// getISSDetail serves the ISS detail response from satellite:live Redis key.
func (ac *AircraftController) getISSDetail(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	raw, err := ac.rdb.HGet(ctx, "satellite:live", "ISS").Result()
	if err != nil {
		utils.Error(w, http.StatusNotFound, "ISS position unavailable")
		return
	}

	var live models.LiveAircraft
	if err := json.Unmarshal([]byte(raw), &live); err != nil {
		utils.Error(w, http.StatusInternalServerError, "failed to parse ISS data")
		return
	}

	name := "International Space Station"
	ts := time.Unix(live.TS, 0)
	resp := models.AircraftDetailResponse{
		ICAO24:          live.ID,
		Callsign:        live.Callsign,
		Registration:    &name,
		TypeDescription: &name,
		Trail:           []models.TrailPoint{},
		Current: &models.CurrentPosition{
			Latitude:  live.Lat,
			Longitude: live.Lon,
			Timestamp: ts,
		},
	}

	utils.JSON(w, http.StatusOK, resp)
}

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

	// ── ISS fast-path: stored in satellite:live, not aircraft:live ──────────
	if icao24 == "iss" {
		ac.getISSDetail(w, r)
		return
	}

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

// GetRoute handles GET /api/v1/aircraft/{icao24}/route.
// Priority: 1) OpenFlights route DB (callsign → airline → route), 2) heading-based estimation.
func (ac *AircraftController) GetRoute(w http.ResponseWriter, r *http.Request) {
	icao24 := strings.ToLower(strings.TrimSpace(r.PathValue("icao24")))
	if icao24 == "" || !icaoRe.MatchString(icao24) {
		utils.Error(w, http.StatusBadRequest, "invalid icao24")
		return
	}

	// Get live position — needed for route matching and ETA
	raw, err := ac.rdb.HGet(r.Context(), aircraftLiveKey, icao24).Result()
	if err != nil {
		ac.getRouteFromHeading(w, r, icao24)
		return
	}
	var live models.LiveAircraft
	if json.Unmarshal([]byte(raw), &live) != nil {
		ac.getRouteFromHeading(w, r, icao24)
		return
	}

	// Try callsign-based route lookup from OpenFlights database
	callsign := ""
	if live.Callsign != nil {
		callsign = strings.TrimSpace(*live.Callsign)
	}
	if callsign != "" {
		dep, arr := data.LookupRoute(callsign, live.Lat, live.Lon)
		if dep != nil && arr != nil {
			result := models.RouteResponse{
				ICAO24: icao24,
				Source: "routes_db",
			}

			depICAO := dep.ICAO
			result.DepartureICAO = &depICAO
			result.DepartureName = &dep.Name
			result.DepartureIATA = &dep.IATA
			result.DepLat = &dep.Lat
			result.DepLon = &dep.Lon

			arrICAO := arr.ICAO
			result.ArrivalICAO = &arrICAO
			result.ArrivalName = &arr.Name
			result.ArrivalIATA = &arr.IATA
			result.ArrLat = &arr.Lat
			result.ArrLon = &arr.Lon

			// Compute ETA from current position to arrival
			if live.Vel != nil && *live.Vel > 20 {
				dist := haversineKmAC(live.Lat, live.Lon, arr.Lat, arr.Lon)
				speedKmh := *live.Vel * 1.852
				if speedKmh > 0 {
					etaMin := math.Round((dist / speedKmh) * 60)
					result.ETAMin = &etaMin
				}
			}

			utils.JSON(w, http.StatusOK, result)
			return
		}
	}

	// Fallback: heading-based estimation
	ac.getRouteFromHeading(w, r, icao24)
}

// getRouteFromHeading estimates departure/arrival airports from live position and heading.
// Does NOT use first trail point as departure — a plane at 30k feet clearly departed long ago.
func (ac *AircraftController) getRouteFromHeading(w http.ResponseWriter, r *http.Request, icao24 string) {
	ctx := r.Context()

	result := models.RouteResponse{
		ICAO24: icao24,
		Source: "trail",
	}

	// Get live position — this is our primary data source
	raw, err := ac.rdb.HGet(ctx, aircraftLiveKey, icao24).Result()
	if err != nil {
		utils.JSON(w, http.StatusOK, result)
		return
	}

	var live models.LiveAircraft
	if json.Unmarshal([]byte(raw), &live) != nil {
		utils.JSON(w, http.StatusOK, result)
		return
	}

	hdg := float64(0)
	if live.Hdg != nil {
		hdg = *live.Hdg
	}
	vel := float64(0)
	if live.Vel != nil {
		vel = *live.Vel
	}

	// Departure: look BEHIND the aircraft (reverse heading) for the nearest major airport
	if vel > 50 {
		reverseHdg := math.Mod(hdg+180, 360)
		behind, _ := findAirportInDirection(live.Lat, live.Lon, reverseHdg, 2500, 60)
		if behind != nil {
			result.DepartureICAO = &behind.ICAO
			result.DepartureName = &behind.Name
			result.DepartureIATA = &behind.IATA
			result.DepLat = &behind.Lat
			result.DepLon = &behind.Lon
		}
	}

	// Arrival: look AHEAD of the aircraft for the nearest airport in its path
	if vel > 50 {
		ahead, dist := findAirportInDirection(live.Lat, live.Lon, hdg, 2500, 45)
		if ahead != nil {
			result.ArrivalICAO = &ahead.ICAO
			result.ArrivalName = &ahead.Name
			result.ArrivalIATA = &ahead.IATA
			result.ArrLat = &ahead.Lat
			result.ArrLon = &ahead.Lon

			// ETA from distance and speed
			speedKmh := vel * 1.852
			if speedKmh > 0 {
				etaMin := (dist / speedKmh) * 60
				rounded := math.Round(etaMin)
				result.ETAMin = &rounded
			}
		}
	}

	utils.JSON(w, http.StatusOK, result)
}

// computeETA sets ETAMin on the route response using live position and speed.
func (ac *AircraftController) computeETA(result *models.RouteResponse, icao24 string) {
	raw, err := ac.rdb.HGet(context.Background(), aircraftLiveKey, icao24).Result()
	if err != nil {
		return
	}
	var live models.LiveAircraft
	if json.Unmarshal([]byte(raw), &live) != nil || live.Vel == nil || *live.Vel < 20 {
		return
	}
	dist := haversineKmAC(live.Lat, live.Lon, *result.ArrLat, *result.ArrLon)
	speedKmh := *live.Vel * 1.852
	if speedKmh > 0 {
		etaMin := math.Round((dist / speedKmh) * 60)
		result.ETAMin = &etaMin
	}
}

// findNearestAirport finds the closest airport to a given lat/lon.
func findNearestAirport(lat, lon float64) (*data.AirportInfo, float64) {
	var best *data.AirportInfo
	bestDist := math.Inf(1)
	for _, a := range data.AirportByICAO {
		d := haversineKmAC(lat, lon, a.Lat, a.Lon)
		if d < bestDist {
			bestDist = d
			a := a
			best = &a
		}
	}
	return best, bestDist
}

// findAirportInDirection finds the nearest airport in a given direction within maxKm and cone degrees.
func findAirportInDirection(lat, lon, heading, maxKm, coneDeg float64) (*data.AirportInfo, float64) {
	var best *data.AirportInfo
	bestDist := math.Inf(1)
	for _, a := range data.AirportByICAO {
		d := haversineKmAC(lat, lon, a.Lat, a.Lon)
		if d > maxKm || d < 10 {
			continue
		}
		brg := bearingAC(lat, lon, a.Lat, a.Lon)
		diff := math.Abs(brg - heading)
		if diff > 180 {
			diff = 360 - diff
		}
		if diff > coneDeg {
			continue
		}
		if d < bestDist {
			bestDist = d
			a := a
			best = &a
		}
	}
	return best, bestDist
}

// haversineKmAC calculates distance in km (avoid collision with airport.go's haversineKm).
func haversineKmAC(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371.0
	dLat := (lat2 - lat1) * math.Pi / 180
	dLon := (lon2 - lon1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	return R * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

// bearingAC calculates bearing from point 1 to point 2 in degrees.
func bearingAC(lat1, lon1, lat2, lon2 float64) float64 {
	la1 := lat1 * math.Pi / 180
	la2 := lat2 * math.Pi / 180
	dLon := (lon2 - lon1) * math.Pi / 180
	y := math.Sin(dLon) * math.Cos(la2)
	x := math.Cos(la1)*math.Sin(la2) - math.Sin(la1)*math.Cos(la2)*math.Cos(dLon)
	b := math.Atan2(y, x) * 180 / math.Pi
	if b < 0 {
		b += 360
	}
	return b
}

