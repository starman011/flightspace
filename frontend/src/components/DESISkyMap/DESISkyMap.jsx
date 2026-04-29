import { useEffect, useRef, useState, useCallback } from 'react'
import styles from './DESISkyMap.module.css'

const API = import.meta.env.VITE_API_URL || ''

// ── Zenithal equidistant projection (circular all-sky like the reference) ────
// Maps RA/Dec to a circular disc. North pole at center, Dec=-90 at edge.
// Input: ra [0,360], dec [-90,90] → output: x,y in [-1,1] disc
function zenithal(raDeg, decDeg) {
  const ra = (raDeg - 180) * Math.PI / 180   // center on RA=180
  const dec = decDeg * Math.PI / 180
  const r = (Math.PI / 2 - dec) / Math.PI     // 0 at pole, 1 at south pole
  return [r * Math.sin(ra), -r * Math.cos(ra)]
}

function zenithalInverse(x, y) {
  const r = Math.sqrt(x * x + y * y)
  if (r > 1) return null
  const dec = (Math.PI / 2 - r * Math.PI) * 180 / Math.PI
  let ra = Math.atan2(x, -y) * 180 / Math.PI + 180
  if (ra < 0) ra += 360
  if (ra >= 360) ra -= 360
  return { ra, dec }
}

// ── DESI DR1 survey footprint (simplified boundary polygons) ─────────────────
const DESI_FOOTPRINT = [
  { label: 'Spectroscopic', points: [
    [120, 25], [130, 32], [140, 38], [150, 43], [160, 48],
    [170, 53], [180, 57], [190, 59], [200, 60], [210, 60],
    [220, 58], [230, 53], [240, 48], [250, 42], [255, 36],
    [258, 30], [255, 24], [250, 18], [240, 14], [230, 10],
    [220, 7],  [210, 5],  [200, 4],  [190, 4],  [180, 5],
    [170, 7],  [160, 10], [150, 14], [140, 20], [130, 24],
    [120, 25],
  ]},
  { label: 'BOS', points: [
    [355, -2], [5, 3], [15, 8], [25, 14], [35, 18],
    [45, 20], [52, 18], [56, 14], [55, 8], [50, 2],
    [42, -4], [32, -8], [20, -10], [10, -8], [0, -4],
    [355, -2],
  ]},
  { label: '', points: [
    [130, -5], [145, -2], [165, 0], [185, 0], [205, -1],
    [225, -4], [235, -7], [238, -10], [230, -13],
    [210, -14], [190, -13], [170, -10], [150, -8],
    [135, -7], [130, -5],
  ]},
]

// ── Seeded RNG for reproducible starfield ────────────────────────────────────
function seededRNG(seed) {
  let s = seed
  return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647 }
}

// Pre-compute stars once — multiple layers for realistic density
const rng = seededRNG(314159)
const STARS_BRIGHT = Array.from({ length: 800 }, () => ({
  ra: rng() * 360,
  dec: Math.asin(2 * rng() - 1) * 180 / Math.PI,
  r: 1.0 + rng() * 1.2,
  a: 0.6 + rng() * 0.4,
}))
const STARS_MED = Array.from({ length: 4000 }, () => ({
  ra: rng() * 360,
  dec: Math.asin(2 * rng() - 1) * 180 / Math.PI,
  r: 0.4 + rng() * 0.5,
  a: 0.25 + rng() * 0.35,
}))
const STARS_DIM = Array.from({ length: 15000 }, () => ({
  ra: rng() * 360,
  dec: Math.asin(2 * rng() - 1) * 180 / Math.PI,
  r: 0.2 + rng() * 0.3,
  a: 0.08 + rng() * 0.15,
}))

// ── Milky Way density (galactic latitude) ────────────────────────────────────
function galacticLat(raDeg, decDeg) {
  const ra = raDeg * Math.PI / 180
  const dec = decDeg * Math.PI / 180
  return Math.asin(
    Math.sin(dec) * 0.4560 + Math.cos(dec) * 0.8899 * Math.cos(ra - 3.3660)
  )
}

