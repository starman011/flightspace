package controllers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	satellite "github.com/joshuaferrara/go-satellite"
	"github.com/redis/go-redis/v9"
)

const (
	satPollInterval = 30 * time.Second
	satLiveKey      = "satellite:live"
	satStaleSeconds = 180
	tleAPIBase      = "https://tle.ivanstanojevic.me/api/tle/"
)

// Groups to fetch from tle.ivanstanojevic.me with a search query and max count.
var tleGroups = []struct {
	search string
	limit  int
}{
	{"ISS", 10},
	{"STARLINK", 200},
	{"GPS", 32},
	{"IRIDIUM", 66},
	{"WEATHER", 30},
	{"GOES", 10},
}

// SatelliteRecord uses the same JSON field names as models.LiveAircraft
// so it can be unmarshalled directly by the WS hub.
type SatelliteRecord struct {
	ID    string  `json:"id"`
	Name  string  `json:"name"`
	Lat   float64 `json:"lat"`
	Lon   float64 `json:"lon"`
	AltKm float64 `json:"alt_km"`
	Cat   string  `json:"cat"` // always "satellite"
	Grnd  bool    `json:"grnd"`
	TS    int64   `json:"ts"`
}

// issPosition is the response shape from wheretheiss.at
type issPosition struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Altitude  float64 `json:"altitude"`
}

// tleAPIResponse is the response from tle.ivanstanojevic.me
type tleAPIResponse struct {
	Members []tleAPIMember `json:"member"`
}

type tleAPIMember struct {
	SatelliteID int    `json:"satelliteId"`
	Name        string `json:"name"`
	Line1       string `json:"line1"`
	Line2       string `json:"line2"`
}

// SatellitePoller fetches TLE data and computes real-time satellite positions.
type SatellitePoller struct {
	rdb    *redis.Client
	client *http.Client
}

func NewSatellitePoller(rdb *redis.Client) *SatellitePoller {
	return &SatellitePoller{
		rdb:    rdb,
		client: &http.Client{Timeout: 15 * time.Second},
	}
}

// Start runs the satellite polling loop. Call in a goroutine.
func (sp *SatellitePoller) Start(ctx context.Context) {
	// Seed ISS position immediately from wheretheiss.at (no TLE needed).
	sp.seedISS(ctx)

	// Fetch TLE data in parallel — fills in the rest within ~15s.
	tleData := sp.fetchAllTLE(ctx)

	tleTicker := time.NewTicker(1 * time.Hour)
	posTicker := time.NewTicker(satPollInterval)
	defer tleTicker.Stop()
	defer posTicker.Stop()

	sp.updatePositions(ctx, tleData)

	for {
		select {
		case <-ctx.Done():
			return
		case <-tleTicker.C:
			tleData = sp.fetchAllTLE(ctx)
		case <-posTicker.C:
			sp.seedISS(ctx) // keep ISS fresh via direct API
			sp.updatePositions(ctx, tleData)
		}
	}
}

// seedISS immediately fetches ISS position from wheretheiss.at — appears within seconds.
func (sp *SatellitePoller) seedISS(ctx context.Context) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.wheretheiss.at/v1/satellites/25544", nil)
	if err != nil {
		return
	}
	req.Header.Set("User-Agent", "SkyDot/1.0 satellite-tracker")
	resp, err := sp.client.Do(req)
	if err != nil {
		log.Printf(`{"level":"warn","service":"sat_poller","msg":"ISS seed failed","error":%q}`, err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return
	}
	var pos issPosition
	if err := json.NewDecoder(resp.Body).Decode(&pos); err != nil {
		return
	}
	rec := SatelliteRecord{
		ID:    "sat_iss_(zarya)",
		Name:  "ISS (ZARYA)",
		Lat:   pos.Latitude,
		Lon:   pos.Longitude,
		AltKm: pos.Altitude,
		Cat:   "satellite",
		TS:    time.Now().Unix(),
	}
	b, _ := json.Marshal(rec)
	if err := sp.rdb.HSet(ctx, satLiveKey, rec.ID, string(b)).Err(); err != nil {
		log.Printf(`{"level":"warn","service":"sat_poller","msg":"ISS redis write failed","error":%q}`, err)
		return
	}
	log.Printf(`{"level":"info","service":"sat_poller","msg":"ISS seeded","lat":%f,"lon":%f,"alt_km":%f}`, pos.Latitude, pos.Longitude, pos.Altitude)
}

type tleEntry struct {
	name  string
	line1 string
	line2 string
}

