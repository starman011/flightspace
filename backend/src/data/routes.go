package data

import (
	_ "embed"
	"math"
	"strings"
)

//go:embed openflights/routes.dat
var routesData string

//go:embed openflights/airlines.dat
var airlinesData string

//go:embed openflights/airports.dat
var airportsData string

// Route represents a scheduled airline route.
type Route struct {
	AirlineICAO string
	SrcIATA     string
	DstIATA     string
}

// AirportCoords stores lat/lon for an airport.
type AirportCoords struct {
	IATA string
	ICAO string
	Name string
	Lat  float64
	Lon  float64
}

var (
	// AirlineICAOtoIATA maps airline ICAO code → IATA code (e.g., "UAL" → "UA")
	AirlineICAOtoIATA map[string]string

	// AirlineIATAtoICAO maps airline IATA code → ICAO code (e.g., "UA" → "UAL")
	AirlineIATAtoICAO map[string]string

	// RoutesByAirline maps airline IATA code → list of routes
	RoutesByAirline map[string][]Route

	// AirportByIATA maps IATA code → airport coordinates
	AirportByIATA map[string]*AirportCoords
)

func init() {
	parseAirlines()
	parseAirports()
	parseRoutes()
}

func parseAirlines() {
	AirlineICAOtoIATA = make(map[string]string, 2000)
	AirlineIATAtoICAO = make(map[string]string, 2000)

	for _, line := range strings.Split(airlinesData, "\n") {
		fields := splitCSV(line)
		if len(fields) < 8 {
			continue
		}
		iata := cleanField(fields[3])
		icao := cleanField(fields[4])
		active := cleanField(fields[7])
		if icao == "" || iata == "" || active != "Y" {
			continue
		}
		AirlineICAOtoIATA[icao] = iata
		AirlineIATAtoICAO[iata] = icao
	}
}

func parseAirports() {
	AirportByIATA = make(map[string]*AirportCoords, 8000)

	for _, line := range strings.Split(airportsData, "\n") {
		fields := splitCSV(line)
		if len(fields) < 8 {
			continue
		}
		iata := cleanField(fields[4])
		icao := cleanField(fields[5])
		name := cleanField(fields[1])
		if iata == "" || iata == "\\N" {
			continue
		}
		lat := parseFloat(fields[6])
		lon := parseFloat(fields[7])
		if lat == 0 && lon == 0 {
			continue
		}
		AirportByIATA[iata] = &AirportCoords{
			IATA: iata,
			ICAO: icao,
			Name: name,
			Lat:  lat,
			Lon:  lon,
		}
	}
}

func parseRoutes() {
	RoutesByAirline = make(map[string][]Route, 1000)

	for _, line := range strings.Split(routesData, "\n") {
		fields := splitCSV(line)
		if len(fields) < 7 {
			continue
		}
		airlineIATA := cleanField(fields[0])
		srcIATA := cleanField(fields[2])
		dstIATA := cleanField(fields[4])
		stops := cleanField(fields[7])

		if airlineIATA == "" || srcIATA == "" || dstIATA == "" {
			continue
		}
		if stops != "0" {
			continue // direct flights only
		}

		// Resolve airline ICAO if we got an ICAO code instead of IATA
		airlineKey := airlineIATA
		if len(airlineIATA) == 3 {
			if iata, ok := AirlineICAOtoIATA[airlineIATA]; ok {
				airlineKey = iata
			}
		}

		RoutesByAirline[airlineKey] = append(RoutesByAirline[airlineKey], Route{
			AirlineICAO: airlineIATA,
			SrcIATA:     srcIATA,
			DstIATA:     dstIATA,
		})
	}
}

