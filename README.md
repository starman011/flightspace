# ObjectTracer

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
│   URL sync (replaceState) — state ↔ URL path                │
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

ObjectTracer is a **modular monolith**, not a microservices system. A single Go binary contains all server-side logic — the WebSocket hub, every data-source poller, the REST API, authentication, and cleanup — wired together in `app.go` and started as a single process on Railway.

This was a deliberate choice, not an oversight:

| | Microservices | ObjectTracer monolith |
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

The frontend is a **single-page application** with one full-viewport canvas (`Globe.jsx` → Three.js) and layered UI panels that sit on top in CSS. There is no page reload — navigation between Earth view, launches, and asteroids is `useState` + `window.history.replaceState` (no router library).

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
**Technique: Dual-mode screen-space picking (KD-tree + GPU color ID)**

Three.js `Raycaster` operates in world space — its threshold is a sphere radius that doesn't correspond to screen pixels, especially on a spherical projection where foreshortening compresses dots near the horizon. FlightRadar24 and FlightAware solve this by picking entirely in screen space.

**Far zoom (>320km altitude):** All 12K aircraft 3D positions are projected to screen coordinates via `Vector3.project(camera)`, inserted into a `kdbush` KD-tree (~3KB, zero deps), and queried with a pixel-radius range search. The nearest-to-cursor aircraft wins. Total cost: ~2ms on click, 0ms per frame (lazy).

**Close zoom (<320km):** GPU color-ID picking renders each aircraft as a unique RGB-encoded quad to an offscreen FBO. A 7×7 pixel neighborhood is sampled (DPI-corrected) and the nearest non-zero ID to center wins. Pick mesh geometry is 1.8× larger than display geometry for a generous hit area without visual change.

