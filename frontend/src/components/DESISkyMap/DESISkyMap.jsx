import { useEffect, useRef, useState, useCallback } from 'react'
import styles from './DESISkyMap.module.css'

const API = import.meta.env.VITE_API_URL || ''

// ── Aitoff projection (equal-area all-sky) ────────────────────────────────────
// Input: ra [0,360], dec [-90,90] → output: x [-2,2], y [-1,1]
function aitoff(raDeg, decDeg) {
  // Center on RA=180 so galactic plane runs horizontally
  let lon = (raDeg - 180) * Math.PI / 180  // [-π, π]
  const lat = decDeg * Math.PI / 180

  const z = Math.sqrt(1 + Math.cos(lat) * Math.cos(lon / 2))
  const x = 2 * Math.cos(lat) * Math.sin(lon / 2) / z
  const y = Math.sin(lat) / z
  return [x, y]  // x ∈ [-2,2], y ∈ [-1,1]
}

// Inverse Aitoff: screen → ra/dec (for hover coords)
function aitoffInverse(x, y) {
  // x ∈ [-2,2], y ∈ [-1,1]
  const z2 = 1 - (x / 4) * (x / 4) - (y / 2) * (y / 2)
  if (z2 < 0) return null
  const z = Math.sqrt(z2)
  const lat = Math.asin(y * z)
  const lon = 2 * Math.atan2(x * z, 2 * z2 - 1)
  let ra = (lon * 180 / Math.PI) + 180
  if (ra < 0) ra += 360
  if (ra >= 360) ra -= 360
  const dec = lat * 180 / Math.PI
  return { ra, dec }
}

// ── DESI DR1 approximate survey footprint boundaries (simplified polygons) ──
// These trace the main spectroscopic survey regions (BGS+LRG+ELG+QSO)
// Coordinates are [RA, Dec] pairs forming closed polygons
const DESI_FOOTPRINT = [
  // North Galactic Cap (NGC) — main contiguous region
  { label: 'NGC', points: [
    [120, 25], [130, 30], [140, 35], [150, 40], [160, 45],
    [170, 50], [180, 55], [190, 58], [200, 60], [210, 60],
    [220, 58], [230, 55], [240, 50], [250, 45], [255, 40],
    [258, 35], [255, 28], [250, 22], [240, 18], [230, 15],
    [220, 12], [210, 10], [200, 8], [190, 7], [180, 7],
    [170, 8], [160, 10], [150, 14], [140, 18], [130, 22],
    [120, 25],
  ]},
  // South Galactic Cap (SGC) — smaller patch
  { label: 'SGC', points: [
    [0, 0], [10, 5], [20, 10], [30, 15], [40, 18],
    [50, 18], [55, 15], [58, 10], [55, 5], [50, 0],
    [40, -5], [30, -8], [20, -10], [10, -8], [5, -5],
    [0, 0],
  ]},
  // Extended NGC region (Dec < 0 equatorial strip)
  { label: 'EQ', points: [
    [130, -5], [150, -2], [170, 0], [190, 0], [210, -2],
    [230, -5], [240, -8], [235, -10], [220, -12],
    [200, -12], [180, -10], [160, -8], [140, -8], [130, -5],
  ]},
]

// ── Procedural dense starfield ────────────────────────────────────────────────
// Seeded random for reproducibility
function seededRNG(seed) {
  let s = seed
  return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647 }
}

function generateStars(count) {
  const rng = seededRNG(42)
  const stars = new Array(count)
  for (let i = 0; i < count; i++) {
    // Uniform on sphere
    const ra = rng() * 360
    const dec = Math.asin(2 * rng() - 1) * 180 / Math.PI
    const mag = rng()  // 0 = bright, 1 = dim
    stars[i] = { ra, dec, mag }
  }
  return stars
}

const STAR_COUNT = 12000
const STARS = generateStars(STAR_COUNT)

// ── Milky Way band (Gaussian density along galactic plane) ────────────────────
// Galactic coords → RA/Dec (rough: galactic north pole at RA=192.86, Dec=27.13)
function galacticLatitude(raDeg, decDeg) {
  const ra = raDeg * Math.PI / 180
  const dec = decDeg * Math.PI / 180
  const raGP = 192.86 * Math.PI / 180
  const decGP = 27.13 * Math.PI / 180
  return Math.asin(
    Math.sin(dec) * Math.sin(decGP) +
    Math.cos(dec) * Math.cos(decGP) * Math.cos(ra - raGP)
  ) * 180 / Math.PI
}

