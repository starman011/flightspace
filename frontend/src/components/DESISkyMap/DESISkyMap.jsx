import { useEffect, useRef, useState, useCallback } from 'react'
import styles from './DESISkyMap.module.css'

const API = import.meta.env.VITE_API_URL || ''

// ── Mellinger all-sky equirectangular image (CDS) ────────────────────────────
const MELLINGER_URL = 'https://alasky.cds.unistra.fr/hips-image-services/hips2fits'
  + '?hips=CDS/P/Mellinger/color&width=4096&height=2048'
  + '&ra=180&dec=0&fov=360&projection=CAR&coordsys=icrs&format=jpg'
const DSS_FALLBACK = 'https://alasky.cds.unistra.fr/DSS/DSSColor/Norder3/Allsky.jpg'

// ── Zenithal equidistant projection ──────────────────────────────────────────
// North pole at center. Dec=-90 at edge. Full sky in a circle.
function zenithal(raDeg, decDeg, rotation) {
  const ra = (raDeg - 180 + rotation) * Math.PI / 180
  const dec = decDeg * Math.PI / 180
  const r = (Math.PI / 2 - dec) / Math.PI  // 0 at NP, 1 at SP
  return [r * Math.sin(ra), -r * Math.cos(ra)]
}

function zenithalInverse(x, y, rotation) {
  const r = Math.sqrt(x * x + y * y)
  if (r > 1.05) return null
  const dec = (Math.PI / 2 - r * Math.PI) * 180 / Math.PI
  let ra = Math.atan2(x, -y) * 180 / Math.PI + 180 - rotation
  while (ra < 0) ra += 360
  while (ra >= 360) ra -= 360
  return { ra, dec }
}

// ── DESI survey boundary polygons ────────────────────────────────────────────
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

// ── Reproject equirectangular image to zenithal circle (one-time) ─────────────
function reprojectToZenithal(eqImg, size) {
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const ctx = cv.getContext('2d')

  // Draw source image to temp canvas to read pixels
  const srcCv = document.createElement('canvas')
  srcCv.width = eqImg.naturalWidth || eqImg.width
  srcCv.height = eqImg.naturalHeight || eqImg.height
  const srcCtx = srcCv.getContext('2d')
  srcCtx.drawImage(eqImg, 0, 0)
  const srcData = srcCtx.getImageData(0, 0, srcCv.width, srcCv.height)
  const src = srcData.data
  const sw = srcCv.width, sh = srcCv.height

  const outData = ctx.createImageData(size, size)
  const out = outData.data
  const half = size / 2

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px - half) / half  // [-1, 1]
      const y = (py - half) / half
      const r = Math.sqrt(x * x + y * y)
      if (r > 1.0) continue

      // Zenithal → RA/Dec
      const dec = (Math.PI / 2 - r * Math.PI) * 180 / Math.PI
      let ra = Math.atan2(x, -y) * 180 / Math.PI + 180
      if (ra < 0) ra += 360
      if (ra >= 360) ra -= 360

      // RA/Dec → equirectangular pixel
      const sx = Math.floor((ra / 360) * sw) % sw
      const sy = Math.floor(((90 - dec) / 180) * sh)
      if (sy < 0 || sy >= sh) continue

      const si = (sy * sw + sx) * 4
      const di = (py * size + px) * 4
      out[di] = src[si]
      out[di + 1] = src[si + 1]
      out[di + 2] = src[si + 2]
      out[di + 3] = 255
    }
  }

  ctx.putImageData(outData, 0, 0)
  return cv
}

