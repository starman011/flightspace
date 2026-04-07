# Flightspace — Work Log

Tracks all significant changes made during development sessions.

---

## Session: 2026-04-07

### Features Added

| # | What | Detail |
|---|------|--------|
| 1 | **Flight isolation mode** | When tracking a plane, all other aircraft are completely hidden (matrices zeroed in syncInstances). Saves GPU resources — only the tracked craft + trail render. Toggled automatically when tracking starts/stops via `_wasIsolating` flag triggering instance rebuild. |
| 2 | **Fit-to-route with API airports** | `fitRoute()` now accepts route API data. Priority: route API dep/arr coords → trail endpoints. Computes midpoint + angular distance for camera zoom. Both "Track Flight" and "fit" buttons pass route data. |
| 3 | **Better trail colors** | Core ribbon: cyan → warm gold (`#ffaa22`). Glow ribbon: blue → orange (`#ff6600`). Departure marker: green (`#22ff88`), arrival marker: orange (`#ff6622`). Separate Point meshes for dep/arr instead of single shared mesh. Markers enlarged to 20px. |
| 4 | **Route data display fix** | Route card now shows whenever route API returns data (not just when trail exists). Distance computed from route API dep→arr coords when available. Departure coordinates fall back to route API when no trail. Arrival label defaults to "ARR" instead of "NOW". |
| 5 | **Smart departure/arrival estimation** | Backend trail fallback no longer uses first DB position as departure (wrong for mid-flight aircraft at 30k ft). Now looks BEHIND the aircraft (reverse heading, 2500km range, 60° cone) for departure airport, and AHEAD (2500km, 45° cone) for arrival. ETA computed from arrival distance and speed. |

### Research

| # | What | Detail |
|---|------|--------|
| 1 | **Token optimization** | Researched Google ADK Context Engineering (March 2026): event compaction (60-80% reduction), tiered context (working→session→memory→artifacts), artifact externalization, scoped sub-agent handoffs, context caching. Actionable: slim CLAUDE.md to <2k tokens, use .claudeignore, /compact between tasks, move GitNexus instructions to separate file. |

---

## Session: 2026-04-06

### Features Added

| # | What | Detail |
|---|------|--------|
| 1 | **Real airport names (departure/arrival)** | New backend endpoint `GET /api/v1/aircraft/{icao24}/route` calls OpenSky Network flights API to get `estDepartureAirport` / `estArrivalAirport` ICAO codes. Enriched with 120+ airport database (ICAO→IATA/name/coordinates). Falls back to trail-based estimation (nearest airport to trail[0], heading-based arrival guess) when OpenSky is rate-limited. |
| 2 | **ETA to destination** | Route endpoint computes ETA from current position/speed to arrival airport coordinates. Displayed as "ETA 2h 15m" in the route card. |
| 3 | **ICAO airport database** | New `backend/src/data/airports.go` with 120+ airports worldwide: North America (36), Europe (31), Middle East (8), Asia (24), Oceania (5), South America (6), Africa (7). Maps ICAO codes to IATA, name, and lat/lon. |

### Fixes

| # | What | Detail |
|---|------|--------|
| 1 | **Aircraft photo not loading** | Removed `crossOrigin="anonymous"` from img tag — planespotters CDN images loaded fine without CORS but the attribute forced the browser to enforce CORS on the image request, blocking rendering. Replaced with `referrerPolicy="no-referrer"`. |

---

## Session: 2026-04-02

### Fixes

| # | What | Detail |
|---|------|--------|
| 1 | **DetailPanel not scrollable on mobile** | Panel had `overflow: hidden` and mobile bottom-sheet (60dvh) clipped content. Added `overflow-y: auto` + `-webkit-overflow-scrolling: touch` to mobile media query. Also reduced photo height to 120px on mobile. |
| 2 | **Galaxy flash on mobile re-selection** | Outside-click handler used `mousedown` which fired on canvas taps before the globe's `pointerup` picked the new aircraft. Sequence: `onClose()→null→reselect` caused brief state flash showing galaxy view via URL sync. Fix: ignore `CANVAS` element taps in outside-click handler. |
| 3 | **Track mode: other aircraft dimmed** | When tracking is active, all 6 aircraft InstancedMesh materials are dimmed to 12% opacity. Only the tracked craft's selection ring, neon trail, and API trail arc remain bright. Trails use `AdditiveBlending` on separate `LineSegments` — unaffected by aircraft opacity. |

