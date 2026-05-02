package controllers

// DESI (Dark Energy Spectroscopic Instrument) data proxy.
// Queries NOIRLab Astro Data Lab TAP service for real galaxy/quasar catalog
// data and caches results in-memory (24h TTL — DESI DR1 is static).

import (
	"encoding/binary"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
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
	desiBinCache  []byte // pre-built binary payload
	desiCacheMu   sync.RWMutex
	desiCacheTime time.Time
	desiFetchMu   sync.Mutex
)

const desiCacheTTL = 24 * time.Hour
const desiTAPURL = "https://datalab.noirlab.edu/tap/sync"

var tapClient = &http.Client{Timeout: 300 * time.Second}

// Bulk query: 1M galaxies + quasars with reliable redshifts
// random_id is 0–100; < 7.0 ≈ 1.14M rows, TOP caps at 1M
const desiBulkQuery = `SELECT TOP 1000000 targetid, mean_fiber_ra, mean_fiber_dec, z, spectype FROM desi_dr1.zpix WHERE zwarn = 0 AND spectype IN ('GALAXY', 'QSO') AND z > 0.001 AND random_id < 7.0`

// Detail query: single object with photometry, morphology, emission lines, stellar mass
const desiDetailQuery = `SELECT z.targetid, z.mean_fiber_ra, z.mean_fiber_dec, z.z, z.zerr, z.spectype, z.subtype, z.survey, z.program, z.deltachi2, p.flux_g, p.flux_r, p.flux_z, p.flux_w1, p.flux_w2, p.morphtype, p.shape_r, p.ebv, a.logmstar, a.halpha_flux, a.hbeta_flux, a.oiii_5007_flux FROM desi_dr1.zpix AS z LEFT JOIN desi_dr1.photometry AS p ON z.targetid = p.targetid LEFT JOIN desi_dr1.agngal AS a ON z.targetid = a.targetid WHERE z.targetid = %s`

// ── Handlers ───────────────────────────────────────────────────────────────

type DESIController struct{}

func NewDESIController() *DESIController { return &DESIController{} }

// StartBackgroundFetch launches a goroutine that pre-fetches DESI data on
// startup and refreshes every 24h. No user request ever waits for TAP.
func (dc *DESIController) StartBackgroundFetch() {
	go func() {
		dc.fetchAndCache()
		ticker := time.NewTicker(desiCacheTTL)
		defer ticker.Stop()
		for range ticker.C {
			dc.fetchAndCache()
		}
	}()
}

func (dc *DESIController) fetchAndCache() {
	desiFetchMu.Lock()
	defer desiFetchMu.Unlock()

	// Skip if cache is still fresh
	desiCacheMu.RLock()
	age := time.Since(desiCacheTime)
	desiCacheMu.RUnlock()
	if age < desiCacheTTL && age > 0 {
		return
	}

	log.Println("DESI: fetching bulk catalog from TAP…")
	raw, err := queryTAP(desiBulkQuery)
	if err != nil {
		log.Printf("DESI background fetch failed: %v", err)
		return
	}
	parsed := parseBulkCSV(raw)
	if len(parsed) == 0 {
		log.Println("DESI: TAP returned 0 rows")
		return
	}

	bin := galaxiesToBinary(parsed)

	desiCacheMu.Lock()
	desiCache = parsed
	desiBinCache = bin
	desiCacheTime = time.Now()
	desiCacheMu.Unlock()

	log.Printf("DESI: cached %d galaxies/QSOs (%d bytes binary)", len(parsed), len(bin))
}

