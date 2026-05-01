package controllers

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/skydot/backend/src/models"
)

const (
	issPositionURL  = "http://api.open-notify.org/iss-now.json"
	issCrewURL      = "http://api.open-notify.org/astros.json"
	issAltKM        = 408.0  // approximate ISS orbital altitude
	issPollS        = 5      // seconds between position polls
	crewPollMin     = 60     // minutes between crew polls
	streamPollMin   = 30     // minutes between stream discovery polls
	streamRedisKey  = "iss:stream"
	streamRedisTTL  = 35 * time.Minute
)

// YouTube live search: sp=EgJAAQ%3D%3D filters to currently-live streams only
var issSearchQueries = []string{
	"https://www.youtube.com/results?search_query=NASA+ISS+live+stream&sp=EgJAAQ%3D%3D",
	"https://www.youtube.com/results?search_query=ISS+live+earth+view&sp=EgJAAQ%3D%3D",
}

// Matches {"videoId":"XXXXXXXXXXX"} — used on search results pages
var ytVideoIDRe = regexp.MustCompile(`"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"`)

// Keywords that must appear near the video entry to confirm ISS relevance
var issKeywords = []string{"iss", "international space station", "space station", "earth from space", "nasa live"}

type issPositionResp struct {
	ISSPosition struct {
		Latitude  string `json:"latitude"`
		Longitude string `json:"longitude"`
	} `json:"iss_position"`
	Timestamp int64 `json:"timestamp"`
}

type issCrewResp struct {
	People []struct {
		Name  string `json:"name"`
		Craft string `json:"craft"`
	} `json:"people"`
	Number int `json:"number"`
}

// ISSPoller polls Open Notify for live ISS position and crew manifest.
// It writes the ISS into satellite:live so it appears alongside other satellites
// on the globe with no frontend changes needed.
type ISSPoller struct {
	rdb *redis.Client
}

func NewISSPoller(rdb *redis.Client) *ISSPoller {
	return &ISSPoller{rdb: rdb}
}

func (p *ISSPoller) Start(ctx context.Context) {
	log.Println(`{"level":"info","service":"iss_poller","msg":"starting"}`)

	crewCount := p.fetchCrew(ctx)
	p.fetchStream(ctx)

	crewTicker   := time.NewTicker(crewPollMin * time.Minute)
	posTicker    := time.NewTicker(issPollS * time.Second)
	streamTicker := time.NewTicker(streamPollMin * time.Minute)
	defer crewTicker.Stop()
	defer posTicker.Stop()
	defer streamTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-crewTicker.C:
			crewCount = p.fetchCrew(ctx)
		case <-posTicker.C:
			p.fetchPosition(ctx, crewCount)
		case <-streamTicker.C:
			p.fetchStream(ctx)
		}
	}
}