// Pre-baked Milky Way texture on offscreen canvas (render once)
let mwCanvas = null
function getMilkyWayTexture(size) {
  if (mwCanvas && mwCanvas.width === size) return mwCanvas
  mwCanvas = document.createElement('canvas')
  mwCanvas.width = mwCanvas.height = size
  const ctx = mwCanvas.getContext('2d')
  const step = 3
  for (let px = 0; px < size; px += step) {
    for (let py = 0; py < size; py += step) {
      const x = (px / size - 0.5) * 2
      const y = (py / size - 0.5) * 2
      const r = Math.sqrt(x * x + y * y)
      if (r > 1) continue
      const coords = zenithalInverse(x, y)
      if (!coords) continue
      const gb = galacticLat(coords.ra, coords.dec)
      const intensity = Math.exp(-(gb * gb) / (2 * 0.035))  // ~10° sigma in radians²
      if (intensity < 0.04) continue
      const alpha = intensity * 0.18
      ctx.fillStyle = `rgba(45, 40, 55, ${alpha})`
      ctx.fillRect(px, py, step, step)
    }
  }
  return mwCanvas
}

export default function DESISkyMap({ onClose }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const [hoverCoords, setHoverCoords] = useState(null)
  const galaxyDataRef = useRef(null)
  const panRef = useRef({ ox: 0, oy: 0, zoom: 1, dragging: false, lx: 0, ly: 0 })
  const mwTexRef = useRef(null)

  // Load galaxy data
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/desi-galaxies.json')
        if (res.ok) { galaxyDataRef.current = await res.json(); return }
      } catch {}
      try {
        const res = await fetch(`${API}/api/v1/desi/galaxies`)
        if (res.ok) galaxyDataRef.current = await res.json()
      } catch {}
    })()
  }, [])

  const render = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const dpr = Math.min(window.devicePixelRatio, 2)
    const w = wrap.clientWidth
    const h = wrap.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'

    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const pan = panRef.current
    const zoom = pan.zoom

    // Circular projection fills available space
    const diameter = Math.min(w, h) * 0.92 * zoom
    const radius = diameter / 2
    const cx = w / 2 + pan.ox
    const cy = h / 2 + pan.oy

    function toScreen(raDeg, decDeg) {
      const [px, py] = zenithal(raDeg, decDeg)
      return [cx + px * radius, cy + py * radius]
    }

    function fromScreen(sx, sy) {
      const px = (sx - cx) / radius
      const py = (sy - cy) / radius
      return zenithalInverse(px, py)
    }

    // ── Background ──────────────────────────────────────────────────────
    ctx.fillStyle = '#010204'
    ctx.fillRect(0, 0, w, h)

    // Clip to circle
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()

    // Deep space background gradient (darker center, slightly lighter rim)
    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
    bgGrad.addColorStop(0, '#050810')
    bgGrad.addColorStop(0.5, '#030509')
    bgGrad.addColorStop(1, '#080c15')
    ctx.fillStyle = bgGrad
    ctx.fillRect(cx - radius, cy - radius, diameter, diameter)

    // ── Milky Way band (pre-baked texture) ──────────────────────────────
    if (!mwTexRef.current) mwTexRef.current = getMilkyWayTexture(512)
    ctx.drawImage(mwTexRef.current, cx - radius, cy - radius, diameter, diameter)

    // ── Stars ───────────────────────────────────────────────────────────
    // Dim stars first (background dust)
    ctx.fillStyle = 'rgba(180, 190, 210, 0.12)'
    for (const s of STARS_DIM) {
      const [sx, sy] = toScreen(s.ra, s.dec)
      if (sx < cx - radius || sx > cx + radius || sy < cy - radius || sy > cy + radius) continue
      ctx.fillRect(sx, sy, s.r, s.r)
    }

    // Medium stars
    for (const s of STARS_MED) {
      const [sx, sy] = toScreen(s.ra, s.dec)
      if (sx < cx - radius || sx > cx + radius || sy < cy - radius || sy > cy + radius) continue
      ctx.fillStyle = `rgba(195, 205, 225, ${s.a})`
      ctx.beginPath()
      ctx.arc(sx, sy, s.r, 0, Math.PI * 2)
      ctx.fill()
    }

    // Bright stars with subtle glow
    for (const s of STARS_BRIGHT) {
      const [sx, sy] = toScreen(s.ra, s.dec)
      if (sx < cx - radius || sx > cx + radius || sy < cy - radius || sy > cy + radius) continue

      // Boost near Milky Way
      const gb = galacticLat(s.ra, s.dec)
      const mwBoost = Math.exp(-(gb * gb) * 8) * 0.15
      const alpha = Math.min(s.a + mwBoost, 1)

      // Glow
      ctx.fillStyle = `rgba(200, 215, 240, ${alpha * 0.15})`
      ctx.beginPath()
      ctx.arc(sx, sy, s.r * 3, 0, Math.PI * 2)
      ctx.fill()

      // Core
      ctx.fillStyle = `rgba(230, 235, 245, ${alpha})`
      ctx.beginPath()
      ctx.arc(sx, sy, s.r, 0, Math.PI * 2)
      ctx.fill()
    }

    // ── Coordinate grid ─────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(120, 140, 180, 0.10)'
    ctx.lineWidth = 0.6

    // RA meridians every 30°
    for (let ra = 0; ra < 360; ra += 30) {
      ctx.beginPath()
      for (let dec = -90; dec <= 90; dec += 2) {
        const [sx, sy] = toScreen(ra, dec)
        dec === -90 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy)
      }
      ctx.stroke()

      // RA label at equator
      const [lx, ly] = toScreen(ra, 2)
      ctx.fillStyle = 'rgba(150, 170, 210, 0.45)'
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`${ra}`, lx, ly + 11)
    }

    // Dec parallels every 30°
    for (let dec = -60; dec <= 60; dec += 30) {
      ctx.beginPath()
      for (let ra = 0; ra <= 360; ra += 2) {
        const [sx, sy] = toScreen(ra, dec)
        ra === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy)
      }
      ctx.stroke()

      // Dec label
      const [lx, ly] = toScreen(185, dec)
      ctx.fillStyle = 'rgba(150, 170, 210, 0.4)'
      ctx.font = '8px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`${dec > 0 ? '+' : ''}${dec}°`, lx + 4, ly - 3)
    }

    // ── DESI survey boundaries (red) ────────────────────────────────────
    for (const region of DESI_FOOTPRINT) {
      ctx.beginPath()
      for (let i = 0; i < region.points.length; i++) {
        const [ra, dec] = region.points[i]
        const [sx, sy] = toScreen(ra, dec)
        i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy)
      }
      ctx.closePath()

      // Faint red fill
      ctx.fillStyle = 'rgba(200, 30, 30, 0.04)'
      ctx.fill()

      // Red boundary
      ctx.strokeStyle = 'rgba(230, 45, 45, 0.6)'
      ctx.lineWidth = 1.8
      ctx.stroke()

      // Label
      if (region.label) {
        const mid = Math.floor(region.points.length * 0.4)
        const [lx, ly] = toScreen(region.points[mid][0], region.points[mid][1])
        ctx.fillStyle = 'rgba(230, 70, 70, 0.55)'
        ctx.font = 'bold 10px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(region.label, lx, ly + 4)
      }
    }

    // ── DESI galaxy/quasar dots (faint blue) ────────────────────────────
    const data = galaxyDataRef.current
    if (data && data.length > 0) {
      const step = zoom < 1.5 ? 5 : zoom < 3 ? 3 : 1

      for (let i = 0; i < data.length; i += step) {
        const g = data[i]
        const [sx, sy] = toScreen(g.r, g.d)

        // Quick bounds check
        const dx = sx - cx, dy = sy - cy
        if (dx * dx + dy * dy > radius * radius) continue

        const isQSO = g.s === 'Q' || g.s === 'QSO'
        const t = Math.min(g.z / 2.0, 1.0)

        if (isQSO) {
          ctx.fillStyle = `rgba(190, 160, 90, ${0.25 + t * 0.15})`
        } else {
          // Faint blue — not cyan
          ctx.fillStyle = `rgba(${55 - t * 15}, ${100 + t * 20}, ${160 + t * 40}, ${0.30 + t * 0.12})`
        }

        ctx.fillRect(sx - 0.5, sy - 0.5, 1, 1)  // pixel dot for speed
      }
    }

    ctx.restore()

    // ── Circle border ───────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(80, 100, 140, 0.3)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.stroke()

    // ── Outer RA ticks around circle rim ─────────────────────────────────
    for (let ra = 0; ra < 360; ra += 30) {
      const angle = (ra - 180) * Math.PI / 180
      const x1 = cx + Math.sin(angle) * radius
      const y1 = cy - Math.cos(angle) * radius
      const x2 = cx + Math.sin(angle) * (radius + 8)
      const y2 = cy - Math.cos(angle) * (radius + 8)
      ctx.strokeStyle = 'rgba(130, 150, 190, 0.3)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()

      const lx = cx + Math.sin(angle) * (radius + 16)
      const ly = cy - Math.cos(angle) * (radius + 16)
      ctx.fillStyle = 'rgba(140, 160, 200, 0.5)'
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${ra}°`, lx, ly)
    }

    // ── Timestamp + info labels ─────────────────────────────────────────
    const now = new Date()
    const utc = now.toISOString().replace('T', ' ').slice(0, 19) + ' UT'
    ctx.fillStyle = 'rgba(140, 160, 200, 0.45)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(utc, 12, 50)

    panRef.current._fromScreen = fromScreen
  }, [])

  // Setup + resize + data poll
  useEffect(() => {
    render()
    const onResize = () => render()
    window.addEventListener('resize', onResize)
    const poll = setInterval(() => {
      if (galaxyDataRef.current) { render(); clearInterval(poll) }
    }, 500)
    return () => { window.removeEventListener('resize', onResize); clearInterval(poll) }
  }, [render])

  // Pan + zoom
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    const onWheel = (e) => {
      e.preventDefault()
      const p = panRef.current
      p.zoom = Math.max(0.5, Math.min(6, p.zoom * (e.deltaY > 0 ? 0.92 : 1.08)))
      render()
    }

    const onDown = (e) => {
      panRef.current.dragging = true
      panRef.current.lx = e.clientX
      panRef.current.ly = e.clientY
    }

    const onMove = (e) => {
      const p = panRef.current
      if (p._fromScreen) {
        const rect = wrap.getBoundingClientRect()
        setHoverCoords(p._fromScreen(e.clientX - rect.left, e.clientY - rect.top))
      }
      if (!p.dragging) return
      p.ox += e.clientX - p.lx
      p.oy += e.clientY - p.ly
      p.lx = e.clientX
      p.ly = e.clientY
      render()
    }

    const onUp = () => { panRef.current.dragging = false }

    let lastDist = 0
    const onTS = (e) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        lastDist = Math.sqrt(dx * dx + dy * dy)
      } else if (e.touches.length === 1) {
        panRef.current.dragging = true
        panRef.current.lx = e.touches[0].clientX
        panRef.current.ly = e.touches[0].clientY
      }
    }
    const onTM = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const d = Math.sqrt(dx * dx + dy * dy)
        if (lastDist > 0) {
          panRef.current.zoom = Math.max(0.5, Math.min(6, panRef.current.zoom * d / lastDist))
          render()
        }
        lastDist = d
      } else if (e.touches.length === 1 && panRef.current.dragging) {
        const p = panRef.current
        p.ox += e.touches[0].clientX - p.lx
        p.oy += e.touches[0].clientY - p.ly
        p.lx = e.touches[0].clientX
        p.ly = e.touches[0].clientY
        render()
      }
    }
    const onTE = () => { panRef.current.dragging = false; lastDist = 0 }

    wrap.addEventListener('wheel', onWheel, { passive: false })
    wrap.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    wrap.addEventListener('touchstart', onTS, { passive: false })
    wrap.addEventListener('touchmove', onTM, { passive: false })
    wrap.addEventListener('touchend', onTE)

    return () => {
      wrap.removeEventListener('wheel', onWheel)
      wrap.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      wrap.removeEventListener('touchstart', onTS)
      wrap.removeEventListener('touchmove', onTM)
      wrap.removeEventListener('touchend', onTE)
    }
  }, [render])

  // Escape to close
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className={styles.overlay}>
      <div className={styles.toolbar}>
        <span className={styles.title}>DESI DR1 — All-Sky Survey</span>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
      </div>

      <div className={styles.canvasWrap} ref={wrapRef}>
        <canvas className={styles.canvas} ref={canvasRef} />
      </div>

      {hoverCoords && (
        <div className={styles.coords}>
          RA {hoverCoords.ra.toFixed(2)}° &nbsp; Dec {hoverCoords.dec.toFixed(2)}°
        </div>
      )}

      <div className={styles.legend}>
        <span><span className={styles.legendDot} style={{ background: 'rgba(55, 100, 180, 0.8)' }} />Galaxy</span>
        <span><span className={styles.legendDot} style={{ background: 'rgba(190, 160, 90, 0.8)' }} />Quasar</span>
        <span><span className={styles.legendDot} style={{ background: 'rgba(230, 45, 45, 0.8)' }} />DESI boundary</span>
        <span>scroll zoom · drag pan</span>
      </div>
    </div>
  )
}
