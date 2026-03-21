package controllers

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	ll2UpcomingPath = "/launch/upcoming/?limit=20&format=json"
	ll2PreviousPath = "/launch/previous/?limit=5&format=json"
	launchCacheTTL  = 15 * time.Minute
)

// ── LL2 API response structures ───────────────────────────────────────────────

type ll2Response struct {
	Results []ll2Launch `json:"results"`
}

type ll2Launch struct {
	ID       string      `json:"id"`
	Name     string      `json:"name"`
	NET      string      `json:"net"`        // No Earlier Than — ISO 8601
	Status   ll2Status   `json:"status"`
	Rocket   ll2Rocket   `json:"rocket"`
	Provider ll2Provider `json:"launch_service_provider"`
	Mission  *ll2Mission `json:"mission"`
	Pad      ll2Pad      `json:"pad"`
}

type ll2Status struct {
	Name string `json:"name"`
	Abbr string `json:"abbrev"`
}

type ll2Rocket struct {
	Config ll2RocketConfig `json:"configuration"`
}

type ll2RocketConfig struct {
	Name string `json:"name"`
}

type ll2Provider struct {
	Name string `json:"name"`
}

type ll2Mission struct {
	Name        string     `json:"name"`
	Description string     `json:"description"`
	Orbit       *ll2Orbit  `json:"orbit"`
}

type ll2Orbit struct {
	Name string `json:"name"`
}

type ll2Pad struct {
	Name     string      `json:"name"`
	Location ll2Location `json:"location"`
}

type ll2Location struct {
	Name      string  `json:"name"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

// StoredLaunch is the shape we store in Redis and return from the REST endpoint.
type StoredLaunch struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	NET          string  `json:"net"`             // ISO 8601
	Status       string  `json:"status"`          // e.g. "Go for Launch"
	StatusAbbr   string  `json:"status_abbr"`     // e.g. "Go"
	RocketName   string  `json:"rocket"`
	Provider     string  `json:"provider"`
	MissionName  string  `json:"mission_name,omitempty"`
	MissionDesc  string  `json:"mission_desc,omitempty"`
	OrbitName    string  `json:"orbit,omitempty"`
	PadName      string  `json:"pad"`
	PadLat       float64 `json:"pad_lat"`
	PadLon       float64 `json:"pad_lon"`
	IsPast       bool    `json:"is_past"`
}

// LaunchListResponse is returned by GET /api/v1/launches
type LaunchListResponse struct {
	Upcoming []StoredLaunch `json:"upcoming"`
	Recent   []StoredLaunch `json:"recent"`
	People   interface{}    `json:"people_in_space,omitempty"`
}

// ── LaunchPoller ─────────────────────────────────────────────────────────────

type LaunchPoller struct {
	rdb     *redis.Client
	baseURL string
}

func NewLaunchPoller(rdb *redis.Client, baseURL string) *LaunchPoller {
	return &LaunchPoller{rdb: rdb, baseURL: baseURL}
}

func (p *LaunchPoller) Start(ctx context.Context) {
	log.Println(`{"level":"info","service":"launch_poller","msg":"starting"}`)
	p.poll(ctx)

	// 15-minute interval respects LL2 free-tier rate limit (15 req/hr)
	ticker := time.NewTicker(launchCacheTTL)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.poll(ctx)
		}
	}
}

func (p *LaunchPoller) poll(ctx context.Context) {
	upcoming := p.fetchLaunches(ctx, p.baseURL+ll2UpcomingPath, false)
	recent   := p.fetchLaunches(ctx, p.baseURL+ll2PreviousPath, true)

	payload := map[string]interface{}{
		"upcoming": upcoming,
		"recent":   recent,
	}
	data, _ := json.Marshal(payload)
	if err := p.rdb.Set(ctx, "launch:upcoming", data, launchCacheTTL+5*time.Minute).Err(); err != nil {
		log.Printf(`{"level":"error","service":"launch_poller","msg":"redis write failed","error":%q}`, err)
		return
	}
	log.Printf(`{"level":"info","service":"launch_poller","msg":"launches updated","upcoming":%d,"recent":%d}`,
		len(upcoming), len(recent))
}

func (p *LaunchPoller) fetchLaunches(ctx context.Context, url string, isPast bool) []StoredLaunch {
	reqCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(reqCtx, http.MethodGet, url, nil)
	req.Header.Set("User-Agent", "SkyDot/1.0 (space observatory; contact@skydot.app)")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf(`{"level":"warn","service":"launch_poller","msg":"fetch failed","url":%q,"error":%q}`, url, err)
		return nil
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var ll2 ll2Response
	if err := json.Unmarshal(body, &ll2); err != nil {
		log.Printf(`{"level":"warn","service":"launch_poller","msg":"parse failed","error":%q}`, err)
		return nil
	}

	out := make([]StoredLaunch, 0, len(ll2.Results))
	for _, l := range ll2.Results {
		sl := StoredLaunch{
			ID:         l.ID,
			Name:       l.Name,
			NET:        l.NET,
			Status:     l.Status.Name,
			StatusAbbr: l.Status.Abbr,
			RocketName: l.Rocket.Config.Name,
			Provider:   l.Provider.Name,
			PadName:    l.Pad.Name + " — " + l.Pad.Location.Name,
			PadLat:     l.Pad.Location.Latitude,
			PadLon:     l.Pad.Location.Longitude,
			IsPast:     isPast,
		}
		if l.Mission != nil {
			sl.MissionName = l.Mission.Name
			sl.MissionDesc = l.Mission.Description
			if l.Mission.Orbit != nil {
				sl.OrbitName = l.Mission.Orbit.Name
			}
		}
		out = append(out, sl)
	}
	return out
}

// ── LaunchController ─────────────────────────────────────────────────────────

type LaunchController struct {
	rdb *redis.Client
}

func NewLaunchController(rdb *redis.Client) *LaunchController {
	return &LaunchController{rdb: rdb}
}

// GetLaunches serves GET /api/v1/launches — reads from Redis cache.
func (c *LaunchController) GetLaunches(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	cached, err := c.rdb.Get(ctx, "launch:upcoming").Bytes()
	if err != nil {
		http.Error(w, `{"error":"launches not yet available"}`, http.StatusServiceUnavailable)
		return
	}

	// Optionally enrich with people-in-space
	people, _ := c.rdb.Get(ctx, "people:space").Bytes()

	// Re-marshal to include people field
	var base map[string]json.RawMessage
	if err := json.Unmarshal(cached, &base); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.Write(cached)
		return
	}
	if people != nil {
		base["people_in_space"] = people
	}

	out, _ := json.Marshal(base)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=900") // 15 min
	w.Write(out)
}
