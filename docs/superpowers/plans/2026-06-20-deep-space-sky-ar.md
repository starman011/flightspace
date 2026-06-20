# Deep-Space Sky AR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users explore the DESI deep-space sky by physically moving their phone (gyroscope/compass "point at the sky"), with familiar objects labeled in silver, and a default view that's zoomed in enough to read structure instead of a dense clustered blob.

**Architecture:** Three independent, incrementally-shippable pillars on top of the existing Three.js galaxy scene. (1) A narrower default FOV on entering deep space de-clusters the point cloud. (2) A curated `skyObjects` dataset is projected to HTML labels in the existing `labelContainer`, styled silver, with distance-from-center declutter. (3) The existing `DeviceOrientationAR` controller is upgraded with smoothing + screen-orientation handling, and a new `celestialAlignment` module rotates the celestial group using observer latitude + local sidereal time so the on-screen sky matches the real sky (precision "point at the sky" mode).

**Tech Stack:** React 18, Three.js (r16x), Vite, Vitest (unit tests), Device Orientation API, Geolocation API.

**Existing pieces this builds on (do not re-create):**
- `frontend/src/components/Globe/DeviceOrientationAR.js` — orientation/mouse camera controller (`enable/disable/update/isActive/isMobile`).
- `frontend/src/components/Globe/Globe.jsx` — `enableAR`/`disableAR` imperative handles (~line 1186), `arController.update()` in tick (~2504), galaxy camera enter (~1218), `galaxyHeadingRef` (RA/Dec per frame), HTML `labelContainer` (~1661), `desiLayer` (~1548), galaxy FOV wheel/pinch zoom (~1286–1316).
- `frontend/src/components/Globe/starData.js` — `BSC5_STARS`: `[ra_hours, dec_deg, vmag, bv_color, hr_number, name]`, 8404 stars.
- `frontend/src/components/Globe/DESILayer.js` — `raDecToXYZ(raDeg, decDeg, radius)`, `zToRadius(z)`.
- `frontend/src/components/Globe/solarSystem.js` — `CAM_GALAXY = { position:[0,0,0.01], minDist:0.01, maxDist:400 }`.
- `frontend/src/App.jsx` — `arActive` state + `handleARToggle` (~464), "Free Look" button (~850).

---

## Pillar A — Default zoomed-in deep space (de-cluster)

### Task A1: Add a default FOV to the galaxy camera config

**Files:**
- Modify: `frontend/src/components/Globe/solarSystem.js` (the `CAM_GALAXY` export)

- [ ] **Step 1: Add `fov` and zoom clamps to `CAM_GALAXY`**

Replace the `CAM_GALAXY` export with:

```js
export const CAM_GALAXY = {
  position: [0, 0, 0.01],
  minDist:  0.01,
  maxDist:  400,
  // Deep space opens "zoomed in" (telephoto) so the DESI cloud reads as
  // structure instead of a dense blob. The camera's normal FOV is 40; 28 is a
  // clear (but not extreme) zoom-in. Pinch/wheel still adjusts within range.
  fov:      28,   // default field of view in degrees
  fovMin:   12,   // most zoomed-in
  fovMax:   60,   // most zoomed-out
}
```

- [ ] **Step 2: Apply the default FOV when the camera scale becomes 'galaxy'**

In `frontend/src/components/Globe/Globe.jsx`, find the galaxy camera enter block (~line 1218, where the comment reads "Position camera slightly inside the galaxy's radius"). Locate where the scale transition to `'galaxy'` is handled (search for `CAM_GALAXY` usage and the `targetCameraScale === 'galaxy'` transition). Immediately after the camera position for galaxy mode is set, add:

```js
// Open deep space zoomed in so the point cloud isn't clustered.
if (camera.fov !== CAM_GALAXY.fov) {
  camera.fov = CAM_GALAXY.fov
  camera.updateProjectionMatrix()
}
```

- [ ] **Step 3: Clamp the existing pinch/wheel FOV zoom to `fovMin`/`fovMax`**

In the `galaxyWheel` handler (~line 1286) and the `galaxyTouchMove` pinch handler (~1303), find where `camera.fov` is assigned. Wrap each assignment with the clamp:

```js
camera.fov = MathUtils.clamp(camera.fov /* ...existing expression... */, CAM_GALAXY.fovMin, CAM_GALAXY.fovMax)
camera.updateProjectionMatrix()
```

(`MathUtils` is already imported in Globe.jsx.)

- [ ] **Step 4: Restore the default FOV when leaving galaxy scale**

Find where the scale transitions away from galaxy (search for the other `CAM_EARTH`/`CAM_SOLAR`/`CAM_MOON` transitions). The camera's normal FOV is **40** (`new PerspectiveCamera(40, …)`), so restore to 40 (NOT 60). In the non-galaxy transition path, add:

```js
if (camera.fov !== 40) { camera.fov = 40; camera.updateProjectionMatrix() }
```

- [ ] **Step 5: Manual verification**

Run: `cd frontend && npm run dev`
Open the app, switch to Deep Space. Expected: the view opens noticeably tighter (telephoto), points are spread out and readable rather than a dense central blob. Pinch out → points get denser (FOV up to 65), pinch in → tighter (down to 14). Switch back to Earth → normal FOV restored.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Globe/solarSystem.js frontend/src/components/Globe/Globe.jsx
git commit -m "Globe: open deep space zoomed in (default galaxy FOV 38) to de-cluster"
```

---

## Pillar B — Silver labels for known/familiar objects

### Task B1: Curated famous-objects dataset

**Files:**
- Create: `frontend/src/components/Globe/skyObjects.js`
- Test: `frontend/src/components/Globe/skyObjects.test.js`

- [ ] **Step 1: Write the failing test**

```js
// frontend/src/components/Globe/skyObjects.test.js
import { describe, it, expect } from 'vitest'
import { SKY_OBJECTS } from './skyObjects.js'

describe('SKY_OBJECTS', () => {
  it('has familiar named objects with valid coordinates', () => {
    expect(SKY_OBJECTS.length).toBeGreaterThan(20)
    const sirius = SKY_OBJECTS.find(o => o.name === 'Sirius')
    expect(sirius).toBeTruthy()
    // Sirius J2000: RA ~101.3°, Dec ~ -16.7°
    expect(sirius.ra).toBeGreaterThan(100); expect(sirius.ra).toBeLessThan(102)
    expect(sirius.dec).toBeLessThan(-16);  expect(sirius.dec).toBeGreaterThan(-17)
  })
  it('every object has name, ra(0..360), dec(-90..90), kind, priority', () => {
    for (const o of SKY_OBJECTS) {
      expect(typeof o.name).toBe('string')
      expect(o.ra).toBeGreaterThanOrEqual(0); expect(o.ra).toBeLessThan(360)
      expect(o.dec).toBeGreaterThanOrEqual(-90); expect(o.dec).toBeLessThanOrEqual(90)
      expect(['star', 'dso', 'constellation']).toContain(o.kind)
      expect(typeof o.priority).toBe('number')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/Globe/skyObjects.test.js`
Expected: FAIL — cannot import `./skyObjects.js`.

- [ ] **Step 3: Create the dataset**

```js
// frontend/src/components/Globe/skyObjects.js
// Curated "familiar" sky objects for labelling. RA/Dec in J2000 degrees.
// priority: lower = more famous (shown first when decluttering).
// kind: 'star' | 'dso' (deep-sky object) | 'constellation'
export const SKY_OBJECTS = [
  // ── Brightest / most famous stars ──
  { name: 'Sirius',     ra: 101.287, dec: -16.716, kind: 'star', priority: 1 },
  { name: 'Canopus',    ra: 95.988,  dec: -52.696, kind: 'star', priority: 2 },
  { name: 'Arcturus',   ra: 213.915, dec: 19.182,  kind: 'star', priority: 3 },
  { name: 'Vega',       ra: 279.234, dec: 38.784,  kind: 'star', priority: 3 },
  { name: 'Capella',    ra: 79.172,  dec: 45.998,  kind: 'star', priority: 4 },
  { name: 'Rigel',      ra: 78.634,  dec: -8.202,  kind: 'star', priority: 4 },
  { name: 'Procyon',    ra: 114.825, dec: 5.225,   kind: 'star', priority: 4 },
  { name: 'Betelgeuse', ra: 88.793,  dec: 7.407,   kind: 'star', priority: 3 },
  { name: 'Altair',     ra: 297.696, dec: 8.868,   kind: 'star', priority: 4 },
  { name: 'Aldebaran',  ra: 68.980,  dec: 16.509,  kind: 'star', priority: 4 },
  { name: 'Antares',    ra: 247.352, dec: -26.432, kind: 'star', priority: 4 },
  { name: 'Spica',      ra: 201.298, dec: -11.161, kind: 'star', priority: 5 },
  { name: 'Pollux',     ra: 116.329, dec: 28.026,  kind: 'star', priority: 5 },
  { name: 'Deneb',      ra: 310.358, dec: 45.280,  kind: 'star', priority: 4 },
  { name: 'Regulus',    ra: 152.093, dec: 11.967,  kind: 'star', priority: 5 },
  { name: 'Polaris',    ra: 37.954,  dec: 89.264,  kind: 'star', priority: 2 },
  { name: 'Fomalhaut',  ra: 344.413, dec: -29.622, kind: 'star', priority: 5 },
  // ── Famous deep-sky objects ──
  { name: 'Andromeda Galaxy (M31)', ra: 10.685, dec: 41.269, kind: 'dso', priority: 1 },
  { name: 'Orion Nebula (M42)',     ra: 83.822, dec: -5.391, kind: 'dso', priority: 1 },
  { name: 'Pleiades (M45)',         ra: 56.601, dec: 24.114, kind: 'dso', priority: 2 },
  { name: 'Triangulum Galaxy (M33)',ra: 23.462, dec: 30.660, kind: 'dso', priority: 4 },
  { name: 'Whirlpool Galaxy (M51)', ra: 202.470, dec: 47.195, kind: 'dso', priority: 5 },
  { name: 'Crab Nebula (M1)',       ra: 83.633, dec: 22.014, kind: 'dso', priority: 5 },
  { name: 'Hercules Cluster (M13)', ra: 250.423, dec: 36.460, kind: 'dso', priority: 5 },
  { name: 'Lagoon Nebula (M8)',     ra: 270.924, dec: -24.387,kind: 'dso', priority: 6 },
  { name: 'Galactic Center',        ra: 266.417, dec: -29.008,kind: 'dso', priority: 3 },
  // ── Constellation anchors (label at a representative point) ──
  { name: 'Orion',          ra: 83.0,  dec: 0.0,    kind: 'constellation', priority: 2 },
  { name: 'Ursa Major',     ra: 165.0, dec: 56.0,   kind: 'constellation', priority: 3 },
  { name: 'Cassiopeia',     ra: 15.0,  dec: 60.0,   kind: 'constellation', priority: 4 },
  { name: 'Scorpius',       ra: 245.0, dec: -26.0,  kind: 'constellation', priority: 3 },
  { name: 'Cygnus',         ra: 305.0, dec: 42.0,   kind: 'constellation', priority: 4 },
  { name: 'Leo',            ra: 160.0, dec: 18.0,   kind: 'constellation', priority: 4 },
  { name: 'Crux (Southern Cross)', ra: 187.0, dec: -59.0, kind: 'constellation', priority: 3 },
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/Globe/skyObjects.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Globe/skyObjects.js frontend/src/components/Globe/skyObjects.test.js
git commit -m "Globe: add curated familiar sky-objects dataset for labels"
```

### Task B2: Label projection + declutter helper

**Files:**
- Create: `frontend/src/components/Globe/skyLabelLayout.js`
- Test: `frontend/src/components/Globe/skyLabelLayout.test.js`

- [ ] **Step 1: Write the failing test**

```js
// frontend/src/components/Globe/skyLabelLayout.test.js
import { describe, it, expect } from 'vitest'
import { pickVisibleLabels } from './skyLabelLayout.js'

// Fake projected candidates: {name, x, y, depth, priority, onScreen}
const cand = (name, x, y, priority, onScreen = true, depth = 0.5) =>
  ({ name, x, y, priority, onScreen, depth })

describe('pickVisibleLabels', () => {
  it('drops off-screen and behind-camera candidates', () => {
    const out = pickVisibleLabels([
      cand('A', 100, 100, 1, true, 0.5),
      cand('B', 100, 100, 1, false, 0.5),    // off-screen
      cand('C', 100, 100, 1, true, 1.2),     // depth > 1 = behind camera
    ], { maxLabels: 10, minGapPx: 40 })
    expect(out.map(o => o.name)).toEqual(['A'])
  })
  it('declutters overlapping labels keeping the higher priority (lower number)', () => {
    const out = pickVisibleLabels([
      cand('low', 200, 200, 9),
      cand('high', 210, 205, 1),   // within 40px of "low"
    ], { maxLabels: 10, minGapPx: 40 })
    expect(out.map(o => o.name)).toEqual(['high'])
  })
  it('respects maxLabels', () => {
    const many = Array.from({ length: 30 }, (_, i) => cand('s' + i, i * 100, 0, i))
    const out = pickVisibleLabels(many, { maxLabels: 8, minGapPx: 10 })
    expect(out.length).toBe(8)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/Globe/skyLabelLayout.test.js`
Expected: FAIL — cannot import `./skyLabelLayout.js`.

- [ ] **Step 3: Implement the helper**

```js
// frontend/src/components/Globe/skyLabelLayout.js
// Pure screen-space declutter. Input candidates already projected to pixels:
//   { name, x, y, depth, priority, onScreen }  (depth: NDC z, <1 = in front)
// Output: the subset to actually render, sorted by priority.
export function pickVisibleLabels(candidates, { maxLabels = 12, minGapPx = 44 } = {}) {
  const visible = candidates
    .filter(c => c.onScreen && c.depth < 1)
    .sort((a, b) => a.priority - b.priority)

  const kept = []
  for (const c of visible) {
    if (kept.length >= maxLabels) break
    const clash = kept.some(k => Math.hypot(k.x - c.x, k.y - c.y) < minGapPx)
    if (!clash) kept.push(c)
  }
  return kept
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/Globe/skyLabelLayout.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Globe/skyLabelLayout.js frontend/src/components/Globe/skyLabelLayout.test.js
git commit -m "Globe: add screen-space sky-label declutter helper"
```

### Task B3: Render silver labels in the galaxy scene

**Files:**
- Modify: `frontend/src/components/Globe/Globe.jsx`
- Modify: `frontend/src/components/Globe/Globe.module.css`

- [ ] **Step 1: Add label element pool next to the existing labelContainer**

In `Globe.jsx`, right after the `labelContainer` is created and appended (~line 1663), and after the imports add at top with the other Globe imports:

```js
import { SKY_OBJECTS } from './skyObjects.js'
import { pickVisibleLabels } from './skyLabelLayout.js'
```

After `labelContainer` setup, create a reusable pool of silver label divs (one per sky object) plus a Vector3 scratch:

```js
// ── Silver labels for familiar sky objects (galaxy scale only) ──
const SKY_LABEL_RADIUS = zToRadius(0.0001) * 0.98   // just inside the near shell
const skyLabelEls = SKY_OBJECTS.map(o => {
  const div = document.createElement('div')
  div.className = styles.skyLabel
  div.dataset.kind = o.kind
  div.textContent = o.name
  div.style.display = 'none'
  labelContainer.appendChild(div)
  const pos = raDecToXYZ(o.ra, o.dec, SKY_LABEL_RADIUS)
  return { ...o, div, world: new Vector3(pos.x, pos.y, pos.z) }
})
const _skyProj = new Vector3()
```

(`raDecToXYZ`, `zToRadius`, `Vector3` are already imported in Globe.jsx; confirm and add to the `three` import if missing.)

- [ ] **Step 2: Project + lay out labels each frame in the tick loop**

In the tick loop, inside the `if (int.current.targetCameraScale === 'galaxy')` branch (near where DESI hover runs, ~line 2074, but in the per-frame render section near `galaxySystem.update()` ~2503), add:

```js
// Sky-object silver labels
{
  const w = el.clientWidth, h = el.clientHeight
  const cands = skyLabelEls.map(L => {
    _skyProj.copy(L.world).project(camera)
    const x = (_skyProj.x * 0.5 + 0.5) * w
    const y = (-_skyProj.y * 0.5 + 0.5) * h
    const onScreen = x >= -40 && x <= w + 40 && y >= -20 && y <= h + 20
    return { name: L.name, x, y, depth: _skyProj.z, priority: L.priority, _el: L.div }
  })
  const keep = new Set(pickVisibleLabels(cands, { maxLabels: 14, minGapPx: 46 }).map(c => c.name))
  for (const c of cands) {
    if (keep.has(c.name)) {
      c._el.style.display = 'block'
      c._el.style.transform = `translate(-50%, -50%) translate(${c.x}px, ${c.y}px)`
    } else {
      c._el.style.display = 'none'
    }
  }
}
```

- [ ] **Step 3: Hide all sky labels when not in galaxy scale**

In the non-galaxy branch of the same tick section (or right after the block above, guarded), ensure labels hide when leaving:

```js
if (int.current.targetCameraScale !== 'galaxy' && skyLabelEls[0]?.div.style.display !== 'none') {
  for (const L of skyLabelEls) L.div.style.display = 'none'
}
```

- [ ] **Step 4: Dispose labels in cleanup**

In the Globe effect cleanup (near where `arController.disable()` is called ~2917), add:

```js
for (const L of skyLabelEls) L.div.remove()
```

- [ ] **Step 5: Add the silver label styles**

In `Globe.module.css`, add:

```css
.skyLabel {
  position: absolute;
  top: 0;
  left: 0;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  color: #d8dde6;                         /* silver */
  text-shadow: 0 0 6px rgba(0, 0, 0, 0.9), 0 0 2px rgba(0, 0, 0, 0.9);
  pointer-events: none;
  opacity: 0.92;
  transition: opacity 0.2s;
}
.skyLabel[data-kind="dso"]           { color: #e6e9f0; font-style: italic; }
.skyLabel[data-kind="constellation"]{ color: #b9c0cc; letter-spacing: 0.18em; text-transform: uppercase; font-size: 9.5px; opacity: 0.7; }
```

- [ ] **Step 6: Manual verification**

Run: `cd frontend && npm run dev`. Enter Deep Space. Expected: familiar names (Sirius, Vega, Orion Nebula, Andromeda, Orion, Scorpius…) appear in silver near their sky positions, never more than ~14 at once, no two overlapping, and they hide when you leave Deep Space. Rotating/zooming keeps them pinned to their objects.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/Globe/Globe.jsx frontend/src/components/Globe/Globe.module.css
git commit -m "Globe: render silver labels for familiar sky objects in deep space"
```

---

## Pillar C — Gyro "point at the sky" navigation with precision

### Task C1: Celestial alignment math (LST + horizontal↔equatorial)

**Files:**
- Create: `frontend/src/components/Globe/celestialAlignment.js`
- Test: `frontend/src/components/Globe/celestialAlignment.test.js`

- [ ] **Step 1: Write the failing test**

```js
// frontend/src/components/Globe/celestialAlignment.test.js
import { describe, it, expect } from 'vitest'
import { julianDate, gmstDeg, lstDeg, altAzToRaDec, raDecToAltAz } from './celestialAlignment.js'

describe('celestial alignment', () => {
  it('julianDate of 2000-01-01 12:00 UTC ≈ 2451545.0', () => {
    expect(julianDate(new Date(Date.UTC(2000, 0, 1, 12, 0, 0)))).toBeCloseTo(2451545.0, 3)
  })
  it('gmst is in [0,360)', () => {
    const g = gmstDeg(new Date(Date.UTC(2026, 5, 20, 3, 0, 0)))
    expect(g).toBeGreaterThanOrEqual(0); expect(g).toBeLessThan(360)
  })
  it('North Celestial Pole sits at altitude = latitude, azimuth = 0', () => {
    const lat = 28.6, lst = 123.4
    const { alt, az } = raDecToAltAz(0, 90, lat, lst)   // Dec=90 = NCP
    expect(alt).toBeCloseTo(lat, 4)
    // azimuth of the pole is due north (0 or 360)
    expect(Math.min(az, 360 - az)).toBeLessThan(1e-3)
  })
  it('altAz and raDec are inverses (round trip)', () => {
    const lat = 19.8, lst = 250.0
    const { ra, dec } = altAzToRaDec(42, 137, lat, lst)
    const back = raDecToAltAz(ra, dec, lat, lst)
    expect(back.alt).toBeCloseTo(42, 4)
    expect(back.az).toBeCloseTo(137, 4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/Globe/celestialAlignment.test.js`
Expected: FAIL — cannot import `./celestialAlignment.js`.

- [ ] **Step 3: Implement the math**

```js
// frontend/src/components/Globe/celestialAlignment.js
const D = Math.PI / 180
const norm360 = (x) => ((x % 360) + 360) % 360
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))

export function julianDate(date) {
  return date.getTime() / 86400000 + 2440587.5
}

// Greenwich Mean Sidereal Time, degrees [0,360)
export function gmstDeg(date) {
  const d = julianDate(date) - 2451545.0
  return norm360(280.46061837 + 360.98564736629 * d)
}

// Local Sidereal Time, degrees [0,360); lonDeg east-positive
export function lstDeg(date, lonDeg) {
  return norm360(gmstDeg(date) + lonDeg)
}

// Horizontal (alt deg, az deg from North clockwise) -> Equatorial (ra,dec deg)
export function altAzToRaDec(altDeg, azDeg, latDeg, lstDegVal) {
  const a = altDeg * D, A = azDeg * D, phi = latDeg * D
  const sinDec = Math.sin(a) * Math.sin(phi) + Math.cos(a) * Math.cos(phi) * Math.cos(A)
  const dec = Math.asin(clamp(sinDec, -1, 1))
  const y = -Math.cos(a) * Math.sin(A)
  const x = Math.sin(a) * Math.cos(phi) - Math.cos(a) * Math.sin(phi) * Math.cos(A)
  const Hdeg = Math.atan2(y, x) / D            // hour angle, degrees
  return { ra: norm360(lstDegVal - Hdeg), dec: dec / D }
}

// Equatorial (ra,dec deg) -> Horizontal (alt deg, az deg from North clockwise)
export function raDecToAltAz(raDeg, decDeg, latDeg, lstDegVal) {
  const H = (norm360(lstDegVal - raDeg)) * D    // hour angle
  const dec = decDeg * D, phi = latDeg * D
  const sinAlt = Math.sin(dec) * Math.sin(phi) + Math.cos(dec) * Math.cos(phi) * Math.cos(H)
  const alt = Math.asin(clamp(sinAlt, -1, 1))
  const y = -Math.sin(H) * Math.cos(dec)
  const x = Math.cos(phi) * Math.sin(dec) - Math.sin(phi) * Math.cos(dec) * Math.cos(H)
  let az = Math.atan2(y, x) / D
  return { alt: alt / D, az: norm360(az) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/Globe/celestialAlignment.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Globe/celestialAlignment.js frontend/src/components/Globe/celestialAlignment.test.js
git commit -m "Globe: add celestial alignment math (LST, alt-az<->ra-dec)"
```

### Task C2: Build the alignment quaternion for the celestial group

**Files:**
- Modify: `frontend/src/components/Globe/celestialAlignment.js`
- Modify: `frontend/src/components/Globe/celestialAlignment.test.js`

- [ ] **Step 1: Write the failing test**

Add to `celestialAlignment.test.js`:

```js
import { equatorialBasisInHorizontal } from './celestialAlignment.js'

describe('equatorialBasisInHorizontal', () => {
  it('maps the NCP direction to the expected horizontal vector', () => {
    const lat = 30, lst = 0
    const { poleDir } = equatorialBasisInHorizontal(lat, lst)
    // Pole altitude = lat → unit vector in ENU: E=0, N=cos(lat), Up=sin(lat)
    const r = 30 * Math.PI / 180
    expect(poleDir.e).toBeCloseTo(0, 5)
    expect(poleDir.n).toBeCloseTo(Math.cos(r), 5)
    expect(poleDir.u).toBeCloseTo(Math.sin(r), 5)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/components/Globe/celestialAlignment.test.js`
Expected: FAIL — `equatorialBasisInHorizontal` not exported.

- [ ] **Step 3: Implement**

Append to `celestialAlignment.js`:

```js
// Unit vector (East, North, Up) for an equatorial (ra,dec) at this site/time.
function raDecToENU(raDeg, decDeg, latDeg, lstDegVal) {
  const { alt, az } = raDecToAltAz(raDeg, decDeg, latDeg, lstDegVal)
  const a = alt * D, A = az * D
  return { e: Math.cos(a) * Math.sin(A), n: Math.cos(a) * Math.cos(A), u: Math.sin(a) }
}

// Returns the ENU directions of key equatorial reference points, enough for the
// renderer to construct a rotation aligning the equatorial group to the local
// horizontal (ENU) world the device orientation drives.
export function equatorialBasisInHorizontal(latDeg, lstDegVal) {
  return {
    poleDir:    raDecToENU(0,   90, latDeg, lstDegVal),   // North Celestial Pole
    originDir:  raDecToENU(lstDegVal, 0, latDeg, lstDegVal), // RA=LST, Dec=0 (zenith-ish meridian)
    eastDir:    raDecToENU(norm360(lstDegVal - 90), 0, latDeg, lstDegVal),
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run src/components/Globe/celestialAlignment.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Globe/celestialAlignment.js frontend/src/components/Globe/celestialAlignment.test.js
git commit -m "Globe: expose equatorial->horizontal basis for sky alignment"
```

### Task C3: Smooth + screen-orientation-correct the DeviceOrientationAR controller

**Files:**
- Modify: `frontend/src/components/Globe/DeviceOrientationAR.js`

- [ ] **Step 1: Add a low-pass filter + screen-angle compensation to the device path**

In `DeviceOrientationAR.js`, add near the top of the factory (after the orientation state vars):

```js
// Smoothed orientation (low-pass) to kill sensor jitter.
let sAlpha = 0, sBeta = 90, sGamma = 0, primed = false
const SMOOTH = 0.18   // 0..1, higher = snappier
const lerpAngle = (a, b, t) => {
  let d = ((b - a + 540) % 360) - 180
  return a + d * t
}
function screenAngle() {
  const o = (screen.orientation && screen.orientation.angle)
  return (o != null ? o : (window.orientation || 0)) * DEG
}
```

- [ ] **Step 2: Feed raw values through the filter in `onDeviceOrientation`**

Replace the body of `onDeviceOrientation` with:

```js
function onDeviceOrientation(e) {
  if (!active || mode !== 'device') return
  const rawHeading = e.webkitCompassHeading ?? ((360 - (e.alpha || 0)) % 360)
  if (!primed) { sAlpha = rawHeading; sBeta = e.beta || 90; sGamma = e.gamma || 0; primed = true }
  sAlpha = lerpAngle(sAlpha, rawHeading, SMOOTH)
  sBeta  = sBeta  + ((e.beta  || 0) - sBeta)  * SMOOTH
  sGamma = sGamma + ((e.gamma || 0) - sGamma) * SMOOTH
  compassHeading = sAlpha; beta = sBeta; gamma = sGamma
}
```

- [ ] **Step 3: Apply screen-angle compensation in `update()`**

In `update()`, in the `mode === 'device'` branch, replace the roll line so portrait/landscape are handled:

```js
if (mode === 'device') {
  const az = compassHeading * DEG
  const alt = (beta - 90) * DEG
  const roll = gamma * DEG + screenAngle()
  camera.rotation.order = 'ZXY'
  camera.rotation.x = alt
  camera.rotation.y = -az
  camera.rotation.z = -roll
}
```

- [ ] **Step 4: Manual verification (device required)**

Deploy to a branch preview or run `npm run dev` and open on a phone (HTTPS required for sensors). Enable the mode; the view should follow the phone smoothly (no jitter) and stay level when you rotate the phone between portrait and landscape.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Globe/DeviceOrientationAR.js
git commit -m "DeviceOrientationAR: low-pass smoothing + screen-orientation roll fix"
```

### Task C4: Align the celestial sky to the real sky (geolocation + LST)

**Files:**
- Modify: `frontend/src/components/Globe/Globe.jsx`

- [ ] **Step 1: Add a celestial alignment group around the sky content**

In `Globe.jsx`, add the imports:

```js
import { lstDeg, equatorialBasisInHorizontal } from './celestialAlignment.js'
import { Quaternion, Matrix4 } from 'three'   // add to existing three import if not present
```

Wrap the DESI layer + night-sky scene + the sky labels' positions under a group whose quaternion we set when "sky-aligned" mode is on. After `desiLayer` and `galaxySystem` are created (~1548), add:

```js
const skyAlignGroup = desiLayer.group   // DESI group is the alignment carrier
int.current.skyAligned = false
int.current.observer = null             // { lat, lon } once geolocation resolves
```

- [ ] **Step 2: Add a method to enable sky-aligned mode (requests geolocation)**

In the imperative handle block (near `enableAR`/`disableAR`, ~1186), add:

```js
enableSkyAlign: () => new Promise((resolve) => {
  if (!navigator.geolocation) { resolve(false); return }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      int.current.observer = { lat: pos.coords.latitude, lon: pos.coords.longitude }
      int.current.skyAligned = true
      resolve(true)
    },
    () => resolve(false),
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
  )
}),
disableSkyAlign: () => {
  int.current.skyAligned = false
  desiLayer.group.quaternion.identity()
},
```

- [ ] **Step 3: Recompute the alignment quaternion (slowly) in the tick**

In the tick loop, in the galaxy section, add (compute at most ~1×/sec — sidereal drift is tiny):

```js
if (int.current.skyAligned && int.current.observer) {
  const now = Date.now()
  if (now - (int.current._lstAt || 0) > 1000) {
    int.current._lstAt = now
    const { lat, lon } = int.current.observer
    const lst = lstDeg(new Date(), lon)
    const b = equatorialBasisInHorizontal(lat, lst)
    // Build an orthonormal basis (ENU) from pole(=scene +Y/Dec axis) and east.
    const up = new Vector3(b.poleDir.e, b.poleDir.u, b.poleDir.n).normalize() // map ENU->three(y=up,z=north)
    const east = new Vector3(b.eastDir.e, b.eastDir.u, b.eastDir.n).normalize()
    const fwd = new Vector3().crossVectors(east, up).normalize()
    const m = new Matrix4().makeBasis(east, up, fwd)
    desiLayer.group.quaternion.setFromRotationMatrix(m)
  }
}
```

> Note for implementer: the exact axis mapping (`ENU → three world` where three uses y-up, and the night-sky/DESI equatorial convention from `raDecToXYZ`) must be reconciled empirically — verify with the manual check in Step 5 and adjust the basis vector component order until Polaris lands due-north at altitude = your latitude. Encode the final mapping as a comment.

- [ ] **Step 4: Keep the sky labels under the same alignment**

Because the silver labels (Pillar B) are positioned from `raDecToXYZ` in world space, when aligned they must be transformed by the same quaternion. In the label projection block (Task B3 Step 2), before `.project(camera)`, apply:

```js
_skyProj.copy(L.world)
if (int.current.skyAligned) _skyProj.applyQuaternion(desiLayer.group.quaternion)
_skyProj.project(camera)
```

- [ ] **Step 5: Manual verification (device + known sky)**

On a phone at night with location enabled: enable sky-aligned mode, point the phone at Polaris (or the Moon/a known bright star). Expected: the on-screen label/object for that star sits where you're pointing (within a few degrees). Point north and level → the horizon/pole geometry matches reality. Adjust the Step-3 axis mapping until alignment holds for at least two well-separated reference stars.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Globe/Globe.jsx
git commit -m "Globe: align deep-space sky to the real sky via geolocation + LST"
```

### Task C5: "Point at the Sky" mobile entry + heading readout

**Files:**
- Modify: `frontend/src/App.jsx`
- Create: `frontend/src/components/SkyReticle/SkyReticle.jsx`
- Create: `frontend/src/components/SkyReticle/SkyReticle.module.css`

- [ ] **Step 1: Relabel/extend the galaxy AR control for mobile**

In `App.jsx`, the existing galaxy "Free Look" button (~850) calls `handleARToggle`. Change `handleARToggle` (~464) so that on mobile it also enables sky-alignment after AR turns on:

```js
const handleARToggle = useCallback(async () => {
  if (arActive) {
    globeRef.current?.disableAR?.()
    globeRef.current?.disableSkyAlign?.()
    setArActive(false)
    return
  }
  const ok = await globeRef.current?.enableAR?.()
  if (ok) {
    setArActive(true)
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    if (isMobile) await globeRef.current?.enableSkyAlign?.()   // best-effort; ignores denial
  }
}, [arActive])
```

Change the button label so it reads `Point at the Sky` on mobile and `Free Look` on desktop (compute `isMobile` in render).

- [ ] **Step 2: Create the reticle + heading readout component**

```jsx
// frontend/src/components/SkyReticle/SkyReticle.jsx
import styles from './SkyReticle.module.css'

export default function SkyReticle({ active, heading }) {
  if (!active) return null
  return (
    <div className={styles.wrap} aria-hidden="true">
      <div className={styles.reticle} />
      {heading && (
        <div className={styles.readout}>
          RA {heading.raHms} · Dec {heading.decDms}
        </div>
      )}
    </div>
  )
}
```

```css
/* frontend/src/components/SkyReticle/SkyReticle.module.css */
.wrap { position: fixed; inset: 0; z-index: 80; pointer-events: none; display: flex; align-items: center; justify-content: center; }
.reticle { width: 54px; height: 54px; border: 1px solid rgba(216, 221, 230, 0.5); border-radius: 50%; box-shadow: 0 0 0 1px rgba(0,0,0,0.4) inset; }
.reticle::before, .reticle::after { content: ''; position: absolute; background: rgba(216,221,230,0.5); }
.reticle::before { width: 1px; height: 16px; left: 50%; top: -22px; }
.reticle::after  { width: 16px; height: 1px; top: 50%; left: -22px; }
.readout { position: fixed; bottom: 120px; left: 50%; transform: translateX(-50%); font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.08em; color: #d8dde6; background: rgba(6,10,16,0.7); border: 1px solid rgba(216,221,230,0.18); border-radius: 999px; padding: 6px 12px; }
```

- [ ] **Step 3: Wire the reticle + heading in App.jsx**

Import and render it for galaxy scale while AR is active. Source the heading from the existing `galaxyHeadingRef` exposed via a small imperative getter on the globe (add `getGalaxyHeading: () => int.current.galaxyHeading` to Globe and poll it with a 250 ms interval into state, formatting RA hours→`HHhMMm` and Dec→`±DD°MM'`).

```jsx
{activeScale === 'galaxy' && (
  <SkyReticle active={arActive} heading={skyHeading} />
)}
```

- [ ] **Step 4: Manual verification**

On desktop: galaxy scale, click "Free Look", reticle + RA/Dec readout appears and updates as you drag. On mobile: button reads "Point at the Sky", tapping prompts motion + location permission, the readout tracks where the phone points.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/SkyReticle/
git commit -m "App: Point at the Sky mobile mode + reticle/RA-Dec readout"
```

---

## Self-Review

**Spec coverage:**
- "Move phone → perspective moves (gyro/accel)": Pillar C (C3 smoothing, C4 alignment, C5 entry). ✓
- "Precision / know what you're seeing": C1/C2 astronomical alignment + C5 RA/Dec readout + B labels. ✓
- "Mark known/familiar objects with good text, silver": Pillar B (B1 data, B2 declutter, B3 silver labels). ✓
- "Default deep space zoomed in, not clustered": Pillar A. ✓

**Notes / decisions deferred to implementation:**
- Exact ENU→three.js axis mapping in C4 Step 3 is verified empirically (documented in the step) because it depends on the existing `raDecToXYZ` convention.
- Geolocation/orientation require HTTPS + user permission; all paths are best-effort and degrade to free exploration (non-aligned) if denied.
- Labels use common names only (curated ~33). The 8404-star `BSC5_STARS` is intentionally NOT all labelled (would re-cluster); it remains the point field.

**Incremental shipping:** Pillars A, B, C are independent. Ship A first (quick de-clutter win), then B (labels), then C (AR). Each leaves the app working.
