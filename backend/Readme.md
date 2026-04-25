# ObjectTracer Backend

Go 1.22 backend for ObjectTracer real-time flight radar.

## Setup

```bash
cp .env.example .env
# Fill in DATABASE_URL, REDIS_URL, JWT_SECRET

go mod download
go run .
```

## Structure

```
backend/
├── src/
│   ├── controllers/   # HTTP + WebSocket handlers
│   ├── db/            # PostgreSQL + Redis connections
│   ├── middlewares/   # Auth, CORS, rate limiting, logging
│   ├── models/        # Struct definitions
│   ├── routes/        # Route registration
│   └── utils/         # Token gen, conversions, helpers
├── migrations/        # SQL up/down migration pairs
├── app.go             # App struct + lifecycle
├── constants.go       # Config + env vars
└── index.go           # Entry point
```

## API

- `GET /api/v1/health` — Service health check
- `GET /api/v1/metrics` — Operational metrics
- `POST /api/v1/session` — Create anonymous session
- `GET /api/v1/aircraft/:icao24` — Aircraft detail + trail
- `GET /api/v1/aircraft/search?q=` — Search by callsign
- `WS /ws?token=` — WebSocket live stream

## Deployment

Railway: set env vars, deploy via Dockerfile.
