import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Vector3, Vector2, Matrix4, Color, MathUtils,
  Scene, PerspectiveCamera, WebGLRenderer,
  BufferGeometry, BufferAttribute, DynamicDrawUsage,
  PlaneGeometry, SphereGeometry, DodecahedronGeometry, EdgesGeometry,
  Mesh, InstancedMesh, Line, LineSegments, Points,
  MeshBasicMaterial, MeshStandardMaterial, MeshPhongMaterial,
  LineBasicMaterial, PointsMaterial, ShaderMaterial,
  AmbientLight, DirectionalLight,
  TextureLoader, CanvasTexture,
  Raycaster,
  FrontSide, DoubleSide, AdditiveBlending,
  LinearMipmapLinearFilter, LinearFilter,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createSolarSystem } from './SolarSystemScene.js'
import { createGalaxyScene } from './GalaxyScene.js'
import { CAM_SOLAR, CAM_EARTH, CAM_GALAXY, CAM_TWEEN_MS, SOLAR_FAR } from './solarSystem.js'
import styles from './Globe.module.css'

// ── Constants ────────────────────────────────────────────────────────────────

const EARTH_R      = 1.0
const CLOUD_R      = 1.006
const ATM_SCALE    = 1.18
const AC_R         = 1.013
const TRAIL_R      = 1.018   // trail core — slightly above aircraft
const TRAIL_GLOW_R = 1.023   // glow layer — above core for sci-fi bloom effect

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

// Great-circle interpolation for API flight paths
function greatCirclePoints(pts, r = EARTH_R + 0.035, steps = 40) {
  if (!pts?.length) return []
  const verts = []
  for (let i = 0; i < pts.length - 1; i++) {
    const v0 = ll2v(pts[i].latitude, pts[i].longitude, 1).normalize()
    const v1 = ll2v(pts[i + 1].latitude, pts[i + 1].longitude, 1).normalize()
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      verts.push(new Vector3().copy(v0).lerp(v1, t).normalize().multiplyScalar(r))
    }
  }
  return verts
}

// ── Vector-map helpers ────────────────────────────────────────────────────

// Fetch world-atlas TopoJSON and decode to [[lon,lat],…] polylines (country borders).
async function loadWorldLines() {
  try {
    const res  = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
    const topo = await res.json()
    const { scale: [sx, sy], translate: [tx, ty] } = topo.transform
    return topo.arcs.map(arc => {
      let x = 0, y = 0
      return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty] })
    })
  } catch { return [] }
}

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

