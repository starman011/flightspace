# SkyDot

A real-time planetary observatory. One viewport that scales from individual aircraft to the entire solar system — tracking every commercial flight, satellite, ship, rocket launch, and near-Earth asteroid in motion right now.

---

## What it tracks

| Object | Data Source | Update Rate |
|--------|-------------|-------------|
| Commercial flights | ADS-B via adsb.lol | 15 s |
| Satellites (ISS, Starlink, GPS, NOAA…) | CelesTrak TLE + SGP4 | 30 s |
| ISS live position | wheretheiss.at | 5 s |
| AIS maritime vessels | AISStream.io | live |
| Rocket launches | Launch Library 2 | 15 min |
| Near-Earth asteroids | NASA NeoWs | 1 hr |
| Planet positions | NASA Horizons | 5 min |
| Space weather (Kp index) | NOAA SWPC | 10 min |
| Astronomy Picture of the Day | NASA APOD | 24 hr |
| Space news | Spaceflight News API | on-demand |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         CLIENT (Vercel)                      │
│                                                              │
│  React 18 + Vite                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  Globe.jsx  │  │ useWebSocket │  │  useAircraft       │  │
│  │  Three.js   │◄─│  WS client   │◄─│  delta reducer     │  │
│  │  WebGL      │  │  + backoff   │  │  + stale pruner    │  │
│  └─────────────┘  └──────────────┘  └────────────────────┘  │
│         │                                                    │
│   URL router (React Router v7) — state ↔ URL sync           │
└──────────────────────────────────────────────────────────────┘
                          │  WSS + HTTPS
                          ▼
┌──────────────────────────────────────────────────────────────┐
│                       BACKEND (Railway)                      │
│                                                              │
│  Go 1.22 · net/http · gorilla/websocket                      │
│                                                              │
│  ┌─────────┐    ┌────────────────────────────────────┐      │
│  │  HTTP   │    │         WebSocket Hub               │      │
│  │  API    │    │  register · broadcast · set_bounds  │      │
│  └────┬────┘    └──────────────┬─────────────────────┘      │
│       │                        │ fan-out deltas              │
│       │         ┌──────────────▼──────────────────┐         │
│       │         │           Redis 7               │         │
│       │         │  aircraft:live  (HSET per ICAO) │         │
│       │         │  satellite:live (HSET per ID)   │         │
│       │         │  launches · asteroids · solar   │         │
│       │         └─────────────────────────────────┘         │
│       │                                                      │
│       │         ┌─────────────────────────────────┐         │
│       └────────►│        PostgreSQL 16             │         │
│                 │  aircraft_positions (trail)      │         │
│                 │  aircraft_static   (metadata)   │         │
│                 │  anonymous_sessions              │         │
│                 └─────────────────────────────────┘         │
│                                                              │
│  Background goroutines (one per data source):               │
│  Aircraft · Satellite · Ship · Solar · NEO · ISS · Launch   │
└──────────────────────────────────────────────────────────────┘
                          │
               Cloudflare (TLS proxy + CDN)
