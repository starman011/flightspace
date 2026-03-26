package controllers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/skydot/backend/src/models"
)

// NEO close-approach alert threshold — 7.5 million km (roughly 20× lunar distance)
const neoAlertThresholdKM = 7_500_000.0

// ── NeoWs API response structures ────────────────────────────────────────────

type neoFeedResponse struct {
	NearEarthObjects map[string][]neoObject `json:"near_earth_objects"`
}

type neoObject struct {
	ID                          string              `json:"id"`
	Name                        string              `json:"name"`
	IsPotentiallyHazardous      bool                `json:"is_potentially_hazardous_asteroid"`
	EstimatedDiameter           neoEstimatedDiameter `json:"estimated_diameter"`
	CloseApproachData           []neoCloseApproach  `json:"close_approach_data"`
	OrbitalData                 *neoOrbitalData     `json:"orbital_data,omitempty"`
}

type neoEstimatedDiameter struct {
	Kilometers neoDiameterRange `json:"kilometers"`
}

type neoDiameterRange struct {
	Min float64 `json:"estimated_diameter_min"`
	Max float64 `json:"estimated_diameter_max"`
}

type neoCloseApproach struct {
	CloseApproachDateFull string         `json:"close_approach_date_full"`
	RelativeVelocity      neoVelocity    `json:"relative_velocity"`
	MissDistance          neoMissDistance `json:"miss_distance"`
	OrbitingBody          string         `json:"orbiting_body"`
}

type neoVelocity struct {
	KilometersPerSecond string `json:"kilometers_per_second"`
}

type neoMissDistance struct {
	Kilometers    string `json:"kilometers"`
	LunarDistance string `json:"lunar"`
}

type neoOrbitalData struct {
	SemiMajorAxis       string `json:"semi_major_axis"`
	Eccentricity        string `json:"eccentricity"`
	Inclination         string `json:"inclination"`
	AscendingNodeLon    string `json:"ascending_node_longitude"`
	ArgOfPerihelion     string `json:"argument_of_perihelion"`
}

// ── Stored asteroid model ─────────────────────────────────────────────────────

// AsteroidLive is what gets stored in Redis and sent to the frontend.
type AsteroidLive struct {
	ID                     string  `json:"id"`
	Name                   string  `json:"name"`
	Cat                    string  `json:"cat"` // always "asteroid"
	IsPotentiallyHazardous bool    `json:"pha"`
	DiameterMinKM          float64 `json:"diam_min"`
	DiameterMaxKM          float64 `json:"diam_max"`
	ApproachDate           string  `json:"approach_date"`
	MissDistanceKM         float64 `json:"miss_km"`
	LunarDistance          float64 `json:"miss_ld"`
	VelocityKPS            float64 `json:"vel_kps"`
	// Orbital elements (for rendering orbit path client-side)
	SemiMajorAxisAU    float64 `json:"a,omitempty"`
	Eccentricity       float64 `json:"e,omitempty"`
	InclinationDeg     float64 `json:"i,omitempty"`
	RAANDeg            float64 `json:"om,omitempty"`
	ArgPerihelionDeg   float64 `json:"w,omitempty"`
}

// ── NEOPoller ─────────────────────────────────────────────────────────────────

type NEOPoller struct {
	rdb    *redis.Client
	hub    *Hub
	apiKey string
}

func NewNEOPoller(rdb *redis.Client, hub *Hub, apiKey string) *NEOPoller {
	return &NEOPoller{rdb: rdb, hub: hub, apiKey: apiKey}
}

