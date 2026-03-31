# Critical Features — Task Breakdown

Created: 2026-03-31

---

## Feature 1: Globe/Map Visual Overhaul

**Problem:** Custom Three.js tile system produces random pattern artifacts on zoom in/out. No airport/city labels to orient users.

### Tasks

#### 1.1 — Diagnose tile rendering artifacts
- [ ] Profile the tile loader during zoom transitions — identify where stale/new tiles overlap incorrectly
- [ ] Check tile `renderOrder`, opacity blending, and z-fighting between zoom levels
- [ ] Document the exact reproduction steps and root cause

#### 1.2 — Research alternative globe rendering approaches
- [ ] Evaluate **CesiumJS** (mature tile system, terrain, built-in label engine) — can it replace the custom Three.js globe?
- [ ] Evaluate **three-globe** (thin Three.js wrapper with built-in tile support) — minimal migration
- [ ] Evaluate **Mapbox GL JS v3** globe mode — 2D map that renders as a sphere
- [ ] Evaluate fixing the current system: priority queue race conditions, tile disposal timing
- [ ] Decision: migrate vs fix-in-place (document trade-offs)

#### 1.3 — Fix or replace tile system
- [ ] Implement the chosen approach from 1.2
- [ ] Ensure smooth zoom transitions with no visual glitches
- [ ] Maintain existing camera system compatibility (Earth/Solar/Galaxy scales)

#### 1.4 — Airport & city point labels
- [ ] Render airport locations as faint grey dots (`opacity: 0.3`, `sizeAttenuation: false`)
- [ ] Render city locations as slightly larger faint dots
- [ ] DOM-projected labels (existing system) for names — only visible at appropriate LOD
- [ ] Labels must not obstruct aircraft/ship rendering (low z-order, fade on overlap)

---

## Feature 2: Picking/Selection System Rewrite

**Problem:** Current hybrid raycaster + GPU color-pick is still inaccurate, especially in dense areas. Aircraft float above globe surface.

### Tasks

#### 2.1 — Research accurate picking in dense point visualizations
- [ ] Read: "Efficient Point Picking in 3D Scatter Plots" approaches (screen-space KD-tree, spatial hashing)
- [ ] Study how FlightRadar24/FlightAware solve this (likely 2D canvas overlay with spatial index)
- [ ] Evaluate: render all aircraft as 2D HTML/SVG/Canvas elements projected from 3D → screen coords
- [ ] Evaluate: keep 3D InstancedMesh but use screen-space nearest-neighbor instead of raycasting

#### 2.2 — Flatten aircraft to surface level (z=0 on globe)
- [ ] Set `AC_R = EARTH_R` exactly (no 1.002 offset) or use a minimal offset that prevents z-fighting
- [ ] Adjust near-clip plane logic so surface-level entities aren't clipped
- [ ] Test with dense areas (Europe, US East Coast) at multiple zoom levels

#### 2.3 — Implement new picking mechanism
- [ ] Option A: **Screen-space KD-tree** — project all aircraft to 2D screen coords each frame, build spatial index, query on click
- [ ] Option B: **2D overlay layer** — render aircraft as DOM/Canvas elements positioned via `Vector3.project()`, use native DOM hit-testing
- [ ] Option C: **Improved GPU pick** — increase pick buffer resolution, use multi-sample anti-aliasing on pick render
- [ ] Implement chosen approach, benchmark against current system

#### 2.4 — Validate accuracy
- [ ] Test: single aircraft selection at all zoom levels
- [ ] Test: dense cluster (50+ overlapping) — closest-to-cursor wins
- [ ] Test: mobile touch (fat finger tolerance)
- [ ] Test: no false positives when clicking empty space

---

## Feature 3: Research-Backed Problem Solving (Process)

**Problem:** Some visual/technical bugs persist after multiple attempts because they need deeper research.

### Tasks

#### 3.1 — Establish research workflow
- [ ] When a fix attempt fails twice, pause implementation
- [ ] Search for: academic papers (Google Scholar, arXiv), GitHub issues on Three.js/CesiumJS/relevant libs, official documentation
- [ ] Read and summarize findings before attempting fix #3
- [ ] Document the research in README under "Engineering decisions" section

#### 3.2 — Create research log
- [ ] Add a `specs/research-log.md` file tracking problems that required research
- [ ] Format: Problem → Attempts → Research findings → Solution → Source links
- [ ] Update README's "Engineering decisions" section with non-obvious solutions

---

## Feature 4: Night Sky / Deep Space / AR View (Stellarium-style)

**Problem:** Current solar system view is basic. User wants a Stellarium-like experience — see the real night sky, point device at constellations, select objects to learn about them.

### Tasks

#### 4.1 — Research night sky rendering
- [ ] Study **Stellarium Web** (open source, WebGL) — can we embed or port their star catalog?
- [ ] Evaluate **three-astronomy** / **celestial-map** libraries
- [ ] Research star catalogs: Hipparcos (118K stars), Tycho-2 (2.5M), or curated bright-star subset
- [ ] Evaluate constellation line/boundary data sources (IAU boundaries)

