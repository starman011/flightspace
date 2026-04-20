/**
 * DESI Galaxy Layer — renders 100K real galaxies/quasars from DESI DR1
 * as color-coded glowing points in 3D space.
 *
 * Color encodes redshift (cosmic distance):
 *   cyan (nearby, z≈0) → blue → indigo → violet → magenta (far, z>2)
 *   Quasars get a distinct amber/gold tone.
 *
 * Position: RA/Dec → angular direction, redshift → radial distance (log scale).
 */

import {
  Object3D, Points, BufferGeometry, Float32BufferAttribute,
  ShaderMaterial, AdditiveBlending, CanvasTexture, Color, Vector3,
} from 'three'

const API = import.meta.env.VITE_API_URL || ''

// ── Scale constants ──────────────────────────────────────────────────────────
// NightSkyScene places stars at SKY_R * 0.95 ≈ 456 WU.
// DESI galaxies sit inside that sphere, filling 3D volume.
const SKY_R    = 480
const DESI_MAX = SKY_R * 0.80   // max radius for furthest objects
const DESI_MIN = 12             // min radius for nearest objects
const Z_CEIL   = 3.5            // cap redshift mapping

// ── Cosmological helpers ─────────────────────────────────────────────────────

// Redshift → log-scaled radius (spreads nearby galaxies, compresses distant)
function zToRadius(z) {
  const t = Math.log1p(z * 6) / Math.log1p(Z_CEIL * 6)
  return DESI_MIN + (DESI_MAX - DESI_MIN) * t
}

// Redshift → HSL color
//   Galaxies: cyan (0.52) → blue (0.62) → indigo (0.72) → purple (0.80) → magenta (0.87)
//   Quasars:  warm amber/gold distinct from galaxy gradient
function zToColor(z, spectype) {
  const c = new Color()
  if (spectype === 'QSO') {
    // Amber → deep orange by distance
    const t = Math.min(z / 3.0, 1.0)
    c.setHSL(0.08 - t * 0.03, 0.85, 0.55 - t * 0.12)
    return c
  }
  // Galaxy gradient
  const t = Math.min(z / 2.0, 1.0)
  const hue = 0.52 + t * 0.35          // cyan → magenta
  const sat = 0.75 + (1 - t) * 0.15    // slightly more vivid nearby
  const lum = 0.58 - t * 0.10          // slightly dimmer at distance
  c.setHSL(hue, sat, lum)
  return c
}

// RA/Dec (degrees) → Three.js XYZ at given radius
// NightSkyScene convention: -Z for RA direction (matches star placement)
function raDecToXYZ(raDeg, decDeg, radius) {
  const ra  = raDeg  * Math.PI / 180
  const dec = decDeg * Math.PI / 180
  return [
    radius * Math.cos(dec) * Math.cos(ra),
    radius * Math.sin(dec),
   -radius * Math.cos(dec) * Math.sin(ra),
  ]
}

// ── Glow sprite texture ──────────────────────────────────────────────────────
function makeGlowTexture() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const c = size / 2
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c)
  grad.addColorStop(0.0, 'rgba(255,255,255,1.0)')
  grad.addColorStop(0.12, 'rgba(255,255,255,0.85)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.3)')
  grad.addColorStop(0.7, 'rgba(255,255,255,0.06)')
  grad.addColorStop(1.0, 'rgba(255,255,255,0.0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  return new CanvasTexture(canvas)
}

// ── Custom shader for per-point size ─────────────────────────────────────────
const vertexShader = `
  attribute float aSize;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (300.0 / -mv.z);
    gl_PointSize = clamp(gl_PointSize, 1.5, 18.0);
    gl_Position = projectionMatrix * mv;
  }
`
const fragmentShader = `
  uniform sampler2D uTex;
  varying vec3 vColor;
  void main() {
    vec4 tex = texture2D(uTex, gl_PointCoord);
    gl_FragColor = vec4(vColor * tex.rgb, tex.a * 0.88);
  }
`

// ── Factory ──────────────────────────────────────────────────────────────────