| 4 | **Removed fake signal precision data** | Hardcoded "PEAK DETECTION: ALPHA-7 98.4%" and "SYSTEM: NOMINAL" badge were not sourced from real data. Removed entirely. |
| 5 | **Trail arc invisible** | `THREE.Line` always renders 1px in WebGL (spec limitation) — invisible on Retina/mobile, and 4 overlapping 1px lines from above still look like 1px. Also trail was at 191-236km altitude (above the camera). **Fix**: replaced with mesh ribbon geometry (actual filled quads along the path). Core ribbon 0.0004 WU + glow ribbon 0.001 WU, both at 6-10km altitude. Endpoint markers at 16px. Guaranteed visible at any DPI/zoom. |
| 6 | **Aircraft icons district-sized at low zoom** | Scale formula used `dist` (camera-to-earth-center) for wuPerPx. At 20km zoom, aircraft at radius 1.0005 are only 17km from camera — perspective projection made 1px target render as 300+ screen pixels. Fix: use `camToAc = dist - acRadius` for perspective-correct sizing. Below 20km aircraft appear near real size (~40m). |
| 7 | **Satellite/ship click → 400 error** | `/api/v1/aircraft/{id}` queries `aircraft_static` table which has no satellite/ship entries. Fix: DetailPanel skips API call for non-flight categories, renders directly from WebSocket live data. |
| 8 | **Close panel triggers mobile reload** | `navigate(path, {replace: true})` caused full React Router reconciliation on state change. Fix: close handler uses `window.history.replaceState` directly, bypassing React Router. URL sync effect skips navigation when panel just closed. |
| 9 | **Airborne duration showed last-update age** | `formatAge(cur.timestamp)` showed when the ADS-B update arrived, not how long the flight has been airborne. Fix: route card shows flight duration from `trail[0].timestamp` (departure time). |

### Features Added

| # | What | Detail |
|---|------|--------|
| 1 | **Caller-style DetailPanel redesign** | Complete rewrite of DetailPanel as phone-call-screen style card. Hero section with aircraft photo (from planespotters.net) + gradient overlay showing callsign, type, operator. Route card with DEP→NOW columns, distance, and ETA. 2×2 telemetry grid (ALT, SPD, HDG, V/S). Metadata row (registration, airborne/ground, age). Mobile: bottom sheet with `max-height: 70dvh`. |
| 2 | **Nearest airport lookup** | Route card shows nearest IATA airport code (within 150km) for departure point and current position instead of raw coordinates. Uses placeData.js airport table with haversine distance matching. |
| 3 | **Dynamic panel title** | Panel title changes based on entity category: "Flight Details", "Satellite Details", "Vessel Details", "Helicopter Details". Satellites/ships show position card with orbital altitude. |
| 4 | **Tile contrast boost** | Tile material color set to 72% brightness (`new Color(0.72, 0.72, 0.74)`) for reduced glare and better visual contrast at street level. |
| 5 | **Redesigned Track button** | Full-width primary action button. Blue when idle (`Track Flight`), green glow when active (`Stop Tracking`). `fit` button appears alongside when tracking with trail data. |

---

## Session: 2026-04-01

### Fixes

| # | What | Detail |
|---|------|--------|
| 1 | **Ghosting at ~4000m altitude** | Two root causes: (a) scale-change threshold too sensitive — 5% relative hysteresis added, (b) `buildMatrix` recalculated aircraft radius as `camDist - altUnit*0.5` every frame when camera below `AC_R`, causing position oscillation. Fix: pin aircraft to fixed `EARTH_R * 1.0005` when camera is below aircraft layer — stable, no jitter. |
| 2 | **Blue glitch on zoom** | `clearTiles()` destroyed ALL cached tiles when crossing `TILE_DIST_THRESHOLD = 2.5`. Zooming back in meant reloading from scratch, exposing the blue base sphere. Fix: replaced `clearTiles()` with gradual fade-out (opacity -= 0.03/frame), tiles disposed only when fully transparent. New tiles fade in (+0.08/frame). Tile cache persists across threshold crossings. |
| 3 | **Mobile reload on select/unselect** | Three causes: (a) URL sync `navigate()` triggered full React Router re-render (fixed: 80ms debounce), (b) aircraft `useEffect` had `selectedId` in deps — every tap triggered full `syncInstances` on 12K aircraft + trail rebuild (fixed: removed `selectedId` from deps), (c) added fast-path selection effect that updates only 2 instance colors. Net result: selection is now O(1) instead of O(12K). |

