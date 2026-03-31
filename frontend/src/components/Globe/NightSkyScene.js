/**
 * NightSkyScene
 * ─────────────────────────────────────────────────────────────────────────────
 * Stellarium-style night sky renderer using real astronomical data.
 * Replaces the procedural GalaxyScene with:
 *   • 8,400 real stars from Yale Bright Star Catalog (BSC5, J2000)
 *   • 89 constellation stick figures from d3-celestial
 *   • Live planet positions from astronomy-engine
 *   • Canvas-generated Milky Way skybox
 *
 * Visible when cameraScale === 'galaxy'.
 */

import {
  Object3D, Points, BufferGeometry, Float32BufferAttribute,
  ShaderMaterial, AdditiveBlending,
  LineSegments, LineBasicMaterial,
  Mesh, SphereGeometry, MeshBasicMaterial,
  BackSide, CanvasTexture, Color, Sprite, SpriteMaterial,
} from 'three'
import * as Astronomy from 'astronomy-engine'
import { AU_TO_WU } from './solarSystem.js'
import { BSC5_STARS } from './starData.js'
import { CONSTELLATIONS } from './constellationData.js'

// ── Constants ────────────────────────────────────────────────────────────────
const SKY_RADIUS = AU_TO_WU * 5500     // celestial sphere radius (WU)
const STAR_RADIUS = SKY_RADIUS * 0.98  // stars slightly inside skybox
const CONST_RADIUS = SKY_RADIUS * 0.97 // constellation lines inside stars
const PLANET_DIST = AU_TO_WU * 800     // visual distance for planets on sky sphere
const DEG = Math.PI / 180
const HR_TO_RAD = Math.PI / 12         // 1 hour RA = 15° = π/12 rad

// ── Coordinate conversion ────────────────────────────────────────────────────
// RA (hours) + Dec (degrees) → Three.js XYZ on a sphere of given radius
function raDecToXYZ(raH, decDeg, r) {
  const ra = raH * HR_TO_RAD
  const dec = decDeg * DEG
  return [
    r * Math.cos(dec) * Math.cos(ra),
    r * Math.sin(dec),
    -r * Math.cos(dec) * Math.sin(ra),
  ]
}

// d3-celestial lon/lat (degrees) → Three.js XYZ
// d3-celestial: lon = RA in degrees (positive eastward), lat = Dec in degrees
function lonLatToXYZ(lonDeg, latDeg, r) {
  const ra = lonDeg * DEG
  const dec = latDeg * DEG
  return [
    r * Math.cos(dec) * Math.cos(ra),
    r * Math.sin(dec),
    -r * Math.cos(dec) * Math.sin(ra),
  ]
}

// ── B-V color index → RGB ────────────────────────────────────────────────────
// Attempt: realistic stellar color from B-V photometric index
function bvToColor(bv) {
  // Clamp to valid range
  bv = Math.max(-0.4, Math.min(2.0, bv))
  let r, g, b
  // Hot blue stars (O/B)
  if (bv < 0) {
    r = 0.61 + bv * 0.11
    g = 0.70 + bv * 0.07
    b = 1.0
  // White/blue-white (A/F)
  } else if (bv < 0.4) {
    r = 0.83 + bv * 0.42
    g = 0.87 + bv * 0.20
    b = 1.0
  // Yellow-white to yellow (G)
  } else if (bv < 0.8) {
    r = 1.0
    g = 0.96 - (bv - 0.4) * 0.30
    b = 1.0 - (bv - 0.4) * 0.60
  // Orange (K)
  } else if (bv < 1.4) {
    r = 1.0
    g = 0.84 - (bv - 0.8) * 0.50
    b = 0.76 - (bv - 0.8) * 0.60
  // Red (M)
  } else {
    r = 1.0
    g = Math.max(0.20, 0.54 - (bv - 1.4) * 0.50)
    b = Math.max(0.10, 0.40 - (bv - 1.4) * 0.40)
  }
  return [r, g, b]
}

// ── Seeded RNG for Milky Way texture ─────────────────────────────────────────
function seededRng(seed) {
  let s = seed >>> 0
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000 }
}

