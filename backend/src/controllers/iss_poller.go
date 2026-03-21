package controllers

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/skydot/backend/src/models"
)

const (
	issPositionURL = "http://api.open-notify.org/iss-now.json"
	issCrewURL     = "http://api.open-notify.org/astros.json"
	issAltKM       = 408.0 // approximate ISS orbital altitude
	issPollS       = 5     // seconds between position polls
	crewPollMin    = 60    // minutes between crew polls
)

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

	// Fetch crew once at startup, then every 60 minutes
	crewCount := p.fetchCrew(ctx)

	crewTicker := time.NewTicker(crewPollMin * time.Minute)
	posTicker  := time.NewTicker(issPollS * time.Second)
	defer crewTicker.Stop()
	defer posTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-crewTicker.C:
			crewCount = p.fetchCrew(ctx)
		case <-posTicker.C:
			p.fetchPosition(ctx, crewCount)
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