### Features Added

| # | What | Detail |
|---|------|--------|
| 1 | **Route view with endpoint markers** | New "route" button in DetailPanel. Shows departure (first trail point) and current position as blue ping markers on the globe, with great-circle arc between them. Route card in panel shows DEP/NOW coordinates. |
| 2 | **Auto-zoom fitRoute** | Clicking "route" triggers `fitRoute()` — computes angular distance between trail endpoints, positions camera at the midpoint at a distance that fits both in view (FOV-aware), with smooth flyTo tween. Works for both zoomed-in and zoomed-out states. |

### Rearchitecture: First-Person Planetarium Night Sky

| # | What | Detail |
|---|------|--------|
| 1 | **Sky sphere reduced to 480 WU** | Old sky sphere was at `AU_TO_WU * 5500` (~129M WU) — far from camera, no sense of immersion. New sphere is 480 WU with camera at origin (0,0,0), creating a true planetarium perspective. Stars at `0.95R`, constellations at `0.93R`, planets at `0.88R`. |
| 2 | **Earth horizon hemisphere** | Added a half-sphere below the camera representing the ground. Canvas-generated texture with dark earth surface, blue atmospheric glow at the horizon line, and subtle city light pollution blobs. Standing-on-Earth feeling. |
| 3 | **Star shader upgrade** | Larger point sizes (Sirius 18px vs old 7px), white-hot core blending into B-V spectral color in the halo, per-star twinkle animation via `uTime + aSeed`. Much brighter and crisper. |
| 4 | **Milky Way texture upgrade** | 4096×2048 canvas (was 2048×1024). Galactic band with asymmetric centre structure, dark absorption lanes, 6 emission nebulae (red/blue patches), 40K scattered pixel-stars (was 15K). |
| 5 | **Planet markers enlarged** | Sun 18px, Moon 16px, Venus 10px etc. Glow shader with white core + planet color halo. Labels repositioned with offset above markers. |
| 6 | **CAM_GALAXY repositioned** | Camera position changed from `[0, AU*10, AU*38]` (40 AU away) to `[0, 0, 0.01]` (origin). minDist/maxDist clamped to prevent zooming out of the sky sphere. |
| 7 | **Galaxy frustum updated** | `near=0.1, far=600` (was `near=235, far=130M`). Matched to 480 WU sky sphere — eliminates wasted depth precision. |
| 8 | **Star picking radius updated** | Picking projection radius changed from `5390*0.98` to `480*0.95` to match new `STAR_R`. |

### Architecture Decisions

| Decision | Why |
|----------|-----|
| Small sky sphere (480 WU) at origin vs large sphere far away | First-person planetarium requires camera at centre of celestial sphere. 480 WU avoids floating-point precision issues while being large enough that perspective distortion is invisible. |
| Earth horizon as textured half-sphere vs flat plane | Half-sphere matches the visual curvature of a real horizon. Atmospheric glow texture is cheap (single 512×256 canvas) and sells the "standing on Earth" illusion. |
| Canvas-generated Milky Way vs downloaded texture | Eliminates a network request, gzips well (~50KB), resolution scales with device, and we control every detail (nebulae, dark lanes, star density). |

---

## Session: 2026-03-31

### Fixes

| # | What | Detail |
|---|------|--------|
| 1 | **Tile z-fighting / random patterns on zoom** | Root cause: `WebGLRenderer` lacked `logarithmicDepthBuffer`. At close zoom (127m altitude), near/far ratio was 67M:1 — exceeding 24-bit depth buffer precision. Parent tiles at `1.000005` and detail tiles at `1.00001` (32m apart) couldn't be distinguished. Fixed by enabling `logarithmicDepthBuffer: true` and widening tile radii to `1.0002` / `1.0004` (~1.3km apart). |
| 2 | **GPU pick DPI scaling bug** | Pick render target was created at CSS pixel resolution but cursor coordinates weren't DPI-adjusted. On Retina displays, pixel coordinates were off by 2x. Fixed: target now uses `renderer.getPixelRatio()`, coordinate mapping accounts for DPR. |
| 3 | **GPU pick single-pixel miss** | Reading exactly 1 pixel missed the target due to sub-pixel alignment. Now reads a 7×7 pixel neighborhood and picks the nearest non-zero ID to center. |
| 4 | **Raycaster accuracy in dense airspace** | Three.js `Raycaster` with `Points` uses world-space sphere thresholds — fundamentally wrong for screen-space distance. Replaced with kdbush KD-tree: project all aircraft to screen coordinates on click, query by pixel radius. O(sqrt(n)) query, ~2ms total for 12K points. |

