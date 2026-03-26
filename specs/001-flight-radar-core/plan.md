# Implementation Plan: SkyDot — Real-Time Flight Radar Core

**Branch**: `001-flight-radar-core` | **Date**: 2026-03-12 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-flight-radar-core/spec.md`

---

## Summary

Build the complete SkyDot flight radar web application: a minimalistic, real-time flight
tracking app with a halftone/dot-projection newspaper aesthetic. The system ingests live
aircraft positions from OpenSky Network, caches them in Redis, broadcasts updates via
WebSocket to React clients, and supports anonymous sessions with optional sign-in.

**Stack**: Go 1.22 (backend) + React 18 + Vite (frontend) + PostgreSQL 16 + Redis (data)
**Deployment**: Cloudflare Pages (frontend) + Railway (backend) + Neon + Upstash — $0/month

---

## Technical Context

**Language/Version**: Go 1.22+ (backend), JavaScript/React 18 (frontend)
**Primary Dependencies**: gorilla/websocket, pgx/v5, go-redis/v9, golang-jwt/jwt/v5,
  bcrypt, golang-migrate (backend); React, Leaflet 1.9, react-leaflet (frontend)
**Storage**: PostgreSQL 16 (Neon) for users/sessions/positions; Redis (Upstash) for
  live aircraft state, session cache, rate limiting
**Testing**: Go testing stdlib + testcontainers-go (backend); Vitest (frontend unit);
  Playwright (E2E)
**Target Platform**: Linux server (Railway, single binary); Modern browsers (Chrome/FF/Safari/Mobile)
**Project Type**: web-service (backend) + web-app (frontend)
**Performance Goals**: FCP < 800ms, 1000 aircraft renders < 100ms, WS updates every 5s,
  100 concurrent WebSocket users on free tier
**Constraints**: $0/month free tier, JS bundle < 250KB gzipped, backend memory < 512MB,
  max 3 top-level projects, max 10 frontend deps, max 8 backend deps
**Scale/Scope**: 100 concurrent users (free tier) → 10K+ (paid), 5K–50K aircraft tracked

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### Article I: Three-Tier Architecture

- [x] Presentation: React (Vite) only — no direct DB calls
- [x] Business Logic: Go net/http + gorilla/websocket — no direct client access to Data tier
- [x] Data: PostgreSQL + Redis accessed only via backend typed interfaces
- [x] Each tier independently deployable (Cloudflare Pages / Railway / Neon+Upstash)

### Article II: Minimalism-First

- [x] Visual: Dot-projection glyphs only — no icons, no images, no gradients
- [x] Interaction: Zero clicks to core experience; all extras are progressive disclosure
- [x] Code: No abstraction layers without 3+ pattern repeats; native WebSocket API (no lib)

### Article V: Test-First

- [x] Contract tests defined first in `contracts/` (see Phase 1)
- [x] Integration tests use real PostgreSQL + Redis (testcontainers-go)
- [x] No live external API in tests (OpenSky responses recorded + replayed)
- [x] TDD order enforced: contract → integration → unit → E2E

### Article VI: Free-Tier-First

- [x] $0/month initial deployment (Cloudflare Pages + Railway + Neon + Upstash)
- [x] All free tier limits documented (see Section 7 Risks)
- [x] Graceful degradation built in: stale data indicator, rate limit handling

### Article VII: Simplicity Gate

- [x] Exactly 3 top-level projects: `frontend/`, `backend/`, `infra/`
- [x] Frontend dependencies: 5 (react, react-dom, leaflet, react-leaflet, vite devDep) ≤ 10
- [x] Backend dependencies: 6 (gorilla/websocket, pgx/v5, go-redis/v9, jwt/v5, bcrypt,
  golang-migrate) ≤ 8
- [x] No future-proofing: v1 features only, no provider abstractions

### Article VIII: Data Integrity

- [x] Hot data (current positions): Redis only, TTL 30s
- [x] Warm data (recent paths): PostgreSQL, last 24h
- [x] Aircraft callsign + ICAO24 as canonical identifier
- [x] Positions are append-only

### Article IX: Error Handling

- [x] Structured JSON logging planned (timestamp, level, service, trace_id, message, data)
- [x] GET /health endpoint returns tier-level status
- [x] GET /metrics endpoint returns connection counts, cache stats, API latencies

**Gate Status: ALL ARTICLES PASS** ✅

---

## Project Structure

### Documentation (this feature)

```text
specs/001-flight-radar-core/
├── plan.md              # This file
├── research.md          # Phase 0 — technology decisions and rationale
├── data-model.md        # Phase 1 — database schema + entity relationships
├── quickstart.md        # Phase 1 — step-by-step local dev + validation guide
├── contracts/           # Phase 1 — REST API + WebSocket message contracts
│   ├── rest-api.md
│   └── websocket.md
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── controllers/           # HTTP handlers — parse input, call services, return JSON
│   │   ├── health.go          # GET /health, GET /metrics
│   │   ├── aircraft.go        # GET /aircraft/:icao24, GET /aircraft/search
│   │   ├── session.go         # POST /session
│   │   ├── auth.go            # POST /auth/register, /auth/login, /auth/logout
│   │   ├── user.go            # GET/PUT /user/preferences, watchlist CRUD
│   │   └── ws.go              # WebSocket upgrade + client handler
│   ├── db/
│   │   ├── index.go           # Connection init, pool management
│   │   ├── postgres.go        # PostgreSQL helpers, migration runner
│   │   └── redis.go           # Redis client init, pipeline helpers
│   ├── middlewares/
│   │   ├── auth.go            # JWT validation, session extraction
│   │   ├── cors.go            # CORS for Cloudflare Pages origin
│   │   ├── ratelimit.go       # Redis-based rate limiting (100 req/min/IP)
│   │   └── logging.go         # Structured JSON request logging
│   ├── models/
│   │   ├── aircraft.go        # Aircraft, AircraftPosition, LiveAircraft structs
│   │   ├── session.go         # AnonymousSession, UserSession structs
│   │   ├── user.go            # User, Watchlist, FlightHistory structs
│   │   └── websocket.go       # WSMessage, WSSnapshot, WSDelta structs
│   ├── routes/
│   │   └── index.go           # All route definitions, maps paths → controllers
│   └── utils/
│       ├── token.go           # Session token generation, JWT sign/verify
│       ├── conversion.go      # Unit conversions (meters→feet, m/s→knots)
│       ├── response.go        # JSON response helpers, error formatting
│       └── helicopter.go      # Helicopter type code lookup map
├── tests/
│   ├── contract/              # Schema validation tests (run first)
│   ├── integration/           # Real DB + Redis tests (testcontainers)
│   └── unit/                  # Pure business logic tests
├── migrations/                # SQL migration files (up/down pairs)
├── app.go                     # App struct, dependency wiring, graceful shutdown
├── constants.go               # App-wide constants
├── main.go                    # Entry point
├── .env.example
├── go.mod
├── go.sum
└── Dockerfile

