/**
 * MoonScene — High-detail Moon globe with landing sites, craters, and mineral overlays.
 *
 * Similar architecture to SolarSystemScene: hidden group, show/hide, per-frame update.
 * The Moon is rendered at the same scale as Earth (1 WU = 1 Earth radius),
 * but the Moon's radius is 0.2727 Earth radii.
 */

import {
  Object3D, SphereGeometry, MeshStandardMaterial, Mesh, TextureLoader,
  AmbientLight, DirectionalLight, Vector3, Color, RingGeometry,
  MeshBasicMaterial, DoubleSide, CanvasTexture, SpriteMaterial, Sprite,
  BufferGeometry, Float32BufferAttribute, PointsMaterial, Points,
  AdditiveBlending,
} from 'three'

// ── Constants ───────────────────────────────────────────────────────────────

export const MOON_R = 0.2727  // Moon radius in WU (Earth radii)

// ── Landing site database ───────────────────────────────────────────────────

export const LANDING_SITES = [
  // Apollo (USA)
  { id: 'apollo11',  name: 'Apollo 11',       lat: 0.6744,   lon: 23.4731,  date: '1969-07-20', country: 'USA',   site: 'Sea of Tranquility',    crew: 'Armstrong, Aldrin, Collins',       type: 'crewed',  desc: 'First humans on the Moon' },
  { id: 'apollo12',  name: 'Apollo 12',       lat: -3.0128,  lon: -23.4219, date: '1969-11-19', country: 'USA',   site: 'Ocean of Storms',       crew: 'Conrad, Bean, Gordon',             type: 'crewed',  desc: 'Precision landing near Surveyor 3' },
  { id: 'apollo14',  name: 'Apollo 14',       lat: -3.6453,  lon: -17.4714, date: '1971-02-05', country: 'USA',   site: 'Fra Mauro',             crew: 'Shepard, Mitchell, Roosa',         type: 'crewed',  desc: 'Alan Shepard hit golf balls on the Moon' },
  { id: 'apollo15',  name: 'Apollo 15',       lat: 26.1322,  lon: 3.6339,   date: '1971-07-30', country: 'USA',   site: 'Hadley-Apennine',       crew: 'Scott, Irwin, Worden',             type: 'crewed',  desc: 'First lunar rover mission' },
  { id: 'apollo16',  name: 'Apollo 16',       lat: -8.9734,  lon: 15.4986,  date: '1972-04-21', country: 'USA',   site: 'Descartes Highlands',   crew: 'Young, Duke, Mattingly',           type: 'crewed',  desc: 'Highland geology exploration' },
  { id: 'apollo17',  name: 'Apollo 17',       lat: 20.1908,  lon: 30.7717,  date: '1972-12-11', country: 'USA',   site: 'Taurus-Littrow',        crew: 'Cernan, Schmitt, Evans',           type: 'crewed',  desc: 'Last crewed Moon landing; first scientist-astronaut' },

  // Luna (Soviet Union)
  { id: 'luna2',     name: 'Luna 2',          lat: 29.1,     lon: 0.0,      date: '1959-09-13', country: 'USSR',  site: 'Palus Putredinis',      type: 'impact',  desc: 'First human-made object to reach the Moon' },
  { id: 'luna9',     name: 'Luna 9',          lat: 7.13,     lon: -64.37,   date: '1966-02-03', country: 'USSR',  site: 'Oceanus Procellarum',   type: 'robotic', desc: 'First soft landing on the Moon' },
  { id: 'luna16',    name: 'Luna 16',         lat: -0.68,    lon: 56.30,    date: '1970-09-20', country: 'USSR',  site: 'Mare Fecunditatis',     type: 'robotic', desc: 'First robotic sample return' },
  { id: 'luna17',    name: 'Luna 17',         lat: 38.28,    lon: -35.00,   date: '1970-11-17', country: 'USSR',  site: 'Mare Imbrium',          type: 'robotic', desc: 'Deployed Lunokhod 1 rover' },
  { id: 'luna21',    name: 'Luna 21',         lat: 25.85,    lon: 30.45,    date: '1973-01-15', country: 'USSR',  site: 'Le Monnier crater',     type: 'robotic', desc: 'Deployed Lunokhod 2 rover' },
  { id: 'luna24',    name: 'Luna 24',         lat: 12.75,    lon: 62.20,    date: '1976-08-18', country: 'USSR',  site: 'Mare Crisium',          type: 'robotic', desc: 'Last Soviet lunar landing' },

  // Chang'e (China)
  { id: 'change3',   name: "Chang'e 3",       lat: 44.12,    lon: -19.51,   date: '2013-12-14', country: 'China', site: 'Mare Imbrium',          type: 'robotic', desc: 'Yutu rover; first soft landing since 1976' },
  { id: 'change4',   name: "Chang'e 4",       lat: -45.46,   lon: 177.60,   date: '2019-01-03', country: 'China', site: 'Von Kármán crater',     type: 'robotic', desc: 'First landing on the far side of the Moon' },
  { id: 'change5',   name: "Chang'e 5",       lat: 43.06,    lon: -51.92,   date: '2020-12-01', country: 'China', site: 'Mons Rümker',           type: 'robotic', desc: 'Sample return — youngest lunar samples' },
  { id: 'change6',   name: "Chang'e 6",       lat: -41.64,   lon: 153.99,   date: '2024-06-01', country: 'China', site: 'Apollo basin',          type: 'robotic', desc: 'First far-side sample return' },

  // India
  { id: 'chandrayaan3', name: 'Chandrayaan-3', lat: -69.37,  lon: 32.35,    date: '2023-08-23', country: 'India', site: 'Manzinus crater',       type: 'robotic', desc: 'Pragyan rover; southernmost landing' },

  // Japan
  { id: 'slim',      name: 'SLIM',            lat: -13.32,   lon: 25.25,    date: '2024-01-19', country: 'Japan', site: 'Shioli crater',         type: 'robotic', desc: 'Smart Lander; precision landing (inverted)' },

  // USA (commercial)
  { id: 'im1',       name: 'Odysseus (IM-1)', lat: -80.13,   lon: 1.44,     date: '2024-02-22', country: 'USA',   site: 'Malapert A',            type: 'robotic', desc: 'Intuitive Machines; first US landing since Apollo' },
  { id: 'im2',       name: 'Athena (IM-2)',   lat: -84.0,    lon: 10.0,     date: '2025-03-06', country: 'USA',   site: 'Mons Mouton',           type: 'robotic', desc: 'Near south pole; NASA PRIME-1 drill' },
]

