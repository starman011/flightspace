package controllers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/skydot/backend/src/models"
	"github.com/skydot/backend/src/utils"
)

const (
	pollInterval   = 15 * time.Second
	initialBackoff = 5 * time.Second
	maxBackoff     = 5 * time.Minute
	staleThreshold = 120 // seconds

	// adsb.lol — free, no registration, global coverage
	// point/lat/lon/radius — radius 21600nm covers the whole world
	adsbLolURL    = "https://api.adsb.lol/v2/point/0/0/21600"
	aircraftLiveKey = "aircraft:live"

	// airplanes.live — a second free aggregator running a *different*
	// volunteer receiver network, used to fill adsb.lol's coverage holes.
	// ADS-B is line-of-sight (~250nm from a ground receiver), so an
	// aggregator only sees where its volunteers live. Measured 2026-08-07:
	// 91.6% of adsb.lol's 13,122 aircraft sat in North America (65.2%) and
	// Europe (26.4%); Asia-East was 1.9% and India/South Asia 1.3%.
	// airplanes.live returned 58 aircraft over Delhi where adsb.lol had 15,
	// and 20 over Singapore where adsb.lol had 13.
	//
	// Its point query caps radius at 250nm (adsb.lol's does not), so the
	// supplement is built from hub points instead of one global sweep.
	airplanesLiveURL = "https://api.airplanes.live/v2/point/%.4f/%.4f/250"

	// Run the supplement every 4th poll (~60s). That stays well inside
	// staleThreshold (120s), so supplement-only aircraft never expire out of
	// Redis between runs — no flicker on the globe — while keeping request
	// volume against a free API low.
	supplementEvery   = 4
	supplementWorkers = 4

	// Trail storage in Redis — bounded per-aircraft list, zero disk growth.
	// Key format: aircraft:trail:<icao24>. Values are JSON-encoded TrailPoint.
	trailKeyPrefix = "aircraft:trail:"
	trailMaxPoints = 200            // LTRIM keeps newest N points
	trailTTL       = 4 * time.Hour  // auto-expire stale trails
)

// adsbLolResponse is the response envelope from api.adsb.lol
type adsbLolResponse struct {
	AC []adsbAircraft `json:"ac"`
}

// adsbAircraft is one aircraft entry in the adsb.lol / dump1090 format.
// Fields are already in feet (altitude) and knots (ground speed).
type adsbAircraft struct {
	Hex      string      `json:"hex"`
	Flight   string      `json:"flight"`
	R        string      `json:"r"`    // registration
	T        string      `json:"t"`    // ICAO type code
	Desc     string      `json:"desc"` // type description
	OwnOp    string      `json:"ownOp"` // operator name
	Category string      `json:"category"`
	AltBaro  interface{} `json:"alt_baro"` // float64 or "ground"
	AltGeom  float64     `json:"alt_geom"`
	GS       float64     `json:"gs"`           // ground speed (knots)
	Track    float64     `json:"track"`        // true track (degrees)
	GeomRate float64     `json:"geom_rate"`    // geometric vertical rate (ft/min)
	BaroRate float64     `json:"baro_rate"`    // barometric vertical rate (ft/min)
	Lat      float64     `json:"lat"`
	Lon      float64     `json:"lon"`
	Squawk   string      `json:"squawk"`
	Seen     float64     `json:"seen"`     // seconds since last message
	SeenPos  float64     `json:"seen_pos"` // seconds since last position
}

// Poller fetches live aircraft data and updates Redis + PostgreSQL.
type Poller struct {
	pool   *pgxpool.Pool
	rdb    *redis.Client
	client *http.Client
	polls  uint64 // poll counter; paces the coverage supplement
}

