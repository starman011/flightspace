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

// GetISSCrew serves the cached crew manifest from people:space Redis key.
func (ac *AircraftController) GetISSCrew(w http.ResponseWriter, r *http.Request) {
	raw, err := ac.rdb.Get(r.Context(), "people:space").Result()
	if err != nil {
		utils.Error(w, http.StatusServiceUnavailable, "crew data unavailable")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(raw))
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

	// Last N positions from Redis (bounded list, zero disk growth).
	// LRange 0..N-1 returns newest → oldest; we reverse so it's oldest → newest.
	trailKey := trailKeyPrefix + icao24
	if raws, err := ac.rdb.LRange(ctx, trailKey, 0, int64(trailLimit-1)).Result(); err == nil && len(raws) > 0 {
		pts := make([]models.TrailPoint, 0, len(raws))
		for i := len(raws) - 1; i >= 0; i-- {
			var tp models.TrailPoint
			if err := json.Unmarshal([]byte(raws[i]), &tp); err == nil {
				pts = append(pts, tp)
			}
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
		// Airline IATA from callsign ICAO prefix — powers the logo in search results
		if len(callsign) >= 3 {
			if iata, ok := data.AirlineICAOtoIATA[callsign[:3]]; ok {
				sr.AirlineIATA = &iata
			}
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

var fleetAirlineRe = regexp.MustCompile(`^[A-Z0-9]{2,3}$`)
var fleetTypeRe = regexp.MustCompile(`^[A-Z0-9]{2,4}$`)

// Fleet handles GET /api/v1/fleet?airline={ICAO}  or  ?type={ICAO type code}.
// Lists live aircraft worldwide matching an airline (callsign prefix) or an
// aircraft type — powers the /planes discovery page. Cached 20s in Redis.
func (ac *AircraftController) Fleet(w http.ResponseWriter, r *http.Request) {
	airline := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("airline")))
	typ := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("type")))

	if airline == "" && typ == "" {
		utils.Error(w, http.StatusBadRequest, "airline or type query parameter is required")
		return
	}
	if airline != "" && !fleetAirlineRe.MatchString(airline) {
		utils.Error(w, http.StatusBadRequest, "invalid airline code")
		return
	}
	if typ != "" && !fleetTypeRe.MatchString(typ) {
		utils.Error(w, http.StatusBadRequest, "invalid type code")
		return
	}

	ctx := r.Context()
	cacheKey := "fleet:" + airline + ":" + typ
	if cached, err := ac.rdb.Get(ctx, cacheKey).Result(); err == nil && cached != "" {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(cached))
		return
	}

	raw, err := ac.rdb.HGetAll(ctx, aircraftLiveKey).Result()
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "failed to fetch aircraft")
		return
	}

	type fleetItem struct {
		ICAO24   string   `json:"icao24"`
		Callsign *string  `json:"callsign,omitempty"`
		Lat      float64  `json:"lat"`
		Lon      float64  `json:"lon"`
		Alt      *float64 `json:"alt_ft,omitempty"`
		Hdg      *float64 `json:"hdg,omitempty"`
		Vel      *float64 `json:"vel,omitempty"`
		Type     *string  `json:"type,omitempty"`
		Country  *string  `json:"country,omitempty"`
		OnGround bool     `json:"on_ground"`
	}

	items := make([]fleetItem, 0, 256)
	for _, v := range raw {
		var a models.LiveAircraft
		if err := json.Unmarshal([]byte(v), &a); err != nil {
			continue
		}
		if a.Cat != "plane" && a.Cat != "helicopter" {
			continue
		}
		if airline != "" {
			cs := ""
			if a.Callsign != nil {
				cs = strings.ToUpper(strings.TrimSpace(*a.Callsign))
			}
			if !strings.HasPrefix(cs, airline) {
				continue
			}
		}
		if typ != "" {
			if a.T == nil || strings.ToUpper(strings.TrimSpace(*a.T)) != typ {
				continue
			}
		}
		items = append(items, fleetItem{
			ICAO24: a.ID, Callsign: a.Callsign, Lat: a.Lat, Lon: a.Lon,
			Alt: a.Alt, Hdg: a.Hdg, Vel: a.Vel, Type: a.T, Country: a.Ctry, OnGround: a.Grnd,
		})
	}

	sort.Slice(items, func(i, j int) bool {
		ci, cj := "", ""
		if items[i].Callsign != nil {
			ci = *items[i].Callsign
		}
		if items[j].Callsign != nil {
			cj = *items[j].Callsign
		}
		return ci < cj
	})

	total := len(items)
	if len(items) > 500 {
		items = items[:500]
	}

	body, _ := json.Marshal(map[string]interface{}{
		"airline": airline,
		"type":    typ,
		"count":   total,
		"flights": items,
	})
	ac.rdb.Set(ctx, cacheKey, string(body), 20*time.Second)
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(body)
}

