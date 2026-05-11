package controllers

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
	"github.com/skydot/backend/src/models"
)

const (
	maxConnections  = 100
	broadcastPeriod = 5 * time.Second
)

// Client represents a connected WebSocket client.
type Client struct {
	hub          *Hub
	conn         *websocket.Conn
	send         chan []byte
	bounds       *models.WSSetBounds // current viewport filter
	watching     string              // object ID currently being viewed (empty = none)
	mu           sync.RWMutex
	msgCount     int64 // messages received in current window
	msgWindowEnd int64 // unix nanoseconds when window resets
}

// Hub manages all active WebSocket connections and broadcasts.
type Hub struct {
	clients    map[*Client]struct{}
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
	connCount  atomic.Int64          // atomic connection counter (race-free)
	rdb        *redis.Client
	lastState  map[string]models.LiveAircraft // last broadcast state for delta computation
	stateMu    sync.RWMutex
	viewers    map[string]int // object ID → viewer count
	viewersMu  sync.RWMutex
}

// NewHub creates a Hub with the given Redis client.
func NewHub(rdb *redis.Client) *Hub {
	return &Hub{
		clients:    make(map[*Client]struct{}),
		register:   make(chan *Client, 16),
		unregister: make(chan *Client, 16),
		rdb:        rdb,
		lastState:  make(map[string]models.LiveAircraft),
		viewers:    make(map[string]int),
	}
}

// Run starts the hub event loop. Call in a goroutine.
func (h *Hub) Run(ctx context.Context) {
	ticker := time.NewTicker(broadcastPeriod)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return

		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = struct{}{}
			h.mu.Unlock()
			h.connCount.Add(1)
			IncrWSConns(1)
			go h.sendSnapshot(client)

		case client := <-h.unregister:
			// Clean up viewer tracking
			client.mu.RLock()
			watchID := client.watching
			client.mu.RUnlock()
			if watchID != "" {
				h.updateViewerCount(watchID, -1, nil)
			}

			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()
			h.connCount.Add(-1)
			IncrWSConns(-1)

		case <-ticker.C:
			h.broadcast(ctx)
		}
	}
}

// Register adds a client to the hub.
func (h *Hub) Register(c *Client) bool {
	if h.connCount.Load() >= maxConnections {
		return false
	}
	h.register <- c
	return true
}

// Unregister removes a client from the hub.
func (h *Hub) Unregister(c *Client) {
	h.unregister <- c
}

// sendSnapshot sends the full current aircraft state to a newly connected client.
func (h *Hub) sendSnapshot(c *Client) {
	defer func() { recover() }() // guard against send on closed channel if client disconnects mid-flight

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	aircraft, err := h.fetchAllAircraft(ctx)
	if err != nil {
		log.Printf(`{"level":"error","service":"hub","msg":"snapshot fetch failed","error":%q}`, err)
		return
	}

	// Filter by viewport if bounds are set
	c.mu.RLock()
	bounds := c.bounds
	c.mu.RUnlock()
	if bounds != nil {
		aircraft = filterByBounds(aircraft, bounds)
	}

	snapshot := models.NewWSMessage(models.WSTypeSnapshot, models.WSSnapshot{
		Aircraft: aircraft,
		Count:    len(aircraft),
	})
	data, err := json.Marshal(snapshot)
	if err != nil {
		return
	}

	select {
	case c.send <- data:
	default:
	}
}

// broadcast computes a delta from last broadcast state and sends to all clients.
func (h *Hub) broadcast(ctx context.Context) {
	aircraft, err := h.fetchAllAircraft(ctx)
	if err != nil {
		log.Printf(`{"level":"error","service":"hub","msg":"broadcast fetch failed","error":%q}`, err)
		return
	}

	SetAircraftCount(int64(len(aircraft)))

	// Build current state map
	current := make(map[string]models.LiveAircraft, len(aircraft))
	for _, a := range aircraft {
		current[a.ID] = a
	}

	h.stateMu.Lock()
	updated, removed := computeDelta(h.lastState, current)
	h.lastState = current
	h.stateMu.Unlock()

	if len(updated) == 0 && len(removed) == 0 {
		return
	}

	delta := models.NewWSMessage(models.WSTypeDelta, models.WSDelta{
		Updated: updated,
		Removed: removed,
	})
	data, err := json.Marshal(delta)
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
		// Apply per-client viewport filter
		c.mu.RLock()
		bounds := c.bounds
		c.mu.RUnlock()

		payload := data
		if bounds != nil {
			filteredUpdated := filterByBounds(updated, bounds)
			filteredDelta := models.NewWSMessage(models.WSTypeDelta, models.WSDelta{
				Updated: filteredUpdated,
				Removed: removed,
			})
			if b, err := json.Marshal(filteredDelta); err == nil {
				payload = b
			}
		}

		select {
		case c.send <- payload:
		default:
			// Client send buffer full — skip this update for this client
		}
	}
}