// LookupRoute finds the most likely route for a given callsign and current position.
// Callsign format: "UAL123" → airline ICAO "UAL", or "UA123" → airline IATA "UA".
// Returns departure airport, arrival airport, or nil if no match.
func LookupRoute(callsign string, lat, lon float64) (dep *AirportCoords, arr *AirportCoords) {
	callsign = strings.TrimSpace(strings.ToUpper(callsign))
	if len(callsign) < 3 {
		return nil, nil
	}

	// Extract airline code from callsign (letters before digits)
	airlineCode := ""
	for i, ch := range callsign {
		if ch >= '0' && ch <= '9' {
			airlineCode = callsign[:i]
			break
		}
	}
	if airlineCode == "" {
		airlineCode = callsign[:3] // fallback: first 3 chars
	}

	// Try as ICAO code first (3 letters), then as IATA (2 letters)
	airlineIATA := ""
	if len(airlineCode) == 3 {
		if iata, ok := AirlineICAOtoIATA[airlineCode]; ok {
			airlineIATA = iata
		} else {
			airlineIATA = airlineCode // try directly
		}
	} else if len(airlineCode) == 2 {
		airlineIATA = airlineCode
	}

	routes := RoutesByAirline[airlineIATA]
	if len(routes) == 0 && len(airlineCode) == 3 {
		// Try the ICAO code directly as a key
		routes = RoutesByAirline[airlineCode]
	}
	if len(routes) == 0 {
		return nil, nil
	}

	// Find the route where one endpoint is closest to current position.
	// The aircraft is between dep and arr, so we look for routes where
	// the aircraft position is near the great-circle path.
	type scored struct {
		dep   *AirportCoords
		arr   *AirportCoords
		score float64
	}
	var best *scored

	for _, r := range routes {
		src := AirportByIATA[r.SrcIATA]
		dst := AirportByIATA[r.DstIATA]
		if src == nil || dst == nil {
			continue
		}

		// Route distance
		routeDist := haversine(src.Lat, src.Lon, dst.Lat, dst.Lon)
		if routeDist < 50 {
			continue // skip trivially short routes
		}

		// Distance from current position to each endpoint
		distToSrc := haversine(lat, lon, src.Lat, src.Lon)
		distToDst := haversine(lat, lon, dst.Lat, dst.Lon)

		// Aircraft should be between the two airports:
		// distToSrc + distToDst ≈ routeDist (with some tolerance for non-great-circle paths)
		detour := (distToSrc + distToDst) - routeDist
		tolerance := routeDist * 0.3 // allow 30% detour (airways aren't great circles)

		if detour > tolerance {
			continue
		}

		// Score: lower is better. Prefer routes where aircraft is clearly between endpoints.
		score := detour

		if best == nil || score < best.score {
			best = &scored{dep: src, arr: dst, score: score}
		}
	}

	if best != nil {
		return best.dep, best.arr
	}
	return nil, nil
}

// splitCSV splits a CSV line handling quoted fields.
func splitCSV(line string) []string {
	var fields []string
	var field strings.Builder
	inQuotes := false

	for i := 0; i < len(line); i++ {
		ch := line[i]
		if ch == '"' {
			inQuotes = !inQuotes
		} else if ch == ',' && !inQuotes {
			fields = append(fields, field.String())
			field.Reset()
		} else {
			field.WriteByte(ch)
		}
	}
	fields = append(fields, field.String())
	return fields
}

func cleanField(s string) string {
	s = strings.TrimSpace(s)
	if s == "\\N" || s == "-" || s == "" {
		return ""
	}
	return s
}

func parseFloat(s string) float64 {
	s = strings.TrimSpace(s)
	var f float64
	for i := 0; i < len(s); i++ {
		if s[i] == '-' && i == 0 {
			continue
		}
		if s[i] == '.' {
			// Parse decimal part
			dec := 0.0
			mul := 0.1
			for j := i + 1; j < len(s); j++ {
				if s[j] >= '0' && s[j] <= '9' {
					dec += float64(s[j]-'0') * mul
					mul *= 0.1
				}
			}
			f += dec
			break
		}
		if s[i] >= '0' && s[i] <= '9' {
			f = f*10 + float64(s[i]-'0')
		}
	}
	if len(s) > 0 && s[0] == '-' {
		f = -f
	}
	return f
}

func haversine(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371.0
	dLat := (lat2 - lat1) * math.Pi / 180
	dLon := (lon2 - lon1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	return R * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}