export function createDESILayer() {
  const group = new Object3D()
  group.visible = false

  let galaxyData = null   // array of { t, r, d, z, s }
  let pointCloud = null
  let loaded     = false
  let loading    = false

  const glowTex = makeGlowTexture()

  // ── Fetch + build ────────────────────────────────────────────────────────
  // Primary: static pre-baked JSON (works without backend).
  // Fallback: backend API proxy (for fresh data).
  async function load() {
    if (loaded || loading) return
    loading = true
    try {
      // Static file — always available, no CORS issues
      let res = await fetch('/desi-galaxies.json')
      if (!res.ok) {
        // Fallback to backend proxy
        res = await fetch(`${API}/api/v1/desi/galaxies`)
      }
      if (!res.ok) throw new Error(`status ${res.status}`)
      const raw = await res.json()
      // Normalize: static file uses 'G'/'Q', backend uses 'GALAXY'/'QSO'
      galaxyData = raw.map(g => ({
        t: g.t,
        r: g.r,
        d: g.d,
        z: g.z,
        s: g.s === 'G' ? 'GALAXY' : g.s === 'Q' ? 'QSO' : g.s,
      }))
      if (galaxyData.length > 0) {
        buildPointCloud()
        loaded = true
      }
    } catch (e) {
      console.warn('DESI load failed:', e.message)
    } finally {
      loading = false
    }
  }

  function buildPointCloud() {
    const n = galaxyData.length
    const positions = new Float32Array(n * 3)
    const colors    = new Float32Array(n * 3)
    const sizes     = new Float32Array(n)

    for (let i = 0; i < n; i++) {
      const g = galaxyData[i]
      const radius = zToRadius(g.z)
      const [x, y, z] = raDecToXYZ(g.r, g.d, radius)

      positions[i * 3]     = x
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = z

      const col = zToColor(g.z, g.s)
      colors[i * 3]     = col.r
      colors[i * 3 + 1] = col.g
      colors[i * 3 + 2] = col.b

      // Quasars slightly larger (they're brighter + rarer)
      sizes[i] = g.s === 'QSO' ? 5.0 : 3.0
    }

    const geom = new BufferGeometry()
    geom.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geom.setAttribute('color',    new Float32BufferAttribute(colors, 3))
    geom.setAttribute('aSize',    new Float32BufferAttribute(sizes, 1))

    const mat = new ShaderMaterial({
      uniforms: { uTex: { value: glowTex } },
      vertexShader,
      fragmentShader,
      vertexColors: true,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    })

    pointCloud = new Points(geom, mat)
    group.add(pointCloud)
  }

  // ── Visibility ───────────────────────────────────────────────────────────
  function show() {
    group.visible = true
    if (!loaded && !loading) load()
  }
  function hide() { group.visible = false }

  // ── Screen-space pick ────────────────────────────────────────────────────
  // Projects every DESI point to screen coords, finds closest to tap.
  // 100K iterations is <2ms on modern hardware.
  const _v = new Vector3()

  function pick(clientX, clientY, camera, domElement) {
    if (!galaxyData || !pointCloud) return null

    const rect = domElement.getBoundingClientRect()
    const w = rect.width, h = rect.height
    const cx = clientX - rect.left
    const cy = clientY - rect.top
    const tapR = ('ontouchstart' in window) ? 28 : 16
    const tapR2 = tapR * tapR

    const posAttr = pointCloud.geometry.getAttribute('position')
    let best = null, bestDist = tapR2

    for (let i = 0; i < galaxyData.length; i++) {
      _v.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i))
      _v.project(camera)

      // Behind camera
      if (_v.z > 1) continue

      const sx = (_v.x *  0.5 + 0.5) * w
      const sy = (-_v.y * 0.5 + 0.5) * h
      const dx = sx - cx, dy = sy - cy
      const d2 = dx * dx + dy * dy

      if (d2 < bestDist) {
        bestDist = d2
        best = i
      }
    }

    if (best === null) return null
    const g = galaxyData[best]
    return {
      type: 'desi_galaxy',
      targetid: g.t,
      ra: g.r,
      dec: g.d,
      z: g.z,
      spectype: g.s,
    }
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────
  function dispose() {
    if (pointCloud) {
      pointCloud.geometry.dispose()
      pointCloud.material.dispose()
    }
    glowTex.dispose()
  }

  return { group, load, show, hide, pick, dispose }
}
