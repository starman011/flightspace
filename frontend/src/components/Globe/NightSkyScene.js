/**
 * NightSkyScene — First-Person Planetarium
 * ─────────────────────────────────────────────────────────────────────────────
 * View the night sky as if standing on Earth's surface looking up.
 * Camera at origin, celestial sphere around it, Earth horizon below.
 *
 *   • 8,400 real stars (BSC5) with glow shader + twinkle
 *   • 89 constellation stick figures
 *   • Live planet positions via astronomy-engine
 *   • Procedural Milky Way skybox
 *   • Earth horizon with atmosphere gradient
 */

import {
  Object3D, Points, BufferGeometry, Float32BufferAttribute,
  ShaderMaterial, AdditiveBlending,
  LineSegments, LineBasicMaterial,
  Mesh, SphereGeometry, PlaneGeometry, MeshBasicMaterial,
  BackSide, FrontSide, CanvasTexture, Color, Sprite, SpriteMaterial,
  TextureLoader, Vector3,
} from 'three'
import * as Astronomy from 'astronomy-engine'
import { BSC5_STARS } from './starData.js'
import { CONSTELLATIONS } from './constellationData.js'

// ── Scene geometry — small sphere, camera at center ──────────────────────────
const SKY_R = 480           // sky dome radius (WU)
const STAR_R = SKY_R * 0.95
const CONST_R = SKY_R * 0.93
const PLANET_R = SKY_R * 0.88
const LABEL_R = SKY_R * 0.85
const DEG = Math.PI / 180
const HR_TO_RAD = Math.PI / 12

// ── Coordinate conversion ────────────────────────────────────────────────────
function raDecToXYZ(raH, decDeg, r) {
  const ra = raH * HR_TO_RAD
  const dec = decDeg * DEG
  return [
    r * Math.cos(dec) * Math.cos(ra),
    r * Math.sin(dec),
    -r * Math.cos(dec) * Math.sin(ra),
  ]
}

function lonLatToXYZ(lonDeg, latDeg, r) {
  const ra = lonDeg * DEG
  const dec = latDeg * DEG
  return [
    r * Math.cos(dec) * Math.cos(ra),
    r * Math.sin(dec),
    -r * Math.cos(dec) * Math.sin(ra),
  ]
}

// ── B-V → RGB with boosted saturation ────────────────────────────────────────
function bvToColor(bv) {
  bv = Math.max(-0.4, Math.min(2.0, bv))
  let r, g, b
  if (bv < -0.1) {       // Hot blue O/B
    r = 0.62; g = 0.72; b = 1.0
  } else if (bv < 0.15) { // Blue-white A
    r = 0.82; g = 0.88; b = 1.0
  } else if (bv < 0.44) { // White F
    r = 0.98; g = 0.96; b = 1.0
  } else if (bv < 0.68) { // Yellow-white G (Sun-like)
    r = 1.0; g = 0.94; b = 0.76
  } else if (bv < 1.15) { // Orange K
    r = 1.0; g = 0.72; b = 0.42
  } else {                 // Red M
    r = 1.0; g = 0.48; b = 0.22
  }
  return [r, g, b]
}

// ── Seeded RNG ───────────────────────────────────────────────────────────────
function seededRng(seed) {
  let s = seed >>> 0
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000 }
}