// fetchAllTLE fetches all TLE groups concurrently from tle.ivanstanojevic.me.
func (sp *SatellitePoller) fetchAllTLE(ctx context.Context) []tleEntry {
	type result struct {
		entries []tleEntry
		search  string
		err     error
	}
	ch := make(chan result, len(tleGroups))
	var wg sync.WaitGroup

	for _, g := range tleGroups {
		wg.Add(1)
		go func(search string, limit int) {
			defer wg.Done()
			entries, err := sp.fetchTLEGroup(ctx, search, limit)
			ch <- result{entries: entries, search: search, err: err}
		}(g.search, g.limit)
	}

	go func() { wg.Wait(); close(ch) }()

	var all []tleEntry
	for r := range ch {
		if r.err != nil {
			log.Printf(`{"level":"warn","service":"sat_poller","msg":"TLE fetch failed","search":%q,"error":%q}`, r.search, r.err)
			continue
		}
		all = append(all, r.entries...)
	}
	log.Printf(`{"level":"info","service":"sat_poller","msg":"TLE loaded","count":%d}`, len(all))
	return all
}

// fetchTLEGroup fetches TLE data from tle.ivanstanojevic.me for a search term.
func (sp *SatellitePoller) fetchTLEGroup(ctx context.Context, search string, limit int) ([]tleEntry, error) {
	pageSize := limit
	if pageSize > 100 {
		pageSize = 100
	}
	u := fmt.Sprintf("%s?search=%s&sort=popularity&sort-dir=asc&page-size=%d",
		tleAPIBase, url.QueryEscape(search), pageSize)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "SkyDot/1.0 satellite-tracker")

	resp, err := sp.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}

	var api tleAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&api); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}

	entries := make([]tleEntry, 0, len(api.Members))
	for _, m := range api.Members {
		if len(m.Line1) < 69 || m.Line1[0] != '1' || len(m.Line2) < 69 || m.Line2[0] != '2' {
			continue
		}
		entries = append(entries, tleEntry{
			name:  strings.TrimSpace(m.Name),
			line1: strings.TrimSpace(m.Line1),
			line2: strings.TrimSpace(m.Line2),
		})
	}
	return entries, nil
}

func (sp *SatellitePoller) updatePositions(ctx context.Context, entries []tleEntry) {
	if len(entries) == 0 {
		return
	}
	now := time.Now().UTC()
	y, mo, d := now.Year(), int(now.Month()), now.Day()
	h, mi, s := now.Hour(), now.Minute(), now.Second()

	jday := satellite.JDay(y, mo, d, h, mi, s)
	gmst := satellite.ThetaG_JD(jday)

	pipe := sp.rdb.Pipeline()
	ts := now.Unix()
	count := 0

	for _, e := range entries {
		sat := satellite.TLEToSat(e.line1, e.line2, satellite.GravityWGS84)
		if sat.Error != 0 {
			continue
		}

		pos, _ := satellite.Propagate(sat, y, mo, d, h, mi, s)
		if math.IsNaN(pos.X) || math.IsNaN(pos.Y) || math.IsNaN(pos.Z) {
			continue
		}

		altKm, _, llRad := satellite.ECIToLLA(pos, gmst)
		llDeg := satellite.LatLongDeg(llRad)

		lon := llDeg.Longitude
		for lon > 180 {
			lon -= 360
		}
		for lon < -180 {
			lon += 360
		}

		id := "sat_" + strings.ToLower(strings.ReplaceAll(strings.TrimSpace(e.name), " ", "_"))

		rec := SatelliteRecord{
			ID:    id,
			Name:  strings.TrimSpace(e.name),
			Lat:   llDeg.Latitude,
			Lon:   lon,
			AltKm: altKm,
			Cat:   "satellite",
			TS:    ts,
		}
		b, err := json.Marshal(rec)
		if err != nil {
			continue
		}
		pipe.HSet(ctx, satLiveKey, id, string(b))
		count++
	}

	if _, err := pipe.Exec(ctx); err != nil {
		log.Printf(`{"level":"error","service":"sat_poller","msg":"redis write failed","error":%q}`, err)
		return
	}
	sp.pruneStale(ctx)
	log.Printf(`{"level":"info","service":"sat_poller","msg":"positions updated","count":%d}`, count)
}

func (sp *SatellitePoller) pruneStale(ctx context.Context) {
	raw, err := sp.rdb.HGetAll(ctx, satLiveKey).Result()
	if err != nil {
		return
	}
	cutoff := time.Now().Unix() - satStaleSeconds
	stale := []string{}
	for id, v := range raw {
		var r SatelliteRecord
		if err := json.Unmarshal([]byte(v), &r); err != nil {
			continue
		}
		if r.TS < cutoff {
			stale = append(stale, id)
		}
	}
	if len(stale) > 0 {
		sp.rdb.HDel(ctx, satLiveKey, stale...)
	}
}
