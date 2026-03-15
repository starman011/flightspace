package models

import "time"

// Aircraft maps to the aircraft_static table — static metadata about an aircraft.
type Aircraft struct {
	ICAO24          string    `db:"icao24"           json:"icao24"`
	Registration    *string   `db:"registration"     json:"registration,omitempty"`
	TypeCode        *string   `db:"type_code"        json:"type_code,omitempty"`
	TypeDescription *string   `db:"type_description" json:"type_description,omitempty"`
	OperatorICAO    *string   `db:"operator_icao"    json:"operator_icao,omitempty"`
	OperatorName    *string   `db:"operator_name"    json:"operator_name,omitempty"`
	Owner           *string   `db:"owner"            json:"owner,omitempty"`
	IsHelicopter    bool      `db:"is_helicopter"    json:"is_helicopter"`
	LastUpdated     time.Time `db:"last_updated"     json:"last_updated"`
}

// AircraftPosition maps to the aircraft_positions table — a single position snapshot.
type AircraftPosition struct {
	ID             int64     `db:"id"              json:"id"`
	ICAO24         string    `db:"icao24"          json:"icao24"`
	Callsign       *string   `db:"callsign"        json:"callsign,omitempty"`
	Longitude      float64   `db:"longitude"       json:"longitude"`
	Latitude       float64   `db:"latitude"        json:"latitude"`
	BaroAltitude   *float64  `db:"baro_altitude"   json:"altitude,omitempty"`
	GeoAltitude    *float64  `db:"geo_altitude"    json:"geo_altitude,omitempty"`
	Velocity       *float64  `db:"velocity"        json:"velocity,omitempty"`
	Heading        *float64  `db:"heading"         json:"heading,omitempty"`
	VerticalRate   *float64  `db:"vertical_rate"   json:"vertical_rate,omitempty"`
	OnGround       bool      `db:"on_ground"       json:"on_ground"`
	OriginCountry  *string   `db:"origin_country"  json:"origin_country,omitempty"`
	Squawk         *int      `db:"squawk"          json:"squawk,omitempty"`
	PositionSource int       `db:"position_source" json:"position_source"`
	TimePosition   time.Time `db:"time_position"   json:"timestamp"`
	ReceivedAt     time.Time `db:"received_at"     json:"received_at"`
}

// LiveAircraft is the abbreviated struct used in Redis and WebSocket payloads.
// Field names are intentionally short to minimise payload size.
type LiveAircraft struct {
	ID       string   `json:"id"`              // icao24 / satellite id / mmsi
	Callsign *string  `json:"cs,omitempty"`    // callsign
	Name     *string  `json:"name,omitempty"`  // display name (satellites / ships)
	Lat      float64  `json:"lat"`
	Lon      float64  `json:"lon"`
	Alt      *float64 `json:"alt,omitempty"`   // baro_altitude (feet) — aircraft only
	AltKm    *float64 `json:"alt_km,omitempty"`// orbital altitude (km) — satellites only
	Vel      *float64 `json:"vel,omitempty"`   // velocity (knots / km/s)
	Hdg      *float64 `json:"hdg,omitempty"`   // heading / course (degrees)
	VR       *float64 `json:"vr,omitempty"`    // vertical_rate (ft/min)
	Grnd     bool     `json:"grnd"`            // on_ground
	Cat      string   `json:"cat"`             // "plane"|"helicopter"|"satellite"|"ship"
	Ctry     *string  `json:"ctry,omitempty"`  // origin_country
	TS       int64    `json:"ts"`              // unix timestamp of last position
}

// AircraftDetailResponse is the full response for GET /aircraft/:icao24
type AircraftDetailResponse struct {
	ICAO24          string              `json:"icao24"`
	Callsign        *string             `json:"callsign,omitempty"`
	Registration    *string             `json:"registration,omitempty"`
	TypeCode        *string             `json:"type_code,omitempty"`
	TypeDescription *string             `json:"type_description,omitempty"`
	Operator        *string             `json:"operator,omitempty"`
	IsHelicopter    bool                `json:"is_helicopter"`
	Current         *CurrentPosition    `json:"current,omitempty"`
	Trail           []TrailPoint        `json:"trail"`
}

// CurrentPosition is the live position subset of AircraftDetailResponse.
type CurrentPosition struct {
	Latitude     float64   `json:"latitude"`
	Longitude    float64   `json:"longitude"`
	Altitude     *float64  `json:"altitude,omitempty"`
	Velocity     *float64  `json:"velocity,omitempty"`
	Heading      *float64  `json:"heading,omitempty"`
	VerticalRate *float64  `json:"vertical_rate,omitempty"`
	OnGround     bool      `json:"on_ground"`
	Timestamp    time.Time `json:"timestamp"`
}

// TrailPoint is one position in the recent flight trail.
type TrailPoint struct {
	Latitude  float64   `json:"latitude"`
	Longitude float64   `json:"longitude"`
	Altitude  *float64  `json:"altitude,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}

// SearchResult is one item in the search response.
type SearchResult struct {
	ICAO24          string   `json:"icao24"`
	Callsign        *string  `json:"callsign,omitempty"`
	TypeDescription *string  `json:"type_description,omitempty"`
	Operator        *string  `json:"operator,omitempty"`
	Latitude        float64  `json:"latitude"`
	Longitude       float64  `json:"longitude"`
	Altitude        *float64 `json:"altitude,omitempty"`
	OnGround        bool     `json:"on_ground"`
}
