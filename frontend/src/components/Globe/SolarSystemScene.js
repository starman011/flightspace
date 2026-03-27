/**
 * SolarSystemScene
 * ─────────────────────────────────────────────────────────────────────────────
 * Factory that attaches heliocentric solar system objects to an existing
 * Three.js scene.  Call createSolarSystem(scene, renderer) once after the
 * scene is initialised, then call update() each frame (or on new WS data).
 *
 * Scale: 1 WU = 1 Earth radius = 6,371 km   →   1 AU ≈ 23,480 WU
 *
 * Planet visual radii are exaggerated — at true scale they'd be sub-pixel.
 * We use max(physicalRadius * 80, 300 WU) so every planet is clearly visible
 * from the default camera distance (~2.8 AU).
 */

import {
  Object3D, Mesh, SphereGeometry, RingGeometry,
  MeshPhongMaterial, MeshBasicMaterial,
  PointLight, AmbientLight,
  TextureLoader, BufferGeometry, BufferAttribute,
  LineLoop, LineBasicMaterial,
  AdditiveBlending, BackSide, DoubleSide,
} from 'three'

import {
  PLANET_NAMES, PLANET_RADIUS_WU, PLANET_COLOR,
  PLANET_TEXTURE, SATURN_RING_INNER, SATURN_RING_OUTER, SUN_RADIUS_WU,
  AU_TO_WU,
} from './solarSystem.js'

// ── Keplerian mean longitude (J2000 coefficients) ─────────────────────────
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

function jCenturies() {
  return (Date.now() / 86400000 - 10957.5) / 36525
}

function eccentricAnomaly(M, e) {
  let E = M
  for (let i = 0; i < 10; i++) {
    E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  }
  return E
}

function keplerianPosition(name) {
  const k = KEPLERIAN[name]
  if (!k) return { x: 0, z: 0 }
  const T  = jCenturies()
  const L  = (k.L0 + k.dL * T) % 360
  const M  = (L * Math.PI) / 180
  const E  = eccentricAnomaly(M, k.e)
  const nu = 2 * Math.atan2(
    Math.sqrt(1 + k.e) * Math.sin(E / 2),
    Math.sqrt(1 - k.e) * Math.cos(E / 2),
  )
  const r  = k.a * (1 - k.e * Math.cos(E))
  const rWU = r * AU_TO_WU
  return { x: rWU * Math.cos(nu), z: rWU * Math.sin(nu) }
}

// ── Visual radius — exaggerated so planets are clickable at solar camera dist ─
// true scale would be sub-pixel; min 300 WU ensures even tiny Mercury is visible
function visualRadius(name) {
  return Math.max(PLANET_RADIUS_WU[name] * 80, 300)
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createSolarSystem(scene, renderer) {
  const loader     = new TextureLoader()
  const solarGroup = new Object3D()
  solarGroup.visible = false
  scene.add(solarGroup)

  // ── Extra ambient light for solar view (planets lit from all sides slightly) ─
  // The Earth globe uses a faint AmbientLight (0.12). We add a solar-only ambient
  // so the night sides of planets aren't pitch black.
  const solarAmbient = new AmbientLight(0xffffff, 0.35)
  solarGroup.add(solarAmbient)

  // ── Sun ──────────────────────────────────────────────────────────────────────
  const sunR    = SUN_RADIUS_WU * 0.55   // visual Sun radius — much larger than before
  const sunMat  = new MeshBasicMaterial({ color: 0xfff4c2 })
  const sunMesh = new Mesh(new SphereGeometry(sunR, 32, 32), sunMat)
  solarGroup.add(sunMesh)

  loader.load(PLANET_TEXTURE.sun, tex => {
    sunMat.map = tex; sunMat.needsUpdate = true
  })

  // Sun corona glow — large semi-transparent additive sphere
  const coronaMat = new MeshBasicMaterial({
    color: 0xffeaa0, transparent: true, opacity: 0.18,
    blending: AdditiveBlending, depthWrite: false, side: BackSide,
  })
  solarGroup.add(new Mesh(new SphereGeometry(sunR * 2.8, 32, 32), coronaMat))

  // Outer glow halo
  const haloMat = new MeshBasicMaterial({
    color: 0xff9900, transparent: true, opacity: 0.07,
    blending: AdditiveBlending, depthWrite: false, side: BackSide,
  })
  solarGroup.add(new Mesh(new SphereGeometry(sunR * 5, 32, 32), haloMat))

  // Sun is a point light source for the planets
  const sunLight = new PointLight(0xfff4c2, 2.5, AU_TO_WU * 40)
  solarGroup.add(sunLight)

  // ── Planets ───────────────────────────────────────────────────────────────
  const planetMeshes = {}

  for (const name of PLANET_NAMES) {
    const rWU = visualRadius(name)
    const geo = new SphereGeometry(rWU, 32, 32)
    const mat = new MeshPhongMaterial({
      color:     PLANET_COLOR[name],
      shininess: name === 'venus' ? 60 : 20,
      emissive:  0x000000,
    })
    const mesh = new Mesh(geo, mat)
    mesh.userData.planet = name
    solarGroup.add(mesh)
    planetMeshes[name] = mesh

    const texKey = name === 'earth' ? 'earth_day' : name
    if (PLANET_TEXTURE[texKey]) {
      loader.load(PLANET_TEXTURE[texKey], tex => {
        if (renderer) tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())
        mat.map = tex
        mat.color.set(0xffffff)
        mat.needsUpdate = true
      })
    }
  }

  // ── Saturn rings ─────────────────────────────────────────────────────────
  const saturnR = visualRadius('saturn')
  const ringGeo = new RingGeometry(saturnR * SATURN_RING_INNER, saturnR * SATURN_RING_OUTER, 64)
  const ringMat = new MeshBasicMaterial({
    color: 0xe8d5a3, transparent: true, opacity: 0.85,
    side: DoubleSide, depthWrite: false,
  })
  const ringMesh = new Mesh(ringGeo, ringMat)
  ringMesh.rotation.x = Math.PI / 2
  ringMesh.rotation.z = 0.47
  planetMeshes.saturn.add(ringMesh)

  loader.load(PLANET_TEXTURE.saturn_ring, tex => {
    ringMat.map = tex; ringMat.needsUpdate = true
  })

  // ── Orbit path lines ─────────────────────────────────────────────────────
  for (const name of PLANET_NAMES) {
    const k = KEPLERIAN[name]
    if (!k) continue
    const steps = 128
    const pts   = new Float32Array((steps + 1) * 3)
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2
      const r = k.a * AU_TO_WU
      pts[i * 3]     = r * Math.cos(angle)
      pts[i * 3 + 1] = 0
      pts[i * 3 + 2] = r * Math.sin(angle)
    }
    const geo  = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(pts, 3))

    // Inner planets get a slightly brighter orbit line
    const isInner  = ['mercury','venus','earth','mars'].includes(name)
    const orbitMat = new LineBasicMaterial({
      color:       isInner ? 0x1e3a5f : 0x162840,
      transparent: true,
      opacity:     isInner ? 0.55 : 0.35,
      depthWrite:  false,
    })
    solarGroup.add(new LineLoop(geo, orbitMat))
  }

  // ── Position update ───────────────────────────────────────────────────────
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

  update(null)

  return { solarGroup, planetMeshes, update, show, hide, dispose }
}
