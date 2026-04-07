package controllers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
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

	if err := p.storeInRedis(ctx, aircraft); err != nil {
		log.Printf(`{"level":"error","service":"poller","msg":"redis store failed","error":%q}`, err)
	}

	if err := p.storePositions(ctx, aircraft); err != nil {
		log.Printf(`{"level":"error","service":"poller","msg":"postgres store failed","error":%q}`, err)
	}

	if err := p.removeStale(ctx); err != nil {
		log.Printf(`{"level":"error","service":"poller","msg":"stale removal failed","error":%q}`, err)
	}

	RecordPoll(true)
	log.Printf(`{"level":"info","service":"poller","msg":"poll complete","count":%d}`, len(aircraft))
}

// fetchAdsbLol fetches all aircraft from api.adsb.lol.
// Data is already in feet (altitude) and knots (ground speed) — no unit conversion needed.
func (p *Poller) fetchAdsbLol(ctx context.Context) ([]models.LiveAircraft, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, adsbLolURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "SkyDot/1.0 flight-tracker")

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
// This bounds the table to ~10k rows regardless of poll frequency, preventing disk exhaustion.
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

	const appendSQL = `
		INSERT INTO aircraft_positions
		  (icao24, callsign, longitude, latitude, baro_altitude, velocity, heading, vertical_rate, on_ground, time_position)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, to_timestamp($10))`

	for _, a := range aircraft {
		_, err := tx.Exec(ctx, upsertSQL,
			a.ID, a.Callsign, a.Lon, a.Lat, a.Alt, a.Vel, a.Hdg, a.VR, a.Grnd, a.TS,
		)
		if err != nil {
			return fmt.Errorf("upsert aircraft_latest: %w", err)
		}
		// Append to aircraft_positions for trail history
		_, err = tx.Exec(ctx, appendSQL,
			a.ID, a.Callsign, a.Lon, a.Lat, a.Alt, a.Vel, a.Hdg, a.VR, a.Grnd, a.TS,
		)
		if err != nil {
			return fmt.Errorf("append aircraft_positions: %w", err)
		}
	}

	return tx.Commit(ctx)
}

// removeStale removes aircraft from Redis that haven't been updated within staleThreshold seconds.
func (p *Poller) removeStale(ctx context.Context) error {
	raw, err := p.rdb.HGetAll(ctx, aircraftLiveKey).Result()
	if err != nil {
		return err
	}

	cutoff := time.Now().Unix() - staleThreshold
	stale := make([]string, 0)

	for id, v := range raw {
		var a models.LiveAircraft
		if err := json.Unmarshal([]byte(v), &a); err != nil {
			continue
		}
		if a.TS < cutoff {
			stale = append(stale, id)
		}
	}

	if len(stale) > 0 {
		if err := p.rdb.HDel(ctx, aircraftLiveKey, stale...).Err(); err != nil {
			return err
		}
		log.Printf(`{"level":"info","service":"poller","msg":"removed stale aircraft","count":%d}`, len(stale))
	}
	return nil
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