// ── Milky Way skybox texture ─────────────────────────────────────────────────
function buildMilkyWayTexture() {
  const W = 2048, H = 1024
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const ctx = cv.getContext('2d')

  // Deep space base
  ctx.fillStyle = '#020408'
  ctx.fillRect(0, 0, W, H)

  // Galactic band — vertical gradient centred at equator
  const band = ctx.createLinearGradient(0, 0, 0, H)
  band.addColorStop(0,    'rgba(3,4,10,0)')
  band.addColorStop(0.20, 'rgba(5,6,18,0)')
  band.addColorStop(0.30, 'rgba(12,10,35,0.20)')
  band.addColorStop(0.40, 'rgba(22,18,58,0.45)')
  band.addColorStop(0.48, 'rgba(35,30,80,0.70)')
  band.addColorStop(0.50, 'rgba(42,36,95,0.80)')
  band.addColorStop(0.52, 'rgba(35,30,80,0.70)')
  band.addColorStop(0.60, 'rgba(22,18,58,0.45)')
  band.addColorStop(0.70, 'rgba(12,10,35,0.20)')
  band.addColorStop(0.80, 'rgba(5,6,18,0)')
  band.addColorStop(1,    'rgba(3,4,10,0)')
  ctx.fillStyle = band
  ctx.fillRect(0, 0, W, H)

  // Galactic centre glow
  const gc = ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, W * 0.25)
  gc.addColorStop(0, 'rgba(60,45,100,0.50)')
  gc.addColorStop(0.5, 'rgba(30,22,60,0.25)')
  gc.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gc
  ctx.fillRect(0, 0, W, H)

  // Nebula blobs along the band
  const nebulae = [
    { x: 0.18, y: 0.47, r: 0.06, col: 'rgba(90,22,50,0.28)' },
    { x: 0.35, y: 0.52, r: 0.08, col: 'rgba(30,50,110,0.22)' },
    { x: 0.55, y: 0.49, r: 0.05, col: 'rgba(70,18,45,0.25)' },
    { x: 0.72, y: 0.51, r: 0.07, col: 'rgba(25,45,100,0.20)' },
    { x: 0.88, y: 0.48, r: 0.04, col: 'rgba(80,25,55,0.22)' },
  ]
  for (const n of nebulae) {
    const g = ctx.createRadialGradient(n.x * W, n.y * H, 0, n.x * W, n.y * H, n.r * W)
    g.addColorStop(0, n.col)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }

  // Scatter dim stars into pixel buffer for galactic plane density
  const img = ctx.getImageData(0, 0, W, H)
  const data = img.data
  const rng = seededRng(0xdeadbeef)
  for (let i = 0; i < 15000; i++) {
    const sx = Math.floor(rng() * W)
    const sy = Math.floor(rng() * H)
    const dy = Math.abs(sy / H - 0.5)
    if (rng() > 0.25 + dy * 0.70) continue
    const bright = 60 + Math.floor(rng() * 140)
    const t = rng()
    const r = t < 0.3 ? Math.min(255, bright + 20) : bright
    const g = bright
    const b = t < 0.6 ? Math.min(255, bright + 30) : Math.max(60, bright - 40)
    const a = Math.floor((0.3 + rng() * 0.5) * 255)
    const idx = (sy * W + sx) * 4
    data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = a
  }
  ctx.putImageData(img, 0, 0)

  return new CanvasTexture(cv)
}

// ── Star shader — magnitude→size, B-V→color per vertex ──────────────────────
const starVertexShader = `
  attribute float aMag;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vMag;
  void main() {
    vColor = aColor;
    vMag = aMag;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    // Size: brighter stars are larger. mag -1.5 → 7px, mag 6.5 → 1px
    float size = clamp(8.0 - aMag, 1.0, 9.0);
    gl_PointSize = size;
    gl_Position = projectionMatrix * mvPos;
  }
`

const starFragmentShader = `
  varying vec3 vColor;
  varying float vMag;
  void main() {
    // Soft circular point with glow falloff
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float alpha = 1.0 - smoothstep(0.0, 0.5, d);
    // Bright stars get a stronger core
    float brightness = clamp(1.2 - vMag * 0.1, 0.4, 1.0);
    gl_FragColor = vec4(vColor * brightness, alpha * brightness);
  }
`

// ── Planet definitions ───────────────────────────────────────────────────────
const PLANETS = [
  { key: 'Sun',     name: 'Sun',     color: 0xfff4c2, size: 12 },
  { key: 'Moon',    name: 'Moon',    color: 0xddddcc, size: 10 },
  { key: 'Mercury', name: 'Mercury', color: 0x8c8c8c, size: 5 },
  { key: 'Venus',   name: 'Venus',   color: 0xffe8b0, size: 7 },
  { key: 'Mars',    name: 'Mars',    color: 0xff6633, size: 6 },
  { key: 'Jupiter', name: 'Jupiter', color: 0xd4a868, size: 8 },
  { key: 'Saturn',  name: 'Saturn',  color: 0xe8d090, size: 7 },
]

// ── Factory ──────────────────────────────────────────────────────────────────

