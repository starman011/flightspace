# REST API Contracts — SkyDot

### Base URL

```
Production: https://api.skydot.app/api/v1
Development: http://localhost:8080/api/v1
```

### Common Headers

```
Content-Type: application/json
X-Session-Token: <session_token>    (required for Session-auth endpoints)
Authorization: Bearer <jwt_token>    (required for Auth endpoints)
```

### Common Error Response

```json
{
    "error": {
        "code": "VALIDATION_ERROR",
        "message": "Human-readable description",
        "details": {}
    }
}
```

**Error Codes:**

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `UNAUTHORIZED` | 401 | Missing or invalid session/token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource does not exist |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

---

### GET `/health`

**Auth**: None

**Response 200:**
```json
{
    "status": "ok",
    "services": {
        "database": "ok",
        "redis": "ok",
        "opensky": "ok"
    },
    "uptime_seconds": 3600,
    "version": "1.0.0"
}
```

---

### GET `/metrics`

**Auth**: None

**Response 200:**
```json
{
    "websocket_connections": 42,
    "aircraft_tracked": 3200,
    "cache_hit_rate": 0.95,
    "opensky_last_poll": "2025-01-15T10:30:00Z",
    "opensky_poll_latency_ms": 850,
    "db_pool_active": 5,
    "db_pool_idle": 15
}
```

---

### POST `/session`

Creates an anonymous session. Called automatically by frontend on first load.

**Auth**: None

**Request Body**: None (empty or `{}`)

**Response 201:**
```json
{
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "token": "skd_anon_a1b2c3d4e5f6...",
    "expires_at": "2025-02-14T10:30:00Z"
}
```

**Set-Cookie Header:**
```
skydot_session=skd_anon_a1b2c3d4e5f6...; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000
```

---

### GET `/aircraft/:icao24`

Returns aircraft static info + recent position trail.

**Auth**: Session (anonymous or authenticated)

**Path Params:**

| Param | Type | Description |
|-------|------|-------------|
| `icao24` | string | ICAO 24-bit hex address (e.g., "a1b2c3") |

**Query Params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `trail_minutes` | int | 30 | Minutes of trail data to include (max 120) |

**Response 200:**
```json
{
    "icao24": "a1b2c3",
    "callsign": "UAL123",
    "registration": "N12345",
    "type_code": "B738",
    "type_description": "Boeing 737-800",
    "operator": "United Airlines",
    "is_helicopter": false,
    "current": {
        "latitude": 40.6413,
        "longitude": -73.7781,
        "altitude": 35000,
        "velocity": 450,
        "heading": 270.5,
        "vertical_rate": 0,
        "on_ground": false,
        "timestamp": "2025-01-15T10:30:00Z"
    },
    "trail": [
        {
            "latitude": 40.65,
            "longitude": -73.70,
            "altitude": 34800,
            "timestamp": "2025-01-15T10:29:00Z"
        }
    ]
}
```

**Response 404:**
```json
{
    "error": {
        "code": "NOT_FOUND",
        "message": "Aircraft not found or not currently tracked"
    }
}
```

---

### GET `/aircraft/search`

Search for aircraft by callsign or flight number.

**Auth**: Session

**Query Params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `q` | string | Yes | Search query (min 2 chars) |
| `limit` | int | No | Max results (default 10, max 50) |

**Response 200:**
```json
{
    "results": [
        {
            "icao24": "a1b2c3",
            "callsign": "UAL123",
            "type_description": "Boeing 737-800",
            "operator": "United Airlines",
            "latitude": 40.6413,
            "longitude": -73.7781,
            "altitude": 35000,
            "on_ground": false
        }
    ],
    "total": 1
}
```

---

### POST `/auth/register`

**Auth**: None (but session token recommended for migration)

**Request Body:**
```json
{
    "email": "user@example.com",
    "password": "securepassword123",
    "display_name": "John",
    "anonymous_token": "skd_anon_a1b2c3..."
}
```

**Validation:**
- `email`: valid email format, unique
- `password`: min 8 chars
- `display_name`: optional, max 100 chars
- `anonymous_token`: optional, for session migration

**Response 201:**
```json
{
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "expires_at": "2025-01-22T10:30:00Z"
}
```

---

### POST `/auth/login`

**Auth**: None

**Request Body (email/password):**
```json
{
    "email": "user@example.com",
    "password": "securepassword123",
    "anonymous_token": "skd_anon_a1b2c3..."
}
```

**Request Body (OAuth):**
```json
{
    "provider": "google",
    "oauth_token": "ya29.a0AfH6SM...",
    "anonymous_token": "skd_anon_a1b2c3..."
}
```

**Response 200:**
```json
{
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "display_name": "John",
    "expires_at": "2025-01-22T10:30:00Z"
}
```

---

### POST `/auth/logout`

**Auth**: Authenticated

**Response 200:**
```json
{
    "session_token": "skd_anon_new_token...",
    "message": "Logged out. New anonymous session created."
}
```

---

### GET `/user/watchlist`

**Auth**: Authenticated

**Response 200:**
```json
{
    "items": [
        {
            "id": "550e8400-...",
            "callsign": "UAL123",
            "icao24": "a1b2c3",
            "label": "My flight home",
            "created_at": "2025-01-15T10:30:00Z"
        }
    ]
}
```

---

### POST `/user/watchlist`

**Auth**: Authenticated

**Request Body:**
```json
{
    "callsign": "UAL123",
    "icao24": "a1b2c3",
    "label": "My flight home"
}
```

**Response 201:**
```json
{
    "id": "550e8400-...",
    "callsign": "UAL123",
    "icao24": "a1b2c3",
    "label": "My flight home",
    "created_at": "2025-01-15T10:30:00Z"
}
```

---

### DELETE `/user/watchlist/:id`

**Auth**: Authenticated

**Response 204**: No content

---

### PUT `/user/preferences`

**Auth**: Authenticated (also works with anonymous session for session prefs)

**Request Body:**
```json
{
    "map_center": { "lat": 40.7128, "lng": -74.006 },
    "map_zoom": 6,
    "filters": {
        "aircraft_type": "planes",
        "altitude_range": "high"
    },
    "theme": "dark"
}
```

**Response 200:**
```json
{
    "preferences": { "..." : "..." },
    "updated_at": "2025-01-15T10:30:00Z"
}
```
