<!--
=== SYNC IMPACT REPORT ===

Version Change: 1.0.0 → 1.1.0

Bump Rationale: MINOR — Added Article X (Documentation-First Implementation).
New principle; no existing articles removed or redefined.

Modified Principles:
  [PRINCIPLE_1_NAME] → Article I: Three-Tier Architecture Mandate
  [PRINCIPLE_2_NAME] → Article II: Minimalism-First Design Principle
  [PRINCIPLE_3_NAME] → Article V: Test-First Development Imperative
  [PRINCIPLE_4_NAME] → Article VI: Free-Tier-First Infrastructure
  [PRINCIPLE_5_NAME] → Article VII: Simplicity Gate

Added Sections:
  - Article III: Anonymous-First User Model
  - Article IV: Performance as a Feature
  - Article VIII: Data Integrity & Freshness
  - Article IX: Error Handling & Debugging Philosophy
  - Amendment Log table
  - Enforcement section

Removed Sections:
  - [SECTION_2_NAME] / [SECTION_3_NAME] generic placeholders (subsumed by Articles)

Templates Reviewed:
  ✅ .specify/templates/plan-template.md — Constitution Check section is generic
     ("Gates determined based on constitution file") and correctly defers to this
     document at runtime. No structural changes needed.
  ✅ .specify/templates/spec-template.md — Mandatory sections (User Scenarios,
     Requirements, Success Criteria) align with Articles II, IV, V. No changes needed.
  ✅ .specify/templates/tasks-template.md — Phase structure (Setup → Foundational →
     User Stories → Polish) aligns with Article V TDD ordering and Article I tier
     separation. No changes needed.
  ⚠  .specify/templates/commands/ — Directory does not exist; no command files to update.
  ⚠  README.md — File is empty; no references to update.

Deferred TODOs:
  - None. All fields resolved.

===========================
-->

# SkyDot Constitution

> Immutable principles governing all specification, planning, and implementation
> for the SkyDot project.

---

## Preamble

SkyDot is a minimalistic, real-time flight tracking web application inspired by
the dot-projection print style of New York City newspapers. Every decision —
architectural, visual, or operational — must serve **clarity, performance, and
simplicity**. The system must work beautifully at scale while costing nothing to
start.

---

## Article I: Three-Tier Architecture Mandate

### Section 1.1: Strict Layer Separation

The system SHALL be organized into exactly three tiers with zero cross-cutting:

| Tier | Responsibility | Technology |
|------|---------------|------------|
| **Presentation** | UI rendering, user interaction, map visualization | React (Vite) |
| **Business Logic** | API gateway, data aggregation, caching, auth | Go (net/http + gorilla/websocket) |
| **Data** | Persistence, geospatial indexing, session state | PostgreSQL + Redis |

### Section 1.2: Tier Communication Rules

- Presentation tier SHALL communicate with Business tier ONLY via HTTP REST and WebSocket.
- Business tier SHALL communicate with Data tier ONLY via typed repository interfaces.
- Presentation tier SHALL NEVER access the Data tier directly.
- Each tier MUST be independently deployable and horizontally scalable.

---

## Article II: Minimalism-First Design Principle

### Section 2.1: Visual Minimalism

- The UI SHALL use a **dot-projection / halftone newspaper aesthetic** as its core visual language.
- Maximum of **3 colors** in the base palette (background, dot/primary, accent).
- No gradients, no shadows, no rounded corners exceeding 2px.
- Aircraft SHALL be represented as **styled dots or minimal geometric glyphs** — never photorealistic icons.
- Typography SHALL use a single monospace or newspaper-inspired typeface family.
- Whitespace is a feature, not wasted space.

### Section 2.2: Interaction Minimalism

- The application MUST be usable within **3 seconds** of first load — no onboarding, no modals, no signup walls.
- Core experience (viewing live flights on map) requires **zero clicks** after page load.
- Every additional feature (search, filters, details) is progressive disclosure — hidden until requested.
- Maximum **2 levels of navigation depth** from any screen.

