# flightspace Dev Guide

## Tech
Go 1.22+ backend, React 18 frontend. gorilla/websocket, pgx/v5, go-redis/v9, golang-jwt/jwt/v5.

## Structure
```text
backend/    # Go — net/http, gorilla/ws, pgx, redis
frontend/   # React 18 + Vite, CSS Modules
infra/      # docker-compose (local), Railway + CF Pages (prod)
specs/      # Specs, plans, contracts, data models
```

## Commands
```bash
cd backend && go run main.go            # server :8080
cd backend && go test ./...             # tests (needs Docker)
cd backend && go run main.go migrate up # migrations
cd frontend && npm run dev              # dev :5173
cd frontend && npm test                 # vitest
cd frontend && npm run test:e2e         # playwright
docker compose -f infra/docker-compose.yml up -d  # pg + redis
```

## Style
- **Go**: stdlib-first, no ORM, typed repos, structured JSON logs
- **React**: functional + hooks, CSS Modules
- **Both**: no wrappers around stdlib/framework (Art II §2.3)

## Tools
- `/caveman` — activate token-saving mode (~75% output reduction)
- `/caveman:compress <file>` — compress memory files (~45% input savings)
- `/mem-search <query>` — search past session context (claude-mem)