// Tile URL: CartoDB Voyager @2x (street) or ESRI World Imagery (satellite).
// Both are free with no API key required.
function getTileUrl(tx, ty, z, style) {
  if (style === 'satellite') {
    return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`
  }
  const s = 'abcd'[(Math.abs(tx) + Math.abs(ty)) % 4]
  return `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${tx}/${ty}@2x.png`
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

function buildPlaneTex() {
  const sz  = 64
  const c   = document.createElement('canvas')
  c.width   = c.height = sz
  const ctx = c.getContext('2d')
  // canvas y=0 is top → maps to texture v=1 → PlaneGeometry local +Y (heading direction)
  const cx = sz / 2, cy = sz / 2, s = sz * 0.40
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(cx,          cy - s * 1.10)  // nose tip (top of canvas)
  ctx.lineTo(cx + s*0.14, cy - s * 0.30)  // right fuselage
  ctx.lineTo(cx + s*0.14, cy + s * 0.05)  // right wing root
  ctx.lineTo(cx + s*0.95, cy + s * 0.45)  // right wing tip
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
  ctx.lineTo(cx - s*0.95, cy + s * 0.45)  // left wing tip
  ctx.lineTo(cx - s*0.14, cy + s * 0.05)  // left wing root
  ctx.lineTo(cx - s*0.14, cy - s * 0.30)  // left fuselage
  ctx.closePath()
  ctx.fill()
  return new CanvasTexture(c)
}

// Heavy widebody — same silhouette as default plane but with a wider wingspan ratio.
function buildHeavyPlaneTex() {
  const sz  = 64
  const c   = document.createElement('canvas')
  c.width   = c.height = sz
  const ctx = c.getContext('2d')
  const cx = sz / 2, cy = sz / 2, s = sz * 0.40
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(cx,          cy - s * 1.10)  // nose tip
  ctx.lineTo(cx + s*0.14, cy - s * 0.30)  // right fuselage
  ctx.lineTo(cx + s*0.14, cy + s * 0.00)  // right wing root
  ctx.lineTo(cx + s*1.15, cy + s * 0.38)  // right wing tip (wider: 1.15 vs 0.95)
  ctx.lineTo(cx + s*1.15, cy + s * 0.54)  // right wing trailing
  ctx.lineTo(cx + s*0.14, cy + s * 0.32)  // right wing root trailing
  ctx.lineTo(cx + s*0.14, cy + s * 0.60)  // right tail root
  ctx.lineTo(cx + s*0.50, cy + s * 1.05)  // right tail tip (wider tail too)
  ctx.lineTo(cx + s*0.13, cy + s * 0.90)
  ctx.lineTo(cx,          cy + s * 0.95)
  ctx.lineTo(cx - s*0.13, cy + s * 0.90)
  ctx.lineTo(cx - s*0.50, cy + s * 1.05)
  ctx.lineTo(cx - s*0.14, cy + s * 0.60)
  ctx.lineTo(cx - s*0.14, cy + s * 0.32)
  ctx.lineTo(cx - s*1.15, cy + s * 0.54)
  ctx.lineTo(cx - s*1.15, cy + s * 0.38)
  ctx.lineTo(cx - s*0.14, cy + s * 0.00)
  ctx.lineTo(cx - s*0.14, cy - s * 0.30)
  ctx.closePath()
  ctx.fill()
  return new CanvasTexture(c)
}

// Regional jet — compact body, shorter/narrower wings.
function buildRegionalPlaneTex() {
  const sz  = 64
  const c   = document.createElement('canvas')
  c.width   = c.height = sz
  const ctx = c.getContext('2d')
  const cx = sz / 2, cy = sz / 2, s = sz * 0.40
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(cx,          cy - s * 1.00)  // nose tip (shorter fuselage)
  ctx.lineTo(cx + s*0.12, cy - s * 0.25)
  ctx.lineTo(cx + s*0.12, cy + s * 0.08)
  ctx.lineTo(cx + s*0.72, cy + s * 0.42)  // wing tip (narrower: 0.72 vs 0.95)
  ctx.lineTo(cx + s*0.72, cy + s * 0.56)
  ctx.lineTo(cx + s*0.12, cy + s * 0.36)
  ctx.lineTo(cx + s*0.12, cy + s * 0.58)
  ctx.lineTo(cx + s*0.36, cy + s * 0.95)  // tail (smaller)
  ctx.lineTo(cx + s*0.09, cy + s * 0.82)
  ctx.lineTo(cx,          cy + s * 0.88)
  ctx.lineTo(cx - s*0.09, cy + s * 0.82)
  ctx.lineTo(cx - s*0.36, cy + s * 0.95)
  ctx.lineTo(cx - s*0.12, cy + s * 0.58)
  ctx.lineTo(cx - s*0.12, cy + s * 0.36)
  ctx.lineTo(cx - s*0.72, cy + s * 0.56)
  ctx.lineTo(cx - s*0.72, cy + s * 0.42)
  ctx.lineTo(cx - s*0.12, cy + s * 0.08)
  ctx.lineTo(cx - s*0.12, cy - s * 0.25)
  ctx.closePath()
  ctx.fill()
  return new CanvasTexture(c)
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

function buildMatrix(a, cat, planeScale, camDist) {
  let r = AC_R
  if (cat === 'satellite') r = EARTH_R + (a.alt_km ?? 400) / 6371
  else if (cat === 'ship') r = EARTH_R * 1.002   // above tile layers (1.001 parent, 1.0015 detail)
  // (plane/heli/heavy/regional all default to AC_R = 1.013)

  // Universal clamp: if the entity layer is at or behind the camera, pull it just
  // in front so it never clips past the near plane at close zoom.
  // Satellites are exempt — they orbit above the camera at street-level zoom.
  // Clamp non-satellite entities to always appear in front of the camera near-clip.
  // Offset = 50 % of camera altitude, ensuring the entity is past the near plane
  // (near = altUnit * 0.1) with plenty of margin at any zoom level.
  if (cat !== 'satellite' && camDist !== undefined && r >= camDist) {
    const _altUnit = camDist - EARTH_R
    r = Math.max(EARTH_R + 0.00001, camDist - _altUnit * 0.5)
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
    state.idToInstance = new Map()
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
      inst = { mesh, index: slot, cat, pos: null, lat: null, lon: null, hdg: null }
      idToInstance.set(id, inst)
      // Set initial color
      const sel = id === selectedId, hov = id === hoveredId && !sel
      mesh.setColorAt(slot, sel ? _colSelected : hov ? _colHover : defaultColor(cat))
      meshDirty.add(mesh)
    }

    // ── Skip matrix recomputation if position/heading unchanged ─────────────
    const headDeg = a.hdg ?? a.heading ?? a.trk ?? a.cog ?? 0
    const moved = forceScale
      || inst.lat  === null
      || Math.abs(a.lat  - inst.lat)  > 0.00015   // ~17 m
      || Math.abs(a.lon  - inst.lon)  > 0.00015
      || Math.abs(headDeg - inst.hdg) > 1.5        // degrees

    if (moved) {
      const pos = buildMatrix(a, cat, planeScale, state.camDist)
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

export const Globe = forwardRef(function Globe({ aircraft, selectedId, onAircraftClick, onViewportChange, trackingId, solarData, padMarker, onInteract, onPlanetClick, neoData }, ref) {
  const mountRef    = useRef(null)
  const int         = useRef({})
  const trailHist   = useRef(new Map())
  const apiTrailRef = useRef(null)
  const [mapStyle, setMapStyle] = useState('satellite')
  const mapStyleRef = useRef('satellite')
  const [cameraInfo, setCameraInfo] = useState({ altM: null, scaleLabel: '', scaleBarPx: 80 })
  const [cameraScale, setCameraScale] = useState('earth')   // 'earth' | 'solar'
  const [hoverTooltip, setHoverTooltip] = useState(null)  // { x, y, data }
  const setHoverTooltipRef = useRef(null)
  setHoverTooltipRef.current = setHoverTooltip

  // ── API trail: draw departure→arrival path from detail panel ─────────────
  const drawTrail = useCallback((points) => {
    const { scene } = int.current
    if (!scene) return

    if (apiTrailRef.current) {
      apiTrailRef.current.forEach(obj => {
        scene.remove(obj)
        obj.geometry.dispose()
        obj.material.dispose()
      })
      apiTrailRef.current = null
    }
    if (!points?.length) return

    const verts = greatCirclePoints(points)
    if (verts.length < 2) return

    const geo = new BufferGeometry().setFromPoints(verts)

    // Core: bright cyan-white
    const coreLine = new Line(geo, new LineBasicMaterial({
      color: 0x00eeff, transparent: true, opacity: 0.95,
      depthWrite: false, blending: AdditiveBlending,
    }))
    coreLine.renderOrder = 12

    // Inner glow: tighter cyan
    const geo2     = new BufferGeometry().setFromPoints(verts)
    const glowLine = new Line(geo2, new LineBasicMaterial({
      color: 0x00aaff, transparent: true, opacity: 0.45,
      depthWrite: false, blending: AdditiveBlending,
    }))
    glowLine.renderOrder = 11

    // Outer bloom: wide, very soft
    const geo3      = new BufferGeometry().setFromPoints(verts)
    const bloomLine = new Line(geo3, new LineBasicMaterial({
      color: 0x003366, transparent: true, opacity: 0.20,
      depthWrite: false, blending: AdditiveBlending,
    }))
    bloomLine.renderOrder = 10

    scene.add(bloomLine)
    scene.add(glowLine)
    scene.add(coreLine)
    apiTrailRef.current = [coreLine, glowLine, bloomLine]
  }, [])

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
  }), [drawTrail, setCameraScale])

  // Sync onPlanetClick prop into int.current so native event closures can read it
  useEffect(() => { int.current.onPlanetClick = onPlanetClick }, [onPlanetClick])

  // Push NEO asteroid data into the solar scene whenever it arrives
  useEffect(() => {
    if (neoData?.length) int.current.solarSystem?.updateNEOs(neoData)
  }, [neoData])

  // ── Three.js init ──────────────────────────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current
    if (!el) return

    const renderer = new WebGLRenderer({ antialias: true })
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
    controls.dampingFactor   = 0.08
    controls.enablePan       = false
    controls.minDistance     = 1.00002   // ~127 m altitude → zoom 18 tiles (~0.6 m/px)
    controls.maxDistance     = 8
    controls.zoomSpeed       = 0.7       // applies to both mouse wheel and trackpad pinch
    controls.autoRotate      = true
    controls.autoRotateSpeed = 0.18
    renderer.domElement.addEventListener('pointerdown', () => {
      controls.autoRotate = false
      int.current.onInteract?.()
    })
    renderer.domElement.addEventListener('wheel', () => { int.current.onInteract?.() }, { passive: true })

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
      // Zoomed in: compute centre lat/lon using the same convention as v2ll
      const latC = Math.asin(MathUtils.clamp(camPos.y / dist, -1, 1)) * (180 / Math.PI)
      const lonC = Math.atan2(camPos.z, -camPos.x) * (180 / Math.PI) - 180
      // Half-span shrinks linearly as we zoom in
      const span = 15 + (dist - 1) * 55   // ~70° at dist=2.2, ~15° at dist=1.0
      const ne = { lat: Math.min( 90, latC + span), lng: Math.min(180, lonC + span) }
      const sw = { lat: Math.max(-90, latC - span), lng: Math.max(-180, lonC - span) }
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
      color: 0x0d2b6b, roughness: 0.75, metalness: 0.05,
    })
    const earth = new Mesh(earthGeo, earthMat)
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

    // ── Atmosphere ───────────────────────────────────────────────────
    scene.add(makeAtmosphere())

    // ── Subtle dodecahedron wireframe ─────────────────────────────────
    const dodecGeo = new DodecahedronGeometry(EARTH_R + 0.003, 0)
    const edgesGeo = new EdgesGeometry(dodecGeo)
    const edgePos  = edgesGeo.getAttribute('position')
    const arcVerts = []
    const STEPS    = 16
    for (let i = 0; i < edgePos.count; i += 2) {
      const v1 = new Vector3(edgePos.getX(i),     edgePos.getY(i),     edgePos.getZ(i)).normalize()
      const v2 = new Vector3(edgePos.getX(i + 1), edgePos.getY(i + 1), edgePos.getZ(i + 1)).normalize()
      for (let s = 0; s < STEPS; s++) {
        const p0 = new Vector3().copy(v1).lerp(v2, s / STEPS).normalize().multiplyScalar(EARTH_R + 0.003)
        const p1 = new Vector3().copy(v1).lerp(v2, (s + 1) / STEPS).normalize().multiplyScalar(EARTH_R + 0.003)
        arcVerts.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z)
      }
    }
    const dodecArcGeo = new BufferGeometry()
    dodecArcGeo.setAttribute('position', new BufferAttribute(new Float32Array(arcVerts), 3))
    scene.add(new LineSegments(dodecArcGeo, new LineBasicMaterial({
      color: 0x1a3a6a, transparent: true, opacity: 0.10,
      depthWrite: false, blending: AdditiveBlending,
    })))
    dodecGeo.dispose(); edgesGeo.dispose()

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

    // ── Solar system ──────────────────────────────────────────────────
    // Hidden by default; shown when cameraScale transitions to 'solar'.
    const solarSystem = createSolarSystem(scene, renderer)

    // Hidden by default; shown when cameraScale transitions to 'galaxy'.
    const galaxySystem = createGalaxyScene(scene)

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

    // ── Vector map: country borders (async fetch, added when ready) ───
    let mapDestroyed = false
    let borderMat    = null   // keep a reference for per-frame fade
    loadWorldLines().then(lines => {
      if (mapDestroyed || !lines.length) return
      const pts = []
      const R   = EARTH_R + 0.003   // above tile layer (tiles sit at 1.0015)
      for (const line of lines) {
        for (let i = 0; i < line.length - 1; i++) {
          const [lo0, la0] = line[i], [lo1, la1] = line[i + 1]
          const v0 = ll2v(la0, lo0, R), v1 = ll2v(la1, lo1, R)
          pts.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z)
        }
      }
      const borderGeo  = new BufferGeometry()
      borderGeo.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3))
      borderMat = new LineBasicMaterial({
        color: 0x00e87a, transparent: true, opacity: 0.55,
        depthWrite: false, blending: AdditiveBlending,
      })
      const borderMesh = new LineSegments(borderGeo, borderMat)
      borderMesh.renderOrder = 4   // above tiles (0-1) and earth (default)
      scene.add(borderMesh)
    })

    // ── Tile system: priority-queue quadtree loader ───────────────────
    // Tiles sit at two elevations:
    //   Parent placeholders (z-2): EARTH_R * 1.001,  renderOrder 0
    //   Full-detail tiles   (z)  : EARTH_R * 1.0015, renderOrder 1
    // Country borders at EARTH_R + 0.003 render above both.
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

        const r    = item.isParent ? EARTH_R * 1.001 : EARTH_R * 1.0015
        const geo  = buildTileGeo(item.tx, item.ty, item.z, r)
        const mat  = new MeshBasicMaterial({
          transparent: true, opacity: 0, side: FrontSide,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: item.isParent ? -1 : -2,
          polygonOffsetUnits:  item.isParent ? -1 : -2,
        })
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
            mat.opacity = item.isParent ? 0.88 : 1.0
            mat.needsUpdate = true
            // Fresh tiles always draw on top of demoted stale tiles
            mesh.renderOrder = item.isParent ? 0 : 1
            scene.add(mesh)
            tileCache.set(key, { mesh, mat, geo, tx: item.tx, ty: item.ty, z: item.z, isParent: item.isParent, isStale: false })
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

      // ── Globe mode: far zoom → pure blue-marble, no tiles ─────────────────
      if (dist > TILE_DIST_THRESHOLD) {
        if (inTileMode) { clearTiles(); inTileMode = false }
        return
      }
      inTileMode = true

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

      // Demote stale detail tiles to background tier instead of removing them.
      // This prevents black gaps while new tiles load — old tiles stay visible at
      // renderOrder 0 (behind fresh detail tiles at renderOrder 1).
      if (_prevTileZ !== -1 && _prevTileZ !== z) {
        for (const [, _staleTile] of tileCache) {
          if (!_staleTile || _staleTile.isParent || _staleTile.z === z) continue
          _staleTile.mesh.renderOrder = 0
          _staleTile.mat.opacity      = 0.75
          _staleTile.mat.needsUpdate  = true
          _staleTile.isStale          = true
        }
      }

      const radius = z >= 13 ? 2 : z >= 10 ? 3 : z >= 7 ? 4 : 5

      // Grandparent tier (z-3): lowest-res, loads fast, always covers bare areas
      const gpz  = Math.max(0, z - 3)
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
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const tx = ((cx + dx) % N + N) % N
          const ty = Math.max(0, Math.min(N - 1, cy + dy))
          const _dk = tileKey(tx, ty, z)
          if (!tileCache.has(_dk) && !failedTiles.has(_dk)) {
            newItems.push({ tx, ty, z, isParent: false,
                            priority: radius * 2 - (Math.abs(dx) + Math.abs(dy)) })
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
        const evictRadius = t.isStale ? radius + 1 : radius + 5
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
      const _screenH = el.clientHeight || 1080
      ray.params.Points.threshold = (2 * camera.position.length() * Math.tan((40 / 2) * Math.PI / 180)) / _screenH * 8
      ray.setFromCamera(mouse, camera)
    }

    const onMouseMove = e => {
      toNDC(e.clientX, e.clientY)
      const hits  = ray.intersectObject(acPts)
      const newId = hits.length ? int.current.acIds?.[hits[0].index] : null
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

    let downAt = null
    const onPointerDown = e => { downAt = { x: e.clientX, y: e.clientY } }
    const onPointerUp   = e => {
      if (!downAt) return
      const dx = Math.abs(e.clientX - downAt.x)
      const dy = Math.abs(e.clientY - downAt.y)
      downAt = null
      if (dx > 14 || dy > 14) return
      toNDC(e.clientX, e.clientY)

      // ── Solar scale: check planet meshes first ────────────────────────
      if (int.current.targetCameraScale === 'solar' && solarSystem.solarGroup.visible) {
        const planetMeshList = Object.values(solarSystem.planetMeshes)
        const planetHits = ray.intersectObjects(planetMeshList, false)
        if (planetHits.length) {
          const name = planetHits[0].object.userData.planet
          if (name) { int.current.onPlanetClick?.(name); return }
        }
      }

      const hits = ray.intersectObject(acPts)
      if (hits.length) {
        // Project every hit to screen space and pick the one closest to the actual click pixel.
        // This avoids selecting a nearby entity that happens to be first along the ray axis.
        let bestId = null, bestDist = Infinity
        for (const hit of hits) {
          const ndc = hit.point.clone().project(camera)
          const d   = (ndc.x - mouse.x) ** 2 + (ndc.y - mouse.y) ** 2
          if (d < bestDist) { bestDist = d; bestId = int.current.acIds?.[hit.index] }
        }
        if (bestId) int.current.onAircraftClick?.(bestId)
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
    }
    window.addEventListener('resize', onResize)

    // ── Render loop ──────────────────────────────────────────────────
    let raf
    let lastSunUpdate = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      // ── Live tracking: lock camera rotation onto tracked entity ──────────
      // The user can still zoom (change distance); only rotation is driven by the entity.
      const _trackId = int.current.trackingId
      if (_trackId) {
        const _trackedInst = int.current.idToInstance?.get(_trackId)
        if (_trackedInst?.lat != null) {
          const _d = camera.position.length()
          const _targetPos = ll2v(_trackedInst.lat, _trackedInst.lon, EARTH_R)
            .normalize().multiplyScalar(_d)

          const _tweenStart = int.current.trackTweenStart
          if (_tweenStart != null) {
            // Smooth flyTo: slerp along the sphere surface for 1.4 s
            const _elapsed = Date.now() - _tweenStart
            const _TWEEN_MS = 1400
            const _rawT = Math.min(_elapsed / _TWEEN_MS, 1)
            // ease-out cubic
            const _t = 1 - Math.pow(1 - _rawT, 3)
            const _from = int.current.trackTweenFrom
            // Spherical interpolation: lerp then re-normalise to keep on sphere
            const _interp = new Vector3().lerpVectors(_from, _targetPos, _t)
            camera.position.copy(_interp.normalize().multiplyScalar(_d))
            if (_rawT >= 1) {
              int.current.trackTweenStart = null
              int.current.trackTweenFrom  = null
            }
          } else {
            // Tween done — lock to aircraft every frame
            camera.position.copy(_targetPos)
          }

          camera.lookAt(0, 0, 0)
          controls.enableRotate = false
        }
      } else {
        controls.enableRotate = true

        // ── One-shot flyTo tween (not tracking — just navigate to a point) ──
        const _flyStart = int.current.flyToTarget ? int.current.flyToStart : null
        if (_flyStart != null) {
          const _elapsed = Date.now() - _flyStart
          const _TWEEN_MS = 1600
          const _rawT = Math.min(_elapsed / _TWEEN_MS, 1)
          const _t = 1 - Math.pow(1 - _rawT, 3) // ease-out cubic
          const _interp = new Vector3()
            .lerpVectors(int.current.flyToFrom, int.current.flyToTarget, _t)
          camera.position.copy(_interp.normalize().multiplyScalar(int.current.flyToTarget.length()))
          camera.lookAt(0, 0, 0)
          if (_rawT >= 1) {
            int.current.flyToTarget = null
            int.current.flyToStart  = null
            int.current.flyToFrom   = null
          }
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

      // ── Camera scale tween (earth ↔ solar ↔ galaxy) ─────────────────────────
      const targetScale = int.current.targetCameraScale || 'earth'
      const isSolar   = targetScale === 'solar'
      const isGalaxy  = targetScale === 'galaxy'
      const CAM_TARGET = isGalaxy ? CAM_GALAXY : isSolar ? CAM_SOLAR : CAM_EARTH

      if (int.current.camTweenStart != null) {
        const elapsed  = Date.now() - int.current.camTweenStart
        const rawT     = Math.min(elapsed / CAM_TWEEN_MS, 1)
        const t = rawT < 0.5
          ? 4 * rawT * rawT * rawT
          : 1 - Math.pow(-2 * rawT + 2, 3) / 2

        const [tx, ty, tz] = CAM_TARGET.position
        const from = int.current.camTweenFrom
        camera.position.set(
          from.x + (tx - from.x) * t,
          from.y + (ty - from.y) * t,
          from.z + (tz - from.z) * t,
        )

        if (rawT >= 1) {
          int.current.camTweenStart = null
          controls.minDistance = CAM_TARGET.minDist
          controls.maxDistance = CAM_TARGET.maxDist
          if (isSolar || isGalaxy) solarSystem.show(); else solarSystem.hide()
          if (isGalaxy) galaxySystem.show(); else galaxySystem.hide()
        }
      } else {
        const prevScale = int.current._lastAppliedScale || 'earth'
        if (prevScale !== targetScale) {
          int.current._lastAppliedScale = targetScale
          int.current.camTweenStart = Date.now()
          int.current.camTweenFrom  = camera.position.clone()
          // Unlock controls limits immediately so scroll during tween works
          controls.minDistance = CAM_TARGET.minDist
          controls.maxDistance = CAM_TARGET.maxDist
          // Show solar system immediately when leaving earth scale
          if (isSolar || isGalaxy) solarSystem.show()
          if (isGalaxy) galaxySystem.show()
          if (!isGalaxy) galaxySystem.hide()
        }
      }

      // ── Solar system per-frame update ─────────────────────────────────────
      if (solarSystem.solarGroup.visible) {
        solarSystem.update(int.current.planetPositions)
        solarSystem.animateExtra()
      }

      // ── Dynamic rotate + zoom speed — slower when zoomed in ──────────────────
      // t=0 at surface, t=1 at max distance; quadratic so precision improves
      // sharply as you get close. Applied per-scale so solar/galaxy feel natural.
      if (targetScale === 'earth') {
        const dist = camera.position.length()
        const t  = Math.max(0, Math.min(1, (dist - 1.001) / (8.0 - 1.001)))
        const tQ = t * t  // quadratic — steeper drop-off near surface
        controls.rotateSpeed = 0.07 + tQ * 0.63  // 0.07 at surface → 0.70 far
        controls.zoomSpeed   = 0.12 + tQ * 0.58  // 0.12 at surface → 0.70 far
      } else if (targetScale === 'solar') {
        controls.rotateSpeed = 0.45
        controls.zoomSpeed   = 0.55
      } else {
        controls.rotateSpeed = 0.5
        controls.zoomSpeed   = 0.6
      }

      controls.update()
      clouds.rotation.y += 0.000022

      // Dynamic near/far clip — each scale needs a different frustum.
      // Earth: near = 10% altitude, far = 200 WU.
      // Solar: near = 235 WU, far = 1.41M WU (60 AU).
      // Galaxy: near = 235 WU, far = 130M WU (5,500 AU — covers sky sphere).
      const dist    = camera.position.length()
      int.current.camDist = dist
      const altUnit = Math.max(dist - EARTH_R, 1e-7)
      if (isGalaxy) {
        const FAR_GALAXY = 130_000_000
        if (camera.near !== 235 || camera.far !== FAR_GALAXY) {
          camera.near = 235; camera.far = FAR_GALAXY
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
      if (borderMat) borderMat.opacity = 0.55 * overlayAlpha

      updateTiles()

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
      }

      // Update sun direction every 60 s (sun moves ~0.25°/min — imperceptible at lower cadence)

      if (now - lastSunUpdate > 60000) {
        sun.position.copy(solarDirection()).multiplyScalar(10)
        lastSunUpdate = now
      }

      // Pixel-based scale: icon is N screen-pixels tall, shrinking logarithmically with altitude.
      // This gives proper visual proportion at every zoom level (airport runway → global orbit):
      //   orbit  (~1.8 alt): ~26 px — large, easy to click across the whole globe
      //   500 km (~0.08 alt): ~10 px — clearly shrinking
      //   140 km (~0.022 alt):  ~6 px — small dot, realistic vs map features
      //    50 km (~0.008 alt):  ~4 px
      //     5 km (~0.001 alt):  ~2 px — tiny speck, fits on a runway
      const screenW    = el.clientWidth || 1920
      const wuPerPx    = (2 * dist * Math.tan((40 / 2) * (Math.PI / 180))) / screenW
      const pixelTarget = MathUtils.clamp(13 * Math.pow(altUnit, 0.42), 0.8, 14)
      const newScale   = MathUtils.clamp(pixelTarget * wuPerPx, 0.00003, 0.02)

      // If scale changed meaningfully, rebuild per-instance matrices so icons resize with zoom
      if (Math.abs(newScale - (int.current.planeScale || 0)) > 0.000005) {
        int.current.planeScale = newScale
        int.current.needsInstanceRebuild = true
      }

      // Rebuild instance matrices when planeScale changes (separate from data updates)
      if (int.current.needsInstanceRebuild && int.current.lastAircraft) {
        int.current.needsInstanceRebuild = false
        syncInstances(int.current, int.current.lastAircraft, int.current.lastSelectedId, int.current.hoveredId, true)
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

      renderer.render(scene, camera)
    }
    int.current = {
      renderer, scene, camera, controls,
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
      hoveredId: null,
      hoverPos: null,
      setHoverTooltip: (...args) => setHoverTooltipRef.current?.(...args),
      onAircraftClick: null,
      onViewportChange: null,
      selPos: null,
      planeScale: 0.01,
      needsInstanceRebuild: false,
      lastAircraft: null,
      lastSelectedId: null,
      clearTiles,
      solarSystem,
      galaxySystem,
      targetCameraScale: 'earth',   // set by setCameraScale via imperative handle
      camTweenStart: null,          // timestamp when tween began
      camTweenFrom: null,           // Vector3 camera start position
      planetPositions: null,        // populated by WS solar_system message
      trackTweenStart: null,        // timestamp of flyTo-on-track-start tween
      trackTweenFrom: null,         // Vector3 camera position when tracking started
      flyToTarget: null,            // one-shot flyTo destination (Vector3)
      flyToStart:  null,            // timestamp
      flyToFrom:   null,            // Vector3 camera start
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
      mapDestroyed = true
      clearTiles()
      solarSystem.dispose()
      galaxySystem.dispose()
      controls.dispose()
      renderer.dispose()
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (int.current) int.current.onAircraftClick = onAircraftClick
  }, [onAircraftClick])

  useEffect(() => {
    if (int.current) int.current.onViewportChange = onViewportChange
  }, [onViewportChange])

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

  // ── Update aircraft positions, planes, and trails ─────────────────────────
  useEffect(() => {
    if (!int.current.planeMesh || !int.current.acGeo || !aircraft) return

    // Store latest data so the render loop can rebuild instances on zoom change
    int.current.lastAircraft = aircraft
    int.current.lastSelectedId = selectedId

    syncInstances(int.current, aircraft, selectedId, int.current.hoveredId, false)

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
  }, [aircraft, selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={mountRef} className={styles.globe}>
      <div className={styles.mapToggle}>
        <button
          className={mapStyle === 'street' ? styles.active : ''}
          onClick={() => setMapStyle('street')}
        >Street</button>
        <button
          className={mapStyle === 'satellite' ? styles.active : ''}
          onClick={() => setMapStyle('satellite')}
        >Satellite</button>
      </div>

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
        <AircraftTooltip x={hoverTooltip.x} y={hoverTooltip.y} data={hoverTooltip.data} />,
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

function TooltipRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px' }}>
      <span style={{ fontSize: '9px', letterSpacing: '0.1em', color: 'rgba(100,160,255,0.65)', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: '11px', color: 'rgba(200,220,255,0.9)', fontWeight: '500' }}>{value}</span>
    </div>
  )
}
