package controllers

import (
	"encoding/json"
	"math"
	"net/http"
	"sort"
	"strings"

	"github.com/redis/go-redis/v9"
	"github.com/skydot/backend/src/models"
	"github.com/skydot/backend/src/utils"
)

// Airport coordinates for IATA lookup
var airports = map[string][2]float64{
	"JFK": {40.64, -73.78}, "LAX": {33.94, -118.41}, "LHR": {51.47, -0.46},
	"CDG": {49.01, 2.55}, "DXB": {25.25, 55.36}, "SIN": {1.36, 103.99},
	"HND": {35.55, 139.78}, "PEK": {40.08, 116.60}, "SYD": {-33.95, 151.18},
	"FRA": {50.03, 8.57}, "AMS": {52.31, 4.77}, "ATL": {33.64, -84.43},
	"ORD": {41.97, -87.91}, "HKG": {22.31, 113.92}, "ICN": {37.46, 126.44},
	"BKK": {13.68, 100.75}, "DEL": {28.56, 77.10}, "BOM": {19.09, 72.87},
	"GRU": {-23.43, -46.47}, "DFW": {32.90, -97.04}, "ORY": {48.72, 2.36},
	"NRT": {35.77, 140.39}, "MUC": {48.36, 11.79}, "MAD": {40.47, -3.56},
}

// ArrivalEntry is a single inbound aircraft with ETA
type ArrivalEntry struct {
	ICAO24   string  `json:"icao24"`
	Callsign string  `json:"callsign,omitempty"`
	Type     string  `json:"type,omitempty"` // ICAO aircraft type code (e.g. B738)
	DistKm   float64 `json:"dist_km"`
	ETAMin   float64 `json:"eta_min"`
	AltFt    float64 `json:"alt_ft,omitempty"`
	SpeedKts float64 `json:"speed_kts,omitempty"`
	Heading  float64 `json:"heading,omitempty"`
}

type AirportController struct {
	rdb *redis.Client
}

func NewAirportController(rdb *redis.Client) *AirportController {
	return &AirportController{rdb: rdb}
}

// Haversine distance in km
func strDeref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func haversineKm(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371.0
	dLat := (lat2 - lat1) * math.Pi / 180
	dLon := (lon2 - lon1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	return R * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

// Bearing from point 1 to point 2 in degrees [0, 360)
func bearing(lat1, lon1, lat2, lon2 float64) float64 {
	la1 := lat1 * math.Pi / 180
	la2 := lat2 * math.Pi / 180
	dLon := (lon2 - lon1) * math.Pi / 180
	y := math.Sin(dLon) * math.Cos(la2)
	x := math.Cos(la1)*math.Sin(la2) - math.Sin(la1)*math.Cos(la2)*math.Cos(dLon)
	b := math.Atan2(y, x) * 180 / math.Pi
	if b < 0 {
		b += 360
	}
	return b
}

// GetArrivals returns aircraft heading toward a given airport with ETA.
// GET /api/v1/airports/{iata}/arrivals
func (ac *AirportController) GetArrivals(w http.ResponseWriter, r *http.Request) {
	iata := strings.ToUpper(strings.TrimSpace(r.PathValue("iata")))
	coords, ok := airports[iata]
	if !ok {
		utils.Error(w, http.StatusNotFound, "unknown airport")
		return
	}
	aptLat, aptLon := coords[0], coords[1]
	ctx := r.Context()

	raw, err := ac.rdb.HGetAll(ctx, aircraftLiveKey).Result()
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "failed to fetch aircraft")
		return
	}

	var arrivals []ArrivalEntry
	for _, v := range raw {
		var a models.LiveAircraft
		if json.Unmarshal([]byte(v), &a) != nil {
			continue
		}
		if a.Cat != "plane" && a.Cat != "heavy" && a.Cat != "regional" {
			continue
		}
		if a.Grnd || a.Vel == nil || a.Hdg == nil || *a.Vel < 50 {
			continue
		}

		dist := haversineKm(a.Lat, a.Lon, aptLat, aptLon)
		if dist > 500 || dist < 2 {
			continue
		}

		// Check if aircraft heading roughly toward the airport (within 45°)
		brg := bearing(a.Lat, a.Lon, aptLat, aptLon)
		hdgDiff := math.Abs(brg - *a.Hdg)
		if hdgDiff > 180 {
			hdgDiff = 360 - hdgDiff
		}
		if hdgDiff > 45 {
			continue
		}

		// ETA: distance / ground speed. Velocity is in knots, convert to km/h.
		speedKmh := *a.Vel * 1.852
		etaMin := (dist / speedKmh) * 60

		cs := ""
		if a.Callsign != nil {
			cs = *a.Callsign
		}
		altFt := 0.0
		if a.Alt != nil {
			altFt = *a.Alt
		}

		arrivals = append(arrivals, ArrivalEntry{
			ICAO24:   a.ID,
			Callsign: cs,
			Type:     strDeref(a.T),
			DistKm:   math.Round(dist*10) / 10,
			ETAMin:   math.Round(etaMin*10) / 10,
			AltFt:    altFt,
			SpeedKts: *a.Vel,
			Heading:  *a.Hdg,
		})
	}

	sort.Slice(arrivals, func(i, j int) bool {
		return arrivals[i].ETAMin < arrivals[j].ETAMin
	})

	// Cap at 30 nearest arrivals
	if len(arrivals) > 30 {
		arrivals = arrivals[:30]
	}

	utils.JSON(w, http.StatusOK, map[string]interface{}{
		"airport":  iata,
		"arrivals": arrivals,
		"count":    len(arrivals),
	})
}

