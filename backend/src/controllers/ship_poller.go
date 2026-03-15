package controllers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
)

const (
	shipLiveKey      = "ship:live"
	shipStaleSeconds = 600 // ships move slowly; keep for 10 minutes
	aisStreamURL     = "wss://stream.aisstream.io/v0/stream"
)

// ShipRecord uses LiveAircraft-compatible JSON field names.
type ShipRecord struct {
	ID   string  `json:"id"`   // "ship_<mmsi>"
	Name string  `json:"name"` // vessel name
	Lat  float64 `json:"lat"`
	Lon  float64 `json:"lon"`
	Hdg  float64 `json:"hdg,omitempty"` // course over ground
	Vel  float64 `json:"vel,omitempty"` // speed over ground (knots)
	Cat  string  `json:"cat"` // always "ship"
	Grnd bool    `json:"grnd"`
	TS   int64   `json:"ts"`
}

// aisSubscribeMsg is the subscription payload sent to AISStream.
type aisSubscribeMsg struct {
	APIKey       string        `json:"APIkey"`
	BoundingBoxes [][2][2]float64 `json:"BoundingBoxes"`
	FilterMessageTypes []string `json:"FilterMessageTypes"`
}

// aisMessage is a simplified AISStream message envelope.
type aisMessage struct {
	MessageType string          `json:"MessageType"`
	MetaData    aisMetaData     `json:"MetaData"`
	Message     json.RawMessage `json:"Message"`
}

type aisMetaData struct {
	MMSI        uint32  `json:"MMSI"`
	ShipName    string  `json:"ShipName"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	TimeReceived string `json:"time_utc"`
}

type aisPositionReport struct {
	Cog float64 `json:"Cog"` // course over ground
	Sog float64 `json:"Sog"` // speed over ground (knots)
}

// ShipPoller connects to AISStream.io and writes real-time vessel positions to Redis.
type ShipPoller struct {
	rdb    *redis.Client
	apiKey string
}

func NewShipPoller(rdb *redis.Client, apiKey string) *ShipPoller {
	return &ShipPoller{rdb: rdb, apiKey: apiKey}
}

// Start connects to AISStream and processes messages. Call in a goroutine.
func (sp *ShipPoller) Start(ctx context.Context) {
	if sp.apiKey == "" {
		log.Println(`{"level":"info","service":"ship_poller","msg":"AISSTREAM_KEY not set, ship tracking disabled"}`)
		return
	}

	backoff := 5 * time.Second
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		err := sp.connect(ctx)
		if err != nil && ctx.Err() == nil {
			log.Printf(`{"level":"warn","service":"ship_poller","msg":"disconnected","error":%q,"backoff_s":%d}`, err, int(backoff.Seconds()))
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
			}
			if backoff < 5*time.Minute {
				backoff *= 2
			}
		} else {
			backoff = 5 * time.Second
		}
	}
}

func (sp *ShipPoller) connect(ctx context.Context) error {
	dialer := websocket.Dialer{HandshakeTimeout: 15 * time.Second}
	conn, _, err := dialer.DialContext(ctx, aisStreamURL, http.Header{})
	if err != nil {
		return err
	}
	defer conn.Close()

	// Subscribe: all position reports globally
	sub := aisSubscribeMsg{
		APIKey:       sp.apiKey,
		BoundingBoxes: [][2][2]float64{{{-90, -180}, {90, 180}}},
		FilterMessageTypes: []string{"PositionReport"},
	}
	if err := conn.WriteJSON(sub); err != nil {
		return err
	}
	log.Println(`{"level":"info","service":"ship_poller","msg":"connected to AISStream"}`)

	// Prune stale ships every 5 minutes
	pruneTicker := time.NewTicker(5 * time.Minute)
	defer pruneTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-pruneTicker.C:
			sp.pruneStale(ctx)
		default:
		}

		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		_, raw, err := conn.ReadMessage()
		if err != nil {
			return err
		}

		var msg aisMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			continue
		}
		if msg.MessageType != "PositionReport" {
			continue
		}

		var pos aisPositionReport
		if err := json.Unmarshal(msg.Message, &pos); err != nil {
			continue
		}

		meta := msg.MetaData
		if meta.Latitude == 0 && meta.Longitude == 0 {
			continue
		}

		id := "ship_" + formatMMSI(meta.MMSI)
		rec := ShipRecord{
			ID:   id,
			Name: trimShipName(meta.ShipName),
			Lat:  meta.Latitude,
			Lon:  meta.Longitude,
			Hdg:  pos.Cog,
			Vel:  pos.Sog,
			Cat:  "ship",
			TS:   time.Now().Unix(),
		}
		b, err := json.Marshal(rec)
		if err != nil {
			continue
		}
		if err := sp.rdb.HSet(ctx, shipLiveKey, id, string(b)).Err(); err != nil {
			log.Printf(`{"level":"warn","service":"ship_poller","msg":"redis write failed","error":%q}`, err)
		}
	}
}

func (sp *ShipPoller) pruneStale(ctx context.Context) {
	raw, err := sp.rdb.HGetAll(ctx, shipLiveKey).Result()
	if err != nil {
		return
	}
	cutoff := time.Now().Unix() - shipStaleSeconds
	stale := []string{}
	for id, v := range raw {
		var r ShipRecord
		if err := json.Unmarshal([]byte(v), &r); err != nil {
			continue
		}
		if r.TS < cutoff {
			stale = append(stale, id)
		}
	}
	if len(stale) > 0 {
		sp.rdb.HDel(ctx, shipLiveKey, stale...)
		log.Printf(`{"level":"info","service":"ship_poller","msg":"pruned stale ships","count":%d}`, len(stale))
	}
}

func formatMMSI(mmsi uint32) string {
	return fmt.Sprintf("%d", mmsi)
}

func trimShipName(name string) string {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return "Unknown"
	}
	return trimmed
}