```js
// Screen-space KD-tree pick (far zoom)
const index = new KDBush(n)
for (let j = 0; j < n; j++) index.add(screenX[j], screenY[j])
index.finish()
const nearby = index.range(cx - tapR, cy - tapR, cx + tapR, cy + tapR)
// → nearest by pixel distance wins
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

### Mobile tab crash on panel close (jetsam)
**Technique: Always-mounted heavy components with CSS `display:none`**

On mobile Safari and Chrome, closing DetailPanel or LaunchPanel caused a full page reload — the browser killed the tab. Root cause: both panels' close handler conditionally rendered `CommandCenterOverlay`, which mounted a heavy component (DOM insertion + multiple API fetches + WebGL context already running). The simultaneous memory spike from mount + WebGL render loop exceeded mobile browser memory limits, triggering iOS jetsam (OOM kill). Fix: `CommandCenterOverlay` is always mounted in the DOM. A `hidden` prop sets `display:none` — the component stays in memory (cheap) but skips paint. Closing a panel just flips the prop instead of mount/unmounting ~50 DOM nodes and 6 fetch calls.

### URL sync without a router library
**Technique: `window.history.replaceState` + `useState` path derivation**

React Router was removed entirely after discovering it caused cascading re-renders on every `navigate()` call. `useLocation()` subscribes to the history stack — any `navigate()` triggers a full `App` re-render including the WebGL Globe. On mobile, this was one of the factors behind the tab crash. Replaced with a `useEffect` that derives a URL path from React state (`selectedIcao24`, `activeScale`, etc.) and calls `window.history.replaceState` directly. Initial state is read from `window.location.pathname` on mount. Zero re-renders from URL changes.

### Auto-dock panels on zoom
**Technique: Globe altitude callback + CSS class toggling**

The Globe's render loop emits an `onZoomChange(isClose)` callback when the camera crosses the 500km altitude threshold. Parent state (`zoomedIn`) propagates to CommandCenterOverlay (auto-collapse stream, hide hero/stats), HUD (shift right position from 376px to 56px), and the map toggle (reposition). All transitions use CSS `transition` on the compositor thread — no React re-renders during the animation.

### Stale aircraft cleanup without a server round-trip
**Technique: Client-side TTL pruning on a 10-second tick**

Aircraft that stop broadcasting (landed, out of range, ADS-B off) will never appear in a future delta's `removed` list if the server's poller missed the disappearance. A `setInterval` every 10 seconds scans the client-side `Map` and removes any entry whose `receivedAt` timestamp is older than 120 seconds. This keeps the globe clean without requiring a server-side tombstone mechanism.

### Tile map system
**Technique: Priority-queue quadtree loader with parent-tile placeholders + logarithmic depth buffer**

When the camera zooms in, the tile system determines the required zoom level and builds a priority queue ordered by distance from the viewport center. At most 10 tiles load concurrently. For any tile at zoom Z, the parent tile at Z-2 is queued first as a low-resolution placeholder — the user sees a blurry but immediate map image while the sharp tile loads behind it. Tiles outside the view frustum plus a margin are evicted via lazy disposal to bound GPU memory.

The renderer uses `logarithmicDepthBuffer: true` to provide uniform depth precision from 127m altitude to 51,000km. Without this, the standard 24-bit depth buffer's near/far ratio (67M:1 at close zoom) causes z-fighting between tile layers. Tile layers are separated by ~1.3km (parent at `1.0002R`, detail at `1.0004R`) — far enough for clean depth resolution, close enough to look flush on the sphere surface.

### Airport arrival ETA from live ADS-B data
**Technique: Haversine + bearing filter + ground-speed division**

No external flight data API is needed. The backend scans all ~12K live aircraft in Redis, filters to those within 500km of the airport and heading within 45° of the bearing toward the airport, then computes ETA = great-circle distance / ground speed. Accuracy is ~2-5 minutes (doesn't model approach patterns or ATC holds). Total computation: <5ms for 12K aircraft, served from `GET /api/v1/airports/{iata}/arrivals`.

### Flight route lookup without external APIs
**Technique: Embedded OpenFlights database + callsign-based route matching**

The route endpoint (`GET /api/v1/aircraft/{icao24}/route`) identifies departure and arrival airports using two strategies, zero external API calls:

**Primary — callsign-based route matching:** The backend embeds the full OpenFlights dataset at compile time via Go `//go:embed`: 67K airline routes, 6K airlines (ICAO↔IATA mapping), and 7,700+ airports with coordinates. Given a callsign like `UAL1234`, the system extracts the airline code (`UAL`), maps it to IATA (`UA`), finds all routes for that airline, and scores each route by whether the aircraft's current position lies on the great-circle path between the route's endpoints (30% detour tolerance). The best-scoring route gives exact departure and arrival airports.

**Fallback — heading-based estimation:** When no callsign route matches, the system searches all 7,700 airports in the OpenFlights database. It looks behind the aircraft (reverse heading, 3000km, 70° cone) for departure, and ahead (forward heading, 3000km, 50° cone) for arrival. If no airport is found behind, it falls back to the nearest airport within 3000km. ETA is computed from arrival distance divided by ground speed.

### Flight isolation mode
**Technique: GPU instance matrix zeroing**

When a user tracks a flight, all other aircraft are hidden by setting their `InstancedMesh` transform matrices to a zero matrix. This is a frontend-only optimization — no backend change, no additional filtering — that eliminates ~12K draw instances from the GPU pipeline. The isolation toggles automatically when tracking starts/stops via a `needsInstanceRebuild` flag.

The tracked aircraft's trail is enriched with route data: departure airport coordinates are prepended and arrival airport coordinates are appended to the recorded trail points (if >20km from the first/last DB position). The globe auto-fits to show both departure and arrival airports using spherical midpoint + angular distance camera positioning.

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
| URL sync | `replaceState` + `useState` | Zero-dependency routing, no re-renders from URL changes |
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
│   │   │   ├── aircraft.go          # Detail + search + route endpoints
│   │   │   ├── ws.go                # WebSocket upgrade + hub
│   │   │   ├── launch_poller.go     # Launch Library 2 — 15 min
│   │   │   ├── satellite_poller.go  # CelesTrak TLE + SGP4 — 30 s
│   │   │   ├── asteroid_controller.go  # NASA NeoWs — 1 hr
│   │   │   ├── apod_controller.go   # NASA APOD proxy — 24 hr
│   │   │   └── solar_poller.go      # NASA Horizons — 5 min
│   │   ├── data/
│   │   │   ├── routes.go            # OpenFlights route/airline/airport DB
│   │   │   ├── airports.go          # ICAO airport lookup table
│   │   │   └── openflights/         # Embedded datasets (67K routes, 7.7K airports)
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
| `GET` | `/api/v1/aircraft/:icao24/route` | Route info — departure/arrival airports + ETA |
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

