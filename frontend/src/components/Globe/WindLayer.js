import {
  BufferGeometry, BufferAttribute, LineSegments, LineBasicMaterial,
  AdditiveBlending, Color, DynamicDrawUsage,
} from 'three'

const WIND_R         = 1.007
const PARTICLE_COUNT = 5000
const MAX_AGE        = 180   // ~3s at 60fps
const SPEED_SCALE    = 0.00007
const TRAIL_SCALE    = 3.5   // trail tail = TRAIL_SCALE × one-frame displacement

// Speed → color: calm white-blue → violent red
// Keep colors bright/light so they're visible on the dark globe
const SPEED_STOPS = [
  { t: 0,   c: new Color(0x90caf9) },  // 0  m/s — pale blue
  { t: 5,   c: new Color(0x4dd0e1) },  // 5  m/s — cyan
  { t: 10,  c: new Color(0x81c784) },  // 10 m/s — light green
  { t: 16,  c: new Color(0xfff176) },  // 16 m/s — yellow
  { t: 22,  c: new Color(0xffb74d) },  // 22 m/s — orange
  { t: 32,  c: new Color(0xef5350) },  // 32 m/s — red
]

function speedColor(speed) {
  for (let i = SPEED_STOPS.length - 1; i >= 0; i--) {
    if (speed >= SPEED_STOPS[i].t) {
      if (i === SPEED_STOPS.length - 1) return SPEED_STOPS[i].c.clone()
      const lo = SPEED_STOPS[i], hi = SPEED_STOPS[i + 1]
      const t = (speed - lo.t) / (hi.t - lo.t)
      return lo.c.clone().lerp(hi.c, t)
    }
  }
  return SPEED_STOPS[0].c.clone()
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
      (a??0)*(1-tLat)*(1-tLon) + (b??0)*tLat*(1-tLon) + (c??0)*(1-tLat)*tLon + (d??0)*tLat*tLon
    return {
      u:     w(p00?.u,     p10?.u,     p01?.u,     p11?.u),
      v:     w(p00?.v,     p10?.v,     p01?.v,     p11?.v),
      speed: w(p00?.speed, p10?.speed, p01?.speed, p11?.speed),
    }
  }
}

export function createWindLayer(scene) {
  const N = PARTICLE_COUNT
  // Each particle = 1 line segment = 2 vertices (tail, head)
  const pos  = new Float32Array(N * 6)  // 2 points × 3 coords
  const col  = new Float32Array(N * 6)  // 2 points × 3 color channels

  const pLat    = new Float32Array(N)
  const pLon    = new Float32Array(N)
  const ages    = new Float32Array(N)
  const maxAges = new Float32Array(N)
  const pSpeed  = new Float32Array(N)

  for (let i = 0; i < N; i++) {
    pLat[i]    = Math.asin(Math.random() * 2 - 1) * (180 / Math.PI)
    pLon[i]    = Math.random() * 360 - 180
    ages[i]    = Math.random() * MAX_AGE
    maxAges[i] = MAX_AGE * (0.5 + Math.random())
    pSpeed[i]  = 5  // default calm
    // Both vertices start at same position (invisible zero-length line)
    const [x, y, z] = ll2v(pLat[i], pLon[i], WIND_R)
    for (let v = 0; v < 2; v++) {
      pos[i * 6 + v * 3]     = x
      pos[i * 6 + v * 3 + 1] = y
      pos[i * 6 + v * 3 + 2] = z
    }
  }

  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage))
  geo.setAttribute('color',    new BufferAttribute(col, 3).setUsage(DynamicDrawUsage))

  const mat = new LineBasicMaterial({
    vertexColors: true,
    transparent:  true,
    opacity:      1.0,
    depthWrite:   false,
    blending:     AdditiveBlending,
  })

  const lines = new LineSegments(geo, mat)
  lines.renderOrder   = 3
  lines.frustumCulled = false
  lines.visible       = false
  scene.add(lines)

  let windLookup = null

  return {
    mesh: lines,

    setWindData(data) {
      if (!data?.points?.length) return
      windLookup = buildWindLookup(data.points, data.grid_step || 10)
    },

    show() { lines.visible = true },
    hide() { lines.visible = false },

    update() {
      if (!lines.visible) return

      const posAttr = geo.attributes.position
      const colAttr = geo.attributes.color

      for (let i = 0; i < N; i++) {
        ages[i]++

        if (ages[i] > maxAges[i]) {
          ages[i]    = 0
          maxAges[i] = MAX_AGE * (0.5 + Math.random())
          pLat[i]    = Math.asin(Math.random() * 2 - 1) * (180 / Math.PI)
          pLon[i]    = Math.random() * 360 - 180
        }

        // Advect head position along wind vector
        let du = 0, dv = 0
        if (windLookup) {
          const w = windLookup(pLat[i], pLon[i])
          if (w) {
            const cosLat = Math.max(Math.cos(pLat[i] * Math.PI / 180), 0.05)
            const sf = SPEED_SCALE * (1 + w.speed * 0.08)
            du = w.u * sf / cosLat
            dv = w.v * sf
            pLat[i] += dv
            pLon[i] += du
            if (pLon[i] >  180) pLon[i] -= 360
            if (pLon[i] < -180) pLon[i] += 360
            pLat[i] = Math.max(-85, Math.min(85, pLat[i]))
            pSpeed[i] = w.speed
          }
        }

        // Head = current position
        const [hx, hy, hz] = ll2v(pLat[i], pLon[i], WIND_R)
        // Tail = step back along wind direction (longer trail = faster wind)
        const tailFactor = TRAIL_SCALE * (1 + (pSpeed[i] / 15))
        const tailLat = Math.max(-85, Math.min(85, pLat[i] - dv * tailFactor))
        let   tailLon = pLon[i] - du * tailFactor
        if (tailLon >  180) tailLon -= 360
        if (tailLon < -180) tailLon += 360
        const [tx, ty, tz] = ll2v(tailLat, tailLon, WIND_R)

        // Write: index 0 = tail, index 1 = head
        posAttr.array[i * 6]     = tx; posAttr.array[i * 6 + 1] = ty; posAttr.array[i * 6 + 2] = tz
        posAttr.array[i * 6 + 3] = hx; posAttr.array[i * 6 + 4] = hy; posAttr.array[i * 6 + 5] = hz

        // Fade alpha by age
        const life    = ages[i] / maxAges[i]
        const fadeIn  = Math.min(ages[i] / 25, 1)
        const fadeOut = life > 0.75 ? Math.max(1 - (life - 0.75) / 0.25, 0) : 1
        const alpha   = fadeIn * fadeOut

        const c = speedColor(pSpeed[i])
        // Tail: transparent (alpha = 0, so color = 0,0,0)
        colAttr.array[i * 6]     = 0
        colAttr.array[i * 6 + 1] = 0
        colAttr.array[i * 6 + 2] = 0
        // Head: full brightness × alpha
        colAttr.array[i * 6 + 3] = c.r * alpha
        colAttr.array[i * 6 + 4] = c.g * alpha
        colAttr.array[i * 6 + 5] = c.b * alpha
      }

      posAttr.needsUpdate = true
      colAttr.needsUpdate = true
    },

    dispose() {
      scene.remove(lines)
      geo.dispose()
      mat.dispose()
    },
  }
}
