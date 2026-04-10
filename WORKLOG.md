# Flightspace — Work Log

Tracks all significant changes made during development sessions.

---

## Session: 2026-04-09

### Fixes

| # | What | Detail |
|---|------|--------|
| 1 | **Moon entry-point moved to top notch** | Added a `Moon` button to the `StatusBar` scale-nav (Earth · Moon · Solar System · Deep Space). Removed Moon from `FilterRail` and `OrbitalMapBar` mobile chip strip — Moon is now strictly a "scale" alongside the others. Notch expanded width bumped 580 → 640 px to fit four nav items. |
| 2 | **High-quality Moon texture** | Replaced the 2K Moon texture with a 4K NASA-derived albedo (4096×2048, 3.7 MB). MoonScene now uses 256×256 sphere segments, anisotropy 16, sRGB color space, and reuses the albedo as a cheap bump-map (`bumpScale 0.0035`) for surface relief at close range. |
| 3 | **MoonPanel visual redesign** | Replaced the 🌙 emoji with a custom inline SVG `MoonGlyph` (radial gradient body + crater speckle). Rebuilt typography hierarchy (eyebrow → display name → subline), added a glowing close button, gradient divider, polished stat grid with tabular numerics, and a gradient fly-to button with hover lift. Mineral filters became a 2-col grid of color-dot pills with chemical formulas. Panel itself uses radial top-glow + saturated backdrop blur. |
| 4 | **Moon label bleed-through fix** | Landing-site dots, rings, mission labels, crater names, and mineral region labels were bleeding through the Moon sphere from the back hemisphere (sprites had `depthTest: false`). Now every label/marker tracks its surface normal, and `update(camera)` dot-products it with the camera-to-moon direction each frame to hemisphere-cull the back side. Smooth fade band near the limb (`dot ∈ [-0.05, 0.15]`) prevents pop-in. Also enabled `depthTest: true` on all sprites so the Moon mesh occludes them physically. Only crewed missions now get always-on labels (uncrewed get dots only) to reduce clutter. |
| 5 | **Earth entities leaking onto Moon** | When LIVE was enabled and the user switched to Moon scale, planes / sats / ships kept rendering on the Moon's surface (the entity InstancedMeshes lived in the main scene with no scale gate). Added `_setEarthEntitiesVisible()` helper that toggles `planeMesh / heavyMesh / regionalMesh / heliMesh / satMesh / shipMesh / trailMesh / trailGlowMesh / ringMesh` on every scale transition. Also gated the per-frame trail visibility on `targetCameraScale === 'earth'` so the live trail loop can't re-enable trails on Moon. |
| 6 | **Live lunar assets layer** | Added `LUNAR_ORBITERS` (LRO, Chandrayaan-2, Danuri/KPLO, Queqiao-2, CAPSTONE) and `LUNAR_ROVERS` (Yutu-2, Pragyan) to MoonScene. Each orbiter walks a real Keplerian circle each frame using `period = 2π√(a³/µ)` with µ_moon = 4902.8 km³/s², color-coded by agency, with orbit-trace point ring + halo + label. Time-scaled ×60 so a 2 h orbit completes in ~2 min. Rovers render as diamond markers on the surface and hemisphere-cull with the rest of the moon assets. |
| 8 | **Moon site drift + label polish** | Two bugs: (a) landing sites were children of `moonGroup` while `moonMesh` auto-rotated, so Apollo 11 slowly drifted off Mare Tranquillitatis; (b) site dots were oversized and labels used jaggy monospace text at fixed width that stretched short/long names identically. Fix: removed the `moonMesh.rotation.y += 0.0001` auto-spin, reparented all surface features (landing dots/rings/labels, crater labels, rovers, mineral overlays) to `moonMesh`, shrank site dots 0.0035 → 0.0018 and rings 0.005/0.0075 → 0.0025/0.004. New `makeLabel()` renders high-DPI (2×) rounded pills with Inter/system-ui 600-weight text, subtle text glow, colored border, and returns `{texture, aspect}` so sprite width auto-fits text (no more stretched labels). Crater labels drop the pill and just render glowing text at 55% opacity. |
| 7 | **Real JPL Horizons lunar orbits** | Replaced the synthetic-circle orbiters with real state vectors fetched from JPL Horizons. New `backend/src/controllers/lunar_poller.go` queries Horizons (`CENTER='500@301'`, `REF_PLANE='FRAME'`, `VEC_TABLE='2'`, `OUT_UNITS='KM-S'`) for LRO (SPK −85), Chandrayaan-2 Orbiter (−152), Danuri/KPLO (−155), and CAPSTONE (−1176) every 5 minutes, parses pos+vel from the `$SOE…$EOE` block, and caches in Redis hash `lunar:orbiters`. Exposed as `GET /api/v1/lunar/orbiters`. Frontend `MoonScene` now ships a 2-body Kepler solver (`stateToElements` → `propagateKepler` with Newton iteration) and `setRealOrbiterData()`: computes orbital elements once per orbiter from (r, v), rewrites the orbit-ring buffer from the real ellipse, and the per-frame `update()` propagates from those elements at wall-clock time. ICRF→Three.js axis swap `(ix, iz, −iy)` aligns celestial north with +Y. Queqiao-2 has no Horizons ephemeris (CNSA doesn't publish to JPL), so it keeps the synthetic fallback. `Globe.jsx` polls the endpoint every 60 s while `cameraScale === 'moon'`. |
| 7 | **Mobile DetailPanel hero redesign** | Plane image was skewing on mobile due to `align-items: stretch` forcing `object-fit: cover` to distort. Redesigned as a 56×56 rounded avatar with `align-items: center`, transparent hero background, and text info flowing beside. |
| 9 | **Moon→Earth transition: camera-inside-Earth flash** | When exiting Moon scale, scene swap ran immediately at tween start — but camera was at Moon distance (~0.8) while Earth radius is 1.0, so user saw Earth's interior/backface for a frame before the camera arc lifted it out. Fix: deferred the scene swap to mid-tween (`rawT ≥ 0.5`), exactly when the warp overlay is fully opaque, via a `camTweenSwapped` flag. Camera never renders either scene at a wrong distance. |
| 10 | **Viewport bounds longitude bug → friends outside Americas saw no aircraft** | `emitBounds` in `Globe.jsx` computed `lonC = atan2(camPos.z, -camPos.x) * 180/π - 180`, which returns the shifted-lon convention used internally by `v2ll` (range [−360, 0]) — NOT real aircraft lon range [−180, 180]. Backend `filterByBounds` compared this wrong range against real aircraft coords, filtering out Asia/Europe/Oceania entirely. Fix: normalize `lonC` to [−180, 180] via modulo, and fall back to GLOBAL_BOUNDS if the bbox would cross the antimeridian (backend filter doesn't handle wrap). |
| 11 | **Session-creation silent failure (DNS/adblocker/offline)** | Friends reported "Live button shows nothing". Diagnosed via their console: `net::ERR_NAME_NOT_RESOLVED` on `*.up.railway.app` + `TypeError: Failed to fetch` in `/api/v1/session`. Many ISPs, mobile carriers, ad blockers, and school/corporate DNS silently block raw Railway subdomains. `useSession` was swallowing the error and returning `null` — the app sat in broken-silent mode. Fix: `useSession` now exposes `sessionError` ('network' vs 'server'), retries session creation with exponential backoff (capped 30s), and `App.jsx` renders a red top banner with a DNS/adblocker hint + "switch DNS to 1.1.1.1" guidance. Proper fix is infra — add a custom domain (`api.flightspace.xyz`) behind Cloudflare — but the banner stops the silent failure mode immediately. |

---

## Session: 2026-04-08

### Improvements

| # | What | Detail |
|---|------|--------|
| 1 | **Plane scaling below 50km** | Two-regime scaling now blends between 5–50km altitude. Below 5km, planes use perspective-correct sizing (`camToAc` distance) with logarithmic pixel scaling (2–6px) — a plane at 1km looks ~40m, not city-sized. Min scale lowered from 0.00003 to 0.000005 WU. Smooth lerp transition between street-level and orbit-level regimes. |
| 2 | **Saturated street-view maps** | Injected saturation boost (1.45×) into tile fragment shader via `onBeforeCompile`. Converts to luminance, then `mix(grey, color, 1.45)` for richer colors while keeping the darkened tile tint (0.55 brightness). Street-level maps now pop without being garish. |

### Fixes (continued from 2026-04-07)

| # | What | Detail |
|---|------|--------|
| 1 | **Trail TubeGeometry rewrite** | Replaced manual ribbon geometry (invisible in WebGL) with `TubeGeometry` + `CatmullRomCurve3`. Two-tone: bright green (traveled, dep→plane) + dim orange (remaining, plane→arr). `depthTest: false` guarantees visibility. Small sphere markers (0.005 WU) at route API airport coords. |
| 2 | **aircraft_positions table populated** | Poller only wrote to `aircraft_latest` (upsert) — `aircraft_positions` (append-only trail history) was empty. Added INSERT INTO `aircraft_positions` alongside upsert in poll loop. |
| 3 | **CSP image blocking** | Added `t.plnspttrs.net` (planespotters thumbnails) and `cdn.arstechnica.net` (news images) to `img-src` in both `vercel.json` and `_headers`. |
| 4 | **Trail empty-array guard** | `if (!detail?.trail?.length) return` blocked trail rendering because `[].length === 0` is falsy. Fixed: check for route data and live position independently, not just trail length. |
| 5 | **Trail connects to live plane** | Trail lagged behind live WebSocket data. Now appends `liveData.lat/lon` to trail array before passing to `drawTrail`, so trail always extends to current aircraft position. |
| 6 | **Darkened map tiles** | Tile material color reduced from `(0.72, 0.72, 0.74)` to `(0.55, 0.55, 0.58)` for easier eye comfort at street level. |
| 7 | **Mobile tab crash on panel close** | Closing DetailPanel/LaunchPanel caused full page reload (jetsam). Root cause: `CommandCenterOverlay` mount/unmount during WebGL render loop exceeded mobile memory limits. Fix: always-mounted with `display:none` via `hidden` prop — no mount/unmount memory spike. |
| 8 | **React Router removed** | `useLocation()` caused full App re-renders on every `navigate()` call, contributing to mobile crashes. Replaced with `window.history.replaceState` + path derivation from React state. Zero re-renders from URL changes. |
| 9 | **Leaked setTimeout / stale setState** | DetailPanel auto-fit `setTimeout` leaked on unmount, causing stale setState. Added cleanup `clearTimeout` + `cancelled` flag pattern on all fetch chains + `mountedRef` guard on refreshLive. |
| 10 | **Cosmic Address repositioned** | Moved to top-left, made smaller (170px SVG), transparent (55% opacity), no card background. |
| 11 | **Auto-dock panels on zoom** | Globe emits `onZoomChange(isClose)` at 500km threshold. CommandCenterOverlay auto-collapses, hero/stats hide, HUD shifts, map toggle repositions — all CSS transitions, no re-renders. |
| 12 | **Mobile DetailPanel 1/3 height** | Changed from `max-height: 70dvh` to `33dvh`. Compacted hero (80px), route card, telemetry grid, track buttons — same data density in 1/3 screen. |
| 13 | **Full airport names** | Route card now shows "John F Kennedy Intl (JFK)" instead of just "JFK". Falls back gracefully to code-only or name-only. |
| 14 | **README updated** | Added 3 new engineering problem sections (mobile jetsam fix, router removal, auto-dock). Updated architecture diagram and tech stack to reflect router removal. |
| 15 | **Mobile tracking: allow panning** | Tracking lock (`controls.enableRotate = false`) prevented all user interaction on mobile. Now pauses tracking for 3s on `pointerdown`, letting the user pan/zoom freely. Camera resumes following the aircraft after the pause. |
| 16 | **Mobile camera offset with panel** | When DetailPanel is open (bottom 1/3 of screen), camera target is offset downward on the sphere so the tracked aircraft appears in the visible area above the card, not behind it. Applied to both live tracking and fitRoute. |
| 17 | **Developer tooling docs** | Added Caveman (token reduction) and claude-mem (session memory) to README and constitution (Article XII, v1.3.0). Install instructions, usage, and combined workflow documented. |
| 18 | **Moon globe view** | New 'moon' scale with full MoonScene: 2K texture on SphereGeometry(0.2727 WU), bump lighting, starfield background. 22 landing sites (Apollo, Luna, Chang'e, Chandrayaan, SLIM, IM-1/2) with pulsing markers + labels. 13 named craters/maria with labels. Mineral overlay system (FeO, TiO₂, water ice, thorium) with toggle filters. MoonPanel shows site details, stats, fly-to, and mineral filters. FilterRail Moon button. URL routing (/moon). Earth mesh, clouds, tiles, place dots hidden during Moon view. Camera preset: 0.8 WU with 0.28–3.0 zoom range. |

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
| 6 | **OpenFlights route database** | Embedded 67K airline routes (OpenFlights dataset) in Go backend. New `data/routes.go` parses airlines.dat (6K airlines, ICAO↔IATA mapping), airports.dat (7.7K airports with coords), routes.dat (67K direct routes). `LookupRoute(callsign, lat, lon)` extracts airline code from callsign, finds all routes for that airline, scores by proximity (aircraft should be between dep and arr on great-circle path with 30% detour tolerance). Returns exact departure and arrival airports. |
| 7 | **Route endpoint rewrite** | Removed OpenSky API dependency (unreliable, rate-limited). New priority: 1) OpenFlights route DB via callsign matching, 2) heading-based estimation fallback. Route lookups are now instant (in-memory) with zero external API calls. |
| 8 | **Trail extends to dep/arr airports** | Frontend enriches trail when route data is available: prepends departure airport coords and appends arrival airport coords to trail points (if >20km from first/last trail point). Trail now visually connects departure → tracked positions → arrival. |

### Fixes

| # | What | Detail |
|---|------|--------|
| 1 | **Heading fallback uses 7700-airport DB** | Old heading-based estimation used a tiny 120-airport `AirportByICAO` table — missed most airports worldwide. Switched to `data.FindAirportInDirection` and `data.FindNearestAirport` which search the full 7,700-airport OpenFlights `AirportByIATA` map. Departure/arrival now returns real airports even when callsign route matching fails. |
| 2 | **Camera flyTo priority over tracking lock** | Tracking camera lock was overriding the flyTo tween, so "fit to route" had no visible effect while tracking was active. Restructured the render loop: flyTo tween runs first and takes priority; tracking camera lock only runs when no flyTo is active. |
| 3 | **Auto-fit re-triggers on route arrival** | Initial auto-fit fired before route API returned (only had trail data). Added `didAutoFit` ref that tracks whether fit used 'trail' or 'route' coords — re-triggers with route coords when they arrive, giving accurate dep/arr framing instead of just trail endpoints. |
| 4 | **Trail enrichment as single source** | Removed raw `onTrailData` calls from initial fetch and refreshLive. A single `useEffect` now enriches trail with dep/arr airport coords from route data before passing to Globe, preventing trail from showing only DB-start positions. |
| 5 | **Fat visible trail ribbon** | Core ribbon width 0.0004→0.003 WU (~19km), glow width 0.001→0.008 WU (~50km). Trail raised from +0.0015 to +0.004 above Earth surface. Clearly visible from any zoom level. |
| 6 | **Visible airport markers** | Replaced tiny 20px `Points` (invisible at most angles) with solid `SphereGeometry` markers (0.012 WU radius ≈ 76km) + outer additive-blended glow spheres (0.022 WU). Departure: green, arrival: orange. Visible from orbit. |
| 7 | **Hide 1px real-time trail when tracking** | Real-time `LineSegments` trails (1px WebGL limitation) now hidden when tracking is active. Only the fat mesh-ribbon API trail renders, preventing the confusing thin trail from DB-start time showing alongside the proper route trail. |
| 8 | **Trail architecture rewrite** | Root cause of 5-time-recurring trail bug: markers used `points[0]` (DB trail start) instead of route API airport coords. Enrichment was a fragile middleman in DetailPanel. Fix: `drawTrail(points, routeData)` now builds the full path internally — prepends dep airport coords, appends arr airport coords from route API, places markers at actual airport positions. DetailPanel just passes raw trail + route, no enrichment. Ribbon width 0.004 WU core + 0.01 glow. Airport sphere markers 0.015 WU + glow rings 0.028 WU at renderOrder 15. |

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