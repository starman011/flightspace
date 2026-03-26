---

description: "Task list for SkyDot Flight Radar Core implementation"

---

# Tasks: SkyDot — Real-Time Flight Radar Core

**Input**: Design documents from `/specs/001-flight-radar-core/`
**Feature Branch**: `001-flight-radar-core`
**Generated**: 2026-03-12

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US9)
- Exact file paths are included in every task description

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization — scaffolding, migrations, and static data. All tasks are independent and can run in parallel.

- [X] T001 [P] Create Go backend directory structure with all files and placeholders: `backend/app.go`, `backend/constants.go`, `backend/index.go`, `backend/go.mod`, `backend/Dockerfile`, `backend/.env.example`, `backend/.gitignore`, `backend/src/controllers/.gitkeep`, `backend/src/db/`, `backend/src/middlewares/.gitkeep`, `backend/src/models/.gitkeep`, `backend/src/routes/index.go`, `backend/src/utils/.gitkeep`
- [X] T002 [P] Create Vite + React frontend scaffold with all files: `frontend/package.json` (deps: react, react-dom, leaflet, react-leaflet; devDeps: vite, @vitejs/plugin-react), `frontend/vite.config.js`, `frontend/src/App.jsx`, `frontend/src/main.jsx`, `frontend/src/styles/theme.css`, `frontend/src/styles/global.css`, `frontend/.env`, `frontend/.gitignore`, `frontend/.prettierrc`, component/hook/util stub files — verify `npm run dev` starts and `npm run build` produces < 250KB gzip
- [X] T003 [P] Create all 14 database migration files in `backend/migrations/`: `000001_create_anonymous_sessions.up.sql` / `.down.sql`, `000002_create_users.up.sql` / `.down.sql`, `000003_create_user_sessions.up.sql` / `.down.sql`, `000004_create_aircraft_static.up.sql` / `.down.sql`, `000005_create_aircraft_positions.up.sql` / `.down.sql` (partitioned by `received_at`), `000006_create_watchlists.up.sql` / `.down.sql`, `000007_create_flight_view_history.up.sql` / `.down.sql` — schemas exactly as defined in `data-model.md`
- [X] T004 [P] Create helicopter type codes static data file `frontend/public/data/helicopter-types.json` with ≥ 200 ICAO type designators (H60, EC35, B06, R44, S92, AW139, etc.) and create `backend/src/utils/helicopter.go` with an embedded Go map — lookup function `IsHelicopter(typeCode string) bool` must return `true` for "EC35", `false` for "B738"

**Checkpoint**: Scaffold complete. `go build .` compiles from `backend/`. `npm run dev` starts the frontend. All migration files exist.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core backend infrastructure that ALL user stories depend on. Must be complete before any story work begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 Implement config constants and database connections: `backend/constants.go` (all env vars with defaults: `PORT=8080`, `DATABASE_URL`, `REDIS_URL`, `OPENSKY_USER`, `OPENSKY_PASS`, `JWT_SECRET`), `backend/src/db/index.go` (pgx connection pool + go-redis client init, health checks via `SELECT 1` and `PING`, run migrations on startup), `backend/src/db/postgres.go` (query helpers), `backend/src/db/redis.go` (pipeline helpers, cache get/set wrappers)
- [X] T006 [P] Implement all Go model structs in `backend/src/models/`: `aircraft.go` (`Aircraft`, `AircraftPosition`, `LiveAircraft` with abbreviated JSON field names id/cs/lat/lon/alt/vel/hdg/vr/grnd/cat/ctry), `session.go` (`AnonymousSession`, `UserSession`), `user.go` (`User`, `Watchlist`, `FlightViewHistory`), `websocket.go` (`WSMessage`, `WSSnapshot`, `WSDelta`) — all structs must JSON marshal/unmarshal correctly matching the schemas in `contracts/websocket.md` and `contracts/rest-api.md`
- [X] T007 [P] Implement health and metrics endpoints in `backend/src/controllers/health.go`: `GET /api/v1/health` (checks DB via `SELECT 1`, Redis via `PING`, returns `{"status":"ok","services":{"database":"ok","redis":"ok","opensky":"ok"},"uptime_seconds":N,"version":"1.0.0"}`), `GET /api/v1/metrics` (websocket_connections, aircraft_tracked, cache_hit_rate, opensky_last_poll, db_pool stats)
- [X] T008 [P] Implement CORS middleware in `backend/src/middlewares/cors.go`: allow origins `http://localhost:5173` (dev) + Cloudflare Pages domain from env `ALLOWED_ORIGIN`, allow methods GET/POST/PUT/DELETE/OPTIONS, allow headers Content-Type/Authorization/X-Session-Token, allow credentials true
- [X] T009 [P] Implement rate limiting middleware in `backend/src/middlewares/ratelimit.go`: Redis-based counter per IP (key `ratelimit:<ip>`, TTL 60s), 100 req/min limit, return 429 with `Retry-After: 60` header when exceeded, skip health and metrics endpoints, extract IP from `X-Forwarded-For` header (Cloudflare)
- [X] T010 Implement route definitions in `backend/src/routes/index.go`: wire all controllers to their paths (`/api/v1/health`, `/api/v1/metrics`, `/api/v1/session`, `/api/v1/aircraft/:icao24`, `/api/v1/aircraft/search`, `/api/v1/auth/register`, `/api/v1/auth/login`, `/api/v1/auth/logout`, `/api/v1/user/preferences`, `/api/v1/user/watchlist`, `/ws`), apply CORS and rate-limit middlewares globally
- [X] T011 Implement app wiring and entry point: `backend/app.go` (App struct with DB pool, Redis client, WS hub, poller; `Start()` method with graceful shutdown via `os.Signal`), `backend/index.go` (`main()` that reads config, creates App, calls `Start()`, logs "server starting on :8080")

**Checkpoint**: `go run .` starts server, connects to DB + Redis, logs success. `GET /api/v1/health` returns 200.

---

## Phase 3: US1 — First Visit: Instant Map (Priority: P1) 🎯 MVP Core

**Goal**: The backend pipeline (OpenSky → Redis → WebSocket) is live, delivering aircraft data to clients. The map renders with live aircraft. Anonymous sessions are created silently.

**Independent Test**: Start backend and frontend. Open a fresh browser. Within 3 seconds the map renders with aircraft glyphs. No prompt, no modal, nothing required.

