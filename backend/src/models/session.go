package models

import (
	"encoding/json"
	"time"
)

// AnonymousSession maps to the anonymous_sessions table.
type AnonymousSession struct {
	ID           string          `db:"id"            json:"session_id"`
	SessionToken string          `db:"session_token" json:"token"`
	Preferences  json.RawMessage `db:"preferences"   json:"preferences,omitempty"`
	CreatedAt    time.Time       `db:"created_at"    json:"created_at"`
	LastSeenAt   time.Time       `db:"last_seen_at"  json:"last_seen_at"`
	ExpiresAt    time.Time       `db:"expires_at"    json:"expires_at"`
}

// UserSession maps to the user_sessions table.
type UserSession struct {
	ID           string    `db:"id"            json:"id"`
	UserID       string    `db:"user_id"       json:"user_id"`
	SessionToken string    `db:"session_token" json:"token"`
	IPAddress    *string   `db:"ip_address"    json:"ip_address,omitempty"`
	UserAgent    *string   `db:"user_agent"    json:"user_agent,omitempty"`
	CreatedAt    time.Time `db:"created_at"    json:"created_at"`
	ExpiresAt    time.Time `db:"expires_at"    json:"expires_at"`
}

// SessionContext is stored in Redis and attached to each request context.
type SessionContext struct {
	ID          string          `json:"id"`
	Type        string          `json:"type"` // "anonymous" | "user"
	UserID      *string         `json:"user_id,omitempty"`
	Preferences json.RawMessage `json:"prefs,omitempty"`
}

// SessionCreateResponse is the body returned by POST /api/v1/session.
type SessionCreateResponse struct {
	SessionID string    `json:"session_id"`
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
}

// UserPreferences holds the preference JSONB schema.
type UserPreferences struct {
	MapCenter *LatLng           `json:"map_center,omitempty"`
	MapZoom   int               `json:"map_zoom,omitempty"`
	Filters   *PreferenceFilter `json:"filters,omitempty"`
	Theme     string            `json:"theme,omitempty"` // "light" | "dark"
}

type LatLng struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

type PreferenceFilter struct {
	AircraftType  string `json:"aircraft_type,omitempty"`  // "all" | "planes" | "helicopters"
	AltitudeRange string `json:"altitude_range,omitempty"` // "all" | "low" | "mid" | "high"
}
