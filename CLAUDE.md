# flightspace Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-12

## Active Technologies

- Go 1.22+ (backend), JavaScript/React 18 (frontend) + gorilla/websocket, pgx/v5, go-redis/v9, golang-jwt/jwt/v5, (001-flight-radar-core)

## Project Structure

```text
backend/    # Go 1.22 — net/http, gorilla/websocket, pgx/v5, go-redis/v9
frontend/   # React 18 + Vite — Leaflet, CSS Modules
infra/      # docker-compose (local), Railway + Cloudflare Pages (prod)
specs/      # Feature specifications, plans, contracts, data models
```

## Commands

```bash
# Backend
cd backend && go run main.go          # Start server (port 8080)
cd backend && go test ./...           # All tests (requires Docker)
cd backend && go run main.go migrate up  # Run DB migrations

# Frontend
cd frontend && npm run dev            # Dev server (port 5173)
cd frontend && npm test               # Unit tests (Vitest)
cd frontend && npm run test:e2e       # E2E tests (Playwright)

# Local services
docker compose -f infra/docker-compose.yml up -d   # PostgreSQL + Redis
```

## Code Style

- **Go**: stdlib-first, no ORM, typed repository interfaces, structured JSON logs
- **React**: Functional components, hooks only, CSS Modules for styles
- **Both**: No wrapper functions around stdlib/framework features (Article II §2.3)

## Recent Changes

- 001-flight-radar-core: Added Go 1.22+ (backend), JavaScript/React 18 (frontend) + gorilla/websocket, pgx/v5, go-redis/v9, golang-jwt/jwt/v5,

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->

<!-- gitnexus:start -->
<!-- gitnexus:end -->
