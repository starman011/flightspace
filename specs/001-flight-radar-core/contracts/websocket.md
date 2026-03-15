# WebSocket & External API Contracts — SkyDot

---

## 1. WebSocket Contract

### Connection

```
URL: wss://api.skydot.app/ws?token=<session_token>
```

### Message Format

All messages are JSON with a `type` field:

```json
{
    "type": "<event_type>",
    "data": { ... },
    "timestamp": "2025-01-15T10:30:00Z"
}
```

---

### Server → Client

#### `snapshot`

Sent immediately after connection. Full state of all tracked aircraft.

```json
{
    "type": "snapshot",
    "data": {
        "aircraft": [
            {
                "id": "a1b2c3",
                "cs": "UAL123",
                "lat": 40.6413,
                "lon": -73.7781,
                "alt": 35000,
                "vel": 450,
                "hdg": 270.5,
                "vr": 0,
                "grnd": false,
                "cat": "plane",
                "ctry": "United States"
            }
        ],
        "count": 3200
    },
    "timestamp": "2025-01-15T10:30:00Z"
}
```

**Note**: Field names are abbreviated to minimize WebSocket payload size.

**Aircraft field definitions:**

| Field | Full name | Type | Unit | Nullable |
|-------|-----------|------|------|----------|
| `id` | icao24 | string | — | No |
| `cs` | callsign | string | — | Yes |
| `lat` | latitude | number | degrees | No |
| `lon` | longitude | number | degrees | No |
| `alt` | baro_altitude | number | feet | Yes (null if on ground) |
| `vel` | velocity | number | knots | Yes |
| `hdg` | heading | number | degrees (0–360) | Yes |
| `vr` | vertical_rate | number | ft/min | Yes |
| `grnd` | on_ground | boolean | — | No |
| `cat` | category | string | `"plane"` \| `"helicopter"` | No |
| `ctry` | origin_country | string | — | Yes |

---

#### `delta`

Sent every ~5 seconds. Only changed/new and removed aircraft.

```json
{
    "type": "delta",
    "data": {
        "updated": [
            {
                "id": "a1b2c3",
                "cs": "UAL123",
                "lat": 40.6500,
                "lon": -73.7600,
                "alt": 35100,
                "vel": 452,
                "hdg": 271.0,
                "vr": 100,
                "grnd": false
            }
        ],
        "removed": ["d4e5f6"]
    },
    "timestamp": "2025-01-15T10:30:05Z"
}
```

**Notes**:
- `updated` contains only changed aircraft with only changed fields
  (always includes `id`, `lat`, `lon`, `timestamp`)
- `removed` contains `id` (icao24) strings for aircraft silent > 120s or outside bounds

---

#### `error`

Server-side error notification.

```json
{
    "type": "error",
    "data": {
        "code": "DATA_STALE",
        "message": "Flight data source temporarily unavailable. Showing last known positions."
    },
    "timestamp": "2025-01-15T10:30:00Z"
}
```

**Error codes**: `DATA_STALE`, `RATE_LIMITED`, `INTERNAL_ERROR`

---

#### `pong`

Response to client `ping`.

```json
{
    "type": "pong",
    "timestamp": "2025-01-15T10:30:00Z"
}
```

---

### Client → Server

#### `set_bounds`

Update viewport bounds to filter aircraft by geographic area.

```json
{
    "type": "set_bounds",
    "data": {
        "ne": { "lat": 42.0, "lng": -71.0 },
        "sw": { "lat": 39.0, "lng": -76.0 }
    }
}
```

---

#### `ping`

Keepalive (send every 30s if no other messages).

```json
{
    "type": "ping"
}
```

---

## 2. OpenSky Network API Contract (External)

### GET `https://opensky-network.org/api/states/all`

**Auth**: Basic auth (free registered account for higher rate limits)

**Response:**
```json
{
    "time": 1700000000,
    "states": [
        [
            "a1b2c3",        // [0]  icao24
            "UAL123 ",       // [1]  callsign (may have trailing spaces)
            "United States", // [2]  origin_country
            1700000000,      // [3]  time_position
            1700000000,      // [4]  last_contact
            -73.7781,        // [5]  longitude
            40.6413,         // [6]  latitude
            10668.0,         // [7]  baro_altitude (meters)
            false,           // [8]  on_ground
            231.5,           // [9]  velocity (m/s)
            270.5,           // [10] heading (degrees)
            0.0,             // [11] vertical_rate (m/s)
            null,            // [12] sensors
            10972.0,         // [13] geo_altitude (meters)
            "1234",          // [14] squawk
            false,           // [15] spi
            0                // [16] position_source
        ]
    ]
}
```

**Rate Limits:**
- Unauthenticated: ~100 requests/day
- Authenticated (free): ~4000 requests/day (~2.8 req/min)
- Our poll interval: 15 seconds = ~5760/day → **must use authenticated**

**Unit Conversions (backend responsibility):**
- Altitude: meters → feet (× 3.28084)
- Velocity: m/s → knots (× 1.94384)
- Vertical rate: m/s → ft/min (× 196.85)