// ── Terrain silhouette generator ─────────────────────────────────────────────
function generateTerrain(size) {
  const cv = document.createElement('canvas')
  cv.width = size; cv.height = size
  const ctx = cv.getContext('2d')
  const half = size / 2

  // Draw dark terrain around the edge of the circle
  ctx.save()
  ctx.beginPath()
  ctx.arc(half, half, half, 0, Math.PI * 2)
  ctx.clip()

  // Terrain ring: dark silhouette near the edge (dec ~ -10 to -90)
  // Use a jagged line to simulate tree/mountain silhouette
  const rng = { s: 42 }
  const rand = () => { rng.s = (rng.s * 16807) % 2147483647; return rng.s / 2147483647 }

  const terrainR = 0.88  // start terrain at this fraction of radius
  ctx.fillStyle = '#0a0c0a'

  for (let angle = 0; angle < Math.PI * 2; angle += 0.003) {
    const jag = rand() * 0.04 + rand() * 0.02
    const r = (terrainR + jag) * half
    const x = half + Math.cos(angle) * r
    const y = half + Math.sin(angle) * r

    if (angle === 0) {
      ctx.beginPath()
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  }

  // Close through the circle edge
  ctx.lineTo(half + half, half)
  ctx.arc(half, half, half, 0, Math.PI * 2)
  ctx.closePath()
  ctx.fill()

  // Warm atmospheric glow at horizon
  for (let angle = 0; angle < Math.PI * 2; angle += 0.02) {
    const glowR = (terrainR - 0.02) * half
    const x = half + Math.cos(angle) * glowR
    const y = half + Math.sin(angle) * glowR
    const grad = ctx.createRadialGradient(x, y, 0, x, y, half * 0.14)

    // Warm brownish-orange atmosphere glow (light pollution)
    const warmth = 0.5 + Math.sin(angle * 3 + 1.5) * 0.3
    const a = 0.06 + warmth * 0.06
    grad.addColorStop(0, `rgba(180, 120, 60, ${a})`)
    grad.addColorStop(0.4, `rgba(120, 70, 30, ${a * 0.5})`)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)
  }

  ctx.restore()
  return cv
}

