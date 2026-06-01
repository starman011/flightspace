import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Vector3, Vector2, Matrix4, Color, MathUtils,
  Scene, PerspectiveCamera, WebGLRenderer,
  BufferGeometry, BufferAttribute, DynamicDrawUsage,
  PlaneGeometry, SphereGeometry, TubeGeometry, CatmullRomCurve3,
  Mesh, InstancedMesh, LineSegments, Points,
  MeshBasicMaterial, MeshStandardMaterial, MeshPhongMaterial,
  LineBasicMaterial, PointsMaterial, ShaderMaterial,
  AmbientLight, DirectionalLight,
  TextureLoader, CanvasTexture,
  Raycaster, WebGLRenderTarget,
  FrontSide, DoubleSide, AdditiveBlending,
  InstancedBufferAttribute,
  LinearMipmapLinearFilter, LinearFilter,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createSolarSystem } from './SolarSystemScene.js'
import { createNightSkyScene } from './NightSkyScene.js'
import { createDESILayer, raDecToXYZ, zToRadius } from './DESILayer.js'
import { createDeviceOrientationAR } from './DeviceOrientationAR.js'
import { CAM_SOLAR, CAM_EARTH, CAM_GALAXY, CAM_MOON, CAM_TWEEN_MS, CAM_MOON_TWEEN_MS, SOLAR_FAR } from './solarSystem.js'
import { createMoonScene } from './MoonScene.js'
import { createWindLayer } from './WindLayer.js'
import KDBush from 'kdbush'
import { PLACES } from './placeData.js'
import { AIRPORTS } from './airportData.js'
import CompassBar from './CompassBar.jsx'
import styles from './Globe.module.css'

// ── Constants ────────────────────────────────────────────────────────────────

const EARTH_R      = 1.0
const CLOUD_R      = 1.006
// ── Picking ───────────────────────────────────────────────────────────────────
// Below this camera distance (~320 km altitude) switch to GPU color pick.
const PICK_GPU_DIST  = 1.05
// Order must match the encoding in syncInstances and the GPU decode.
const PICK_CAT_ORDER = ['plane','heavy','regional','helicopter','satellite','ship']
const ATM_SCALE    = 1.18
const AC_R         = 1.00008  // ~510m above surface — planes sit here
const TRAIL_R      = 1.00009  // trail core — just above aircraft layer
const TRAIL_GLOW_R = 1.00010  // glow layer — above core

const MAX_AC          = 12000
const MAX_TRAIL_PTS   = 180   // long sci-fi trails (~6× original)
const MAX_TRAIL_VERTS = MAX_AC * (MAX_TRAIL_PTS - 1) * 2
const MAX_TILE_LOADS  = 10
// Camera distance below which tiles are shown; above = pure globe mode
const TILE_DIST_THRESHOLD = 2.5

// ── Module-level scratch objects (avoid per-frame allocation) ─────────────────

const _normal  = new Vector3()
const _forward = new Vector3()
const _north   = new Vector3()
const _right   = new Vector3()
const _xAxis   = new Vector3()
const _rotMat  = new Matrix4()
const _zeroMat = new Matrix4().makeScale(0, 0, 0)  // hides a slot
const _worldUp = new Vector3(0, 1, 0)
const _pickColor   = new Color()              // scratch for GPU pick color encoding
const _colNormal   = new Color(0.38, 0.58, 0.85)  // steel blue (planes)
const _colSelected = new Color(0.08, 0.50, 0.92)  // deep cyan (selected)
const _colHover    = new Color(1.00, 0.85, 0.15)  // FR24 yellow (hover)
const _colHeli     = new Color(0.80, 0.52, 0.10)  // dark amber (helicopters)
const _colSat      = new Color(0.48, 0.48, 0.78)  // muted violet (satellites)
const _colShip     = new Color(0.20, 0.90, 0.55)  // bright sea-green (ships)

function defaultColor(cat) {
  if (cat === 'helicopter') return _colHeli
  if (cat === 'satellite')  return _colSat
  if (cat === 'ship')       return _colShip
  return _colNormal
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Returns a unit vector pointing from Earth's centre toward the real-time sun.
// Algorithm: NOAA simplified solar position (accurate to ~1° for our purposes).
function solarDirection() {
  const now      = new Date()
  const start    = new Date(now.getUTCFullYear(), 0, 0)
  const dayOfYear = Math.floor((now - start) / 86400000)

  // Solar declination ≈ −23.45° × cos(360/365 × (dayOfYear + 10))
  const declRad = (-23.45 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10))) * (Math.PI / 180)

  // Subsolar longitude: at UTC 12:00 the sub-solar point is near lon 0°
  const utcH = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600
  const subsolarLon = (12 - utcH) * 15   // degrees; positive = east

  // Convert sub-solar (lat=decl, lon=subsolarLon) to 3D unit vector
  const phi   = (Math.PI / 2) - declRad                               // polar angle from +Y
  const theta = (subsolarLon + 180) * (Math.PI / 180)                 // azimuth (matches ll2v convention)
  return new Vector3(
    -Math.sin(phi) * Math.cos(theta),
     Math.cos(phi),
     Math.sin(phi) * Math.sin(theta),
  )
}

function ll2v(lat, lon, r = AC_R) {
  const phi   = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return new Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  )
}

// Inverse of ll2v — 3D unit/scaled vector → [lat, lon]
function v2ll(v) {
  const r     = v.length()
  const phi   = Math.acos(MathUtils.clamp(v.y / r, -1, 1))
  const theta = Math.atan2(v.z, -v.x)
  return [
    90 - phi * (180 / Math.PI),       // lat
    theta * (180 / Math.PI) - 180,    // lon
  ]
}

// Haversine distance in km between two lat/lon points
function haversineKm(a, b) {
  const R = 6371
  const toRad = (x) => x * Math.PI / 180
  const dLat = toRad(b.latitude  - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const la1  = toRad(a.latitude)
  const la2  = toRad(b.latitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Sanitize a lat/lon path for rendering:
//  • sort by timestamp (if present) — trail points can arrive out of order
//  • drop near-duplicates (< MIN_KM apart) — prevents Catmull-Rom oscillation
//  • drop GPS jumps (> MAX_KM between consecutive points) — noise spikes
// Endpoints are always preserved so dep/arr airports stay anchored.
function sanitizePath(pts) {
  if (!pts || pts.length < 2) return pts || []
  const MIN_KM = 0.5     // drop duplicates
  const MAX_KM = 800     // drop single-point GPS jumps (airliner moves ~15km/min)
  const sorted = [...pts]
  if (sorted[0].timestamp != null) {
    sorted.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
  }
  const out = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[out.length - 1]
    const cur  = sorted[i]
    const d    = haversineKm(prev, cur)
    if (d < MIN_KM && i !== sorted.length - 1) continue // skip duplicate (but keep last)
    if (d > MAX_KM && i !== sorted.length - 1) continue // skip noise jump (but keep last)
    out.push(cur)
  }
  return out
}

// Great-circle interpolation using spherical linear interpolation (slerp).
// True slerp gives uniform angular spacing — nlerp would bunch points near
// endpoints for long segments. Also handles antimeridian correctly because
// it works in 3D vector space, not 2D lon/lat.
function greatCirclePoints(pts, r = EARTH_R + 0.035, steps = 40) {
  if (!pts?.length) return []
  const clean = sanitizePath(pts)
  if (clean.length < 2) return []
  const verts = []
  for (let i = 0; i < clean.length - 1; i++) {
    const v0 = ll2v(clean[i].latitude,     clean[i].longitude,     1).normalize()
    const v1 = ll2v(clean[i + 1].latitude, clean[i + 1].longitude, 1).normalize()
    const dot   = Math.max(-1, Math.min(1, v0.dot(v1)))
    const omega = Math.acos(dot)
    const sinO  = Math.sin(omega)
    // Near-identical endpoints: fall back to a single point (already deduped above)
    if (sinO < 1e-6) {
      verts.push(v0.clone().multiplyScalar(r))
      continue
    }
    for (let s = 0; s <= steps; s++) {
      const t  = s / steps
      const a  = Math.sin((1 - t) * omega) / sinO
      const b  = Math.sin(t * omega) / sinO
      const v  = new Vector3(
        v0.x * a + v1.x * b,
        v0.y * a + v1.y * b,
        v0.z * a + v1.z * b,
      )
      verts.push(v.multiplyScalar(r))
    }
  }
  return verts
}

// ── Vector-map helpers ────────────────────────────────────────────────────

// Fetch world-atlas TopoJSON and decode to [[lon,lat],…] polylines (country borders).

// ── Place label sprite ────────────────────────────────────────────────────────
// Module-level scratch for world→screen projection (avoids per-frame allocation)

// Pre-build a lat/lon graticule as a static BufferGeometry (LineSegments).
function buildGraticuleGeo(r = EARTH_R + 0.0008, step = 20, segsPerLine = 180) {
  const pts = []
  const push = (la0, lo0, la1, lo1) => {
    const v0 = ll2v(la0, lo0, r), v1 = ll2v(la1, lo1, r)
    pts.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z)
  }
  for (let lat = -80; lat <= 80; lat += step) {
    for (let s = 0; s < segsPerLine; s++) {
      const lo0 = -180 + s * 360 / segsPerLine
      push(lat, lo0, lat, lo0 + 360 / segsPerLine)
    }
  }
  for (let lon = -180; lon < 180; lon += step) {
    for (let s = 0; s < segsPerLine / 2; s++) {
      const la0 = -90 + s * 360 / segsPerLine
      push(la0, lon, la0 + 360 / segsPerLine, lon)
    }
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3))
  return geo
}

// ── Tile-map helpers ──────────────────────────────────────────────────────────

// WebMercator tile Y index → latitude (degrees)
function tile2lat(ty, z) {
  const n = Math.PI - (2 * Math.PI * ty) / (1 << z)
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}

// Build a sphere-patch mesh geometry for tile (tx, ty) at zoom z.
// Uses Mercator interpolation so tile image pixels map 1-to-1 onto the sphere.
// Step count scales with zoom: fewer subdivisions for coarse tiles = less GPU work.
function buildTileGeo(tx, ty, z, r = EARTH_R * 1.0015, steps = z >= 11 ? 8 : z >= 7 ? 5 : 3) {
  const N = 1 << z
  const verts = [], uvs = [], inds = []
  for (let j = 0; j <= steps; j++) {
    for (let i = 0; i <= steps; i++) {
      const u   = i / steps
      const vv  = j / steps
      const lon = ((tx + u) / N) * 360 - 180
      const lat = tile2lat(ty + vv, z)
      const p   = ll2v(lat, lon, r)
      verts.push(p.x, p.y, p.z)
      uvs.push(u, 1 - vv)   // flip V: WebMercator Y=0 is top, Three.js UV V=0 is bottom
    }
  }
  for (let j = 0; j < steps; j++) {
    for (let i = 0; i < steps; i++) {
      const a = j * (steps + 1) + i
      const b = a + 1, c = a + (steps + 1), d = c + 1
      inds.push(a, c, b, b, c, d)
    }
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3))
  geo.setAttribute('uv',       new BufferAttribute(new Float32Array(uvs),   2))
  geo.setIndex(inds)
  return geo
}

// Maps camera distance to WebMercator zoom level.
// Uses altitude in metres for a physically meaningful mapping:
//   ~127 m  → zoom 18  (0.6 m/px — sub-meter satellite detail)
//   ~640 m  → zoom 16
//   ~6.4 km → zoom 14
//   ~64 km  → zoom 11
//   Capped at zoom 19 (ESRI/CartoDB server maximum)
function distToTileZoom(dist) {
  const altM = Math.max(dist - 1.0, 1e-7) * 6_371_000   // altitude in metres
  return Math.max(2, Math.min(19, Math.round(23.47 - Math.log2(altM) * 0.781)))
}

/// Tile URL: CartoDB Dark Matter @2x (street) or ESRI World Imagery (satellite).
// Dark Matter gives a dark, stylish map that matches the space theme.
function getTileUrl(tx, ty, z, style) {
  if (style === 'satellite') {
    return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`
  }
  const s = 'abcd'[(Math.abs(tx) + Math.abs(ty)) % 4]
  return `https://${s}.basemaps.cartocdn.com/dark_all/${z}/${tx}/${ty}@2x.png`
}

// White plane silhouette on canvas — nose at top (+Y = heading after rotation)
// ── Plane size classification (T051) ────────────────────────────────────────
// Maps top-50 ICAO type codes → size tier used for icon selection.
// Any unknown type falls back to 'plane' (medium narrowbody).
const HEAVY_TYPES = new Set([
  'B741','B742','B743','B744','B748',          // 747 family
  'A380','A388',                                // A380
  'A350','A35K','A359',                         // A350
  'B777','B772','B773','B77L','B77W','B778','B779', // 777 family
  'A330','A332','A333','A338','A339',           // A330
  'A340','A342','A343','A345','A346',           // A340
  'B787','B788','B789','B78X',                  // 787
  'B762','B763','B764',                         // 767
  'MD11','DC10',                                // MD-11 / DC-10
])
const REGIONAL_TYPES = new Set([
  'E170','E175','E190','E195',                  // Embraer E-series
  'CRJ2','CRJ7','CRJ9','CRJX',                 // Bombardier CRJ
  'DH8A','DH8B','DH8C','DH8D',                 // Dash 8
  'AT43','AT45','AT72','AT75','AT76',           // ATR
  'SF34','E120','B463',                         // Saab 340, Brasilia, BAe 146
  'T134','T154',                                // Tupolev regional
])

// Returns render category for a plane given its ICAO type code.
function planeSize(typeCode) {
  if (!typeCode) return 'plane'
  const t = typeCode.toUpperCase()
  if (HEAVY_TYPES.has(t))   return 'heavy'
  if (REGIONAL_TYPES.has(t)) return 'regional'
  return 'plane'
}

// ── Shared plane rendering helpers ──────────────────────────────────────────
// All airplane icons share the same look-and-feel: high-res canvas, dark
// outline stroke (so planes read on both water and bright city tiles), subtle
// gradient fill (darker fuselage → lighter wingtips for depth), anisotropic
// mip-map filtering at ~16x for sharp edges at any zoom level.
function _mkAcCanvas() {
  const sz  = 128
  const c   = document.createElement('canvas')
  c.width   = c.height = sz
  return { c, ctx: c.getContext('2d'), sz }
}
function _finishPlaneTex(c, ctx, fillPath, strokePath) {
  // Fill gradient: center/fuselage is near-white, wing tips fade slightly
  // so wings read separately from the body.
  const cx = c.width / 2, cy = c.height / 2
  const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, c.width * 0.55)
  grad.addColorStop(0,    'rgba(255,255,255,1.00)')
  grad.addColorStop(0.55, 'rgba(245,250,255,0.98)')
  grad.addColorStop(1,    'rgba(210,225,245,0.92)')
  ctx.fillStyle = grad
  fillPath()
  ctx.fill()
  // Dark outline — ensures visibility on bright city tiles
  ctx.strokeStyle = 'rgba(10,16,26,0.85)'
  ctx.lineWidth   = c.width * 0.022
  ctx.lineJoin    = 'round'
  ctx.lineCap     = 'round'
  strokePath()
  ctx.stroke()
  const tex = new CanvasTexture(c)
  tex.anisotropy = 16
  tex.minFilter  = LinearMipmapLinearFilter
  tex.magFilter  = LinearFilter
  tex.needsUpdate = true
  return tex
}

function buildPlaneTex() {
  const { c, ctx, sz } = _mkAcCanvas()
  // canvas y=0 is top → maps to texture v=1 → PlaneGeometry local +Y (heading direction)
  const cx = sz / 2, cy = sz / 2, s = sz * 0.40
  const draw = () => {
    ctx.beginPath()
    ctx.moveTo(cx,          cy - s * 1.12)  // nose tip
    ctx.quadraticCurveTo(cx + s*0.10, cy - s * 0.80, cx + s*0.14, cy - s * 0.30) // right fuselage curve
    ctx.lineTo(cx + s*0.14, cy + s * 0.05)  // right wing root
    ctx.lineTo(cx + s*0.95, cy + s * 0.50)  // right wing tip
    ctx.lineTo(cx + s*0.95, cy + s * 0.60)  // right wing trailing
    ctx.lineTo(cx + s*0.14, cy + s * 0.38)  // right wing root trailing
    ctx.lineTo(cx + s*0.14, cy + s * 0.62)  // right tail root
    ctx.lineTo(cx + s*0.44, cy + s * 1.05)  // right tail tip
    ctx.lineTo(cx + s*0.11, cy + s * 0.90)  // right tail inner
    ctx.lineTo(cx,          cy + s * 0.95)  // tail center
    ctx.lineTo(cx - s*0.11, cy + s * 0.90)  // left tail inner
    ctx.lineTo(cx - s*0.44, cy + s * 1.05)  // left tail tip
    ctx.lineTo(cx - s*0.14, cy + s * 0.62)  // left tail root
    ctx.lineTo(cx - s*0.14, cy + s * 0.38)  // left wing root trailing
    ctx.lineTo(cx - s*0.95, cy + s * 0.60)  // left wing trailing
    ctx.lineTo(cx - s*0.95, cy + s * 0.50)  // left wing tip
    ctx.lineTo(cx - s*0.14, cy + s * 0.05)  // left wing root
    ctx.quadraticCurveTo(cx - s*0.10, cy - s * 0.80, cx, cy - s * 1.12) // left fuselage curve
    ctx.closePath()
  }
  return _finishPlaneTex(c, ctx, draw, draw)
}