export default function DESISkyMap({ onClose }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const [hoverCoords, setHoverCoords] = useState(null)
  const galaxyDataRef = useRef(null)
  const panRef = useRef({ ox: 0, oy: 0, zoom: 1, dragging: false, lx: 0, ly: 0 })

  // Load galaxy data
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/desi-galaxies.json')
        if (res.ok) {
          galaxyDataRef.current = await res.json()
          return
        }
      } catch { /* fallback */ }
      try {
        const res = await fetch(`${API}/api/v1/desi/galaxies`)
        if (res.ok) galaxyDataRef.current = await res.json()
      } catch { /* no data */ }
    }
    load()
  }, [])

  // Main render function
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
    // Map projection coords to screen
    // Aitoff x ∈ [-2,2], y ∈ [-1,1] → fill screen with padding
    const aspect = w / h
    const projAspect = 2  // Aitoff is 2:1
    let scale, cx, cy
    if (aspect > projAspect) {
      scale = (h * 0.44) * zoom
      cx = w / 2 + pan.ox
      cy = h / 2 + pan.oy
    } else {
      scale = (w / 2 * 0.48) * zoom
      cx = w / 2 + pan.ox
      cy = h / 2 + pan.oy
    }

    function toScreen(raDeg, decDeg) {
      const [px, py] = aitoff(raDeg, decDeg)
      return [cx + px * scale, cy - py * scale]
    }

    function fromScreen(sx, sy) {
      const px = (sx - cx) / scale
      const py = -(sy - cy) / scale
      return aitoffInverse(px, py)
    }

    // ── Background ──────────────────────────────────────────────────────
    ctx.fillStyle = '#020408'
    ctx.fillRect(0, 0, w, h)

    // Draw projection boundary ellipse
    ctx.save()
    ctx.beginPath()
    for (let i = 0; i <= 200; i++) {
      const t = (i / 200) * 2 * Math.PI
      const bx = cx + 2 * Math.cos(t) * scale
      const by = cy - Math.sin(t) * scale
      i === 0 ? ctx.moveTo(bx, by) : ctx.lineTo(bx, by)
    }
    ctx.closePath()
    ctx.clip()

    // Milky Way glow band
    const mwGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 2.2)
    mwGrad.addColorStop(0, 'rgba(20, 25, 40, 0)')
    mwGrad.addColorStop(1, 'rgba(8, 12, 25, 0)')
    ctx.fillStyle = mwGrad
    ctx.fillRect(0, 0, w, h)

    // Draw milky way as density band
    for (let sx = 0; sx < w; sx += 4) {
      for (let sy = 0; sy < h; sy += 4) {
        const coords = fromScreen(sx, sy)
        if (!coords) continue
        const gb = galacticLatitude(coords.ra, coords.dec)
        const intensity = Math.exp(-(gb * gb) / (2 * 12 * 12))  // σ=12°
        if (intensity > 0.05) {
          ctx.fillStyle = `rgba(30, 35, 55, ${intensity * 0.25})`
          ctx.fillRect(sx, sy, 4, 4)
        }
      }
    }

    // ── Stars (dense background) ────────────────────────────────────────
    for (const star of STARS) {
      const [sx, sy] = toScreen(star.ra, star.dec)
      if (sx < -10 || sx > w + 10 || sy < -10 || sy > h + 10) continue

      const brightness = 1 - star.mag * 0.85
      const r = (1 - star.mag) * 1.2 + 0.3

      // Stars near galactic plane slightly brighter (Milky Way density)
      const gb = galacticLatitude(star.ra, star.dec)
      const mwBoost = Math.exp(-(gb * gb) / (2 * 15 * 15)) * 0.3

      const alpha = Math.min(brightness + mwBoost, 1)
      ctx.fillStyle = `rgba(200, 210, 230, ${alpha * 0.7})`
      ctx.beginPath()
      ctx.arc(sx, sy, r * (zoom > 2 ? 0.8 : 1), 0, Math.PI * 2)
      ctx.fill()
    }

    // ── Coordinate grid ─────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(80, 100, 140, 0.12)'
    ctx.lineWidth = 0.5

    // RA lines every 30°
    for (let ra = 0; ra < 360; ra += 30) {
      ctx.beginPath()
      for (let dec = -90; dec <= 90; dec += 1) {
        const [sx, sy] = toScreen(ra, dec)
        dec === -90 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy)
      }
      ctx.stroke()

      // Label
      const [lx, ly] = toScreen(ra, 0)
      ctx.fillStyle = 'rgba(100, 120, 160, 0.35)'
      ctx.font = `${Math.max(8, 10 * Math.min(zoom, 2))}px monospace`
      ctx.textAlign = 'center'
      ctx.fillText(`${ra}°`, lx, ly + 12)
    }

    // Dec lines every 30°
    for (let dec = -60; dec <= 60; dec += 30) {
      ctx.beginPath()
      for (let ra = 0; ra <= 360; ra += 1) {
        const [sx, sy] = toScreen(ra, dec)
        ra === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy)
      }
      ctx.stroke()

      // Label
      const [lx, ly] = toScreen(0, dec)
      ctx.fillStyle = 'rgba(100, 120, 160, 0.35)'
      ctx.font = `${Math.max(8, 10 * Math.min(zoom, 2))}px monospace`
      ctx.textAlign = 'left'
      ctx.fillText(`${dec > 0 ? '+' : ''}${dec}°`, lx + 4, ly - 2)
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

      // Fill with faint red
      ctx.fillStyle = 'rgba(180, 40, 40, 0.06)'
      ctx.fill()

      // Red boundary stroke
      ctx.strokeStyle = 'rgba(220, 50, 50, 0.55)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Region label
      const midIdx = Math.floor(region.points.length / 2)
      const [lx, ly] = toScreen(region.points[midIdx][0], region.points[midIdx][1])
      ctx.fillStyle = 'rgba(220, 80, 80, 0.5)'
      ctx.font = `bold ${Math.max(9, 11 * Math.min(zoom, 2))}px monospace`
      ctx.textAlign = 'center'
      ctx.fillText(region.label, lx, ly)
    }

    // ── Galaxy/quasar dots (faint blue) ─────────────────────────────────
    const data = galaxyDataRef.current
    if (data && data.length > 0) {
      // Subsample for performance at low zoom
      const step = zoom < 1.5 ? 4 : zoom < 3 ? 2 : 1
      for (let i = 0; i < data.length; i += step) {
        const g = data[i]
        const [sx, sy] = toScreen(g.r, g.d)
        if (sx < -5 || sx > w + 5 || sy < -5 || sy > h + 5) continue

        const isQSO = g.s === 'Q' || g.s === 'QSO'
        const t = Math.min(g.z / 2.0, 1.0)

        // Faint blue for galaxies, faint gold for quasars
        if (isQSO) {
          ctx.fillStyle = `rgba(200, 170, 100, ${0.3 + t * 0.2})`
        } else {
          const b = Math.floor(140 + t * 60)  // blue channel 140-200
          const g2 = Math.floor(120 + t * 30)
          ctx.fillStyle = `rgba(${70 - t * 20}, ${g2}, ${b}, ${0.35 + t * 0.15})`
        }

        const r = isQSO ? 1.2 : 0.8
        ctx.beginPath()
        ctx.arc(sx, sy, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // ── Equatorial line ─────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(100, 130, 180, 0.15)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    for (let ra = 0; ra <= 360; ra += 1) {
      const [sx, sy] = toScreen(ra, 0)
      ra === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy)
    }
    ctx.stroke()
    ctx.setLineDash([])

    ctx.restore()

    // ── Projection boundary outline ─────────────────────────────────────
    ctx.strokeStyle = 'rgba(60, 80, 120, 0.3)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 0; i <= 200; i++) {
      const t = (i / 200) * 2 * Math.PI
      const bx = cx + 2 * Math.cos(t) * scale
      const by = cy - Math.sin(t) * scale
      i === 0 ? ctx.moveTo(bx, by) : ctx.lineTo(bx, by)
    }
    ctx.closePath()
    ctx.stroke()

    // Store fromScreen for hover
    panRef.current._fromScreen = fromScreen
  }, [])

  // Setup + resize
  useEffect(() => {
    render()
    const onResize = () => render()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [render])

  // Re-render when galaxy data loads
  useEffect(() => {
    const interval = setInterval(() => {
      if (galaxyDataRef.current) {
        render()
        clearInterval(interval)
      }
    }, 500)
    return () => clearInterval(interval)
  }, [render])

  // Pan + zoom handlers
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    function onWheel(e) {
      e.preventDefault()
      const pan = panRef.current
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      pan.zoom = Math.max(0.5, Math.min(8, pan.zoom * delta))
      render()
    }

    function onPointerDown(e) {
      const pan = panRef.current
      pan.dragging = true
      pan.lx = e.clientX
      pan.ly = e.clientY
    }

    function onPointerMove(e) {
      const pan = panRef.current

      // Hover coords
      if (pan._fromScreen) {
        const rect = wrap.getBoundingClientRect()
        const coords = pan._fromScreen(e.clientX - rect.left, e.clientY - rect.top)
        setHoverCoords(coords)
      }

      if (!pan.dragging) return
      const dx = e.clientX - pan.lx
      const dy = e.clientY - pan.ly
      pan.ox += dx
      pan.oy += dy
      pan.lx = e.clientX
      pan.ly = e.clientY
      render()
    }

    function onPointerUp() {
      panRef.current.dragging = false
    }

    // Touch zoom
    let lastTouchDist = 0
    function onTouchStart(e) {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        lastTouchDist = Math.sqrt(dx * dx + dy * dy)
      } else if (e.touches.length === 1) {
        panRef.current.dragging = true
        panRef.current.lx = e.touches[0].clientX
        panRef.current.ly = e.touches[0].clientY
      }
    }

    function onTouchMove(e) {
      if (e.touches.length === 2) {
        e.preventDefault()
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (lastTouchDist > 0) {
          const pan = panRef.current
          pan.zoom = Math.max(0.5, Math.min(8, pan.zoom * (dist / lastTouchDist)))
          render()
        }
        lastTouchDist = dist
      } else if (e.touches.length === 1 && panRef.current.dragging) {
        const pan = panRef.current
        pan.ox += e.touches[0].clientX - pan.lx
        pan.oy += e.touches[0].clientY - pan.ly
        pan.lx = e.touches[0].clientX
        pan.ly = e.touches[0].clientY
        render()
      }
    }

    function onTouchEnd() {
      panRef.current.dragging = false
      lastTouchDist = 0
    }

    wrap.addEventListener('wheel', onWheel, { passive: false })
    wrap.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    wrap.addEventListener('touchstart', onTouchStart, { passive: false })
    wrap.addEventListener('touchmove', onTouchMove, { passive: false })
    wrap.addEventListener('touchend', onTouchEnd)

    return () => {
      wrap.removeEventListener('wheel', onWheel)
      wrap.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      wrap.removeEventListener('touchstart', onTouchStart)
      wrap.removeEventListener('touchmove', onTouchMove)
      wrap.removeEventListener('touchend', onTouchEnd)
    }
  }, [render])

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className={styles.overlay}>
      <div className={styles.toolbar}>
        <span className={styles.title}>DESI DR1 — Spectroscopic Survey</span>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
      </div>

      <div className={styles.canvasWrap} ref={wrapRef}>
        <canvas className={styles.canvas} ref={canvasRef} />
      </div>

      {hoverCoords && (
        <div className={styles.coords}>
          RA {hoverCoords.ra.toFixed(2)}° Dec {hoverCoords.dec.toFixed(2)}°
        </div>
      )}

      <div className={styles.legend}>
        <span><span className={styles.legendDot} style={{ background: 'rgba(60, 100, 180, 0.7)' }} />Galaxy</span>
        <span><span className={styles.legendDot} style={{ background: 'rgba(200, 170, 100, 0.7)' }} />Quasar</span>
        <span><span className={styles.legendDot} style={{ background: 'rgba(220, 50, 50, 0.7)' }} />Survey boundary</span>
        <span>Aitoff projection · scroll to zoom · drag to pan</span>
      </div>
    </div>
  )
}
