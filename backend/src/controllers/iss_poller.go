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
	// The ISS moves ~7.66 km/s, so a 30s fix is ~230 km of ground track — still
	// far finer than the globe can show, and the client interpolates between
	// fixes anyway. At 5s this was 17,280 upstream calls a day for detail
	// nothing consumed.
	issPollS        = 30     // seconds between position polls
	crewPollMin     = 60     // minutes between crew polls
	streamPollMin   = 30     // minutes between stream discovery polls
	streamRedisKey  = "iss:stream"
	streamRedisTTL  = 35 * time.Minute
)

// NASA YouTube channel IDs for RSS-based discovery (no HTML scraping)
var nasaChannelIDs = []string{
	"UCLA_DiR1FfKNvjuUpBHmylQ", // NASA TV
	"UCmheDgBlvAMKEkNz7TQpFoA", // NASA Johnson Space Center
}

// ytRSSVideoIDRe extracts <yt:videoId> from YouTube RSS XML
var ytRSSVideoIDRe = regexp.MustCompile(`<yt:videoId>([a-zA-Z0-9_-]{11})</yt:videoId>`)

// ytRSSTitleRe extracts <title> tags from YouTube RSS XML (for keyword filtering)
var ytRSSTitleRe = regexp.MustCompile(`<title>([^<]+)</title>`)

// issKeywords for title-based relevance check
var issKeywords = []string{"iss", "space station", "earth from space", "nasa live", "nasa tv"}

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

// fetchStream discovers live NASA streams via YouTube RSS feeds.
// RSS is lightweight XML — no JavaScript needed, no bot detection.
func (p *ISSPoller) fetchStream(ctx context.Context) {
	for _, channelID := range nasaChannelIDs {
		vids := p.videosFromRSS(ctx, channelID)
		for _, vid := range vids {
			if p.isVideoLive(ctx, vid) {
				p.cacheStream(ctx, vid, "rss")
				return
			}
		}
	}
	// No live stream found — clear cache so frontend shows watch link
	p.rdb.Del(ctx, streamRedisKey)
	log.Println(`{"level":"warn","service":"iss_poller","msg":"no live stream found via RSS"}`)
}

// videosFromRSS fetches the YouTube RSS feed for a channel and returns recent video IDs.
func (p *ISSPoller) videosFromRSS(ctx context.Context, channelID string) []string {
	url := "https://www.youtube.com/feeds/videos.xml?channel_id=" + channelID
	reqCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(reqCtx, http.MethodGet, url, nil)
	req.Header.Set("User-Agent", "ObjectTracer/1.0 satellite-tracker")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf(`{"level":"warn","service":"iss_poller","msg":"RSS fetch failed","channel":%q,"error":%q}`, channelID, err)
		return nil
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 512*1024))
	xml := string(body)

	idMatches    := ytRSSVideoIDRe.FindAllStringSubmatch(xml, -1)
	titleMatches := ytRSSTitleRe.FindAllStringSubmatch(xml, -1)

	var ids []string
	for i, m := range idMatches {
		vid := m[1]
		// Use title for keyword relevance (skip channel title at index 0)
		title := ""
		if i+1 < len(titleMatches) {
			title = strings.ToLower(titleMatches[i+1][1])
		}
		// Prefer ISS/NASA-related titles but include all (NASA TV is always relevant)
		relevant := true
		if len(issKeywords) > 0 && title != "" {
			relevant = false
			for _, kw := range issKeywords {
				if strings.Contains(title, kw) {
					relevant = true
					break
				}
			}
		}
		if relevant {
			ids = append(ids, vid)
		}
	}
	return ids
}

func (p *ISSPoller) cacheStream(ctx context.Context, vid, source string) {
	data, _ := json.Marshal(map[string]string{
		"video_id":  vid,
		"embed_url": "https://www.youtube.com/embed/" + vid + "?autoplay=1&mute=1&controls=1&modestbranding=1&rel=0",
		"source":    source,
	})
	p.rdb.Set(ctx, streamRedisKey, data, streamRedisTTL)
	log.Printf(`{"level":"info","service":"iss_poller","msg":"stream cached","video_id":%q,"source":%q}`, vid, source)
}

// isVideoLive fetches the YouTube watch page and confirms the video is currently live.
// This prevents stale/ended stream IDs from being cached.
func (p *ISSPoller) isVideoLive(ctx context.Context, videoID string) bool {
	reqCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(reqCtx, http.MethodGet, "https://www.youtube.com/watch?v="+videoID, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 1MB cap
	lower := strings.ToLower(string(body))

	// YouTube sets these in ytInitialData / ytInitialPlayerResponse when live
	live := (strings.Contains(lower, `"islive":true`) ||
		strings.Contains(lower, `"islivenow":true`) ||
		strings.Contains(lower, `"livebadgerenderer"`)) &&
		!strings.Contains(lower, `"live_stream_offline"`) &&
		!strings.Contains(lower, `"playabilityStatus":{"status":"live_stream_not_live"`)

	log.Printf(`{"level":"debug","service":"iss_poller","msg":"liveness check","video_id":%q,"live":%v}`, videoID, live)
	return live
}



// GetStream serves the cached live stream URL.
func (p *ISSPoller) GetStream(w http.ResponseWriter, r *http.Request) {
	raw, err := p.rdb.Get(r.Context(), streamRedisKey).Result()
	if err != nil {
		// RSS found nothing — fall back to NASA TV's persistent live stream video
		const nasaTVFallback = "21X5lGlDOfg"
		fallback, _ := json.Marshal(map[string]string{
			"video_id":  nasaTVFallback,
			"embed_url": "https://www.youtube.com/embed/" + nasaTVFallback + "?autoplay=1&mute=1&controls=1&modestbranding=1&rel=0",
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
