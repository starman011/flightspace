package models

import "time"

// WSMessage is the envelope for all WebSocket messages.
type WSMessage struct {
	Type      string      `json:"type"`
	Data      interface{} `json:"data,omitempty"`
	Timestamp time.Time   `json:"timestamp"`
}

// WSSnapshot is the data payload for a "snapshot" message.
type WSSnapshot struct {
	Aircraft []LiveAircraft `json:"aircraft"`
	Count    int            `json:"count"`
}

// WSDelta is the data payload for a "delta" message.
type WSDelta struct {
	Updated []LiveAircraft `json:"updated"`
	Removed []string       `json:"removed"` // icao24 IDs
}

// WSError is the data payload for an "error" message.
type WSError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// WSSetBounds is the client → server payload for "set_bounds".
type WSSetBounds struct {
	NE LatLng `json:"ne"`
	SW LatLng `json:"sw"`
}

// WSClientMessage is an inbound message from a WebSocket client.
type WSClientMessage struct {
	Type string          `json:"type"`
	Data interface{}     `json:"data,omitempty"`
}

// NewWSMessage constructs a server → client message with the current timestamp.
func NewWSMessage(msgType string, data interface{}) WSMessage {
	return WSMessage{
		Type:      msgType,
		Data:      data,
		Timestamp: time.Now().UTC(),
	}
}

// WebSocket message type constants
const (
	WSTypeSnapshot  = "snapshot"
	WSTypeDelta     = "delta"
	WSTypeError     = "error"
	WSTypePong      = "pong"
	WSTypeSetBounds = "set_bounds"
	WSTypePing      = "ping"
)

// WebSocket error codes
const (
	WSErrDataStale     = "DATA_STALE"
	WSErrRateLimited   = "RATE_LIMITED"
	WSErrInternalError = "INTERNAL_ERROR"
)
