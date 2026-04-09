package controllers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/skydot/backend/src/utils"
)

// ── Lunar orbiter NAIF/SPK IDs ───────────────────────────────────────────────
// Verified against JPL Horizons (2026-04). Queqiao-2 is intentionally omitted —
// it is not in Horizons (CNSA does not publish ephemerides to JPL).

type lunarTarget struct {
	ID     string // SPK ID, e.g. "-85"
	Name   string
	Agency string
}

var lunarTargets = []lunarTarget{
	{ID: "-85",   Name: "lro",      Agency: "NASA"},
	{ID: "-152", Name: "chandra2", Agency: "ISRO"},
	{ID: "-155", Name: "danuri",   Agency: "KARI"},
	{ID: "-1176", Name: "capstone", Agency: "NASA"},
}

// LunarOrbiterPos is the cached state vector for a single orbiter, in km / km·s.
// Coordinates are Moon-centered ICRF (X, Y, Z = celestial axes).
type LunarOrbiterPos struct {
	ID       string  `json:"id"`
	Agency   string  `json:"agency"`
	X        float64 `json:"x"`        // km, Moon-centered ICRF
	Y        float64 `json:"y"`
	Z        float64 `json:"z"`
	VX       float64 `json:"vx"`       // km/s
	VY       float64 `json:"vy"`
	VZ       float64 `json:"vz"`
	AltKm    float64 `json:"alt_km"`   // |r| − R_moon
	UpdateAt int64   `json:"update_at"` // unix seconds
}

// ── Horizons vector parser (position + velocity) ─────────────────────────────

var lunarVecBlockRE = regexp.MustCompile(`\$\$SOE([\s\S]+?)\$\$EOE`)
var lunarPosRE = regexp.MustCompile(`X\s*=\s*([-\d.E+]+)\s+Y\s*=\s*([-\d.E+]+)\s+Z\s*=\s*([-\d.E+]+)`)
var lunarVelRE = regexp.MustCompile(`VX\s*=\s*([-\d.E+]+)\s+VY\s*=\s*([-\d.E+]+)\s+VZ\s*=\s*([-\d.E+]+)`)

const moonRadiusKM = 1737.4

// fetchLunarVector queries Horizons for one spacecraft's current state vector
// in the Moon-centered ICRF frame. Returns (pos km, vel km/s).
func fetchLunarVector(spkID string) (x, y, z, vx, vy, vz float64, err error) {
	now := time.Now().UTC()
	// Query a 1-minute window around "now" so Horizons returns at least one row.
	// Some sat ephemerides have a few-minute publication lag, so request a window
	// 6h in the past to be safe — orbital position is still recent enough to be
	// useful at < 100 m display accuracy.
	queryT := now.Add(-6 * time.Hour)
	start := queryT.Format("2006-Jan-02 15:04")
	stop := queryT.Add(2 * time.Minute).Format("2006-Jan-02 15:04")

	params := url.Values{}
	params.Set("format", "text")
	params.Set("COMMAND", "'"+spkID+"'")
	params.Set("OBJ_DATA", "NO")
	params.Set("MAKE_EPHEM", "YES")
	params.Set("EPHEM_TYPE", "VECTORS")
	params.Set("CENTER", "500@301") // Moon center
	params.Set("REF_PLANE", "FRAME") // ICRF
	params.Set("START_TIME", "'"+start+"'")
	params.Set("STOP_TIME", "'"+stop+"'")
	params.Set("STEP_SIZE", "1 m")
	params.Set("OUT_UNITS", "KM-S")
	params.Set("VEC_TABLE", "2") // pos + vel
	params.Set("CSV_FORMAT", "NO")

	apiURL := "https://ssd.jpl.nasa.gov/api/horizons.api?" + params.Encode()

	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, 0, 0, 0, 0, 0, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, 0, 0, 0, 0, 0, err
	}

	block := lunarVecBlockRE.FindSubmatch(body)
	if block == nil {
		return 0, 0, 0, 0, 0, 0, fmt.Errorf("horizons: no SOE block for SPK %s", spkID)
	}

	posMatch := lunarPosRE.FindStringSubmatch(string(block[1]))
	velMatch := lunarVelRE.FindStringSubmatch(string(block[1]))
	if posMatch == nil || velMatch == nil {
		return 0, 0, 0, 0, 0, 0, fmt.Errorf("horizons: parse failure for SPK %s", spkID)
	}

	parse := func(s string) float64 {
		v, _ := strconv.ParseFloat(strings.TrimSpace(s), 64)
		return v
	}

	return parse(posMatch[1]), parse(posMatch[2]), parse(posMatch[3]),
		parse(velMatch[1]), parse(velMatch[2]), parse(velMatch[3]), nil
}