// NewPoller creates a Poller. username/password kept for API compatibility but unused.
func NewPoller(pool *pgxpool.Pool, rdb *redis.Client, username, password string) *Poller {
	return &Poller{
		pool:   pool,
		rdb:    rdb,
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

// Start begins the polling loop. Call in a goroutine.
func (p *Poller) Start(ctx context.Context) {
	backoff := initialBackoff
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	// First poll immediately
	p.poll(ctx, &backoff)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.poll(ctx, &backoff)
		}
	}
}

func (p *Poller) poll(ctx context.Context, backoff *time.Duration) {
	aircraft, err := p.fetchAdsbLol(ctx)
	if err != nil {
		RecordPoll(false)
		log.Printf(`{"level":"error","service":"poller","msg":"fetch failed","error":%q,"backoff_s":%d}`,
			err, int(backoff.Seconds()))
		time.Sleep(*backoff)
		*backoff = min2(*backoff*2, maxBackoff)
		return
	}

	*backoff = initialBackoff

	// Fill adsb.lol's coverage holes from a second receiver network. Runs on
	// the first poll and every supplementEvery-th one after, so the globe has
	// full coverage from startup rather than a minute in.
	supplemented := 0
	if p.polls%supplementEvery == 0 {
		if extra := p.fetchSupplement(ctx); len(extra) > 0 {
			before := len(aircraft)
			aircraft = mergeAircraft(aircraft, extra)
			supplemented = len(aircraft) - before
		}
	}
	p.polls++

	if err := p.storeInRedis(ctx, aircraft); err != nil {
		log.Printf(`{"level":"error","service":"poller","msg":"redis store failed","error":%q}`, err)
	}

	if err := p.storeTrails(ctx, aircraft); err != nil {
		log.Printf(`{"level":"error","service":"poller","msg":"redis trail store failed","error":%q}`, err)
	}

	if err := p.storePositions(ctx, aircraft); err != nil {
		log.Printf(`{"level":"error","service":"poller","msg":"postgres store failed","error":%q}`, err)
	}

	if err := p.removeStale(ctx); err != nil {
		log.Printf(`{"level":"error","service":"poller","msg":"stale removal failed","error":%q}`, err)
	}

	RecordPoll(true)
	log.Printf(`{"level":"info","service":"poller","msg":"poll complete","count":%d,"supplemented":%d}`,
		len(aircraft), supplemented)
}

// supplementPoints are traffic hubs in the regions where adsb.lol coverage is
// thin. North America and Europe are deliberately absent — adsb.lol already
// covers them densely, so querying them here would spend requests on aircraft
// we already have.
var supplementPoints = []struct{ Lat, Lon float64 }{
	// South Asia
	{28.5562, 77.1000},  // Delhi
	{19.0887, 72.8679},  // Mumbai
	{13.1986, 77.7066},  // Bengaluru
	{23.8103, 90.4125},  // Dhaka
	// Southeast Asia
	{13.6900, 100.7501}, // Bangkok
	{1.3644, 103.9915},  // Singapore
	{-6.1256, 106.6559}, // Jakarta
	{14.5086, 121.0195}, // Manila
	{3.1390, 101.6869},  // Kuala Lumpur
	// East Asia
	{22.3080, 113.9185}, // Hong Kong
	{31.1443, 121.8083}, // Shanghai
	{40.0799, 116.6031}, // Beijing
	{35.5494, 139.7798}, // Tokyo
	{37.4602, 126.4407}, // Seoul
	// Middle East
	{25.2532, 55.3657},  // Dubai
	{25.2731, 51.6080},  // Doha
	{41.2753, 28.7519},  // Istanbul
	// Africa
	{30.1219, 31.4056},  // Cairo
	{6.5774, 3.3212},    // Lagos
	{-1.3192, 36.9278},  // Nairobi
	{-26.1367, 28.2411}, // Johannesburg
	// South America
	{-23.4356, -46.4731}, // São Paulo
	{4.7016, -74.1469},   // Bogotá
	{-34.8222, -58.5358}, // Buenos Aires
	{-12.0219, -77.1143}, // Lima
	// Oceania
	{-33.9399, 151.1753}, // Sydney
	{-37.6690, 144.8410}, // Melbourne
	{-36.8485, 174.7633}, // Auckland
}