// GetRoute handles GET /api/v1/aircraft/{icao24}/route.
// Priority: 1) adsbdb.com API (real flight plan data), 2) OpenFlights route DB. No guesswork.
func (ac *AircraftController) GetRoute(w http.ResponseWriter, r *http.Request) {
	icao24 := strings.ToLower(strings.TrimSpace(r.PathValue("icao24")))
	if icao24 == "" || !icaoRe.MatchString(icao24) {
		utils.Error(w, http.StatusBadRequest, "invalid icao24")
		return
	}

	empty := models.RouteResponse{ICAO24: icao24, Source: "none"}

	// Get live position — needed for ETA
	raw, err := ac.rdb.HGet(r.Context(), aircraftLiveKey, icao24).Result()
	if err != nil {
		utils.JSON(w, http.StatusOK, empty)
		return
	}
	var live models.LiveAircraft
	if json.Unmarshal([]byte(raw), &live) != nil {
		utils.JSON(w, http.StatusOK, empty)
		return
	}

	callsign := ""
	if live.Callsign != nil {
		callsign = strings.TrimSpace(*live.Callsign)
	}
	if callsign == "" {
		utils.JSON(w, http.StatusOK, empty)
		return
	}

	// Try adsbdb.com API first (real flight plan data)
	if result, ok := ac.lookupAdsbDB(callsign, icao24, &live); ok {
		utils.JSON(w, http.StatusOK, result)
		return
	}

	// Fallback: OpenFlights route DB
	dep, arr := data.LookupRoute(callsign, live.Lat, live.Lon)
	if dep == nil || arr == nil {
		utils.JSON(w, http.StatusOK, empty)
		return
	}

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

	// Extract airline IATA from callsign ICAO prefix
	if len(callsign) >= 3 {
		if iata, ok := data.AirlineICAOtoIATA[callsign[:3]]; ok {
			result.AirlineIATA = &iata
		}
	}

	ac.computeETAInline(&result, &live)
	utils.JSON(w, http.StatusOK, result)
}

// adsbdb response types
type adsbDBResponse struct {
	Response struct {
		FlightRoute *adsbDBRoute `json:"flightroute"`
	} `json:"response"`
}
type adsbDBRoute struct {
	Callsign string        `json:"callsign"`
	Origin   *adsbDBPoint  `json:"origin"`
	Dest     *adsbDBPoint  `json:"destination"`
	Airline  *adsbDBAirline `json:"airline"`
}
type adsbDBPoint struct {
	Name     string  `json:"name"`
	ICAO     string  `json:"icao_code"`
	IATA     string  `json:"iata_code"`
	Lat      float64 `json:"latitude"`
	Lon      float64 `json:"longitude"`
	City     string  `json:"municipality"`
}
type adsbDBAirline struct {
	Name string `json:"name"`
	ICAO string `json:"icao"`
	IATA string `json:"iata"`
}

var adsbDBClient = &http.Client{Timeout: 3 * time.Second}