// ── LunarPoller ──────────────────────────────────────────────────────────────

// LunarPoller fetches state vectors for active lunar orbiters from JPL Horizons
// every 5 minutes and stores them in Redis. The frontend MoonScene reads these
// to render the satellites at real positions.
type LunarPoller struct {
	rdb *redis.Client
}

func NewLunarPoller(rdb *redis.Client) *LunarPoller {
	return &LunarPoller{rdb: rdb}
}

func (p *LunarPoller) Start(ctx context.Context) {
	log.Println(`{"level":"info","service":"lunar_poller","msg":"starting"}`)
	p.poll(ctx)

	ticker := time.NewTicker(5 * time.Minute)
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

func (p *LunarPoller) poll(ctx context.Context) {
	pipe := p.rdb.Pipeline()
	successCount := 0

	for _, t := range lunarTargets {
		x, y, z, vx, vy, vz, err := fetchLunarVector(t.ID)
		if err != nil {
			log.Printf(`{"level":"warn","service":"lunar_poller","msg":"horizons fetch failed","id":%q,"error":%q}`, t.Name, err)
			continue
		}

		r := math.Sqrt(x*x + y*y + z*z)
		alt := r - moonRadiusKM

		pos := LunarOrbiterPos{
			ID:       t.Name,
			Agency:   t.Agency,
			X:        x, Y: y, Z: z,
			VX: vx, VY: vy, VZ: vz,
			AltKm:    alt,
			UpdateAt: time.Now().Unix(),
		}

		data, _ := json.Marshal(pos)
		pipe.HSet(ctx, "lunar:orbiters", t.Name, data)
		successCount++
	}

	if successCount > 0 {
		if _, err := pipe.Exec(ctx); err != nil {
			log.Printf(`{"level":"error","service":"lunar_poller","msg":"redis write failed","error":%q}`, err)
			return
		}
	}
	log.Printf(`{"level":"info","service":"lunar_poller","msg":"orbiters updated","count":%d}`, successCount)
}

// ── LunarController — HTTP handler ───────────────────────────────────────────

// LunarController serves the cached lunar orbiter positions.
type LunarController struct {
	rdb *redis.Client
}

func NewLunarController(rdb *redis.Client) *LunarController {
	return &LunarController{rdb: rdb}
}

// GetOrbiters returns all known lunar orbiter state vectors keyed by id.
// GET /api/v1/lunar/orbiters
func (c *LunarController) GetOrbiters(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	raw, err := c.rdb.HGetAll(ctx, "lunar:orbiters").Result()
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "failed to fetch lunar orbiters")
		return
	}

	orbiters := make(map[string]LunarOrbiterPos, len(raw))
	for k, v := range raw {
		var p LunarOrbiterPos
		if err := json.Unmarshal([]byte(v), &p); err == nil {
			orbiters[k] = p
		}
	}

	utils.JSON(w, http.StatusOK, map[string]interface{}{
		"orbiters": orbiters,
		"count":    len(orbiters),
		"source":   "JPL Horizons",
	})
}
