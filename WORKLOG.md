# Flightspace — Work Log

Tracks all significant changes made during development sessions.

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