// ── Active lunar orbiters & rovers ──────────────────────────────────────────
// Real assets currently operating around / on the Moon. Orbits are simplified
// circular Keplerian (real RAAN drifts with lunar nodal regression but the
// visual is correct). Period derived from a = (R + alt), µ_moon = 4902.8 km³/s².

export const LUNAR_ORBITERS = [
  { id: 'lro',         name: 'LRO',          agency: 'NASA',  altKm: 50,   inclDeg: 90,   raanDeg: 0,   color: 0x00e5ff, launched: '2009-06-18', desc: 'Lunar Reconnaissance Orbiter — mapping the Moon at sub-meter resolution since 2009.' },
  { id: 'chandra2',    name: 'Chandrayaan-2', agency: 'ISRO',  altKm: 100,  inclDeg: 90,   raanDeg: 60,  color: 0xff8a3d, launched: '2019-07-22', desc: 'Indian polar orbiter — high-resolution imaging and mineral mapping.' },
  { id: 'danuri',      name: 'Danuri (KPLO)', agency: 'KARI',  altKm: 100,  inclDeg: 90,   raanDeg: 120, color: 0xffd24a, launched: '2022-08-05', desc: 'Korean Pathfinder Lunar Orbiter — first Korean lunar mission, polar mapping.' },
  { id: 'queqiao2',    name: 'Queqiao-2',     agency: 'CNSA',  altKm: 4200, inclDeg: 28.5, raanDeg: 200, color: 0xff5577, launched: '2024-03-20', desc: 'Chinese far-side relay satellite supporting Chang\'e missions.' },
  { id: 'capstone',    name: 'CAPSTONE',      agency: 'NASA',  altKm: 1500, inclDeg: 60,   raanDeg: 280, color: 0x88e0ff, launched: '2022-06-28', desc: 'Cislunar Autonomous Positioning System Tech Op — NRHO precursor for Gateway.' },
]

export const LUNAR_ROVERS = [
  { id: 'yutu2',       name: 'Yutu-2',        agency: 'CNSA',  lat: -45.46, lon: 177.60, color: 0xff8a3d, since: '2019-01-03', desc: 'Far-side rover from Chang\'e 4 — longest-operating lunar rover.' },
  { id: 'pragyan',     name: 'Pragyan',       agency: 'ISRO',  lat: -69.37, lon: 32.35,  color: 0xffd24a, since: '2023-08-23', desc: 'Chandrayaan-3 rover — southernmost lunar rover deployed.' },
]

// ── Notable craters ─────────────────────────────────────────────────────────

