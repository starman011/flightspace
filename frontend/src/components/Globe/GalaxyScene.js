/**
 * GalaxyScene
 * ─────────────────────────────────────────────────────────────────────────────
 * Attaches a deep-space visual layer to the Three.js scene.
 * Visible only when cameraScale === 'galaxy'.
 *
 * Contents
 *   • Milky Way sky sphere — canvas-generated equirectangular texture (BackSide)
 *   • Star field           — 7,000 Points, fibonacci-distributed, vertex-colored
 *                            by stellar spectral class (O/B/A/G/K/M)
 *   • Notable objects      — 6 bright point markers at RA/Dec-correct directions
 */

import {
  Object3D, Points, PointsMaterial, BufferGeometry, BufferAttribute,
  Mesh, SphereGeometry, MeshBasicMaterial,
  AdditiveBlending, BackSide, CanvasTexture, Color,
} from 'three'
import { AU_TO_WU } from './solarSystem.js'

// ── Seeded RNG (deterministic so the star field is stable across re-renders) ─
function seededRng(seed) {
  let s = seed >>> 0
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000 }
}

// ── Milky Way sky texture (canvas — no external fetch) ────────────────────────
// Equirectangular 1024×512. Galactic band centred at equator.
function buildMilkyWayTexture() {
  const W = 1024, H = 512
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const ctx = cv.getContext('2d')

  // Deep-space base
  ctx.fillStyle = '#00000a'
  ctx.fillRect(0, 0, W, H)

  // Galactic band — vertical gradient centred at equator (y = H/2)
  const band = ctx.createLinearGradient(0, 0, 0, H)
  band.addColorStop(0,    'rgba(5,6,20,0)')
  band.addColorStop(0.15, 'rgba(8,10,32,0)')
  band.addColorStop(0.28, 'rgba(18,15,55,0.25)')
  band.addColorStop(0.40, 'rgba(32,28,90,0.55)')
  band.addColorStop(0.50, 'rgba(50,44,118,0.85)')   // galactic equator
  band.addColorStop(0.60, 'rgba(32,28,90,0.55)')
  band.addColorStop(0.72, 'rgba(18,15,55,0.25)')
  band.addColorStop(0.85, 'rgba(8,10,32,0)')
  band.addColorStop(1,    'rgba(5,6,20,0)')
  ctx.fillStyle = band
  ctx.fillRect(0, 0, W, H)

  // Galactic-centre brightness boost (longitude ≈ π = centre of texture)
  const gc = ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, W * 0.28)
  gc.addColorStop(0, 'rgba(80,60,140,0.55)')
  gc.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gc
  ctx.fillRect(0, 0, W, H)

  // A few nebula blobs along the band (emission red, reflection blue)
  const nebulae = [
    { x: 0.22, y: 0.48, r: 0.07, col: 'rgba(100,28,60,0.35)' },
    { x: 0.38, y: 0.52, r: 0.09, col: 'rgba(40,60,130,0.28)' },
    { x: 0.64, y: 0.47, r: 0.08, col: 'rgba(80,20,50,0.30)' },
    { x: 0.78, y: 0.51, r: 0.06, col: 'rgba(30,50,110,0.25)' },
  ]
  for (const n of nebulae) {
    const g = ctx.createRadialGradient(n.x*W, n.y*H, 0, n.x*W, n.y*H, n.r*W)
    g.addColorStop(0, n.col)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }

  // Scatter stars directly into pixel buffer (fast path)
  const img  = ctx.getImageData(0, 0, W, H)
  const data = img.data
  const rng  = seededRng(0xdeadbeef)
  for (let i = 0; i < 10000; i++) {
    const sx   = Math.floor(rng() * W)
    const sy   = Math.floor(rng() * H)
    const dy   = Math.abs(sy / H - 0.5)           // 0=equator, 0.5=pole
    // Higher density near galactic plane
    if (rng() > 0.28 + dy * 0.65) continue
    const bright = 90 + Math.floor(rng() * 165)
    const t = rng()  // spectral temperature proxy
    const r = t < 0.35 ? Math.min(255, bright + 25) : bright
    const g = bright
    const b = t < 0.65 ? Math.min(255, bright + 35) : Math.max(80, bright - 50)
    const a = Math.floor((0.45 + rng() * 0.55) * 255)
    const idx = (sy * W + sx) * 4
    data[idx]   = r; data[idx+1] = g; data[idx+2] = b; data[idx+3] = a
  }
  ctx.putImageData(img, 0, 0)

  return new CanvasTexture(cv)
}