export default function DESISkyMap({ onClose }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const [hoverCoords, setHoverCoords] = useState(null)
  const galaxyDataRef = useRef(null)
  const skyTexRef = useRef(null)
  const terrainTexRef = useRef(null)
  const stateRef = useRef({ rotation: 0, dragging: false, lx: 0, dragStartRA: 0 })

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

  // Load sky image and reproject
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      skyTexRef.current = reprojectToZenithal(img, 1024)
      terrainTexRef.current = generateTerrain(1024)
      renderFrame()
    }
    img.onerror = () => {
      // Fallback to DSS
      const img2 = new Image()
      img2.crossOrigin = 'anonymous'
      img2.onload = () => {
        skyTexRef.current = reprojectToZenithal(img2, 1024)
        terrainTexRef.current = generateTerrain(1024)
        renderFrame()
      }
      img2.src = DSS_FALLBACK
    }
    img.src = MELLINGER_URL
  }, [])

  const renderFrame = useCallback(() => {
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

    const st = stateRef.current
    const diameter = Math.min(w, h) * 0.95
    const radius = diameter / 2
    const cx = w / 2
    const cy = h / 2

    function toScreen(raDeg, decDeg) {
      const [px, py] = zenithal(raDeg, decDeg, st.rotation)
      return [cx + px * radius, cy + py * radius]
    }

    function fromScreen(sx, sy) {
      const px = (sx - cx) / radius
      const py = (sy - cy) / radius
      return zenithalInverse(px, py, st.rotation)
    }

    // ── Black background ────────────────────────────────────────────────
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)

    // ── Sky photo background (reprojected Mellinger) ────────────────────
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()

    if (skyTexRef.current) {
      // Draw rotated sky
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(-st.rotation * Math.PI / 180)
      ctx.drawImage(skyTexRef.current, -radius, -radius, diameter, diameter)
      ctx.restore()
    } else {
      // Fallback: dark gradient
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
      bg.addColorStop(0, '#080c14')
      bg.addColorStop(0.7, '#040610')
      bg.addColorStop(1, '#0c1018')
      ctx.fillStyle = bg
      ctx.fillRect(cx - radius, cy - radius, diameter, diameter)
    }

    // ── Coordinate grid ─────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(150, 170, 210, 0.08)'
    ctx.lineWidth = 0.6

    // RA meridians every 30°
    for (let ra = 0; ra < 360; ra += 30) {
      ctx.beginPath()
      for (let dec = -85; dec <= 90; dec += 2) {
        const [sx, sy] = toScreen(ra, dec)
        dec === -85 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy)
      }
      ctx.stroke()
    }

    // Dec parallels every 30°
    for (let dec = -60; dec <= 60; dec += 30) {
      ctx.beginPath()
      for (let ra = 0; ra <= 360; ra += 2) {
        const [sx, sy] = toScreen(ra, dec)
        ra === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy)
      }
      ctx.stroke()
    }

    // ── DESI survey boundaries (red) ────────────────────────────────────
    for (const region of DESI_FOOTPRINT) {
      ctx.beginPath()
      let first = true
      for (let i = 0; i < region.points.length; i++) {
        const [ra1, dec1] = region.points[i]
        const [ra2, dec2] = region.points[(i + 1) % region.points.length]
        // Interpolate for smooth curves
        const steps = 10
        for (let s = 0; s <= (i === region.points.length - 1 ? 0 : steps); s++) {
          const t = s / steps
          const ra = ra1 + (ra2 - ra1) * t
          const dec = dec1 + (dec2 - dec1) * t
          const [sx, sy] = toScreen(ra, dec)
          if (first) { ctx.moveTo(sx, sy); first = false }
          else ctx.lineTo(sx, sy)
        }
      }
      ctx.closePath()

      ctx.strokeStyle = 'rgba(220, 40, 40, 0.65)'
      ctx.lineWidth = 2.2
      ctx.stroke()

      // Region label
      if (region.label) {
        const mid = Math.floor(region.points.length * 0.45)
        const [lx, ly] = toScreen(region.points[mid][0], region.points[mid][1])
        ctx.fillStyle = 'rgba(230, 60, 60, 0.65)'
        ctx.font = 'bold 13px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(region.label, lx, ly + 5)
      }
    }

    // ── Galaxy/quasar dots (faint blue) ─────────────────────────────────
    const data = galaxyDataRef.current
    if (data && data.length > 0) {
      const step = 4
      for (let i = 0; i < data.length; i += step) {
        const g = data[i]
        const [sx, sy] = toScreen(g.r, g.d)
        const dx = sx - cx, dy = sy - cy
        if (dx * dx + dy * dy > radius * radius) continue

        const isQSO = g.s === 'Q' || g.s === 'QSO'
        if (isQSO) {
          ctx.fillStyle = 'rgba(180, 150, 80, 0.25)'
        } else {
          ctx.fillStyle = 'rgba(50, 90, 160, 0.22)'
        }
        ctx.fillRect(sx - 0.5, sy - 0.5, 1, 1)
      }
    }

    // ── Terrain + horizon glow overlay ──────────────────────────────────
    if (terrainTexRef.current) {
      ctx.drawImage(terrainTexRef.current, cx - radius, cy - radius, diameter, diameter)
    }

    ctx.restore()

    // ── Circle border ───────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(60, 50, 40, 0.5)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.stroke()

    // ── RA tick labels around rim ───────────────────────────────────────
    for (let ra = 0; ra < 360; ra += 30) {
      const angle = ((ra - 180 + st.rotation) * Math.PI) / 180
      const lx = cx + Math.sin(angle) * (radius + 14)
      const ly = cy - Math.cos(angle) * (radius + 14)
      ctx.fillStyle = 'rgba(160, 150, 130, 0.5)'
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${ra}`, lx, ly)
    }

    // Internal RA labels on the grid
    for (let ra = 0; ra < 360; ra += 30) {
      const [lx, ly] = toScreen(ra, 5)
      const dx = lx - cx, dy = ly - cy
      if (dx * dx + dy * dy < (radius * 0.85) * (radius * 0.85)) {
        ctx.fillStyle = 'rgba(180, 170, 150, 0.35)'
        ctx.font = '10px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(`${ra}`, lx, ly + 12)
      }
    }

    // ── Info overlay (top-left like screenshot) ─────────────────────────
    const now = new Date()
    const utc = now.toISOString().replace('T', ' ').slice(0, 19) + ' UT'
    const st2 = `ST: ${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')}:${now.getUTCSeconds().toString().padStart(2, '0')}`

    ctx.fillStyle = 'rgba(180, 170, 150, 0.45)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(utc, cx - radius + 8, cy - radius + 8)
    ctx.fillText(st2, cx - radius + 8, cy - radius + 22)

    // RA range indicator (top-right like screenshot)
    const raCenter = ((st.rotation + 180) % 360).toFixed(1)
    ctx.textAlign = 'right'
    ctx.fillText(`${raCenter}°`, cx + radius - 8, cy - radius + 8)

    // Bottom RA range
    ctx.textAlign = 'center'
    ctx.fillText('drag to rotate', cx, cy + radius + 16)

    stateRef.current._fromScreen = fromScreen
  }, [])

  // Setup + resize + data poll
  useEffect(() => {
    renderFrame()
    const onResize = () => renderFrame()
    window.addEventListener('resize', onResize)
    const poll = setInterval(() => {
      if (galaxyDataRef.current) { renderFrame(); clearInterval(poll) }
    }, 500)
    return () => { window.removeEventListener('resize', onResize); clearInterval(poll) }
  }, [renderFrame])

  // Drag rotation
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    const onDown = (e) => {
      stateRef.current.dragging = true
      stateRef.current.lx = e.clientX
      stateRef.current.dragStartRA = stateRef.current.rotation
    }

    const onMove = (e) => {
      const st = stateRef.current
      if (st._fromScreen) {
        const rect = wrap.getBoundingClientRect()
        setHoverCoords(st._fromScreen(e.clientX - rect.left, e.clientY - rect.top))
      }
      if (!st.dragging) return
      const dx = e.clientX - st.lx
      st.rotation = st.dragStartRA + dx * 0.3
      renderFrame()
    }

    const onUp = () => { stateRef.current.dragging = false }

    // Touch
    const onTS = (e) => {
      if (e.touches.length === 1) {
        stateRef.current.dragging = true
        stateRef.current.lx = e.touches[0].clientX
        stateRef.current.dragStartRA = stateRef.current.rotation
      }
    }
    const onTM = (e) => {
      if (e.touches.length === 1 && stateRef.current.dragging) {
        const dx = e.touches[0].clientX - stateRef.current.lx
        stateRef.current.rotation = stateRef.current.dragStartRA + dx * 0.3
        renderFrame()
      }
    }
    const onTE = () => { stateRef.current.dragging = false }

    wrap.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    wrap.addEventListener('touchstart', onTS, { passive: false })
    wrap.addEventListener('touchmove', onTM, { passive: false })
    wrap.addEventListener('touchend', onTE)

    return () => {
      wrap.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      wrap.removeEventListener('touchstart', onTS)
      wrap.removeEventListener('touchmove', onTM)
      wrap.removeEventListener('touchend', onTE)
    }
  }, [renderFrame])

  // Escape
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
        <span><span className={styles.legendDot} style={{ background: 'rgba(50, 90, 160, 0.8)' }} />Galaxy</span>
        <span><span className={styles.legendDot} style={{ background: 'rgba(180, 150, 80, 0.8)' }} />Quasar</span>
        <span><span className={styles.legendDot} style={{ background: 'rgba(220, 40, 40, 0.8)' }} />DESI boundary</span>
      </div>
    </div>
  )
}