frontend/
├── public/
│   └── data/
│       ├── helicopter-types.json   # ICAO type codes for helicopter detection
│       └── airlines.json           # ICAO operator codes → airline names
├── src/
│   ├── components/
│   │   ├── Map/
│   │   │   ├── Map.jsx             # Leaflet map wrapper, full viewport
│   │   │   ├── Map.module.css
│   │   │   ├── AircraftLayer.jsx   # Canvas renderer for dot-projection glyphs
│   │   │   └── TrailLayer.jsx      # Polyline trail for selected aircraft
│   │   ├── DetailPanel/
│   │   │   ├── DetailPanel.jsx     # Slide-in / bottom sheet flight details
│   │   │   └── DetailPanel.module.css
│   │   ├── SearchBar/
│   │   │   ├── SearchBar.jsx       # / or Ctrl+K activated search
│   │   │   └── SearchBar.module.css
│   │   ├── Filters/
│   │   │   ├── Filters.jsx         # Aircraft type + altitude range toggles
│   │   │   └── Filters.module.css
│   │   └── StatusBar/
│   │       ├── StatusBar.jsx       # Reconnecting indicator, data staleness
│   │       └── StatusBar.module.css
│   ├── hooks/
│   │   ├── useWebSocket.js         # WS connect/reconnect/parse + exponential backoff
│   │   ├── useAircraft.js          # Aircraft state management (snapshot + delta merge)
│   │   └── useSession.js           # Anonymous session creation + preferences
│   ├── utils/
│   │   ├── interpolation.js        # Position interpolation between updates
│   │   └── formatters.js           # Altitude (ft), speed (knots), distance display
│   ├── styles/
│   │   ├── theme.css               # CSS custom properties (3-color palette, fonts)
│   │   └── global.css              # Body reset, map container
│   ├── App.jsx
│   └── main.jsx
├── tests/
│   ├── unit/                       # Vitest unit tests (interpolation, formatters)
│   └── e2e/                        # Playwright E2E tests
├── .env.example
├── package.json
├── vite.config.js
└── index.html

