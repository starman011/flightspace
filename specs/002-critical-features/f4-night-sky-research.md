# F4: Night Sky / Stellarium-Style View — Research Document

Research completed: 2026-03-31. Covers star rendering, constellation data, planet ephemeris, coordinate math, Milky Way panorama, AR mode via DeviceOrientation, and implementation architecture for a Three.js-based night sky replacing the current `GalaxyScene`.

---

## 1. Star Catalog: Yale Bright Star Catalog (BSC5)

**Source:** [brettonw/YaleBrightStarCatalog](https://github.com/brettonw/YaleBrightStarCatalog) (JSON), also [aduboisforge/Bright-Star-Catalog-JSON](https://github.com/aduboisforge/Bright-Star-Catalog-JSON)

**Stats:** ~9,110 stars (all naked-eye visible, magnitude < 6.5). This is the same catalog used by planetarium software for the "visible sky."

**Entry format (J2000 epoch):**
```json
{
  "HD": "358", "HR": "15", "Name": "21Alp And",
  "RA": "00h 08m 23.3s", "Dec": "+29° 05′ 26″",
  "Vmag": "2.06", "SpectralCls": "B8", "K": "12500",
  "Parallax": "+.032", "B-V": "-0.11"
}
```

**Key fields:**
| Field | Use |
|-------|-----|
| `RA`, `Dec` | Position on celestial sphere (sexagesimal, J2000) |
| `Vmag` | Visual magnitude → point size (brighter = lower number = bigger dot) |
| `SpectralCls` / `K` / `B-V` | Star color (O=blue → M=red, or use B-V color index) |
| `HR` | Harvard Revised number — cross-reference for constellation lines |
| `Name` | Bayer designation (e.g., "Alp Ori" = Betelgeuse) |

**Parsing RA to radians:**
```js
// "00h 08m 23.3s" → radians
const [h, m, s] = ra.match(/(\d+)h\s*(\d+)m\s*([\d.]+)s/).slice(1).map(Number)
const raRad = (h + m/60 + s/3600) * (Math.PI / 12) // 24h = 2π
```

**Parsing Dec to radians:**
```js
// "+29° 05′ 26″" → radians
const sign = dec.startsWith('-') ? -1 : 1
const [d, m, s] = dec.match(/(\d+)°\s*(\d+)[′']\s*(\d+)/).slice(1).map(Number)
const decRad = sign * (d + m/60 + s/3600) * (Math.PI / 180)
```

**RA/Dec → Three.js XYZ (unit sphere):**
```js
const x = Math.cos(dec) * Math.cos(ra)
const y = Math.sin(dec)                  // Three.js Y = up = north pole
const z = -Math.cos(dec) * Math.sin(ra)  // negate Z for right-handed → Three.js
```

Multiply by a large radius (e.g., `R = 500`) so stars sit on a distant sphere surrounding the camera.

**Size from magnitude:**
```js
const size = Math.max(0.5, 6.0 - vmag) // mag 0 → 6px, mag 5 → 1px, mag 6+ → 0.5px
```

**Color from B-V index:**
```js
// Simplified: B-V ranges from -0.4 (hot blue) to +2.0 (cool red)
function bvToRGB(bv) {
  const t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62))
  // Planck approximation → sRGB (or use a lookup table)
  // Blue: bv < 0 → #9bb0ff, White: bv ≈ 0 → #ffffff, Yellow: bv ≈ 0.6 → #fff4e8
  // Orange: bv ≈ 1.0 → #ffd2a1, Red: bv > 1.4 → #ffaa6e
}
```

**Rendering approach:** `THREE.Points` with `sizeAttenuation: false`, custom `ShaderMaterial` that maps magnitude → size and B-V → color per vertex. Buffer geometry with 9,110 vertices. Single draw call.

---

## 2. Constellation Lines

**Best source:** [d3-celestial](https://github.com/ofrohn/d3-celestial) — provides constellation lines as GeoJSON.

**Data files from d3-celestial `data/` directory:**
- `constellations.lines.json` — stick figures connecting stars (GeoJSON LineString features)
- `constellations.bounds.json` — IAU constellation boundaries
- `constellations.json` — constellation names + centroids

**GeoJSON format (constellations.lines.json):**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "Ori",
      "properties": { "n": "Orion", "rank": 1 },
      "geometry": {
        "type": "MultiLineString",
        "coordinates": [
          [[-7.407, -1.943], [-5.919, -1.202], [-5.603, -1.202]],
          ...
        ]
      }
    }
  ]
}
```

**Coordinate convention:** RA is encoded as longitude in degrees: `lon = -(RA_hours * 15)` mapped to [-180, 180]. Dec is latitude in degrees.

**Converting to Three.js line segments:**
```js
// For each coordinate pair [lon, lat] in the GeoJSON:
const raRad = -lon * (Math.PI / 180)  // undo the negation
const decRad = lat * (Math.PI / 180)
// Then use the same RA/Dec → XYZ formula as stars
```

**Alternative:** [dcf21/constellation-stick-figures](https://github.com/dcf21/constellation-stick-figures) — uses Hipparcos star IDs instead of coordinates, which allows connecting to actual star points. More accurate but requires Hipparcos→HR cross-reference.

**Rendering:** `THREE.LineSegments` with `LineBasicMaterial({ color: 0x334455, transparent: true, opacity: 0.3 })`. Low opacity so they're subtle guides, not overwhelming.

---

## 3. Planet Positions: astronomy-engine

**Library:** [cosinekitty/astronomy](https://github.com/cosinekitty/astronomy) — npm package `astronomy-engine`

**Why this one:**
- 116KB minified (tiny)
- Pure JS, no WASM, no external data files
- VSOP87-based, ±1 arcminute accuracy
- Supports: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto
- Built-in coordinate transforms (equatorial ↔ ecliptic ↔ horizontal ↔ galactic)
- Rise/set times, phases, eclipses, conjunctions

**Installation:**
```bash
npm install astronomy-engine
```

**Getting planet RA/Dec:**
```js
import * as Astronomy from 'astronomy-engine'