// fetchSupplement queries airplanes.live at each hub point and returns the
// union of what it finds. Failures are logged and skipped rather than
// returned: this is additive coverage, so a dead upstream must never fail the
// poll that already has adsb.lol's global sweep in hand.
func (p *Poller) fetchSupplement(ctx context.Context) []models.LiveAircraft {
	var (
		mu   sync.Mutex
		out  []models.LiveAircraft
		fail int
	)

	jobs := make(chan int)
	var wg sync.WaitGroup
	for w := 0; w < supplementWorkers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range jobs {
				pt := supplementPoints[i]
				ac, err := p.fetchPoint(ctx, fmt.Sprintf(airplanesLiveURL, pt.Lat, pt.Lon))
				mu.Lock()
				if err != nil {
					fail++
				} else {
					out = append(out, ac...)
				}
				mu.Unlock()
			}
		}()
	}
	for i := range supplementPoints {
		select {
		case jobs <- i:
		case <-ctx.Done():
			close(jobs)
			wg.Wait()
			return out
		}
	}
	close(jobs)
	wg.Wait()

	if fail > 0 {
		log.Printf(`{"level":"warn","service":"poller","msg":"supplement points failed","failed":%d,"total":%d}`,
			fail, len(supplementPoints))
	}
	return out
}

// mergeAircraft appends entries from extra whose ICAO24 is not already in
// base. base wins every conflict: it comes from the 15s global poll, so its
// positions are fresher than a supplement that runs every 60s.
func mergeAircraft(base, extra []models.LiveAircraft) []models.LiveAircraft {
	if len(extra) == 0 {
		return base
	}
	seen := make(map[string]struct{}, len(base))
	for _, a := range base {
		seen[a.ID] = struct{}{}
	}
	for _, a := range extra {
		if _, dup := seen[a.ID]; dup {
			continue
		}
		seen[a.ID] = struct{}{}
		base = append(base, a)
	}
	return base
}

// fetchAdsbLol fetches all aircraft from api.adsb.lol.
// Data is already in feet (altitude) and knots (ground speed) — no unit conversion needed.
func (p *Poller) fetchAdsbLol(ctx context.Context) ([]models.LiveAircraft, error) {
	return p.fetchPoint(ctx, adsbLolURL)
}

// fetchPoint fetches and parses one dump1090-format endpoint. adsb.lol and
// airplanes.live both serve this shape, so they share a decoder.
func (p *Poller) fetchPoint(ctx context.Context, url string) ([]models.LiveAircraft, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "ObjectTracer/1.0 flight-tracker")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, fmt.Errorf("rate limited (429)")
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 32*1024*1024))
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}

	var raw adsbLolResponse
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("parse json: %w", err)
	}

	return parseAdsbAircraft(raw.AC), nil
}

// parseAdsbAircraft converts adsb.lol aircraft entries to LiveAircraft structs.
func parseAdsbAircraft(raw []adsbAircraft) []models.LiveAircraft {
	aircraft := make([]models.LiveAircraft, 0, len(raw))
	now := time.Now().Unix()

	for _, s := range raw {
		// ICAO24 must be exactly 6 hex chars (skip MLAT "~xxxxxx" entries etc.)
		if len(s.Hex) != 6 {
			continue
		}
		if s.Lat == 0 && s.Lon == 0 {
			continue
		}
		// Skip aircraft not seen recently (position stale > 30s)
		if s.SeenPos > 30 {
			continue
		}

		a := models.LiveAircraft{
			ID:  strings.ToLower(strings.TrimSpace(s.Hex)),
			Lat: s.Lat,
			Lon: s.Lon,
			Cat: categoryToType(s.Category),
			TS:  now,
		}

		// Callsign
		if cs := utils.TrimCallsign(s.Flight); cs != "" {
			a.Callsign = &cs
		}

		// On-ground: alt_baro is the string "ground" when on the ground
		if altStr, ok := s.AltBaro.(string); ok && altStr == "ground" {
			a.Grnd = true
		} else if altVal, ok := s.AltBaro.(float64); ok && altVal > 0 {
			a.Alt = &altVal // already in feet
		}

		// Ground speed (already in knots)
		if s.GS > 0 {
			knots := s.GS
			a.Vel = &knots
		}

		// Heading / true track
		if s.Track > 0 {
			hdg := s.Track
			a.Hdg = &hdg
		}

		// Vertical rate (prefer geometric, fallback to barometric)
		vr := s.GeomRate
		if vr == 0 {
			vr = s.BaroRate
		}
		if vr != 0 {
			a.VR = &vr
		}

		aircraft = append(aircraft, a)
	}
	return aircraft
}