infra/
├── cloudflare-pages.toml           # Frontend build config
├── railway.toml                    # Backend deploy config
└── docker-compose.yml              # Local dev: PostgreSQL + Redis
```

**Structure Decision**: Option 2 (web application) — separate `frontend/`, `backend/`, `infra/`
directories at repository root. Exactly 3 projects as required by Article VII.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLOUDFLARE                                │
│  ┌──────────────┐    ┌──────────────────────────────────┐       │
│  │  Pages (CDN) │    │  DNS + SSL + DDoS Protection     │       │
│  │  React SPA   │    └──────────────┬───────────────────┘       │
│  └──────┬───────┘                   │                            │
└─────────┼───────────────────────────┼────────────────────────────┘
          │ HTTPS                     │ HTTPS / WSS
          ▼                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                     GO BACKEND (Railway)                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │  REST API   │  │  WebSocket   │  │  OpenSky Poller        │  │
│  │  /api/v1/*  │  │  Hub         │  │  (goroutine, 10-15s)   │  │
│  └──────┬──────┘  └──────┬───────┘  └──────────┬─────────────┘  │
│         └────────────────┴──────────────────────┘                │
│                           │  Data Layer (db/)                    │
└───────────────────────────┼───────────────────────────────────────┘
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
        ┌──────────┐  ┌──────────┐  ┌──────────────┐
        │PostgreSQL│  │  Redis   │  │ OpenSky API  │
        │ (Neon)   │  │(Upstash) │  │ (External)   │
        │users     │  │live      │  │/states/all   │
        │sessions  │  │aircraft  │  │              │
        │positions │  │sessions  │  │              │
        └──────────┘  └──────────┘  └──────────────┘
```

---

## API Surface

### REST Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/health` | None | Tier-level health status |
| GET | `/api/v1/metrics` | None | Connection counts, cache stats, latencies |
| GET | `/api/v1/aircraft/:icao24` | Session | Aircraft details + recent positions |
| GET | `/api/v1/aircraft/search?q=` | Session | Search by callsign/flight number |
| POST | `/api/v1/session` | None | Create anonymous session |
| POST | `/api/v1/auth/register` | None | Email/password registration |
| POST | `/api/v1/auth/login` | None | Login (email/password or OAuth) |
| POST | `/api/v1/auth/logout` | Auth | Logout, revert to anonymous |
| GET | `/api/v1/user/preferences` | Auth | Get preferences |
| PUT | `/api/v1/user/preferences` | Auth | Update preferences |
| GET | `/api/v1/user/watchlist` | Auth | List saved flights |
| POST | `/api/v1/user/watchlist` | Auth | Add flight to watchlist |
| DELETE | `/api/v1/user/watchlist/:id` | Auth | Remove from watchlist |

### WebSocket Events

**Endpoint**: `/ws?token=<session_token>`

| Direction | Event | Description |
|-----------|-------|-------------|
| Server → Client | `snapshot` | Full aircraft state on connect |
| Server → Client | `delta` | Position updates every 5s |
| Server → Client | `error` | Server-side error notification |
| Client → Server | `set_bounds` | Update viewport for server-side filtering |
| Client → Server | `ping` | Keepalive |

Full schemas in `contracts/`.

---

## Implementation Phases

### Phase 1: Foundation — Backend Core + DB

**Goal**: Backend boots, connects to all services, polls OpenSky, caches live state.