#### 4.2 — Build star field renderer
- [ ] Load star catalog (bright stars subset, ~9K from Yale BSC)
- [ ] Render as `THREE.Points` with magnitude-based size/brightness
- [ ] Add constellation lines (wireframe LineSegments connecting named stars)
- [ ] Add Milky Way band (textured plane or particle cloud)
- [ ] Proper celestial coordinate system (RA/Dec → scene coordinates for current date/time/location)

#### 4.3 — Replace current deep space view
- [ ] Transition: Earth → Night Sky (camera pulls back, tiles fade, stars appear)
- [ ] Night sky replaces current GalaxyScene.js
- [ ] Keep solar system as intermediate scale between Earth and night sky
- [ ] Planets visible as bright dots at correct positions in the sky

#### 4.4 — Object selection & info panels
- [ ] Tap/click a star → show name, magnitude, distance, spectral type
- [ ] Tap a constellation → highlight it, show mythology/info
- [ ] Tap a planet → show current data (existing PlanetPanel integration)
- [ ] Tap Milky Way → show info about our galaxy
- [ ] Deep-sky objects (M31, Orion Nebula, etc.) as bonus

#### 4.5 — Device compass / gyroscope AR mode
- [ ] Use `DeviceOrientationEvent` API (requires HTTPS + user permission on iOS)
- [ ] Map device orientation (alpha/beta/gamma) → camera rotation in celestial sphere
- [ ] "AR mode" button: phone becomes a window into the sky — point at Orion, see Orion
- [ ] Calibrate with magnetic north via `absoluteOrientation` or `magnetometer` API
- [ ] Fallback: manual pan/rotate for desktop or denied permissions

#### 4.6 — "See it in real life" feature
- [ ] For any selected object, show: current altitude/azimuth from user's location
- [ ] "Look here" arrow/compass pointing toward the object in physical sky
- [ ] Visibility indicator: above/below horizon, best viewing time tonight
- [ ] Requires user geolocation (optional, with prompt)

---

## Feature 5: Airport Disruptions & Passenger ETA

**Problem:** No airport-level information shown. Users need disruption data and arrival ETAs.

### Tasks

#### 5.1 — Subtle airport/location markers
- [ ] Render all airports as faint grey dots (ties into Feature 1.4)
- [ ] `opacity: 0.15-0.25`, small fixed-pixel size, no label until hover/zoom
- [ ] Must not visually compete with aircraft/ships/satellites
- [ ] LOD: major airports first (tier-1), regional airports at closer zoom

#### 5.2 — Research airport disruption data sources
- [ ] Evaluate: **AviationStack API** (free tier: delays, cancellations)
- [ ] Evaluate: **FlightAware AeroAPI** (FIDS data, delays)
- [ ] Evaluate: **OpenSky Network** airport departure/arrival data
- [ ] Evaluate: FAA ATCSCC (US-only advisory data, free)
- [ ] Evaluate: Eurocontrol NM (Europe, requires registration)
- [ ] Choose source(s) that fit free-tier constraint (Article VI)

#### 5.3 — Backend: airport disruption poller
- [ ] New poller goroutine: `airport_disruption_poller.go`
- [ ] Fetch delay/cancellation/diversion data per major airport
- [ ] Store in Redis: `airport:disruptions` HSET keyed by IATA code
- [ ] Broadcast via WebSocket as new message type `airport_disruptions`

#### 5.4 — Frontend: disruption overlay
- [ ] When airport dot is clicked/hovered → show disruption popup
- [ ] Data: current delays (avg minutes), cancellation count, diversions
- [ ] Color-code airport dot: green (normal) → yellow (delays) → red (major disruptions)
- [ ] Subtle pulse animation on disrupted airports

#### 5.5 — Passenger ETA at airport
- [ ] For each inbound flight to selected airport, compute ETA from current position + ground speed + remaining distance
- [ ] Display as sorted list: "Flight BA123 — ETA 14 min", "Flight UA456 — ETA 23 min"
- [ ] Show total arriving passengers (estimated from aircraft type → seat capacity lookup)
- [ ] Backend: new endpoint `GET /api/v1/airports/:iata/arrivals` — queries live aircraft heading toward that airport

---

## Priority Order

| # | Feature | Complexity | Impact | Start |
|---|---------|-----------|--------|-------|
| 1 | Globe visual fix + labels | Medium | Critical (unusable without) | Now |
| 2 | Picking system rewrite | Medium | Critical (core interaction) | After 1.3 |
| 5 | Airport disruptions + ETA | Medium | High (new value) | After 2 |
| 4 | Night sky / AR | High | High (differentiator) | After 5 |
| 3 | Research workflow | Low | Process improvement | Ongoing |

---

## Research Protocol (Feature 3 — applied to all)

When any task fails after 2 attempts:
1. **Stop coding.** Read the error/symptom carefully.
2. **Search**: Google Scholar, GitHub issues (Three.js, CesiumJS, relevant lib), Stack Overflow, MDN
3. **Read**: at minimum 2 sources before attempting fix #3
4. **Document**: Add to `specs/research-log.md` and README "Engineering decisions" if solution is non-obvious