// ── Notable DSOs — RA/Dec directions, distances scaled for visual placement ───
// Distances in AU (visual — not physically accurate, direction IS correct)
const DSO_CATALOG = [
  { name: 'Sirius',           ra: 101.3, dec: -16.7, dist:    800, color: 0xbbddff },
  { name: 'Vega',             ra: 279.2, dec:  38.8, dist:   2000, color: 0xaabbff },
  { name: 'Betelgeuse',       ra:  88.8, dec:   7.4, dist:  20000, color: 0xff5500 },
  { name: 'Rigel',            ra:  78.6, dec:  -8.2, dist:  20000, color: 0xaaccff },
  { name: 'Andromeda (M31)',   ra:  10.7, dec:  41.3, dist:  60000, color: 0xffeedd },
  { name: 'Orion Nebula (M42)',ra:  83.8, dec:  -5.4, dist:   1800, color: 0xffaacc },
]

function raDecToWU(raDeg, decDeg, distAU) {
  const ra  = raDeg  * Math.PI / 180
  const dec = decDeg * Math.PI / 180
  const d   = distAU * AU_TO_WU
  return [d * Math.cos(dec) * Math.cos(ra), d * Math.sin(dec), d * Math.cos(dec) * Math.sin(ra)]
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createGalaxyScene(scene) {
  const galaxyGroup = new Object3D()
  galaxyGroup.visible = false
  scene.add(galaxyGroup)

  // ── Milky Way sky sphere ───────────────────────────────────────────────────
  const SKY_R = AU_TO_WU * 5500
  galaxyGroup.add(new Mesh(
    new SphereGeometry(SKY_R, 64, 32),
    new MeshBasicMaterial({ map: buildMilkyWayTexture(), side: BackSide }),
  ))

  // ── Star field (7,000 Points, fibonacci-sphere distribution) ──────────────
  const N   = 7000
  const pos = new Float32Array(N * 3)
  const col = new Float32Array(N * 3)
  const PHI = Math.PI * (3 - Math.sqrt(5))  // golden angle
  const rng = seededRng(42)
  for (let i = 0; i < N; i++) {
    const y   = 1 - (i / (N - 1)) * 2
    const rad = Math.sqrt(1 - y * y)
    const th  = PHI * i
    const d   = AU_TO_WU * (60 + rng() * 1800)
    pos[i * 3]     = Math.cos(th) * rad * d
    pos[i * 3 + 1] = y * d
    pos[i * 3 + 2] = Math.sin(th) * rad * d
    // Spectral class distribution: mostly G/K/M, few O/B
    const t = rng()
    if      (t < 0.05) { col[i*3]=0.55; col[i*3+1]=0.65; col[i*3+2]=1.00 }  // O/B blue-white
    else if (t < 0.20) { col[i*3]=0.90; col[i*3+1]=0.95; col[i*3+2]=1.00 }  // A/F white
    else if (t < 0.58) { col[i*3]=1.00; col[i*3+1]=0.95; col[i*3+2]=0.78 }  // G yellow (sun-like)
    else if (t < 0.84) { col[i*3]=1.00; col[i*3+1]=0.65; col[i*3+2]=0.35 }  // K orange
    else               { col[i*3]=1.00; col[i*3+1]=0.35; col[i*3+2]=0.15 }  // M red
  }
  const starGeo = new BufferGeometry()
  starGeo.setAttribute('position', new BufferAttribute(pos, 3))
  starGeo.setAttribute('color',    new BufferAttribute(col, 3))
  galaxyGroup.add(new Points(starGeo, new PointsMaterial({
    size: AU_TO_WU * 0.07, sizeAttenuation: true, vertexColors: true,
    transparent: true, opacity: 0.90,
    blending: AdditiveBlending, depthWrite: false,
  })))

  // ── Notable DSO bright markers ─────────────────────────────────────────────
  const DP     = DSO_CATALOG.length
  const dsoPos = new Float32Array(DP * 3)
  const dsoCol = new Float32Array(DP * 3)
  for (let i = 0; i < DP; i++) {
    const { ra, dec, dist, color } = DSO_CATALOG[i]
    const [x, y, z] = raDecToWU(ra, dec, dist)
    dsoPos[i*3]=x; dsoPos[i*3+1]=y; dsoPos[i*3+2]=z
    const c = new Color(color)
    dsoCol[i*3]=c.r; dsoCol[i*3+1]=c.g; dsoCol[i*3+2]=c.b
  }
  const dsoGeo = new BufferGeometry()
  dsoGeo.setAttribute('position', new BufferAttribute(dsoPos, 3))
  dsoGeo.setAttribute('color',    new BufferAttribute(dsoCol, 3))
  galaxyGroup.add(new Points(dsoGeo, new PointsMaterial({
    size: AU_TO_WU * 0.6, sizeAttenuation: true, vertexColors: true,
    transparent: true, opacity: 1.0,
    blending: AdditiveBlending, depthWrite: false,
  })))

  function show() { galaxyGroup.visible = true }
  function hide() { galaxyGroup.visible = false }

  function dispose() {
    galaxyGroup.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose()
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose()
        obj.material.dispose()
      }
    })
    scene.remove(galaxyGroup)
  }

  return { galaxyGroup, dsoData: DSO_CATALOG, show, hide, dispose }
}
