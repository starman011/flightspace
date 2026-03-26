package controllers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/skydot/backend/src/utils"
)

const (
	apodCacheKey = "apod:today"
	apodCacheTTL = 12 * time.Hour
)

// APODController proxies NASA Astronomy Picture of the Day with server-side caching.
type APODController struct {
	rdb    *redis.Client
	apiKey string
	client *http.Client
}

func NewAPODController(rdb *redis.Client, apiKey string) *APODController {
	return &APODController{
		rdb:    rdb,
		apiKey: apiKey,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

// GetAPOD returns today's APOD, serving from Redis cache when available.
func (c *APODController) GetAPOD(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	// Serve from cache if available
	if cached, err := c.rdb.Get(ctx, apodCacheKey).Result(); err == nil {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Cache", "HIT")
		w.Write([]byte(cached))
		return
	}

	// Fetch from NASA
	key := c.apiKey
	if key == "" {
		key = "DEMO_KEY"
	}
	url := fmt.Sprintf("https://api.nasa.gov/planetary/apod?api_key=%s", key)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "failed to build request")
		return
	}

	resp, err := c.client.Do(req)
	if err != nil {
		utils.Error(w, http.StatusBadGateway, "NASA API unreachable")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		utils.Error(w, http.StatusBadGateway, fmt.Sprintf("NASA API returned %d", resp.StatusCode))
		return
	}

	var apod map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&apod); err != nil {
		utils.Error(w, http.StatusInternalServerError, "failed to decode NASA response")
		return
	}

	b, _ := json.Marshal(apod)
	// Cache for 12 hours — APOD updates once daily
	c.rdb.Set(ctx, apodCacheKey, string(b), apodCacheTTL)

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Cache", "MISS")
	w.Write(b)
}