// categoryToType maps ICAO category codes to "plane", "helicopter", or "balloon".
// A7 = rotorcraft, B2 = lighter than air (balloon/airship).
func categoryToType(cat string) string {
	switch cat {
	case "A7":
		return "helicopter"
	case "B2":
		return "balloon"
	default:
		return "plane"
	}
}

// storeInRedis pipelines HSET for all aircraft into the aircraft:live hash.
func (p *Poller) storeInRedis(ctx context.Context, aircraft []models.LiveAircraft) error {
	if len(aircraft) == 0 {
		return nil
	}
	pipe := p.rdb.Pipeline()
	for _, a := range aircraft {
		b, err := json.Marshal(a)
		if err != nil {
			continue
		}
		pipe.HSet(ctx, aircraftLiveKey, a.ID, string(b))
	}
	_, err := pipe.Exec(ctx)
	return err
}

// storePositions upserts each aircraft into aircraft_latest — one row per ICAO24.
// Bounded to ~10k rows regardless of poll frequency. Trail history lives in Redis (storeTrails)
// to avoid unbounded Postgres disk growth.
func (p *Poller) storePositions(ctx context.Context, aircraft []models.LiveAircraft) error {
	if len(aircraft) == 0 {
		return nil
	}

	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	const upsertSQL = `
		INSERT INTO aircraft_latest
		  (icao24, callsign, longitude, latitude, baro_altitude, velocity, heading, vertical_rate, on_ground, time_position, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, to_timestamp($10), NOW())
		ON CONFLICT (icao24) DO UPDATE SET
		  callsign      = EXCLUDED.callsign,
		  longitude     = EXCLUDED.longitude,
		  latitude      = EXCLUDED.latitude,
		  baro_altitude = EXCLUDED.baro_altitude,
		  velocity      = EXCLUDED.velocity,
		  heading       = EXCLUDED.heading,
		  vertical_rate = EXCLUDED.vertical_rate,
		  on_ground     = EXCLUDED.on_ground,
		  time_position = EXCLUDED.time_position,
		  updated_at    = NOW()`

	for _, a := range aircraft {
		_, err := tx.Exec(ctx, upsertSQL,
			a.ID, a.Callsign, a.Lon, a.Lat, a.Alt, a.Vel, a.Hdg, a.VR, a.Grnd, a.TS,
		)
		if err != nil {
			return fmt.Errorf("upsert aircraft_latest: %w", err)
		}
	}

	return tx.Commit(ctx)
}