// Heavy widebody — longer fuselage, wider swept wings, bigger tail.
function buildHeavyPlaneTex() {
  const { c, ctx, sz } = _mkAcCanvas()
  const cx = sz / 2, cy = sz / 2, s = sz * 0.40
  const draw = () => {
    ctx.beginPath()
    ctx.moveTo(cx,          cy - s * 1.15)  // nose tip
    ctx.quadraticCurveTo(cx + s*0.12, cy - s * 0.85, cx + s*0.16, cy - s * 0.30)
    ctx.lineTo(cx + s*0.16, cy - s * 0.05)  // right wing root
    ctx.lineTo(cx + s*1.22, cy + s * 0.52)  // right wing tip (wider + swept)
    ctx.lineTo(cx + s*1.22, cy + s * 0.68)  // right wing trailing
    ctx.lineTo(cx + s*0.16, cy + s * 0.32)  // right wing root trailing
    ctx.lineTo(cx + s*0.16, cy + s * 0.62)  // right tail root
    ctx.lineTo(cx + s*0.52, cy + s * 1.08)  // right tail tip
    ctx.lineTo(cx + s*0.13, cy + s * 0.92)
    ctx.lineTo(cx,          cy + s * 0.97)
    ctx.lineTo(cx - s*0.13, cy + s * 0.92)
    ctx.lineTo(cx - s*0.52, cy + s * 1.08)
    ctx.lineTo(cx - s*0.16, cy + s * 0.62)
    ctx.lineTo(cx - s*0.16, cy + s * 0.32)
    ctx.lineTo(cx - s*1.22, cy + s * 0.68)
    ctx.lineTo(cx - s*1.22, cy + s * 0.52)
    ctx.lineTo(cx - s*0.16, cy - s * 0.05)
    ctx.lineTo(cx - s*0.16, cy - s * 0.30)
    ctx.quadraticCurveTo(cx - s*0.12, cy - s * 0.85, cx, cy - s * 1.15)
    ctx.closePath()
  }
  return _finishPlaneTex(c, ctx, draw, draw)
}

// Regional jet — compact body, shorter/narrower wings.
function buildRegionalPlaneTex() {
  const { c, ctx, sz } = _mkAcCanvas()
  const cx = sz / 2, cy = sz / 2, s = sz * 0.40
  const draw = () => {
    ctx.beginPath()
    ctx.moveTo(cx,          cy - s * 1.02)  // nose tip (shorter)
    ctx.quadraticCurveTo(cx + s*0.09, cy - s * 0.70, cx + s*0.12, cy - s * 0.25)
    ctx.lineTo(cx + s*0.12, cy + s * 0.08)
    ctx.lineTo(cx + s*0.74, cy + s * 0.46)  // wing tip (narrower)
    ctx.lineTo(cx + s*0.74, cy + s * 0.58)
    ctx.lineTo(cx + s*0.12, cy + s * 0.36)
    ctx.lineTo(cx + s*0.12, cy + s * 0.58)
    ctx.lineTo(cx + s*0.36, cy + s * 0.96)  // tail (smaller)
    ctx.lineTo(cx + s*0.09, cy + s * 0.82)
    ctx.lineTo(cx,          cy + s * 0.88)
    ctx.lineTo(cx - s*0.09, cy + s * 0.82)
    ctx.lineTo(cx - s*0.36, cy + s * 0.96)
    ctx.lineTo(cx - s*0.12, cy + s * 0.58)
    ctx.lineTo(cx - s*0.12, cy + s * 0.36)
    ctx.lineTo(cx - s*0.74, cy + s * 0.58)
    ctx.lineTo(cx - s*0.74, cy + s * 0.46)
    ctx.lineTo(cx - s*0.12, cy + s * 0.08)
    ctx.lineTo(cx - s*0.12, cy - s * 0.25)
    ctx.quadraticCurveTo(cx - s*0.09, cy - s * 0.70, cx, cy - s * 1.02)
    ctx.closePath()
  }
  return _finishPlaneTex(c, ctx, draw, draw)
}

// Helicopter top-down silhouette — large rotor circle + compact body + tail boom.
// Clearly distinct from the swept-wing plane shape.
function buildHelicopterTex() {
  const sz  = 64
  const c   = document.createElement('canvas')
  c.width   = c.height = sz
  const ctx = c.getContext('2d')
  const cx = sz / 2, cy = sz * 0.42  // body sits slightly above centre to leave room for tail

  ctx.fillStyle   = '#ffffff'
  ctx.strokeStyle = '#ffffff'
  ctx.lineCap     = 'round'

  // Main rotor disc — large circle outline (most visually distinctive feature)
  ctx.lineWidth = sz * 0.07
  ctx.beginPath()
  ctx.arc(cx, cy, sz * 0.40, 0, Math.PI * 2)
  ctx.stroke()

  // Two rotor blades crossing inside the disc
  ctx.lineWidth = sz * 0.06
  ctx.beginPath(); ctx.moveTo(cx - sz * 0.35, cy); ctx.lineTo(cx + sz * 0.35, cy); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(cx, cy - sz * 0.35); ctx.lineTo(cx, cy + sz * 0.35); ctx.stroke()

  // Central hub dot
  ctx.beginPath(); ctx.arc(cx, cy, sz * 0.07, 0, Math.PI * 2); ctx.fill()

  // Fuselage: small elongated pill below hub
  ctx.beginPath()
  ctx.ellipse(cx, cy + sz * 0.22, sz * 0.09, sz * 0.14, 0, 0, Math.PI * 2)
  ctx.fill()

  // Tail boom extending down
  ctx.lineWidth = sz * 0.06
  ctx.beginPath(); ctx.moveTo(cx, cy + sz * 0.36); ctx.lineTo(cx, cy + sz * 0.52); ctx.stroke()

  // Tail rotor: small horizontal tick at boom end
  ctx.lineWidth = sz * 0.08
  ctx.beginPath(); ctx.moveTo(cx - sz * 0.13, cy + sz * 0.52); ctx.lineTo(cx + sz * 0.13, cy + sz * 0.52); ctx.stroke()

  return new CanvasTexture(c)
}

// Satellite asterisk/diamond icon
function buildSatelliteTex() {
  const sz  = 64
  const c   = document.createElement('canvas')
  c.width   = c.height = sz
  const ctx = c.getContext('2d')
  const cx = sz / 2, cy = sz / 2
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = sz * 0.08
  ctx.lineCap   = 'round'
  // Solar panels: wide horizontal bar
  ctx.beginPath(); ctx.moveTo(cx - sz * 0.48, cy); ctx.lineTo(cx + sz * 0.48, cy); ctx.stroke()
  // Body center rectangle
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(cx - sz * 0.09, cy - sz * 0.12, sz * 0.18, sz * 0.24)
  // Antenna line going up
  ctx.lineWidth = sz * 0.06
  ctx.beginPath(); ctx.moveTo(cx, cy - sz * 0.12); ctx.lineTo(cx, cy - sz * 0.40); ctx.stroke()
  // Antenna dish (small circle at top)
  ctx.beginPath(); ctx.arc(cx, cy - sz * 0.40, sz * 0.07, 0, Math.PI * 2); ctx.fill()
  return new CanvasTexture(c)
}

// Ship hull silhouette (top-down view)
function buildShipTex() {
  const sz  = 64
  const c   = document.createElement('canvas')
  c.width   = c.height = sz
  const ctx = c.getContext('2d')
  const cx = sz / 2, cy = sz / 2, s = sz * 0.42
  ctx.fillStyle = '#ffffff'
  // Hull: pointed bow at top, flat stern at bottom
  ctx.beginPath()
  ctx.moveTo(cx,          cy - s * 1.0)   // bow
  ctx.lineTo(cx + s*0.35, cy - s * 0.3)   // starboard shoulder
  ctx.lineTo(cx + s*0.38, cy + s * 0.6)   // starboard stern corner
  ctx.lineTo(cx - s*0.38, cy + s * 0.6)   // port stern corner
  ctx.lineTo(cx - s*0.35, cy - s * 0.3)   // port shoulder
  ctx.closePath()
  ctx.fill()
  // Superstructure (small rectangle in middle)
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(cx - s*0.18, cy - s*0.15, s*0.36, s*0.36)
  return new CanvasTexture(c)
}

// ISS special icon — golden 8-pointed star with glow halo
function buildIssTex() {
  const sz  = 128
  const c   = document.createElement('canvas')
  c.width   = c.height = sz
  const ctx = c.getContext('2d')
  const cx = sz / 2, cy = sz / 2

  // Outer glow halo
  const halo = ctx.createRadialGradient(cx, cy, sz * 0.08, cx, cy, sz * 0.50)
  halo.addColorStop(0,   'rgba(255, 220, 60, 0.55)')
  halo.addColorStop(0.5, 'rgba(255, 180, 20, 0.18)')
  halo.addColorStop(1,   'rgba(255, 140, 0, 0)')
  ctx.fillStyle = halo
  ctx.beginPath(); ctx.arc(cx, cy, sz * 0.50, 0, Math.PI * 2); ctx.fill()

  // 8-pointed star
  ctx.fillStyle = '#ffd700'
  ctx.shadowColor = 'rgba(255, 220, 60, 1)'
  ctx.shadowBlur  = 8
  const spikes = 8, outerR = sz * 0.30, innerR = sz * 0.10
  ctx.beginPath()
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i * Math.PI / spikes) - Math.PI / 2
    const r = i % 2 === 0 ? outerR : innerR
    if (i === 0) ctx.moveTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle))
    else         ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle))
  }
  ctx.closePath(); ctx.fill()

  // Bright white center dot
  ctx.shadowBlur = 0
  ctx.fillStyle  = '#ffffff'
  ctx.beginPath(); ctx.arc(cx, cy, sz * 0.06, 0, Math.PI * 2); ctx.fill()

  return new CanvasTexture(c)
}