const time = new Astronomy.AstroTime(new Date())
const eq = Astronomy.Equator('Mars', time, null, true, true)
// eq.ra  → right ascension in hours (0–24)
// eq.dec → declination in degrees (-90 to +90)
// eq.dist → distance in AU
```

**Getting Alt/Az for observer (needed for AR mode):**
```js
const observer = new Astronomy.Observer(lat, lon, elevationMeters)
const hor = Astronomy.Horizon(time, observer, eq.ra, eq.dec, 'normal')
// hor.azimuth  → degrees from north (0–360)
// hor.altitude → degrees above horizon (-90 to +90)
```

**Supported bodies:** `Sun`, `Moon`, `Mercury`, `Venus`, `Mars`, `Jupiter`, `Saturn`, `Uranus`, `Neptune`, `Pluto`

**Visual magnitude:**
```js
const illum = Astronomy.Illumination('Mars', time)
// illum.mag → apparent visual magnitude
```

**Moon phase:**
```js
const phase = Astronomy.MoonPhase(time)
// 0 = new, 90 = first quarter, 180 = full, 270 = last quarter
```

---

## 4. Milky Way Panorama

**Source:** ESO (European Southern Observatory) Milky Way panorama
- URL: `https://www.eso.org/public/images/eso0932a/`
- License: **CC-BY 4.0** (free for commercial use with attribution)
- Resolution: 800 million pixels (original), multiple downscaled versions available
- Format: Equirectangular projection (standard for spherical mapping)

**Implementation:** Map onto a `THREE.SphereGeometry` (inverted normals, large radius) as the skybox background, inside the star sphere. Use a heavily downscaled version (4096×2048 or 2048×1024) to keep bundle size reasonable.

**Alternative:** Procedural Milky Way using a band of dense, dim points along the galactic plane. Simpler, smaller, but less visually impressive.

**Recommended approach:** Ship a 2048×1024 JPEG (~200KB) of the ESO panorama as the default skybox. The equirectangular format maps directly to `SphereGeometry` UV coordinates.

---

## 5. Coordinate Systems & Time

### Celestial Sphere Orientation

The sky rotates based on:
1. **Observer's latitude/longitude** — determines which part of the sky is overhead
2. **Local Sidereal Time (LST)** — Earth's rotation angle relative to the stars

### Greenwich Mean Sidereal Time (GMST)

```js
function gmst(date) {
  // Julian date from Unix timestamp
  const jd = date.getTime() / 86400000 + 2440587.5
  const T = (jd - 2451545.0) / 36525.0  // centuries from J2000
  // IAU formula (in degrees)
  let theta = 280.46061837 + 360.98564736629 * (jd - 2451545.0)
    + 0.000387933 * T * T - T * T * T / 38710000.0
  theta = ((theta % 360) + 360) % 360
  return theta * (Math.PI / 180)  // radians
}
```

### Local Sidereal Time

```js
const lst = (gmst(now) + lonRad) % (2 * Math.PI)
```

### RA/Dec → Alt/Az (for AR mode)