## Developer Tooling

Two tools are used to optimize Claude Code sessions on this project:

### Caveman — Token Reduction (~75% output savings)

[github.com/JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman)

Strips filler words and verbosity from Claude's output while preserving code accuracy. Three intensity levels (lite/full/ultra). Also compresses CLAUDE.md and memory files for ~45% input token savings.

```bash
npx skills add JuliusBrussee/caveman   # install
/caveman                                 # activate in session
/caveman:compress                        # compress memory files
```

### claude-mem — Persistent Session Memory

[github.com/thedotmack/claude-mem](https://github.com/thedotmack/claude-mem)

Automatically captures tool interactions during coding sessions, stores them in SQLite, and retrieves relevant context in future sessions using hybrid semantic + keyword search. Web viewer at `localhost:37777`.

```bash
npx claude-mem install                   # install
/mem-search <query>                      # search past session context
```

---

## Database & auth security

Defense-in-depth invariants applied at both the application layer and the
database layer. This section exists so contributors don't accidentally undo
them — every item here blocks a real attack.

### Email normalization — strict ASCII only

**Threat**: Unicode homoglyph attacks. `raj@gmáil.com` (Latin `á`, U+00E1) and
`raj@gmail.com` (plain `a`, U+0061) look identical to humans. Cyrillic `а`
(U+0430) is a different codepoint again. A naive `ToLower()` or NFKC normalize
folds them together and lets an attacker sign up as a visually-identical
impostor, then use password reset to steal the real account.

**Mitigation** (`backend/src/utils/email.go`):
1. Reject any byte > `0x7F` — rules out all non-ASCII, no enumeration needed.
2. ASCII-lowercase (safe only because step 1 removed all Unicode).
3. Regex-validate the `local@domain.tld` shape.
4. Every write path (`auth.Register`, `auth.Login`, `waitlist.Subscribe`)
   funnels through the same `utils.NormalizeEmail()` — no direct `ToLower`
   allowed.

### DB CHECK constraint — app bypass protection

**Threat**: Some future PR adds a new email-insert path and forgets to call
`NormalizeEmail`. The app-layer defense is now bypassed.

**Mitigation** (`backend/migrations/000011_email_ascii_constraint.up.sql`):

```sql
ALTER TABLE users
    ADD CONSTRAINT users_email_ascii_lowercase
    CHECK (
        email ~ '^[\x20-\x7E]+$'   -- ASCII printable only
        AND email = lower(email)    -- canonical form
        AND email LIKE '%_@_%.__%'  -- shape sanity
    );
```

Same constraint on `waitlist_emails`. The Postgres regex engine rejects the
insert before the row ever lands. If the app-layer validator is ever skipped,
the DB still holds the line.

### Other DB-level mitigations in place

| Table                | Mitigation                                                  | Why                                                                                    |
|----------------------|-------------------------------------------------------------|----------------------------------------------------------------------------------------|
| `users`              | `email UNIQUE` + ASCII CHECK                                | One row per canonical email; impossible to register homoglyph variants.                |
| `users`              | `password_hash` bcrypt only, never plaintext                | App layer uses `bcrypt.GenerateFromPassword` with salt+cost 10.                        |
| `users`              | `preferences JSONB NOT NULL DEFAULT '{}'`                   | No nulls to branch on in app code.                                                     |
| `anonymous_sessions` | `expires_at` TTL + Redis cache                              | 30-day anonymous session expiry; no unbounded session table growth.                    |
| `user_sessions`      | `session_token` indexed + `expires_at` CHECK                | JWT revocation via cookie clear; TTL prevents stale session harvesting.                |
| `aircraft_positions` | **Dropped**. Trails now in bounded Redis list               | Old schema appended forever with no retention → filled Railway disk. Redis `LPUSH`+`LTRIM` is O(1), 4h TTL, zero disk growth. |
| `waitlist_emails`    | `UNIQUE(email)` + `ON CONFLICT DO NOTHING` + ASCII CHECK    | Idempotent subscribe, no duplicate confirmation emails.                                |
| All tables           | `pgx` parameterized queries — **zero string interpolation** | SQL injection impossible by construction: `$1, $2, ...` placeholders, never `fmt.Sprintf`. |
| All write paths      | `context.WithTimeout` on every query                        | No runaway queries; hung connections can't exhaust the pool.                           |

### Auth flow invariants

- **Password hashing**: bcrypt with `DefaultCost`. Never MD5, SHA1, or plain SHA256.
- **JWT signing**: HS256 with a 256-bit secret from `JWT_SECRET`. Not committed,
  not logged, never returned in API responses.
- **Cookie flags**: `HttpOnly`, `Secure` (TLS or `X-Forwarded-Proto: https`
  behind proxy), `SameSite=Strict` — on both set *and* clear (logout). XSS
  cannot read the cookie, CSRF cannot auto-send it from cross-site contexts.
- **Login timing**: Failed lookups and failed bcrypt compares both return the
  same generic "invalid credentials" error — no account enumeration via timing
  or error-message differences.
- **Password length cap**: Rejects passwords >72 chars. bcrypt silently
  truncates at 72 bytes — without a cap, users think extra entropy protects
  them when it doesn't.
- **WebSocket origin check**: strict `map[string]bool` lookup against
  `ALLOWED_ORIGINS`, no wildcards. Raw Railway subdomain isn't in the list —
  only the custom domain behind Cloudflare is trusted.

### What we don't do, and why

- **No accent-insensitive email matching.** Explicitly rejected — see homoglyph
  threat above.
- **No "forgot password" email link yet.** Deferred until we have a
  transactional email provider. Password reset is the #1 account-takeover
  vector, so it doesn't ship until we can do it right (signed tokens, 15-min
  expiry, single-use, rate limited).