### Features Added

| # | What | Detail |
|---|------|--------|
| 1 | **Airport/port IATA labels** | DOM-projected labels for airports (clickable, hover-highlight) and ports. Cities rely on CartoDB Voyager tile-embedded labels (Apple Maps-style progressive LOD). |
| 2 | **Airport arrivals panel** | Click any airport IATA code → fetches `GET /api/v1/airports/{iata}/arrivals`. Backend scans live aircraft in Redis, computes haversine distance + bearing filter (within 45° of airport), calculates ETA from ground speed. Sorted by ETA, capped at 30. Frontend polls every 15s. |
| 3 | **Enlarged pick mesh hit area** | GPU color pick mesh geometry expanded from 1×1 to 1.8×1.8, giving ~80% larger clickable area without visual change. |
| 4 | **Faint place dots** | All 110 places (cities, airports, ports) rendered as `THREE.Points` with `sizeAttenuation: false`, opacity 0.18, fading in as zoom increases. Non-intrusive visual anchors. |

### Architecture Decisions

| Decision | Why |
|----------|-----|
| `logarithmicDepthBuffer` over manual near/far tuning | Log depth provides uniform precision across the entire range (127m to 51,000km). Eliminates all z-fighting without per-zoom-level hacks. CesiumJS uses the same technique. |
| Screen-space KD-tree (`kdbush`) over Three.js Raycaster | Raycaster operates in world space — thresholds don't correspond to screen pixels. KD-tree operates in the user's actual coordinate system (screen pixels). FR24 and FlightAware use the same approach. |
| Tile-embedded labels (CartoDB) for cities, DOM labels for airports | CartoDB Voyager tiles already contain Apple Maps-quality progressive city/street labels. Adding our own would create visual clutter and duplicate information. Airports need IATA codes + click targets (not in tiles). |
| ETA from live ADS-B data, no external API | Aircraft positions + ground speed + heading are already in Redis. Haversine + bearing filter computes ETA with ~2-5 minute accuracy. $0 cost, no API dependency. |

### Research Completed

| # | What | Detail |
|---|------|--------|
| 1 | **F4: Night Sky / Stellarium — full research** | Evaluated star catalogs (Yale BSC5: 9,110 stars, ~200KB trimmed), constellation data (d3-celestial GeoJSON: 88 constellations), planet ephemeris (astronomy-engine: 116KB, VSOP87, ±1 arcmin), Milky Way panorama (ESO CC-BY 4.0, 200KB), DeviceOrientation AR (iOS permission flow, compass heading, ZXY camera rotation), coordinate math (RA/Dec→XYZ, GMST, LST, Alt/Az). Total data budget: ~570KB lazy-loaded. Full document at `specs/002-critical-features/f4-night-sky-research.md`. |

### Implementation: F4 Night Sky

| # | What | Detail |
|---|------|--------|
| 1 | **Real star field (8,404 stars)** | Yale BSC5 catalog trimmed to naked-eye stars (mag ≤ 6.5). Custom ShaderMaterial: magnitude→point size, B-V color index→realistic star color. Single `THREE.Points` draw call. Replaces procedural 7,000 fibonacci stars. |
| 2 | **89 constellation stick figures** | d3-celestial GeoJSON parsed to `THREE.LineSegments`. Low-opacity lines (0.25) with rank-filtered name labels (Sprites). RA/Dec lon/lat→XYZ conversion on the celestial sphere. |
| 3 | **Live planet positions** | `astronomy-engine` (npm, 116KB) computes RA/Dec for Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn every 30s. Placed on celestial sphere as distinct colored markers with name labels. |
| 4 | **Sky object selection** | Screen-space picking for stars (named stars with mag < 3.0), constellation labels, and planet markers. SkyObjectPanel shows star stats (magnitude, spectral type, coordinates), constellation mythology, or planet info. |
| 5 | **DeviceOrientation AR mode** | "Point at Sky" button in galaxy view. Requests iOS `requestPermission()`, maps compass heading→azimuth, beta→altitude, gamma→roll to camera rotation (ZXY order). Disables OrbitControls while active. Desktop fallback: mouse drag. |
| 6 | **Milky Way skybox upgrade** | Canvas-generated 2048×1024 equirectangular texture with improved galactic band, centre glow, nebula blobs, and 15K scattered pixel-stars for density. |

