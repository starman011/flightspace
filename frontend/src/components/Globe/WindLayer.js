import {
  BufferGeometry, BufferAttribute, Points, PointsMaterial,
  AdditiveBlending, Color, DynamicDrawUsage,
} from 'three'

const WIND_R         = 1.007   // above cloud layer (1.006)
const PARTICLE_COUNT = 4000
const MAX_AGE        = 150     // frames at 60fps ≈ 2.5s life
const SPEED_SCALE    = 0.00005 // wind m/s → world-unit displacement per frame
const BASE_ALPHA     = 0.55    // peak per-particle brightness

// Speed → color (blue calm → red gale)
const SPEED_COLORS = [
  { threshold: 0,  color: new Color(0x29b6f6) },  // calm — light blue
  { threshold: 4,  color: new Color(0x26c6da) },  // light — cyan
  { threshold: 8,  color: new Color(0x66bb6a) },  // moderate — green
  { threshold: 12, color: new Color(0xffee58) },  // fresh — yellow
  { threshold: 18, color: new Color(0xffa726) },  // strong — orange
  { threshold: 28, color: new Color(0xef5350) },  // gale — red
]

function speedToColor(speed) {
  for (let i = SPEED_COLORS.length - 1; i >= 0; i--) {
    if (speed >= SPEED_COLORS[i].threshold) {
      if (i === SPEED_COLORS.length - 1) return SPEED_COLORS[i].color.clone()
      const lo = SPEED_COLORS[i], hi = SPEED_COLORS[i + 1]
      const t = (speed - lo.threshold) / (hi.threshold - lo.threshold)
      return lo.color.clone().lerp(hi.color, t)
    }
  }
  return SPEED_COLORS[0].color.clone()
}

function ll2v(lat, lon, r) {
  const phi   = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return [
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  ]
}

function buildWindLookup(pts, gridStep) {
  const map = new Map()
  for (const p of pts) map.set(`${p.lat.toFixed(1)},${p.lon.toFixed(1)}`, p)

  return (lat, lon) => {
    const latLo = Math.floor(lat / gridStep) * gridStep
    const lonLo = Math.floor(lon / gridStep) * gridStep
    const tLat  = (lat - latLo) / gridStep
    const tLon  = (lon - lonLo) / gridStep

    const p00 = map.get(`${latLo.toFixed(1)},${lonLo.toFixed(1)}`)
    const p10 = map.get(`${(latLo + gridStep).toFixed(1)},${lonLo.toFixed(1)}`)
    const p01 = map.get(`${latLo.toFixed(1)},${(lonLo + gridStep).toFixed(1)}`)
    const p11 = map.get(`${(latLo + gridStep).toFixed(1)},${(lonLo + gridStep).toFixed(1)}`)

    if (!p00 && !p10 && !p01 && !p11) return null
    const w = (a, b, c, d) =>
      (a ?? 0) * (1 - tLat) * (1 - tLon) + (b ?? 0) * tLat * (1 - tLon) +
      (c ?? 0) * (1 - tLat) * tLon       + (d ?? 0) * tLat * tLon

    return {
      u:     w(p00?.u, p10?.u, p01?.u, p11?.u),
      v:     w(p00?.v, p10?.v, p01?.v, p11?.v),
      speed: w(p00?.speed, p10?.speed, p01?.speed, p11?.speed),
    }
  }
}

export function createWindLayer(scene) {
  const N       = PARTICLE_COUNT
  const pos     = new Float32Array(N * 3)
  const col     = new Float32Array(N * 3)  // premultiplied alpha color
  const pLat    = new Float32Array(N)
  const pLon    = new Float32Array(N)
  const ages    = new Float32Array(N)
  const maxAges = new Float32Array(N)

  for (let i = 0; i < N; i++) {
    pLat[i]    = Math.asin(Math.random() * 2 - 1) * (180 / Math.PI)
    pLon[i]    = Math.random() * 360 - 180
    const [x, y, z] = ll2v(pLat[i], pLon[i], WIND_R)
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z
    // start transparent (alpha=0 → col = 0,0,0)
    col[i * 3] = 0; col[i * 3 + 1] = 0; col[i * 3 + 2] = 0
    ages[i]    = Math.random() * MAX_AGE
    maxAges[i] = MAX_AGE * (0.5 + Math.random() * 1.0)
  }

  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage))
  geo.setAttribute('color',    new BufferAttribute(col, 3).setUsage(DynamicDrawUsage))

  const mat = new PointsMaterial({
    size:         0.007,
    vertexColors: true,
    transparent:  true,
    opacity:      1.0,
    depthWrite:   false,
    blending:     AdditiveBlending,
    sizeAttenuation: true,
  })

  const pts = new Points(geo, mat)
  pts.renderOrder   = 3
  pts.frustumCulled = false
  pts.visible       = false
  scene.add(pts)

  let windLookup = null
  // Cache color per particle (updated when wind data arrives)
  const particleColor = Array.from({ length: N }, () => new Color(0x29b6f6))

  return {
    mesh: pts,

    setWindData(data) {
      if (!data?.points?.length) return
      windLookup = buildWindLookup(data.points, data.grid_step || 10)
    },

    show() { pts.visible = true },
    hide() { pts.visible = false },

    update() {
      if (!pts.visible) return

      const posAttr = geo.attributes.position
      const colAttr = geo.attributes.color

      for (let i = 0; i < N; i++) {
        ages[i]++

        if (ages[i] > maxAges[i]) {
          ages[i]    = 0
          maxAges[i] = MAX_AGE * (0.5 + Math.random() * 1.0)
          pLat[i]    = Math.asin(Math.random() * 2 - 1) * (180 / Math.PI)
          pLon[i]    = Math.random() * 360 - 180
        }

        if (windLookup) {
          const w = windLookup(pLat[i], pLon[i])
          if (w) {
            const cosLat = Math.max(Math.cos(pLat[i] * Math.PI / 180), 0.05)
            const sf = SPEED_SCALE * (1 + w.speed * 0.1)
            pLat[i] += w.v * sf
            pLon[i] += w.u * sf / cosLat
            if (pLon[i] >  180) pLon[i] -= 360
            if (pLon[i] < -180) pLon[i] += 360
            pLat[i] = Math.max(-85, Math.min(85, pLat[i]))
            particleColor[i] = speedToColor(w.speed)
          }
        }

        const [x, y, z] = ll2v(pLat[i], pLon[i], WIND_R)
        posAttr.array[i * 3]     = x
        posAttr.array[i * 3 + 1] = y
        posAttr.array[i * 3 + 2] = z

        // Fade in/out — bake alpha into vertex color (additive = color * alpha)
        const life    = ages[i] / maxAges[i]
        const fadeIn  = Math.min(ages[i] / 20, 1)
        const fadeOut = life > 0.7 ? Math.max(1 - (life - 0.7) / 0.3, 0) : 1
        const alpha   = fadeIn * fadeOut * BASE_ALPHA
        const c       = particleColor[i]
        colAttr.array[i * 3]     = c.r * alpha
        colAttr.array[i * 3 + 1] = c.g * alpha
        colAttr.array[i * 3 + 2] = c.b * alpha
      }

      posAttr.needsUpdate = true
      colAttr.needsUpdate = true
    },

    dispose() {
      scene.remove(pts)
      geo.dispose()
      mat.dispose()
    },
  }
}