### Implementation for User Story 1

- [X] T012 [US1] Implement OpenSky poller service in `backend/src/controllers/poller.go`: HTTP client polling `https://opensky-network.org/api/states/all` every 15s with Basic auth from env, parse state vector arrays into `[]LiveAircraft`, trim callsign whitespace (`strings.TrimSpace`), convert altitude m→ft (×3.28084) and velocity m/s→knots (×1.94384) and vr m/s→ft/min (×196.85), cross-reference `IsHelicopter()` to set `cat` field, pipeline `HSET aircraft:live <icao24> <json>` for all aircraft, batch INSERT into `aircraft_positions`, remove entries from Redis where `ts` is older than 120s, handle 429 with exponential backoff (1s, 2s, 4s … max 60s), on API error log and continue serving from cache
- [X] T013 [US1] Implement WebSocket hub in `backend/src/controllers/ws_hub.go`: `Hub` struct with `clients map[*Client]bool`, `register/unregister chan *Client`, `broadcast chan []byte`; `Register(conn)` adds client and immediately sends full snapshot from Redis `HGETALL aircraft:live`; `Broadcast()` goroutine diffs current Redis state vs last broadcast state every 5s, sends `{"type":"delta","data":{"updated":[...],"removed":[...]}}` to all clients; connection tracking via Redis sorted set `ws:connections`; enforce max 100 connections (reject with `{"type":"error","data":{"code":"RATE_LIMITED"}}`)
- [X] T014 [US1] Implement WebSocket handler + viewport filtering in `backend/src/controllers/ws.go`: upgrade HTTP→WS using gorilla/websocket, validate session token from `?token=` query param (via session middleware), register with hub, read loop handling `set_bounds` (filter aircraft to NE/SW bounds before sending) and `ping` (respond with `pong`), auto-close connection after 5 minutes with no ping, deregister on close, handle graceful server shutdown

**Checkpoint**: WebSocket clients connect and receive snapshot + deltas. `HLEN aircraft:live` > 0 within 20s of startup.

---

## Phase 4: US6 — Anonymous Session: Zero-Friction Entry (Priority: P1)

**Goal**: Every visitor gets a session automatically. Preferences persist across visits. No prompts ever appear.

**Independent Test**: Visit with fresh browser, use the app, close and reopen. Map position and settings are restored without login.

### Implementation for User Story 6

- [X] T015 [US6] Implement session management in `backend/src/controllers/session.go` and `backend/src/utils/token.go`: `POST /api/v1/session` creates anonymous session (generates cryptographically random token prefixed `skd_anon_` via `crypto/rand`, stores in `anonymous_sessions` table + Redis cache key `session:<token>` with TTL 3600), sets `skydot_session` cookie (HttpOnly, Secure, SameSite=Lax, Max-Age=2592000); session middleware extracts token from cookie or `X-Session-Token` header, loads from Redis (fallback to DB on cache miss), auto-extends expiry on each request
- [X] T016 [US6] Implement auth middleware in `backend/src/middlewares/auth.go`: `RequireSession` middleware that validates session token and attaches session to request context; `RequireAuth` middleware that validates JWT for authenticated endpoints; used by routes that need session context

**Checkpoint**: `POST /api/v1/session` returns token + sets cookie. Subsequent requests with cookie are authenticated.

---

## Phase 5: US8 — Real-Time Updates: Live Data Stream (Priority: P1)

**Goal**: Frontend connects to WebSocket, receives live aircraft state, auto-reconnects on drop.

**Independent Test**: Open app, observe aircraft updating every ~5s. Kill backend briefly. "Reconnecting..." appears. Reconnect. Map resyncs.

### Implementation for User Story 8

- [X] T017 [P] [US8] Implement `frontend/src/hooks/useSession.js`: on mount check for existing `skydot_session` cookie, if absent call `POST /api/v1/session` to create one, store token in React state (never localStorage), expose `{ sessionToken, isAuthenticated }`, used by WebSocket hook to authenticate connection
- [X] T018 [P] [US8] Implement `frontend/src/hooks/useWebSocket.js`: connect to `ws://localhost:8080/ws?token=<sessionToken>` on mount, handle `snapshot` message to populate aircraft Map state, handle `delta` message to merge updates (add/update) and process `removed` IDs, auto-reconnect with exponential backoff (1s → 2s → 4s → 8s → 16s → max 30s) tracking `retryCount`, send `set_bounds` when map viewport changes, send `ping` every 30s via `setInterval`, expose `{ aircraft: Map<icao24, LiveAircraft>, connectionStatus: 'connected'|'connecting'|'disconnected' }`
- [X] T019 [US8] Implement `frontend/src/hooks/useAircraft.js`: wraps `useWebSocket` to provide filtered/processed aircraft array, exposes `getAircraftById(icao24)` helper, manages filter application state

**Checkpoint**: Frontend connects to backend WS, displays live aircraft, reconnects after drop.

---

## Phase 6: US2 — Aircraft Visualization: Dot Projection (Priority: P1)

**Goal**: Aircraft appear as newspaper-dot glyphs, rotate by heading, interpolate smoothly, fade when stale.

**Independent Test**: Map shows aircraft as small geometric glyphs. Planes and helicopters look different. Glyphs rotate to match heading. Stale glyphs fade after 60s.

### Implementation for User Story 2

- [X] T020 [US2] Implement full-viewport Leaflet map in `frontend/src/components/Map/Map.jsx` and `frontend/src/components/Map/Map.module.css`: Leaflet map fills 100vw × 100vh, CartoDB Positron tiles for light theme (`https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`) and DarkMatter for dark (`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`), CSS custom properties from research: `--bg: #F5F0E8`, `--dot-primary: #1A1A1A`, `--dot-accent: #8B0000`, `--text: #2C2C2C`, font Space Mono (Google Fonts), hide all Leaflet UI chrome (`.leaflet-control-zoom { display: none }`, style attribution to match), use `L.Canvas` renderer for markers
- [X] T021 [US2] Implement Canvas aircraft marker layer in `frontend/src/components/Map/AircraftLayer.jsx`: custom Leaflet layer using `L.Canvas`, plane glyph = filled 5px dot + 8px directional tail line, helicopter glyph = cross/plus (4px arms), on-ground glyph = hollow circle, rotate entire glyph by `hdg` degrees using canvas transform, stale fade: compute `opacity = 1.0 - (staleness_ms / 60000) * 0.7`, remove marker when `staleness_ms > 120000`, scale dot size proportionally to zoom level (min 3px at zoom 2, max 7px at zoom 10)
- [X] T022 [US2] Implement position interpolation in `frontend/src/utils/interpolation.js`: `lerpPosition(prev, next, t)` linear interpolation between two {lat,lng} points, `lerpHeading(prev, next, t)` shortest-arc heading interpolation (handles 350°→10° via 360° wrapping), `lerpAltitude(prev, next, t)`, `useInterpolation(aircraftMap)` hook that drives `requestAnimationFrame` loop computing `t = elapsed / 5000` for each aircraft since last delta, clamp `t` at 1.0
- [X] T023 [P] [US2] Implement zoom-based density clustering in `frontend/src/components/Map/AircraftLayer.jsx`: at zoom ≤ 5 group aircraft into grid cells (1° × 1°), render a single density dot sized by `sqrt(count) * 4` px with count label, at zoom > 5 render individual glyphs, re-cluster on `zoomend` event