### Architecture Decisions

| Decision | Why |
|----------|-----|
| NightSkyScene replaces GalaxyScene (same API: show/hide/dispose) | Drop-in replacement — Globe.jsx transition logic unchanged. Real data instead of procedural. |
| BSC5 as JS module, not fetched at runtime | ~305KB in source but gzips to ~50KB in the chunk. Eliminates a network request and loading state. Lazy-loaded with Globe chunk only when needed. |
| astronomy-engine over manual VSOP87 | 116KB for ±1 arcminute accuracy across all planets, coordinate transforms, rise/set times. Would take months to implement from scratch. |
| Screen-space star picking reuses aircraft pick pattern | Same approach as kdbush aircraft picker — project to screen coords, test pixel radius. Consistent UX across all scales. |

---

## Session: 2026-03-30

### Fixes

| # | What | Detail |
|---|------|--------|
| 1 | **TDZ crash** `Cannot access 'F' before initialization` | Place-label code referenced `dist` before its declaration in `tick()`. Minifier renamed it to `F`, surfacing the Temporal Dead Zone. Fixed by computing distance locally as `_d = camera.position.length()` within the label block. |
| 2 | **Dark hexagon/pentagon glitch** | Dodecahedron wireframe (used for debug coverage) left 12 pentagonal edges visible at certain zoom levels. Removed the mesh entirely. |
| 3 | **Dark tile patches on zoom** (first attempt) | Stale tiles were kept at `renderOrder=0` while full-opacity — large low-zoom ocean tiles showed as dark patches. Fixed by setting `mesh.visible = false` on zoom change. |
| 4 | **Dark blue flash on zoom** (second attempt) | Hiding stale tiles immediately exposed the raw earth base material (`0x0d2b6b`, dark navy) during the load gap. Fixed by keeping stale tiles visible as a blurry-but-correct backdrop; new tiles render on top via `renderOrder` once loaded. Earth fallback color also lightened to `0x1a5276`. |
| 5 | **Pan speed** | User requested slower, stiffer panning. Adjusted `rotateSpeed` and `dampingFactor` in the adaptive controls block. |

### Features Added

| # | What | Detail |
|---|------|--------|
| 1 | **City / Airport / Port labels** | Added `placeData.js` with ~90 curated places (25 tier-1 mega-cities, 31 tier-2 cities, 24 airports, 12 seaports). Three-tier LOD: tier-1 visible at `dist < 2.0`, tier-2 at `< 1.5`, tier-3 at `< 1.15`. |
| 2 | **DOM label projection** | Replaced `Sprite`-based labels (poor text quality) with projected HTML `<div>` elements updated each frame via `Vector3.project(camera)` → `transform: translate3d(...)`. Crisp text, no React re-renders. |
| 3 | **Points dot markers** | Per-tier `THREE.Points` geometry with `sizeAttenuation: false` for fixed pixel-size dots independent of zoom distance. |
| 4 | **Smart dual-mode aircraft picking** | Raycaster (CPU) for high-altitude view; switches to GPU color-ID picking when zoomed to surface level for accurate dense-cluster selection. |
| 5 | **Surface-level aircraft positioning** | Aircraft rendered directly on the globe surface instead of floating. |
| 6 | **Slower camera pan** | Adaptive `rotateSpeed` curve tuned for stiffer feel at all zoom levels. |

### Commits (this session)

```
9a2e46a  fix dark blue flash on zoom — keep stale tiles visible during transition
8d4633a  remove country border overlay
8e29b93  feat: smart dual-mode picking, surface-level aircraft, slower pan
50dd673  fix: remove dark tile patches + rework place labels to DOM projection
5d30ab2  fix: resolve TDZ crash in tick loop — place labels used dist before declaration
03cccd7  feat: add city/airport/port labels + fix dark pentagon glitch
```

---

## Pending / Next Up

- [ ] Flight path dead-reckoning interpolation (smooth movement between 5–10 s ADS-B updates)
- [ ] Accurate landing visuals — aircraft align with runway heading when alt < 500 ft, speed < 160 kt
- [ ] 5 major improvements requested by user (to be listed once specified)