### Section 2.3: Code Minimalism

- Prefer zero-dependency solutions over libraries for non-critical features.
- Every external dependency MUST have documented justification.
- No abstraction layers unless the same pattern repeats **3+ times**.
- No wrapper functions around standard library or framework features.

---

## Article III: Anonymous-First User Model

### Section 3.1: Zero-Friction Entry

- On first visit, the system SHALL automatically create an **anonymous session** with a unique identifier.
- Anonymous users SHALL have full access to: live map, flight search, flight details, basic filters.
- No feature SHALL require authentication to function at its basic level.
- Anonymous sessions persist via a secure HTTP-only cookie with a 30-day TTL.

### Section 3.2: Optional Authentication

- Sign-in is ALWAYS optional and SHALL be presented as a benefit, never a gate.
- Authentication enables: saved preferences, custom watchlists, persistent history.
- Sign-in SHALL support email/password and OAuth (Google) at minimum.
- Signing in SHALL migrate the anonymous session data seamlessly — no data loss.

### Section 3.3: Privacy by Default

- Anonymous users SHALL NOT be tracked beyond session identification.
- No analytics, telemetry, or third-party scripts without explicit opt-in.
- User data is the user's. Export and delete capabilities are mandatory.

---

## Article IV: Performance as a Feature

### Section 4.1: Load Time Budgets

| Metric | Target | Hard Limit |
|--------|--------|------------|
| First Contentful Paint | < 800ms | < 1.5s |
| Time to Interactive | < 1.5s | < 3s |
| WebSocket First Data | < 500ms after connect | < 1s |
| Map Render (1000 aircraft) | < 100ms | < 300ms |
| JS Bundle Size (gzipped) | < 150KB | < 250KB |

### Section 4.2: Real-Time Data Pipeline

- Aircraft position updates SHALL arrive via WebSocket at **5-second intervals** minimum.
- The backend SHALL aggregate and deduplicate upstream API data before broadcasting.
- Client-side interpolation SHALL smooth aircraft movement between updates.
- Stale aircraft (no update > 60s) SHALL fade out, then be removed at 120s.

### Section 4.3: Scalability Targets

| Stage | Concurrent Users | Aircraft Tracked | Infrastructure |
|-------|-----------------|------------------|---------------|
| Free Tier | 100 | 5,000 | Single instance |
| Growth | 1,000 | 20,000 | 2-3 instances + LB |
| Scale | 10,000+ | 50,000+ | Auto-scaling cluster |

---

## Article V: Test-First Development Imperative

### Section 5.1: Test Ordering

All implementation SHALL follow strict TDD:

1. **Contract tests** — API contracts and WebSocket message schemas defined first
2. **Integration tests** — Real database, real Redis, real WebSocket connections
3. **Unit tests** — Pure business logic only (no mocking infrastructure)
4. **E2E tests** — Critical user flows (load page → see flights → click detail)

### Section 5.2: Coverage Requirements

- Business logic: **≥ 80%** line coverage
- API handlers: **100%** of documented endpoints tested
- WebSocket events: **100%** of message types tested
- Frontend: Critical render paths and user interactions tested

### Section 5.3: Test Environment

- Tests MUST use real PostgreSQL (via testcontainers or equivalent).
- Tests MUST use real Redis instances.
- External flight API calls MUST be recorded and replayed (no live API in tests).

---

## Article VI: Free-Tier-First Infrastructure

### Section 6.1: Cost Constraints

- Initial deployment MUST cost **$0/month** using free tiers.
- Every infrastructure choice MUST document its free tier limits.
- Paid upgrades SHALL be additive — never requiring re-architecture.

### Section 6.2: Approved Free-Tier Services