**Checkpoint**: Aircraft appear as styled dots on map. Heading visible. Smooth movement. Stale fade works. Clusters at low zoom.

---

## Phase 7: US3 — Flight Details: Click to Reveal (Priority: P2)

**Goal**: Clicking an aircraft opens a minimal detail panel with data + 30-min trail. Dismisses on Escape/click outside.

**Independent Test**: Click any visible aircraft. Panel slides in with callsign, altitude, speed, type. Trail appears on map. Escape closes it.

### Implementation for User Story 3

- [X] T024 [US3] Implement aircraft detail endpoint in `backend/src/controllers/aircraft.go`: `GET /api/v1/aircraft/:icao24` — look up `aircraft_static` table by icao24, get current position from Redis `HGET aircraft:live <icao24>`, query `aircraft_positions` for trail (last `trail_minutes` minutes, default 30, max 120), combine and return response matching schema in `contracts/rest-api.md` (icao24, callsign, registration, type_code, type_description, operator, is_helicopter, current, trail array); return 404 with error JSON if not found
- [X] T025 [US3] Implement detail panel component in `frontend/src/components/DetailPanel/DetailPanel.jsx` and `DetailPanel.module.css`: click aircraft glyph → `fetchAircraftDetail(icao24)` via `GET /api/v1/aircraft/:icao24`, slide-in panel from right on desktop (≥768px, `transform: translateX(0)` animation, 320px wide), bottom sheet on mobile (<768px, `transform: translateY(0)` animation, 50vh tall), display fields: CALLSIGN, ALT (formatted ft with commas), SPD (knots), TYPE, AIRLINE — omit fields where value is null/empty, render trail as `L.Polyline` on map in `--dot-accent` color with opacity 0.6, close on Escape keydown or click outside panel, monospace text only, no cards/shadows/rounded corners > 2px
- [X] T026 [US3] Implement `frontend/src/utils/formatters.js`: `formatAltitude(ft)` → `"35,000 ft"`, `formatSpeed(knots)` → `"450 kts"`, `formatHeading(deg)` → `"NW (315°)"`, `formatCallsign(cs)` → trimmed uppercase, `formatRoute(origin, dest)` → `"JFK → LAX"` or just callsign if unavailable

**Checkpoint**: Clicking aircraft shows panel with correct data. Trail polyline visible on map. Escape/click outside closes.

---

## Phase 8: US4 — Search: Find a Flight (Priority: P2)

**Goal**: User can press `/` or `Ctrl+K`, type a callsign, and jump directly to that aircraft.

**Independent Test**: Press `/`, type "UAL", select a result. Map centers on that aircraft and detail panel opens. Escape closes search.

### Implementation for User Story 4

- [X] T027 [US4] Implement search endpoint in `backend/src/controllers/aircraft.go`: `GET /api/v1/aircraft/search?q=<term>&limit=<N>` — `HGETALL aircraft:live` from Redis, filter aircraft where `strings.HasPrefix(strings.ToLower(callsign), strings.ToLower(q))` (min 2 chars), sort exact matches first then prefix matches, also query `aircraft_static` for type_description and operator matching each result icao24, return up to `limit` (default 10, max 50) results matching schema in `contracts/rest-api.md`
- [X] T028 [US4] Implement search bar component in `frontend/src/components/SearchBar/SearchBar.jsx` and `SearchBar.module.css`: open via `/` keydown or `Ctrl+K` globally, centered overlay with input field and results list below, debounce input 300ms before calling `GET /api/v1/aircraft/search?q=<term>`, each result shows callsign + type_description + altitude, clicking or pressing Enter on a result: calls `map.flyTo([lat, lon], 8)` + opens detail panel for that icao24 + closes search bar, show "No flights found" message when results empty, close on Escape, auto-focus input on open

**Checkpoint**: `/` opens search. Typing updates results. Selecting result moves map + opens panel.

---

## Phase 9: US9 — Responsive Design: Any Device (Priority: P2)

**Goal**: All components adapt to mobile. Touch gestures work. No horizontal scroll.

**Independent Test**: Open on iPhone SE (375px). Tap aircraft → bottom sheet. Search accessible. Pinch zoom works. No overflow.

### Implementation for User Story 9

- [X] T029 [US9] Add responsive CSS to `frontend/src/styles/global.css` and `frontend/src/styles/theme.css`: CSS custom properties for breakpoints (`--bp-mobile: 768px`), `body { overflow: hidden }` (no scroll), Leaflet map `width: 100vw; height: 100dvh` (handles mobile browser chrome), touch-action: manipulation on map container, add responsive rules to DetailPanel (bottom sheet `<768px`, side panel `≥768px`), SearchBar (full-width overlay on mobile, max-width 480px centered on desktop), Filters (horizontal bar on desktop, collapsed icon on mobile)
- [X] T030 [US9] Implement responsive detail panel layout in `frontend/src/components/DetailPanel/DetailPanel.module.css`: mobile bottom sheet: `position: fixed; bottom: 0; left: 0; right: 0; height: 50vh; transform: translateY(100%); transition: transform 0.25s`; desktop side panel: `position: fixed; top: 0; right: 0; width: 320px; height: 100vh; transform: translateX(100%); transition: transform 0.25s`; drag handle visible on mobile bottom sheet; touch-action: pan-y on sheet for scroll within panel
- [X] T031 [US9] Implement responsive filters UI in `frontend/src/components/Filters/Filters.jsx` and `Filters.module.css`: desktop: horizontal bar at top-right, 3 toggle buttons (All / Planes / Helicopters) + 4 altitude buttons (All / Low / Mid / High), active state = filled dot indicator; mobile: single icon button that expands to dropdown menu on tap; filter state stored in session preferences via `PUT /api/v1/user/preferences`

