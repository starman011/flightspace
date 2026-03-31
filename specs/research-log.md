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
