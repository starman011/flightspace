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

## Working method — applies to EVERY change
Constitution Article XVI. Ordered; earlier wins on conflict.

1. **Think Before Coding** — state the real cause before writing the fix; if it's
   a guess, say so and verify. Name tradeoffs out loud.
   *Guards: wrong assumptions, hidden confusion, missing tradeoffs.*
2. **Simplicity First** — smallest thing that fully solves it. No abstraction
   until two real callers. Prefer deleting to adding.
   *Guards: overcomplication, bloated abstractions.*
3. **Surgical Changes** — change what the task needs, nothing else. Report
   unrelated finds, don't commit them. **One source of truth per behaviour:**
   grep every writer of what you changed and confirm which wins before claiming
   a fix works.
   *Guards: orthogonal edits, touching code you shouldn't.*
4. **Goal-Driven Execution** — state a runnable success criterion up front.
   For a bug, write the failing test first: the test IS the diagnosis.
   "It builds" is not a success criterion.
   *Guards: unverifiable work.*

## Style
- **Go**: stdlib-first, no ORM, typed repos, structured JSON logs
- **React**: functional + hooks, CSS Modules
- **Both**: no wrappers around stdlib/framework (Art II §2.3)

## Tools
- `/caveman` — activate token-saving mode (~75% output reduction)
- `/caveman:compress <file>` — compress memory files (~45% input savings)
- `/mem-search <query>` — search past session context (claude-mem)