// fetchAllAircraft reads live aircraft, satellites, and ships from Redis.
func (h *Hub) fetchAllAircraft(ctx context.Context) ([]models.LiveAircraft, error) {
	result := make([]models.LiveAircraft, 0, 8000)

	for _, key := range []string{"aircraft:live", "satellite:live", "ship:live"} {
		raw, err := h.rdb.HGetAll(ctx, key).Result()
		if err != nil {
			continue // don't fail the whole fetch if one hash is missing
		}
		for _, v := range raw {
			var a models.LiveAircraft
			if err := json.Unmarshal([]byte(v), &a); err == nil {
				result = append(result, a)
			}
		}
	}
	return result, nil
}

// computeDelta returns updated aircraft and removed ICAO24 IDs.
func computeDelta(prev, curr map[string]models.LiveAircraft) ([]models.LiveAircraft, []string) {
	updated := []models.LiveAircraft{}
	removed := []string{}

	for id, a := range curr {
		if prev[id].TS != a.TS {
			updated = append(updated, a)
		}
	}
	for id := range prev {
		if _, exists := curr[id]; !exists {
			removed = append(removed, id)
		}
	}
	return updated, removed
}

// filterByBounds returns only aircraft within the given bounding box.
func filterByBounds(aircraft []models.LiveAircraft, b *models.WSSetBounds) []models.LiveAircraft {
	filtered := make([]models.LiveAircraft, 0)
	minLat := min64(b.NE.Lat, b.SW.Lat)
	maxLat := max64(b.NE.Lat, b.SW.Lat)
	minLon := min64(b.NE.Lng, b.SW.Lng)
	maxLon := max64(b.NE.Lng, b.SW.Lng)

	for _, a := range aircraft {
		// Satellites and ships are global — never clip by viewport
		if a.Cat == "satellite" || a.Cat == "ship" {
			filtered = append(filtered, a)
			continue
		}
		if a.Lat >= minLat && a.Lat <= maxLat && a.Lon >= minLon && a.Lon <= maxLon {
			filtered = append(filtered, a)
		}
	}
	return filtered
}

// WatchObject updates a client's watched object and adjusts viewer counts.
func (h *Hub) WatchObject(c *Client, objectID string) {
	c.mu.Lock()
	prev := c.watching
	c.watching = objectID
	c.mu.Unlock()

	if prev == objectID {
		return
	}
	if prev != "" {
		h.updateViewerCount(prev, -1, c)
	}
	if objectID != "" {
		h.updateViewerCount(objectID, 1, c)
	}
}

// updateViewerCount adjusts the viewer count for an object and broadcasts to all watchers.
func (h *Hub) updateViewerCount(objectID string, delta int, exclude *Client) {
	h.viewersMu.Lock()
	h.viewers[objectID] += delta
	count := h.viewers[objectID]
	if count <= 0 {
		delete(h.viewers, objectID)
		count = 0
	}
	h.viewersMu.Unlock()

	msg := models.NewWSMessage(models.WSTypeViewerCount, models.WSViewerCount{
		ObjectID: objectID,
		Count:    count,
	})
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		c.mu.RLock()
		watching := c.watching
		c.mu.RUnlock()
		if watching == objectID {
			select {
			case c.send <- data:
			default:
			}
		}
	}
}

// GetViewerCount returns the current viewer count for an object.
func (h *Hub) GetViewerCount(objectID string) int {
	h.viewersMu.RLock()
	defer h.viewersMu.RUnlock()
	return h.viewers[objectID]
}

func min64(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

func max64(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}
