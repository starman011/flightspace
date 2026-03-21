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
	"github.com/skydot/backend/src/models"
)

// ── Horizons NAIF IDs ────────────────────────────────────────────────────────

var planetNAIF = map[string]string{
	"mercury": "199",
	"venus":   "299",
	"earth":   "399",
	"mars":    "499",
	"jupiter": "599",
	"saturn":  "699",
	"uranus":  "799",
	"neptune": "899",
}

var planetRadiusKM = map[string]float64{
	"mercury": 2439.7,
	"venus":   6051.8,
	"earth":   6371.0,
	"mars":    3389.5,
	"jupiter": 69911.0,
	"saturn":  58232.0,
	"uranus":  25362.0,
	"neptune": 24622.0,
}

// planetOrder defines broadcast order (inner → outer)
var planetOrder = []string{
	"mercury", "venus", "earth", "mars",
	"jupiter", "saturn", "uranus", "neptune",
}

// ── Keplerian fallback ────────────────────────────────────────────────────────
// J2000 mean elements — same coefficients as the frontend solarSystem.js fallback.

type kepElem struct {
	a, e, L0, dL float64 // a in AU, e dimensionless, L0/dL in degrees/century
}

var keplerianElements = map[string]kepElem{
	"mercury": {0.38709927, 0.20563593, 252.25032350, 149472.67411175},
	"venus":   {0.72333566, 0.00677672, 181.97909950, 58517.81538729},
	"earth":   {1.00000261, 0.01671123, 100.46457166, 35999.37244981},
	"mars":    {1.52371034, 0.09339410, -4.55343205, 19140.30268499},
	"jupiter": {5.20288700, 0.04838624, 34.39644051, 3034.74612775},
	"saturn":  {9.53667594, 0.05386179, 49.95424423, 1222.49362201},
	"uranus":  {19.1891646, 0.04725744, 313.23810451, 428.48202785},
	"neptune": {30.0699701, 0.00859048, -55.12002969, 218.45945325},
}

func jCenturies() float64 {
	j2000 := time.Date(2000, 1, 1, 12, 0, 0, 0, time.UTC)
	return time.Since(j2000).Hours() / (24 * 36525)
}

func eccentricAnomaly(M, e float64) float64 {
	E := M
	for i := 0; i < 10; i++ {
		E = E - (E-e*math.Sin(E)-M)/(1-e*math.Cos(E))
	}
	return E
}

func keplerianXYZ(name string) (x, y, z float64) {
	k, ok := keplerianElements[name]
	if !ok {
		return 0, 0, 0
	}
	T := jCenturies()
	L := math.Mod(k.L0+k.dL*T, 360) * math.Pi / 180
	E := eccentricAnomaly(L, k.e)
	nu := 2 * math.Atan2(
		math.Sqrt(1+k.e)*math.Sin(E/2),
		math.Sqrt(1-k.e)*math.Cos(E/2),
	)
	r := k.a * (1 - k.e*math.Cos(E))
	return r * math.Cos(nu), 0, r * math.Sin(nu)
}

// ── Horizons API fetch ────────────────────────────────────────────────────────

var horizonsVecRE = regexp.MustCompile(`\$\$SOE\s+([\s\S]+?)\s+\$\$EOE`)
var xyzRE = regexp.MustCompile(`X\s*=\s*([-\d.E+]+)\s+Y\s*=\s*([-\d.E+]+)\s+Z\s*=\s*([-\d.E+]+)`)

func fetchHorizons(naifID string) (x, y, z float64, err error) {
	now := time.Now().UTC()
	start := now.Format("2006-Jan-02")
	stop := now.Add(24 * time.Hour).Format("2006-Jan-02")

	params := url.Values{}
	params.Set("format", "text")
	params.Set("COMMAND", "'"+naifID+"'")
	params.Set("OBJ_DATA", "NO")
	params.Set("MAKE_EPHEM", "YES")
	params.Set("EPHEM_TYPE", "VECTORS")
	params.Set("CENTER", "500@10") // heliocentric
	params.Set("START_TIME", start)
	params.Set("STOP_TIME", stop)
	params.Set("STEP_SIZE", "1d")
	params.Set("VEC_TABLE", "1")   // X Y Z only
	params.Set("CSV_FORMAT", "NO")

	apiURL := "https://ssd.jpl.nasa.gov/api/horizons.api?" + params.Encode()

	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, 0, 0, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, 0, 0, err
	}

	// Extract $$SOE ... $$EOE block
	match := horizonsVecRE.FindSubmatch(body)
	if match == nil {
		return 0, 0, 0, fmt.Errorf("horizons: no SOE block for NAIF %s", naifID)
	}

	// Parse X Y Z line
	xyz := xyzRE.FindStringSubmatch(string(match[1]))
	if xyz == nil {
		return 0, 0, 0, fmt.Errorf("horizons: no XYZ line for NAIF %s", naifID)
	}

	// Values are in AU
	parse := func(s string) float64 {
		v, _ := strconv.ParseFloat(strings.TrimSpace(s), 64)
		return v
	}
	return parse(xyz[1]), parse(xyz[2]), parse(xyz[3]), nil
}

// ── SolarPoller ───────────────────────────────────────────────────────────────

// SolarPoller fetches heliocentric planet positions from NASA Horizons every
// PlanetPollIntervalS seconds and broadcasts a solar_system WS message.
type SolarPoller struct {
	rdb *redis.Client
	hub *Hub
}

func NewSolarPoller(rdb *redis.Client, hub *Hub) *SolarPoller {
	return &SolarPoller{rdb: rdb, hub: hub}
}

func (p *SolarPoller) Start(ctx context.Context) {
	log.Println(`{"level":"info","service":"solar_poller","msg":"starting"}`)

	// Fetch immediately on startup, then on interval
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

func (p *SolarPoller) poll(ctx context.Context) {
	positions := make([]models.PlanetPosition, 0, len(planetOrder))

	for _, name := range planetOrder {
		naif := planetNAIF[name]
		x, y, z, err := fetchHorizons(naif)
		if err != nil {
			// Horizons unavailable — fall back to local Keplerian approximation
			log.Printf(`{"level":"warn","service":"solar_poller","msg":"horizons fallback","planet":%q,"error":%q}`, name, err)
			x, y, z = keplerianXYZ(name)
		}
		positions = append(positions, models.PlanetPosition{
			Name:     name,
			X:        x,
			Y:        y,
			Z:        z,
			RadiusKM: planetRadiusKM[name],
		})
	}

	// Store each planet in Redis hash planet:positions
	pipe := p.rdb.Pipeline()
	for _, pos := range positions {
		data, _ := json.Marshal(pos)
		pipe.HSet(ctx, "planet:positions", pos.Name, data)
	}
	if _, err := pipe.Exec(ctx); err != nil {
		log.Printf(`{"level":"error","service":"solar_poller","msg":"redis write failed","error":%q}`, err)
	}

	// Broadcast solar_system message to all connected WS clients
	p.hub.BroadcastSolarSystem(ctx, positions)

	log.Printf(`{"level":"info","service":"solar_poller","msg":"planets updated","count":%d}`, len(positions))
}

// ── Hub extension: BroadcastSolarSystem ──────────────────────────────────────

func (h *Hub) BroadcastSolarSystem(ctx context.Context, planets []models.PlanetPosition) {
	msg := models.NewWSMessage(models.WSTypeSolarSystem, models.WSSolarSystem{
		Planets:   planets,
		UpdatedAt: time.Now().Unix(),
	})
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
