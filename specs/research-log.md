# Research Log

Problems that required research beyond simple debugging. Each entry documents the failed attempts, research findings, and the solution that worked.

---

## 1. Tile Z-Fighting / Random Patterns on Zoom

**Problem:** Visual glitches (random flickering patterns, dark patches) when zooming in/out on the 3D globe.

**Attempts:**
1. Adjusted tile `renderOrder` — helped ordering but didn't fix z-fighting
2. Added `polygonOffset` (-4/-6 factors) — reduced but didn't eliminate

**Research:**
- CesiumJS uses `logarithmicDepthBuffer` for all globe rendering (handles 1m to 1M km range)
- Three.js docs: standard depth buffer has 24-bit precision — near/far ratio >16M causes z-fighting
- Our ratio at close zoom: `0.000003 / 200 = 67M:1` — far beyond depth buffer capacity
- Key insight: tiles at `1.000005` vs `1.00001` = 32m apart. At 127m altitude with 67M:1 ratio, the depth buffer cannot resolve 32m differences.

**Solution:** Enable `logarithmicDepthBuffer: true` on WebGLRenderer. Widen tile layer separation from 32m to ~1.3km. Log depth provides uniform precision regardless of near/far ratio.

**Source:** Three.js docs (WebGLRenderer), CesiumJS architecture docs, "Logarithmic Depth Buffer" (Outerra blog)

---

## 2. Picking Inaccuracy in Dense Airspace

**Problem:** Clicking/tapping aircraft in dense areas (Europe, US East Coast) frequently selected the wrong aircraft or nothing at all.

**Attempts:**
1. NDC re-ranking after Raycaster hits — improved but still inaccurate
2. GPU color-ID picking at close zoom — better but missed targets (single pixel read, DPI bug)

**Research:**
- FlightRadar24 uses 2D Canvas overlay + rbush spatial index — aircraft are screen-space elements, not 3D raycasted
- FlightAware uses Leaflet markers with R-tree hit detection
- Paper: "Screen-Space Proximity Queries for Interactive Visualization" (Sadlo et al. 2007) — O(1) grid-based queries in screen space
- Paper: "Efficient GPU-based Selection in Dense Point Clouds" (Scheiblauer & Wimmer 2011) — enlarge pick geometry, read pixel neighborhood
- Deck.gl (Uber) uses GPU color picking with DPI-correct FBO + circular neighborhood sampling
- Key insight: Three.js Raycaster uses world-space sphere intersection — threshold doesn't correspond to screen pixels on a spherical projection