const CRATERS = [
  { name: 'Tycho',           lat: -43.3, lon: -11.2,  diam: 85 },
  { name: 'Copernicus',      lat: 9.6,   lon: -20.1,  diam: 93 },
  { name: 'Aristarchus',     lat: 23.7,  lon: -47.4,  diam: 40 },
  { name: 'Kepler',          lat: 8.1,   lon: -38.0,  diam: 32 },
  { name: 'Plato',           lat: 51.6,  lon: -9.3,   diam: 101 },
  { name: 'Clavius',         lat: -58.4, lon: -14.4,  diam: 231 },
  { name: 'Mare Imbrium',    lat: 36.0,  lon: -16.0,  diam: 1145 },
  { name: 'Mare Serenitatis', lat: 28.0,  lon: 17.5,   diam: 707 },
  { name: 'Mare Tranquillitatis', lat: 8.5, lon: 31.4, diam: 873 },
  { name: 'Mare Crisium',    lat: 17.0,  lon: 59.1,   diam: 555 },
  { name: 'Oceanus Procellarum', lat: 18.4, lon: -57.4, diam: 2568 },
  { name: 'South Pole-Aitken', lat: -53.0, lon: 169.0, diam: 2500 },
  { name: 'Shackleton',      lat: -89.9, lon: 0.0,    diam: 21 },
]

// ── Mineral overlay data (regions with known concentrations) ────────────────

const MINERAL_REGIONS = {
  iron: [
    { lat: 18.4, lon: -57.4, r: 18, label: 'Procellarum (high FeO)' },
    { lat: 8.5,  lon: 31.4,  r: 12, label: 'Tranquillitatis (high FeO)' },
    { lat: 36.0, lon: -16.0, r: 14, label: 'Imbrium (moderate FeO)' },
    { lat: -15.0, lon: -45.0, r: 8, label: 'Humorum (high FeO)' },
  ],
  titanium: [
    { lat: 11.0, lon: 21.0,  r: 10, label: 'Tranquillitatis (high TiO₂)' },
    { lat: 18.4, lon: -57.4, r: 15, label: 'Procellarum (moderate TiO₂)' },
  ],
  water: [
    { lat: -89.9, lon: 0.0,   r: 4, label: 'South Pole PSR (water ice)' },
    { lat: 89.5,  lon: 0.0,   r: 3, label: 'North Pole PSR (water ice)' },
    { lat: -89.9, lon: 0.0,   r: 2, label: 'Shackleton (confirmed ice)' },
  ],
  thorium: [
    { lat: 26.0, lon: -32.0, r: 20, label: 'KREEP Terrane (high Th)' },
    { lat: 36.0, lon: -16.0, r: 12, label: 'Imbrium (Th hotspot)' },
  ],
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function ll2v(lat, lon, r) {
  const phi = (90 - lat) * Math.PI / 180
  const theta = (lon + 180) * Math.PI / 180
  return new Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  )
}

// High-DPI pill label — crisp text on a translucent dark capsule with a
// colored border. Returns { texture, aspect } so sprites can size correctly.
// Elegant serif for a NASA-document / classic space-mission aesthetic.
const LABEL_FONT = `500 32px "Cormorant Garamond", "EB Garamond", Georgia, "Times New Roman", serif`
const LABEL_FONT_SMALL = `500 26px "Cormorant Garamond", "EB Garamond", Georgia, "Times New Roman", serif`

// Single warm ivory for every surface feature — evokes lunar dust lit by sun.
const MOON_LABEL_COLOR = '#f5e8c4'

function makeLabel(text, { small = false, color = '#ffffff', pill = true } = {}) {
  const dpr = 2
  const font = small ? LABEL_FONT_SMALL : LABEL_FONT
  const padX = small ? 14 : 18
  const padY = small ? 8  : 10

  // Measure on a scratch ctx first
  const scratch = document.createElement('canvas').getContext('2d')
  scratch.font = font
  const metrics = scratch.measureText(text)
  const textW = Math.ceil(metrics.width)
  const textH = small ? 26 : 32

  const w = textW + padX * 2
  const h = textH + padY * 2

  const canvas = document.createElement('canvas')
  canvas.width = w * dpr
  canvas.height = h * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  if (pill) {
    // Subtle dark pill, no colored border — let the serif typography carry it.
    const r = h / 2
    ctx.beginPath()
    ctx.moveTo(r, 0)
    ctx.lineTo(w - r, 0)
    ctx.arcTo(w, 0, w, r, r)
    ctx.lineTo(w, h - r)
    ctx.arcTo(w, h, w - r, h, r)
    ctx.lineTo(r, h)
    ctx.arcTo(0, h, 0, h - r, r)
    ctx.lineTo(0, r)
    ctx.arcTo(0, 0, r, 0, r)
    ctx.closePath()
    ctx.fillStyle = 'rgba(6,8,14,0.62)'
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(245,232,196,0.22)'
    ctx.stroke()
  }

  // Soft ivory glow + text
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(255,240,200,0.9)'
  ctx.shadowBlur = 8
  ctx.fillStyle = color
  ctx.fillText(text, w / 2, h / 2 + 1)

  const tex = new CanvasTexture(canvas)
  tex.colorSpace = 'srgb'
  tex.anisotropy = 8
  return { texture: tex, aspect: w / h, width: w, height: h }
}