**Checkpoint**: Full app usable on 375px wide screen. All controls accessible. No horizontal scroll.

---

## Phase 10: US5 — Filters: Focus the View (Priority: P3)

**Goal**: User can filter by aircraft type and altitude range. Filters apply instantly, persist across session.

**Independent Test**: Select "Helicopters only". Only cross glyphs remain. Select "High altitude". Low/mid aircraft vanish instantly. Refresh page — filters still applied.

### Implementation for User Story 5

- [X] T032 [US5] Implement filter logic in `frontend/src/hooks/useAircraft.js`: add `filters` state `{ type: 'all'|'planes'|'helicopters', altitude: 'all'|'low'|'mid'|'high' }`, `filteredAircraft` = useMemo filtering the aircraft Map: type filter checks `cat === 'plane'/'helicopter'`, altitude filter: low < 10000ft, mid 10000–30000ft, high > 30000ft, expose `{ filteredAircraft, filters, setFilters }`, persist filters to `PUT /api/v1/user/preferences` on change, restore filters from session `preferences.filters` on load
- [X] T033 [US5] Wire filter state to `frontend/src/components/Filters/Filters.jsx`: connect `setFilters` from `useAircraft`, active filter shows filled dot indicator on button, "All" clears all filters, type and altitude filters are independent (both can be active simultaneously)
- [X] T034 [P] [US5] Implement reconnection/stale data indicator in `frontend/src/components/StatusBar/StatusBar.jsx` and `StatusBar.module.css`: single-line bar at top of viewport, semi-transparent background (`rgba(26,26,26,0.7)`), Space Mono text; shows "Reconnecting..." when `connectionStatus === 'connecting'` (yellow/amber text), shows "Data may be delayed" when WS is connected but no delta received for > 30s; auto-hides when connected and data is fresh; `position: fixed; top: 0; left: 0; right: 0; z-index: 1000`

**Checkpoint**: Filters hide aircraft correctly. Status bar appears on disconnect. Persists across refresh.

---

## Phase 11: US7 — Optional Sign-In (Priority: P3)

**Goal**: Users can optionally create an account for cross-device persistence. Never required. Session migrates on sign-in.

**Independent Test**: Find subtle sign-in link. Register. Anonymous preferences carried over. Sign out → anonymous mode resumes.

### Implementation for User Story 7