**Solution:**
- Far zoom: Replace Raycaster with `kdbush` KD-tree — project all 12K aircraft to screen coords, query by pixel radius (~2ms total)
- Close zoom: Fix GPU pick — DPI-correct render target, 7×7 pixel neighborhood sampling, 1.8× enlarged pick mesh
- Both: operate in screen space (the user's actual coordinate system)

**Sources:** FR24 inspection, kdbush (Vladimir Agafonkin / Mourner), Deck.gl picking architecture, Scheiblauer & Wimmer 2011

---

## 3. Airport ETA Computation Without External API

**Problem:** Need to show inbound flight ETAs at airports. External flight data APIs (AviationStack, FlightAware) have paid tiers or strict rate limits.

**Research:**
- AviationStack free tier: 100 requests/month — insufficient
- FlightAware AeroAPI: $0.01/call — not $0/month
- OpenSky Network: provides positions but no airport-specific arrival data
- Key insight: we already have aircraft lat/lon/speed/heading in Redis from ADS-B

**Solution:** Compute ETA from existing live data:
1. Haversine distance from aircraft to airport (filter: <500km, >2km)
2. Bearing from aircraft to airport (filter: heading within 45° of bearing)
3. ETA = distance / (ground_speed × 1.852 km/h)
4. Accuracy: ~2-5 min for aircraft within 500km (doesn't account for approach patterns, wind, ATC holds)

$0 cost, no external API, uses data already flowing through the system.

---

## 4. Night Sky / Stellarium-Style Renderer

**Problem:** Need a Stellarium-like night sky view showing real star positions, constellations, planets, and AR "point at sky" mode — entirely in Three.js, no external planetarium engine.

**Research:**
- Stellarium Web Engine: C→WASM, GPL license, uses Gaia catalog (1.7B stars). Too heavy and license-incompatible.
- Yale Bright Star Catalog (BSC5): 9,110 stars, all naked-eye visible (mag < 6.5), JSON available, J2000 epoch RA/Dec. Perfect scope.
- d3-celestial: GeoJSON constellation lines for all 88 IAU constellations. Battle-tested data, trivial to parse.
- astronomy-engine (npm): 116KB, VSOP87-based, ±1 arcmin accuracy for all planets + Moon + Sun. Built-in RA/Dec→Alt/Az transforms.
- ESO Milky Way panorama: 800M pixel equirectangular, CC-BY 4.0, downscales to 200KB JPEG at 2048×1024.
- DeviceOrientation API: alpha/beta/gamma for AR mode. iOS requires `requestPermission()` since iOS 13, HTTPS + user gesture.
- Key insight: 9,110 stars + 88 constellations + 10 planets is <600KB total. Single `THREE.Points` draw call for stars, `LineSegments` for constellations, astronomy-engine for live planet positions.

**Solution architecture:**
1. Stars: BSC5 → `THREE.Points` with `ShaderMaterial` (magnitude→size, B-V→color), `sizeAttenuation: false`
2. Constellations: d3-celestial GeoJSON → `THREE.LineSegments`, low opacity
3. Milky Way: ESO panorama on inverted `SphereGeometry` as skybox
4. Planets: `astronomy-engine` Equator() → RA/Dec → XYZ, distinct markers with labels
5. AR: DeviceOrientation → camera rotation (ZXY order), RA/Dec→Alt/Az for correct positioning
6. All assets lazy-loaded on scale transition to `'galaxy'`

**Full research document:** `specs/002-critical-features/f4-night-sky-research.md`

**Sources:** Yale BSC5, d3-celestial, astronomy-engine (cosinekitty), ESO, MDN DeviceOrientationEvent, Stellarium Web Engine (reference only)

---

## 5. Space Feed Auto-Opens After Closing Aircraft Card (Bugfix)

**Problem:** Click aircraft → DetailPanel opens → close card → Space Feed slides open by itself, even when collapsed (desktop pull-tab state or mobile peek sheet).

**Root cause (Article IX §9.1 protocol):**
- `CommandCenterOverlay` hides via inline `display: none` while any panel is open (`showCommandCenter` in App.jsx).
- Per CSS spec, an element with `display: none` has no boxes — when display is restored, all CSS animations inside RESTART from the beginning (MDN: CSS animations; CSSWG display spec).
- `.stream` carries an entry animation `feedSlideIn 0.5s` whose keyframes set `transform`/`opacity`. Running animations override normal declarations, so for 0.5s the keyframe transform replaces `.streamDesktopCollapsed` translateX (desktop) and `.streamClosed` translateY (mobile peek) — the feed renders fully open, then snaps back.
- Trigger is any `display:none → visible` toggle of the overlay: closing DetailPanel, LaunchPanel, pad focus, asteroids filter, moon scale.

**Fix:** Hide the overlay with `visibility: hidden` instead of `display: none` (CommandCenterOverlay.jsx). Visibility toggles do not restart animations; hidden elements remain non-interactive and invisible. One-line, viewport-agnostic (Article XI).

**Protection:** `CommandCenterOverlay.test.jsx` — asserts the hidden overlay never uses `display:none` and uses `visibility:hidden` (Article V / IX §9.1 step 6).

**Sources:** MDN `animation` (display:none resets animations), MDN `visibility`, CSS Display Module Level 3.
