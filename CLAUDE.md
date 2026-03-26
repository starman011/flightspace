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
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **flightspace** (507 symbols, 956 relationships, 38 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/flightspace/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/flightspace/context` | Codebase overview, check index freshness |
| `gitnexus://repo/flightspace/clusters` | All functional areas |
| `gitnexus://repo/flightspace/processes` | All execution flows |
| `gitnexus://repo/flightspace/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## CLI

- Re-index: `npx gitnexus analyze`
- Check freshness: `npx gitnexus status`
- Generate docs: `npx gitnexus wiki`

<!-- gitnexus:end -->
