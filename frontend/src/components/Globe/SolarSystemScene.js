/**
 * SolarSystemScene
 * ─────────────────────────────────────────────────────────────────────────────
 * Factory that attaches heliocentric solar system objects to an existing
 * Three.js scene.  Call createSolarSystem(scene, renderer) once after the
 * scene is initialised, then call update() each frame (or on new WS data).
 *
 * The solar system lives at a completely different scale from the Earth globe:
 *   Earth globe  → 1 WU = 6,371 km (Earth radius)
 *   Solar system → same WU, so 1 AU ≈ 23,480 WU
 *
 * The solarGroup Object3D is hidden by default (visible = false) and shown
 * only when the camera scale is set to 'solar' by Globe.jsx.
 */

import {
  Object3D, Mesh, SphereGeometry, RingGeometry, MeshPhongMaterial,
  MeshBasicMaterial, PointLight, TextureLoader,
  FrontSide, DoubleSide, BackSide,
  AdditiveBlending, Vector3,
} from 'three'

import {
  PLANET_NAMES, PLANET_RADIUS_WU, PLANET_ORBIT_AU, PLANET_COLOR,
  PLANET_TEXTURE, SATURN_RING_INNER, SATURN_RING_OUTER, SUN_RADIUS_WU,
  AU_TO_WU,
} from './solarSystem.js'

// ── Simplified Keplerian mean longitude (J2000 coefficients) ──────────────
// Source: https://ssd.jpl.nasa.gov/planets/approx_pos.html (Table 1)
// Elements: [a_AU, e, i_deg, L_deg, ω_deg, Ω_deg, da/dt, de/dt, di/dt, dL/dt, dω/dt, dΩ/dt]
// All rates are per Julian century from J2000.0
const KEPLERIAN = {
  mercury: { a: 0.38709927, e: 0.20563593, L0: 252.25032350, dL: 149472.67411175 },
  venus:   { a: 0.72333566, e: 0.00677672, L0: 181.97909950, dL:  58517.81538729 },
  earth:   { a: 1.00000261, e: 0.01671123, L0: 100.46457166, dL:  35999.37244981 },
  mars:    { a: 1.52371034, e: 0.09339410, L0: -4.55343205,  dL:  19140.30268499 },
  jupiter: { a: 5.20288700, e: 0.04838624, L0:  34.39644051, dL:   3034.74612775 },
  saturn:  { a: 9.53667594, e: 0.05386179, L0:  49.95424423, dL:   1222.49362201 },
  uranus:  { a: 19.1891646, e: 0.04725744, L0: 313.23810451, dL:    428.48202785 },
  neptune: { a: 30.0699701, e: 0.00859048, L0: -55.12002969, dL:    218.45945325 },
}

// Centuries since J2000.0
function jCenturies() {
  return (Date.now() / 86400000 - 10957.5) / 36525
}

// Eccentric anomaly (Newton-Raphson, 10 iterations)
function eccentricAnomaly(M, e) {
  let E = M
  for (let i = 0; i < 10; i++) {
    E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  }
  return E
}