1. Go project scaffold + module structure
2. PostgreSQL schema migrations (all tables — see data-model.md)
3. Redis connection + live aircraft state management
4. OpenSky API poller goroutine (10-15s interval, recorded responses for tests)
5. Aircraft position parsing + deduplication logic
6. Health check endpoint (`GET /health`, `GET /metrics`)
7. Structured JSON logging middleware

**Test order**: Contract (OpenSky response schema) → Integration (poller → DB/Redis) → Unit (dedup)

---

### Phase 2: Real-Time Layer — WebSocket Hub

**Goal**: Clients receive live aircraft data via WebSocket.

1. WebSocket hub (register/unregister/broadcast)
2. Client connection handler with session token validation
3. Snapshot delivery on connect (from Redis live state)
4. Delta computation + broadcast goroutine (every 5s)
5. Viewport-based filtering via `set_bounds` message
6. Stale connection cleanup
7. Connection count metric tracking

**Test order**: Contract (WS message schemas) → Integration (connect → snapshot → delta) → Unit (hub, delta diff)

---

### Phase 3: REST API — Search, Details, Sessions

**Goal**: All REST endpoints functional.

1. Anonymous session creation + secure HTTP-only cookie
2. Aircraft detail endpoint (callsign, route, positions from DB)
3. Search endpoint (PostgreSQL full-text on callsign/flight number)
4. Rate limiting middleware (Redis token bucket, 100 req/min/IP)
5. CORS configuration for Cloudflare Pages origin

**Test order**: Contract (endpoint schemas) → Integration (full request cycle) → Unit (session tokens, rate limiter)

---

### Phase 4: Authentication — Optional Sign-In

**Goal**: Email/password + Google/Apple OAuth, anonymous session migration.

1. Email/password registration with bcrypt
2. Login endpoint with JWT generation + refresh
3. Google OAuth 2.0 flow
4. Apple OAuth flow
5. Anonymous → Authenticated session migration
6. Watchlist CRUD endpoints
7. Preferences sync endpoints
8. Password reset via email

**Test order**: Integration (full auth flow + migration) → Unit (JWT, bcrypt)

---

### Phase 5: Frontend — Map & Visualization

**Goal**: React app renders live dot-projection aircraft on Leaflet map.

1. Vite + React project scaffold
2. Leaflet map component (full viewport, CartoDB tiles)
3. Canvas-based aircraft marker renderer (dot-projection glyphs)
4. Plane vs. helicopter glyph differentiation
5. Heading-based marker rotation
6. Smooth position interpolation (`interpolation.js`)
7. Stale aircraft fade-out animation (CSS opacity transition)
8. Zoom-based clustering for dense regions
9. Dark/light theme via CSS custom properties

**Test order**: Unit (interpolation math, clustering) → E2E (page loads, markers visible)

---

### Phase 6: Frontend — Interaction & UX

**Goal**: Full user interaction: search, filter, detail panel, responsive layout.

1. WebSocket connection manager with exponential backoff reconnect
2. Aircraft click → detail panel (slide-in desktop / bottom sheet mobile)
3. Flight trail polyline from recent positions
4. Search bar (`/` or `Ctrl+K`) with 1s debounce
5. Filter toggles (aircraft type + altitude range)
6. "Reconnecting..." status bar indicator
7. Responsive layout breakpoints
8. Anonymous session auto-creation on first load (`useSession` hook)

**Test order**: E2E (click → panel, search → center) → Unit (reconnect logic, filter state)

---

### Phase 7: Integration & Deployment

**Goal**: Full system live on free-tier infrastructure.

1. Cloudflare Pages deployment config (`infra/cloudflare-pages.toml`)
2. Railway deployment config (`infra/railway.toml` + `backend/Dockerfile`)
3. Neon PostgreSQL provisioning + migration run
4. Upstash Redis provisioning + environment config
5. Environment variable setup (`.env.example` → production secrets)
6. Data retention cron (purge positions older than 24h)
7. End-to-end smoke test against production

**Smoke test**: `quickstart.md` validation steps 1–7

---

## File Creation Order (Article V TDD)

