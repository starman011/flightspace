package controllers

// DESI (Dark Energy Spectroscopic Instrument) data proxy.
// Queries NOIRLab Astro Data Lab TAP service for real galaxy/quasar catalog
// data and caches results in-memory (24h TTL — DESI DR1 is static).

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ── Types ──────────────────────────────────────────────────────────────────

type DESIGalaxy struct {
	TargetID string  `json:"t"`
	RA       float64 `json:"r"`
	Dec      float64 `json:"d"`
	Z        float64 `json:"z"`
	SpecType string  `json:"s"`
}

type DESIDetail struct {
	TargetID   string   `json:"targetid"`
	RA         float64  `json:"ra"`
	Dec        float64  `json:"dec"`
	Z          float64  `json:"z"`
	ZErr       float64  `json:"zerr"`
	SpecType   string   `json:"spectype"`
	SubType    string   `json:"subtype"`
	Survey     string   `json:"survey"`
	Program    string   `json:"program"`
	DeltaChi2  *float64 `json:"deltachi2"`
	FluxG      *float64 `json:"flux_g"`
	FluxR      *float64 `json:"flux_r"`
	FluxZ      *float64 `json:"flux_z"`
	FluxW1     *float64 `json:"flux_w1"`
	FluxW2     *float64 `json:"flux_w2"`
	MorphType  string   `json:"morphtype"`
	ShapeR     *float64 `json:"shape_r"`
	EBV        *float64 `json:"ebv"`
	LogMStar   *float64 `json:"logmstar"`
	HalphaFlux *float64 `json:"halpha_flux"`
	HbetaFlux  *float64 `json:"hbeta_flux"`
	OIIIFlux   *float64 `json:"oiii_flux"`
}

// ── Cache ──────────────────────────────────────────────────────────────────

var (
	desiCache     []DESIGalaxy
	desiCacheMu   sync.RWMutex
	desiCacheTime time.Time
	desiFetchMu   sync.Mutex
)

const desiCacheTTL = 24 * time.Hour
const desiTAPURL = "https://datalab.noirlab.edu/tap/sync"

var tapClient = &http.Client{Timeout: 120 * time.Second}

// Bulk query: 100K random galaxies + quasars with reliable redshifts
const desiBulkQuery = `SELECT TOP 100000 targetid, mean_fiber_ra, mean_fiber_dec, z, spectype FROM desi_dr1.zpix WHERE zwarn = 0 AND spectype IN ('GALAXY', 'QSO') AND z > 0.001 AND random_id < 1.0`

// Detail query: single object with photometry, morphology, emission lines, stellar mass
const desiDetailQuery = `SELECT z.targetid, z.mean_fiber_ra, z.mean_fiber_dec, z.z, z.zerr, z.spectype, z.subtype, z.survey, z.program, z.deltachi2, p.flux_g, p.flux_r, p.flux_z, p.flux_w1, p.flux_w2, p.morphtype, p.shape_r, p.ebv, a.logmstar, a.halpha_flux, a.hbeta_flux, a.oiii_5007_flux FROM desi_dr1.zpix AS z LEFT JOIN desi_dr1.photometry AS p ON z.targetid = p.targetid LEFT JOIN desi_dr1.agngal AS a ON z.targetid = a.targetid WHERE z.targetid = %s`

// ── Handlers ───────────────────────────────────────────────────────────────

type DESIController struct{}

func NewDESIController() *DESIController { return &DESIController{} }

// GetGalaxies serves cached bulk galaxy data.
func (dc *DESIController) GetGalaxies(w http.ResponseWriter, r *http.Request) {
	// Try cache first
	desiCacheMu.RLock()
	cached := desiCache
	cacheAge := time.Since(desiCacheTime)
	desiCacheMu.RUnlock()

	if cached != nil && cacheAge < desiCacheTTL {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "public, max-age=86400")
		json.NewEncoder(w).Encode(cached)
		return
	}

	// Prevent thundering herd — only one goroutine fetches
	desiFetchMu.Lock()
	defer desiFetchMu.Unlock()

	// Double-check after acquiring lock
	desiCacheMu.RLock()
	cached = desiCache
	cacheAge = time.Since(desiCacheTime)
	desiCacheMu.RUnlock()
	if cached != nil && cacheAge < desiCacheTTL {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "public, max-age=86400")
		json.NewEncoder(w).Encode(cached)
		return
	}

	galaxies, err := queryTAP(desiBulkQuery)
	if err != nil {
		log.Printf("DESI bulk fetch failed: %v", err)
		http.Error(w, `{"error":"DESI data temporarily unavailable"}`, http.StatusBadGateway)
		return
	}

	// Parse bulk CSV
	parsed := parseBulkCSV(galaxies)
	if len(parsed) == 0 {
		http.Error(w, `{"error":"no DESI data returned"}`, http.StatusBadGateway)
		return
	}

	// Update cache
	desiCacheMu.Lock()
	desiCache = parsed
	desiCacheTime = time.Now()
	desiCacheMu.Unlock()

	log.Printf("DESI: cached %d galaxies/QSOs", len(parsed))
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	json.NewEncoder(w).Encode(parsed)
}