```js
function raDecToAltAz(ra, dec, lat, lon, date) {
  const lst = gmst(date) + lon  // all in radians
  let ha = lst - ra
  if (ha < 0) ha += 2 * Math.PI
  if (ha > Math.PI) ha -= 2 * Math.PI

  const alt = Math.asin(
    Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha)
  )
  let az = Math.atan2(
    Math.sin(ha),
    Math.cos(ha) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)
  )
  az = (az + Math.PI) % (2 * Math.PI)  // 0 = North

  return { alt, az }
}
```

### Alt/Az → Three.js XYZ (for AR rendering)

```js
// Az: 0=North, π/2=East, π=South, 3π/2=West
// Alt: 0=horizon, π/2=zenith
const x = Math.cos(alt) * Math.sin(az)
const y = Math.sin(alt)
const z = -Math.cos(alt) * Math.cos(az)
```

---

## 6. DeviceOrientation API (AR Mode)

### Overview

The DeviceOrientation API provides compass heading (alpha), pitch (beta), and roll (gamma) from the device's sensors. This enables "point your phone at the sky" AR mode.

### Event Properties

| Property | Axis | Range | Meaning |
|----------|------|-------|---------|
| `alpha` | Z (compass) | 0–360° | Compass heading (0 = North on Android, unreliable on iOS) |
| `beta` | X (pitch) | -180–180° | Device tilt front-to-back |
| `gamma` | Y (roll) | -90–90° | Device tilt left-to-right |

### iOS Permission (Required since iOS 13)

```js
async function requestOrientationPermission() {
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    const perm = await DeviceOrientationEvent.requestPermission()
    if (perm !== 'granted') throw new Error('Permission denied')
  }
  // On Android/desktop, no permission needed
}
```

**Requirements:** HTTPS + user gesture (button click). Cannot call on page load.

### Compass Heading

```js
// iOS: use webkitCompassHeading (true north)
// Android: heading = (360 - alpha) % 360

window.addEventListener('deviceorientation', (e) => {
  const heading = e.webkitCompassHeading ?? ((360 - e.alpha) % 360)
  const pitch = e.beta   // phone tilt
  const roll = e.gamma   // phone rotation
})
```

### Mapping Device Orientation → Camera

When the user holds the phone up and points it at the sky:
1. `heading` → camera Y rotation (azimuth)
2. `pitch` → camera X rotation (altitude). When phone is vertical, beta ≈ 90° = horizon; tilting further back goes toward zenith.
3. `roll` → camera Z rotation

```js
function orientationToCamera(heading, beta, gamma) {
  // Convert to radians
  const az = heading * (Math.PI / 180)
  const pitch = beta * (Math.PI / 180)
  const roll = gamma * (Math.PI / 180)

  // Build rotation: apply in ZXY order (standard for device orientation)
  camera.rotation.order = 'ZXY'
  camera.rotation.x = pitch - Math.PI / 2  // shift so vertical phone = horizon
  camera.rotation.y = az
  camera.rotation.z = roll
}
```

### Fallback for Desktop

Desktop browsers don't support DeviceOrientation. Use mouse drag / OrbitControls for manual sky rotation. The AR "point at sky" button only appears on mobile.

---

## 7. Existing Implementations (Reference)

