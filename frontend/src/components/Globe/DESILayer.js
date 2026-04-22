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
  LineBasicMaterial, LineLoop, SphereGeometry, MeshBasicMaterial, Mesh,
  Sprite, SpriteMaterial,
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
export function zToRadius(z) {
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
export function raDecToXYZ(raDeg, decDeg, radius) {
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
  // 1. Static JSON for instant first paint (no backend needed).
  // 2. Background refresh from backend API (live DESI TAP, 24h cache).
  //    If backend returns fresh data, rebuild the point cloud in place.

  function normalizeRaw(raw) {
    return raw.map(g => ({
      t: g.t,
      r: g.r,
      d: g.d,
      z: g.z,
      s: g.s === 'G' ? 'GALAXY' : g.s === 'Q' ? 'QSO' : g.s,
    }))
  }

  async function load() {
    if (loaded || loading) return
    loading = true
    try {
      // Fast path: static pre-baked data
      const res = await fetch('/desi-galaxies.json')
      if (res.ok) {
        galaxyData = normalizeRaw(await res.json())
        if (galaxyData.length > 0) {
          buildPointCloud()
          buildScaleReferences()
          loaded = true
        }
      }
    } catch (e) {
      console.warn('DESI static load failed:', e.message)
    } finally {
      loading = false
    }

    // Background: try live data from backend (DESI TAP via proxy)
    refreshFromAPI()
  }

  async function refreshFromAPI() {
    try {
      const res = await fetch(`${API}/api/v1/desi/galaxies`)
      if (!res.ok) return
      const fresh = normalizeRaw(await res.json())
      if (fresh.length === 0) return
      // Replace data + rebuild point cloud
      galaxyData = fresh
      if (pointCloud) {
        group.remove(pointCloud)
        pointCloud.geometry.dispose()
        pointCloud.material.dispose()
        pointCloud = null
      }
      buildPointCloud()
      loaded = true
    } catch {
      // Backend unavailable — static data still works
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
      sizes[i] = g.s === 'QSO' ? 8.0 : 5.5
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
    pointCloud.renderOrder = 10   // render in front of sky dome (renderOrder 0)
    group.add(pointCloud)
  }

  // ── Earth marker + distance shells ─────────────────────────────────────
  let earthMarker = null
  const shellMeshes = []

  function buildScaleReferences() {
    // Earth marker: glowing sphere at origin
    const earthGeo = new SphereGeometry(0.8, 16, 16)
    const earthMat = new MeshBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.7 })
    earthMarker = new Mesh(earthGeo, earthMat)
    earthMarker.renderOrder = 11
    group.add(earthMarker)

    // Earth label sprite

    // Distance shells: faint wireframe rings at 1, 5, 10 Bly
    const shells = [
      { z: 0.076, label: '1 BILLION LIGHT-YEARS', color: 0x44ccff },
      { z: 0.42,  label: '5 BILLION LIGHT-YEARS', color: 0x7788ff },
      { z: 1.0,   label: '10 BILLION LIGHT-YEARS', color: 0xaa66ff },
    ]

    for (const shell of shells) {
      const r = zToRadius(shell.z)

      // 3 great-circle rings (XY, XZ, YZ planes) for a sphere-like wireframe
      for (const plane of ['xy', 'xz', 'yz']) {
        const pts = []
        const segs = 128
        for (let i = 0; i <= segs; i++) {
          const a = (i / segs) * Math.PI * 2
          const c = Math.cos(a) * r, s = Math.sin(a) * r
          if (plane === 'xy') pts.push(c, s, 0)
          else if (plane === 'xz') pts.push(c, 0, s)
          else pts.push(0, c, s)
        }
        const geo = new BufferGeometry()
        geo.setAttribute('position', new Float32BufferAttribute(pts, 3))
        const mat = new LineBasicMaterial({ color: shell.color, transparent: true, opacity: 0.08, depthWrite: false })
        const line = new LineLoop(geo, mat)
        group.add(line)
        shellMeshes.push(line)
      }

      // Large label visible from afar
      const lbl = makeShellLabel(shell.label, `#${shell.color.toString(16).padStart(6, '0')}`)
      lbl.position.set(r * 0.7, r * 0.35, 0)
      lbl.renderOrder = 12
      group.add(lbl)
      shellMeshes.push(lbl)
    }
  }

  function makeShellLabel(text, color) {
    const cv = document.createElement('canvas')
    cv.width = 1024; cv.height = 128
    const ctx = cv.getContext('2d')
    ctx.font = '700 56px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = color
    ctx.globalAlpha = 0.45
    ctx.fillText(text, 512, 64)
    const tex = new CanvasTexture(cv)
    const mat = new SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
    const sp = new Sprite(mat)
    sp.scale.set(80, 10, 1)   // very large — readable from far away
    return sp
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

  // ── Selection + hover highlight ──────────────────────────────────────────
  // A bright, enlarged sprite marks the selected/hovered galaxy.
  let selectedIdx = -1
  let hoveredIdx  = -1

  // Restore a point to its original color + size
  function restorePoint(idx) {
    if (idx < 0 || !pointCloud) return
    const g = galaxyData[idx]
    const col = zToColor(g.z, g.s)
    const colAttr = pointCloud.geometry.getAttribute('color')
    colAttr.setXYZ(idx, col.r, col.g, col.b)
    colAttr.needsUpdate = true
    const sizeAttr = pointCloud.geometry.getAttribute('aSize')
    sizeAttr.setX(idx, g.s === 'QSO' ? 5.0 : 3.0)
    sizeAttr.needsUpdate = true
  }

  // Highlight a point (larger + brighter)
  function highlightPoint(idx, isSelected) {
    if (idx < 0 || !pointCloud) return
    const colAttr = pointCloud.geometry.getAttribute('color')
    const sizeAttr = pointCloud.geometry.getAttribute('aSize')
    if (isSelected) {
      colAttr.setXYZ(idx, 1.0, 1.0, 1.0)   // white
      sizeAttr.setX(idx, 14.0)
    } else {
      colAttr.setXYZ(idx, 0.8, 0.95, 1.0)   // soft cyan-white
      sizeAttr.setX(idx, 9.0)
    }
    colAttr.needsUpdate = true
    sizeAttr.needsUpdate = true
  }

  function setSelected(targetid) {
    if (selectedIdx >= 0) restorePoint(selectedIdx)
    selectedIdx = -1
    if (!targetid || !galaxyData) return
    selectedIdx = galaxyData.findIndex(g => g.t === targetid)
    if (selectedIdx >= 0) highlightPoint(selectedIdx, true)
  }

  function setHovered(idx) {
    if (idx === hoveredIdx) return
    // Restore previous hover (unless it's the selected one)
    if (hoveredIdx >= 0 && hoveredIdx !== selectedIdx) restorePoint(hoveredIdx)
    hoveredIdx = idx
    // Highlight new hover (unless it's the selected one)
    if (hoveredIdx >= 0 && hoveredIdx !== selectedIdx) highlightPoint(hoveredIdx, false)
  }

  function clearHover() {
    if (hoveredIdx >= 0 && hoveredIdx !== selectedIdx) restorePoint(hoveredIdx)
    hoveredIdx = -1
  }

  // Like pick() but returns index + data for hover (avoids object allocation per frame)
  function hoverPick(clientX, clientY, camera, domElement) {
    if (!galaxyData || !pointCloud) return null

    const rect = domElement.getBoundingClientRect()
    const w = rect.width, h = rect.height
    const cx = clientX - rect.left
    const cy = clientY - rect.top
    const tapR2 = 18 * 18  // hover radius slightly tighter than click

    const posAttr = pointCloud.geometry.getAttribute('position')
    let best = null, bestDist = tapR2

    for (let i = 0; i < galaxyData.length; i++) {
      _v.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i))
      _v.project(camera)
      if (_v.z > 1) continue
      const sx = (_v.x *  0.5 + 0.5) * w
      const sy = (-_v.y * 0.5 + 0.5) * h
      const dx = sx - cx, dy = sy - cy
      const d2 = dx * dx + dy * dy
      if (d2 < bestDist) { bestDist = d2; best = i }
    }

    if (best === null) return null
    const g = galaxyData[best]
    return { idx: best, t: g.t, r: g.r, d: g.d, z: g.z, s: g.s }
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────
  function dispose() {
    if (pointCloud) {
      pointCloud.geometry.dispose()
      pointCloud.material.dispose()
    }
    if (earthMarker) { earthMarker.geometry.dispose(); earthMarker.material.dispose() }
    shellMeshes.forEach(m => {
      if (m.geometry) m.geometry.dispose()
      if (m.material) { if (m.material.map) m.material.map.dispose(); m.material.dispose() }
    })
    glowTex.dispose()
  }

  // ── Distance filter: show only galaxies in redshift range ──────────────
  function setDistanceRange(minZ, maxZ) {
    if (!pointCloud || !galaxyData) return
    const sizes = pointCloud.geometry.attributes.aSize
    for (let i = 0; i < galaxyData.length; i++) {
      const gz = galaxyData[i].z
      sizes.array[i] = (gz >= minZ && gz <= maxZ)
        ? (galaxyData[i].s === 'QSO' ? 8.0 : 5.5)
        : 0
    }
    sizes.needsUpdate = true
  }

  return {
    group, load, show, hide, pick, hoverPick,
    setSelected, setHovered, clearHover, setDistanceRange, dispose,
  }
}