// GetGalaxyDetail serves detailed data for a single DESI object.
func (dc *DESIController) GetGalaxyDetail(w http.ResponseWriter, r *http.Request) {
	targetID := r.PathValue("targetid")
	if targetID == "" || len(targetID) > 30 {
		http.Error(w, `{"error":"invalid target ID"}`, http.StatusBadRequest)
		return
	}
	// Validate numeric
	if _, err := strconv.ParseInt(targetID, 10, 64); err != nil {
		http.Error(w, `{"error":"target ID must be numeric"}`, http.StatusBadRequest)
		return
	}

	query := fmt.Sprintf(desiDetailQuery, targetID)
	body, err := queryTAP(query)
	if err != nil {
		log.Printf("DESI detail fetch failed for %s: %v", targetID, err)
		http.Error(w, `{"error":"failed to fetch galaxy detail"}`, http.StatusBadGateway)
		return
	}

	detail := parseDetailCSV(body)
	if detail == nil {
		http.Error(w, `{"error":"galaxy not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	json.NewEncoder(w).Encode(detail)
}

// ── TAP query helper ───────────────────────────────────────────────────────

func queryTAP(adql string) (string, error) {
	params := url.Values{}
	params.Set("REQUEST", "doQuery")
	params.Set("LANG", "ADQL")
	params.Set("FORMAT", "csv")
	params.Set("QUERY", adql)

	resp, err := tapClient.Get(desiTAPURL + "?" + params.Encode())
	if err != nil {
		return "", fmt.Errorf("TAP request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return "", fmt.Errorf("TAP returned %d: %s", resp.StatusCode, string(b))
	}

	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("reading TAP response: %w", err)
	}
	return string(b), nil
}

// ── CSV parsers ────────────────────────────────────────────────────────────

func parseBulkCSV(data string) []DESIGalaxy {
	reader := csv.NewReader(strings.NewReader(data))
	header, err := reader.Read()
	if err != nil || len(header) < 5 {
		return nil
	}

	var galaxies []DESIGalaxy
	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil || len(record) < 5 {
			continue
		}
		ra, e1 := strconv.ParseFloat(strings.TrimSpace(record[1]), 64)
		dec, e2 := strconv.ParseFloat(strings.TrimSpace(record[2]), 64)
		z, e3 := strconv.ParseFloat(strings.TrimSpace(record[3]), 64)
		if e1 != nil || e2 != nil || e3 != nil {
			continue
		}

		galaxies = append(galaxies, DESIGalaxy{
			TargetID: strings.TrimSpace(record[0]),
			RA:       ra,
			Dec:      dec,
			Z:        z,
			SpecType: strings.TrimSpace(record[4]),
		})
	}
	return galaxies
}

func parseDetailCSV(data string) *DESIDetail {
	reader := csv.NewReader(strings.NewReader(data))
	header, err := reader.Read()
	if err != nil {
		return nil
	}
	record, err := reader.Read()
	if err != nil {
		return nil
	}
	if len(record) < len(header) {
		return nil
	}

	// Build column index map
	idx := make(map[string]int, len(header))
	for i, h := range header {
		idx[strings.TrimSpace(h)] = i
	}

	getStr := func(col string) string {
		if i, ok := idx[col]; ok && i < len(record) {
			return strings.TrimSpace(record[i])
		}
		return ""
	}
	getFloat := func(col string) float64 {
		s := getStr(col)
		v, _ := strconv.ParseFloat(s, 64)
		return v
	}
	getFloatPtr := func(col string) *float64 {
		s := getStr(col)
		if s == "" {
			return nil
		}
		v, err := strconv.ParseFloat(s, 64)
		if err != nil {
			return nil
		}
		return &v
	}

	return &DESIDetail{
		TargetID:   getStr("targetid"),
		RA:         getFloat("mean_fiber_ra"),
		Dec:        getFloat("mean_fiber_dec"),
		Z:          getFloat("z"),
		ZErr:       getFloat("zerr"),
		SpecType:   getStr("spectype"),
		SubType:    getStr("subtype"),
		Survey:     getStr("survey"),
		Program:    getStr("program"),
		DeltaChi2:  getFloatPtr("deltachi2"),
		FluxG:      getFloatPtr("flux_g"),
		FluxR:      getFloatPtr("flux_r"),
		FluxZ:      getFloatPtr("flux_z"),
		FluxW1:     getFloatPtr("flux_w1"),
		FluxW2:     getFloatPtr("flux_w2"),
		MorphType:  getStr("morphtype"),
		ShapeR:     getFloatPtr("shape_r"),
		EBV:        getFloatPtr("ebv"),
		LogMStar:   getFloatPtr("logmstar"),
		HalphaFlux: getFloatPtr("halpha_flux"),
		HbetaFlux:  getFloatPtr("hbeta_flux"),
		OIIIFlux:   getFloatPtr("oiii_5007_flux"),
	}
}