```
1. contracts/rest-api.md            → REST endpoint request/response schemas
2. contracts/websocket.md           → WebSocket message type schemas
3. data-model.md                    → Full database schema
4. backend/src/models/              → Go structs matching schema
5. backend/tests/contract/          → Contract tests (must fail first)
6. backend/src/db/ + migrations/    → Make contract tests pass
7. backend/tests/integration/       → Integration tests (must fail first)
8. backend/src/controllers/         → Make integration tests pass
9. backend/src/middlewares/         → Auth, CORS, rate limiting
10. backend/src/routes/index.go     → Wire all routes
11. backend/app.go + main.go        → Wiring + entry point
12. frontend/tests/unit/            → Unit tests for utils/hooks
13. frontend/src/utils/             → Make unit tests pass
14. frontend/src/hooks/             → Make unit tests pass
15. frontend/src/components/        → Map, Detail, Search, Filters
16. frontend/tests/e2e/             → E2E tests
17. infra/                          → Deployment configs
```

---

## Dependency Justification

### Frontend (5 runtime deps — within 10 limit)

| Package | Purpose | Bundle (gzip) | Alternative Rejected |
|---------|---------|---------------|----------------------|
| react | UI rendering | ~6KB | — (core requirement) |
| react-dom | DOM renderer | ~40KB | Paired with React |
| leaflet | Map rendering | ~42KB | MapLibre GL (200KB+), Mapbox (paid API key) |
| react-leaflet | React bindings for Leaflet | ~5KB | Raw Leaflet (20+ extra lines/component) |
| *(vite is devDep, not counted)* | | | |

**Estimated bundle**: ~93KB gzipped ✅ (limit: 250KB)

### Backend (6 deps — within 8 limit)

| Package | Purpose | Alternative Rejected |
|---------|---------|----------------------|
| gorilla/websocket | WebSocket server | stdlib lacks WS; nhooyr/websocket less battle-tested |
| pgx/v5 | PostgreSQL driver + pool | lib/pq (older, no native types, slower) |
| go-redis/v9 | Redis client | redigo (lower-level, more boilerplate) |
| golang-jwt/jwt/v5 | JWT tokens | paseto (niche, less tooling) |
| golang.org/x/crypto/bcrypt | Password hashing | argon2 (better algo, but overkill for v1) |
| golang-migrate | SQL migrations | goose (equivalent), raw SQL (no rollback support) |

---

## Complexity Tracking

> Deviations from Article VII minimalism, justified per constitution.

| Complexity | Justification | Article |
|-----------|---------------|---------|
| Redis as separate service | Sub-millisecond reads for 5s WS broadcast cycle. PostgreSQL alone adds 10-50ms per query × N clients × constant polling — unacceptable at scale. Redis HGETALL on ~5K aircraft = <1ms. | VIII §8.2 |
| WebSocket hub goroutine pattern | Broadcasting to N concurrent clients is not a request/response problem. Hub pattern (single goroutine owning connection map) is the minimal correct solution for safe concurrent access. | VII §7.3, I §1.2 |
| Canvas-based rendering | DOM/SVG markers crash browsers beyond ~500 aircraft. Canvas is the minimum viable renderer to meet the 1,000-aircraft performance target (Article IV §4.1). | IV §4.1 |
| testcontainers-go in test suite | Article V §5.3 mandates real PostgreSQL + Redis in tests. testcontainers-go is the standard minimal solution to spin up real services in CI without external dependencies. | V §5.3 |

---

## Risk Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| OpenSky 100 req/day (unauth) | No live data | Register free OpenSky account (4,000/day). 15s poll = 5,760/day — authenticated required |
| Upstash 10K commands/day | State ops fail | Batch all Redis writes with pipeline. 5,760 polls × 3 cmds = ~17K — pipeline reduces to ~6K effective |
| Railway 500 hrs/month | Backend sleeps | Switch to Fly.io (3 shared VMs, always-on) if Railway limit hit |
| Neon cold-start latency | Slow first query | pgx connection pool + health check pings keep connection warm |
| Leaflet performance @ 5K+ markers | Frame drops | Canvas renderer + viewport culling + zoom-level clustering |