```

---

## System architecture — deep dive

### Pattern: Modular monolith

SkyDot is a **modular monolith**, not a microservices system. A single Go binary contains all server-side logic — the WebSocket hub, every data-source poller, the REST API, authentication, and cleanup — wired together in `app.go` and started as a single process on Railway.

This was a deliberate choice, not an oversight:

| | Microservices | SkyDot monolith |
|---|---|---|
| Operational overhead | High — N deployments, N logs, service mesh | One binary, one Railway service, one log stream |
| Data locality | Cross-service calls for shared state | All pollers write to the same Redis instance in-process |
| Latency | Network hop between services | Zero — hub fan-out is an in-process channel write |
| Free-tier fit | Multiple always-on services burn quota fast | One Railway instance covers everything |
| Scalability ceiling | Horizontal per service | Vertical + a future hub-per-region split when needed |

The code is still **modular** — each poller (`aircraft.go`, `satellite_poller.go`, `solar_poller.go`, etc.) is an isolated struct with its own ticker and context. Adding or removing a data source is a two-line change in `app.go`. The monolith boundary is deployment, not design.

---

### Data flow — end to end

```
External APIs                 Backend process                    Browser
─────────────                 ───────────────                    ───────
adsb.lol ──────── every 15s ──► AircraftPoller
CelesTrak TLE ──── every 30s ──► SatellitePoller   ─► Redis HSET ──► Hub.broadcast()
wheretheiss.at ─── every  5s ──► ISSPoller                           │
AISStream.io ────── live WS ──► ShipPoller         ─► Redis HSET ──► │
NASA Horizons ───── every 5m ──► SolarPoller                          │
NASA NeoWs ────── every  1hr ──► NEOPoller         ─► Redis HSET ──► │
Launch Library 2 ─ every 15m ──► LaunchPoller                         │
                                                                       │
                                 Hub.Run() ◄────────── register(client)│
                                     │                               │ ▲
                                  fan-out deltas                     │ │ WS upgrade
                                     │                               │ │ JWT check
                                     ▼                               │ │
                              per-client goroutine ─── WS write ─────┘ │
                                                                        │
                               REST API (net/http) ◄─── HTTP ──────────┘
                                     │
                                PostgreSQL (trail, metadata, sessions)
```

**Every poller is a goroutine.** They run concurrently with independent tickers. When a poller fetches new data it writes to Redis — the Hub's read loop detects the change and broadcasts a delta to all connected clients that have the object in their viewport bounds.

---

### WebSocket hub — goroutine model

Each connected browser gets **two dedicated goroutines**:

- **readPump** — reads client messages (`set_bounds`, `ping`). Runs until the connection drops.
- **writePump** — dequeues messages from a buffered channel and writes to the socket. Has a 10-second write deadline to kill stale connections fast.

The Hub itself runs a single **coordinator goroutine** (`hub.Run(ctx)`) that owns the client registry. All register/unregister and broadcast operations go through a channel to avoid mutex contention on the registry map:

```
hub.register   ─► chan *Client ─► hub.Run() ─► clients[c] = bounds
hub.unregister ─► chan *Client ─► hub.Run() ─► delete(clients, c)
hub.broadcast  ─► chan []byte  ─► hub.Run() ─► for each client: c.send <- msg
```

This is the standard gorilla/websocket **read/write pump pattern** extended with a bounds filter — the broadcast loop skips any client whose registered bounding box doesn't intersect the delta's objects.

---

### Storage responsibilities

| Store | What lives there | Why |
|-------|-----------------|-----|
| **Redis** | Live aircraft positions, satellite positions, ship positions, planet positions, asteroid cache, launch cache | O(1) HSET reads, TTL-based expiry, zero schema migration for fast-changing data |
| **PostgreSQL** | `aircraft_positions` trail (last N hours), `aircraft_static` metadata, `anonymous_sessions` | Durable, queryable, supports trail rendering and ICAO lookups |

Redis acts as the **live state store** — every poller writes there, and the Hub reads from there to build deltas. PostgreSQL is the **audit and trail store** — the aircraft poller additionally appends each position batch to `aircraft_positions` for trail rendering in `DetailPanel`.

A cleanup goroutine runs hourly and deletes `aircraft_positions` older than `RETENTION_HOURS` (default 6 hours) and expired sessions.

---

### Frontend architecture

The frontend is a **single-page application** with one full-viewport canvas (`Globe.jsx` → Three.js) and layered UI panels that sit on top in CSS. There is no page reload — navigation between Earth view, launches, and asteroids is React Router state.

```
App.jsx  (router, session, WebSocket lifecycle)
  │
  ├── Globe.jsx              Three.js scene — aircraft, satellites, tiles, solar system
  │     └── useAircraft.js  State map + delta reducer + viewport filter
  │     └── useWebSocket.js WS connect / reconnect / BFCache guard
  │
  ├── CommandCenterOverlay   Right panel (desktop) / bottom sheet (mobile)
  │     └── SmartStack       Horizontal swipe panel switcher
  │           └── panels:    Solar, Meteors, Planets, Kp, APOD, News
  │
  ├── DetailPanel            Per-flight trail + live data
  ├── LaunchPanel            Rocket manifest (/launches route)
  ├── DeepSpacePanel         NEO viewer (/asteroids route)
  ├── OrbitalMapBar          Desktop filter dock
  ├── FilterRail             Left sidebar filters
  ├── HUD                    Altitude + camera scale bar
  └── StatusBar              Connection state + search