// Ring texture for selection indicator
function buildRingTex() {
  const sz  = 128
  const c   = document.createElement('canvas')
  c.width   = c.height = sz
  const ctx = c.getContext('2d')
  ctx.strokeStyle = 'rgba(80, 180, 255, 1)'
  ctx.lineWidth   = 5
  ctx.beginPath()
  ctx.arc(sz / 2, sz / 2, sz / 2 - 6, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(80, 180, 255, 0.25)'
  ctx.lineWidth   = 12
  ctx.beginPath()
  ctx.arc(sz / 2, sz / 2, sz / 2 - 6, 0, Math.PI * 2)
  ctx.stroke()
  return new CanvasTexture(c)
}

// Hover ring texture — FR24-style yellow ring
function buildHoverRingTex() {
  const sz  = 128
  const c   = document.createElement('canvas')
  c.width   = c.height = sz
  const ctx = c.getContext('2d')
  // Outer glow
  ctx.strokeStyle = 'rgba(255, 200, 0, 0.35)'
  ctx.lineWidth   = 14
  ctx.beginPath()
  ctx.arc(sz / 2, sz / 2, sz / 2 - 8, 0, Math.PI * 2)
  ctx.stroke()
  // Crisp yellow ring
  ctx.strokeStyle = 'rgba(255, 220, 30, 0.98)'
  ctx.lineWidth   = 3
  ctx.beginPath()
  ctx.arc(sz / 2, sz / 2, sz / 2 - 5, 0, Math.PI * 2)
  ctx.stroke()
  return new CanvasTexture(c)
}

/** Cyan neon crosshair texture for launch pad marker */
function buildPadMarkerTex() {
  const sz  = 128, cx = sz / 2, cy = sz / 2
  const c   = document.createElement('canvas')
  c.width   = c.height = sz
  const ctx = c.getContext('2d')

  // Glow halo
  const halo = ctx.createRadialGradient(cx, cy, sz * 0.05, cx, cy, sz * 0.5)
  halo.addColorStop(0,   'rgba(0, 229, 255, 0.6)')
  halo.addColorStop(0.4, 'rgba(0, 229, 255, 0.15)')
  halo.addColorStop(1,   'rgba(0, 229, 255, 0)')
  ctx.fillStyle = halo
  ctx.beginPath(); ctx.arc(cx, cy, sz * 0.5, 0, Math.PI * 2); ctx.fill()

  // Bright center dot
  ctx.fillStyle = '#00e5ff'
  ctx.beginPath(); ctx.arc(cx, cy, sz * 0.09, 0, Math.PI * 2); ctx.fill()

  return new CanvasTexture(c)
}

// Atmosphere rim-glow shader
function makeAtmosphere() {
  const mat = new ShaderMaterial({
    side: FrontSide,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      void main() {
        float rim  = 1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
        float glow = pow(rim, 2.8) * 1.6;
        gl_FragColor = vec4(0.18, 0.52, 1.0, glow);
      }
    `,
  })
  const mesh = new Mesh(new SphereGeometry(EARTH_R, 64, 64), mat)
  mesh.scale.setScalar(ATM_SCALE)
  return mesh
}

// ── Stable-slot incremental sync ─────────────────────────────────────────────
// Entities get a permanent slot in their InstancedMesh. On each data update
// we only touch slots that actually changed; departed entities are zero-scaled
// and their slot is returned to a free-list for reuse. This avoids rebuilding
// all 12 000+ matrices from scratch every 5 seconds.
//
// state.catAlloc  – per-category slot allocators (persistent)
// state.idToInstance – Map<id, {mesh,index,cat,pos,lat,lon,hdg}> (persistent)

function meshForCat(state, cat) {
  if (cat === 'helicopter') return state.heliMesh
  if (cat === 'satellite')  return state.satMesh
  if (cat === 'ship')       return state.shipMesh
  if (cat === 'heavy')      return state.heavyMesh
  if (cat === 'regional')   return state.regionalMesh
  return state.planeMesh
}

function allocForCat(state, cat) {
  return state.catAlloc[cat === 'helicopter' ? 'helicopter'
                       : cat === 'satellite'  ? 'satellite'
                       : cat === 'ship'       ? 'ship'
                       : cat === 'heavy'      ? 'heavy'
                       : cat === 'regional'   ? 'regional'
                       : 'plane']
}

function buildMatrix(a, cat, planeScale) {
  // Planes and ships sit on a single thin layer just above the tile
  // surface. Real altitude (10+ km) looks correct in isolation but
  // creates parallax that makes a plane over an airport appear to be
  // in a different place when you rotate the Earth in 3D. Anchoring
  // them to the surface makes (lat, lon) the visual ground truth.
  // Satellites are the only category that keeps real altitude.
  let r
  if (cat === 'satellite') {
    r = EARTH_R + (a.alt_km ?? 400) / 6371
  } else {
    r = AC_R   // planes and ships sit on this layer
  }

  const pos = ll2v(a.lat, a.lon, r)

  _normal.copy(pos).normalize()
  _right.crossVectors(_worldUp, _normal)
  if (_right.lengthSq() < 0.0001) _right.set(1, 0, 0)
  _right.normalize()
  _north.crossVectors(_normal, _right).normalize()

  const headRad = (a.hdg ?? a.heading ?? a.trk ?? a.cog ?? 0) * (Math.PI / 180)
  _forward.set(0, 0, 0)
    .addScaledVector(_north, Math.cos(headRad))
    .addScaledVector(_right, Math.sin(headRad))
    .normalize()
  _xAxis.crossVectors(_forward, _normal).normalize()

  let ps = planeScale
  if (cat === 'satellite') ps *= 0.65
  else if (cat === 'ship') ps *= 0.85

  const e = _rotMat.elements
  e[0]=_xAxis.x*ps;  e[1]=_xAxis.y*ps;  e[2]=_xAxis.z*ps;  e[3]=0
  e[4]=_forward.x*ps; e[5]=_forward.y*ps; e[6]=_forward.z*ps; e[7]=0
  e[8]=_normal.x*ps;  e[9]=_normal.y*ps;  e[10]=_normal.z*ps;  e[11]=0
  e[12]=pos.x;        e[13]=pos.y;        e[14]=pos.z;         e[15]=1
  return pos  // _rotMat is module-level scratch — use immediately
}

function syncInstances(state, aircraft, selectedId, hoveredId, forceScale) {
  const { planeMesh, heliMesh, satMesh, shipMesh, heavyMesh, regionalMesh, acGeo, acPos } = state
  if (!planeMesh || !acGeo || !aircraft) return

  // Initialise persistent allocators on first call
  if (!state.catAlloc) {
    state.catAlloc    = {
      plane:      { nextSlot: 0, freeSlots: [] },
      helicopter: { nextSlot: 0, freeSlots: [] },
      satellite:  { nextSlot: 0, freeSlots: [] },
      ship:       { nextSlot: 0, freeSlots: [] },
      heavy:      { nextSlot: 0, freeSlots: [] },
      regional:   { nextSlot: 0, freeSlots: [] },
    }
    state.idToInstance  = new Map()
    state.pickIdToAcId  = new Map()
  }

  const { idToInstance, catAlloc } = state
  const planeScale = state.planeScale || 0.02
  const meshDirty  = new Set()
  state.selPos     = null
  state.issPos     = null

  // ── 1. Add new entities / update existing ones ───────────────────────────
  for (const [id, a] of aircraft) {
    const baseCat = a.cat || 'plane'
    // For planes, sub-classify by ICAO type code into heavy/regional/plane
    const cat  = baseCat === 'plane' ? planeSize(a.t ?? a.type ?? '') : baseCat
    const mesh = meshForCat(state, cat)
    if (!mesh) continue

    let inst = idToInstance.get(id)

    // ── Category changed (plane reclassified as helicopter, etc.) ──────────
    if (inst && inst.cat !== cat) {
      const oldMesh  = meshForCat(state, inst.cat)
      const oldAlloc = allocForCat(state, inst.cat)
      oldMesh.setMatrixAt(inst.index, _zeroMat)
      oldAlloc.freeSlots.push(inst.index)
      meshDirty.add(oldMesh)
      inst = null
    }

    // ── New entity: allocate a stable slot ─────────────────────────────────
    if (!inst) {
      const alloc = allocForCat(state, cat)
      // Hard cap: never exceed the InstancedMesh buffer size
      if (alloc.freeSlots.length === 0 && alloc.nextSlot >= MAX_AC) continue
      const slot  = alloc.freeSlots.length ? alloc.freeSlots.pop() : alloc.nextSlot++
      inst = { mesh, index: slot, cat, pos: null, lat: null, lon: null, hdg: null, pickId: 0 }
      idToInstance.set(id, inst)
      // Set display color
      const sel = id === selectedId, hov = id === hoveredId && !sel
      mesh.setColorAt(slot, sel ? _colSelected : hov ? _colHover : defaultColor(cat))
      meshDirty.add(mesh)
      // Set GPU pick color: encode (catIndex * MAX_AC + slot + 1) into RGB
      // +1 so that pickId=0 (black) is always "no hit / background"
      const pickMesh = state.pickMeshes?.[cat]
      if (pickMesh) {
        const pickId = PICK_CAT_ORDER.indexOf(cat) * MAX_AC + slot + 1
        _pickColor.setRGB(((pickId >> 16) & 255) / 255, ((pickId >> 8) & 255) / 255, (pickId & 255) / 255)
        pickMesh.setColorAt(slot, _pickColor)
        meshDirty.add(pickMesh)
        state.pickIdToAcId?.set(pickId, id)
        inst.pickId = pickId
      }
    }

    // ── Isolation: when tracking, hide all aircraft except the tracked one ──
    const isolating = state.trackingId != null
    if (isolating && id !== state.trackingId) {
      if (inst.lat !== null) {
        mesh.setMatrixAt(inst.index, _zeroMat)
        inst.pos = null; inst.lat = null; inst.lon = null; inst.hdg = null
        meshDirty.add(mesh)
      }
      continue
    }

    // ── Skip matrix recomputation if position/heading unchanged ─────────────
    const headDeg = a.hdg ?? a.heading ?? a.trk ?? a.cog ?? 0
    const moved = forceScale
      || inst.lat  === null
      || Math.abs(a.lat  - inst.lat)  > 0.00015   // ~17 m
      || Math.abs(a.lon  - inst.lon)  > 0.00015
      || Math.abs(headDeg - inst.hdg) > 1.5        // degrees

    if (moved) {
      const pos = buildMatrix(a, cat, planeScale)
      mesh.setMatrixAt(inst.index, _rotMat)
      inst.pos = pos; inst.lat = a.lat; inst.lon = a.lon; inst.hdg = headDeg
      meshDirty.add(mesh)
    }

    if (id === selectedId && inst.pos) state.selPos = inst.pos

    // Track ISS position for the special blinking overlay
    // JSON field for callsign is "cs" (short payload key), also match by id
    if (inst.pos && (a.cs?.toUpperCase() === 'ISS' || id?.toUpperCase() === 'ISS' || id === 'demo_iss')) {
      state.issPos = inst.pos
    }
  }

  // ── 2. Remove departed entities ──────────────────────────────────────────
  for (const [id, inst] of idToInstance) {
    if (!aircraft.has(id)) {
      inst.mesh.setMatrixAt(inst.index, _zeroMat)
      allocForCat(state, inst.cat).freeSlots.push(inst.index)
      meshDirty.add(inst.mesh)
      if (inst.pickId) state.pickIdToAcId?.delete(inst.pickId)
      idToInstance.delete(id)
    }
  }

  // ── 3. Flush dirty mesh buffers ──────────────────────────────────────────
  const flush = (mesh, alloc) => {
    if (!mesh || !alloc) return
    mesh.count = alloc.nextSlot
    if (meshDirty.has(mesh)) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }
  flush(planeMesh,    catAlloc.plane)
  flush(heavyMesh,    catAlloc.heavy)
  flush(regionalMesh, catAlloc.regional)
  flush(heliMesh,     catAlloc.helicopter)
  flush(satMesh,      catAlloc.satellite)
  flush(shipMesh,     catAlloc.ship)

  // Sync pick mesh counts + flush pick colors
  if (state.pickMeshes) {
    for (const cat of PICK_CAT_ORDER) {
      const pm    = state.pickMeshes[cat]
      const alloc = allocForCat(state, cat)
      if (!pm || !alloc) continue
      pm.count = alloc.nextSlot
      if (meshDirty.has(pm) && pm.instanceColor) pm.instanceColor.needsUpdate = true
    }
  }

  // ── 4. Rebuild compact raycasting buffer (always — positions changed) ────
  const ids = []
  let ai = 0
  for (const [id, inst] of idToInstance) {
    if (ai >= MAX_AC || !inst.pos) continue
    acPos[ai * 3]     = inst.pos.x
    acPos[ai * 3 + 1] = inst.pos.y
    acPos[ai * 3 + 2] = inst.pos.z
    ids.push(id)
    ai++
  }
  state.acIds = ids
  acGeo.setDrawRange(0, ai)
  acGeo.attributes.position.needsUpdate = true

  // ── 5. Keep hover/selection ring positions in sync ───────────────────────
  if (state.hoveredId) {
    const inst = idToInstance.get(state.hoveredId)
    if (inst) state.hoverPos = inst.pos
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export const Globe = forwardRef(function Globe({ aircraft, selectedId, onAircraftClick, onAirportClick, onViewportChange, trackingId, solarData, padMarker, onInteract, onPlanetClick, onSkyObjectClick, onMoonSiteClick, neoData, onZoomChange, mobilePanel, onScaleReady, showWeather }, ref) {
  const mountRef    = useRef(null)
  const int         = useRef({})
  const trailHist   = useRef(new Map())
  const apiTrailRef = useRef(null)
  const [mapStyle, setMapStyle] = useState('satellite')
  const mapStyleRef = useRef('satellite')
  const [cameraInfo, setCameraInfo] = useState({ altM: null, scaleLabel: '', scaleBarPx: 80 })
  const [cameraScale, setCameraScale] = useState('earth')   // 'earth' | 'solar'
  const [moonTransit, setMoonTransit] = useState(false)  // warp overlay during Moon flight
  const [hoverTooltip, setHoverTooltip] = useState(null)  // { x, y, data }
  const galaxyHeadingRef = useRef(null)   // { ra, dec } — updated per frame in galaxy mode
  const setHoverTooltipRef = useRef(null)
  setHoverTooltipRef.current = setHoverTooltip

  // Store last trail args so we can redraw on zoom change
  const lastTrailArgs = useRef(null)

  // ── API trail: draw departure→current path from detail panel ──────────────
  // routeData: { dep_lat, dep_lon, arr_lat, arr_lon, ... } from route API
  const drawTrail = useCallback((points, routeData) => {
    lastTrailArgs.current = (points?.length || routeData) ? { points, routeData } : null
    const { scene } = int.current
    if (!scene) return

    // Clean up previous trail objects
    if (apiTrailRef.current) {
      apiTrailRef.current.forEach(obj => {
        scene.remove(obj)
        obj.geometry?.dispose()
        obj.material?.dispose()
      })
      apiTrailRef.current = null
    }
    if (!points?.length && !routeData) return

    // ── Build full path: departure airport → DB trail → arrival airport ──
    const fullPath = []
    if (routeData?.dep_lat != null) {
      fullPath.push({ latitude: routeData.dep_lat, longitude: routeData.dep_lon })
    }
    if (points?.length) {
      for (const p of points) fullPath.push(p)
    }
    if (routeData?.arr_lat != null) {
      fullPath.push({ latitude: routeData.arr_lat, longitude: routeData.arr_lon })
    }
    if (fullPath.length < 2) return

    const objects = []
    const TRAIL_R_API = AC_R  // match the plane placement layer exactly

    // ── Split path into "traveled" (dep → last trail point) and "remaining" (→ arr) ──
    // Traveled = dep airport + DB trail points, Remaining = last trail point → arr airport
    const traveledPath = []
    const remainingPath = []

    if (routeData?.dep_lat != null) {
      traveledPath.push({ latitude: routeData.dep_lat, longitude: routeData.dep_lon })
    }
    if (points?.length) {
      for (const p of points) traveledPath.push(p)
    }
    // Remaining starts from last traveled point to arrival
    if (traveledPath.length > 0 && routeData?.arr_lat != null) {
      const lastTraveled = traveledPath[traveledPath.length - 1]
      remainingPath.push(lastTraveled)
      remainingPath.push({ latitude: routeData.arr_lat, longitude: routeData.arr_lon })
    }

    // Trail tube = 1/4 of plane size, always proportional.
    const ps = int.current.planeScale || 0.005
    const tubeRadius   = ps * 0.25
    const markerRadius = ps * 0.5

    const makeTube = (path, color, opacity, radiusMul, order) => {
      const gc = greatCirclePoints(path, TRAIL_R_API)
      if (gc.length < 2) return
      const c = new CatmullRomCurve3(gc, false, 'centripetal')
      const geo = new TubeGeometry(c, Math.min(gc.length, 300), tubeRadius * radiusMul, 6, false)
      const mat = new MeshBasicMaterial({
        color, depthTest: false, depthWrite: false,
        transparent: true, opacity, side: DoubleSide,
      })
      const mesh = new Mesh(geo, mat)
      mesh.renderOrder = order
      scene.add(mesh)
      objects.push(mesh)
    }

    // Traveled portion — solid bright green (already flown)
    if (traveledPath.length >= 2) {
      makeTube(traveledPath, 0x00e676, 0.85, 1.0, 20)
    }
    // Remaining portion — dim orange (yet to fly)
    if (remainingPath.length >= 2) {
      makeTube(remainingPath, 0xff9800, 0.3, 0.75, 19)
    }

    // ── Airport markers: dots at route API coords, scaled with zoom ──
    const addMarker = (lat, lon, color) => {
      const pos = ll2v(lat, lon, TRAIL_R_API + 0.0001)
      const sg = new SphereGeometry(markerRadius, 12, 8)
      const sm = new MeshBasicMaterial({
        color, depthTest: false, depthWrite: false,
        transparent: true, opacity: 0.9,
      })
      const sMesh = new Mesh(sg, sm)
      sMesh.position.copy(pos)
      sMesh.renderOrder = 22
      scene.add(sMesh)
      objects.push(sMesh)
    }

    // Departure (green dot)
    const depLat = routeData?.dep_lat ?? fullPath[0].latitude
    const depLon = routeData?.dep_lon ?? fullPath[0].longitude
    addMarker(depLat, depLon, 0x22ff88)

    // Arrival (orange dot)
    const arrLat = routeData?.arr_lat ?? fullPath[fullPath.length - 1].latitude
    const arrLon = routeData?.arr_lon ?? fullPath[fullPath.length - 1].longitude
    addMarker(arrLat, arrLon, 0xff6622)

    apiTrailRef.current = objects
    int.current.trailEndpoints = {
      first: { latitude: depLat, longitude: depLon },
      last:  { latitude: arrLat, longitude: arrLon },
    }
  }, [])

  // Store drawTrail on int.current so the animation loop can redraw on zoom
  useEffect(() => { int.current._drawTrail = drawTrail }, [drawTrail])

  useImperativeHandle(ref, () => ({
    drawTrail,
    setCameraScale: (scale) => {
      setCameraScale(scale)
      int.current.targetCameraScale = scale
    },
    flyTo: (lat, lon) => {
      if (!int.current?.camera) return
      const camera = int.current.camera
      const d = camera.position.length()
      int.current.flyToTarget = ll2v(lat, lon, EARTH_R).normalize().multiplyScalar(d)
      int.current.flyToStart  = Date.now()
      int.current.flyToFrom   = camera.position.clone()
    },
    fitRoute: (routeData) => {
      if (!int.current?.camera) return
      const camera = int.current.camera
      const ep = int.current.trailEndpoints

      // Determine departure and arrival points:
      // Priority: route API coords > trail endpoints
      let depLat, depLon, arrLat, arrLon
      if (routeData?.dep_lat != null && routeData?.arr_lat != null) {
        depLat = routeData.dep_lat; depLon = routeData.dep_lon
        arrLat = routeData.arr_lat; arrLon = routeData.arr_lon
      } else if (routeData?.dep_lat != null && ep?.last) {
        depLat = routeData.dep_lat; depLon = routeData.dep_lon
        arrLat = ep.last.latitude; arrLon = ep.last.longitude
      } else if (ep) {
        depLat = ep.first.latitude; depLon = ep.first.longitude
        arrLat = ep.last.latitude;  arrLon = ep.last.longitude
      } else {
        return
      }

      const v0 = ll2v(depLat, depLon, EARTH_R).normalize()
      const v1 = ll2v(arrLat, arrLon, EARTH_R).normalize()
      const mid = new Vector3().addVectors(v0, v1).normalize()
      const angDist = Math.acos(MathUtils.clamp(v0.dot(v1), -1, 1))
      const halfFov = 20 * (Math.PI / 180)
      const padding = 0.15
      const halfSpan = Math.min(angDist / 2 + padding, Math.PI / 2 - 0.1)
      const targetDist = EARTH_R * (1 + Math.sin(halfSpan) / Math.sin(halfFov))
      const d = MathUtils.clamp(targetDist, 1.08, 4.0)
      const target = mid.multiplyScalar(d)
      // On mobile with panel, offset so route appears in visible area above card
      if (int.current.mobilePanel && window.innerWidth < 768) {
        const camDir = target.clone().normalize()
        const up = new Vector3(0, 1, 0)
        const right = new Vector3().crossVectors(camDir, up).normalize()
        const screenUp = new Vector3().crossVectors(right, camDir).normalize()
        target.addScaledVector(screenUp, -0.15 * (d - EARTH_R))
        target.normalize().multiplyScalar(d)
      }
      int.current.flyToTarget = target
      int.current.flyToStart  = Date.now()
      int.current.flyToFrom   = camera.position.clone()
    },
    enableAR: async () => {
      try { await arController.enable(); return true }
      catch { return false }
    },
    disableAR: () => arController.disable(),
    isARSupported: () => arController.isMobile() && arController.isSupported(),
    flyToPlanet: (name) => {
      const { camera, solarSystem } = int.current
      if (!camera || !solarSystem) return
      const mesh = solarSystem.planetMeshes[name]
      if (!mesh) return
      // Target: planet position + slight offset so planet fills ~1/3 of view
      const planetPos = mesh.position.clone()
      const r = mesh.geometry.boundingSphere?.radius ?? 300
      const dist = r * 6
      // Approach from current camera direction projected onto XZ plane
      const dir = new Vector3(planetPos.x, 0, planetPos.z).normalize()
      int.current.solarFlyTarget = planetPos.clone().add(dir.multiplyScalar(dist))
      int.current.solarFlyStart  = Date.now()
      int.current.solarFlyFrom   = camera.position.clone()
    },
    setMoonFilter: (filter) => {
      int.current.moonScene?.setFilter(filter)
    },
    flyToMoonSite: (siteId) => {
      if (!int.current?.camera || !int.current?.moonScene) return
      const target = int.current.moonScene.flyToSite(siteId)
      if (!target) return
      int.current.flyToTarget = target
      int.current.flyToStart  = Date.now()
      int.current.flyToFrom   = int.current.camera.position.clone()
    },
    flyToGalaxy: (ra, dec, z) => {
      if (!int.current?.camera) return
      const camera = int.current.camera
      const radius = zToRadius(z || 0.01)
      const [gx, gy, gz] = raDecToXYZ(ra, dec, radius)
      const galaxyPos = new Vector3(gx, gy, gz)
      // Position camera slightly inside the galaxy's radius, looking outward
      // so the galaxy is centered in view. Camera at 92% of radius along
      // the same direction means galaxy is just ahead.
      const dir = galaxyPos.clone().normalize()
      const approachDist = Math.max(radius * 0.92, radius - 5)
      const target = dir.multiplyScalar(approachDist)
      int.current.flyToTarget = target
      int.current.flyToStart  = Date.now()
      int.current.flyToFrom   = camera.position.clone()
    },
    setDistanceRange: (minZ, maxZ) => {
      int.current.desiLayer?.setDistanceRange?.(minZ, maxZ)
    },
  }), [drawTrail, setCameraScale])

  // Sync click callbacks into int.current so native event closures can read them
  useEffect(() => { int.current.onPlanetClick = onPlanetClick }, [onPlanetClick])
  useEffect(() => { int.current.onAirportClick = onAirportClick }, [onAirportClick])
  useEffect(() => { int.current.onSkyObjectClick = onSkyObjectClick }, [onSkyObjectClick])
  useEffect(() => { int.current.onMoonSiteClick = onMoonSiteClick }, [onMoonSiteClick])
  useEffect(() => { int.current.onScaleReady = onScaleReady }, [onScaleReady])

  // Push NEO asteroid data into the solar scene whenever it arrives
  useEffect(() => {
    if (neoData?.length) int.current.solarSystem?.updateNEOs(neoData)
  }, [neoData])

  // ── Three.js init ──────────────────────────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current
    if (!el) return

    const renderer = new WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.setClearColor(0x0f1419)
    el.appendChild(renderer.domElement)

    const scene  = new Scene()
    // near is set dynamically in the tick loop based on altitude; start conservatively small
    const camera = new PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.0001, 200)
    camera.position.set(0, 0, 2.8)

    const controls           = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping   = true
    controls.dampingFactor   = 0.30   // higher = stops faster = rigid feel
    controls.enablePan       = false
    controls.minDistance     = 1.00002   // ~127 m altitude → zoom 18 tiles (~0.6 m/px)
    controls.maxDistance     = 8
    controls.zoomSpeed       = 0.7       // applies to both mouse wheel and trackpad pinch
    controls.autoRotate      = true
    controls.autoRotateSpeed = 0.18
    renderer.domElement.addEventListener('pointerdown', () => {
      controls.autoRotate = false
      int.current.onInteract?.()
      // On mobile, pause tracking lock for 3s so user can pan freely
      if (int.current.trackingId && window.innerWidth < 768) {
        int.current.trackPausedUntil = Date.now() + 3000
      }
    })
    renderer.domElement.addEventListener('wheel', () => { int.current.onInteract?.() }, { passive: true })

    // Galaxy FOV zoom — scroll/pinch changes field of view for sky zoom
    const galaxyWheel = (e) => {
      if (int.current.targetCameraScale !== 'galaxy') return
      e.preventDefault()
      const delta = e.deltaY > 0 ? 2 : -2
      camera.fov = Math.max(10, Math.min(75, camera.fov + delta))
      camera.updateProjectionMatrix()
    }
    renderer.domElement.addEventListener('wheel', galaxyWheel, { passive: false })

    // Touch pinch → FOV zoom in galaxy mode
    let _pinchDist = 0
    const galaxyTouchStart = (e) => {
      if (int.current.targetCameraScale !== 'galaxy' || e.touches.length !== 2) return
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      _pinchDist = Math.sqrt(dx * dx + dy * dy)
    }
    const galaxyTouchMove = (e) => {
      if (int.current.targetCameraScale !== 'galaxy' || e.touches.length !== 2 || !_pinchDist) return
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const delta = (_pinchDist - dist) * 0.12
      camera.fov = Math.max(10, Math.min(75, camera.fov + delta))
      camera.updateProjectionMatrix()
      _pinchDist = dist
    }
    const galaxyTouchEnd = () => { _pinchDist = 0 }
    renderer.domElement.addEventListener('touchstart', galaxyTouchStart, { passive: true })
    renderer.domElement.addEventListener('touchmove', galaxyTouchMove, { passive: true })
    renderer.domElement.addEventListener('touchend', galaxyTouchEnd, { passive: true })

    // ── Viewport bounds → backend filtering ──────────────────────────
    // Sends lat/lon bounding box to the parent so the backend only streams
    // entities within the current view, preventing InstancedMesh overflow.
    // At global zoom (dist > 1.8) we always send the full globe so nothing
    // is missed.  At street zoom we tighten to the visible patch.
    let lastBoundsEmit = 0
    const GLOBAL_BOUNDS = { ne: { lat: 90, lng: 180 }, sw: { lat: -90, lng: -180 } }
    const emitBounds = () => {
      const now = Date.now()
      if (now - lastBoundsEmit < 2000) return   // throttle: once per 2 s
      lastBoundsEmit = now
      const camPos = camera.position
      const dist   = camPos.length()
      // At global view show everything
      if (dist > 1.8) {
        int.current.onViewportChange?.(GLOBAL_BOUNDS)
        return
      }
      // Zoomed in: compute centre lat/lon using the same convention as v2ll,
      // then normalize longitude to [-180, 180] so the backend bbox filter
      // (which compares against real aircraft longitudes in that range) works
      // for users viewing any region, not just the Americas.
      const latC    = Math.asin(MathUtils.clamp(camPos.y / dist, -1, 1)) * (180 / Math.PI)
      const lonRaw  = Math.atan2(camPos.z, -camPos.x) * (180 / Math.PI) - 180
      const lonC    = ((lonRaw + 180) % 360 + 360) % 360 - 180
      // Half-span shrinks linearly as we zoom in
      const span = 15 + (dist - 1) * 55   // ~70° at dist=2.2, ~15° at dist=1.0
      // If the bbox crosses the antimeridian, fall back to global bounds —
      // the backend filter doesn't handle wrap, and a wrong bbox means zero
      // aircraft for the user instead of too many.
      if (lonC + span > 180 || lonC - span < -180) {
        int.current.onViewportChange?.(GLOBAL_BOUNDS)
        return
      }
      const ne = { lat: Math.min( 90, latC + span), lng: lonC + span }
      const sw = { lat: Math.max(-90, latC - span), lng: lonC - span }
      int.current.onViewportChange?.({ ne, sw })
    }
    controls.addEventListener('change', emitBounds)
    // Emit global bounds immediately so the first snapshot isn't empty
    setTimeout(() => int.current.onViewportChange?.(GLOBAL_BOUNDS), 500)

    // ── Stars ────────────────────────────────────────────────────────
    const sb = new Float32Array(15000 * 3)
    for (let i = 0; i < 15000; i++) {
      const u = Math.random(), v = Math.random()
      const t = 2 * Math.PI * u, p = Math.acos(2 * v - 1)
      const r = 80 + Math.random() * 40
      sb[i * 3]     = r * Math.sin(p) * Math.cos(t)
      sb[i * 3 + 1] = r * Math.cos(p)
      sb[i * 3 + 2] = r * Math.sin(p) * Math.sin(t)
    }
    const sg = new BufferGeometry()
    sg.setAttribute('position', new BufferAttribute(sb, 3))
    scene.add(new Points(sg, new PointsMaterial({
      color: 0xffffff, size: 0.1, transparent: true, opacity: 0.65,
    })))

    // ── Lights ───────────────────────────────────────────────────────
    scene.add(new AmbientLight(0xffffff, 0.12))
    const sun = new DirectionalLight(0xffffff, 1.6)
    sun.position.copy(solarDirection()).multiplyScalar(10)
    scene.add(sun)

    // ── Earth ─────────────────────────────────────────────────────────
    const loader   = new TextureLoader()
    const earthGeo = new SphereGeometry(EARTH_R, 96, 96)
    const earthMat = new MeshStandardMaterial({
      color: 0x1a5276, roughness: 0.75, metalness: 0.05,   // mid-ocean blue fallback
    })
    const earth = new Mesh(earthGeo, earthMat)
    earth.name = 'earthMesh'
    scene.add(earth)

    loader.load(
      'https://cdn.jsdelivr.net/npm/three-globe@2.31.3/example/img/earth-blue-marble.jpg',
      tex => {
        tex.anisotropy      = renderer.capabilities.getMaxAnisotropy()
        tex.minFilter       = LinearMipmapLinearFilter
        tex.magFilter       = LinearFilter
        tex.generateMipmaps = true
        earthMat.map        = tex
        earthMat.color.set(0xffffff)
        earthMat.needsUpdate = true
      },
    )
    loader.load(
      'https://cdn.jsdelivr.net/npm/three-globe@2.31.3/example/img/earth-topology.png',
      tex => { earthMat.bumpMap = tex; earthMat.bumpScale = 0.004; earthMat.needsUpdate = true },
    )

    // ── Clouds ───────────────────────────────────────────────────────
    const cloudMat = new MeshPhongMaterial({ transparent: true, opacity: 0.18, depthWrite: false })
    loader.load(
      '/earth-clouds.jpg',
      tex => { cloudMat.alphaMap = tex; cloudMat.map = tex; cloudMat.needsUpdate = true },
    )
    const clouds = new Mesh(new SphereGeometry(CLOUD_R, 64, 64), cloudMat)
    scene.add(clouds)

    // ── Wind layer (Windy-style particle flow) ───────────────────────
    const windLayer = createWindLayer(scene)

    // ── Atmosphere ───────────────────────────────────────────────────
    scene.add(makeAtmosphere())


    // ── Aircraft planes (InstancedMesh for display) ───────────────────
    const planeTex  = buildPlaneTex()
    const planeGeo  = new PlaneGeometry(1, 1)
    const planeMat  = new MeshBasicMaterial({
      map:         planeTex,
      transparent: true,
      alphaTest:   0.05,
      side:        DoubleSide,   // visible regardless of orientation
      depthWrite:  false,
    })
    const planeMesh = new InstancedMesh(planeGeo, planeMat, MAX_AC)
    planeMesh.count         = 0
    planeMesh.renderOrder   = 2
    planeMesh.frustumCulled = false  // instances are worldwide; skip bbox check
    scene.add(planeMesh)

    // ── Heavy widebody InstancedMesh ─────────────────────────────────
    const heavyTex  = buildHeavyPlaneTex()
    const heavyMesh = new InstancedMesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({ map: heavyTex, transparent: true, alphaTest: 0.05, side: DoubleSide, depthWrite: false }),
      MAX_AC,
    )
    heavyMesh.count = 0; heavyMesh.renderOrder = 2; heavyMesh.frustumCulled = false
    scene.add(heavyMesh)

    // ── Regional jet InstancedMesh ────────────────────────────────────
    const regionalTex  = buildRegionalPlaneTex()
    const regionalMesh = new InstancedMesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({ map: regionalTex, transparent: true, alphaTest: 0.05, side: DoubleSide, depthWrite: false }),
      MAX_AC,
    )
    regionalMesh.count = 0; regionalMesh.renderOrder = 2; regionalMesh.frustumCulled = false
    scene.add(regionalMesh)

    // ── Helicopter InstancedMesh ──────────────────────────────────────
    const heliTex  = buildHelicopterTex()
    const heliMesh = new InstancedMesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({ map: heliTex, transparent: true, alphaTest: 0.05, side: DoubleSide, depthWrite: false }),
      MAX_AC,
    )
    heliMesh.count = 0; heliMesh.renderOrder = 2; heliMesh.frustumCulled = false
    scene.add(heliMesh)

    // ── Satellite InstancedMesh ───────────────────────────────────────
    const satTex  = buildSatelliteTex()
    const satMesh = new InstancedMesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({ map: satTex, transparent: true, alphaTest: 0.05, side: DoubleSide, depthWrite: false }),
      MAX_AC,
    )
    satMesh.count = 0; satMesh.renderOrder = 2; satMesh.frustumCulled = false
    scene.add(satMesh)

    // ── Ship InstancedMesh ────────────────────────────────────────────
    const shipTex  = buildShipTex()
    const shipMesh = new InstancedMesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({
        map: shipTex, transparent: true, alphaTest: 0.05, side: DoubleSide,
        depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      }),
      MAX_AC,
    )
    shipMesh.count = 0; shipMesh.renderOrder = 2; shipMesh.frustumCulled = false
    scene.add(shipMesh)

    // ── Earth-bound entity visibility gate ─────────────────────────────
    // All live aircraft / satellite / ship instances + their trails belong
    // to Earth scale. Hide them whenever camera is on Moon / Solar / Galaxy
    // scale to prevent planes from appearing on the Moon's surface.
    const _setEarthEntitiesVisible = (v) => {
      planeMesh.visible    = v
      heavyMesh.visible    = v
      regionalMesh.visible = v
      heliMesh.visible     = v
      satMesh.visible      = v
      shipMesh.visible     = v
      // Trails (created later) — set via int.current
      if (int.current?.trailMesh)     int.current.trailMesh.visible     = v
      if (int.current?.trailGlowMesh) int.current.trailGlowMesh.visible = v
      if (int.current?.windLayer)     { if (v && int.current._showWeather) int.current.windLayer.show(); else int.current.windLayer.hide() }
      // Selection ring + API trail also belong to Earth
      if (int.current?.ringMesh)      int.current.ringMesh.visible      = v
    }

    // ── GPU color pick system ─────────────────────────────────────────
    // A separate pickScene holds 6 shadow InstancedMeshes that SHARE the
    // same instanceMatrix buffers as the display meshes (zero copy).
    // Each instance gets a unique RGB color encoding (catIdx * MAX_AC + slot + 1).
    // On click when zoomed in: render pickScene → sample 1 pixel → decode ID.
    const pickMat   = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide })
    const pickScene = new Scene()
    const _mkPickMesh = (displayMesh) => {
      const pm = new InstancedMesh(new PlaneGeometry(1.8, 1.8), pickMat, MAX_AC)
      pm.instanceMatrix = displayMesh.instanceMatrix   // share transform data
      pm.instanceColor  = new InstancedBufferAttribute(new Float32Array(MAX_AC * 3), 3)
      pm.count = 0; pm.frustumCulled = false
      pickScene.add(pm)
      return pm
    }
    const pickMeshes = {
      plane:      _mkPickMesh(planeMesh),
      heavy:      _mkPickMesh(heavyMesh),
      regional:   _mkPickMesh(regionalMesh),
      helicopter: _mkPickMesh(heliMesh),
      satellite:  _mkPickMesh(satMesh),
      ship:       _mkPickMesh(shipMesh),
    }
    const _dpr = renderer.getPixelRatio()
    const pickTarget = new WebGLRenderTarget(Math.floor(el.clientWidth * _dpr), Math.floor(el.clientHeight * _dpr))

    // ── Solar system ──────────────────────────────────────────────────
    // Hidden by default; shown when cameraScale transitions to 'solar'.
    const solarSystem = createSolarSystem(scene, renderer)

    // Hidden by default; shown when cameraScale transitions to 'galaxy'.
    const galaxySystem = createNightSkyScene(scene)

    // DESI galaxy layer — 100K real galaxies/quasars, shown in galaxy mode.
    const desiLayer = createDESILayer()
    int.current.desiLayer = desiLayer
    scene.add(desiLayer.group)

    // Hidden by default; shown when cameraScale transitions to 'moon'.
    const moonScene = createMoonScene(scene)

    // AR controller for night sky — device orientation-driven camera
    const arController = createDeviceOrientationAR(camera, controls)

    // ── Hidden Points layer (invisible, used only for raycasting) ─────
    // PointsMaterial threshold-based picking is O(n) and very fast.
    const acPos = new Float32Array(MAX_AC * 3)
    const acGeo = new BufferGeometry()
    acGeo.setAttribute('position', new BufferAttribute(acPos, 3).setUsage(DynamicDrawUsage))
    acGeo.setDrawRange(0, 0)
    const acMat = new PointsMaterial({
      size: 8, sizeAttenuation: false,
      transparent: true, opacity: 0,   // visually invisible
      alphaTest: 0, depthWrite: false,
    })
    const acPts = new Points(acGeo, acMat)
    acPts.renderOrder = 2
    scene.add(acPts)

    // ── Selection ring ────────────────────────────────────────────────
    const ringTex = buildRingTex()
    const ringGeo = new BufferGeometry()
    ringGeo.setAttribute('position', new BufferAttribute(new Float32Array(3), 3))
    const ringMat = new PointsMaterial({
      size: 26, sizeAttenuation: false,
      map: ringTex, transparent: true, alphaTest: 0.005,
      opacity: 0, depthWrite: false,
      blending: AdditiveBlending, color: 0x50b4ff,
    })
    const ringPts = new Points(ringGeo, ringMat)
    ringPts.renderOrder = 6
    scene.add(ringPts)

    // ── Hover ring ────────────────────────────────────────────────────
    const hoverRingTex = buildHoverRingTex()
    const hoverRingGeo = new BufferGeometry()
    hoverRingGeo.setAttribute('position', new BufferAttribute(new Float32Array(3), 3))
    const hoverRingMat = new PointsMaterial({
      size: 28, sizeAttenuation: false,
      map: hoverRingTex, transparent: true, alphaTest: 0.005,
      opacity: 0, depthWrite: false,
      blending: AdditiveBlending, color: 0xffd700,
    })
    const hoverRingPts = new Points(hoverRingGeo, hoverRingMat)
    hoverRingPts.renderOrder = 5
    scene.add(hoverRingPts)

    // ── ISS special blinking overlay ──────────────────────────────────
    const issTex = buildIssTex()
    const issGeo = new BufferGeometry()
    issGeo.setAttribute('position', new BufferAttribute(new Float32Array(3), 3))
    issGeo.setDrawRange(0, 0)
    const issMat = new PointsMaterial({
      size: 30, sizeAttenuation: false,
      map: issTex, transparent: true, alphaTest: 0.01,
      opacity: 1, depthWrite: false,
      blending: AdditiveBlending,
    })
    const issPts = new Points(issGeo, issMat)
    issPts.renderOrder = 8
    scene.add(issPts)

    // ── Launch pad neon crosshair marker ──────────────────────────────
    const padGeo = new BufferGeometry()
    padGeo.setAttribute('position', new BufferAttribute(new Float32Array(3), 3))
    padGeo.setDrawRange(0, 0)
    const padMat = new PointsMaterial({
      size: 48, sizeAttenuation: false,
      map: buildPadMarkerTex(), transparent: true, alphaTest: 0.005,
      opacity: 1, depthWrite: false, depthTest: false,
      blending: AdditiveBlending,
    })
    const padPts = new Points(padGeo, padMat)
    padPts.renderOrder = 30
    scene.add(padPts)

    // ── Vector map: graticule (static, built immediately) ────────────
    // Both graticule and borders fade out as the user zooms in and tiles take over.
    const graticuleGeo  = buildGraticuleGeo()
    const graticuleMat  = new LineBasicMaterial({
      color: 0x0d3d2a, transparent: true, opacity: 0.45, depthWrite: false,
    })
    const graticuleMesh = new LineSegments(graticuleGeo, graticuleMat)
    graticuleMesh.renderOrder = 1
    scene.add(graticuleMesh)

    // ── Place dots — cities from placeData ─────────────────────────────
    const PLACE_R = EARTH_R * 1.001
    const cities = PLACES.filter(p => p.type === 'city')
    const placePosArr = new Float32Array(cities.length * 3)
    const placeSizeArr = new Float32Array(cities.length)
    for (let i = 0; i < cities.length; i++) {
      const v = ll2v(cities[i].lat, cities[i].lon, PLACE_R)
      placePosArr[i * 3] = v.x; placePosArr[i * 3 + 1] = v.y; placePosArr[i * 3 + 2] = v.z
      placeSizeArr[i] = cities[i].tier === 1 ? 3.5 : 2.5
    }
    const placeGeo = new BufferGeometry()
    placeGeo.setAttribute('position', new BufferAttribute(placePosArr, 3))
    placeGeo.setAttribute('size', new BufferAttribute(placeSizeArr, 1))
    const placeDots = new Points(placeGeo, new PointsMaterial({
      color: 0x8899aa, transparent: true, opacity: 0.18, sizeAttenuation: false, depthWrite: false,
    }))
    placeDots.renderOrder = 3
    scene.add(placeDots)

    // ── Airport markers — 930 airports, tier-based visibility ────────
    // tier 1 (top 50): visible from ~2000km, tier 2 (~150): from ~500km, tier 3 (~740): from ~150km
    const labelContainer = document.createElement('div')
    labelContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden'
    el.appendChild(labelContainer)
    const _projV = new Vector3()
    const airportLabelEls = AIRPORTS.map(a => {
      const div = document.createElement('div')
      div.innerHTML = `<span style="font-size:9px;line-height:1;margin-right:3px;opacity:0.9">✈</span><span style="font-size:8px;letter-spacing:0.1em">${a.iata}</span>`
      div.style.cssText = `position:absolute;display:none;transform:translate(-50%,-100%) translateY(-5px);padding:3px 6px 3px 5px;background:rgba(4,9,14,0.88);border:1px solid rgba(178,255,26,0.45);border-radius:4px;color:rgba(178,255,26,0.85);font:700 8px/1.3 var(--font-mono,monospace);white-space:nowrap;pointer-events:auto;cursor:pointer;backdrop-filter:blur(6px);box-shadow:0 1px 8px rgba(0,0,0,0.6),0 0 6px rgba(178,255,26,0.1)`
      div.title = `${a.name} — ${a.city}`
      div.addEventListener('click', () => { int.current.onAirportClick?.(a.iata) })
      div.addEventListener('mouseenter', () => { div.style.background = 'rgba(178,255,26,0.12)'; div.style.borderColor = 'rgba(178,255,26,0.9)'; div.style.color = '#b2ff1a'; div.style.boxShadow = '0 2px 12px rgba(0,0,0,0.7),0 0 14px rgba(178,255,26,0.25)' })
      div.addEventListener('mouseleave', () => { div.style.background = 'rgba(4,9,14,0.88)'; div.style.borderColor = 'rgba(178,255,26,0.45)'; div.style.color = 'rgba(178,255,26,0.85)'; div.style.boxShadow = '0 1px 8px rgba(0,0,0,0.6),0 0 6px rgba(178,255,26,0.1)' })
      labelContainer.appendChild(div)
      return { div, lat: a.lat, lon: a.lon, tier: a.tier, iata: a.iata }
    })

    let mapDestroyed = false

    // ── Tile system: priority-queue quadtree loader ───────────────────
    // Tiles sit at two elevations (logarithmic depth buffer resolves these cleanly):
    //   Parent placeholders (z-2): EARTH_R * 1.0002, renderOrder 0
    //   Full-detail tiles   (z)  : EARTH_R * 1.0004, renderOrder 1
    // Stale tiles stay visible on zoom change — they cover the surface
    // while new tiles load, preventing the earth base color from showing.
    const tileCache   = new Map()   // tileKey → {mesh, mat, geo, tx, ty, z, parent}
    const failedTiles = new Set()   // tileKeys that failed network load — skip re-queuing
    let tileQueue    = []           // [{tx, ty, z, priority, isParent}]
    let tileLoading  = 0            // count of in-flight XHR loads
    let lastTileZ    = -1
    let lastTileCX   = -1
    let lastTileCY   = -1

    const tileKey = (tx, ty, z) => `${z}/${tx}/${ty}`

    const clearTiles = () => {
      for (const [, t] of tileCache) {
        if (!t) continue
        scene.remove(t.mesh)
        t.geo.dispose()
        t.mat.dispose()
      }
      tileCache.clear()
      failedTiles.clear()
      tileQueue    = []
      tileLoading  = 0
      lastTileZ = lastTileCX = lastTileCY = -1
    }

    const processQueue = () => {
      while (tileLoading < MAX_TILE_LOADS && tileQueue.length > 0) {
        const item = tileQueue.shift()
        const key  = tileKey(item.tx, item.ty, item.z)
        if (tileCache.has(key)) continue        // already loading or loaded
        tileCache.set(key, null)                // sentinel: "loading"
        tileLoading++

        // Tile radii must stay below camera minDistance (127 m = 1.00002 WU)
        // so the camera is always above the tile mesh → front face always visible.
        // Old values (1.001 / 1.0015) were 6.4 km / 9.5 km — caused blank screen
        // when zooming below those altitudes.
        const r    = item.isParent ? EARTH_R * 1.0002 : EARTH_R * 1.0004
        const geo  = buildTileGeo(item.tx, item.ty, item.z, r)
        const mat  = new MeshBasicMaterial({
          transparent: true, opacity: 0, side: FrontSide,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: item.isParent ? -1 : -2,
          polygonOffsetUnits:  item.isParent ? -1 : -2,
          color: new Color(0.55, 0.55, 0.58),  // darkened tiles — easy on the eyes
        })
        // Boost saturation for richer street-view colors
        mat.onBeforeCompile = shader => {
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <output_fragment>',
            `
            float grey = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
            outgoingLight = mix(vec3(grey), outgoingLight, 1.45);
            #include <output_fragment>
            `
          )
        }
        const mesh = new Mesh(geo, mat)
        mesh.renderOrder   = item.isParent ? 0 : 1
        mesh.frustumCulled = false

        new TextureLoader().load(
          getTileUrl(item.tx, item.ty, item.z, mapStyleRef.current),
          tex => {
            tileLoading--
            if (mapDestroyed) { geo.dispose(); mat.dispose(); processQueue(); return }
            tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
            mat.map     = tex
            mat.opacity = 0   // fade in gradually (see updateTiles loop)
            mat.needsUpdate = true
            // Fresh tiles always draw on top of demoted stale tiles
            mesh.renderOrder = item.isParent ? 0 : 1
            scene.add(mesh)
            tileCache.set(key, {
              mesh, mat, geo, tx: item.tx, ty: item.ty, z: item.z,
              isParent: item.isParent, isStale: false,
              targetOpacity: item.isParent ? 0.88 : 1.0,
            })
            processQueue()
          },
          undefined,
          () => { tileLoading--; geo.dispose(); mat.dispose(); tileCache.delete(key); failedTiles.add(key); processQueue() },
        )
      }
    }

    let inTileMode      = false
    let lastTileUpdate  = 0

    const updateTiles = () => {
      const dist = camera.position.length()

      // ── Globe mode: far zoom → no new tile loads, but keep existing tiles ──
      // Old code called clearTiles() here, which destroyed all tiles and caused
      // the blue base-sphere flash when zooming back in. Now we just stop
      // loading new tiles and let existing ones fade out naturally.
      if (dist > TILE_DIST_THRESHOLD) {
        if (inTileMode) {
          // Mark all tiles as stale so they fade out and get evicted gradually
          for (const [, t] of tileCache) {
            if (t) t.isStale = true
          }
          tileQueue = []
          inTileMode = false
          lastTileZ = lastTileCX = lastTileCY = -1
        }
        // Fade out tiles smoothly when zoomed out past threshold
        for (const [key, t] of tileCache) {
          if (!t) { tileCache.delete(key); continue }
          t.mat.opacity = Math.max(0, t.mat.opacity - 0.03)
          t.mat.needsUpdate = true
          // Dispose fully-transparent tiles
          if (t.mat.opacity <= 0) {
            scene.remove(t.mesh); t.geo.dispose(); t.mat.dispose(); tileCache.delete(key)
          }
        }
        return
      }
      inTileMode = true

      // ── Per-frame opacity ramp: fade newly-loaded tiles in smoothly ─────
      // Runs every call (not throttled) so fade feels continuous.
      for (const [, t] of tileCache) {
        if (!t || t.targetOpacity == null) continue
        if (t.mat.opacity < t.targetOpacity) {
          t.mat.opacity = Math.min(t.targetOpacity, t.mat.opacity + 0.08)
          t.mat.needsUpdate = true
        }
      }

      // ── Throttle: recalculate at most every 150 ms ─────────────────────────
      const now = Date.now()
      if (now - lastTileUpdate < 150) return
      lastTileUpdate = now

      const z = distToTileZoom(dist)
      const N = 1 << z

      // Camera direction → centre lat/lon
      const camDir       = camera.position.clone().normalize()
      const [clat, clon] = v2ll(camDir)
      const sinL         = Math.sin(MathUtils.clamp(clat * Math.PI / 180, -1.48, 1.48))
      const cx           = Math.floor(((clon + 180) / 360) * N)
      const cy           = Math.max(0, Math.min(N - 1,
                             Math.floor((0.5 - Math.log((1 + sinL) / (1 - sinL)) / (4 * Math.PI)) * N)))

      // ── Cancel stale loads when zoom jumps by ≥2 levels ───────────────────
      // Prevents wasting 6 load slots on tiles the user has already zoomed past.
      if (lastTileZ !== -1 && Math.abs(z - lastTileZ) >= 2) tileQueue = []

      if (z === lastTileZ && cx === lastTileCX && cy === lastTileCY) return
      const _prevTileZ = lastTileZ
      lastTileZ = z; lastTileCX = cx; lastTileCY = cy

      // On zoom change, mark old detail tiles as stale but keep them visible.
      // They stay as a blurry-but-correct backdrop while new tiles load — the new
      // tiles render on top via renderOrder once ready. Hiding them immediately
      // causes the dark blue earth base color to flash through during load.
      if (_prevTileZ !== -1 && _prevTileZ !== z) {
        for (const [, _staleTile] of tileCache) {
          if (!_staleTile || _staleTile.isParent || _staleTile.z === z) continue
          _staleTile.isStale = true   // tightens eviction window; mesh stays visible
        }
      }

      // ── Dynamic tile coverage radius from camera FOV + aspect ─────────────
      // Fixed rings used to starve the viewport edges, showing blue base Earth
      // on wide monitors at high zoom. Compute the actual screen-projected tile
      // count instead so the ring matches what's visible, plus a 1-tile buffer.
      const altKm    = Math.max((dist - 1.0) * 6371, 0.05)
      const vFovRad  = (camera.fov || 60) * Math.PI / 180
      const hFovRad  = 2 * Math.atan(Math.tan(vFovRad / 2) * (camera.aspect || 1))
      // Approx ground-arc length (km) covered at current altitude (small-angle)
      const arcKmY   = 2 * altKm * Math.tan(vFovRad / 2)
      const arcKmX   = 2 * altKm * Math.tan(hFovRad / 2)
      // Tile size at zoom z, equator reference (km per tile at lon)
      const latRad   = clat * Math.PI / 180
      const kmPerLon = 111.32 * Math.cos(latRad)
      const tileKmX  = (360 / N) * kmPerLon
      const tileKmY  = (360 / N) * 111.32
      // Half-extent in tiles, +1 buffer ring so edges never show blue
      const rx = Math.max(2, Math.min(8, Math.ceil(arcKmX / tileKmX / 2) + 1))
      const ry = Math.max(2, Math.min(8, Math.ceil(arcKmY / tileKmY / 2) + 1))
      const radius = Math.max(rx, ry)

      // Grandparent tier: z-3 at low zoom (wide coverage), z-1 at high zoom (quality)
      // At z≥10 z-3 tiles cover huge areas and look extremely blurry — use z-1 instead.
      const gpz  = Math.max(0, z >= 10 ? z - 1 : z - 3)
      const gpN  = 1 << gpz
      const gpcx = Math.floor(((clon + 180) / 360) * gpN)
      const gpcy = Math.max(0, Math.min(gpN - 1,
                     Math.floor((0.5 - Math.log((1 + sinL) / (1 - sinL)) / (4 * Math.PI)) * gpN)))

      // Parent fallback tiles at z-2 — medium-res placeholders
      const pz  = Math.max(0, z - 2)
      const pN  = 1 << pz
      const pcx = Math.floor(((clon + 180) / 360) * pN)
      const pcy = Math.max(0, Math.min(pN - 1,
                    Math.floor((0.5 - Math.log((1 + sinL) / (1 - sinL)) / (4 * Math.PI)) * pN)))

      const newItems = []

      // Grandparent tiles — highest priority so they load first and cover gaps instantly
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const gtx = ((gpcx + dx) % gpN + gpN) % gpN
          const gty = Math.max(0, Math.min(gpN - 1, gpcy + dy))
          const _gk = tileKey(gtx, gty, gpz)
          if (!tileCache.has(_gk) && !failedTiles.has(_gk)) {
            newItems.push({ tx: gtx, ty: gty, z: gpz, isParent: true,
                            priority: 900 - (Math.abs(dx) + Math.abs(dy)) })
          }
        }
      }

      // Parent tiles at z-2
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const ptx = ((pcx + dx) % pN + pN) % pN
          const pty = Math.max(0, Math.min(pN - 1, pcy + dy))
          const _pk = tileKey(ptx, pty, pz)
          if (!tileCache.has(_pk) && !failedTiles.has(_pk)) {
            newItems.push({ tx: ptx, ty: pty, z: pz, isParent: true,
                            priority: 700 - (Math.abs(dx) + Math.abs(dy)) })
          }
        }
      }

      // Detail tiles: centre tile first, then rings outward (quadtree-style priority)
      // Use asymmetric rx/ry from FOV so wide aspect ratios don't starve horizontally.
      for (let dy = -ry; dy <= ry; dy++) {
        for (let dx = -rx; dx <= rx; dx++) {
          const tx = ((cx + dx) % N + N) % N
          const ty = Math.max(0, Math.min(N - 1, cy + dy))
          const _dk = tileKey(tx, ty, z)
          if (!tileCache.has(_dk) && !failedTiles.has(_dk)) {
            newItems.push({ tx, ty, z, isParent: false,
                            priority: (rx + ry) - (Math.abs(dx) + Math.abs(dy)) })
          }
        }
      }

      // Lazy eviction: keep tiles until well outside view to avoid re-loading on pan.
      // Stale tiles (old zoom) get a tighter eviction window.
      for (const [key, t] of tileCache) {
        if (!t) continue
        const nt = t.z === z   ? Math.abs(t.tx - cx)   + Math.abs(t.ty - cy)
                 : t.z === pz  ? Math.abs(t.tx - pcx)  + Math.abs(t.ty - pcy)
                 : t.z === gpz ? Math.abs(t.tx - gpcx) + Math.abs(t.ty - gpcy)
                 : 999
        // Keep stale tiles much longer — only evict well outside view.
        // This prevents the blue earth base material from flashing through during zoom.
        const evictRadius = t.isStale ? radius + 4 : radius + 5
        if (nt > evictRadius) {
          scene.remove(t.mesh); t.geo.dispose(); t.mat.dispose(); tileCache.delete(key)
        }
      }

      newItems.sort((a, b) => b.priority - a.priority)
      tileQueue = [...newItems, ...tileQueue]
      processQueue()
    }

    // ── Real-time trail segments — core (sharp, bright) ──────────────
    const trailPos = new Float32Array(MAX_TRAIL_VERTS * 3)
    const trailCol = new Float32Array(MAX_TRAIL_VERTS * 3)
    const trailGeo = new BufferGeometry()
    trailGeo.setAttribute('position', new BufferAttribute(trailPos, 3).setUsage(DynamicDrawUsage))
    trailGeo.setAttribute('color',    new BufferAttribute(trailCol, 3).setUsage(DynamicDrawUsage))
    trailGeo.setDrawRange(0, 0)
    const trailMesh = new LineSegments(trailGeo, new LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 1,
      depthWrite: false, blending: AdditiveBlending,
    }))
    trailMesh.renderOrder = 2
    scene.add(trailMesh)

    // ── Real-time trail segments — glow halo (soft, bloomed) ─────────
    const trailGlowPos = new Float32Array(MAX_TRAIL_VERTS * 3)
    const trailGlowCol = new Float32Array(MAX_TRAIL_VERTS * 3)
    const trailGlowGeo = new BufferGeometry()
    trailGlowGeo.setAttribute('position', new BufferAttribute(trailGlowPos, 3).setUsage(DynamicDrawUsage))
    trailGlowGeo.setAttribute('color',    new BufferAttribute(trailGlowCol, 3).setUsage(DynamicDrawUsage))
    trailGlowGeo.setDrawRange(0, 0)
    const trailGlowMesh = new LineSegments(trailGlowGeo, new LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.28,
      depthWrite: false, blending: AdditiveBlending,
    }))
    trailGlowMesh.renderOrder = 1
    scene.add(trailGlowMesh)

    // ── Raycaster ─────────────────────────────────────────────────────
    const ray   = new Raycaster()
    const mouse = new Vector2()

    const toNDC = (clientX, clientY) => {
      const rect = el.getBoundingClientRect()
      mouse.set(
        ((clientX - rect.left) / rect.width)  * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      )
      ray.setFromCamera(mouse, camera)
    }

    // Screen-space spatial pick — projects all aircraft to 2D, builds KD-tree, queries
    const _ssV = new Vector3()
    const screenPick = (clientX, clientY, isTouch = false) => {
      const ids = int.current.acIds
      if (!ids?.length) return null
      const rect = el.getBoundingClientRect()
      const w = rect.width, h = rect.height
      const tapR = isTouch ? 44 : 20
      const n = Math.min(ids.length, acGeo.drawRange.count)
      if (n === 0) return null

      const xs = new Float64Array(n)
      const ys = new Float64Array(n)
      for (let i = 0; i < n; i++) {
        _ssV.set(acPos[i * 3], acPos[i * 3 + 1], acPos[i * 3 + 2]).project(camera)
        xs[i] = (_ssV.x * 0.5 + 0.5) * w
        ys[i] = (-_ssV.y * 0.5 + 0.5) * h
      }

      const index = new KDBush(n)
      for (let j = 0; j < n; j++) index.add(xs[j], ys[j])
      index.finish()

      const cx = clientX - rect.left, cy = clientY - rect.top
      const nearby = index.range(cx - tapR, cy - tapR, cx + tapR, cy + tapR)

      let bestId = null, bestDist = Infinity
      for (const idx of nearby) {
        const dx = xs[idx] - cx, dy = ys[idx] - cy
        const d = dx * dx + dy * dy
        if (d < bestDist && d <= tapR * tapR) { bestDist = d; bestId = ids[idx] }
      }
      return bestId
    }

    const onMouseMove = e => {
      // ── DESI galaxy hover (galaxy scale) ─────────────────────────
      if (int.current.targetCameraScale === 'galaxy') {
        const hit = desiLayer.hoverPick(e.clientX, e.clientY, camera, el)
        if (hit) {
          desiLayer.setHovered(hit.idx)
          renderer.domElement.classList.add(styles.hovered)
          const isQSO = hit.s === 'QSO'
          int.current.setHoverTooltip?.({
            x: e.clientX, y: e.clientY,
            desi: { type: isQSO ? 'Quasar' : 'Galaxy', z: hit.z, ra: hit.r, dec: hit.d },
          })
        } else {
          desiLayer.clearHover()
          renderer.domElement.classList.remove(styles.hovered)
          int.current.setHoverTooltip?.(null)
        }
        return
      }

      const newId = screenPick(e.clientX, e.clientY, false)
      const prevId = int.current.hoveredId

      if (newId !== prevId) {
        // Restore previous hovered entity to its default color
        if (prevId && prevId !== int.current.lastSelectedId) {
          const prev = int.current.idToInstance?.get(prevId)
          if (prev) {
            prev.mesh.setColorAt(prev.index, defaultColor(prev.cat))
            prev.mesh.instanceColor.needsUpdate = true
          }
        }
        // Highlight new hovered entity
        if (newId && newId !== int.current.lastSelectedId) {
          const inst = int.current.idToInstance?.get(newId)
          if (inst) {
            inst.mesh.setColorAt(inst.index, _colHover)
            inst.mesh.instanceColor.needsUpdate = true
          }
        }
        int.current.hoveredId  = newId
        int.current.hoverPos   = newId ? (int.current.idToInstance?.get(newId)?.pos ?? null) : null
        renderer.domElement.classList.toggle(styles.hovered, !!newId)

        // Update tooltip
        if (newId) {
          const acData = int.current.lastAircraft?.get(newId)
          int.current.setHoverTooltip?.({ x: e.clientX, y: e.clientY, data: acData ?? null, id: newId })
        } else {
          int.current.setHoverTooltip?.(null)
        }
      } else if (newId) {
        // Update position while hovering same entity
        int.current.setHoverTooltip?.(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : prev)
      }
    }
    el.addEventListener('mousemove', onMouseMove)

    // ── GPU color pick (close zoom, pixel-perfect) ───────────────────
    // Called from onPointerUp when camDist < PICK_GPU_DIST.
    // Renders the pick scene (flat unique-color instances) to an offscreen
    // target, samples the pixel under the cursor, decodes to aircraft ID.
    const _savedClearColor = new Color()
    const PICK_SAMPLE_R = 3
    const PICK_SAMPLE_SIDE = PICK_SAMPLE_R * 2 + 1
    const _pickArea = new Uint8Array(PICK_SAMPLE_SIDE * PICK_SAMPLE_SIDE * 4)
    const gpuPick = (clientX, clientY) => {
      const pt = int.current.pickTarget
      const ps = int.current.pickScene
      if (!pt || !ps) return null

      // Sync pick mesh counts so they match display meshes exactly
      const pm = int.current.pickMeshes
      if (pm) {
        for (const cat of PICK_CAT_ORDER) {
          const disp = { plane: planeMesh, heavy: heavyMesh, regional: regionalMesh,
                         helicopter: heliMesh, satellite: satMesh, ship: shipMesh }[cat]
          if (pm[cat] && disp) pm[cat].count = disp.count
        }
      }

      // Save + override clear color, render pick scene, restore
      const savedAlpha = renderer.getClearAlpha()
      renderer.getClearColor(_savedClearColor)
      renderer.setRenderTarget(pt)
      renderer.setClearColor(0x000000, 1)
      renderer.clear()
      renderer.render(ps, camera)
      renderer.setRenderTarget(null)
      renderer.setClearColor(_savedClearColor, savedAlpha)

      // Sample a 7x7 pixel neighborhood (DPI-corrected) — nearest non-zero ID wins
      const rect = el.getBoundingClientRect()
      const dpr  = renderer.getPixelRatio()
      const cx   = Math.round((clientX - rect.left) * dpr)
      const cy   = pt.height - 1 - Math.round((clientY - rect.top) * dpr)
      const x0   = Math.max(0, cx - PICK_SAMPLE_R)
      const y0   = Math.max(0, cy - PICK_SAMPLE_R)
      const w    = Math.min(PICK_SAMPLE_SIDE, pt.width - x0)
      const h    = Math.min(PICK_SAMPLE_SIDE, pt.height - y0)
      renderer.readRenderTargetPixels(pt, x0, y0, w, h, _pickArea)

      let bestId = 0, bestDist = Infinity
      for (let row = 0; row < h; row++) {
        for (let col = 0; col < w; col++) {
          const i  = (row * w + col) * 4
          const id = (_pickArea[i] << 16) | (_pickArea[i + 1] << 8) | _pickArea[i + 2]
          if (id === 0) continue
          const dx = col - (cx - x0), dy = row - (cy - y0)
          const d  = dx * dx + dy * dy
          if (d < bestDist) { bestDist = d; bestId = id }
        }
      }
      if (bestId === 0) return null
      return int.current.pickIdToAcId?.get(bestId) ?? null
    }

    let downAt = null
    const onPointerDown = e => { downAt = { x: e.clientX, y: e.clientY } }
    const onPointerUp   = e => {
      if (!downAt) return
      const dx = Math.abs(e.clientX - downAt.x)
      const dy = Math.abs(e.clientY - downAt.y)
      downAt = null
      // Allow a bit more drag tolerance on touch
      const dragLimit = e.pointerType === 'touch' ? 20 : 14
      if (dx > dragLimit || dy > dragLimit) return
      const isTouch = e.pointerType === 'touch'

      // ── Galaxy scale: pick DESI galaxies ────────────────────────────
      if (int.current.targetCameraScale === 'galaxy') {
        const desiHit = desiLayer.pick(e.clientX, e.clientY, camera, el)
        if (desiHit) {
          desiLayer.setSelected(desiHit.targetid)
          int.current.onSkyObjectClick?.(desiHit)
          return
        }
        // Clicked empty space — deselect
        desiLayer.setSelected(null)
        int.current.onSkyObjectClick?.(null)
        return
      }

      // ── Moon scale: check landing site labels ─────────────────────────
      if (int.current.targetCameraScale === 'moon' && moonScene.moonGroup.visible) {
        toNDC(e.clientX, e.clientY)
        const site = moonScene.getSiteAt(ray)
        if (site) { int.current.onMoonSiteClick?.(site); return }
        return
      }

      // ── Solar scale: check planet meshes first ────────────────────────
      if (int.current.targetCameraScale === 'solar' && solarSystem.solarGroup.visible) {
        toNDC(e.clientX, e.clientY)
        const planetMeshList = Object.values(solarSystem.planetMeshes)
        const planetHits = ray.intersectObjects(planetMeshList, false)
        if (planetHits.length) {
          const name = planetHits[0].object.userData.planet
          if (name) { int.current.onPlanetClick?.(name); return }
        }
      }

      const camDist = int.current.camDist || camera.position.length()

      // ── GPU color pick first, fallback to screen-space pick ──────────
      // GPU pick is pixel-perfect but can miss small planes at mid-zoom.
      // If it returns null, fall through to screenPick which uses a generous
      // tap radius and works at any altitude.
      if (camDist < PICK_GPU_DIST && int.current.targetCameraScale === 'earth') {
        const acId = gpuPick(e.clientX, e.clientY)
        if (acId) { int.current.onAircraftClick?.(acId); return }
      }

      // ── Screen-space spatial pick: works at all altitudes ──────────────
      if (int.current.targetCameraScale === 'earth' || int.current.targetCameraScale == null) {
        const acId = screenPick(e.clientX, e.clientY, isTouch)
        if (acId) int.current.onAircraftClick?.(acId)
      }
    }
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointerup',   onPointerUp)

    const onMouseLeave = () => {
      int.current.hoveredId = null
      int.current.hoverPos  = null
      int.current.setHoverTooltip?.(null)
      renderer.domElement.classList.remove(styles.hovered)
    }
    el.addEventListener('mouseleave', onMouseLeave)

    // ── Resize ───────────────────────────────────────────────────────
    const onResize = () => {
      camera.aspect = el.clientWidth / el.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(el.clientWidth, el.clientHeight)
      const _rdpr = renderer.getPixelRatio()
      pickTarget.setSize(Math.floor(el.clientWidth * _rdpr), Math.floor(el.clientHeight * _rdpr))
    }
    window.addEventListener('resize', onResize)

    // ── Render loop ──────────────────────────────────────────────────
    let raf
    let lastSunUpdate = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      // ── FlyTo tween (works both when tracking and not) ──────────────
      const _flyStart = int.current.flyToTarget ? int.current.flyToStart : null
      if (_flyStart != null) {
        const _elapsed = Date.now() - _flyStart
        const _TWEEN_MS = 1600
        const _rawT = Math.min(_elapsed / _TWEEN_MS, 1)
        const _t = 1 - Math.pow(1 - _rawT, 3)
        const _interp = new Vector3()
          .lerpVectors(int.current.flyToFrom, int.current.flyToTarget, _t)
        camera.position.copy(_interp.normalize().multiplyScalar(int.current.flyToTarget.length()))
        camera.lookAt(0, 0, 0)
        controls.enableRotate = false
        if (_rawT >= 1) {
          int.current.flyToTarget = null
          int.current.flyToStart  = null
          int.current.flyToFrom   = null
        }
      } else {
        // ── Live tracking: lock camera when no flyTo is active ────────
        const _trackId = int.current.trackingId
        const _trackPaused = Date.now() < (int.current.trackPausedUntil || 0)
        if (_trackId && !_trackPaused) {
          const _trackedInst = int.current.idToInstance?.get(_trackId)
          if (_trackedInst?.lat != null) {
            const _d = camera.position.length()
            const _targetPos = ll2v(_trackedInst.lat, _trackedInst.lon, EARTH_R)
              .normalize().multiplyScalar(_d)

            // On mobile with panel open, offset camera so aircraft appears in top 2/3
            if (int.current.mobilePanel && window.innerWidth < 768) {
              const _up = new Vector3(0, 1, 0)
              const _camDir = _targetPos.clone().normalize()
              const _right = new Vector3().crossVectors(_camDir, _up).normalize()
              const _screenUp = new Vector3().crossVectors(_right, _camDir).normalize()
              // Shift camera down so the aircraft appears higher on screen (above the card)
              const _offsetFrac = 0.15 * (_d - EARTH_R)
              _targetPos.addScaledVector(_screenUp, -_offsetFrac)
              _targetPos.normalize().multiplyScalar(_d)
            }

            const _tweenStart = int.current.trackTweenStart
            if (_tweenStart != null) {
              const _elapsed = Date.now() - _tweenStart
              const _TWEEN_MS = 1400
              const _rawT = Math.min(_elapsed / _TWEEN_MS, 1)
              const _t = 1 - Math.pow(1 - _rawT, 3)
              const _from = int.current.trackTweenFrom
              const _interp = new Vector3().lerpVectors(_from, _targetPos, _t)
              camera.position.copy(_interp.normalize().multiplyScalar(_d))
              if (_rawT >= 1) {
                int.current.trackTweenStart = null
                int.current.trackTweenFrom  = null
              }
            } else {
              camera.position.copy(_targetPos)
            }

            camera.lookAt(0, 0, 0)
            controls.enableRotate = false
          }
        } else if (_trackId && _trackPaused) {
          controls.enableRotate = true
        } else {
          controls.enableRotate = true
        }
      }

      // ── Solar planet fly-to tween ─────────────────────────────────────────
      if (int.current.solarFlyStart != null) {
        const _elapsed = Date.now() - int.current.solarFlyStart
        const _TWEEN_MS = 1800
        const _rawT = Math.min(_elapsed / _TWEEN_MS, 1)
        const _t = 1 - Math.pow(1 - _rawT, 3)
        camera.position.lerpVectors(int.current.solarFlyFrom, int.current.solarFlyTarget, _t)
        camera.lookAt(0, 0, 0)
        if (_rawT >= 1) {
          int.current.solarFlyStart  = null
          int.current.solarFlyFrom   = null
          int.current.solarFlyTarget = null
        }
      }

      // ── Camera scale tween (earth ↔ solar ↔ galaxy ↔ moon) ────────────────
      const targetScale = int.current.targetCameraScale || 'earth'
      const isSolar   = targetScale === 'solar'
      const isGalaxy  = targetScale === 'galaxy'
      const isMoon    = targetScale === 'moon'
      const CAM_TARGET = isMoon ? CAM_MOON : isGalaxy ? CAM_GALAXY : isSolar ? CAM_SOLAR : CAM_EARTH

      if (int.current.camTweenStart != null) {
        const isMoonTween = int.current.camTweenKind === 'moon'
        const tweenDur = isMoonTween ? CAM_MOON_TWEEN_MS : CAM_TWEEN_MS
        const elapsed  = Date.now() - int.current.camTweenStart
        const rawT     = Math.min(elapsed / tweenDur, 1)
        const t = rawT < 0.5
          ? 4 * rawT * rawT * rawT
          : 1 - Math.pow(-2 * rawT + 2, 3) / 2

        const [tx, ty, tz] = CAM_TARGET.position
        const from = int.current.camTweenFrom
        if (isMoonTween) {
          // Cinematic arc: quadratic Bezier with a control point that lifts
          // the camera "above" the straight line — feels like launching up
          // and descending onto the Moon. Plus a subtle dip in the target's
          // direction so the Moon appears to rush into frame at the end.
          const ctrl = int.current.camTweenCtrl
          const omt = 1 - t
          camera.position.set(
            omt * omt * from.x + 2 * omt * t * ctrl.x + t * t * tx,
            omt * omt * from.y + 2 * omt * t * ctrl.y + t * t * ty,
            omt * omt * from.z + 2 * omt * t * ctrl.z + t * t * tz,
          )
        } else {
          camera.position.set(
            from.x + (tx - from.x) * t,
            from.y + (ty - from.y) * t,
            from.z + (tz - from.z) * t,
          )
        }

        // Deferred scene swap for moon tweens — flip visibility mid-tween when
        // the warp overlay is fully opaque, so the user never sees the camera
        // sitting inside the Earth sphere or at a weird distance from either.
        if (isMoonTween && !int.current.camTweenSwapped && rawT >= 0.5) {
          int.current.camTweenSwapped = true
          const _showEarth = !isMoon && !isSolar && !isGalaxy
          int.current.earthMesh.visible = _showEarth
          int.current.cloudsMesh.visible = _showEarth
          int.current.placeDotsMesh.visible = _showEarth
          _setEarthEntitiesVisible(_showEarth)
          if (isMoon) { moonScene.show(); solarSystem.hide(); galaxySystem.hide(); desiLayer.hide() }
          else { moonScene.hide(); solarSystem.hide(); galaxySystem.hide() }
        }

        if (rawT >= 1) {
          if (int.current.camTweenKind === 'moon') setMoonTransit(false)
          int.current.camTweenStart = null
          controls.minDistance = CAM_TARGET.minDist
          controls.maxDistance = CAM_TARGET.maxDist
          if (isSolar) solarSystem.show(); else solarSystem.hide()
          if (isGalaxy) { desiLayer.show(); galaxySystem.showSkyOnly() } else { desiLayer.hide(); galaxySystem.hide() }
          if (isMoon) moonScene.show(); else moonScene.hide()
          const _earthVisible = !isMoon && !isSolar && !isGalaxy
          int.current.earthMesh.visible = _earthVisible
          int.current.cloudsMesh.visible = _earthVisible
          int.current.placeDotsMesh.visible = _earthVisible
          _setEarthEntitiesVisible(_earthVisible)
          // Reset FOV when leaving galaxy mode
          if (!isGalaxy && camera.fov !== 40) {
            camera.fov = 40
            camera.updateProjectionMatrix()
          }
          int.current._scaleReadyFired = targetScale
          int.current.onScaleReady?.(targetScale)
        }
      } else {
        const prevScale = int.current._lastAppliedScale || 'earth'
        if (prevScale !== targetScale) {
          int.current._lastAppliedScale = targetScale
          int.current._scaleReadyFired = null
          int.current.camTweenStart = Date.now()
          int.current.camTweenFrom  = camera.position.clone()
          // Cinematic curved path for Moon transitions (either direction).
          const isMoonTween = isMoon || prevScale === 'moon'
          int.current.camTweenKind = isMoonTween ? 'moon' : 'linear'
          if (isMoonTween) setMoonTransit(true)
          if (isMoonTween) {
            // Control point: midpoint between start & target, lifted "up" by
            // the half-length of the straight line → gives a nice arcing path.
            const from = int.current.camTweenFrom
            const [tx, ty, tz] = CAM_TARGET.position
            const mx = (from.x + tx) / 2
            const my = (from.y + ty) / 2
            const mz = (from.z + tz) / 2
            const dx = tx - from.x, dy = ty - from.y, dz = tz - from.z
            const dlen = Math.sqrt(dx * dx + dy * dy + dz * dz)
            // Lift direction: whichever of +Y / −Y pulls us further from origin
            const lift = Math.max(dlen * 0.45, 0.6)
            int.current.camTweenCtrl = { x: mx, y: my + lift, z: mz }
          }
          controls.minDistance = CAM_TARGET.minDist
          controls.maxDistance = CAM_TARGET.maxDist
          // For Moon tweens, defer the scene swap until mid-tween (when the
          // warp overlay fully covers the screen) so the user never sees
          // either scene at an unnatural camera distance. For other tweens,
          // swap immediately as before.
          if (isMoonTween) {
            int.current.camTweenSwapped = false
          } else {
            const _showEarth = !isMoon && !isSolar && !isGalaxy
            int.current.earthMesh.visible = _showEarth
            int.current.cloudsMesh.visible = _showEarth
            int.current.placeDotsMesh.visible = _showEarth
            _setEarthEntitiesVisible(_showEarth)
            if (isMoon) { moonScene.show(); solarSystem.hide(); galaxySystem.hide(); desiLayer.hide() }
            else if (isSolar) { solarSystem.show(); moonScene.hide() }
            else if (isGalaxy) { desiLayer.show(); galaxySystem.showSkyOnly(); solarSystem.hide(); moonScene.hide() }
            else { solarSystem.hide(); moonScene.hide() }
            if (!isGalaxy) { desiLayer.hide() }
          }
        } else if (!int.current._scaleReadyFired || int.current._scaleReadyFired !== targetScale) {
          // Steady state — no tween needed, fire onScaleReady once
          int.current._scaleReadyFired = targetScale
          int.current.onScaleReady?.(targetScale)
        }
      }

      // ── Solar system per-frame update ─────────────────────────────────────
      if (solarSystem.solarGroup.visible) {
        solarSystem.update(int.current.planetPositions)
        solarSystem.animateExtra()
      }

      // ── Moon scene per-frame update ─────────────────────────────────────
      if (moonScene.moonGroup.visible) {
        moonScene.update(camera)
      }

      // ── Night sky per-frame update (planet positions refresh every 30s) ──
      if (galaxySystem.skyGroup.visible) {
        galaxySystem.update()
        if (arController.isActive()) arController.update()
        // Compute camera heading for compass bar
        const _dir = new Vector3()
        camera.getWorldDirection(_dir)
        const _ra = ((Math.atan2(-_dir.z, _dir.x) * 180 / Math.PI) + 360) % 360
        const _dec = Math.asin(Math.min(1, Math.max(-1, _dir.y / _dir.length()))) * 180 / Math.PI
        galaxyHeadingRef.current = { ra: _ra, dec: _dec }
      }

      // ── Dynamic rotate + zoom speed — logarithmic scale with altitude ────────
      // At low altitude (street/airport zoom), the globe must feel stiff and
      // precise — a tiny drag should move slowly, not fling across continents.
      if (targetScale === 'earth') {
        const dist = camera.position.length()
        const MIN_D = 1.00002, MAX_D = 8.0
        const t = Math.max(0, Math.min(1,
          Math.log(dist / MIN_D) / Math.log(MAX_D / MIN_D)
        ))
        // Rotate/zoom — touch devices are slower only at low altitude (t<0.3),
        // converge to desktop speed at orbit so zoomed-out feel stays fast.
        const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
        const touchDamp = isTouch ? MathUtils.clamp(1 - (1 - t) * 0.6, 0.4, 1) : 1
        controls.rotateSpeed   = (0.008 + Math.pow(t, 1.5) * 0.35) * touchDamp
        controls.zoomSpeed     = (0.02  + t * 0.68) * touchDamp
        controls.dampingFactor = 0.88 - t * 0.48
      } else if (targetScale === 'solar') {
        controls.rotateSpeed = 0.45
        controls.zoomSpeed   = 0.55
        controls.enableZoom  = true
      } else if (isGalaxy) {
        controls.rotateSpeed = 0.5
        controls.enableZoom  = false   // FOV zoom handled by galaxyWheel
      } else {
        controls.rotateSpeed = 0.5
        controls.zoomSpeed   = 0.6
        controls.enableZoom  = true
      }

      // Skip orbit controls when AR mode is driving the camera
      if (!arController.isActive()) controls.update()
      clouds.rotation.y += 0.000022

      // Dynamic near/far clip — each scale needs a different frustum.
      // Earth: near = 10% altitude, far = 200 WU.
      // Solar: near = 235 WU, far = 1.41M WU (60 AU).
      // Galaxy: near = 0.1 WU, far = 600 WU (camera at origin, sky sphere = 480 WU).
      const dist    = camera.position.length()
      int.current.camDist = dist
      const altUnit = Math.max(dist - EARTH_R, 1e-7)
      if (isGalaxy) {
        const NEAR_GALAXY = 0.1, FAR_GALAXY = 600
        if (camera.near !== NEAR_GALAXY || camera.far !== FAR_GALAXY) {
          camera.near = NEAR_GALAXY; camera.far = FAR_GALAXY
          camera.updateProjectionMatrix()
        }
      } else if (isSolar) {
        if (camera.near !== 500 || camera.far !== SOLAR_FAR) {
          camera.near = 500; camera.far = SOLAR_FAR
          camera.updateProjectionMatrix()
        }
      } else {
        const newNear = altUnit * 0.1
        if (Math.abs(newNear - camera.near) / camera.near > 0.05) {
          camera.near = newNear
          camera.updateProjectionMatrix()
        }
        if (camera.far !== 200) {
          camera.far = 200
          camera.updateProjectionMatrix()
        }
      }

      // Fade vector overlays out as tiles take over; fade back in when zoomed out
      const overlayAlpha = MathUtils.clamp((dist - TILE_DIST_THRESHOLD + 0.4) / 0.4, 0, 1)
      graticuleMat.opacity = 0.45 * overlayAlpha

      // Skip tile loading in non-Earth views
      if (targetScale === 'earth') updateTiles()

      // ── Smooth tile fade-in: ramp loaded tiles from 0 → target over ~200ms ──
      // Only fade in when in tile mode (not when tiles are fading out).
      if (inTileMode) {
        for (const [, t] of tileCache) {
          if (!t || !t.mat.map) continue
          const target = t.isParent ? 0.88 : 1.0
          if (t.mat.opacity < target) {
            t.mat.opacity = Math.min(target, t.mat.opacity + 0.08)
            t.mat.needsUpdate = true
          }
        }
      }

      // ── Place markers + airport/port labels ────────────────────────────
      // City dots: faint markers visible from regional zoom (tiles handle city names)
      // Airport/port DOM labels: visible at close zoom for IATA codes + click targets
      if (isSolar || isGalaxy || isMoon) {
        labelContainer.style.display = 'none'
        placeDots.visible = false
      } else {
        placeDots.visible = dist < 2.5
        placeDots.material.opacity = MathUtils.clamp(0.18 * (2.5 - dist) / 0.5, 0, 0.18)

        // Airport labels — tier-based: t1 from 2000km, t2 from 500km, t3 from 150km
        const showAirports = dist < 1.35
        labelContainer.style.display = showAirports ? '' : 'none'
        if (showAirports) {
          const halfW = el.clientWidth * 0.5, halfH = el.clientHeight * 0.5
          // dist thresholds: tier1 < 1.32 (~2000km), tier2 < 1.08 (~500km), tier3 < 1.025 (~160km)
          const tierCutoff = dist < 1.025 ? 3 : dist < 1.08 ? 2 : 1
          // Camera direction for back-face culling (hide airports on far side of globe)
          const camDir = camera.position.clone().normalize()
          for (let i = 0; i < airportLabelEls.length; i++) {
            const al = airportLabelEls[i]
            if (al.tier > tierCutoff) { al.div.style.display = 'none'; continue }
            const pos = ll2v(al.lat, al.lon, PLACE_R)
            // Dot product: positive = facing camera, negative = behind globe
            if (pos.clone().normalize().dot(camDir) < 0.1) { al.div.style.display = 'none'; continue }
            _projV.copy(pos).project(camera)
            if (_projV.z > 1) { al.div.style.display = 'none'; continue }
            al.div.style.display = ''
            al.div.style.transform = `translate3d(${(_projV.x * halfW + halfW)|0}px,${(-_projV.y * halfH + halfH - 6)|0}px,0) translate(-50%,-100%)`
          }
        }
      }

      // ── Camera info HUD (altitude + scale bar) — throttled to 100 ms ─────
      const now = Date.now()
      if (now - (int.current.lastHudUpdate || 0) > 100) {
        int.current.lastHudUpdate = now
        const altM = Math.max(dist - EARTH_R, 0) * 6_371_000
        // Scale bar: target ~80px of screen width, convert to real-world metres,
        // snap to a round number, then compute actual pixel width for that distance.
        const screenW = el.clientWidth || 1920
        // world-units per pixel at this distance (horizontal, using FOV=40°)
        const wuPerPx = (2 * dist * Math.tan((40 / 2) * (Math.PI / 180))) / screenW
        const metresPerPx = wuPerPx * 6_371_000
        const rawM = metresPerPx * 80          // metres represented by 80px
        // Round to nearest tidy value
        const mag   = Math.pow(10, Math.floor(Math.log10(rawM)))
        const nice  = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000,
                       10000, 20000, 50000, 100000, 200000, 500000, 1000000]
          .map(v => v * mag / 10)
          .filter(v => v >= 1)
          .reduce((best, v) => Math.abs(v - rawM) < Math.abs(best - rawM) ? v : best, rawM)
        const scaleBarPx = Math.round(nice / metresPerPx)
        // Format scale label
        let scaleLabel
        if (nice >= 1000) scaleLabel = `${(nice / 1000) % 1 === 0 ? nice / 1000 : (nice / 1000).toFixed(1)} km`
        else scaleLabel = `${Math.round(nice)} m`
        // Format altitude
        let altLabel
        if (altM < 1) altLabel = `${Math.round(altM * 100) / 100} m`
        else if (altM < 1000) altLabel = `${Math.round(altM)} m`
        else if (altM < 1e6) altLabel = `${(altM / 1000).toFixed(altM < 10000 ? 1 : 0)} km`
        else altLabel = `${Math.round(altM / 1000).toLocaleString()} km`
        setCameraInfo({ altLabel, scaleLabel, scaleBarPx })
        // Notify parent when zoom crosses UI-collapse threshold (~2000km)
        const isClose = altM < 2_000_000
        if (isClose !== int.current._wasZoomedIn) {
          int.current._wasZoomedIn = isClose
          int.current.onZoomChange?.(isClose)
        }
      }

      // Update sun direction every 60 s (sun moves ~0.25°/min — imperceptible at lower cadence)

      if (now - lastSunUpdate > 60000) {
        sun.position.copy(solarDirection()).multiplyScalar(10)
        lastSunUpdate = now
      }

      // Aircraft scaling — continuous screen-space formula.
      // Uses REAL camera distance for projection (wuPerPx) so the world-unit
      // scale grows correctly with orbit zoom. targetPx controls how many
      // pixels the plane occupies on screen — ramps 14→18 over 0–30 km then
      // stays at 18 above 30 km so planes never shrink further.
      const screenW    = el.clientWidth || 1920
      const tanHalf    = Math.tan((40 / 2) * (Math.PI / 180))
      const altKm      = altUnit * 6371

      // Real camera-to-aircraft projection — must use actual dist, not capped.
      const camToAc   = Math.max(dist - AC_R, 0.00005)
      const wuPerPx   = (2 * camToAc * tanHalf) / screenW

      // 737/A320 physical footprint — hard floor at airport zoom.
      const realWorldWU = 40 / 6_371_000

      // Target screen pixels: 14 at ground → 18 at 30km → keeps growing
      // gently above 30km so planes stay clearly visible at orbit zoom.
      // Below 30km: moderate ramp so planes don't balloon at mid-zoom.
      // Above 30km: continues growing (18→28) so dots don't vanish at orbit.
      let targetPx
      if (altKm <= 30) {
        targetPx = 14 + 3 * Math.log10(1 + altKm)         // 14 → ~18
      } else {
        targetPx = 18 + 5 * Math.log10(altKm / 30)        // 18 → ~28 at 6000km
      }
      targetPx = MathUtils.clamp(targetPx, 14, 22)
      // Desktop: 2x bigger planes. Mobile: half size.
      const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      targetPx *= isMobile ? 0.5 : 2
      const screenScale = targetPx * wuPerPx

      let newScale = Math.max(screenScale, realWorldWU)
      newScale = MathUtils.clamp(newScale, realWorldWU, 0.03)

      // If scale changed meaningfully, rebuild per-instance matrices so icons resize with zoom.
      // Hysteresis: require 5% relative change to avoid jitter at intermediate altitudes (~4000m).
      const prevScale = int.current.planeScale || 0.01
      const scaleRatio = Math.abs(newScale - prevScale) / prevScale
      if (scaleRatio > 0.05) {
        int.current.planeScale = newScale
        int.current.needsInstanceRebuild = true
        // Redraw the clicked-flight trail (green/orange tube) at the new scale
        if (lastTrailArgs.current && int.current._drawTrail) {
          const { points, routeData } = lastTrailArgs.current
          queueMicrotask(() => int.current._drawTrail?.(points, routeData))
        }
      }

      // Rebuild instance matrices when planeScale changes (separate from data updates)
      if (int.current.needsInstanceRebuild && int.current.lastAircraft) {
        int.current.needsInstanceRebuild = false
        syncInstances(int.current, int.current.lastAircraft, int.current.lastSelectedId, int.current.hoveredId, true)
      }

      // ── Track mode: hide all aircraft except the tracked one ──
      const _isTracking = int.current.trackingId != null
      if (_isTracking !== (int.current._wasIsolating ?? false)) {
        int.current._wasIsolating = _isTracking
        // Force full instance rebuild so syncInstances applies isolation
        int.current.needsInstanceRebuild = true
      }
      // Hide real-time 1px LineSegments trail when tracking (API ribbon trail replaces it).
      // Also gate on Earth scale — trails belong to Earth-bound aircraft.
      const _onEarth = (int.current.targetCameraScale || 'earth') === 'earth'
      if (int.current.trailMesh) {
        int.current.trailMesh.visible = _onEarth && !_isTracking
        // Scale trail opacity with zoom — more visible when closer.
        // At 30 km+ trails are at base opacity; below 30 km they get brighter.
        const trailOpacity = altKm < 30
          ? MathUtils.clamp(0.5 + 0.5 * (1 - altKm / 30), 0.5, 1.0)
          : 0.5
        int.current.trailMesh.material.opacity = trailOpacity
      }
      if (int.current.trailGlowMesh) {
        int.current.trailGlowMesh.visible = _onEarth && !_isTracking
        const glowOpacity = altKm < 30
          ? MathUtils.clamp(0.15 + 0.25 * (1 - altKm / 30), 0.15, 0.40)
          : 0.15
        int.current.trailGlowMesh.material.opacity = glowOpacity
      }

      // Pulsing selection ring
      const selPos = int.current.selPos
      if (selPos) {
        const rp = ringGeo.attributes.position
        rp.setXYZ(0, selPos.x, selPos.y, selPos.z)
        rp.needsUpdate  = true
        ringGeo.setDrawRange(0, 1)
        const pulse     = 0.55 + 0.45 * Math.sin(Date.now() * 0.004)
        ringMat.opacity = pulse
        ringMat.size    = 18 + 10 * (1 - pulse)
      } else {
        ringGeo.setDrawRange(0, 0)
        ringMat.opacity = 0
      }

      // Hover ring — steady white ring, hidden when something is selected at same spot
      const hoverPos = int.current.hoverPos
      if (hoverPos && hoverPos !== selPos) {
        const hp = hoverRingGeo.attributes.position
        hp.setXYZ(0, hoverPos.x, hoverPos.y, hoverPos.z)
        hp.needsUpdate       = true
        hoverRingGeo.setDrawRange(0, 1)
        hoverRingMat.opacity = 0.85
      } else {
        hoverRingGeo.setDrawRange(0, 0)
        hoverRingMat.opacity = 0
      }

      // ISS blinking overlay — golden star that pulses on/off
      const issPos = int.current.issPos
      if (issPos) {
        const ip = issGeo.attributes.position
        ip.setXYZ(0, issPos.x, issPos.y, issPos.z)
        ip.needsUpdate = true
        issGeo.setDrawRange(0, 1)
        // Fast blink: bright for 600 ms, dim for 400 ms per cycle
        const t = Date.now()
        const blinkOn = (t % 1000) < 600
        issMat.opacity = blinkOn ? 1.0 : 0.15
        issMat.size    = blinkOn ? 32 : 24
      } else {
        issGeo.setDrawRange(0, 0)
      }

      // Pad marker neon pulse
      const padPos = int.current.padMarkerPos
      if (padPos) {
        const pp = padGeo.attributes.position
        pp.setXYZ(0, padPos.x, padPos.y, padPos.z)
        pp.needsUpdate = true
        padGeo.setDrawRange(0, 1)
        const t = Date.now() * 0.003
        padMat.opacity = 0.7 + 0.3 * Math.sin(t)
        padMat.size    = 44 + 8 * Math.sin(t * 0.7)
      } else {
        padGeo.setDrawRange(0, 0)
      }

      windLayer.update()
      renderer.render(scene, camera)
    }
    int.current = {
      renderer, scene, camera, controls,
      windLayer,
      _showWeather: false,
      planeMesh, heavyMesh, regionalMesh, heliMesh, satMesh, shipMesh,
      acPts, acGeo, acPos,
      trailMesh, trailGeo, trailPos, trailCol,
      trailGlowMesh, trailGlowGeo, trailGlowPos, trailGlowCol,
      issPts, issGeo, issMat,
      issPos: null,
      padPts, padGeo, padMat,
      padMarkerPos: null,
      acIds: [],
      catAlloc: null,      // lazily initialised by syncInstances on first call
      idToInstance: null,
      pickIdToAcId: null,  // lazily initialised by syncInstances
      pickScene,
      pickTarget,
      pickMeshes,
      hoveredId: null,
      hoverPos: null,
      setHoverTooltip: (...args) => setHoverTooltipRef.current?.(...args),
      onAircraftClick: int.current.onAircraftClick || null,
      onViewportChange: int.current.onViewportChange || null,
      onSkyObjectClick: int.current.onSkyObjectClick || null,
      onMoonSiteClick: int.current.onMoonSiteClick || null,
      onPlanetClick: int.current.onPlanetClick || null,
      onAirportClick: int.current.onAirportClick || null,
      onScaleReady: int.current.onScaleReady || null,
      selPos: null,
      planeScale: 0.01,
      needsInstanceRebuild: false,
      lastAircraft: null,
      lastSelectedId: null,
      clearTiles,
      solarSystem,
      galaxySystem,
      moonScene,
      earthMesh: earth,
      cloudsMesh: clouds,
      placeDotsMesh: placeDots,
      arController,
      desiLayer,
      targetCameraScale: 'earth',   // set by setCameraScale via imperative handle
      camTweenStart: null,          // timestamp when tween began
      camTweenFrom: null,           // Vector3 camera start position
      planetPositions: null,        // populated by WS solar_system message
      trackTweenStart: null,        // timestamp of flyTo-on-track-start tween
      trackTweenFrom: null,         // Vector3 camera position when tracking started
      flyToTarget: null,            // one-shot flyTo destination (Vector3)
      flyToStart:  null,            // timestamp
      flyToFrom:   null,            // Vector3 camera start
      trackPausedUntil: 0,          // timestamp — user panning pauses tracking lock until this time
      mobilePanel: false,           // true when mobile detail panel is open (offset camera target)
      solarFlyTarget: null,         // planet fly-to destination (Vector3)
      solarFlyStart:  null,
      solarFlyFrom:   null,
    }

    tick()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      el.removeEventListener('mousemove', onMouseMove)
      el.removeEventListener('mouseleave', onMouseLeave)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointerup',   onPointerUp)
      renderer.domElement.removeEventListener('wheel', galaxyWheel)
      renderer.domElement.removeEventListener('touchstart', galaxyTouchStart)
      renderer.domElement.removeEventListener('touchmove', galaxyTouchMove)
      renderer.domElement.removeEventListener('touchend', galaxyTouchEnd)
      mapDestroyed = true
      clearTiles()
      placeGeo.dispose()
      placeDots.material.dispose()
      if (el.contains(labelContainer)) el.removeChild(labelContainer)
      pickTarget.dispose()
      solarSystem.dispose()
      galaxySystem.dispose()
      desiLayer.dispose()
      moonScene.dispose()
      clearTimeout(int.current?._windRetry)
      windLayer.dispose()
      if (arController.isActive()) arController.disable()
      controls.dispose()
      renderer.dispose()
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!int.current?.windLayer) return
    int.current._showWeather = !!showWeather
    if (showWeather) {
      int.current.windLayer.show()
      // Fetch wind data; retry every 30s if backend not ready yet
      const API = import.meta.env.VITE_API_URL || ''
      const fetchWind = () => {
        fetch(`${API}/api/v1/weather/wind`)
          .then(r => {
            if (r.status === 503) {
              // poller not ready — retry after 30s
              int.current._windRetry = setTimeout(fetchWind, 30_000)
              return null
            }
            return r.ok ? r.json() : null
          })
          .then(data => { if (data) int.current.windLayer?.setWindData(data) })
          .catch(() => { int.current._windRetry = setTimeout(fetchWind, 30_000) })
      }
      if (!int.current._windFetched) {
        int.current._windFetched = true
        fetchWind()
      }
    } else {
      int.current.windLayer.hide()
      clearTimeout(int.current._windRetry)
    }
  }, [showWeather])

  useEffect(() => {
    if (int.current) int.current.onAircraftClick = onAircraftClick
  }, [onAircraftClick])

  useEffect(() => {
    if (int.current) int.current.onViewportChange = onViewportChange
  }, [onViewportChange])

  useEffect(() => {
    if (int.current) int.current.onZoomChange = onZoomChange
  }, [onZoomChange])

  useEffect(() => {
    if (int.current) int.current.mobilePanel = !!mobilePanel
  }, [mobilePanel])

  useEffect(() => {
    if (int.current) int.current.onInteract = onInteract
  }, [onInteract])

  useEffect(() => {
    if (!int.current) return
    const wasTracking = int.current.trackingId != null
    int.current.trackingId = trackingId ?? null
    // When tracking starts, initiate a smooth flyTo tween from current camera position
    if (trackingId && !wasTracking) {
      int.current.trackTweenStart = Date.now()
      int.current.trackTweenFrom  = int.current.camera.position.clone()
    } else if (!trackingId) {
      int.current.trackTweenStart = null
      int.current.trackTweenFrom  = null
    }
  }, [trackingId])

  useEffect(() => {
    if (!int.current || !solarData?.planets) return
    // Convert array to name-keyed map for O(1) lookup in the tick loop
    const map = {}
    for (const p of solarData.planets) map[p.name] = p
    int.current.planetPositions = map
  }, [solarData])

  // Set pad marker world position; render loop handles visibility + animation
  useEffect(() => {
    if (!int.current) return
    int.current.padMarkerPos = padMarker?.lat && padMarker?.lon
      ? ll2v(padMarker.lat, padMarker.lon, AC_R)
      : null
  }, [padMarker])

  // When style toggles, update the ref and flush the tile cache so tiles reload with new URLs
  useEffect(() => {
    mapStyleRef.current = mapStyle
    int.current?.clearTiles?.()
  }, [mapStyle])

  // ── Lunar orbiter live data ────────────────────────────────────────────────
  // While on Moon scale, poll /api/v1/lunar/orbiters every 60s and feed the
  // Keplerian propagator in MoonScene. Backend is populated from JPL Horizons.
  useEffect(() => {
    if (cameraScale !== 'moon') return
    let cancelled = false
    const load = async () => {
      try {
        const r = await fetch('/api/v1/lunar/orbiters')
        if (!r.ok) return
        const j = await r.json()
        if (cancelled) return
        if (j?.orbiters && int.current?.moonScene) {
          int.current.moonScene.setRealOrbiterData(j.orbiters)
        }
      } catch (_) { /* silent — synthetic fallback keeps the scene alive */ }
    }
    load()
    const id = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [cameraScale])

  // ── Selection-only fast path: update just 2 colors instead of full 12K sync ─
  useEffect(() => {
    if (!int.current.planeMesh || !int.current.idToInstance) return
    const prev = int.current.lastSelectedId
    if (prev === selectedId) return
    int.current.lastSelectedId = selectedId
    // Deselect old
    if (prev) {
      const inst = int.current.idToInstance.get(prev)
      if (inst) {
        const cat = inst.cat
        const mesh = meshForCat(int.current, cat)
        if (mesh) { mesh.setColorAt(inst.index, defaultColor(cat)); if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true }
      }
    }
    // Select new
    if (selectedId) {
      const inst = int.current.idToInstance.get(selectedId)
      if (inst) {
        const mesh = meshForCat(int.current, inst.cat)
        if (mesh) { mesh.setColorAt(inst.index, _colSelected); if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true }
        if (inst.pos) int.current.selPos = inst.pos
      }
    } else {
      int.current.selPos = null
    }
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update aircraft positions, planes, and trails ─────────────────────────
  // NOTE: selectedId is NOT in deps — selection colors are handled by the
  // fast-path effect above. This prevents 12K full sync + trail rebuild on every tap.
  useEffect(() => {
    if (!int.current.planeMesh || !int.current.acGeo || !aircraft) return

    // Store latest data so the render loop can rebuild instances on zoom change
    int.current.lastAircraft = aircraft

    syncInstances(int.current, aircraft, int.current.lastSelectedId, int.current.hoveredId, false)

    // ── Neon sci-fi trails ───────────────────────────────────────────
    const { trailGeo, trailPos, trailCol,
            trailGlowGeo, trailGlowPos, trailGlowCol } = int.current
    let ti = 0  // vertex index (shared: core and glow are written in lock-step)

    // Prune history for departed aircraft
    for (const id of trailHist.current.keys()) {
      if (!aircraft.has(id)) trailHist.current.delete(id)
    }

    // Per-category neon RGB (additive, so these are peak intensities at the tip)
    const neonColor = (cat) => {
      switch (cat) {
        case 'satellite':  return [0.20, 0.55, 1.00]  // electric blue
        case 'ship':       return [0.13, 0.94, 0.49]  // neon green
        case 'helicopter': return [1.00, 0.60, 0.00]  // amber
        case 'asteroid':
        case 'planet':
        case 'rocket':     return [1.00, 0.40, 0.10]  // orange-red
        default:           return [0.00, 0.90, 1.00]  // cyan (planes)
      }
    }

    for (const [id, a] of aircraft) {
      const cat    = a.cat || 'plane'
      const [r, g, b] = neonColor(cat)

      // Core trail at TRAIL_R, glow slightly above at TRAIL_GLOW_R
      const baseVec = ll2v(a.lat, a.lon, 1.0).normalize()
      const vCore   = baseVec.clone().multiplyScalar(TRAIL_R)
      const vGlow   = baseVec.clone().multiplyScalar(TRAIL_GLOW_R)

      let hist = trailHist.current.get(id)
      if (!hist) {
        hist = { core: [], glow: [] }
        trailHist.current.set(id, hist)
      }
      // Back-compat: if hist was stored as an array (old format), reset it
      if (Array.isArray(hist)) {
        hist = { core: [], glow: [] }
        trailHist.current.set(id, hist)
      }

      const lastCore = hist.core[hist.core.length - 1]
      if (!lastCore || vCore.distanceTo(lastCore) > 0.000005) {
        hist.core.push(vCore.clone())
        hist.glow.push(vGlow.clone())
        if (hist.core.length > MAX_TRAIL_PTS) { hist.core.shift(); hist.glow.shift() }
      }

      const n = hist.core.length
      if (n < 2) continue

      for (let k = 0; k < n - 1; k++) {
        if (ti + 2 > MAX_TRAIL_VERTS) break

        const frac0 = k       / (n - 1)   // 0 = oldest (tail), 1 = newest (tip)
        const frac1 = (k + 1) / (n - 1)

        // Brightness curve: cubic ease-in so tail fades fast, tip stays bright
        const b0 = Math.pow(frac0, 0.6)
        const b1 = Math.pow(frac1, 0.6)

        const p0c = hist.core[k],     p1c = hist.core[k + 1]
        const p0g = hist.glow[k],     p1g = hist.glow[k + 1]

        // ── Core vertices ─────────────────────────────────────────────
        trailPos[ti * 3]     = p0c.x; trailPos[ti * 3 + 1] = p0c.y; trailPos[ti * 3 + 2] = p0c.z
        trailCol[ti * 3]     = r * b0; trailCol[ti * 3 + 1] = g * b0; trailCol[ti * 3 + 2] = b * b0
        trailGlowPos[ti * 3]     = p0g.x; trailGlowPos[ti * 3 + 1] = p0g.y; trailGlowPos[ti * 3 + 2] = p0g.z
        trailGlowCol[ti * 3]     = r * b0 * 0.6; trailGlowCol[ti * 3 + 1] = g * b0 * 0.6; trailGlowCol[ti * 3 + 2] = b * b0 * 0.6
        ti++

        trailPos[ti * 3]     = p1c.x; trailPos[ti * 3 + 1] = p1c.y; trailPos[ti * 3 + 2] = p1c.z
        trailCol[ti * 3]     = r * b1; trailCol[ti * 3 + 1] = g * b1; trailCol[ti * 3 + 2] = b * b1
        trailGlowPos[ti * 3]     = p1g.x; trailGlowPos[ti * 3 + 1] = p1g.y; trailGlowPos[ti * 3 + 2] = p1g.z
        trailGlowCol[ti * 3]     = r * b1 * 0.6; trailGlowCol[ti * 3 + 1] = g * b1 * 0.6; trailGlowCol[ti * 3 + 2] = b * b1 * 0.6
        ti++
      }
    }

    // Flush core
    trailGeo.setDrawRange(0, ti)
    trailGeo.attributes.position.needsUpdate = true
    trailGeo.attributes.color.needsUpdate    = true

    // Flush glow
    trailGlowGeo.setDrawRange(0, ti)
    trailGlowGeo.attributes.position.needsUpdate = true
    trailGlowGeo.attributes.color.needsUpdate    = true
  }, [aircraft]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={mountRef} className={styles.globe}>

      {createPortal(
        <div className={styles.mapToggle}>
          <button
            className={mapStyle === 'street' ? styles.active : ''}
            onClick={() => setMapStyle('street')}
          >Street</button>
          <button
            className={mapStyle === 'satellite' ? styles.active : ''}
            onClick={() => setMapStyle('satellite')}
          >Satellite</button>
        </div>,
        document.body
      )}

      {cameraInfo.altLabel && createPortal(
        <div className={styles.cameraHud}>
          <div className={styles.hudAlt}>
            <span className={styles.hudLabel}>ALT</span>
            <span className={styles.hudValue}>{cameraInfo.altLabel}</span>
          </div>
          <div className={styles.hudScaleWrap}>
            <div className={styles.hudScaleBar} style={{ transform: `scaleX(${(cameraInfo.scaleBarPx / 80).toFixed(3)})` }} />
            <span className={styles.hudScaleLabel}>{cameraInfo.scaleLabel}</span>
          </div>
        </div>,
        document.body
      )}

      {hoverTooltip && createPortal(
        hoverTooltip.desi
          ? <DESITooltip x={hoverTooltip.x} y={hoverTooltip.y} data={hoverTooltip.desi} />
          : <AircraftTooltip x={hoverTooltip.x} y={hoverTooltip.y} data={hoverTooltip.data} />,
        document.body
      )}

      {moonTransit && createPortal(<WarpOverlay />, document.body)}

      {cameraScale === 'galaxy' && createPortal(
        <CompassBar headingRef={galaxyHeadingRef} />,
        document.body
      )}

    </div>
  )
})

// ── Hover tooltip ─────────────────────────────────────────────────────────────

function AircraftTooltip({ x, y, data }) {
  if (!data) return null

  const cat      = data.cat || 'plane'
  const callsign = data.cs || data.id || '—'
  const altFt    = data.alt != null ? Math.round(data.alt).toLocaleString() + ' ft' : null
  const altKm    = data.alt_km != null ? data.alt_km.toFixed(0) + ' km' : null
  const altitude = altFt ?? altKm ?? '—'
  const speed    = data.spd != null ? Math.round(data.spd) + ' kt' : null
  const hdg      = data.hdg ?? data.heading ?? data.trk ?? data.cog
  const heading  = hdg != null ? Math.round(hdg) + '°' : null

  // Offset tooltip so it doesn't overlap the cursor
  const left = x + 14
  const top  = y - 10

  return (
    <div
      style={{
        position: 'fixed',
        left,
        top,
        pointerEvents: 'none',
        zIndex: 9999,
        background: 'rgba(8, 14, 24, 0.92)',
        border: '1px solid rgba(255, 215, 0, 0.55)',
        borderRadius: '4px',
        padding: '7px 11px 8px',
        minWidth: '130px',
        backdropFilter: 'blur(6px)',
        boxShadow: '0 2px 16px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,215,0,0.12)',
        fontFamily: "'Space Mono', 'Courier New', monospace",
      }}
    >
      {/* Callsign / ID row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px' }}>
        <span style={{
          display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%',
          background: cat === 'helicopter' ? '#e08010'
                    : cat === 'satellite'  ? '#9090cc'
                    : cat === 'ship'       ? '#20e88a'
                    : '#5ab4ff',
          flexShrink: 0,
        }} />
        <span style={{
          fontSize: '12px', fontWeight: '700', letterSpacing: '0.06em',
          color: 'rgba(255,230,100,0.95)', textTransform: 'uppercase',
        }}>{callsign}</span>
      </div>

      {/* Data rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <TooltipRow label="ALT" value={altitude} />
        {speed   && <TooltipRow label="SPD" value={speed} />}
        {heading && <TooltipRow label="HDG" value={heading} />}
      </div>
    </div>
  )
}

// ── DESI galaxy hover tooltip ──────────────────────────────────────────────

function DESITooltip({ x, y, data }) {
  if (!data) return null
  const C = 299792.458, H0 = 67.4, OM = 0.315, OL = 0.685
  // Quick comoving distance (Mpc)
  const n = 50, dz = data.z / n
  let sum = 0
  for (let i = 0; i < n; i++) {
    const zi = (i + 0.5) * dz
    sum += dz / Math.sqrt(OM * (1 + zi) ** 3 + OL)
  }
  const distMpc = (C / H0) * sum
  const distBLY = (distMpc * 3.2616 / 1000).toFixed(2) // billion light-years

  const left = x + 14, top = y - 10
  const isQSO = data.type === 'Quasar'
  const borderColor = isQSO ? 'rgba(255, 180, 60, 0.55)' : 'rgba(140, 120, 255, 0.55)'
  const dotColor = isQSO ? '#ffb43c' : '#8c78ff'
  const nameColor = isQSO ? 'rgba(255,200,100,0.95)' : 'rgba(180,170,255,0.95)'

  return (
    <div style={{
      position: 'fixed', left, top, pointerEvents: 'none', zIndex: 9999,
      background: 'rgba(8, 10, 22, 0.94)', border: `1px solid ${borderColor}`,
      borderRadius: '4px', padding: '7px 11px 8px', minWidth: '140px',
      backdropFilter: 'blur(6px)',
      boxShadow: `0 2px 16px rgba(0,0,0,0.6), 0 0 0 1px ${borderColor.replace('0.55', '0.12')}`,
      fontFamily: "'Space Mono', 'Courier New', monospace",
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px' }}>
        <span style={{
          display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%',
          background: dotColor, flexShrink: 0,
          boxShadow: `0 0 6px ${dotColor}`,
        }} />
        <span style={{
          fontSize: '12px', fontWeight: '700', letterSpacing: '0.06em',
          color: nameColor, textTransform: 'uppercase',
        }}>DESI {data.type}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <TooltipRow label="z" value={data.z.toFixed(4)} />
        <TooltipRow label="DIST" value={`${distBLY} Bly`} />
        <TooltipRow label="RA" value={`${data.ra.toFixed(2)}°`} />
        <TooltipRow label="DEC" value={`${data.dec.toFixed(2)}°`} />
      </div>
    </div>
  )
}

function TooltipRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px' }}>
      <span style={{ fontSize: '9px', letterSpacing: '0.1em', color: 'rgba(100,160,255,0.65)', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: '11px', color: 'rgba(200,220,255,0.9)', fontWeight: '500' }}>{value}</span>
    </div>
  )
}

// ── Warp overlay — rocket-launch → hyperspace → Moon arrival ─────────────

const WARP_DURATION = 2400 // matches CAM_MOON_TWEEN_MS

// Pre-generate 80 star streaks at random positions; each is a tiny dot
// that elongates radially outward via CSS animation.
const STARS = Array.from({ length: 80 }, (_, i) => {
  const angle = Math.random() * Math.PI * 2
  const dist  = 0.08 + Math.random() * 0.35  // start distance from center (fraction of screen)
  const x = 50 + Math.cos(angle) * dist * 100  // % from left
  const y = 50 + Math.sin(angle) * dist * 100  // % from top
  const len = 2 + Math.random() * 4           // streak length px
  const delay = Math.random() * 0.4           // s
  const dur = 0.6 + Math.random() * 1.0       // s
  const deg = (angle * 180 / Math.PI) + 90    // rotate to point outward
  return { x, y, len, delay, dur, deg, key: i }
})

function WarpOverlay() {
  const dur = WARP_DURATION + 'ms'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300, pointerEvents: 'none',
      animation: `warpFade ${dur} ease-in-out forwards`,
    }}>
      {/* Bottom launch glow — orange/white flare at screen bottom */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%',
        background: 'linear-gradient(to top, rgba(255,140,40,0.35), rgba(255,200,100,0.08) 40%, transparent)',
        animation: `launchGlow ${dur} ease-out forwards`,
      }} />

      {/* Central light burst */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        width: '1px', height: '1px',
        background: 'radial-gradient(circle, rgba(200,220,255,0.5) 0%, transparent 70%)',
        transform: 'translate(-50%,-50%)',
        animation: `burstScale ${dur} ease-in-out forwards`,
      }} />

      {/* Star streaks */}
      {STARS.map(s => (
        <div key={s.key} style={{
          position: 'absolute',
          left: s.x + '%', top: s.y + '%',
          width: '1.5px', height: s.len + 'px',
          background: 'linear-gradient(to bottom, rgba(255,255,255,0.9), rgba(200,220,255,0))',
          borderRadius: '1px',
          '--r': s.deg + 'deg',
          opacity: 0,
          animation: `streak ${s.dur}s ${s.delay}s ease-out forwards`,
        }} />
      ))}

      {/* Inline keyframes */}
      <style>{`
        @keyframes warpFade {
          0%   { background: rgba(0,0,0,0); }
          20%  { background: rgba(0,0,0,0.85); }
          50%  { background: rgba(0,2,8,0.92); }
          80%  { background: rgba(0,0,0,0.6); }
          100% { background: rgba(0,0,0,0); }
        }
        @keyframes launchGlow {
          0%   { opacity: 0; transform: scaleY(0.3); }
          15%  { opacity: 1; transform: scaleY(1); }
          40%  { opacity: 0.6; transform: scaleY(1.5); }
          60%  { opacity: 0; transform: scaleY(2); }
          100% { opacity: 0; }
        }
        @keyframes burstScale {
          0%   { width: 1px; height: 1px; opacity: 0; }
          30%  { width: 300px; height: 300px; opacity: 0.4; }
          60%  { width: 600px; height: 600px; opacity: 0.15; }
          100% { width: 900px; height: 900px; opacity: 0; }
        }
        @keyframes streak {
          0%   { opacity: 0; transform: rotate(var(--r, 0deg)) scaleY(1) translateY(0); }
          15%  { opacity: 0.9; }
          100% { opacity: 0; transform: rotate(var(--r, 0deg)) scaleY(8) translateY(-120px); }
        }
      `}</style>
    </div>
  )
}
