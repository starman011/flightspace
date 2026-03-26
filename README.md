# Flightspace

A real-time space observatory — track everything moving through Earth's atmosphere and beyond. One viewport that scales from individual aircraft to the entire solar system.

---

## What it tracks

| Object | Source | Update Rate |
|--------|--------|-------------|
| Commercial flights | ADS-B via adsb.lol | 15s |
| Satellites | CelesTrak TLE + SGP4 | 30s |
| ISS | Open Notify | 5s |
| Rocket launches | Launch Library 2 | 15min |
| Near-Earth asteroids | NASA NeoWs | 1hr |
| Planets | NASA Horizons | 5min |
| Space weather | NASA DONKI | 15min |
| Daily astronomy image | NASA APOD | 24hr |

---

## Stack

**Backend** — Go 1.22, `net/http`, gorilla/websocket, pgx/v5, go-redis/v9, golang-jwt

**Frontend** — React 18, Vite, Three.js (3D solar system), CSS Modules, react-router-dom v7

**Infra** — PostgreSQL 16, Redis 7, Railway (backend), Vercel (frontend), Cloudflare (proxy)

---

## Project structure

```
flightspace/
├── backend/
│   ├── src/
│   │   ├── controllers/     # HTTP handlers + background pollers
│   │   ├── db/              # PostgreSQL + Redis connections
│   │   ├── middlewares/     # CORS, auth, rate limiting
│   │   ├── models/          # Go structs
│   │   ├── routes/          # Route registration
│   │   └── utils/           # Shared helpers
│   ├── migrations/          # SQL migration files (up/down)
│   ├── app.go               # Dependency wiring + lifecycle
│   ├── constants.go         # Config + env vars
│   ├── index.go             # Entry point
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/      # React components (Globe, HUD, panels...)
│   │   ├── hooks/           # useAircraft, useWebSocket, useSession...
│   │   └── styles/          # Design tokens + global CSS
│   ├── vite.config.js
│   └── vercel.json
└── infra/
    └── docker-compose.yml   # Local PostgreSQL + Redis
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

Vite automatically proxies `/api/*` and `/ws` to `localhost:8080`.

---

## Environment variables

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Secret for signing JWT tokens |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP listen port |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | CORS allowed origins |
| `NASA_API_KEY` | `DEMO_KEY` | NASA API key (higher rate limits with a real key) |
| `AISSTREAM_KEY` | — | AISStream.io key (ship tracking disabled if absent) |
| `RESEND_API_KEY` | — | Resend key for waitlist confirmation emails |
| `SERVER_DISABLED` | — | Set to `true` to put backend into maintenance mode (serves 503) |

---

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Health check |
| POST | `/api/v1/session` | Create anonymous session |
| GET | `/api/v1/aircraft/search?q=` | Search by callsign / ICAO |
| GET | `/api/v1/aircraft/:icao24` | Flight detail + trail |
| POST | `/api/v1/auth/register` | Register account |
| POST | `/api/v1/auth/login` | Login |
| GET | `/api/v1/launches` | Upcoming rocket launches |
| GET | `/api/v1/asteroids` | Near-Earth asteroid close approaches |
| GET | `/api/v1/apod` | Astronomy Picture of the Day |
| POST | `/api/v1/waitlist` | Waitlist signup |
| GET | `/ws` | WebSocket stream (live aircraft positions) |

---

## Key design decisions

- **No ORM** — raw SQL with pgx/v5 for full control
- **Anonymous-first** — no login required; sessions are ephemeral JWTs
- **Upsert storage** — `aircraft_latest` table caps at ~10k rows regardless of poll frequency (no disk exhaustion)
- **CSS Modules only** — no Tailwind, no CSS-in-JS; all tokens in `tokens.css`
- **One scene** — single Three.js viewport that scales from Earth orbit to the heliocentric solar system

---

## Development commands

```bash
# Backend
cd backend && go test ./...            # Run tests (requires Docker)
cd backend && go run . migrate up      # Run DB migrations

# Frontend
cd frontend && npm test                # Unit tests (Vitest)
cd frontend && npm run test:e2e        # E2E tests (Playwright)
cd frontend && npm run build           # Production build
```

---

## License

MIT