```

State is local to hooks — there is no global store (no Redux, no Zustand). The aircraft `Map<icao24, aircraft>` lives in `useAircraft.js` and is passed down as props. Everything else is component-local `useState`.

---

### Why this stack

**Go for the backend** — not because it's trendy, but because the workload is exactly what Go excels at: thousands of concurrent WebSocket connections, each a lightweight goroutine, with no shared mutable state between them. The alternative (Node.js) would require more careful async juggling and significantly more memory per connection. Python was never in contention — the poller tick latency and GIL would hurt.

**`net/http` directly, no framework** — Go's stdlib router is fast and predictable. There are only ~12 routes; a framework would add indirection without benefit. Every dependency is intentional: `pgx` (typed Postgres, no ORM reflection), `go-redis` (thin wrapper around the RESP protocol), `gorilla/websocket` (the only mature WS library in Go), `golang-jwt` (stateless auth).

**React 18 + Vite** — Concurrent mode's `startTransition` and `Suspense` are actively used (lazy-loaded Globe, Suspense-safe navigation). Vite's build is fast enough that the full production bundle rebuilds in under 2 seconds. No Next.js — there's no SSR benefit for a real-time canvas app; adding a server layer would only slow cold-start without improving anything visible.

**Three.js over a mapping library** — Leaflet/Mapbox render a 2D tile map. Three.js renders a 3D rotating globe, a solar system, and 12,000 instanced meshes in one WebGL context. The scene switches between Earth and solar system without a page load or a second canvas. A mapping library can't do this.

**Redis over in-memory Go maps** — Live positions need to survive backend restarts without clients seeing a blank globe. Redis HSET gives O(1) field-level writes per ICAO, automatic TTL eviction for aircraft that stop broadcasting, and a clean separation between the poller goroutines (writers) and the Hub (reader). If we later need multiple Hub instances, Redis already works as a pub-sub bus.

**Railway + Vercel + Cloudflare** — All free tier on current traffic. Railway runs the persistent Go process and the managed PostgreSQL + Redis add-ons. Vercel hosts the static frontend with global edge CDN. Cloudflare sits in front of both for DDoS protection and TLS. The entire production stack costs $0/month at current scale.

---

## Engineering decisions, by problem

### Rendering 12,000 aircraft without frame drops
**Technique: GPU instanced rendering + single-draw-call pick geometry**

Each aircraft category (plane, heavy regional, helicopter, satellite, ship) gets its own Three.js `InstancedMesh`. All instances share one shader program and one draw call per category — the GPU handles per-instance transforms. Position buffers use `DynamicDrawUsage` so WebGL keeps them in fast-path memory for frequent writes. Module-level scratch `Vector3` and `Matrix4` objects are reused every frame to eliminate GC pauses during the render loop.

For click detection a parallel flat `Points` geometry mirrors every aircraft position. Only one raycasting pass runs per click — against points, not meshes — which is orders of magnitude cheaper than intersecting 12,000 mesh instances.

### Picking the right aircraft when dots overlap
**Technique: Screen-space closest-point disambiguation**

Three.js `Raycaster.intersectObject` returns all hits sorted by depth along the ray — which means a nearby aircraft that happens to be behind the cursor on the z-axis wins. Instead, every hit's 3D position is projected into NDC screen space and the one whose 2D screen coordinate is geometrically closest to the actual click pixel is selected. This means "the dot you tapped" always wins over "the dot closest to the camera on that ray."

```js
// Globe.jsx — pick loop
for (const hit of hits) {
  const ndc = hit.point.clone().project(camera)
  const d   = (ndc.x - mouse.x) ** 2 + (ndc.y - mouse.y) ** 2
  if (d < bestDist) { bestDist = d; bestId = acIds[hit.index] }
}
```

### Streaming 12,000 positions with minimal bandwidth
**Technique: Snapshot + delta protocol over WebSocket**

On connect the server sends a full snapshot of every aircraft in the client's viewport. After that, only changed rows are sent — an `updated` array for new/modified positions and a `removed` array for aircraft that disappeared. A typical delta is 10–200 aircraft vs. thousands in a snapshot. The client maintains a `Map<id, aircraft>` and applies patches in-place.

Clients also send a `set_bounds` message whenever the globe viewport changes (pan/zoom). The server uses these bounds to filter which aircraft it includes in each delta, so a client zoomed into Europe never receives Pacific Ocean traffic.

### Viewport bounds without polling
**Technique: Client-driven `set_bounds` over the existing WS connection**

The Globe exposes an `onViewportChange` callback that fires whenever `OrbitControls` finishes moving. The hook converts the current camera frustum to a lat/lon bounding box and sends `{ type: "set_bounds", data: { minLat, maxLat, minLon, maxLon } }` over the existing WebSocket — no separate HTTP request, no polling, zero added latency.

### Satellite positions in real time
**Technique: SGP4 propagation from Two-Line Element sets**

TLE data for 6 satellite groups (ISS/Tiangong, Starlink ×100, GPS ×32, Iridium ×66, NOAA ×20, GOES ×10) is fetched from the CelesTrak mirror every hour. Between refreshes, a 30-second tick propagates each TLE forward in time using the SGP4 algorithm (`go-satellite` library) to compute the current geocentric lat/lon/altitude. The ISS is additionally seeded every 5 seconds from `wheretheiss.at` for instant cold-start visibility before TLE propagation warms up.

### WebSocket reconnect in React StrictMode
**Technique: `setTimeout(0)` to escape synchronous double-mount**

React 18 StrictMode synchronously mounts → unmounts → remounts every component in development. A naive `useEffect` that opens a WebSocket on mount will create two sockets because the first cleanup fires before the first open resolves. Deferring `connect()` with `setTimeout(0)` means the first timer is cleared by the cleanup before the socket is ever created — the second mount wins cleanly.

```js
// useWebSocket.js
const timerId = setTimeout(connect, 0)
return () => {
  mountedRef.current = false
  clearTimeout(timerId)   // cancels pending open on unmount
  closeSocket()
}
```

### iOS Safari back-forward cache
**Technique: `pagehide`/`pageshow` lifecycle events**

When a user navigates away and returns via the browser back button on iOS, the page is restored from memory (BFCache) with all JS state intact but the WebSocket connection dropped. `pagehide` closes the socket cleanly so the server releases the slot. `pageshow` with `e.persisted === true` reconnects immediately without waiting for the next reconnect timer.

### Route-change Suspense flash
**Technique: `startTransition` around `navigate()`**

Globe is lazy-loaded via `React.lazy`. When `navigate()` fires synchronously inside a state update, React can briefly show the Suspense fallback (a dark screen) while it reconciles. Wrapping navigate in `startTransition` marks it as a non-urgent background update — React holds the current UI stable and never shows the fallback during client-side navigation.

### Stale aircraft cleanup without a server round-trip
**Technique: Client-side TTL pruning on a 10-second tick**

Aircraft that stop broadcasting (landed, out of range, ADS-B off) will never appear in a future delta's `removed` list if the server's poller missed the disappearance. A `setInterval` every 10 seconds scans the client-side `Map` and removes any entry whose `receivedAt` timestamp is older than 120 seconds. This keeps the globe clean without requiring a server-side tombstone mechanism.

### Tile map system
**Technique: Priority-queue quadtree loader with parent-tile placeholders**

When the camera zooms in, the tile system determines the required zoom level and builds a priority queue ordered by distance from the viewport center. At most 6 tiles load concurrently (preventing network saturation). For any tile at zoom Z, the parent tile at Z-2 is queued first as a low-resolution placeholder — the user sees a blurry but immediate map image while the sharp tile loads behind it. Tiles outside the view frustum plus a margin are evicted via lazy disposal to bound GPU memory.

### Country borders without a mapping library
**Technique: `world-atlas` TopoJSON → Three.js `LineSegments` with additive blending**

Country border geometry is fetched once from the CDN (`countries-110m.json`) and decoded client-side with a tiny TopoJSON parser. Each border segment is converted to a pair of `Vector3` points projected onto the sphere surface. The resulting `BufferGeometry LineSegments` object lives in the Three.js scene and uses additive blending to produce a glow effect against the dark earth. Opacity fades to zero as the camera zooms in past the tile threshold so borders don't compete with map imagery.

### Camera fly-to and entity lock
**Technique: Spherical interpolation + ease-out cubic**

`flyTo(lat, lon)` lerps the camera position between start and target on the unit sphere and then re-normalizes, keeping the path on the sphere surface (unlike raw linear interpolation which would cut through the globe). The easing is a cubic ease-out: `t = 1 - (1 - rawT)³`. Duration is 1.4 s.

Entity lock (`trackISS`) runs every animation frame: the current entity lat/lon is projected to a sphere position and the camera is translated there while keeping `lookAt(0,0,0)` — the user retains zoom (radial distance) but rotation follows the object.

### Earth ↔ solar system transition
**Technique: Camera position tween + deferred mesh visibility**

The solar system scene (`createSolarSystem`) is built once and kept invisible. When the user switches scale, the camera tweens from Earth's close position (`CAM_EARTH`) to a heliocentric vantage point (`CAM_SOLAR`). When the tween completes, `solarSystem.show()` enables the planetary meshes. The reverse transition hides the solar system before beginning the camera return so the Earth globe is never visible at solar scale.

### Anonymous-first session model
**Technique: Ephemeral JWT, no registration required**

On first load the frontend calls `POST /api/v1/session`, which issues a short-lived JWT signed with `JWT_SECRET`. The token is stored in `sessionStorage` (tab-scoped, clears on close). Every WebSocket connection sends it as a query parameter for validation before upgrade. No cookies, no accounts, no tracking — users get full functionality immediately.

### Mobile bottom sheet with dual-axis gestures
**Technique: Native touch listeners, passive-false, document-level tracking, ref-mirrored state**

The bottom sheet handles vertical drag (sheet resize) and the SmartStack inside it handles horizontal swipe (panel change). Both gestures start with the same `touchstart`. The direction is determined on the first 8px of movement and locked for the rest of the touch. The SmartStack's `touchmove` listener is registered as `{ passive: false }` so it can call `preventDefault()` to capture horizontal swipes without the browser treating them as scroll attempts.

The sheet's vertical drag was originally wired via React synthetic event props (`onTouchMove` etc.), which are always passive — meaning the browser could steal the gesture as a scroll. The fix registers native listeners directly on the DOM node via `useEffect`:

```js
grab.addEventListener('touchstart', onStart, { passive: true })
document.addEventListener('touchmove',  onMove,  { passive: false }) // allows preventDefault()
document.addEventListener('touchend',   onEnd,   { passive: true })
```

`touchmove`/`touchend` are on `document` so the gesture continues even when the finger slides off the grab bar. Because native listener closures can't read React state updates, a `sheetStateRef` mirrors `sheetState` via `useEffect` — the closure reads the ref, which is always current:

```js
const sheetStateRef = useRef(sheetState)
useEffect(() => { sheetStateRef.current = sheetState }, [sheetState])
```

Friction multipliers (`dy * 0.85`) and over-large thresholds (40–80 px) were also removed — the sheet now tracks the finger 1:1 and commits on 30 px up / 50 px down.

### Desktop signal stream panel collapse
**Technique: CSS `translateX` with a persistent 40px tab**

The right panel uses `transform: translateX(calc(100% - 40px))` in its collapsed state. This slides the panel almost fully off-screen but leaves a 40px vertical tab visible at the right edge — always interactive, always pointing back to the panel. Three CSS states (`collapsed`, `open`, `wide`) are applied as modifier classes; `transition` on the `transform` property handles the animation at 60fps on the compositor thread without triggering layout.

### Space data caching across React remounts
**Technique: Module-level cache with TTL**

Hooks for news, Kp index, and APOD store their fetched data in module-scope variables (`_newsCache`, `_kpCache`, `_apodCache`) alongside a `cachedAt` timestamp. On mount, each hook checks the cache age before fetching. Because these variables live at module scope — outside any component — they survive React's `StrictMode` double-mount, component unmount during navigation, and Suspense boundary resolution without re-fetching the same data.

---

## Tech stack

| Layer | Technology | Why |
|-------|-----------|-----|
| 3D rendering | Three.js r168 | WebGL scene, instanced meshes, raycasting |
| Frontend framework | React 18 + Vite | Concurrent features, lazy loading, fast HMR |
| Routing | React Router v7 | URL ↔ state sync, `startTransition` for Suspense safety |
| Styles | CSS Modules + design tokens | Zero runtime, scoped, no Tailwind dependency |
| Backend language | Go 1.22 | Goroutine-per-client WS model, zero-cost concurrency |
| WebSocket | gorilla/websocket | Battle-tested, read/write pump pattern |
| Database driver | pgx/v5 | Typed PostgreSQL, no ORM overhead |
| Cache / pub-sub | go-redis/v9 + Redis 7 | O(1) HSET/HGETALL for live aircraft state |
| Auth | golang-jwt/jwt/v5 | Stateless anonymous sessions |
| Satellite math | go-satellite (SGP4) | TLE propagation without an external API |
| Analytics | Vercel Analytics | Zero-config, no cookie consent needed |
| Infra (backend) | Railway | Persistent process, PostgreSQL + Redis add-ons |
| Infra (frontend) | Vercel + Cloudflare | Edge CDN, automatic HTTPS, DDoS protection |

---

## Project structure

```
flightspace/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── aircraft.go          # Detail + search endpoints
│   │   │   ├── ws.go                # WebSocket upgrade + hub
│   │   │   ├── launch_poller.go     # Launch Library 2 — 15 min
│   │   │   ├── satellite_poller.go  # CelesTrak TLE + SGP4 — 30 s
│   │   │   ├── asteroid_controller.go  # NASA NeoWs — 1 hr
│   │   │   ├── apod_controller.go   # NASA APOD proxy — 24 hr
│   │   │   └── solar_poller.go      # NASA Horizons — 5 min
│   │   ├── db/                      # PostgreSQL + Redis connections
│   │   ├── middlewares/             # CORS, security headers, logger
│   │   ├── models/                  # Shared Go structs
│   │   ├── routes/                  # Route registration
│   │   └── utils/                   # JSON helpers
│   ├── migrations/                  # SQL migration files (up/down)
│   ├── app.go                       # Dependency wiring + lifecycle
│   ├── constants.go                 # Config + env vars
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Globe/               # Three.js scene — aircraft, tiles, solar
│   │   │   ├── CommandCenterOverlay/ # Right panel / mobile bottom sheet
│   │   │   ├── DetailPanel/         # Per-flight detail + trail
│   │   │   ├── LaunchPanel/         # Rocket launch manifest
│   │   │   ├── DeepSpacePanel/      # Near-Earth asteroid viewer
│   │   │   ├── OrbitalMapBar/       # Desktop filter dock + Cosmic Address
│   │   │   ├── FilterRail/          # Left sidebar filters
│   │   │   ├── HUD/                 # Altitude + tracking HUD
│   │   │   └── StatusBar/           # Connection status + live toggle
│   │   ├── hooks/
│   │   │   ├── useAircraft.js       # State map + delta reducer + filters
│   │   │   ├── useWebSocket.js      # WS lifecycle + reconnect + BFCache
│   │   │   └── useSession.js        # Anonymous JWT session
│   │   └── styles/
│   │       ├── tokens.css           # Design system (colors, spacing, type)
│   │       └── global.css
│   └── vite.config.js
└── infra/
    └── docker-compose.yml           # Local PostgreSQL + Redis
