import {
  BufferGeometry, BufferAttribute, LineSegments, LineBasicMaterial,
  AdditiveBlending, Color, DynamicDrawUsage,
} from 'three'

const WIND_R         = 1.007
const PARTICLE_COUNT = 4000
const SPEED_SCALE    = 0.0009   // faster movement so trail is visible
const TRAIL_LEN      = 12       // history points per particle
const TRAIL_SAMPLE   = 4        // record position every N frames
const SEGMENTS_PER   = TRAIL_LEN - 1
const MAX_AGE        = TRAIL_LEN * TRAIL_SAMPLE * 4

const SPEED_STOPS = [
  { t: 0,   c: new Color(0x90caf9) },
  { t: 5,   c: new Color(0x4dd0e1) },
  { t: 10,  c: new Color(0x81c784) },
  { t: 16,  c: new Color(0xfff176) },
  { t: 22,  c: new Color(0xffb74d) },
  { t: 32,  c: new Color(0xef5350) },
]

function speedColor(speed) {
  for (let i = SPEED_STOPS.length - 1; i >= 0; i--) {
    if (speed >= SPEED_STOPS[i].t) {
      if (i === SPEED_STOPS.length - 1) return SPEED_STOPS[i].c
      const lo = SPEED_STOPS[i], hi = SPEED_STOPS[i + 1]
      const t = (speed - lo.t) / (hi.t - lo.t)
      return lo.c.clone().lerp(hi.c, t)
    }
  }
  return SPEED_STOPS[0].c
}

function ll2v(lat, lon, r, out, off) {
  const phi   = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  out[off]     = -r * Math.sin(phi) * Math.cos(theta)
  out[off + 1] =  r * Math.cos(phi)
  out[off + 2] =  r * Math.sin(phi) * Math.sin(theta)
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

  // Position history ring buffer — lat/lon for each particle × TRAIL_LEN slots
  const histLat   = new Float32Array(N * TRAIL_LEN)
  const histLon   = new Float32Array(N * TRAIL_LEN)
  // How many slots filled so far (capped at TRAIL_LEN)
  const histFill  = new Uint8Array(N)
  // Frames since last sample recorded
  const frameTick = new Uint8Array(N)

  const pLat   = new Float32Array(N)
  const pLon   = new Float32Array(N)
  const ages   = new Float32Array(N)
  const pSpeed = new Float32Array(N)

  // Geometry: (TRAIL_LEN-1) segments × 2 verts × N particles
  const TOTAL_VERTS = N * SEGMENTS_PER * 2
  const pos = new Float32Array(TOTAL_VERTS * 3)
  const col = new Float32Array(TOTAL_VERTS * 3)

  function initParticle(i) {
    pLat[i]   = Math.asin(Math.random() * 2 - 1) * (180 / Math.PI)
    pLon[i]   = Math.random() * 360 - 180
    ages[i]   = Math.random() * MAX_AGE
    pSpeed[i] = 5
    histFill[i]  = 0
    frameTick[i] = Math.floor(Math.random() * TRAIL_SAMPLE)
    // Seed all history slots to current position (trail starts as a dot, unfurls over time)
    for (let t = 0; t < TRAIL_LEN; t++) {
      histLat[i * TRAIL_LEN + t] = pLat[i]
      histLon[i * TRAIL_LEN + t] = pLon[i]
    }
  }

  for (let i = 0; i < N; i++) initParticle(i)

  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage))
  geo.setAttribute('color',    new BufferAttribute(col, 3).setUsage(DynamicDrawUsage))

  const mat = new LineBasicMaterial({
    vertexColors: true,
    transparent:  true,
    opacity:      1.0,
    depthWrite:   false,
    blending:     AdditiveBlending,
    linewidth:    1,
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
        if (ages[i] > MAX_AGE) {
          initParticle(i)
          ages[i] = 0
        }

        // Advect particle
        if (windLookup) {
          const w = windLookup(pLat[i], pLon[i])
          if (w) {
            const cosLat = Math.max(Math.cos(pLat[i] * Math.PI / 180), 0.05)
            const sf = SPEED_SCALE * (1 + w.speed * 0.06)
            pLon[i] += w.u * sf / cosLat
            pLat[i] += w.v * sf
            if (pLon[i] >  180) pLon[i] -= 360
            if (pLon[i] < -180) pLon[i] += 360
            pLat[i]   = Math.max(-85, Math.min(85, pLat[i]))
            pSpeed[i] = w.speed
          }
        }

        // Sample position into history every TRAIL_SAMPLE frames
        frameTick[i]++
        if (frameTick[i] >= TRAIL_SAMPLE) {
          frameTick[i] = 0
          // Shift history: oldest drops off, newest = current
          const base = i * TRAIL_LEN
          for (let t = 0; t < TRAIL_LEN - 1; t++) {
            histLat[base + t] = histLat[base + t + 1]
            histLon[base + t] = histLon[base + t + 1]
          }
          histLat[base + TRAIL_LEN - 1] = pLat[i]
          histLon[base + TRAIL_LEN - 1] = pLon[i]
          if (histFill[i] < TRAIL_LEN) histFill[i]++
        }

        // Life fade (fade in first 20%, fade out last 20%)
        const life    = ages[i] / MAX_AGE
        const fadeIn  = Math.min(ages[i] / (MAX_AGE * 0.15), 1)
        const fadeOut = life > 0.8 ? Math.max(1 - (life - 0.8) / 0.2, 0) : 1
        const baseFade = fadeIn * fadeOut

        const c = speedColor(pSpeed[i])
        const base = i * TRAIL_LEN

        // Write each segment (TRAIL_LEN-1 segments per particle)
        for (let s = 0; s < SEGMENTS_PER; s++) {
          const vBase = (i * SEGMENTS_PER + s) * 6  // 2 verts × 3 floats

          // Alpha: 0 at tail (s=0), 1 at head (s=SEGMENTS_PER-1)
          // Tail vertex of segment
          const alphaTail = (s       / SEGMENTS_PER) * baseFade
          // Head vertex of segment
          const alphaHead = ((s + 1) / SEGMENTS_PER) * baseFade

          ll2v(histLat[base + s],     histLon[base + s],     WIND_R, pos, vBase)
          ll2v(histLat[base + s + 1], histLon[base + s + 1], WIND_R, pos, vBase + 3)

          col[vBase]     = c.r * alphaTail
          col[vBase + 1] = c.g * alphaTail
          col[vBase + 2] = c.b * alphaTail
          col[vBase + 3] = c.r * alphaHead
          col[vBase + 4] = c.g * alphaHead
          col[vBase + 5] = c.b * alphaHead
        }
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