### Stellarium Web Engine
- [stellarium-web-engine](https://github.com/Stellarium/stellarium-web-engine)
- C compiled to WASM via Emscripten
- Uses Gaia star catalog (1.7 billion stars), Hipparcos for bright stars
- **License: GPL** — cannot use code directly
- **Takeaway:** Our scope (9K stars, 88 constellations, 8 planets) is 0.0005% of Stellarium's data. A lightweight Three.js implementation is entirely feasible.

### UXVirtual/night-sky (Three.js)
- Basic Three.js star renderer, ~1K stars
- Uses `Points` geometry with magnitude-based sizing
- Good reference for the rendering approach but too limited in data

### Star Atlas / sbcode.net
- 60K stars rendered as Three.js Points
- Custom shaders for star glow and color
- Constellation lines as `LineSegments`

### d3-celestial
- Canvas-based (no Three.js), uses GeoJSON star/constellation data
- Best data source — can use their JSON files directly
- Supports stars up to magnitude 14 (we only need mag 6.5)

---

## 8. Implementation Architecture

### Phase 1: Static Night Sky (replace GalaxyScene)

```
NightSkyScene/
├── NightSkyScene.js      # Main scene setup + camera
├── starData.js            # Parsed BSC5 catalog (9,110 stars)
├── constellationData.js   # Parsed d3-celestial lines
├── StarField.js           # THREE.Points with ShaderMaterial
├── ConstellationLines.js  # THREE.LineSegments
└── MilkyWay.js            # Equirectangular skybox sphere
```

**Camera:** Inside the celestial sphere, looking outward. `PerspectiveCamera` with ~60° FOV. OrbitControls with `enableZoom: false` (no zooming in the sky), `enablePan: false`, only rotation.

**Rendering order:**
1. Milky Way skybox (largest sphere, `renderOrder: 0`)
2. Stars (`renderOrder: 1`, `depthWrite: false`)
3. Constellation lines (`renderOrder: 2`, `depthWrite: false`)
4. Planet markers (`renderOrder: 3`)
5. UI overlays (HTML/DOM)

### Phase 2: Live Positions

- Use `astronomy-engine` to compute planet RA/Dec every 60 seconds
- Place planet markers (distinct from stars — larger, non-twinkling, named)
- Moon with phase visualization
- Sun position (below horizon indicator, twilight glow)
- Rotate the entire star sphere by Local Sidereal Time to show the correct sky for the user's location + time

### Phase 3: AR Mode

- "Point at Sky" button (mobile only, hidden on desktop)
- Request DeviceOrientation permission on tap
- Replace OrbitControls with device orientation-driven camera
- Semi-transparent background (camera passthrough via `<video>` element or just dark)
- Stars/constellations/planets overlaid at correct Alt/Az positions
- Tap on any object → info panel slides up

### Phase 4: Object Info Panels

- Tap a star → name, magnitude, distance, spectral class, constellation
- Tap a planet → name, distance, phase, rise/set times, visual magnitude
- Tap a constellation → name, mythology, brightest stars
- Tap the Moon → phase name, illumination %, next full moon

---

## 9. Data Budget

| Asset | Size | Notes |
|-------|------|-------|
| BSC5 star catalog (JSON) | ~800KB | Can trim to essential fields → ~200KB |
| Constellation lines (GeoJSON) | ~50KB | 88 constellations |
| Constellation names | ~5KB | |
| Milky Way panorama (JPEG) | ~200KB | 2048×1024 |
| astronomy-engine (minified) | ~116KB | Planet positions |
| **Total** | **~570KB** | Loaded only when entering sky view |

All assets lazy-loaded on scale transition to `'galaxy'`. No impact on initial earth-view load.

---

## 10. Key Decisions

| Decision | Rationale |
|----------|-----------|
| Yale BSC5 over Hipparcos/Gaia | 9,110 stars is exactly the naked-eye set. Hipparcos (118K) and Gaia (1.7B) are overkill for a planetarium view. BSC5 is <1MB. |
| `astronomy-engine` over `astronomia` / `ephem.js` | Smallest bundle (116KB), cleanest API, active maintenance, built-in coordinate transforms. No external data files needed. |
| d3-celestial GeoJSON over hand-drawn lines | Battle-tested data, 88 constellations, GeoJSON is trivial to parse. Already mapped to RA/Dec. |
| ESO Milky Way over procedural | 200KB JPEG looks dramatically better than procedural point clouds. CC-BY 4.0 license is permissive. |
| Three.js `Points` over instanced quads | 9,110 points in a single `Points` draw call is faster than instanced mesh. `sizeAttenuation: false` gives fixed screen-pixel sizes. ShaderMaterial handles magnitude→size and B-V→color per vertex. |
| Device Orientation over WebXR | WebXR requires an immersive session and is not universally supported. DeviceOrientation works in a normal browser tab on both iOS and Android. Simpler, broader reach. |
| Lazy-load on scale change | All sky assets loaded only when user transitions to galaxy/deep-space scale. Zero impact on initial page load and earth-view performance. |

---

## Sources

- [Yale Bright Star Catalog (JSON)](https://github.com/brettonw/YaleBrightStarCatalog)
- [d3-celestial — GeoJSON sky data](https://github.com/ofrohn/d3-celestial)
- [Astronomy Engine — JS ephemeris](https://github.com/cosinekitty/astronomy)
- [ESO Milky Way panorama (CC-BY 4.0)](https://www.eso.org/public/images/eso0932a/)
- [RA/Dec → Cartesian conversion](https://www.jameswatkins.me/posts/converting-equatorial-to-cartesian.html)
- [RA/Dec → Alt/Az conversion](https://astrogreg.com/convert_ra_dec_to_alt_az.html)
- [DeviceOrientationEvent — MDN](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent)
- [DeviceOrientationEvent — Apple](https://developer.apple.com/documentation/webkitjs/deviceorientationevent)
- [Stellarium Web Engine (reference only, GPL)](https://github.com/Stellarium/stellarium-web-engine)
- [dcf21/constellation-stick-figures](https://github.com/dcf21/constellation-stick-figures)
- [Ubilabs compass heading guide](https://ubilabs.com/en/insights/implement-geolocation-and-compass-heading)