| Service | Provider | Free Tier Limit |
|---------|----------|----------------|
| Database (PostgreSQL) | Neon / Supabase | 500MB-1GB storage |
| Cache (Redis) | Upstash | 10K commands/day |
| Backend Hosting | Railway / Fly.io | Limited compute hours |
| Frontend Hosting | Cloudflare Pages | Unlimited static |
| Domain / CDN | Cloudflare | Free plan |
| Flight Data API | OpenSky Network | Rate-limited, no auth |

### Section 6.3: Graceful Degradation

- If a free-tier limit is hit, the system SHALL degrade gracefully (stale data,
  reduced update frequency) — NEVER crash or error to the user.
- Rate limit handling MUST be built into every external API integration from day one.

---

## Article VII: Simplicity Gate

### Section 7.1: Project Structure

- Maximum **3 top-level projects** at launch: `frontend/`, `backend/`, `infra/`
- Additional projects require documented justification and constitution amendment.

### Section 7.2: Dependency Budget

- Frontend: Maximum **10 direct dependencies** (React, map library, WebSocket client, etc.)
- Backend: Maximum **8 direct dependencies** (router, WebSocket, DB driver, Redis, etc.)
- Every dependency MUST be justified in the implementation plan.

### Section 7.3: No Future-Proofing

- Do NOT implement features "we might need later."
- Do NOT create abstractions for "possible future providers."
- Build for today's requirements. Refactor when requirements change.

---

## Article VIII: Data Integrity & Freshness

### Section 8.1: Data Flow Architecture

```
[OpenSky API] → [Go Poller] → [Redis Cache] → [WebSocket Broadcast] → [React Client]
                      ↓
              [PostgreSQL Archive]
```

### Section 8.2: Data Freshness Rules

- **Hot data** (current positions): Redis only, TTL 30 seconds, served via WebSocket.
- **Warm data** (recent flight paths): PostgreSQL, last 24 hours, served via REST.
- **Cold data** (historical): PostgreSQL, compressed, served via REST with pagination.

### Section 8.3: Data Consistency

- Aircraft callsign + ICAO24 is the canonical unique identifier.
- Position updates are append-only — never mutate historical positions.
- Client receives full state snapshot on connect, then incremental deltas.

---

## Article IX: Error Handling & Debugging Philosophy

### Section 9.1: First-Principles Debugging

When a bug is encountered:

1. **Isolate** — Identify the exact tier (Presentation / Business / Data).
2. **Reproduce** — Create a minimal reproduction case.
3. **Decompose** — Break the failing behavior into atomic operations.
4. **Verify** — Check each atomic operation independently.
5. **Fix** — Address the root cause, not the symptom.
6. **Protect** — Add a test that catches this specific failure.

### Section 9.2: Structured Logging

- All backend logs SHALL be structured JSON with:
  `timestamp`, `level`, `service`, `trace_id`, `message`, `data`.
- Log levels: `debug`, `info`, `warn`, `error` — no custom levels.
- Every external API call logs: URL, status code, latency, and error (if any).

### Section 9.3: Observability

- Health check endpoint: `GET /health` — returns tier-level status.
- Metrics endpoint: `GET /metrics` — returns connection counts, cache hit rates, API latencies.
- WebSocket connection count and message throughput SHALL be observable.

---

## Article X: Documentation-First Implementation

### Section 10.1: Research Before Building

Before implementing any non-trivial feature, algorithm, or integration, the
implementor MUST:

1. **Check official documentation** — Read the primary docs for every library,
   API, or platform involved (e.g. Three.js docs, MDN, OpenSky API reference).
2. **Search for open source prior art** — Look for existing OSS solutions,
   examples, or reference implementations (GitHub, npm, pkg.go.dev, CodePen).
3. **Evaluate adoption** — Prefer solutions with active maintenance, known
   usage, and clear licensing over custom one-offs.
4. **Document the search** — Record what was found, what was chosen, and why
   in the implementation plan or task notes. "Checked Three.js InstancedMesh
   docs + examples/jsm/: used official approach" is sufficient.

### Section 10.2: Hierarchy of Implementation Sources

Implementations MUST follow this priority order — do not skip levels:

| Priority | Source | When to Use |
|----------|--------|-------------|
| **1 — Official docs** | Library / API reference docs, MDN, RFC | Always check first |
| **2 — Official examples** | Bundled examples, cookbook, playground | Preferred over Stack Overflow |
| **3 — Maintained OSS** | GitHub repos with recent commits, starred libs | When docs lack complete examples |
| **4 — Community answers** | Stack Overflow, GitHub issues, blog posts | Only after 1–3 yield nothing |
| **5 — Custom solution** | Hand-written from first principles | Last resort; must be justified |

### Section 10.3: Prohibition on Premature Custom Solutions

- Implementors MUST NOT write custom code for a problem that has a documented,
  well-maintained library solution within the project's dependency budget
  (Article VII §7.2).
- If a library is rejected in favour of a custom solution, the rationale MUST
  be recorded in the plan's Dependency Justification table (Article II §2.3).
- Re-inventing documented patterns (e.g. custom tile-loading when
  Leaflet/MapLibre provide tile systems) requires explicit constitution-level
  justification citing performance, size, or capability gaps.

### Section 10.4: Keeping Solutions Current

- When a library releases a new major version during active development, the
  team MUST evaluate the changelog before continuing to use deprecated APIs.
- Documentation links used during design MUST be recorded so they can be
  re-checked if behaviour is unexpected during implementation.

---

## Article XI: Mobile-First Parity

### Section 11.1: Every Feature Must Work on Mobile
Every UI feature built for desktop must have a functional, usable mobile equivalent. "Mobile" is defined as viewport widths ≤ 767px.

### Section 11.2: Layout Patterns
- **Panels**: right-side panels become bottom sheets (`bottom: 0; left: 0; right: 0; border-radius: 20px 20px 0 0`)
- **Sidebars**: collapse behind a hamburger; never visible by default on mobile
- **Overlays**: full-width, no `left: var(--sidebar-w)` offset on mobile
- **HUD / telemetry**: hide at `max-width: 480px`; adjust `right` offset at `max-width: 1024px`

### Section 11.3: Touch Targets
All interactive elements must have a minimum tap target of 44×44px on mobile.

### Section 11.4: No Desktop-Only Breakage
Mobile CSS must be scoped to `max-width` media queries. Desktop layout (≥ 1024px) must never be altered by mobile fixes.

### Section 11.5: Test on 390px Width
The canonical mobile test viewport is 390×844px (iPhone 14). All layouts must be verified at this size before shipping.

---

## Article XII: Developer Tooling — Token Efficiency & Session Memory

### Section 12.1: Token Efficiency (Caveman)