- **No CITEXT extension.** Postgres `CITEXT` folds case using the collation,
  which can pull in Unicode case-folding if the collation is `und-x-icu`. Plain
  `VARCHAR` + `CHECK` is both faster and byte-exact.
- **No in-process rate limiting on login yet.** Cloudflare WAF + Railway egress
  throttling is the current stop-gap. In-process token-bucket limiter is on the
  alpha backlog.

### Transport & request hardening

- **CORS**: Only origins in the `ALLOWED_ORIGINS` allow-list (+ localhost dev
  variants) are echoed back with `Access-Control-Allow-Credentials`. Unknown
  origins get no `Access-Control-Allow-Origin` header — the browser blocks the
  response. Previously this was wide-open (any origin echoed), fixed in
  `858a840`.
- **Request body limits**: Every POST/PUT handler wraps `r.Body` in
  `http.MaxBytesReader` (4–8 KB) to prevent OOM from oversized payloads.
- **Security headers**: `X-Frame-Options: DENY`, `X-Content-Type-Options:
  nosniff`, `Content-Security-Policy: default-src 'none'`, `HSTS` (2-year
  preload), `Cross-Origin-Opener-Policy: same-origin`,
  `Referrer-Policy: no-referrer`. Applied globally via `SecurityHeaders`
  middleware.
- **Rate limiting**: Redis-based 100 req/min per IP, fail-closed (503 if
  Redis is unavailable). WebSocket messages rate-limited to 20/10s per client.
  Health/metrics endpoints exempt.

---

## License

MIT