// lookupAdsbDB queries adsbdb.com for real flight route data.
func (ac *AircraftController) lookupAdsbDB(callsign, icao24 string, live *models.LiveAircraft) (models.RouteResponse, bool) {
	empty := models.RouteResponse{ICAO24: icao24, Source: "none"}

	// Check Redis cache first (cache for 1 hour — routes don't change mid-flight)
	cacheKey := "route:adsbdb:" + callsign
	if cached, err := ac.rdb.Get(context.Background(), cacheKey).Result(); err == nil {
		var result models.RouteResponse
		if json.Unmarshal([]byte(cached), &result) == nil {
			if result.Source == "none" {
				return empty, false
			}
			ac.computeETAInline(&result, live)
			return result, true
		}
	}

	resp, err := adsbDBClient.Get("https://api.adsbdb.com/v0/callsign/" + callsign)
	if err != nil {
		return empty, false
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		// Cache miss for 10 min to avoid hammering
		ac.rdb.Set(context.Background(), cacheKey, `{"source":"none"}`, 10*time.Minute)
		return empty, false
	}

	var data adsbDBResponse
	if json.NewDecoder(resp.Body).Decode(&data) != nil || data.Response.FlightRoute == nil {
		return empty, false
	}

	fr := data.Response.FlightRoute
	if fr.Origin == nil || fr.Dest == nil {
		return empty, false
	}

	result := models.RouteResponse{
		ICAO24: icao24,
		Source: "adsbdb",
	}
	result.DepartureICAO = &fr.Origin.ICAO
	result.DepartureName = &fr.Origin.Name
	result.DepartureIATA = &fr.Origin.IATA
	result.DepLat = &fr.Origin.Lat
	result.DepLon = &fr.Origin.Lon

	result.ArrivalICAO = &fr.Dest.ICAO
	result.ArrivalName = &fr.Dest.Name
	result.ArrivalIATA = &fr.Dest.IATA
	result.ArrLat = &fr.Dest.Lat
	result.ArrLon = &fr.Dest.Lon

	if fr.Airline != nil && fr.Airline.IATA != "" {
		iata := fr.Airline.IATA
		result.AirlineIATA = &iata
	}

	// Cache successful result for 1 hour
	if b, err := json.Marshal(result); err == nil {
		ac.rdb.Set(context.Background(), cacheKey, string(b), time.Hour)
	}

	ac.computeETAInline(&result, live)
	return result, true
}

// computeETAInline sets ETAMin on response using live speed and distance to arrival.
func (ac *AircraftController) computeETAInline(result *models.RouteResponse, live *models.LiveAircraft) {
	if result.ArrLat == nil || live.Vel == nil || *live.Vel <= 20 {
		return
	}
	dist := haversineKmAC(live.Lat, live.Lon, *result.ArrLat, *result.ArrLon)
	speedKmh := *live.Vel * 1.852
	if speedKmh > 0 {
		etaMin := math.Round((dist / speedKmh) * 60)
		result.ETAMin = &etaMin
	}
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

// GetHistory handles GET /api/v1/aircraft/{icao24}/history
// Returns archived flight trails for this aircraft (last 24h by default).
func (ac *AircraftController) GetHistory(w http.ResponseWriter, r *http.Request) {
	icao24 := r.PathValue("icao24")
	if icao24 == "" {
		http.Error(w, "missing icao24", http.StatusBadRequest)
		return
	}

	since := time.Now().Add(-24 * time.Hour)
	if s := r.URL.Query().Get("since"); s != "" {
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			since = t
		}
	}

	rows, err := ac.pool.Query(r.Context(),
		`SELECT id, callsign, trail, point_count, started_at, ended_at
		 FROM flight_trails
		 WHERE icao24 = $1 AND ended_at >= $2
		 ORDER BY ended_at DESC
		 LIMIT 10`,
		icao24, since,
	)
	if err != nil {
		http.Error(w, "query failed", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type trailRecord struct {
		ID         string          `json:"id"`
		Callsign   *string         `json:"callsign,omitempty"`
		Trail      json.RawMessage `json:"trail"`
		PointCount int             `json:"point_count"`
		StartedAt  time.Time       `json:"started_at"`
		EndedAt    time.Time       `json:"ended_at"`
	}

	results := make([]trailRecord, 0)
	for rows.Next() {
		var rec trailRecord
		if err := rows.Scan(&rec.ID, &rec.Callsign, &rec.Trail, &rec.PointCount, &rec.StartedAt, &rec.EndedAt); err != nil {
			continue
		}
		results = append(results, rec)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"icao24":  icao24,
		"flights": results,
	})
}