// DepartureEntry is a single outbound aircraft that recently departed
type DepartureEntry struct {
	ICAO24   string  `json:"icao24"`
	Callsign string  `json:"callsign,omitempty"`
	Type     string  `json:"type,omitempty"` // ICAO aircraft type code (e.g. B738)
	DistKm   float64 `json:"dist_km"`
	AltFt    float64 `json:"alt_ft,omitempty"`
	SpeedKts float64 `json:"speed_kts,omitempty"`
	Heading  float64 `json:"heading,omitempty"`
}

// GetDepartures returns aircraft that recently departed a given airport.
// GET /api/v1/airports/{iata}/departures
func (ac *AirportController) GetDepartures(w http.ResponseWriter, r *http.Request) {
	iata := strings.ToUpper(strings.TrimSpace(r.PathValue("iata")))
	coords, ok := airports[iata]
	if !ok {
		utils.Error(w, http.StatusNotFound, "unknown airport")
		return
	}
	aptLat, aptLon := coords[0], coords[1]
	ctx := r.Context()

	raw, err := ac.rdb.HGetAll(ctx, aircraftLiveKey).Result()
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "failed to fetch aircraft")
		return
	}

	var departures []DepartureEntry
	for _, v := range raw {
		var a models.LiveAircraft
		if json.Unmarshal([]byte(v), &a) != nil {
			continue
		}
		if a.Cat != "plane" && a.Cat != "heavy" && a.Cat != "regional" {
			continue
		}
		if a.Grnd || a.Vel == nil || a.Hdg == nil || *a.Vel < 50 {
			continue
		}

		dist := haversineKm(a.Lat, a.Lon, aptLat, aptLon)
		// Recently departed: within 200km, heading AWAY from airport
		if dist > 200 || dist < 2 {
			continue
		}

		// Bearing from aircraft to airport — if aircraft heading is opposite, it departed
		brg := bearing(a.Lat, a.Lon, aptLat, aptLon)
		hdgDiff := math.Abs(brg - *a.Hdg)
		if hdgDiff > 180 {
			hdgDiff = 360 - hdgDiff
		}
		// Aircraft heading AWAY from airport (diff > 135°)
		if hdgDiff < 135 {
			continue
		}

		cs := ""
		if a.Callsign != nil {
			cs = *a.Callsign
		}
		altFt := 0.0
		if a.Alt != nil {
			altFt = *a.Alt
		}

		departures = append(departures, DepartureEntry{
			ICAO24:   a.ID,
			Callsign: cs,
			Type:     strDeref(a.T),
			DistKm:   math.Round(dist*10) / 10,
			AltFt:    altFt,
			SpeedKts: *a.Vel,
			Heading:  *a.Hdg,
		})
	}

	sort.Slice(departures, func(i, j int) bool {
		return departures[i].DistKm < departures[j].DistKm
	})

	if len(departures) > 30 {
		departures = departures[:30]
	}

	utils.JSON(w, http.StatusOK, map[string]interface{}{
		"airport":    iata,
		"departures": departures,
		"count":      len(departures),
	})
}
