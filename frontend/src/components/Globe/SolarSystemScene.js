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
  AdditiveBlending, BackSide, DoubleSide, Points, PointsMaterial,
  Sprite, SpriteMaterial, CanvasTexture,
} from 'three'

import {
  PLANET_NAMES, PLANET_RADIUS_WU, PLANET_ORBIT_AU, PLANET_COLOR,
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

// ── Visual radius — orbital-distance-aware so outer planets stay visible ──────
// Scales with orbital distance so Jupiter–Neptune are never sub-pixel.
// Floor of 600 WU keeps inner planets clickable; physical radius term preserves
// relative size hierarchy between planets at similar distances.
function visualRadius(name) {
  return Math.max(
    PLANET_ORBIT_AU[name] * AU_TO_WU * 0.007,
    PLANET_RADIUS_WU[name] * 350,
    600,
  )
}

// ── Planet name label sprite ─────────────────────────────────────────────────
function makeLabelSprite(text, color = '#c3f5ff') {
  const cv  = document.createElement('canvas')
  cv.width  = 256; cv.height = 64
  const ctx = cv.getContext('2d')
  ctx.font  = 'bold 22px "IBM Plex Mono", monospace'
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 128, 32)
  const tex  = new CanvasTexture(cv)
  const mat  = new SpriteMaterial({ map: tex, transparent: true, opacity: 0.82, depthWrite: false })
  const sprite = new Sprite(mat)
  sprite.scale.set(1800, 450, 1)  // WU — readable at solar camera ~3–6 AU
  return sprite
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
  const sunR    = SUN_RADIUS_WU * 6   // visual Sun radius — visible from solar camera ~3–5 AU
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

    // Name label — positioned above the planet, always faces camera (Sprite)
    const label = makeLabelSprite(name.charAt(0).toUpperCase() + name.slice(1), PLANET_COLOR[name] ? '#c3f5ff' : '#c3f5ff')
    label.position.set(0, rWU * 1.8 + 400, 0)
    mesh.add(label)

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

  update(null)

  // ── NEO (near-earth object) orbit lines ────────────────────────────────────
  // Drawn as faint LineLoops in the ecliptic-inclined orbital plane.
  // PHA (potentially hazardous) asteroids are tinted red; others dim cyan.
  //
  // 3D orbit from Keplerian elements — heliocentric ecliptic frame (Y-up):
  //   x = r*(cosΩ·cos(ω+ν) − sinΩ·sin(ω+ν)·cos i)
  //   y = r·sin i·sin(ω+ν)
  //   z = r*(sinΩ·cos(ω+ν) + cosΩ·sin(ω+ν)·cos i)
  const neoGroup = new Object3D()
  solarGroup.add(neoGroup)

  let _lastNeoIds = ''

  function updateNEOs(asteroids) {
    if (!asteroids?.length) return
    const idKey = asteroids.slice(0, 40).map(a => a.id).join(',')
    if (idKey === _lastNeoIds) return
    _lastNeoIds = idKey

    // Clear previous
    while (neoGroup.children.length) {
      const obj = neoGroup.children[0]
      if (obj.geometry) obj.geometry.dispose()
      if (obj.material) obj.material.dispose()
      neoGroup.remove(obj)
    }

    const MAX_NEO = 40
    let drawn = 0
    for (const ast of asteroids) {
      if (drawn >= MAX_NEO) break
      const { a, e, i: iDeg, om: omDeg, w: wDeg, pha } = ast
      if (!a || a < 0.01 || e >= 0.999 || a > 8) continue

      const iR  = (iDeg  || 0) * Math.PI / 180
      const omR = (omDeg || 0) * Math.PI / 180
      const wR  = (wDeg  || 0) * Math.PI / 180
      const cos_om = Math.cos(omR), sin_om = Math.sin(omR)
      const cos_i  = Math.cos(iR),  sin_i  = Math.sin(iR)

      const STEPS = 96
      const pts = new Float32Array((STEPS + 1) * 3)
      let valid = true
      for (let k = 0; k <= STEPS; k++) {
        const nu = (k / STEPS) * Math.PI * 2
        const denom = 1 + e * Math.cos(nu)
        if (Math.abs(denom) < 1e-6) { valid = false; break }
        const r = (a * (1 - e * e)) / denom * AU_TO_WU
        const wNu = wR + nu
        const cos_wnu = Math.cos(wNu), sin_wnu = Math.sin(wNu)
        pts[k * 3]     = r * (cos_om * cos_wnu - sin_om * sin_wnu * cos_i)
        pts[k * 3 + 1] = r * sin_i * sin_wnu
        pts[k * 3 + 2] = r * (sin_om * cos_wnu + cos_om * sin_wnu * cos_i)
      }
      if (!valid) continue

      const geo = new BufferGeometry()
      geo.setAttribute('position', new BufferAttribute(pts, 3))

      const col = pha ? 0xff3311 : 0x00aacc
      const op  = pha ? 0.75 : 0.45
      const mat = new LineBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false })
      neoGroup.add(new LineLoop(geo, mat))

      // Current-position dot at perihelion (closest approach point)
      const rPeri = (a * (1 - e * e)) / (1 + e) * AU_TO_WU
      const dotPts = new Float32Array(3)
      dotPts[0] = rPeri * (cos_om * Math.cos(wR) - sin_om * Math.sin(wR) * cos_i)
      dotPts[1] = rPeri * sin_i * Math.sin(wR)
      dotPts[2] = rPeri * (sin_om * Math.cos(wR) + cos_om * Math.sin(wR) * cos_i)
      const dotGeo = new BufferGeometry()
      dotGeo.setAttribute('position', new BufferAttribute(dotPts, 3))
      const dotMat = new PointsMaterial({ color: pha ? 0xff5533 : 0x00ddff, size: pha ? 700 : 500, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false, blending: AdditiveBlending })
      neoGroup.add(new Points(dotGeo, dotMat))
      drawn++
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

  return { solarGroup, planetMeshes, update, updateNEOs, show, hide, dispose }
}