// ── Milky Way skybox — high-contrast, detailed ──────────────────────────────
function buildMilkyWayTexture() {
  const W = 4096, H = 2048
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const ctx = cv.getContext('2d')

  // Deep black sky
  ctx.fillStyle = '#030508'
  ctx.fillRect(0, 0, W, H)

  // Galactic band — wide, luminous
  const band = ctx.createLinearGradient(0, 0, 0, H)
  band.addColorStop(0,    'rgba(3,4,8,0)')
  band.addColorStop(0.25, 'rgba(6,7,14,0)')
  band.addColorStop(0.34, 'rgba(14,12,30,0.18)')
  band.addColorStop(0.40, 'rgba(28,22,55,0.40)')
  band.addColorStop(0.45, 'rgba(42,34,78,0.62)')
  band.addColorStop(0.48, 'rgba(55,44,95,0.78)')
  band.addColorStop(0.50, 'rgba(65,52,108,0.88)')
  band.addColorStop(0.52, 'rgba(55,44,95,0.78)')
  band.addColorStop(0.55, 'rgba(42,34,78,0.62)')
  band.addColorStop(0.60, 'rgba(28,22,55,0.40)')
  band.addColorStop(0.66, 'rgba(14,12,30,0.18)')
  band.addColorStop(0.75, 'rgba(6,7,14,0)')
  band.addColorStop(1,    'rgba(3,4,8,0)')
  ctx.fillStyle = band
  ctx.fillRect(0, 0, W, H)

  // Galactic centre — bright core
  const gc = ctx.createRadialGradient(W * 0.50, H * 0.50, 0, W * 0.50, H * 0.50, W * 0.22)
  gc.addColorStop(0,   'rgba(85,65,130,0.60)')
  gc.addColorStop(0.3, 'rgba(55,42,90,0.40)')
  gc.addColorStop(0.6, 'rgba(30,22,55,0.20)')
  gc.addColorStop(1,   'rgba(0,0,0,0)')
  ctx.fillStyle = gc
  ctx.fillRect(0, 0, W, H)

  // Secondary galactic structure — asymmetric brightness
  const gc2 = ctx.createRadialGradient(W * 0.42, H * 0.48, 0, W * 0.42, H * 0.48, W * 0.18)
  gc2.addColorStop(0, 'rgba(50,38,80,0.35)')
  gc2.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gc2
  ctx.fillRect(0, 0, W, H)

  // Dark nebulae (absorption lanes)
  const darkLanes = [
    { x: 0.48, y: 0.49, r: 0.04, a: 0.30 },
    { x: 0.53, y: 0.50, r: 0.03, a: 0.25 },
    { x: 0.45, y: 0.52, r: 0.025, a: 0.20 },
  ]
  for (const dl of darkLanes) {
    const g = ctx.createRadialGradient(dl.x * W, dl.y * H, 0, dl.x * W, dl.y * H, dl.r * W)
    g.addColorStop(0, `rgba(2,3,5,${dl.a})`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }

  // Emission nebulae (color patches)
  const nebulae = [
    { x: 0.20, y: 0.47, r: 0.04, col: 'rgba(120,30,60,0.22)' },
    { x: 0.35, y: 0.52, r: 0.06, col: 'rgba(35,55,130,0.18)' },
    { x: 0.58, y: 0.49, r: 0.035, col: 'rgba(100,25,55,0.20)' },
    { x: 0.72, y: 0.51, r: 0.05, col: 'rgba(30,50,120,0.16)' },
    { x: 0.85, y: 0.48, r: 0.03, col: 'rgba(110,30,65,0.18)' },
    { x: 0.15, y: 0.50, r: 0.04, col: 'rgba(40,60,100,0.14)' },
  ]
  for (const n of nebulae) {
    const g = ctx.createRadialGradient(n.x * W, n.y * H, 0, n.x * W, n.y * H, n.r * W)
    g.addColorStop(0, n.col)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }

  // Dense star field in galactic plane
  const img = ctx.getImageData(0, 0, W, H)
  const data = img.data
  const rng = seededRng(0xdeadbeef)
  for (let i = 0; i < 40000; i++) {
    const sx = Math.floor(rng() * W)
    const sy = Math.floor(rng() * H)
    const dy = Math.abs(sy / H - 0.5)
    if (rng() > 0.22 + dy * 0.75) continue
    const bright = 50 + Math.floor(rng() * 180)
    const t = rng()
    const r = t < 0.3 ? Math.min(255, bright + 25) : bright
    const g = bright
    const b = t < 0.6 ? Math.min(255, bright + 35) : Math.max(50, bright - 45)
    const a = Math.floor((0.25 + rng() * 0.65) * 255)
    const idx = (sy * W + sx) * 4
    // Additive blending manually
    data[idx] = Math.min(255, data[idx] + r)
    data[idx + 1] = Math.min(255, data[idx + 1] + g)
    data[idx + 2] = Math.min(255, data[idx + 2] + b)
    data[idx + 3] = Math.min(255, data[idx + 3] + a)
  }
  ctx.putImageData(img, 0, 0)

  return new CanvasTexture(cv)
}

// ── Earth horizon texture ────────────────────────────────────────────────────
function buildHorizonTexture() {
  const W = 512, H = 256
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const ctx = cv.getContext('2d')

  // Earth surface — very dark
  ctx.fillStyle = '#050808'
  ctx.fillRect(0, 0, W, H)

  // Atmosphere glow at top edge (horizon line)
  const atm = ctx.createLinearGradient(0, 0, 0, H)
  atm.addColorStop(0, 'rgba(20,40,80,0.45)')     // blue atmospheric glow
  atm.addColorStop(0.02, 'rgba(15,30,60,0.35)')
  atm.addColorStop(0.06, 'rgba(10,18,35,0.18)')
  atm.addColorStop(0.15, 'rgba(5,10,18,0.06)')
  atm.addColorStop(0.3, 'rgba(3,5,8,0)')
  atm.addColorStop(1, 'rgba(3,5,8,0)')
  ctx.fillStyle = atm
  ctx.fillRect(0, 0, W, H)

  // Subtle city glow blobs on horizon
  const glows = [
    { x: 0.15, w: 0.08, a: 0.12, col: '255,200,120' },
    { x: 0.45, w: 0.12, a: 0.08, col: '255,210,140' },
    { x: 0.75, w: 0.06, a: 0.10, col: '255,180,100' },
  ]
  for (const gl of glows) {
    const g = ctx.createRadialGradient(gl.x * W, 0, 0, gl.x * W, 0, gl.w * W)
    g.addColorStop(0, `rgba(${gl.col},${gl.a})`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }

  return new CanvasTexture(cv)
}

// ── Star shader — bright glow, twinkle, proper sizing ────────────────────────
const starVertexShader = `
  attribute float aMag;
  attribute vec3 aColor;
  attribute float aSeed;
  uniform float uTime;
  varying vec3 vColor;
  varying float vBright;

  void main() {
    vColor = aColor;

    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);

    // Size: brighter = much larger. Sirius (mag -1.5) → 18px, mag 6.5 → 1.5px
    float baseSz = clamp(12.0 - aMag * 1.5, 1.5, 18.0);

    // Twinkle: subtle pulsing based on seed + time
    float twinkle = 1.0 + 0.15 * sin(uTime * (2.0 + aSeed * 3.0) + aSeed * 100.0);
    gl_PointSize = baseSz * twinkle;

    // Brightness: bright stars are much more luminous
    vBright = clamp(1.5 - aMag * 0.15, 0.3, 1.5) * twinkle;

    gl_Position = projectionMatrix * mvPos;
  }
`

const starFragmentShader = `
  varying vec3 vColor;
  varying float vBright;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;

    // Bright core + soft halo
    float core = 1.0 - smoothstep(0.0, 0.12, d);
    float halo = 1.0 - smoothstep(0.0, 0.5, d);
    float glow = core * 0.7 + halo * 0.3;

    // White-hot core blends into star color in halo
    vec3 coreColor = mix(vec3(1.0), vColor, smoothstep(0.0, 0.3, d));

    gl_FragColor = vec4(coreColor * vBright * glow, glow * vBright);
  }
`

// ── Planet definitions ───────────────────────────────────────────────────────
const PLANETS = [
  { key: 'Sun',     name: 'Sun',     color: 0xfff4c2, size: 18 },
  { key: 'Moon',    name: 'Moon',    color: 0xddddcc, size: 16 },
  { key: 'Mercury', name: 'Mercury', color: 0x8c8c8c, size: 7 },
  { key: 'Venus',   name: 'Venus',   color: 0xffe8b0, size: 10 },
  { key: 'Mars',    name: 'Mars',    color: 0xff6633, size: 8 },
  { key: 'Jupiter', name: 'Jupiter', color: 0xd4a868, size: 10 },
  { key: 'Saturn',  name: 'Saturn',  color: 0xe8d090, size: 9 },
]

// ── Factory ──────────────────────────────────────────────────────────────────
export function createNightSkyScene(scene) {
  const skyGroup = new Object3D()
  skyGroup.visible = false
  scene.add(skyGroup)

  let _startTime = Date.now()

  // ── Milky Way sky dome ─────────────────────────────────────────────────────
  // Start with procedural texture, then upgrade to real Mellinger survey image
  const skyMat = new MeshBasicMaterial({ map: buildMilkyWayTexture(), side: BackSide, depthWrite: false })
  const skyMesh = new Mesh(new SphereGeometry(SKY_R, 96, 48), skyMat)
  skyMesh.rotation.y = Math.PI / 2   // align RA=0 with +X axis
  skyMesh.renderOrder = -1
  skyGroup.add(skyMesh)

  // Lazy-load real all-sky photograph with fallback chain:
  // 1. CDS hips2fits (4096x2048 equirectangular) — best quality but service can be down
  // 2. DSS HiPS Allsky tile (Norder3) — always available, lower res
  const MELLINGER_URL = 'https://alasky.cds.unistra.fr/hips-image-services/hips2fits'
    + '?hips=CDS/P/Mellinger/color&width=8192&height=4096'
    + '&ra=180&dec=0&fov=360&projection=CAR&coordsys=icrs&format=jpg'
  const DSS_ALLSKY_URL = 'https://alasky.cds.unistra.fr/hips-image-services/hips2fits'
    + '?hips=CDS/P/DSS2/color&width=4096&height=2048'
    + '&ra=180&dec=0&fov=360&projection=CAR&coordsys=icrs&format=jpg'

  // Direct load — no HEAD check (avoids CORS/timeout failures that silently
  // leave the low-quality procedural texture). Mellinger first, DSS fallback.
  const skyLoader = new TextureLoader()
  const applySky = (tex) => {
    tex.colorSpace = 'srgb'
    tex.anisotropy = 8          // crisp at grazing angles (kills the blur)
    tex.generateMipmaps = true
    skyMat.map.dispose()
    skyMat.map = tex
    skyMat.needsUpdate = true
  }
  skyLoader.load(MELLINGER_URL, applySky, undefined, () => {
    skyLoader.load(DSS_ALLSKY_URL, applySky)
  })

  // ── DESI survey boundary — approximate DR1 footprint in red ─────────────────
  const BOUNDARY_R = SKY_R * 0.97
  const DESI_REGIONS = [
    // Northern Galactic Cap
    [[120,-5],[130,-8],[150,-10],[170,-10],[190,-10],[210,-10],
     [230,-8],[250,-5],[260,0],[268,5],[272,12],[275,25],[275,40],
     [273,55],[268,65],[260,72],[248,77],[230,80],[210,82],[190,82],
     [170,80],[155,77],[142,72],[133,65],[128,55],[125,40],[123,25],
     [121,12],[120,-5]],
    // Southern Galactic Cap
    [[320,-5],[330,-10],[340,-15],[350,-18],[0,-20],[10,-20],
     [20,-18],[30,-15],[40,-10],[50,-5],[55,0],[58,10],[58,20],
     [55,28],[48,32],[35,34],[20,35],[5,35],[350,34],[335,32],
     [325,28],[322,20],[321,10],[320,-5]],
  ]
  const bVerts = []
  for (const region of DESI_REGIONS) {
    for (let i = 0; i < region.length - 1; i++) {
      const [ra1, dec1] = region[i]
      const [ra2, dec2] = region[i + 1]
      const [x1, y1, z1] = lonLatToXYZ(ra1, dec1, BOUNDARY_R)
      const [x2, y2, z2] = lonLatToXYZ(ra2, dec2, BOUNDARY_R)
      bVerts.push(x1, y1, z1, x2, y2, z2)
    }
  }
  const boundaryGeo = new BufferGeometry()
  boundaryGeo.setAttribute('position', new Float32BufferAttribute(new Float32Array(bVerts), 3))
  const boundaryLines = new LineSegments(boundaryGeo, new LineBasicMaterial({
    color: 0xff3333, transparent: true, opacity: 0.55, depthWrite: false,
  }))
  boundaryLines.renderOrder = 6
  skyGroup.add(boundaryLines)

  // ── Earth horizon hemisphere (below camera) ────────────────────────────────
  // A half-sphere representing the ground, with atmosphere glow at the rim
  const horizonGeo = new SphereGeometry(SKY_R * 0.99, 64, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)
  const horizonMat = new MeshBasicMaterial({
    map: buildHorizonTexture(),
    side: FrontSide,
  })
  const horizonMesh = new Mesh(horizonGeo, horizonMat)
  horizonMesh.renderOrder = 0
  skyGroup.add(horizonMesh)

  // ── Stars from BSC5 ────────────────────────────────────────────────────────
  const N = BSC5_STARS.length
  const starPos = new Float32Array(N * 3)
  const starCol = new Float32Array(N * 3)
  const starMag = new Float32Array(N)
  const starSeed = new Float32Array(N)
  const rng = seededRng(42)

  for (let i = 0; i < N; i++) {
    const [raH, decDeg, vmag, bv] = BSC5_STARS[i]
    const [x, y, z] = raDecToXYZ(raH, decDeg, STAR_R)
    starPos[i * 3] = x; starPos[i * 3 + 1] = y; starPos[i * 3 + 2] = z
    starMag[i] = vmag
    starSeed[i] = rng()
    const [r, g, b] = bvToColor(bv)
    starCol[i * 3] = r; starCol[i * 3 + 1] = g; starCol[i * 3 + 2] = b
  }

  const starGeo = new BufferGeometry()
  starGeo.setAttribute('position', new Float32BufferAttribute(starPos, 3))
  starGeo.setAttribute('aColor', new Float32BufferAttribute(starCol, 3))
  starGeo.setAttribute('aMag', new Float32BufferAttribute(starMag, 1))
  starGeo.setAttribute('aSeed', new Float32BufferAttribute(starSeed, 1))

  const starMaterial = new ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: starVertexShader,
    fragmentShader: starFragmentShader,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  })

  const starPoints = new Points(starGeo, starMaterial)
  starPoints.renderOrder = 2
  skyGroup.add(starPoints)

  // ── Constellation lines ────────────────────────────────────────────────────
  const lineVerts = []
  const constMeta = []

  for (const c of CONSTELLATIONS) {
    let sumX = 0, sumY = 0, sumZ = 0, count = 0
    for (const line of c.lines) {
      for (let i = 0; i < line.length - 1; i++) {
        const [lon1, lat1] = line[i]
        const [lon2, lat2] = line[i + 1]
        const [x1, y1, z1] = lonLatToXYZ(lon1, lat1, CONST_R)
        const [x2, y2, z2] = lonLatToXYZ(lon2, lat2, CONST_R)
        lineVerts.push(x1, y1, z1, x2, y2, z2)
        sumX += x1 + x2; sumY += y1 + y2; sumZ += z1 + z2
        count += 2
      }
    }
    if (count > 0) {
      constMeta.push({
        id: c.id, name: c.name, rank: c.rank,
        cx: sumX / count, cy: sumY / count, cz: sumZ / count,
      })
    }
  }

  const constGeo = new BufferGeometry()
  constGeo.setAttribute('position', new Float32BufferAttribute(new Float32Array(lineVerts), 3))

  const constLines = new LineSegments(constGeo, new LineBasicMaterial({
    color: 0x3a5580, transparent: true, opacity: 0.35, depthWrite: false,
  }))
  constLines.renderOrder = 1
  skyGroup.add(constLines)

  // ── Constellation name labels ──────────────────────────────────────────────
  const constLabels = []
  for (const cm of constMeta) {
    if (cm.rank > 2) continue
    const label = makeTextSprite(cm.name, {
      fontSize: 48, color: 'rgba(100,140,200,0.50)',
    })
    const len = Math.sqrt(cm.cx * cm.cx + cm.cy * cm.cy + cm.cz * cm.cz)
    const scale = LABEL_R / (len || 1)
    label.position.set(cm.cx * scale, cm.cy * scale, cm.cz * scale)
    const sz = 50
    label.scale.set(sz, sz * 0.5, 1)
    label.renderOrder = 3
    skyGroup.add(label)
    constLabels.push(label)
  }

  // ── Planet markers ─────────────────────────────────────────────────────────
  const planetMarkers = []

  for (const p of PLANETS) {
    const dotGeo = new BufferGeometry()
    dotGeo.setAttribute('position', new Float32BufferAttribute(new Float32Array([0, 0, 0]), 3))
    const dotMat = new ShaderMaterial({
      uniforms: { uColor: { value: new Color(p.color) }, uSize: { value: p.size } },
      vertexShader: `
        uniform float uSize;
        void main() {
          gl_PointSize = uSize;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float core = 1.0 - smoothstep(0.0, 0.15, d);
          float halo = 1.0 - smoothstep(0.0, 0.5, d);
          float glow = core * 0.7 + halo * 0.3;
          vec3 col = mix(vec3(1.0), uColor, smoothstep(0.0, 0.3, d));
          gl_FragColor = vec4(col * glow, glow);
        }
      `,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    })
    const dot = new Points(dotGeo, dotMat)
    dot.renderOrder = 4
    skyGroup.add(dot)

    const label = makeTextSprite(p.name, {
      fontSize: 40, color: '#' + new Color(p.color).getHexString(),
    })
    const sz = 35
    label.scale.set(sz, sz * 0.4, 1)
    label.renderOrder = 5
    skyGroup.add(label)

    planetMarkers.push({ key: p.key, dot, label })
  }

  // ── Planet position updates ────────────────────────────────────────────────
  let _lastPlanetUpdate = 0

  function updatePlanets() {
    const now = Date.now()
    if (now - _lastPlanetUpdate < 30000 && _lastPlanetUpdate > 0) return
    _lastPlanetUpdate = now

    const time = Astronomy.MakeTime(new Date())
    const observer = new Astronomy.Observer(0, 0, 0)

    for (const pm of planetMarkers) {
      try {
        const eq = Astronomy.Equator(pm.key, time, observer, true, true)
        const [x, y, z] = raDecToXYZ(eq.ra, eq.dec, PLANET_R)
        pm.dot.position.set(x, y, z)
        // Label slightly above
        const len = Math.sqrt(x * x + y * y + z * z)
        const off = 12
        pm.label.position.set(x + x / len * off, y + y / len * off + 8, z + z / len * off)
      } catch (_) {
        pm.dot.visible = false
        pm.label.visible = false
      }
    }
  }

  // ── Star name lookup for picking ───────────────────────────────────────────
  const STAR_NAMES = {}
  const COMMON_NAMES = {
    2491: 'Sirius', 2326: 'Canopus', 5340: 'Arcturus', 5459: 'Alpha Centauri',
    7001: 'Vega', 1708: 'Capella', 1713: 'Rigel', 2943: 'Procyon',
    472: 'Achernar', 2061: 'Betelgeuse', 7557: 'Altair', 1457: 'Aldebaran',
    6134: 'Antares', 5056: 'Spica', 2990: 'Pollux', 4730: 'Deneb',
    7121: 'Fomalhaut', 4853: 'Mimosa', 4731: 'Acrux', 8728: 'Regulus',
    3982: 'Adhara', 5191: 'Shaula', 6527: 'Bellatrix', 264: 'Elnath',
    4763: 'Miaplacidus', 2827: 'Alnilam', 6556: 'Alnitak', 1790: 'Alnair',
    5793: 'Alioth', 5054: 'Dubhe', 4905: 'Wezen', 15: 'Alpheratz',
    337: 'Mirach', 617: 'Algol', 1017: 'Hamal', 4295: 'Rasalhague',
    6378: 'Kaus Australis', 8308: 'Peacock', 8425: 'Deneb Kaitos',
    21: 'Schedar', 168: 'Caph', 403: 'Mirfak', 5563: 'Menkent',
  }
  for (let i = 0; i < N; i++) {
    const [raH, decDeg, vmag, bv, hr, name] = BSC5_STARS[i]
    if (hr > 0 && (COMMON_NAMES[hr] || vmag < 3.0)) {
      STAR_NAMES[hr] = {
        name: COMMON_NAMES[hr] || name || `HR ${hr}`,
        ra: raH, dec: decDeg, vmag, bv, index: i,
      }
    }
  }

  // ── API ────────────────────────────────────────────────────────────────────
  function show() {
    skyGroup.visible = true
    boundaryLines.visible = false   // boundaries only in deep-space mode
    _startTime = Date.now()
    try { updatePlanets() } catch (e) { console.warn('NightSky: planet update failed', e) }
  }

  function showSkyOnly() {
    // Show only the sky dome (background image) + stars + DESI boundaries —
    // no horizon, constellations, or planets. Used in galaxy/DESI mode.
    skyGroup.visible = true
    skyMesh.visible = true
    starPoints.visible = true
    boundaryLines.visible = true
    horizonMesh.visible = false
    constLines.visible = false
    skyGroup.children.forEach(c => {
      if (c instanceof Sprite) c.visible = false
    })
  }

  function showCameraAR() {
    // Camera-passthrough AR: no opaque dome — the live camera shows through the
    // transparent canvas. Only draw the discrete overlay "hints": bright stars,
    // constellation stick-figures + names, and planet/Moon markers.
    skyGroup.visible = true
    skyMesh.visible = false      // hide the Mellinger background sphere
    horizonMesh.visible = false
    boundaryLines.visible = false
    starPoints.visible = true
    constLines.visible = true
    skyGroup.children.forEach(c => { if (c instanceof Sprite) c.visible = true })
    _startTime = _startTime || Date.now()
    try { updatePlanets() } catch (e) { console.warn('NightSky: planet update failed', e) }
  }

  function hide() { skyGroup.visible = false }

  function update() {
    if (!skyGroup.visible) return
    // Animate star twinkle
    starMaterial.uniforms.uTime.value = (Date.now() - _startTime) * 0.001
    try { updatePlanets() } catch (e) { console.warn('NightSky: planet update failed', e) }
  }

  function dispose() {
    skyGroup.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose()
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose()
        if (obj.material.uniforms) {
          for (const u of Object.values(obj.material.uniforms)) {
            if (u.value && u.value.dispose) u.value.dispose()
          }
        }
        obj.material.dispose()
      }
    })
    scene.remove(skyGroup)
  }

  // Live world-space directions + names of nameable sky objects (all 89
  // constellations + any planet/Moon currently above the horizon). Used by the
  // "looking at" reticle. Honors the real-sky alignment (skyGroup.quaternion).
  const _stWorld = new Vector3()
  function getSkyTargets() {
    const out = []
    for (const cm of constMeta) {
      const len = Math.sqrt(cm.cx * cm.cx + cm.cy * cm.cy + cm.cz * cm.cz)
      if (!len) continue
      _stWorld.set(cm.cx / len, cm.cy / len, cm.cz / len)
        .multiplyScalar(LABEL_R).applyQuaternion(skyGroup.quaternion)
      out.push({ name: cm.name, x: _stWorld.x, y: _stWorld.y, z: _stWorld.z })
    }
    for (const pm of planetMarkers) {
      if (!pm.label.visible) continue   // only objects currently up
      pm.dot.getWorldPosition(_stWorld)
      out.push({ name: pm.key, x: _stWorld.x, y: _stWorld.y, z: _stWorld.z })
    }
    return out
  }

  return {
    skyGroup,
    starData: STAR_NAMES,
    constellationData: constMeta,
    planetMarkers,
    show, showSkyOnly, showCameraAR, hide, update, dispose, getSkyTargets,
  }
}

// ── Text sprite helper ───────────────────────────────────────────────────────
function makeTextSprite(text, { fontSize = 32, color = '#ffffff' } = {}) {
  const cv = document.createElement('canvas')
  const ctx = cv.getContext('2d')
  const font = `${fontSize}px "SF Mono", "Fira Code", monospace`
  ctx.font = font
  const metrics = ctx.measureText(text)
  const w = Math.ceil(metrics.width) + 20
  const h = fontSize + 20
  cv.width = w; cv.height = h
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.fillText(text, w / 2, h / 2)

  const tex = new CanvasTexture(cv)
  const mat = new SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, sizeAttenuation: true,
  })
  return new Sprite(mat)
}
