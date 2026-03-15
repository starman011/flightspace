# Research — SkyDot Flight Radar

---

## 1. Flight Data API Comparison

### OpenSky Network (PRIMARY — Selected)

| Attribute | Details |
|-----------|---------|
| **URL** | `https://opensky-network.org/api/states/all` |
| **Cost** | Free (registration recommended for higher limits) |
| **Rate Limits** | Unauth: ~100/day, Auth: ~4000/day |
| **Data** | ICAO24, callsign, position, altitude, velocity, heading, vertical rate, on_ground |
| **Coverage** | Global, ~5000-10000 aircraft at any time |
| **Latency** | Data refreshes every 10 seconds |
| **Auth** | Basic auth (free registration) |
| **Reliability** | Occasional downtime, community-maintained |
| **Helicopter data** | Included but not separately flagged — must cross-reference ICAO type designators |

**Selection Rationale**: Only truly free API with global coverage and no API key friction. Data quality is sufficient for v1.

### ADS-B Exchange (via RapidAPI) — FALLBACK

| Attribute | Details |
|-----------|---------|
| **URL** | `https://adsbexchange-com1.p.rapidapi.com/v2/lat/lng/dist/` |
| **Cost** | Free tier: 500 requests/month on RapidAPI |
| **Data** | Similar to OpenSky + aircraft type, registration |
| **Limitation** | Area-based queries only (lat/lng/radius), not global |

**Use Case**: Fallback when OpenSky is rate-limited. Limited to geographic queries so not a full replacement.

### Others Evaluated and Rejected

| API | Reason Rejected |
|-----|----------------|
| FlightRadar24 | No official free API; scraping violates ToS |
| FlightAware | Free tier requires commercial license agreement, complex approval |
| AviationStack | Free tier: 100 requests/month — insufficient |
| AeroDataBox (RapidAPI) | Free: 150 requests/month — insufficient |

---

## 2. Map Library Comparison

### Leaflet 1.9 (Selected)

| Attribute | Details |
|-----------|---------|
| **Size** | ~42KB gzipped |
| **License** | BSD-2 (permissive) |
| **Tile sources** | Any tile server (OSM, CartoDB, Mapbox, etc.) |
| **Canvas renderer** | Built-in `L.Canvas` for high-performance marker rendering |
| **React integration** | react-leaflet (~5KB) provides hooks and components |
| **Clustering** | leaflet.markercluster plugin available |
| **Custom markers** | Full Canvas/SVG custom marker support |
| **Mobile** | Touch gestures built-in |

**Selection Rationale**: Smallest bundle, free tiles, canvas renderer handles 5000+ markers, mature ecosystem.

### Alternatives Evaluated

| Library | Size | Why Not |
|---------|------|---------|
| MapLibre GL JS | ~200KB gzip | 5x larger, vector tiles are overkill for v1 |
| Mapbox GL JS | ~200KB + API key | Requires paid account after 50K loads/month |
| Google Maps | ~150KB + API key | Requires billing account, $200/month credit then paid |
| OpenLayers | ~170KB gzip | More powerful but 4x size, steeper learning curve |
| deck.gl | ~300KB | WebGL-based, massive overkill for 2D dot markers |

---

## 3. Free Tile Server Comparison

### CartoDB Positron / DarkMatter (Selected)

| Attribute | Details |
|-----------|---------|
| **Light theme** | `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png` |
| **Dark theme** | `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png` |
| **Cost** | Free for non-commercial; community plan for commercial |
| **Style** | Extremely minimalistic — muted colors, subtle labels |
| **Performance** | CDN-delivered, fast globally |

**Selection Rationale**: The most minimal tile style available — perfect for the newspaper dot-projection aesthetic. Aircraft dots stand out beautifully against the muted background.

### Alternatives

| Provider | Why Not |
|----------|---------|
| OpenStreetMap default | Too colorful and detailed, fights with the minimalist aesthetic |
| Stamen Toner | Great aesthetic but Stamen deprecated their free tile hosting |
| Mapbox | Requires API key and has usage limits |

---

## 4. Free-Tier Database Comparison

### PostgreSQL on Neon (Selected)

| Attribute | Details |
|-----------|---------|
| **Free tier** | 0.5 GB storage, 1 project, autoscaling compute (scales to 0) |
| **PostGIS** | Available on free tier |
| **Connection pooling** | Built-in (PgBouncer) |
| **Cold start** | ~500ms after scaling to 0 (mitigated by health check keepalive) |
| **Branching** | Database branching for dev/staging |