All Claude Code sessions SHOULD use [Caveman](https://github.com/JuliusBrussee/caveman) to reduce output token usage by ~65–75%. Caveman removes filler words, articles, and unnecessary verbosity while preserving code accuracy and technical substance.

- Install: `npx skills add JuliusBrussee/caveman`
- Activate: `/caveman` or say "talk like caveman"
- Use `/caveman:compress` to compress CLAUDE.md and memory files (~45% input token savings)
- Deactivate: "normal mode"

### Section 12.2: Persistent Session Memory (claude-mem)

All Claude Code sessions SHOULD use [claude-mem](https://github.com/thedotmack/claude-mem) for automatic cross-session context persistence. claude-mem captures tool interactions, compresses observations into summaries, and retrieves relevant past context using hybrid semantic + keyword search.

- Install: `npx claude-mem install`
- Web viewer: `localhost:37777` for real-time memory streams
- Search past context: `/mem-search <query>`
- Privacy: wrap sensitive data in `<private>` tags to exclude from capture
- Settings: `~/.claude-mem/settings.json` (auto-generated, sensible defaults)

### Section 12.3: Combined Workflow

When both tools are active, caveman reduces token burn on output while claude-mem preserves session continuity across conversations. This combination addresses the two primary cost drivers in long-running Claude Code projects: verbose output and lost context.

---

## Article XIII: Search Visibility — SEO as a First-Class Feature

### Section 13.1: Every Public URL Must Be Self-Describing

- Every URL in a sitemap MUST return indexable HTML to crawlers: unique `<title>`,
  meta description, **self-referencing canonical**, at least one `<h1>`, and real
  body text. A URL that falls through to the SPA shell (whose canonical points at
  the homepage) is a defect, not a degradation.
- Programmatic pages backed by live feeds (launches, asteroids, flights) MUST
  render an evergreen fallback when the entity leaves the feed — never the shell.
  Dead URLs teach Google's crawl scheduler that the whole pattern is low-value.

### Section 13.2: Titles Speak the Searcher's Language

- Titles and H1s MUST lead with the exact phrase users type (verified against
  Search Console query data), not the product's internal naming:
  "{Airline} Flight Status & Live Tracker", "{IATA} Arrivals & Departures",
  "{Satellite} Tracker". Brand suffix last.
- Meta descriptions stay evergreen — no live counts that go stale in cached
  snippets. Counts belong in body text.

### Section 13.3: The Link Graph Is Infrastructure

- No page may be a leaf. Every rendered page links related entities:
  posts→posts (related + prev/next), airports↔airlines↔routes, and back to its
  hub. Sitemap-only URLs with zero inlinks sit in "Discovered — currently not
  indexed" forever.
- Cross-link selection MUST spread coverage across the full catalog
  (deterministic rotation), not repeat the same few hubs from every page.

### Section 13.4: Verification Before Shipping SEO Changes

- Any change touching middleware rendering, sitemaps, canonicals, or meta MUST be
  verified by fetching affected URL types with a Googlebot User-Agent and
  checking title + canonical + H1 — before and after deploy.
- `BOT_RE` MUST include Google's inspection/testing crawlers
  (Google-InspectionTool, GoogleOther) so Search Console live tests see the same
  HTML Googlebot sees.
- Search Console indexing + performance reports are reviewed at least weekly;
  regressions in indexed-page count are treated as bugs.

---

## Amendment Log

| Date | Article | Change | Rationale |
|------|---------|--------|-----------|
| 2026-03-12 | Initial | Constitution ratified (v1.0.0) | Project inception |
| 2026-03-15 | Article X | Added Documentation-First Implementation (v1.1.0) | Enforce research-before-build discipline; prevent premature custom solutions |
| 2026-03-25 | Article XI | Added Mobile-First Parity (v1.2.0) | All features must work on mobile; desktop layout must not be broken |
| 2026-04-08 | Article XII | Added Developer Tooling — Token Efficiency & Session Memory (v1.3.0) | Adopt caveman + claude-mem for token savings and cross-session context |
| 2026-07-05 | Article XIII | Added Search Visibility — SEO as a First-Class Feature (v1.4.0) | GSC audit found homepage-canonical shell pages, dead feed-backed URLs, and leaf pages causing 979 "Discovered — not indexed"; codify self-describing URLs, query-language titles, link-graph rules, and Googlebot verification |

---

## Governance

This constitution supersedes all other project practices. Amendments require:

1. A documented rationale explaining what changed and why.
2. A version bump following semantic versioning (MAJOR.MINOR.PATCH).
3. A migration plan for any affected specifications, plans, or tasks.
4. An updated `LAST_AMENDED_DATE` in the version line below.

All PRs and code reviews MUST verify compliance with applicable articles.
Complexity that violates any article MUST be justified in the plan's
Complexity Tracking section before proceeding.

This constitution is enforced through:

1. **Specification templates** that embed constitutional checks as phase gates.
2. **Implementation plan reviews** that verify article compliance.
3. **Task definitions** that reference specific articles for each deliverable.
4. **Code review criteria** derived from constitutional principles.

No specification, plan, or task SHALL proceed without passing all applicable
constitutional gates.

**Version**: 1.4.0 | **Ratified**: 2026-03-12 | **Last Amended**: 2026-07-05