func (p *ISSPoller) fetchPosition(ctx context.Context, crewCount int) {
	reqCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(reqCtx, http.MethodGet, issPositionURL, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf(`{"level":"warn","service":"iss_poller","msg":"position fetch failed","error":%q}`, err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var pos issPositionResp
	if err := json.Unmarshal(body, &pos); err != nil {
		return
	}

	lat := parseFloat(pos.ISSPosition.Latitude)
	lon := parseFloat(pos.ISSPosition.Longitude)

	cs   := "ISS"
	name := "International Space Station"
	alt  := issAltKM

	// Build a LiveAircraft entry for the ISS so it slots into the existing pipeline
	iss := models.LiveAircraft{
		ID:       "ISS",
		Callsign: &cs,
		Name:     &name,
		Lat:      lat,
		Lon:      lon,
		AltKm:    &alt,
		Cat:      "satellite",
		TS:       pos.Timestamp,
		Crew:     crewCount,
	}

	data, _ := json.Marshal(iss)
	if err := p.rdb.HSet(ctx, "satellite:live", "ISS", data).Err(); err != nil {
		log.Printf(`{"level":"error","service":"iss_poller","msg":"redis write failed","error":%q}`, err)
	}

	// Also cache full position in iss:position for REST endpoint
	posJSON, _ := json.Marshal(map[string]interface{}{
		"lat": lat, "lon": lon, "alt_km": issAltKM,
		"timestamp": pos.Timestamp, "crew": crewCount,
	})
	p.rdb.Set(ctx, "iss:position", posJSON, 15*time.Second)
}

func (p *ISSPoller) fetchCrew(ctx context.Context) int {
	reqCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(reqCtx, http.MethodGet, issCrewURL, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf(`{"level":"warn","service":"iss_poller","msg":"crew fetch failed","error":%q}`, err)
		return 0
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var crew issCrewResp
	if err := json.Unmarshal(body, &crew); err != nil {
		return 0
	}

	// Cache in Redis for the /api/v1/launches response
	p.rdb.Set(ctx, "people:space", string(body), crewPollMin*time.Minute)

	log.Printf(`{"level":"info","service":"iss_poller","msg":"crew updated","people":%d}`, crew.Number)
	return crew.Number
}

// fetchStream searches YouTube for currently-live ISS streams.
// The sp=EgJAAQ%3D%3D filter means only live-right-now results appear,
// so every videoId on the page is a confirmed live stream.
func (p *ISSPoller) fetchStream(ctx context.Context) {
	for _, searchURL := range issSearchQueries {
		vid := p.searchLiveStream(ctx, searchURL)
		if vid == "" {
			continue
		}

		data, _ := json.Marshal(map[string]string{
			"video_id":  vid,
			"embed_url": "https://www.youtube.com/embed/" + vid + "?autoplay=1&mute=1&controls=1&modestbranding=1&rel=0",
			"source":    "youtube_search",
		})
		p.rdb.Set(ctx, streamRedisKey, data, streamRedisTTL)
		log.Printf(`{"level":"info","service":"iss_poller","msg":"stream discovered","video_id":%q}`, vid)
		return
	}
	// No live stream found — clear cache so frontend gets fallback
	p.rdb.Del(ctx, streamRedisKey)
	log.Println(`{"level":"warn","service":"iss_poller","msg":"no live ISS stream found"}`)
}

// searchLiveStream fetches a YouTube live-filtered search page and finds
// the first video ID whose surrounding context contains ISS-related keywords.
func (p *ISSPoller) searchLiveStream(ctx context.Context, searchURL string) string {
	reqCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(reqCtx, http.MethodGet, searchURL, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20)) // 2MB cap
	if err != nil {
		return ""
	}
	html := strings.ToLower(string(body))

	// Find all videoId matches and check surrounding context for ISS keywords
	matches := ytVideoIDRe.FindAllStringSubmatchIndex(html, -1)
	for _, loc := range matches {
		// Extract the video ID (group 1)
		vid := html[loc[2]:loc[3]]
		// Convert back to original case by re-reading from original body
		vid = string(body[loc[2]:loc[3]])

		// Check ~500 chars around this match for ISS keywords
		start := loc[0] - 500
		if start < 0 {
			start = 0
		}
		end := loc[1] + 500
		if end > len(html) {
			end = len(html)
		}
		context := html[start:end]

		for _, kw := range issKeywords {
			if strings.Contains(context, kw) {
				return vid
			}
		}
	}

	return ""
}

// GetStream serves the cached live stream URL.
func (p *ISSPoller) GetStream(w http.ResponseWriter, r *http.Request) {
	raw, err := p.rdb.Get(r.Context(), streamRedisKey).Result()
	if err != nil {
		// No stream found — return fallback
		fallback, _ := json.Marshal(map[string]string{
			"video_id":  "",
			"embed_url": "https://video.ibm.com/embed/9408562?autoplay=true&controls=true&showtitle=false",
			"source":    "fallback",
		})
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write(fallback)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(raw))
}