### Alternatives Evaluated

| Option | Why Not |
|--------|---------|
| Supabase | 500MB free, but adds overhead (REST API layer we don't need) |
| MongoDB Atlas | 512MB free. Flight data is relational (aircraft→positions). No geospatial partitioning. Schema flexibility not needed — our schema is well-defined. |
| PlanetScale (MySQL) | Removed free tier in 2024 |
| CockroachDB | 10GB free but distributed DB is overkill. Higher query latency. |
| SQLite | Cannot share across multiple backend instances when scaling |

---

## 5. Redis Provider Comparison

### Upstash (Selected)

| Attribute | Details |
|-----------|---------|
| **Free tier** | 10K commands/day, 256MB storage |
| **Protocol** | REST API + native Redis protocol |
| **Global** | Edge deployment available |
| **Persistence** | Durable (not ephemeral) |

**Concern**: 10K commands/day is tight. Mitigation:
- Pipeline all Redis operations (1 pipeline = 1 command regardless of ops)
- Each poll cycle: 1 pipeline (HSET all aircraft) + 1 PUBLISH = ~2 commands
- 5760 polls/day × 2 = ~11.5K. Close to limit.
- **Alternative**: Use Railway's Redis add-on if Upstash limit is hit.

---

## 6. Backend Hosting Comparison

### Railway (Selected)

| Attribute | Details |
|-----------|---------|
| **Free tier** | $5 credit/month (~500 hours at base tier) |
| **Deployment** | Dockerfile or Nixpack auto-detect |
| **WebSocket** | Fully supported |
| **Redis add-on** | Available if Upstash insufficient |
| **Networking** | Public URL with custom domain support |

### Alternatives

| Provider | Why Not (for now) |
|----------|-------------------|
| Fly.io | 3 free shared VMs — good alternative if Railway hours run out |
| Render | Free tier spins down after 15 min inactivity (breaks WebSocket) |
| Vercel | Serverless only — not suitable for persistent WebSocket connections |
| Cloudflare Workers | No native WebSocket server (Durable Objects add complexity) |

---

## 7. Dot-Projection / Halftone Design Research

### Visual References

The NYC newspaper halftone style is characterized by:
- **Ben-Day dots**: Patterns of dots used to create shading and tone
- **High contrast**: Black dots on white (or inverse for dark mode)
- **Visible texture**: The dot pattern itself is part of the aesthetic
- **Limited palette**: Usually monochrome or duotone

### Aircraft Glyph Design Approach

```
PLANE (dot with directional tail):
    ●→    (heading East)
    ●↑    (heading North)

HELICOPTER (dot with cross):
    ✚     (stationary / slower threshold)
    ✚→    (moving with heading)

ON GROUND:
    ○     (hollow dot — parked/taxiing)

STALE:
    ·     (fading dot)
```

**Implementation**: Canvas-based custom markers on Leaflet. Each glyph is drawn programmatically (not images) for:
- Resolution independence (crisp at all zoom levels)
- Dynamic rotation based on heading
- Smooth fade animations for stale aircraft
- Minimal memory (no sprite sheets)

### Color Palette

```css
/* Light theme (newspaper) */
--bg: #F5F0E8;           /* Aged newsprint */
--dot-primary: #1A1A1A;   /* Ink black */
--dot-accent: #8B0000;    /* Red accent for selected */
--text: #2C2C2C;
--text-muted: #6B6B6B;
--grid: #D4CFC4;          /* Subtle grid lines */

/* Dark theme (inverted newsprint) */
--bg: #1A1A1A;
--dot-primary: #E8E0D0;
--dot-accent: #FF4444;
--text: #D4CFC4;
--text-muted: #6B6B6B;
--grid: #2C2C2C;
```

### Typography

Recommended: **Space Mono** (Google Fonts, free) — monospace typewriter feel that matches newspaper aesthetic. Fallback: `"Courier New", monospace`.

---

## 8. Helicopter Detection Strategy

OpenSky Network does NOT flag aircraft as helicopters. Detection strategy:

1. **ICAO Type Designator Cross-Reference**: Maintain a static JSON mapping of ICAO type codes that are helicopters (e.g., `H60` = Black Hawk, `EC35` = EC135, `B06` = Bell 206).
2. **Source**: FAA aircraft database + ICAO Doc 8643 (publicly available).
3. **Accuracy**: High for known types; unknown types default to "plane."
4. **Update frequency**: Static file updated quarterly or as needed.
5. **Size**: ~500 helicopter type codes, <10KB as JSON.
