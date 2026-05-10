import {
  BufferGeometry, BufferAttribute, Points, ShaderMaterial,
  AdditiveBlending, Color, DynamicDrawUsage,
} from 'three'

const WIND_R       = 1.0065   // just above cloud layer
const PARTICLE_COUNT = 8000
const MAX_AGE      = 200      // frames before particle resets
const SPEED_SCALE  = 0.00004  // metres/s → world-unit/frame

// Wind speed thresholds (m/s) and colors
const SPEED_COLORS = [
  { threshold: 0,  color: new Color(0x4a90d9) },  // calm — soft blue
  { threshold: 3,  color: new Color(0x43b6a0) },  // light — teal
  { threshold: 6,  color: new Color(0x7ec850) },  // moderate — green
  { threshold: 10, color: new Color(0xe8c840) },  // fresh — yellow
  { threshold: 15, color: new Color(0xf09030) },  // strong — orange
  { threshold: 25, color: new Color(0xe05050) },  // gale — red
]

function speedToColor(speed) {
  for (let i = SPEED_COLORS.length - 1; i >= 0; i--) {
    if (speed >= SPEED_COLORS[i].threshold) {
      if (i === SPEED_COLORS.length - 1) return SPEED_COLORS[i].color
      const lo = SPEED_COLORS[i], hi = SPEED_COLORS[i + 1]
      const t = (speed - lo.threshold) / (hi.threshold - lo.threshold)
      return lo.color.clone().lerp(hi.color, t)
    }
  }
  return SPEED_COLORS[0].color
}

// Convert lat/lon to 3D position on sphere
function ll2v(lat, lon, r) {
  const phi   = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return [
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  ]
}

// Build bilinear interpolator from wind grid
function buildWindLookup(points, gridStep) {
  const map = new Map()
  for (const p of points) {
    const key = `${p.lat.toFixed(1)},${p.lon.toFixed(1)}`
    map.set(key, p)
  }

  return function getWind(lat, lon) {
    // Snap to grid corners
    const latLo = Math.floor(lat / gridStep) * gridStep
    const lonLo = Math.floor(lon / gridStep) * gridStep
    const latHi = latLo + gridStep
    const lonHi = lonLo + gridStep

    const tLat = (lat - latLo) / gridStep
    const tLon = (lon - lonLo) / gridStep

    const p00 = map.get(`${latLo.toFixed(1)},${lonLo.toFixed(1)}`)
    const p10 = map.get(`${latHi.toFixed(1)},${lonLo.toFixed(1)}`)
    const p01 = map.get(`${latLo.toFixed(1)},${lonHi.toFixed(1)}`)
    const p11 = map.get(`${latHi.toFixed(1)},${lonHi.toFixed(1)}`)

    if (!p00 && !p10 && !p01 && !p11) return null

    // Bilinear interpolation (fallback to nearest if corners missing)
    const u00 = p00?.u ?? 0, v00 = p00?.v ?? 0, s00 = p00?.speed ?? 0
    const u10 = p10?.u ?? 0, v10 = p10?.v ?? 0, s10 = p10?.speed ?? 0
    const u01 = p01?.u ?? 0, v01 = p01?.v ?? 0, s01 = p01?.speed ?? 0
    const u11 = p11?.u ?? 0, v11 = p11?.v ?? 0, s11 = p11?.speed ?? 0

    return {
      u:     u00 * (1 - tLat) * (1 - tLon) + u10 * tLat * (1 - tLon) + u01 * (1 - tLat) * tLon + u11 * tLat * tLon,
      v:     v00 * (1 - tLat) * (1 - tLon) + v10 * tLat * (1 - tLon) + v01 * (1 - tLat) * tLon + v11 * tLat * tLon,
      speed: s00 * (1 - tLat) * (1 - tLon) + s10 * tLat * (1 - tLon) + s01 * (1 - tLat) * tLon + s11 * tLat * tLon,
    }
  }
}

// Vertex + fragment shaders for wind particles
const vertexShader = `
  attribute float alpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = alpha;
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.5, 3.0 * (300.0 / -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
  }
`

const fragmentShader = `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float fade = 1.0 - smoothstep(0.2, 0.5, d);
    gl_FragColor = vec4(vColor, vAlpha * fade * 0.8);
  }
`