```

---

## Running locally

**1. Start infrastructure**

```bash
docker compose -f infra/docker-compose.yml up -d
```

**2. Backend**

```bash
cd backend
cp .env.example .env   # fill in DATABASE_URL, REDIS_URL, JWT_SECRET
go run .               # http://localhost:8080
```

**3. Frontend**

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

Vite proxies `/api/*` and `/ws` to `localhost:8080` automatically.

---

## Environment variables

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Secret for signing anonymous session JWTs |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP listen port |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated CORS origins |
| `NASA_API_KEY` | `DEMO_KEY` | NASA APOD + NeoWs (higher rate limits) |
| `AISSTREAM_KEY` | — | AISStream.io key (ship tracking disabled if absent) |
| `RESEND_API_KEY` | — | Resend key for waitlist confirmation emails |
| `LL2_BASE_URL` | public endpoint | Override Launch Library 2 base URL |
| `SERVER_DISABLED` | — | Set `true` to serve 503 maintenance mode |

---

## API reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/health` | Health check |
| `POST` | `/api/v1/session` | Issue anonymous JWT session |
| `GET` | `/api/v1/aircraft/search?q=` | Search live traffic by callsign / ICAO |
| `GET` | `/api/v1/aircraft/:icao24` | Flight detail + last 200 trail points |
| `GET` | `/api/v1/launches` | Upcoming + recent rocket launches |
| `GET` | `/api/v1/asteroids` | Near-Earth asteroid close approaches |
| `GET` | `/api/v1/apod` | Astronomy Picture of the Day (proxied) |
| `POST` | `/api/v1/auth/register` | Register user account |
| `POST` | `/api/v1/auth/login` | Login |
| `POST` | `/api/v1/waitlist` | Waitlist signup |
| `GET` | `/ws?token=` | WebSocket stream — snapshot + deltas |

### WebSocket message types

| Direction | Type | Payload |
|-----------|------|---------|
| Server → Client | `snapshot` | Full aircraft list for current viewport |
| Server → Client | `delta` | `{ updated: [...], removed: [...] }` |
| Server → Client | `solar_system` | Planet positions for solar scene |
| Client → Server | `set_bounds` | `{ minLat, maxLat, minLon, maxLon }` |
| Client → Server | `ping` | Keep-alive (server responds `pong`) |

---

## Development commands

```bash
# Backend
cd backend && go run .               # Start server (port 8080)
cd backend && go test ./...          # All tests (requires Docker for DB)
cd backend && go run . migrate up    # Run pending migrations

# Frontend
cd frontend && npm run dev           # Dev server (port 5173)
cd frontend && npm run build         # Production build
cd frontend && npm test              # Unit tests (Vitest)
cd frontend && npm run test:e2e      # E2E tests (Playwright)

# Local infra
docker compose -f infra/docker-compose.yml up -d    # Start PostgreSQL + Redis
docker compose -f infra/docker-compose.yml down     # Stop
```

---

## License

MIT
