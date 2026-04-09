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

function makeLabel(text, fontSize = 48, color = '#ffffff') {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  ctx.font = `bold ${fontSize}px monospace`
  const m = ctx.measureText(text)
  canvas.width = Math.ceil(m.width) + 16
  canvas.height = fontSize + 16
  ctx.font = `bold ${fontSize}px monospace`
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, canvas.width / 2, canvas.height / 2)
  const tex = new CanvasTexture(canvas)
  return tex
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
  const landingMarkers = {}
  const labelSprites = []

  for (const site of LANDING_SITES) {
    const pos = ll2v(site.lat, site.lon, MOON_R * 1.002)

    // Marker dot
    const color = site.type === 'crewed' ? 0x00e5ff : site.type === 'impact' ? 0xff4444 : 0x22ff88
    const dotGeo = new SphereGeometry(0.003, 8, 8)
    const dotMat = new MeshBasicMaterial({ color })
    const dot = new Mesh(dotGeo, dotMat)
    dot.position.copy(pos)
    moonGroup.add(dot)

    // Glow ring
    const ringGeo = new RingGeometry(0.004, 0.006, 16)
    const ringMat = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.4,
      side: DoubleSide,
      blending: AdditiveBlending,
      depthWrite: false,
    })
    const ring = new Mesh(ringGeo, ringMat)
    ring.position.copy(pos)
    ring.lookAt(0, 0, 0)
    moonGroup.add(ring)

    // Label
    const labelPos = ll2v(site.lat, site.lon, MOON_R * 1.015)
    const labelTex = makeLabel(site.name, 32, site.type === 'crewed' ? '#00e5ff' : '#aaffaa')
    const spriteMat = new SpriteMaterial({ map: labelTex, transparent: true, depthTest: false })
    const sprite = new Sprite(spriteMat)
    sprite.position.copy(labelPos)
    sprite.scale.set(0.06, 0.015, 1)
    sprite.userData = { siteId: site.id }
    moonGroup.add(sprite)
    labelSprites.push(sprite)

    landingMarkers[site.id] = { dot, ring, sprite, site }
  }

  // ── Crater labels ─────────────────────────────────────────────────────────
  for (const cr of CRATERS) {
    const labelPos = ll2v(cr.lat, cr.lon, MOON_R * 1.008)
    const labelTex = makeLabel(cr.name, 24, 'rgba(255,255,255,0.35)')
    const spriteMat = new SpriteMaterial({ map: labelTex, transparent: true, depthTest: false, opacity: 0.5 })
    const sprite = new Sprite(spriteMat)
    sprite.position.copy(labelPos)
    const scale = Math.min(cr.diam / 8000, 0.12)
    sprite.scale.set(Math.max(scale, 0.04), Math.max(scale * 0.25, 0.01), 1)
    moonGroup.add(sprite)
  }

  // ── Mineral overlay rings ─────────────────────────────────────────────────
  const mineralGroups = {}
  const MINERAL_COLORS = { iron: 0xff6622, titanium: 0xffcc00, water: 0x00ccff, thorium: 0xff44ff }

  for (const [mineral, regions] of Object.entries(MINERAL_REGIONS)) {
    const grp = new Object3D()
    grp.visible = false
    for (const reg of regions) {
      const pos = ll2v(reg.lat, reg.lon, MOON_R * 1.001)
      const rWU = (reg.r / 180) * Math.PI * MOON_R
      const ringGeo = new RingGeometry(rWU * 0.8, rWU, 32)
      const ringMat = new MeshBasicMaterial({
        color: MINERAL_COLORS[mineral],
        transparent: true,
        opacity: 0.2,
        side: DoubleSide,
        blending: AdditiveBlending,
        depthWrite: false,
      })
      const ring = new Mesh(ringGeo, ringMat)
      ring.position.copy(pos)
      ring.lookAt(0, 0, 0)
      grp.add(ring)

      // Label for region
      const lPos = ll2v(reg.lat, reg.lon, MOON_R * 1.02)
      const lTex = makeLabel(reg.label, 20, new Color(MINERAL_COLORS[mineral]).getStyle())
      const lMat = new SpriteMaterial({ map: lTex, transparent: true, depthTest: false })
      const lSprite = new Sprite(lMat)
      lSprite.position.copy(lPos)
      lSprite.scale.set(0.06, 0.012, 1)
      grp.add(lSprite)
    }
    moonGroup.add(grp)
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

  function setFilter(filter) {
    // filter: null | 'iron' | 'titanium' | 'water' | 'thorium'
    activeFilter = filter
    for (const [key, grp] of Object.entries(mineralGroups)) {
      grp.visible = key === filter
    }
  }

  function update() {
    // Slow rotation for visual interest
    moonMesh.rotation.y += 0.0001

    // Pulse landing site rings
    const t = Date.now() / 1000
    for (const m of Object.values(landingMarkers)) {
      const scale = 1 + 0.3 * Math.sin(t * 2 + m.site.lat)
      m.ring.scale.set(scale, scale, 1)
    }

    // Pulse mineral overlays
    if (activeFilter && mineralGroups[activeFilter]) {
      mineralGroups[activeFilter].children.forEach(child => {
        if (child.material?.opacity != null) {
          child.material.opacity = 0.15 + 0.1 * Math.sin(t * 1.5)
        }
      })
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
    getSiteAt,
    flyToSite,
    dispose,
  }
}