export function createWindLayer(scene) {
  const positions = new Float32Array(PARTICLE_COUNT * 3)
  const alphas    = new Float32Array(PARTICLE_COUNT)
  const colors    = new Float32Array(PARTICLE_COUNT * 3)
  const ages      = new Float32Array(PARTICLE_COUNT)
  const maxAges   = new Float32Array(PARTICLE_COUNT)

  // Particle state (lat/lon for advection)
  const pLat = new Float32Array(PARTICLE_COUNT)
  const pLon = new Float32Array(PARTICLE_COUNT)

  // Initialize randomly on sphere
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const lat = Math.asin(Math.random() * 2 - 1) * (180 / Math.PI)
    const lon = Math.random() * 360 - 180
    pLat[i] = lat
    pLon[i] = lon
    const [x, y, z] = ll2v(lat, lon, WIND_R)
    positions[i * 3]     = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z
    alphas[i] = 0
    colors[i * 3] = 0.3; colors[i * 3 + 1] = 0.5; colors[i * 3 + 2] = 0.8
    ages[i]    = Math.random() * MAX_AGE  // stagger births
    maxAges[i] = MAX_AGE * (0.6 + Math.random() * 0.8)
  }

  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage))
  geo.setAttribute('alpha',    new BufferAttribute(alphas, 1).setUsage(DynamicDrawUsage))
  geo.setAttribute('aColor',   new BufferAttribute(colors, 3).setUsage(DynamicDrawUsage))

  const mat = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })

  const points = new Points(geo, mat)
  points.renderOrder = 1
  points.frustumCulled = false
  points.visible = false
  scene.add(points)

  let windLookup = null

  return {
    mesh: points,

    setWindData(data) {
      if (!data?.points?.length) return
      windLookup = buildWindLookup(data.points, data.grid_step || 10)
    },

    show() { points.visible = true },
    hide() { points.visible = false },

    update() {
      if (!points.visible) return

      const posAttr   = geo.attributes.position
      const alphaAttr = geo.attributes.alpha
      const colorAttr = geo.attributes.aColor

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        ages[i]++

        // Reset particle when too old
        if (ages[i] > maxAges[i]) {
          ages[i] = 0
          maxAges[i] = MAX_AGE * (0.6 + Math.random() * 0.8)
          pLat[i] = Math.asin(Math.random() * 2 - 1) * (180 / Math.PI)
          pLon[i] = Math.random() * 360 - 180
        }

        // Advect particle along wind vector (skip if data not yet loaded)
        if (windLookup) {
          const w = windLookup(pLat[i], pLon[i])
          if (w) {
            const cosLat = Math.cos(pLat[i] * Math.PI / 180)
            const speedFactor = SPEED_SCALE * (1 + w.speed * 0.15)
            pLat[i] += w.v * speedFactor
            pLon[i] += w.u * speedFactor / Math.max(cosLat, 0.1)
            if (pLon[i] > 180) pLon[i] -= 360
            if (pLon[i] < -180) pLon[i] += 360
            if (pLat[i] > 85) pLat[i] = 85
            if (pLat[i] < -85) pLat[i] = -85
            const col = speedToColor(w.speed)
            colorAttr.array[i * 3]     = col.r
            colorAttr.array[i * 3 + 1] = col.g
            colorAttr.array[i * 3 + 2] = col.b
          }
        }

        // Update 3D position
        const [x, y, z] = ll2v(pLat[i], pLon[i], WIND_R)
        posAttr.array[i * 3]     = x
        posAttr.array[i * 3 + 1] = y
        posAttr.array[i * 3 + 2] = z

        // Fade in/out
        const life = ages[i] / maxAges[i]
        const fadeIn  = Math.min(ages[i] / 15, 1)
        const fadeOut = Math.max(1 - (life - 0.7) / 0.3, 0)
        alphaAttr.array[i] = fadeIn * (life > 0.7 ? fadeOut : 1)
      }

      posAttr.needsUpdate   = true
      alphaAttr.needsUpdate = true
      colorAttr.needsUpdate = true
    },

    dispose() {
      scene.remove(points)
      geo.dispose()
      mat.dispose()
    },
  }
}