// Heliocentric XZ position (WU) for a planet using simplified Keplerian elements.
// Returns { x, z } — we use XZ plane (Y = ecliptic normal) for the solar system.
function keplerianPosition(name) {
  const k  = KEPLERIAN[name]
  if (!k) return { x: 0, z: 0 }

  const T   = jCenturies()
  // Mean anomaly (degrees → radians)
  const L   = (k.L0 + k.dL * T) % 360
  const M   = (L * Math.PI) / 180
  const E   = eccentricAnomaly(M, k.e)

  // True anomaly
  const nu  = 2 * Math.atan2(
    Math.sqrt(1 + k.e) * Math.sin(E / 2),
    Math.sqrt(1 - k.e) * Math.cos(E / 2),
  )

  // Distance from Sun (AU)
  const r   = k.a * (1 - k.e * Math.cos(E))
  const rWU = r * AU_TO_WU

  return {
    x: rWU * Math.cos(nu),
    z: rWU * Math.sin(nu),
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createSolarSystem(scene, renderer) {
  const loader     = new TextureLoader()
  const solarGroup = new Object3D()
  solarGroup.visible = false   // hidden until cameraScale === 'solar'
  scene.add(solarGroup)

  // ── Sun ──────────────────────────────────────────────────────────────────
  const sunMat  = new MeshBasicMaterial({ color: 0xfff4c2 })
  const sunMesh = new Mesh(new SphereGeometry(SUN_RADIUS_WU * 0.12, 32, 32), sunMat)
  // Note: display radius is scaled down (×0.12) so it fits visually in the heliocentric
  // viewport without overwhelming the view — physically accurate scale would be too large.
  solarGroup.add(sunMesh)

  // Sun emits light from origin (supplements Globe's directional sun)
  const sunLight = new PointLight(0xfff4c2, 3.0, AU_TO_WU * 35)
  solarGroup.add(sunLight)

  // Load sun texture
  loader.load(PLANET_TEXTURE.sun, tex => {
    sunMat.map  = tex
    sunMat.needsUpdate = true
  })

  // ── Planets ──────────────────────────────────────────────────────────────
  const planetMeshes = {}

  for (const name of PLANET_NAMES) {
    const rWU = PLANET_RADIUS_WU[name] * 6   // visual scale-up so planets are clickable
    const geo  = new SphereGeometry(rWU, 32, 32)
    const mat  = new MeshPhongMaterial({
      color: PLANET_COLOR[name],
      shininess: name === 'venus' ? 60 : 20,
    })
    const mesh = new Mesh(geo, mat)
    mesh.userData.planet = name
    solarGroup.add(mesh)
    planetMeshes[name] = mesh

    // Load texture
    const texKey = name === 'earth' ? 'earth_day' : name
    if (PLANET_TEXTURE[texKey]) {
      loader.load(PLANET_TEXTURE[texKey], tex => {
        if (renderer) tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())
        mat.map  = tex
        mat.color.set(0xffffff)
        mat.needsUpdate = true
      })
    }
  }

  // ── Saturn's rings ────────────────────────────────────────────────────────
  const saturnR = PLANET_RADIUS_WU.saturn * 6
  const ringGeo = new RingGeometry(
    saturnR * SATURN_RING_INNER,
    saturnR * SATURN_RING_OUTER,
    64,
  )
  // RingGeometry UVs need manual fix for correct texture mapping
  const ringMat = new MeshBasicMaterial({
    color: 0xe8d5a3, transparent: true, opacity: 0.85,
    side: DoubleSide, depthWrite: false,
  })
  const ringMesh = new Mesh(ringGeo, ringMat)
  ringMesh.rotation.x = Math.PI / 2   // lay flat
  ringMesh.rotation.z = 0.47          // Saturn's axial tilt ~27°
  planetMeshes.saturn.add(ringMesh)

  loader.load(PLANET_TEXTURE.saturn_ring, tex => {
    ringMat.map         = tex
    ringMat.transparent = true
    ringMat.needsUpdate = true
  })

  // ── Orbit path lines ──────────────────────────────────────────────────────
  // Static dashed orbit circles for visual reference — drawn as thin lines.
  // We use a LineLoop approximation (64 points per orbit).
  // Imported lazily to avoid adding Line/LineLoop to the main bundle entry.
  import('three').then(({ BufferGeometry, BufferAttribute, LineLoop, LineBasicMaterial }) => {
    for (const name of PLANET_NAMES) {
      const k = KEPLERIAN[name]
      if (!k) continue
      const pts = new Float32Array(64 * 3)
      for (let i = 0; i < 64; i++) {
        const angle = (i / 64) * Math.PI * 2
        const r = k.a * AU_TO_WU
        pts[i * 3]     = r * Math.cos(angle)
        pts[i * 3 + 1] = 0
        pts[i * 3 + 2] = r * Math.sin(angle)
      }
      const geo = new BufferGeometry()
      geo.setAttribute('position', new BufferAttribute(pts, 3))
      const line = new LineLoop(geo, new LineBasicMaterial({
        color: 0x1a2a3a, transparent: true, opacity: 0.35, depthWrite: false,
      }))
      solarGroup.add(line)
    }
  })

  // ── Position update ───────────────────────────────────────────────────────
  // Called from Globe's tick loop (or when WS solar_system message arrives).
  // wsPositions: Map<name, {x, y, z}> in WU — if null, uses local Keplerian
  function update(wsPositions) {
    for (const name of PLANET_NAMES) {
      const mesh = planetMeshes[name]
      if (!mesh) continue

      let px, pz
      if (wsPositions && wsPositions[name]) {
        px = wsPositions[name].x * AU_TO_WU
        pz = wsPositions[name].z * AU_TO_WU
      } else {
        ;({ x: px, z: pz } = keplerianPosition(name))
      }

      mesh.position.set(px, 0, pz)

      // Slow axial rotation — purely cosmetic
      mesh.rotation.y += 0.0005
    }
  }

  function show() { solarGroup.visible = true }
  function hide() { solarGroup.visible = false }

  function dispose() {
    solarGroup.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose()
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose()
        obj.material.dispose()
      }
    })
    scene.remove(solarGroup)
  }

  // Run one update immediately to position planets on first show
  update(null)

  return { solarGroup, planetMeshes, update, show, hide, dispose }
}