// ── Two-body Kepler (state vector → orbital elements → propagation) ────────
// Works in Moon-centered ICRF (km, km/s). µ_moon = 4902.8 km³/s².

const MU_MOON_KM = 4902.8

function stateToElements(rx, ry, rz, vx, vy, vz, epochSec) {
  const mu = MU_MOON_KM
  const r = Math.sqrt(rx * rx + ry * ry + rz * rz)
  const v2 = vx * vx + vy * vy + vz * vz
  // specific energy → semi-major axis
  const energy = v2 / 2 - mu / r
  const a = -mu / (2 * energy)
  // angular momentum h = r × v
  const hx = ry * vz - rz * vy
  const hy = rz * vx - rx * vz
  const hz = rx * vy - ry * vx
  // eccentricity vector e = (v × h)/µ − r̂
  const evx = (vy * hz - vz * hy) / mu - rx / r
  const evy = (vz * hx - vx * hz) / mu - ry / r
  const evz = (vx * hy - vy * hx) / mu - rz / r
  const e = Math.sqrt(evx * evx + evy * evy + evz * evz)
  // mean motion
  const n = Math.sqrt(mu / (a * a * a))
  // true anomaly
  const rv = rx * vx + ry * vy + rz * vz
  let cosNu = (evx * rx + evy * ry + evz * rz) / (e * r)
  cosNu = Math.max(-1, Math.min(1, cosNu))
  let nu = Math.acos(cosNu)
  if (rv < 0) nu = -nu
  // eccentric anomaly → mean anomaly at epoch
  const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2))
  const M0 = E - e * Math.sin(E)
  // Perifocal basis: P along periapsis, Q perpendicular in orbit plane
  const Px = evx / e, Py = evy / e, Pz = evz / e
  // Q = (h × P) / |h|
  const hMag = Math.sqrt(hx * hx + hy * hy + hz * hz)
  const Qx = (hy * Pz - hz * Py) / hMag
  const Qy = (hz * Px - hx * Pz) / hMag
  const Qz = (hx * Py - hy * Px) / hMag
  return { a, e, n, M0, epoch: epochSec, Px, Py, Pz, Qx, Qy, Qz }
}

// Propagate elements to time t (unix seconds); returns ICRF position in km.
function propagateKepler(el, t) {
  const M = el.M0 + el.n * (t - el.epoch)
  // Newton solve: E − e sin E = M
  let E = el.e < 0.8 ? M : Math.PI
  for (let i = 0; i < 8; i++) {
    const f = E - el.e * Math.sin(E) - M
    const fp = 1 - el.e * Math.cos(E)
    E -= f / fp
    if (Math.abs(f) < 1e-10) break
  }
  const xp = el.a * (Math.cos(E) - el.e)
  const yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E)
  return {
    x: el.Px * xp + el.Qx * yp,
    y: el.Py * xp + el.Qy * yp,
    z: el.Pz * xp + el.Qz * yp,
  }
}

// ── Scene builder ───────────────────────────────────────────────────────────