// storeTrails appends the latest position of each aircraft to a bounded Redis list.
// LPUSH pushes the newest point to head; LTRIM caps the list at trailMaxPoints.
// EXPIRE refreshes the TTL so inactive trails disappear automatically.
// Zero Postgres writes — trail storage is fully in memory, memory is bounded by active aircraft.
func (p *Poller) storeTrails(ctx context.Context, aircraft []models.LiveAircraft) error {
	if len(aircraft) == 0 {
		return nil
	}

	pipe := p.rdb.Pipeline()
	for _, a := range aircraft {
		tp := models.TrailPoint{
			Latitude:  a.Lat,
			Longitude: a.Lon,
			Altitude:  a.Alt,
			Timestamp: time.Unix(a.TS, 0),
		}
		b, err := json.Marshal(tp)
		if err != nil {
			continue
		}
		key := trailKeyPrefix + a.ID
		pipe.LPush(ctx, key, b)
		pipe.LTrim(ctx, key, 0, trailMaxPoints-1)
		pipe.Expire(ctx, key, trailTTL)
	}
	_, err := pipe.Exec(ctx)
	return err
}

// removeStale removes aircraft from Redis that haven't been updated within staleThreshold seconds.
// Before deletion, trails with ≥10 points are archived to Postgres for historical playback.
func (p *Poller) removeStale(ctx context.Context) error {
	raw, err := p.rdb.HGetAll(ctx, aircraftLiveKey).Result()
	if err != nil {
		return err
	}

	cutoff := time.Now().Unix() - staleThreshold
	stale := make([]string, 0)
	staleAircraft := make(map[string]models.LiveAircraft)

	for id, v := range raw {
		var a models.LiveAircraft
		if err := json.Unmarshal([]byte(v), &a); err != nil {
			continue
		}
		if a.TS < cutoff {
			stale = append(stale, id)
			staleAircraft[id] = a
		}
	}

	if len(stale) > 0 {
		// Archive trails to Postgres before deleting from Redis
		p.archiveTrails(ctx, stale, staleAircraft)

		if err := p.rdb.HDel(ctx, aircraftLiveKey, stale...).Err(); err != nil {
			return err
		}
		trailKeys := make([]string, len(stale))
		for i, id := range stale {
			trailKeys[i] = trailKeyPrefix + id
		}
		if err := p.rdb.Del(ctx, trailKeys...).Err(); err != nil {
			log.Printf(`{"level":"warn","service":"poller","msg":"trail cleanup failed","error":%q}`, err)
		}
		log.Printf(`{"level":"info","service":"poller","msg":"removed stale aircraft","count":%d}`, len(stale))
	}
	return nil
}

// archiveTrails persists Redis trails to Postgres for historical playback.
// Only archives trails with ≥10 points (short blips aren't worth storing).
func (p *Poller) archiveTrails(ctx context.Context, ids []string, aircraft map[string]models.LiveAircraft) {
	const minPoints = 10
	archived := 0

	for _, id := range ids {
		key := trailKeyPrefix + id
		raw, err := p.rdb.LRange(ctx, key, 0, int64(trailMaxPoints-1)).Result()
		if err != nil || len(raw) < minPoints {
			continue
		}

		points := make([]models.TrailPoint, 0, len(raw))
		for _, r := range raw {
			var tp models.TrailPoint
			if err := json.Unmarshal([]byte(r), &tp); err == nil {
				points = append(points, tp)
			}
		}
		if len(points) < minPoints {
			continue
		}

		trailJSON, err := json.Marshal(points)
		if err != nil {
			continue
		}

		// Points are newest-first (LPUSH order) — last element is earliest
		startedAt := points[len(points)-1].Timestamp
		endedAt := points[0].Timestamp
		a := aircraft[id]

		_, err = p.pool.Exec(ctx,
			`INSERT INTO flight_trails (icao24, callsign, trail, point_count, started_at, ended_at)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			id, a.Callsign, trailJSON, len(points), startedAt, endedAt,
		)
		if err != nil {
			log.Printf(`{"level":"warn","service":"poller","msg":"trail archive failed","icao24":%q,"error":%q}`, id, err)
			continue
		}
		archived++
	}

	if archived > 0 {
		log.Printf(`{"level":"info","service":"poller","msg":"archived flight trails","count":%d}`, archived)
	}
}

func toBool(v interface{}) bool {
	b, _ := v.(bool)
	return b
}

func min2(a, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}
