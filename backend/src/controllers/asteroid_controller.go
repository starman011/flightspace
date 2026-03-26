package controllers

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/skydot/backend/src/utils"
)

// AsteroidController serves asteroid data from Redis.
type AsteroidController struct {
	rdb *redis.Client
}

func NewAsteroidController(rdb *redis.Client) *AsteroidController {
	return &AsteroidController{rdb: rdb}
}

// GetAsteroids returns all near-earth objects stored by the NEO poller,
// sorted by miss distance (closest first).
func (c *AsteroidController) GetAsteroids(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	raw, err := c.rdb.HGetAll(ctx, "asteroid:live").Result()
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "failed to fetch asteroids")
		return
	}

	asteroids := make([]AsteroidLive, 0, len(raw))
	for _, v := range raw {
		var a AsteroidLive
		if err := json.Unmarshal([]byte(v), &a); err == nil {
			asteroids = append(asteroids, a)
		}
	}

	// Sort by miss distance ascending (closest approach first)
	sort.Slice(asteroids, func(i, j int) bool {
		return asteroids[i].MissDistanceKM < asteroids[j].MissDistanceKM
	})

	utils.JSON(w, http.StatusOK, map[string]interface{}{
		"asteroids": asteroids,
		"count":     len(asteroids),
	})
}