// GetGalaxies serves cached bulk galaxy data as JSON.
func (dc *DESIController) GetGalaxies(w http.ResponseWriter, r *http.Request) {
	desiCacheMu.RLock()
	cached := desiCache
	desiCacheMu.RUnlock()

	if cached == nil {
		http.Error(w, `{"error":"DESI data loading, try again shortly"}`, http.StatusServiceUnavailable)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	json.NewEncoder(w).Encode(cached)
}

// GetGalaxiesBinary serves pre-built binary blob — 21 bytes/point.
// Format: [uint32 LE count] then per point [uint64 LE targetid, float32 LE ra, float32 LE dec, float32 LE z, uint8 spectype(0=GALAXY,1=QSO)]
func (dc *DESIController) GetGalaxiesBinary(w http.ResponseWriter, r *http.Request) {
	desiCacheMu.RLock()
	bin := desiBinCache
	desiCacheMu.RUnlock()

	if bin == nil {
		http.Error(w, `{"error":"DESI data loading, try again shortly"}`, http.StatusServiceUnavailable)
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.Write(bin)
}

// galaxiesToBinary packs galaxies into a compact binary format.
// 4-byte header (uint32 count) + 21 bytes per point.
func galaxiesToBinary(galaxies []DESIGalaxy) []byte {
	n := len(galaxies)
	buf := make([]byte, 4+n*21)
	binary.LittleEndian.PutUint32(buf[0:4], uint32(n))

	for i, g := range galaxies {
		off := 4 + i*21
		tid, _ := strconv.ParseUint(g.TargetID, 10, 64)
		binary.LittleEndian.PutUint64(buf[off:off+8], tid)
		binary.LittleEndian.PutUint32(buf[off+8:off+12], math.Float32bits(float32(g.RA)))
		binary.LittleEndian.PutUint32(buf[off+12:off+16], math.Float32bits(float32(g.Dec)))
		binary.LittleEndian.PutUint32(buf[off+16:off+20], math.Float32bits(float32(g.Z)))
		if g.SpecType == "QSO" {
			buf[off+20] = 1
		}
	}
	return buf
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

// SearchGalaxies searches the cached DESI catalog by target ID prefix,
// and optionally queries SIMBAD/NED for named objects.
func (dc *DESIController) SearchGalaxies(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" || len(q) < 2 {
		json.NewEncoder(w).Encode(map[string]any{"results": []any{}})
		return
	}
	limitStr := r.URL.Query().Get("limit")
	limit := 10
	if n, err := strconv.Atoi(limitStr); err == nil && n > 0 && n <= 50 {
		limit = n
	}

	type SearchResult struct {
		TargetID string  `json:"targetid"`
		RA       float64 `json:"ra"`
		Dec      float64 `json:"dec"`
		Z        float64 `json:"z"`
		SpecType string  `json:"spectype"`
		Name     string  `json:"name,omitempty"`
		Source   string  `json:"source"` // "desi" or "simbad"
	}

	var results []SearchResult
	// 1. Search cached DESI catalog by target ID prefix
	desiCacheMu.RLock()
	cached := desiCache
	desiCacheMu.RUnlock()

	if cached != nil {
		for _, g := range cached {
			if strings.HasPrefix(g.TargetID, q) {
				results = append(results, SearchResult{
					TargetID: g.TargetID, RA: g.RA, Dec: g.Dec,
					Z: g.Z, SpecType: g.SpecType, Source: "desi",
				})
				if len(results) >= limit {
					break
				}
			}
		}
	}

	// 2. If query looks like a name (not numeric), search SIMBAD
	isNumeric := true
	for _, c := range q {
		if c < '0' || c > '9' {
			isNumeric = false
			break
		}
	}

	if !isNumeric && len(results) < limit {
		escaped := strings.ReplaceAll(q, "'", "''")
		escaped = strings.ReplaceAll(escaped, "%", "\\%")
		escaped = strings.ReplaceAll(escaped, "_", "\\_")
		// Title-case the query so SIMBAD case-sensitive ident matches work
		// e.g. "andromeda" → "Andromeda", "ngc" → "Ngc", "m 31" → "M 31"
		words := strings.Fields(escaped)
		for i, w := range words {
			if len(w) > 0 {
				words[i] = strings.ToUpper(w[:1]) + w[1:]
			}
		}
		titleQ := strings.Join(words, " ")
		// Also try all-uppercase for catalog prefixes (NGC, UGC, etc.)
		upperQ := strings.ToUpper(escaped)
		// Search both main_id AND aliases (ident table) for common names
		// like "Andromeda", "NGC", "Messier", etc.
		// Note: rvz_redshift removed — causes ADQL parse error on SIMBAD TAP
		simbadQuery := fmt.Sprintf(
			`SELECT DISTINCT TOP %d b.main_id, b.ra, b.dec, b.otype FROM ident AS i JOIN basic AS b ON i.oidref = b.oid WHERE (i.id LIKE '%%%s%%' OR i.id LIKE '%%%s%%') AND b.otype IN ('G','QSO','AGN','GiG','GiP','IG','GrG','BiC','ClG')`,
			limit, titleQ, upperQ,
		)
		params := url.Values{}
		params.Set("REQUEST", "doQuery")
		params.Set("LANG", "ADQL")
		params.Set("FORMAT", "csv")
		params.Set("QUERY", simbadQuery)

		resp, err := tapClient.Get("https://simbad.cds.unistra.fr/simbad/sim-tap/sync?" + params.Encode())
		if err == nil {
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				body, _ := io.ReadAll(resp.Body)
				rdr := csv.NewReader(strings.NewReader(string(body)))
				rdr.Read() // skip header
				seen := make(map[string]bool)
				for {
					rec, err := rdr.Read()
					if err != nil {
						break
					}
					if len(rec) < 4 {
						continue
					}
					name := strings.TrimSpace(rec[0])
					if seen[name] {
						continue
					}
					seen[name] = true
					ra, e1 := strconv.ParseFloat(strings.TrimSpace(rec[1]), 64)
					dec, e2 := strconv.ParseFloat(strings.TrimSpace(rec[2]), 64)
					if e1 != nil || e2 != nil {
						continue
					}
					results = append(results, SearchResult{
						RA: ra, Dec: dec, Z: 0,
						SpecType: strings.TrimSpace(rec[3]),
						Name:     name, Source: "simbad",
					})
					if len(results) >= limit {
						break
					}
				}
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=300")
	json.NewEncoder(w).Encode(map[string]any{"results": results})
}

// GetGalaxyEnrichment queries NED + SIMBAD for known names / cross-IDs near the target.
func (dc *DESIController) GetGalaxyEnrichment(w http.ResponseWriter, r *http.Request) {
	raStr := r.URL.Query().Get("ra")
	decStr := r.URL.Query().Get("dec")
	if raStr == "" || decStr == "" {
		http.Error(w, `{"error":"ra and dec required"}`, http.StatusBadRequest)
		return
	}
	ra, err1 := strconv.ParseFloat(raStr, 64)
	dec, err2 := strconv.ParseFloat(decStr, 64)
	if err1 != nil || err2 != nil {
		http.Error(w, `{"error":"invalid coordinates"}`, http.StatusBadRequest)
		return
	}

	type EnrichResult struct {
		KnownName   string `json:"known_name,omitempty"`
		ObjectType  string `json:"object_type,omitempty"`
		NEDRedshift string `json:"ned_redshift,omitempty"`
		Source      string `json:"source,omitempty"`
		OtherNames  []string `json:"other_names,omitempty"`
	}

	// NED TAP cone search — 18 arcsec radius (~0.005 deg)
	nedQuery := fmt.Sprintf(
		`SELECT TOP 5 prefname, ra, dec, pretype, z FROM NEDTAP.objdir WHERE 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',%.6f,%.6f,0.005))`,
		ra, dec,
	)
	nedParams := url.Values{}
	nedParams.Set("REQUEST", "doQuery")
	nedParams.Set("LANG", "ADQL")
	nedParams.Set("FORMAT", "csv")
	nedParams.Set("QUERY", nedQuery)

	result := EnrichResult{}
	var otherNames []string

	nedResp, err := tapClient.Get("https://ned.ipac.caltech.edu/tap/sync?" + nedParams.Encode())
	if err == nil {
		defer nedResp.Body.Close()
		if nedResp.StatusCode == http.StatusOK {
			body, _ := io.ReadAll(nedResp.Body)
			rdr := csv.NewReader(strings.NewReader(string(body)))
			hdr, _ := rdr.Read()
			_ = hdr
			for {
				rec, err := rdr.Read()
				if err != nil {
					break
				}
				if len(rec) < 5 {
					continue
				}
				name := strings.TrimSpace(rec[0])
				objType := strings.TrimSpace(rec[3])
				zVal := strings.TrimSpace(rec[4])

				// Skip stars, pick galaxies/QSOs first
				if objType == "G" || objType == "QSO" || objType == "GGroup" || objType == "GPair" {
					if result.KnownName == "" {
						result.KnownName = name
						result.ObjectType = objType
						result.NEDRedshift = zVal
						result.Source = "NED"
					} else {
						otherNames = append(otherNames, name)
					}
				} else if result.KnownName == "" {
					// Store non-galaxy match as fallback
					otherNames = append(otherNames, name+" ("+objType+")")
				}
			}
		}
	}

	// SIMBAD TAP fallback if NED found nothing
	if result.KnownName == "" {
		simbadQuery := fmt.Sprintf(
			`SELECT TOP 3 main_id, ra, dec, otype, rvz_redshift FROM basic WHERE 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',%.6f,%.6f,0.005))`,
			ra, dec,
		)
		simbadParams := url.Values{}
		simbadParams.Set("REQUEST", "doQuery")
		simbadParams.Set("LANG", "ADQL")
		simbadParams.Set("FORMAT", "csv")
		simbadParams.Set("QUERY", simbadQuery)

		sResp, err := tapClient.Get("https://simbad.cds.unistra.fr/simbad/sim-tap/sync?" + simbadParams.Encode())
		if err == nil {
			defer sResp.Body.Close()
			if sResp.StatusCode == http.StatusOK {
				body, _ := io.ReadAll(sResp.Body)
				rdr := csv.NewReader(strings.NewReader(string(body)))
				rdr.Read() // skip header
				for {
					rec, err := rdr.Read()
					if err != nil {
						break
					}
					if len(rec) < 4 {
						continue
					}
					name := strings.TrimSpace(rec[0])
					objType := strings.TrimSpace(rec[3])
					if result.KnownName == "" {
						result.KnownName = name
						result.ObjectType = objType
						result.Source = "SIMBAD"
						if len(rec) >= 5 {
							result.NEDRedshift = strings.TrimSpace(rec[4])
						}
					} else {
						otherNames = append(otherNames, name)
					}
				}
			}
		}
	}

	if len(otherNames) > 0 {
		result.OtherNames = otherNames
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	json.NewEncoder(w).Encode(result)
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