export function createNightSkyScene(scene) {
  const skyGroup = new Object3D()
  skyGroup.visible = false
  scene.add(skyGroup)

  // ── Milky Way sky sphere ───────────────────────────────────────────────────
  const skyMesh = new Mesh(
    new SphereGeometry(SKY_RADIUS, 64, 32),
    new MeshBasicMaterial({ map: buildMilkyWayTexture(), side: BackSide }),
  )
  skyGroup.add(skyMesh)

  // ── Stars from BSC5 ────────────────────────────────────────────────────────
  const N = BSC5_STARS.length
  const starPos = new Float32Array(N * 3)
  const starCol = new Float32Array(N * 3)
  const starMag = new Float32Array(N)

  for (let i = 0; i < N; i++) {
    const [raH, decDeg, vmag, bv] = BSC5_STARS[i]
    const [x, y, z] = raDecToXYZ(raH, decDeg, STAR_RADIUS)
    starPos[i * 3] = x; starPos[i * 3 + 1] = y; starPos[i * 3 + 2] = z
    starMag[i] = vmag
    const [r, g, b] = bvToColor(bv)
    starCol[i * 3] = r; starCol[i * 3 + 1] = g; starCol[i * 3 + 2] = b
  }

  const starGeo = new BufferGeometry()
  starGeo.setAttribute('position', new Float32BufferAttribute(starPos, 3))
  starGeo.setAttribute('aColor', new Float32BufferAttribute(starCol, 3))
  starGeo.setAttribute('aMag', new Float32BufferAttribute(starMag, 1))

  const starMaterial = new ShaderMaterial({
    vertexShader: starVertexShader,
    fragmentShader: starFragmentShader,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  })

  const starPoints = new Points(starGeo, starMaterial)
  starPoints.renderOrder = 1
  skyGroup.add(starPoints)

  // ── Constellation lines ────────────────────────────────────────────────────
  // Build line segments: each pair of coordinates becomes two vertices
  const lineVerts = []
  const constMeta = [] // { id, name, centerRA, centerDec } for labels

  for (const c of CONSTELLATIONS) {
    let sumX = 0, sumY = 0, sumZ = 0, count = 0
    for (const line of c.lines) {
      for (let i = 0; i < line.length - 1; i++) {
        const [lon1, lat1] = line[i]
        const [lon2, lat2] = line[i + 1]
        const [x1, y1, z1] = lonLatToXYZ(lon1, lat1, CONST_RADIUS)
        const [x2, y2, z2] = lonLatToXYZ(lon2, lat2, CONST_RADIUS)
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
    color: 0x334466, transparent: true, opacity: 0.25, depthWrite: false,
  }))
  constLines.renderOrder = 2
  skyGroup.add(constLines)

  // ── Constellation name labels (Sprite text) ───────────────────────────────
  const constLabels = []
  for (const cm of constMeta) {
    if (cm.rank > 2) continue // only show rank 1 & 2 constellations
    const label = makeTextSprite(cm.name, {
      fontSize: 28, color: 'rgba(120,150,200,0.55)',
    })
    // Normalize center position to CONST_RADIUS distance
    const len = Math.sqrt(cm.cx * cm.cx + cm.cy * cm.cy + cm.cz * cm.cz)
    const scale = CONST_RADIUS * 0.96 / (len || 1)
    label.position.set(cm.cx * scale, cm.cy * scale, cm.cz * scale)
    const labelSize = AU_TO_WU * 120
    label.scale.set(labelSize, labelSize * 0.5, 1)
    label.renderOrder = 3
    skyGroup.add(label)
    constLabels.push(label)
  }

  // ── Planet markers ─────────────────────────────────────────────────────────
  const planetMarkers = []
  const planetLabels = []

  for (const p of PLANETS) {
    // Marker dot
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
          float alpha = 1.0 - smoothstep(0.15, 0.5, d);
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    })
    const dot = new Points(dotGeo, dotMat)
    dot.renderOrder = 4
    skyGroup.add(dot)

    // Name label
    const label = makeTextSprite(p.name, {
      fontSize: 32, color: '#' + new Color(p.color).getHexString(),
    })
    const labelSize = AU_TO_WU * 80
    label.scale.set(labelSize, labelSize * 0.5, 1)
    label.renderOrder = 5
    skyGroup.add(label)

    planetMarkers.push({ key: p.key, dot, label })
    planetLabels.push(label)
  }

  // ── Update planet positions ────────────────────────────────────────────────
  let _lastPlanetUpdate = 0

  function updatePlanets() {
    const now = Date.now()
    if (now - _lastPlanetUpdate < 30000 && _lastPlanetUpdate > 0) return
    _lastPlanetUpdate = now

    const time = new Astronomy.AstroTime(new Date())

    for (const pm of planetMarkers) {
      try {
        const eq = Astronomy.Equator(pm.key, time, null, true, true)
        const [x, y, z] = raDecToXYZ(eq.ra, eq.dec, PLANET_DIST)
        pm.dot.position.set(x, y, z)
        // Label offset slightly above the dot
        const offsetY = AU_TO_WU * 50
        pm.label.position.set(x, y + offsetY, z)
      } catch (_) {
        // Body not supported — hide
        pm.dot.visible = false
        pm.label.visible = false
      }
    }
  }

  // ── Star name data for picking ─────────────────────────────────────────────
  // Build lookup: HR number → { name, ra, dec, vmag, bv }
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
    updatePlanets()
  }

  function hide() { skyGroup.visible = false }

  function update() {
    if (!skyGroup.visible) return
    updatePlanets()
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

  return {
    skyGroup,
    starData: STAR_NAMES,
    constellationData: constMeta,
    planetMarkers,
    show, hide, update, dispose,
  }
}

// ── Helper: text sprite from canvas ──────────────────────────────────────────
function makeTextSprite(text, { fontSize = 32, color = '#ffffff' } = {}) {
  const cv = document.createElement('canvas')
  const ctx = cv.getContext('2d')
  const font = `${fontSize}px "SF Mono", "Fira Code", monospace`
  ctx.font = font
  const metrics = ctx.measureText(text)
  const w = Math.ceil(metrics.width) + 16
  const h = fontSize + 16
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