export function createMoonScene(scene) {
  const loader = new TextureLoader()
  const moonGroup = new Object3D()
  moonGroup.visible = false
  scene.add(moonGroup)

  // ── Lighting ──────────────────────────────────────────────────────────────
  const ambient = new AmbientLight(0xffffff, 0.15)
  moonGroup.add(ambient)

  const sunLight = new DirectionalLight(0xfff8e7, 2.0)
  sunLight.position.set(5, 3, 4)
  moonGroup.add(sunLight)

  // ── Moon sphere ───────────────────────────────────────────────────────────
  // 4K NASA-derived albedo, 256 segments for crisp limb at close range
  const moonGeo = new SphereGeometry(MOON_R, 256, 256)
  const moonTex = loader.load('/textures/planets/moon.jpg', (t) => {
    t.anisotropy = 16
    t.colorSpace = 'srgb'
  })
  const moonMat = new MeshStandardMaterial({
    map: moonTex,
    roughness: 0.92,
    metalness: 0.0,
    bumpMap: moonTex,   // reuse albedo as a cheap surface bump
    bumpScale: 0.0035,
  })
  const moonMesh = new Mesh(moonGeo, moonMat)
  moonGroup.add(moonMesh)

  // ── Landing site markers ──────────────────────────────────────────────────
  // Each marker tracks its surface normal so update() can hemisphere-cull
  // (hide markers/labels on the back of the Moon to prevent bleed-through).
  const landingMarkers = {}
  const labelSprites = []
  // All things that should hemisphere-cull each frame: { obj, normal, baseOpacity }
  const cullables = []

  // Fixed-height label helper: sprites are sized from the pill's aspect
  // so short text is narrow and long text is wide — no more stretched words.
  const LABEL_H_WU = 0.014  // screen height of every pill, in world units

  for (const site of LANDING_SITES) {
    const normal = ll2v(site.lat, site.lon, 1).normalize()
    const pos = normal.clone().multiplyScalar(MOON_R * 1.0015)

    // Marker dot — small, tight pin on the surface. All sites share one warm
    // ivory color; mission type is still conveyed via the badge in the panel.
    const color = 0xf5e8c4
    const colorHex = MOON_LABEL_COLOR
    const dotGeo = new SphereGeometry(0.0018, 12, 12)
    const dotMat = new MeshBasicMaterial({ color, transparent: true, opacity: 1 })
    const dot = new Mesh(dotGeo, dotMat)
    dot.position.copy(pos)
    moonMesh.add(dot)  // child of moonMesh → rotates with lunar terrain
    cullables.push({ obj: dot, normal, baseOpacity: 1 })

    // Glow ring — halves the old size
    const ringGeo = new RingGeometry(0.0025, 0.004, 28)
    const ringMat = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55,
      side: DoubleSide,
      blending: AdditiveBlending,
      depthWrite: false,
    })
    const ring = new Mesh(ringGeo, ringMat)
    ring.position.copy(pos)
    ring.lookAt(0, 0, 0)
    moonMesh.add(ring)
    cullables.push({ obj: ring, normal, baseOpacity: 0.55 })

    // Label — only crewed missions get always-on labels; others appear on hover/zoom
    const showLabelAlways = site.type === 'crewed'
    const labelPos = normal.clone().multiplyScalar(MOON_R * 1.018)
    const lbl = makeLabel(site.name, { small: false, color: colorHex })
    const spriteMat = new SpriteMaterial({
      map: lbl.texture,
      transparent: true,
      depthTest: true,    // ← Moon mesh occludes labels behind it
      depthWrite: false,
      opacity: showLabelAlways ? 0.95 : 0,
    })
    const sprite = new Sprite(spriteMat)
    sprite.position.copy(labelPos)
    sprite.scale.set(LABEL_H_WU * lbl.aspect, LABEL_H_WU, 1)
    sprite.userData = { siteId: site.id, alwaysOn: showLabelAlways }
    sprite.renderOrder = 5
    moonMesh.add(sprite)
    labelSprites.push(sprite)
    cullables.push({ obj: sprite, normal, baseOpacity: showLabelAlways ? 0.95 : 0 })

    landingMarkers[site.id] = { dot, ring, sprite, site, normal }
  }

  // ── Crater labels (faint, hemisphere-culled, no pill — just glowing text) ─
  for (const cr of CRATERS) {
    const normal = ll2v(cr.lat, cr.lon, 1).normalize()
    const labelPos = normal.clone().multiplyScalar(MOON_R * 1.009)
    const lbl = makeLabel(cr.name, { small: true, color: MOON_LABEL_COLOR, pill: false })
    const spriteMat = new SpriteMaterial({
      map: lbl.texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      opacity: 0.55,
    })
    const sprite = new Sprite(spriteMat)
    sprite.position.copy(labelPos)
    // Slightly smaller than site labels to stay subordinate
    const h = 0.011
    sprite.scale.set(h * lbl.aspect, h, 1)
    sprite.renderOrder = 4
    moonMesh.add(sprite)
    cullables.push({ obj: sprite, normal, baseOpacity: 0.55 })
  }

  // ── Lunar orbiters (active satellites circling the Moon) ─────────────────
  // Each orbiter gets: orbit ring, satellite dot, label sprite. update() walks
  // the dot around its circle each frame using mean motion.
  const MOON_R_KM = 1737.4
  const MU_MOON   = 4902.8  // km³/s²
  const orbiters  = []

  for (const o of LUNAR_ORBITERS) {
    const aKm  = MOON_R_KM + o.altKm
    const aWU  = (aKm / MOON_R_KM) * MOON_R    // semi-major axis in WU
    const period = 2 * Math.PI * Math.sqrt((aKm * aKm * aKm) / MU_MOON)  // seconds
    const incl = (o.inclDeg * Math.PI) / 180
    const raan = (o.raanDeg * Math.PI) / 180

    // Build orbit plane basis vectors. Standard rotation: incl about x, then raan about y.
    const cosI = Math.cos(incl), sinI = Math.sin(incl)
    const cosR = Math.cos(raan), sinR = Math.sin(raan)
    // u = cos(ν) direction in orbital plane → world
    // v = sin(ν) direction in orbital plane → world
    const u = new Vector3( cosR,           0,            sinR          )
    const v = new Vector3(-sinR * cosI,    sinI,         cosR * cosI   )

    // Orbit ring (line of points) — slightly translucent
    const segs = 256
    const ringPos = new Float32Array(segs * 3)
    for (let i = 0; i < segs; i++) {
      const ang = (i / segs) * Math.PI * 2
      const px = (u.x * Math.cos(ang) + v.x * Math.sin(ang)) * aWU
      const py = (u.y * Math.cos(ang) + v.y * Math.sin(ang)) * aWU
      const pz = (u.z * Math.cos(ang) + v.z * Math.sin(ang)) * aWU
      ringPos[i * 3] = px
      ringPos[i * 3 + 1] = py
      ringPos[i * 3 + 2] = pz
    }
    const ringGeo = new BufferGeometry()
    ringGeo.setAttribute('position', new Float32BufferAttribute(ringPos, 3))
    const ringMat = new PointsMaterial({
      color: o.color,
      size: 1.4,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: AdditiveBlending,
    })
    const ringPoints = new Points(ringGeo, ringMat)
    moonGroup.add(ringPoints)
    // Hold the raw buffer so setRealOrbiterData() can rewrite it from real elements.
    const ringAttr = ringGeo.getAttribute('position')

    // Satellite dot
    const satGeo = new SphereGeometry(0.0045, 12, 12)
    const satMat = new MeshBasicMaterial({ color: o.color })
    const satMesh = new Mesh(satGeo, satMat)
    moonGroup.add(satMesh)

    // Glow halo
    const haloGeo = new SphereGeometry(0.008, 12, 12)
    const haloMat = new MeshBasicMaterial({
      color: o.color,
      transparent: true,
      opacity: 0.28,
      blending: AdditiveBlending,
      depthWrite: false,
    })
    const haloMesh = new Mesh(haloGeo, haloMat)
    moonGroup.add(haloMesh)

    // Label
    const lbl = makeLabel(o.name, { small: true, color: '#' + o.color.toString(16).padStart(6, '0') })
    const labelMat = new SpriteMaterial({
      map: lbl.texture,
      transparent: true,
      depthTest: false,    // orbiters always in front of moon (they're above it)
      depthWrite: false,
      opacity: 0.9,
    })
    const labelSprite = new Sprite(labelMat)
    labelSprite.scale.set(LABEL_H_WU * lbl.aspect, LABEL_H_WU, 1)
    labelSprite.userData = { orbiterId: o.id }
    labelSprite.renderOrder = 8
    moonGroup.add(labelSprite)

    orbiters.push({
      data: o, u, v, aWU, period,
      sat: satMesh, halo: haloMesh, label: labelSprite,
      ringAttr, ringSegs: segs,
      // random initial mean anomaly so they don't all start at periapsis
      m0: Math.random() * Math.PI * 2,
      tStart: Date.now() / 1000,
      realElements: null,  // set by setRealOrbiterData() once Horizons data arrives
    })
  }

  // ── Lunar rovers (surface assets) ────────────────────────────────────────
  for (const r of LUNAR_ROVERS) {
    const normal = ll2v(r.lat, r.lon, 1).normalize()
    const pos = normal.clone().multiplyScalar(MOON_R * 1.002)

    const dotGeo = new SphereGeometry(0.0022, 12, 12)
    const dotMat = new MeshBasicMaterial({ color: r.color })
    const dot = new Mesh(dotGeo, dotMat)
    dot.position.copy(pos)
    moonMesh.add(dot)
    cullables.push({ obj: dot, normal, baseOpacity: 1 })

    // Pulsing ring marker (different from landing markers — square halo)
    const ringGeo = new RingGeometry(0.0035, 0.0055, 4)
    const ringMat = new MeshBasicMaterial({
      color: r.color,
      transparent: true,
      opacity: 0.6,
      side: DoubleSide,
      blending: AdditiveBlending,
      depthWrite: false,
    })
    const ring = new Mesh(ringGeo, ringMat)
    ring.position.copy(pos)
    ring.lookAt(0, 0, 0)
    ring.rotateZ(Math.PI / 4)
    moonMesh.add(ring)
    cullables.push({ obj: ring, normal, baseOpacity: 0.6 })

    // Label
    const labelPos = normal.clone().multiplyScalar(MOON_R * 1.02)
    const lbl = makeLabel(r.name, { small: true, color: '#' + r.color.toString(16).padStart(6, '0') })
    const labelMat = new SpriteMaterial({
      map: lbl.texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      opacity: 0.95,
    })
    const labelSprite = new Sprite(labelMat)
    labelSprite.position.copy(labelPos)
    labelSprite.scale.set(LABEL_H_WU * lbl.aspect, LABEL_H_WU, 1)
    labelSprite.renderOrder = 7
    moonMesh.add(labelSprite)
    cullables.push({ obj: labelSprite, normal, baseOpacity: 0.95 })
  }

  // ── Mineral overlay rings ─────────────────────────────────────────────────
  const mineralGroups = {}
  const MINERAL_COLORS = { iron: 0xff6622, titanium: 0xffcc00, water: 0x00ccff, thorium: 0xff44ff }

  for (const [mineral, regions] of Object.entries(MINERAL_REGIONS)) {
    const grp = new Object3D()
    grp.visible = false
    grp.userData.cullables = []
    for (const reg of regions) {
      const normal = ll2v(reg.lat, reg.lon, 1).normalize()
      const pos = normal.clone().multiplyScalar(MOON_R * 1.001)
      const rWU = (reg.r / 180) * Math.PI * MOON_R
      const ringGeo = new RingGeometry(rWU * 0.8, rWU, 48)
      const ringMat = new MeshBasicMaterial({
        color: MINERAL_COLORS[mineral],
        transparent: true,
        opacity: 0.28,
        side: DoubleSide,
        blending: AdditiveBlending,
        depthWrite: false,
      })
      const ring = new Mesh(ringGeo, ringMat)
      ring.position.copy(pos)
      ring.lookAt(0, 0, 0)
      grp.add(ring)
      grp.userData.cullables.push({ obj: ring, normal, baseOpacity: 0.28 })

      // Label for region
      const lPos = normal.clone().multiplyScalar(MOON_R * 1.02)
      const lbl = makeLabel(reg.label, { small: true, color: new Color(MINERAL_COLORS[mineral]).getStyle() })
      const lMat = new SpriteMaterial({
        map: lbl.texture,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        opacity: 0.85,
      })
      const lSprite = new Sprite(lMat)
      lSprite.position.copy(lPos)
      const h = 0.012
      lSprite.scale.set(h * lbl.aspect, h, 1)
      lSprite.renderOrder = 6
      grp.add(lSprite)
      grp.userData.cullables.push({ obj: lSprite, normal, baseOpacity: 0.85 })
    }
    moonMesh.add(grp)
    mineralGroups[mineral] = grp
  }

  // ── Starfield background ──────────────────────────────────────────────────
  const starCount = 2000
  const starPositions = new Float32Array(starCount * 3)
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const r = 50
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    starPositions[i * 3 + 1] = r * Math.cos(phi)
    starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
  }
  const starGeo = new BufferGeometry()
  starGeo.setAttribute('position', new Float32BufferAttribute(starPositions, 3))
  const starMat = new PointsMaterial({ color: 0xffffff, size: 0.15, sizeAttenuation: false, transparent: true, opacity: 0.6 })
  const stars = new Points(starGeo, starMat)
  moonGroup.add(stars)

  // ── State ─────────────────────────────────────────────────────────────────
  let activeFilter = null

  // ── Public API ────────────────────────────────────────────────────────────

  function show() { moonGroup.visible = true }
  function hide() { moonGroup.visible = false }

  // Accepts { lro: {x,y,z,vx,vy,vz,update_at}, ... } in Moon-centered ICRF km / km·s.
  // Computes orbital elements once per orbiter and rewrites the orbit ring geometry
  // so the path drawn on screen matches the real ephemeris.
  function setRealOrbiterData(map) {
    if (!map) return
    const KM_TO_WU = MOON_R / MOON_R_KM
    for (const o of orbiters) {
      const d = map[o.data.id]
      if (!d) continue
      const epoch = d.update_at || (Date.now() / 1000)
      const el = stateToElements(d.x, d.y, d.z, d.vx, d.vy, d.vz, epoch)
      o.realElements = el

      // Rewrite orbit ring from the real ellipse so the path reflects the true orbit.
      const arr = o.ringAttr.array
      const segs = o.ringSegs
      const sqrt1me2 = Math.sqrt(1 - el.e * el.e)
      for (let i = 0; i < segs; i++) {
        const E = (i / segs) * Math.PI * 2
        const xp = el.a * (Math.cos(E) - el.e)
        const yp = el.a * sqrt1me2 * Math.sin(E)
        const ix = (el.Px * xp + el.Qx * yp)
        const iy = (el.Py * xp + el.Qy * yp)
        const iz = (el.Pz * xp + el.Qz * yp)
        // ICRF → Three.js axis swap, then scale to world units
        arr[i * 3]     =  ix * KM_TO_WU
        arr[i * 3 + 1] =  iz * KM_TO_WU
        arr[i * 3 + 2] = -iy * KM_TO_WU
      }
      o.ringAttr.needsUpdate = true
    }
  }

  function setFilter(filter) {
    // filter: null | 'iron' | 'titanium' | 'water' | 'thorium'
    activeFilter = filter
    for (const [key, grp] of Object.entries(mineralGroups)) {
      grp.visible = key === filter
    }
  }

  // Reusable scratch vectors for hemisphere culling
  const _camLocal = new Vector3()
  const _moonWorld = new Vector3()

  function update(camera) {
    // No auto-rotation — the moon stays put so landing sites remain locked
    // to their actual lunar coordinates (user can orbit the camera instead).

    const t = Date.now() / 1000

    // Pulse landing site rings
    for (const m of Object.values(landingMarkers)) {
      const scale = 1 + 0.3 * Math.sin(t * 2 + m.site.lat)
      m.ring.scale.set(scale, scale, 1)
    }

    // ── Walk lunar orbiters along their circles ─────────────────────────
    // Speed up time × 60 so a 2h orbit takes ~2 minutes — visible without
    // being too fast.
    const TIME_SCALE = 60
    const KM_TO_WU = MOON_R / MOON_R_KM
    for (const o of orbiters) {
      let x, y, z
      if (o.realElements) {
        // Real JPL Horizons data: Keplerian propagation at wall-clock time.
        // ICRF → Three.js axis swap: (ix, iz, -iy) puts celestial north along +Y.
        const p = propagateKepler(o.realElements, t)
        x =  p.x * KM_TO_WU
        y =  p.z * KM_TO_WU
        z = -p.y * KM_TO_WU
      } else {
        // Synthetic circle fallback (Queqiao-2 — not in Horizons).
        const elapsed = (t - o.tStart) * TIME_SCALE
        const meanAnom = o.m0 + (2 * Math.PI * elapsed) / o.period
        const c = Math.cos(meanAnom), s = Math.sin(meanAnom)
        x = (o.u.x * c + o.v.x * s) * o.aWU
        y = (o.u.y * c + o.v.y * s) * o.aWU
        z = (o.u.z * c + o.v.z * s) * o.aWU
      }
      o.sat.position.set(x, y, z)
      o.halo.position.set(x, y, z)
      o.label.position.set(x * 1.04, y * 1.04 + 0.012, z * 1.04)
      // Halo gentle pulse
      const pulse = 1 + 0.2 * Math.sin(t * 2 + o.m0)
      o.halo.scale.setScalar(pulse)
    }

    // ── Hemisphere culling ──────────────────────────────────────────────────
    // Hide markers / labels on the back of the Moon so text/dots don't bleed
    // through. Compute camera direction in moon-local space, then dot it with
    // each marker's surface normal. >0 = visible hemisphere.
    if (camera) {
      moonGroup.getWorldPosition(_moonWorld)
      _camLocal.copy(camera.position).sub(_moonWorld).normalize()
      // Account for Moon's own rotation (only moonMesh rotates, not the markers,
      // so this is just camLocal — markers are children of moonGroup, not moonMesh)

      const cullList = (list) => {
        for (const c of list) {
          const dot = c.normal.dot(_camLocal)
          // dot > 0.05  → visible (slight bias to hide near limb)
          // dot < -0.05 → hidden
          // smooth fade in between
          if (c.obj.material) {
            if (dot > 0.15) {
              c.obj.visible = true
              c.obj.material.opacity = c.baseOpacity
            } else if (dot > -0.05) {
              c.obj.visible = true
              c.obj.material.opacity = c.baseOpacity * ((dot + 0.05) / 0.20)
            } else {
              c.obj.visible = false
            }
          }
        }
      }
      cullList(cullables)
      if (activeFilter && mineralGroups[activeFilter]?.userData.cullables) {
        cullList(mineralGroups[activeFilter].userData.cullables)
      }
    }

    // Pulse mineral overlays (modulate baseOpacity, not raw)
    if (activeFilter && mineralGroups[activeFilter]?.userData.cullables) {
      const pulse = 0.85 + 0.15 * Math.sin(t * 1.5)
      for (const c of mineralGroups[activeFilter].userData.cullables) {
        if (c.obj.visible && c.obj.material) {
          c.obj.material.opacity *= pulse
        }
      }
    }
  }

  function getSiteAt(raycaster) {
    const hits = raycaster.intersectObjects(labelSprites)
    if (hits.length > 0) {
      const siteId = hits[0].object.userData.siteId
      return LANDING_SITES.find(s => s.id === siteId) || null
    }
    return null
  }

  function flyToSite(siteId, camera, controls) {
    const site = LANDING_SITES.find(s => s.id === siteId)
    if (!site) return null
    const pos = ll2v(site.lat, site.lon, MOON_R)
    return pos.normalize().multiplyScalar(MOON_R + 0.1)
  }

  function dispose() {
    moonGroup.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose()
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose()
        obj.material.dispose()
      }
    })
    scene.remove(moonGroup)
  }

  return {
    moonGroup,
    moonMesh,
    landingMarkers,
    mineralGroups,
    show,
    hide,
    update,
    setFilter,
    setRealOrbiterData,
    getSiteAt,
    flyToSite,
    dispose,
  }
}
