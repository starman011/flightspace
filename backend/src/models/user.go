package models

import (
	"encoding/json"
	"time"
)

// User maps to the users table.
type User struct {
	ID           string          `db:"id"            json:"user_id"`
	Email        string          `db:"email"         json:"email"`
	PasswordHash *string         `db:"password_hash" json:"-"`
	AuthProvider string          `db:"auth_provider" json:"auth_provider"`
	ProviderID   *string         `db:"provider_id"   json:"provider_id,omitempty"`
	DisplayName  *string         `db:"display_name"  json:"display_name,omitempty"`
	Preferences  json.RawMessage `db:"preferences"   json:"preferences,omitempty"`
	CreatedAt    time.Time       `db:"created_at"    json:"created_at"`
	UpdatedAt    time.Time       `db:"updated_at"    json:"updated_at"`
}

// Watchlist maps to the watchlists table.
type Watchlist struct {
	ID        string    `db:"id"         json:"id"`
	UserID    string    `db:"user_id"    json:"user_id"`
	Callsign  *string   `db:"callsign"   json:"callsign,omitempty"`
	ICAO24    *string   `db:"icao24"     json:"icao24,omitempty"`
	Label     *string   `db:"label"      json:"label,omitempty"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
}

// FlightViewHistory maps to the flight_view_history table.
type FlightViewHistory struct {
	ID       string    `db:"id"       json:"id"`
	UserID   string    `db:"user_id"  json:"user_id"`
	ICAO24   string    `db:"icao24"   json:"icao24"`
	Callsign *string   `db:"callsign" json:"callsign,omitempty"`
	ViewedAt time.Time `db:"viewed_at" json:"viewed_at"`
}

// RegisterRequest is the body for POST /api/v1/auth/register.
type RegisterRequest struct {
	Email          string  `json:"email"`
	Password       string  `json:"password"`
	DisplayName    *string `json:"display_name,omitempty"`
	AnonymousToken *string `json:"anonymous_token,omitempty"`
}

// LoginRequest is the body for POST /api/v1/auth/login.
type LoginRequest struct {
	Email          *string `json:"email,omitempty"`
	Password       *string `json:"password,omitempty"`
	Provider       *string `json:"provider,omitempty"`
	OAuthToken     *string `json:"oauth_token,omitempty"`
	AnonymousToken *string `json:"anonymous_token,omitempty"`
}

// AuthResponse is the body returned after successful register/login.
type AuthResponse struct {
	UserID      string    `json:"user_id"`
	Token       string    `json:"token"`
	DisplayName *string   `json:"display_name,omitempty"`
	ExpiresAt   time.Time `json:"expires_at"`
}

// WatchlistAddRequest is the body for POST /api/v1/user/watchlist.
type WatchlistAddRequest struct {
	Callsign *string `json:"callsign,omitempty"`
	ICAO24   *string `json:"icao24,omitempty"`
	Label    *string `json:"label,omitempty"`
}

// PinnedLaunch maps to the pinned_launches table.
type PinnedLaunch struct {
	ID        string     `db:"id"         json:"id"`
	UserID    string     `db:"user_id"    json:"user_id"`
	LaunchID  string     `db:"launch_id"  json:"launch_id"`
	Name      *string    `db:"name"       json:"name,omitempty"`
	NetTime   *time.Time `db:"net_time"   json:"net_time,omitempty"`
	CreatedAt time.Time  `db:"created_at" json:"created_at"`
}

// PinnedLaunchAddRequest is the body for POST /api/v1/user/pinned-launches.
type PinnedLaunchAddRequest struct {
	LaunchID string     `json:"launch_id"`
	Name     *string    `json:"name,omitempty"`
	NetTime  *time.Time `json:"net_time,omitempty"`
}