func (p *NEOPoller) Start(ctx context.Context) {
	log.Println(`{"level":"info","service":"neo_poller","msg":"starting"}`)
	p.poll(ctx)

	ticker := time.NewTicker(1 * time.Hour)
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

func (p *NEOPoller) poll(ctx context.Context) {
	today := time.Now().UTC().Format("2006-01-02")
	endDate := time.Now().UTC().AddDate(0, 0, 7).Format("2006-01-02")

	apiURL := fmt.Sprintf(
		"https://api.nasa.gov/neo/rest/v1/feed?start_date=%s&end_date=%s&api_key=%s",
		today, endDate, p.apiKey,
	)

	reqCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(reqCtx, http.MethodGet, apiURL, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf(`{"level":"error","service":"neo_poller","msg":"fetch failed","error":%q}`, err)
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf(`{"level":"error","service":"neo_poller","msg":"read failed","error":%q}`, err)
		return
	}

	var feed neoFeedResponse
	if err := json.Unmarshal(body, &feed); err != nil {
		log.Printf(`{"level":"error","service":"neo_poller","msg":"parse failed","error":%q}`, err)
		return
	}

	pipe := p.rdb.Pipeline()
	count := 0
	var alerts []AsteroidLive

	for _, dayObjects := range feed.NearEarthObjects {
		for _, obj := range dayObjects {
			if len(obj.CloseApproachData) == 0 {
				continue
			}
			ca := obj.CloseApproachData[0]

			// Only track Earth approaches
			if ca.OrbitingBody != "Earth" {
				continue
			}

			missKM := parseFloat(ca.MissDistance.Kilometers)
			missLD := parseFloat(ca.MissDistance.LunarDistance)
			velKPS := parseFloat(ca.RelativeVelocity.KilometersPerSecond)

			ast := AsteroidLive{
				ID:                     obj.ID,
				Name:                   obj.Name,
				Cat:                    "asteroid",
				IsPotentiallyHazardous: obj.IsPotentiallyHazardous,
				DiameterMinKM:          obj.EstimatedDiameter.Kilometers.Min,
				DiameterMaxKM:          obj.EstimatedDiameter.Kilometers.Max,
				ApproachDate:           ca.CloseApproachDateFull,
				MissDistanceKM:         missKM,
				LunarDistance:          missLD,
				VelocityKPS:            velKPS,
			}

			if od := obj.OrbitalData; od != nil {
				ast.SemiMajorAxisAU  = parseFloat(od.SemiMajorAxis)
				ast.Eccentricity     = parseFloat(od.Eccentricity)
				ast.InclinationDeg   = parseFloat(od.Inclination)
				ast.RAANDeg          = parseFloat(od.AscendingNodeLon)
				ast.ArgPerihelionDeg = parseFloat(od.ArgOfPerihelion)
			}

			data, _ := json.Marshal(ast)
			pipe.HSet(ctx, "asteroid:live", obj.ID, data)

			// Separate close-approach bucket for quick lookup
			caData, _ := json.Marshal(ca)
			pipe.HSet(ctx, "asteroid:approach", obj.ID, caData)

			if missKM < neoAlertThresholdKM {
				alerts = append(alerts, ast)
			}
			count++
		}
	}

	if _, err := pipe.Exec(ctx); err != nil {
		log.Printf(`{"level":"error","service":"neo_poller","msg":"redis write failed","error":%q}`, err)
	}

	// Broadcast NEO alerts
	for _, ast := range alerts {
		p.hub.BroadcastNEOAlert(ast)
	}

	log.Printf(`{"level":"info","service":"neo_poller","msg":"asteroids updated","count":%d,"alerts":%d}`,
		count, len(alerts))
}

func parseFloat(s string) float64 {
	v, _ := strconv.ParseFloat(s, 64)
	return v
}

// ── Hub extension: BroadcastNEOAlert ─────────────────────────────────────────

func (h *Hub) BroadcastNEOAlert(ast AsteroidLive) {
	msg := models.NewWSMessage("neo_alert", ast)
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	h.mu.RLock()
	clients := make([]*Client, 0, len(h.clients))
	for c := range h.clients {
		clients = append(clients, c)
	}
	h.mu.RUnlock()
	for _, c := range clients {
		select {
		case c.send <- data:
		default:
		}
	}
}
