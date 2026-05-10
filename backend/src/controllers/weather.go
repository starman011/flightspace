package controllers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	weatherCacheKey = "weather:wind:grid"
	weatherCacheTTL = 30 * time.Minute
	weatherGridStep = 10.0 // degrees between grid points
	weatherBatchSize = 50  // coordinates per Open-Meteo request
)

// WindPoint is one grid point with wind data.
type WindPoint struct {
	Lat       float64 `json:"lat"`
	Lon       float64 `json:"lon"`
	Speed     float64 `json:"speed"`     // m/s
	Direction float64 `json:"direction"` // degrees (meteorological)
	U         float64 `json:"u"`         // east-west component (m/s)
	V         float64 `json:"v"`         // north-south component (m/s)
}

type WeatherController struct {
	rdb    *redis.Client
	client *http.Client
}

func NewWeatherController(rdb *redis.Client) *WeatherController {
	return &WeatherController{
		rdb:    rdb,
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

// GetWind handles GET /api/v1/weather/wind — returns cached wind grid.
func (wc *WeatherController) GetWind(w http.ResponseWriter, r *http.Request) {
	cached, err := wc.rdb.Get(r.Context(), weatherCacheKey).Bytes()
	if err == nil {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "public, max-age=900")
		w.Write(cached)
		return
	}

	http.Error(w, "wind data not available yet", http.StatusServiceUnavailable)
}

// StartPoller runs a background loop fetching global wind data.
func (wc *WeatherController) StartPoller(ctx context.Context) {
	// Fetch immediately, then every 30 min
	wc.fetchWindGrid(ctx)

	ticker := time.NewTicker(weatherCacheTTL)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			wc.fetchWindGrid(ctx)
		}
	}
}

// fetchWindGrid samples wind data from Open-Meteo for a global grid.
func (wc *WeatherController) fetchWindGrid(ctx context.Context) {
	// Generate grid points
	type coord struct{ lat, lon float64 }
	var grid []coord
	for lat := -80.0; lat <= 80.0; lat += weatherGridStep {
		for lon := -180.0; lon < 180.0; lon += weatherGridStep {
			grid = append(grid, coord{lat, lon})
		}
	}

	results := make([]WindPoint, 0, len(grid))

	// Batch requests to Open-Meteo
	for i := 0; i < len(grid); i += weatherBatchSize {
		end := i + weatherBatchSize
		if end > len(grid) {
			end = len(grid)
		}
		batch := grid[i:end]

		lats := make([]string, len(batch))
		lons := make([]string, len(batch))
		for j, c := range batch {
			lats[j] = fmt.Sprintf("%.1f", c.lat)
			lons[j] = fmt.Sprintf("%.1f", c.lon)
		}

		url := fmt.Sprintf(
			"https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s&current=wind_speed_10m,wind_direction_10m&timezone=UTC",
			strings.Join(lats, ","),
			strings.Join(lons, ","),
		)

		resp, err := wc.client.Get(url)
		if err != nil {
			log.Printf(`{"level":"warn","service":"weather","msg":"fetch failed","batch":%d,"error":%q}`, i/weatherBatchSize, err)
			continue
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			continue
		}

		// Open-Meteo returns array for multiple coords, single object for one
		if len(batch) == 1 {
			var single struct {
				Latitude  float64 `json:"latitude"`
				Longitude float64 `json:"longitude"`
				Current   struct {
					WindSpeed     float64 `json:"wind_speed_10m"`
					WindDirection float64 `json:"wind_direction_10m"`
				} `json:"current"`
			}
			if err := json.Unmarshal(body, &single); err == nil {
				wp := windPointFromResponse(single.Latitude, single.Longitude, single.Current.WindSpeed, single.Current.WindDirection)
				results = append(results, wp)
			}
		} else {
			var multi []struct {
				Latitude  float64 `json:"latitude"`
				Longitude float64 `json:"longitude"`
				Current   struct {
					WindSpeed     float64 `json:"wind_speed_10m"`
					WindDirection float64 `json:"wind_direction_10m"`
				} `json:"current"`
			}
			if err := json.Unmarshal(body, &multi); err == nil {
				for _, m := range multi {
					wp := windPointFromResponse(m.Latitude, m.Longitude, m.Current.WindSpeed, m.Current.WindDirection)
					results = append(results, wp)
				}
			}
		}

		// Be polite to free API
		if i+weatherBatchSize < len(grid) {
			time.Sleep(200 * time.Millisecond)
		}
	}

	if len(results) == 0 {
		log.Printf(`{"level":"error","service":"weather","msg":"no wind data fetched"}`)
		return
	}

	payload, err := json.Marshal(map[string]interface{}{
		"points":     results,
		"grid_step":  weatherGridStep,
		"fetched_at": time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		return
	}

	wc.rdb.Set(ctx, weatherCacheKey, payload, weatherCacheTTL)
	log.Printf(`{"level":"info","service":"weather","msg":"wind grid cached","points":%d}`, len(results))
}

// windPointFromResponse converts meteorological wind direction to U/V components.
func windPointFromResponse(lat, lon, speed, dir float64) WindPoint {
	// Meteorological direction: where wind comes FROM, clockwise from north
	// Convert to math angle: where wind goes TO
	rad := (270 - dir) * math.Pi / 180
	return WindPoint{
		Lat:       lat,
		Lon:       lon,
		Speed:     speed,
		Direction: dir,
		U:         speed * math.Cos(rad),
		V:         speed * math.Sin(rad),
	}
}