- [ ] T035 [US7] Implement email/password auth in `backend/src/controllers/auth.go`: `POST /api/v1/auth/register` (validate email format, min 8-char password via bcrypt cost 12, check email uniqueness, create `users` row, if `anonymous_token` in body copy preferences from `anonymous_sessions` to new user, return JWT signed with `JWT_SECRET` exp 7 days); `POST /api/v1/auth/login` (find user by email, verify bcrypt, same session migration logic, return JWT); `POST /api/v1/auth/logout` (invalidate user_session, create new anonymous session, return new session token)
- [ ] T036 [US7] Implement Google OAuth in `backend/src/controllers/auth.go`: `POST /api/v1/auth/login` with `provider: "google"` body — verify `oauth_token` against Google token-info endpoint, extract `sub` as provider_id, upsert user by `(auth_provider='google', provider_id=sub)`, same session migration logic, return JWT
- [ ] T037 [US7] Implement watchlist + preferences CRUD in `backend/src/controllers/user.go`: `GET /user/preferences` (return user row's `preferences` JSONB), `PUT /user/preferences` (merge-update JSONB, works for both anonymous sessions and authenticated users), `GET /user/watchlist` (return watchlists rows for user_id), `POST /user/watchlist` (insert watchlist row, validate callsign or icao24 required), `DELETE /user/watchlist/:id` (delete row, verify ownership)
- [ ] T038 [US7] Implement sign-in/register UI in `frontend/src/components/Auth/AuthModal.jsx` and `AuthModal.module.css`: subtle "Sign in" text link in top-right corner of map (not a button, not a CTA), clicking opens a minimal overlay (not a modal — no backdrop, just a floating panel), email + password fields + Google OAuth button, toggle between Sign in / Register mode, on success: update `useSession` state with JWT, close panel, no other changes to UX; panel dismissed on Escape or click outside
- [ ] T039 [US7] Implement authenticated features UI in `frontend/src/components/DetailPanel/DetailPanel.jsx`: add "Save" text link in detail panel footer (only when `isAuthenticated`), clicking calls `POST /api/v1/user/watchlist`, show small watchlist icon in top-right corner (only when authenticated) that opens a minimal watchlist panel listing saved flights as clickable rows (each row: callsign + icao24, clicking triggers same detail panel flow)

**Checkpoint**: Register → login → preferences persist → watchlist works → sign out → anonymous resumes.

---

## Phase 12: Polish & Deployment

**Purpose**: Deployment configs, data retention, and smoke tests.

- [X] T040 [P] Create `backend/Dockerfile` (multi-stage: `golang:1.22-alpine` builder → `alpine:3.19` runtime, copy server binary + migrations, `EXPOSE 8080`, `CMD ["/server"]`) and `backend/railway.toml` (build command, start command, env var references)
- [X] T041 [P] Create `frontend/public/_redirects` (Cloudflare Pages SPA routing: `/* /index.html 200`) and `frontend/public/_headers` (cache static assets: `Cache-Control: public, max-age=31536000` for `/assets/*`, no-cache for `index.html`); document build config: build command `npm run build`, output dir `dist`, env var `VITE_API_URL`
- [X] T042 Implement data retention cron job in `backend/src/controllers/cleanup.go`: `StartCleanup(db *pgxpool.Pool)` goroutine with 1-hour ticker, DELETE from `aircraft_positions` WHERE `received_at < NOW() - INTERVAL '6 hours'`, DELETE from `anonymous_sessions` WHERE `expires_at < NOW()`, log purged row counts as structured JSON
- [X] T043 Wire `StartCleanup` goroutine into `backend/app.go` `Start()` method alongside the OpenSky poller goroutine
- [X] T044 Add `frontend/src/App.jsx` final wiring: compose `useSession` + `useWebSocket` / `useAircraft` hooks, render `<Map>` + `<DetailPanel>` + `<SearchBar>` + `<Filters>` + `<StatusBar>` + `<AuthModal>`, pass aircraft data, connection status, and selected aircraft state between components
- [ ] T045 Run end-to-end smoke tests against running stack: verify `GET /api/v1/health` returns `{"status":"ok"}`, WebSocket connect + snapshot received with count > 0, `GET /api/v1/aircraft/search?q=UAL` returns results, frontend map renders in browser with visible aircraft glyphs, detail panel opens on click, search opens on `/` key

---

## Phase 13: New Entity Types (Priority: Immediate)

**Purpose**: Expand beyond aircraft — satellites at orbital altitude, maritime vessels on ocean surface, distinct helicopter icon. Plane type differentiation goes last.

- [X] T046 [P] Separate helicopter icon in `frontend/src/components/Globe/Globe.jsx`: add `buildHelicopterTex()` returning a canvas cross/plus silhouette (4 equal arms), add `heliMesh` InstancedMesh alongside `planeMesh`, route aircraft with `cat === 'helicopter'` to `heliMesh` and all others to `planeMesh` in `rebuildInstances()`
- [X] T047 Satellite tracking backend in `backend/src/controllers/satellite_poller.go`: fetch TLE data from CelesTrak every hour for curated groups (stations, weather, GPS, Iridium, Starlink subset), use `github.com/joshuaferrara/go-satellite` SGP4 propagator to compute current lat/lon/alt_km every 30s, store in Redis hash `satellite:live`, broadcast alongside aircraft in WS hub via extended `fetchAllAircraft()`
- [X] T048 Satellite display in `frontend/src/components/Globe/Globe.jsx`: add `satMesh` InstancedMesh with satellite texture (`buildSatelliteTex()`), compute per-satellite orbital radius `EARTH_R + alt_km/6371`, scale icons smaller at higher orbits, receive via existing WS pipeline (cat="satellite")
- [X] T049 Maritime vessel tracking backend in `backend/src/controllers/ship_poller.go`: connect to AISStream.io free WebSocket with `AISSTREAM_KEY` env var, parse MMSI/lat/lon/COG/SOG, HSET into Redis `ship:live`, prune stale after 10 min, gracefully disabled when key not set
- [X] T050 Maritime vessel display in `frontend/src/components/Globe/Globe.jsx`: add `shipMesh` InstancedMesh with hull silhouette (`buildShipTex()`), render at ocean surface, orient by COG, sea-green colour, receive via WS pipeline (cat="ship")
- [X] T051 [P] Plane type differentiation in `frontend/src/components/Globe/Globe.jsx`: replace single plane canvas texture with size-scaled variants — heavy widebody (B747/A380/A350) gets a wider wing silhouette, regional jets get a smaller icon, use `aircraft.t` (ICAO type code) from adsb.lol to classify, keep a lightweight lookup table for top-50 type codes, fallback to default plane icon for unknown types — this task is intentionally LAST as it is purely cosmetic

---

## Phase 14: Solar System Scene (Priority: Immediate — Platform Expansion)

**Purpose**: Expand the Three.js scene from a single Earth globe to a full heliocentric solar system. Earth becomes one body among nine. All existing Globe.jsx functionality is preserved — the Earth zoom level is unchanged. This phase adds the outer scene context.

**Design reference**: `design.md` Part I §1.3 Camera Behaviour, Part V Planet Texture Sources.

- [ ] T052 [P] Solar system constants in `frontend/src/components/Globe/solarSystem.js`: export `SOLAR_SCALE` (1 WU = 1 Earth radius = 6371 km), `AU_IN_WU = 149597870.7 / 6371`, planet orbital radii in AU, planet physical radii in km → WU, `PLANET_NAMES` array, `PLANET_COLORS` fallback map; export `PLANET_TEXTURES` map pointing to `/textures/planets/*.jpg`; no Three.js imports in this file — pure data
- [ ] T053 [P] Download and commit NASA/Solar System Scope planet textures to `frontend/public/textures/planets/`: `sun.jpg`, `mercury.jpg`, `venus.jpg`, `earth_day.jpg`, `earth_night.jpg`, `earth_clouds.jpg`, `moon.jpg`, `mars.jpg`, `jupiter.jpg`, `saturn.jpg`, `saturn_ring.png` (transparent), `uranus.jpg`, `neptune.jpg` — all ≤ 4096×2048; source from Solar System Scope CC BY 4.0 (`https://www.solarsystemscope.com/textures/`) or NASA Visible Earth; add a `frontend/public/textures/CREDITS.txt` attributing each source
- [ ] T054 Add `SolarSystemScene` component in `frontend/src/components/Globe/SolarSystemScene.jsx`: renders Sun as emissive sphere (radius = `SOLAR_SCALE * 109` Earth radii), renders 8 planets as `THREE.Mesh` SphereGeometry with `MeshPhongMaterial` textured from `/textures/planets/`, applies `THREE.AmbientLight` (0.1 intensity) + `THREE.PointLight` at Sun position (2.0 intensity); planet positions computed from `planet:positions` WS message (heliocentric XYZ in AU → WU); Saturn uses `THREE.RingGeometry` child mesh; all planet meshes added to a `solarGroup` Object3D; `solarGroup` is added to the existing Globe scene alongside the Earth group — the two co-exist in the same Three.js scene
- [ ] T055 Camera scale controller in `frontend/src/components/Globe/Globe.jsx`: add `cameraScale` state `'earth'|'solar'`; when `cameraScale === 'solar'` tween `camera.position` to `[0, AU_IN_WU * 3.5, AU_IN_WU * 2]` (isometric heliocentric view), set `controls.maxDistance = AU_IN_WU * 10`, `controls.minDistance = AU_IN_WU * 0.5`; when `cameraScale === 'earth'` tween back to current Earth distance (existing behaviour), set `controls.maxDistance = EARTH_R * 60`, `controls.minDistance = EARTH_R * 1.001`; expose `setCameraScale` via ref so FilterRail can trigger it; tween uses `TWEEN.js` or manual lerp over 1400ms with `cubic-bezier(0.16, 1, 0.3, 1)` as specified in `design.md`
- [ ] T056 Solar system backend poller in `backend/src/controllers/solar_poller.go`: query NASA Horizons API `https://ssd.jpl.nasa.gov/api/horizons.api` every 5 minutes for all 8 planets + Pluto, parse heliocentric XYZ (AU) from response, store as JSON in Redis hash `planet:positions` (key = lowercase planet name, value = `{"name":"Mars","x":1.23,"y":0.45,"z":0.01,"r_km":3389.5}`); fallback to Le Système Solaire API `https://api.le-systeme-solaire.net/rest/bodies/` for static radius/mass data on first boot; broadcast `solar_system` WS message type on each update alongside existing delta messages

**Checkpoint**: With no filter active, the default view shows the solar system. Planets orbit the Sun at correct relative distances. Switching to "Flights" filter transitions camera to Earth view.

---

## Phase 15: Asteroid & NEO Tracking (Priority: High)

**Purpose**: Track all NASA-catalogued near-Earth objects. Show close-approach alerts. Render orbital paths in the heliocentric scene.

**Design reference**: `design.md` §1.2 Scope, §4.1 Backend Data Sources.

- [ ] T057 NEO backend poller in `backend/src/controllers/neo_poller.go`: call NASA NeoWs `https://api.nasa.gov/neo/rest/v1/feed?start_date=<today>&end_date=<today+7>&api_key=<NASA_API_KEY>` every hour; parse `near_earth_objects` for each asteroid: `id`, `name`, `estimated_diameter_km`, `is_potentially_hazardous`, `close_approach_data[0].miss_distance.kilometers`, `close_approach_data[0].close_approach_date_full`; also call `https://api.nasa.gov/neo/rest/v1/neo/browse?api_key=<NASA_API_KEY>` once daily for full catalogue; store each NEO in Redis hash `asteroid:live` (key = SPK-ID), store close approaches in `asteroid:approach`; emit WS message `{"type":"neo_alert"}` for any object with miss distance < 7,500,000 km; add `NASA_API_KEY` to `backend/constants.go` with env var fallback to `DEMO_KEY`
- [ ] T058 [P] NEO orbital path rendering in `frontend/src/components/Globe/SolarSystemScene.jsx`: for each asteroid received via WS `solar_system` message with orbital elements (`a` semi-major axis, `e` eccentricity, `i` inclination, `om` RAAN, `w` arg of perihelion), compute 360-point orbit ellipse using Keplerian elements → Cartesian; render as `THREE.Line` with `LineDashedMaterial` in amber (#ff6b35) at 30% opacity; render asteroid itself as tiny sphere (radius 0.002 WU); highlight potentially hazardous asteroids (PHA) with red orbit line; limit to 50 NEOs visible at once (closest approach first)
- [ ] T059 NEO detail panel extension in `frontend/src/components/DetailPanel/DetailPanel.jsx`: when selected object `cat === 'asteroid'`, show: designation, diameter range (min/max km), potentially hazardous badge, closest approach date, miss distance (km and lunar distances), relative velocity (km/s), NASA NeoWs URL for more info; format all numbers in IBM Plex Mono as per `design.md`

**Checkpoint**: Asteroids visible in solar system scene as small amber dots with dashed orbit paths. NEO alert fires in StatusBar for any approaching object. Clicking an asteroid opens detail panel with NASA data.

---

## Phase 16: Rocket & Manned Missions (Priority: High)

**Purpose**: Show all active and upcoming launches, crewed missions, and live spacecraft positions.

**Design reference**: `design.md` §1.2 Scope, §3.2 Filter Rail.

- [ ] T060 [P] ISS live tracker in `backend/src/controllers/iss_poller.go`: poll `http://api.open-notify.org/iss-now.json` every 5s, parse `iss_position` (lat/lon), compute altitude (~408 km), store in Redis `iss:position` with 10s TTL; poll `http://api.open-notify.org/astros.json` every 1hr, store in `people:space`; ISS is included in the existing `satellite:live` hash as a special entry with `id = "ISS"`, `cat = "satellite"`, `name = "International Space Station"`, `alt_km = 408`, `crew = N` (from people API)
- [ ] T061 Launch Library 2 poller in `backend/src/controllers/launch_poller.go`: call `https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=20&format=json` every 15 minutes (respects 15 req/hr free tier), parse: launch `id`, `name`, `net` (NET date), `rocket.configuration.name`, `launch_service_provider.name`, `mission.description`, `mission.orbit.name`, `pad.location.name`, `pad.latitude`, `pad.longitude`, `status.name`; store in Redis `launch:upcoming` as JSON array (15min TTL); also call `/launch/previous/?limit=5` for recent launches; expose via `GET /api/v1/launches` REST endpoint returning both lists
- [ ] T062 Mission live position in `backend/src/controllers/mission_tracker.go`: for any launch whose `status.name === "In Flight"` (from LL2), use the rocket's TLE (fetched from CelesTrak by rocket name match) to compute current position via SGP4; store in Redis `mission:live` hash; if no TLE available, use launch pad lat/lon with altitude 0 (pre-launch); broadcast via WS `mission:live` alongside other entity types in WS hub
- [ ] T063 [P] Launch manifest UI in `frontend/src/components/LaunchPanel/LaunchPanel.jsx` and `LaunchPanel.module.css`: right-anchored panel (same slot as DetailPanel, toggled by filter rail "Rockets" icon); shows upcoming launches as cards — each card: mission name in `headline`, provider + rocket in `body-md`, NET countdown timer (live `setInterval` counting down), launch site, orbit type chip, status chip (Go/Hold/TBD); design follows `design.md` — no dividers, vacuum gaps, glassmorphism background; clicking a card flies camera to launch pad on Earth globe; when a mission is "In Flight", shows live position marker on globe and track button
- [ ] T064 People in space panel in `frontend/src/components/LaunchPanel/LaunchPanel.jsx`: add collapsible section below launch cards showing current crew in space (from `people:space`); each person: name, craft, days in space; ISS crew highlighted; collapses to "N people in space" summary line

**Checkpoint**: "Rockets" filter shows launch pad markers on Earth. Upcoming launch countdown visible. ISS shows crew count in detail panel. In-flight missions show live position.

---

## Phase 17: Planetary Maps & Textures (Priority: Medium)

**Purpose**: Each planet has a textured surface. Earth has multiple texture layers. Clicking a planet opens a detail panel with NASA fact sheet data and any active missions.

- [ ] T065 [P] Multi-layer Earth textures in `frontend/src/components/Globe/Globe.jsx`: replace single `earthMesh` texture with layered approach — base layer `earth_day.jpg`, night-side layer `earth_night.jpg` (blended via custom shader using Sun direction dot product to lerp between day/night), optional cloud layer `earth_clouds.jpg` as a slightly larger sphere mesh with `alphaMap` + slow rotation (1 deg/10s); shader uniform `uSunDirection: THREE.Vector3` updated each frame from `planet:positions.sun` WS data
- [ ] T066 [P] Planet detail panel in `frontend/src/components/DetailPanel/DetailPanel.jsx`: when selected object `cat === 'planet'`, fetch static data from `GET /api/v1/planet/:name` (returns Le Système Solaire API data cached in Redis); show: planet name in `display-md`, NASA planetary texture preview (thumbnail from `/textures/planets/`), fact sheet grid — mass (kg), diameter (km), gravity (m/s²), day length (hrs), year length (days), moons count, atmosphere composition; show "Active missions" sub-list: missions from LL2 data whose `mission.orbit` contains the planet name; current distance from Sun (live from `planet:positions`)
- [ ] T067 Planet REST endpoint in `backend/src/controllers/planets.go`: `GET /api/v1/planet/:name` — look up Redis `planet:positions:<name>`, merge with static data from Le Système Solaire API cached at boot, include `active_missions` array filtered from `launch:upcoming` where orbit matches; return combined JSON

**Checkpoint**: Clicking Mars opens detail panel with mass/gravity/moons. Earth shows day/night terminator. Saturn renders with rings.

---

## Phase 18: Design System Migration (Priority: Medium — ongoing alongside features)

**Purpose**: Apply the "Celestial Precision" design system from `design.md` Part II across all UI components. Replaces the current ad-hoc CSS with the canonical token system.

- [ ] T068 [P] Design tokens in `frontend/src/styles/tokens.css`: CSS custom properties for all colours from `design.md` §2.2 (`--surface-dim`, `--surface`, `--surface-container-low`, etc.), all typography scales (`--font-display`, `--font-headline`, etc.), spacing scale (`--space-1` through `--space-12` in 4px increments), motion tokens (`--ease-camera`, `--ease-panel`, `--duration-panel`, `--duration-camera`); import in `frontend/src/main.jsx`; no component changes yet — tokens only
- [ ] T069 [P] Google Fonts import for Space Grotesk + IBM Plex Mono in `frontend/index.html`: add `<link>` preconnect and stylesheet for `Space+Grotesk:wght@400;600;700` and `IBM+Plex+Mono:wght@400;500`; Inter is already loaded or use system sans-serif fallback; update `frontend/src/styles/global.css` `font-family` to `'Space Grotesk', system-ui, sans-serif`; update `body` background to `var(--surface-dim)`
- [ ] T070 Orbital HUD component in `frontend/src/components/HUD/HUD.jsx` and `HUD.module.css`: fixed position, four corners — top-left shows camera altitude (km), lat/lon of camera target, current scale label; top-right shows tracked object count, WS feed latency (ms), UTC timestamp updated every second; all text `label-sm` IBM Plex Mono; background `rgba(15, 20, 25, 0.6)` with `backdrop-filter: blur(10px)`; no border — atmospheric shift only; as per `design.md` §2.5 "Orbital HUD"
- [ ] T071 [P] Filter rail component in `frontend/src/components/FilterRail/FilterRail.jsx` and `FilterRail.module.css`: left-edge vertical strip; 7 icon buttons (Flights ✈, Ships 🚢, Satellites 🛰, Asteroids ☄, Rockets 🚀, Planets 🪐, Earth 🌍); each button `48×48px`, `surface-container-high` background; active state: `surface-tint` border at 100% opacity + Starlight Gradient icon tint; inactive: ghost border 15%; clicking a filter dispatches to `Globe.jsx` via `onFilterChange` callback which triggers `setCameraScale` + entity visibility toggles; replaces current `Filters.jsx` horizontal bar (retain Filters.jsx for mobile breakpoint ≤768px)
- [ ] T072 Apply tokens to DetailPanel in `frontend/src/components/DetailPanel/DetailPanel.module.css`: replace all hardcoded hex values with `var(--*)` tokens; ensure all numerical values use IBM Plex Mono (`font-family: var(--font-mono)`); panel background `var(--surface-container)` with `backdrop-filter: blur(16px)`; track button uses Starlight Gradient when active; no dividers — spacing only; verify ghost border on container edges (`border: 1px solid rgba(59, 73, 76, 0.15)`)
- [ ] T073 [P] Apply tokens to SearchBar, StatusBar, LaunchPanel: same pattern as T072 — replace hardcoded values with tokens, enforce Mono on all data fields, glassmorphism backgrounds, no solid borders; status chip for NEO alert uses `--tertiary-container` and `--chip-glow-active`

**Checkpoint**: Full UI uses token system. All numerical telemetry is IBM Plex Mono. No solid 1px borders. Background differentiation uses tonal layering only. Glassmorphism on all floating panels.

---

## Phase 19: Security Hardening & Production Readiness (Priority: Immediate)

**Purpose**: Address all outstanding security findings before deployment. No dummy data. Complete headers. Vercel-ready.

- [ ] T074 Remove all dummy/seed data from `frontend/src/App.jsx`: delete `SEED_SHIPS`, `SEED_AIRCRAFT`, `KTS_TO_DEG_PER_MS` constants; remove `demoAircraft` state + drift useEffect; remove `demoShips` state + drift useEffect; remove `issData` state + orbital simulation useEffect; simplify `aircraftWithShips` to `filteredAircraft` directly (no demo merge); remove unused imports; verify app still boots with only live API data
- [ ] T075 [P] Security headers in `frontend/public/_headers`: add `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://a.basemaps.cartocdn.com https://server.arcgisonline.com https://*.planespotters.net https://visibleearth.nasa.gov https://www.solarsystemscope.com; connect-src 'self' wss: https://api.planespotters.net https://cdn.jsdelivr.net https://api.nasa.gov https://api.open-notify.org https://ll.thespacedevs.com; worker-src 'self' blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'`; add `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`; add `Cross-Origin-Opener-Policy: same-origin`; add `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- [ ] T076 [P] Fix `backend/src/middlewares/security.go`: change HSTS condition from `r.TLS != nil` to `r.Header.Get("X-Forwarded-Proto") == "https" || r.TLS != nil` (works behind Railway/Cloudflare proxy); add `Cross-Origin-Opener-Policy: same-origin`; add `Cross-Origin-Resource-Policy: cross-origin` (API responses consumed cross-origin by frontend); update CSP `img-src` and `connect-src` to include new NASA / LL2 / Open Notify endpoints
- [ ] T077 [P] Add `NASA_API_KEY` and `LL2_BASE_URL` to `backend/constants.go` and `backend/.env.example`; ensure all new pollers (T057, T060, T061) read from env with documented defaults; update `backend/.env.example` with all new keys

**Checkpoint**: `GET /` headers show CSP in enforcement mode, HSTS, COOP. Security scanner shows 0 issues. No dummy data in browser network tab.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — all 4 tasks run in parallel immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — requires DB + Redis + models
- **US6 (Phase 4)**: Depends on Phase 2 — can run in parallel with US1
- **US8 (Phase 5)**: Depends on US6 (session token) + US1 backend WebSocket
- **US2 (Phase 6)**: Depends on Phase 1 (frontend scaffold) — frontend can start with mock data
- **US3 (Phase 7)**: Depends on US1 backend (poller) + US2 (map renders)
- **US4 (Phase 8)**: Depends on US6 (session) + US2 (map to fly to)
- **US9 (Phase 9)**: Depends on US2, US3, US4 (components to make responsive)
- **US5 (Phase 10)**: Depends on US8 (aircraft state in hooks)
- **US7 (Phase 11)**: Depends on US6 (session migration) + US3 (watchlist in panel)
- **Polish (Phase 12)**: Depends on all stories complete
- **Solar System (Phase 14)**: Depends on Phase 13 (Globe.jsx InstancedMesh pattern established); T052/T053 run in parallel immediately
- **Asteroids (Phase 15)**: Depends on Phase 14 (heliocentric scene exists); T057/T058 run in parallel
- **Missions (Phase 16)**: Depends on Phase 13 (satellite pattern for ISS); T060/T061 run in parallel
- **Planetary Maps (Phase 17)**: Depends on Phase 14 (planet spheres exist)
- **Design System (Phase 18)**: Depends on nothing — T068/T069 (tokens) run immediately in parallel with any other work; remaining tasks depend on T068
- **Security (Phase 19)**: T074/T075/T076/T077 all run in parallel immediately — no dependencies

### User Story Dependencies

- **US1 (P1)**: Foundational → US1 backend, no frontend dep
- **US2 (P1)**: Frontend scaffold → US2 (can use mock data before backend ready)
- **US6 (P1)**: Foundational → US6 (parallel with US1)
- **US8 (P1)**: US6 + US1 backend WS
- **US3 (P2)**: US1 backend + US2 frontend
- **US4 (P2)**: US6 + US2 frontend
- **US9 (P2)**: US2 + US3 + US4
- **US5 (P3)**: US8 (aircraft state hooks)
- **US7 (P3)**: US6 (session migration) + US3 (watchlist UI)

### Parallel Opportunities

All Phase 1 tasks (T001–T004) run in parallel.
Within Phase 2: T006, T007, T008, T009 run in parallel after T005.
US1 backend (Phase 3) + US6 backend (Phase 4) run in parallel after Phase 2.
US2 frontend (Phase 6) runs in parallel with US1 backend using mock data.
Once US8 completes, US3 and US4 can proceed in parallel.

---

## Parallel Example: Phase 1

```bash
# All setup tasks launch simultaneously:
Task T001: "Create Go backend scaffold in backend/"
Task T002: "Create Vite + React frontend scaffold in frontend/"
Task T003: "Create database migration files in backend/migrations/"
Task T004: "Create helicopter-types.json and backend/src/utils/helicopter.go"
```

## Parallel Example: US1 + US2 Backend + Frontend

```bash
# After Phase 2 completes, launch in parallel:
Task T012: "OpenSky poller in backend/src/controllers/poller.go"   # backend
Task T020: "Map component in frontend/src/components/Map/Map.jsx"   # frontend (mock data)
Task T015: "Session management in backend/src/controllers/session.go"
```

---

## Implementation Strategy

### MVP First (US1 + US2 + US6 + US8 — Core Experience)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3 (US1) + Phase 4 (US6) in parallel
4. Complete Phase 5 (US8) + Phase 6 (US2) in parallel
5. **STOP and VALIDATE**: Open browser, see live aircraft on newspaper-dot map
6. Deploy/demo the core product

### Incremental Delivery

1. MVP above → "Open the page. See the sky." works
2. Add Phase 7 (US3 Detail Panel) → Click to reveal works
3. Add Phase 8 (US4 Search) → Find any flight
4. Add Phase 9 (US9 Responsive) → Works on mobile
5. Add Phase 10 (US5 Filters) → Reduce noise
6. Add Phase 11 (US7 Auth) → Optional accounts
7. Phase 12 (Polish + Deploy) → Production
8. **Phase 19 (Security)** → Production hardening — run immediately in parallel with any phase
9. **Phase 18 (Design tokens)** → T068/T069 run immediately; rest migrated component by component
10. **Phase 14 (Solar System)** → Heliocentric scene added to existing Globe
11. **Phase 15 (Asteroids)** → NEOs tracked in solar scene
12. **Phase 16 (Missions)** → ISS live + launch countdown
13. **Phase 17 (Planetary Maps)** → Textured planets + fact panels

### Suggested MVP Scope

Phases 1–6 only (T001–T023 + T044). This delivers:
- Live aircraft on dot-projection map ✓
- Real-time updates ✓
- Anonymous session + preferences ✓
- Smooth interpolation + stale fade ✓
- Clustering at low zoom ✓

Everything else is progressive enhancement on top.

---

## Notes

- [P] tasks = different files, no shared state conflicts
- Each user story phase ends with a checkpoint that can be independently validated
- Frontend US2 (map + markers) can be built with mock aircraft data before backend is ready — use a static JSON fixture in `useAircraft` for development
- All Go errors must use structured JSON logging: `{"timestamp":"...","level":"error","service":"poller","message":"..."}`
- Never block on external API failures — all external calls must have timeout context (15s max)
- Session token generation: `crypto/rand.Read(32 bytes)` → hex encode → prefix `skd_anon_`
- Commit after each task or logical group; verify checkpoint passes before moving to next phase
