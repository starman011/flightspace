import { useEffect, useRef, useState, useCallback } from 'react'
import styles from './SolarMap.module.css'

const PLANETS = [
  { name: 'Mercury', au: 0.387, color: '#b5b5b5', r: 2.5 },
  { name: 'Venus',   au: 0.723, color: '#e8cfa0', r: 4 },
  { name: 'Earth',   au: 1.000, color: '#4a9eff', r: 5 },
  { name: 'Mars',    au: 1.524, color: '#d66b4f', r: 3.5 },
]

// Generate orbit ellipse points for a 2D top-down projection
// a=semi-major axis AU, e=eccentricity, w=arg of perihelion degrees
function orbitPts(a, e, w, steps = 200) {
  const b = a * Math.sqrt(Math.max(0, 1 - e * e))
  const c = a * e
  const rad = (w * Math.PI) / 180
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI
    const ex = a * Math.cos(t) - c
    const ey = b * Math.sin(t)
    pts.push([
      ex * Math.cos(rad) - ey * Math.sin(rad),
      ex * Math.sin(rad) + ey * Math.cos(rad),
    ])
  }
  return pts
}

// ── Orbital mechanics ──────────────────────────────────────────────────────
// Solve Kepler's equation: M = E - e·sin(E)  →  find E
function solveKepler(M, e, tol = 1e-8) {
  let E = M
  for (let i = 0; i < 100; i++) {
    const dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E))
    E += dE
    if (Math.abs(dE) < tol) break
  }
  return E
}

// Compute the asteroid's CURRENT position in the ecliptic plane (AU).
// Uses the known close-approach date + orbital period to propagate back to now.
// Returns [x, y] in AU, Sun at origin.
function currentPosition(a, e, w, approach_date) {
  if (!a || a < 0.01 || e >= 0.999) return [1.2, 0]  // fallback (incl. hyperbolic)

  // ── 1. True anomaly at close approach (where orbit crosses ≈1 AU) ──────
  const p = a * (1 - e * e)
  const cosV_ca = e < 1e-4 ? 0 : Math.max(-1, Math.min(1, (p - 1) / e))
  const v_ca = Math.acos(cosV_ca)  // in [0, π]

  // ── 2. Eccentric anomaly at close approach ─────────────────────────────
  const E_ca = 2 * Math.atan2(
    Math.sqrt(1 - e) * Math.sin(v_ca / 2),
    Math.sqrt(1 + e) * Math.cos(v_ca / 2),
  )

  // ── 3. Mean anomaly at close approach ─────────────────────────────────
  const M_ca = E_ca - e * Math.sin(E_ca)

  // ── 4. Propagate from close-approach date to now ───────────────────────
  // Orbital period (days) via Kepler's 3rd law: T = a^1.5 years
  const period_days = Math.pow(a, 1.5) * 365.25
  const n = (2 * Math.PI) / period_days  // mean motion (rad/day)

  // Days from NOW to the approach date (negative = approach is in the future)
  const approachMs = approach_date ? new Date(approach_date).getTime() : Date.now()
  const dt_days = (approachMs - Date.now()) / 86_400_000

  // Current mean anomaly: go backwards by n·dt from the approach anomaly
  let M_now = M_ca - n * dt_days
  M_now = ((M_now % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)

  // ── 5. Solve Kepler → true anomaly → position ─────────────────────────
  const E_now = solveKepler(M_now, e)
  const v_now = 2 * Math.atan2(
    Math.sqrt(1 + e) * Math.sin(E_now / 2),
    Math.sqrt(1 - e) * Math.cos(E_now / 2),
  )
  const r_now = a * (1 - e * Math.cos(E_now))

  const wRad = (w * Math.PI) / 180
  return [r_now * Math.cos(v_now + wRad), r_now * Math.sin(v_now + wRad)]
}

// Draw a glowing circle
function glowCircle(ctx, x, y, r, color, glowColor, glowR) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, glowR)
  g.addColorStop(0, glowColor)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(x, y, glowR, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = color
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
}

export default function SolarMap({ asteroids, onSelect, selectedId }) {
  const canvasRef = useRef(null)
  const stateRef  = useRef({ zoom: 1, panX: 0, panY: 0, dragging: false, dragStart: null, stars: null })
  const [hovered, setHovered] = useState(null)  // { id, name, x, y }

  // Build star field once
  function getStars(w, h) {
    if (stateRef.current.stars) return stateRef.current.stars
    const stars = Array.from({ length: 200 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.2 + 0.3,
      a: Math.random() * 0.6 + 0.2,
    }))
    stateRef.current.stars = stars
    return stars
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height
    const { zoom } = stateRef.current
    const panX = isFinite(stateRef.current.panX) ? stateRef.current.panX : 0
    const panY = isFinite(stateRef.current.panY) ? stateRef.current.panY : 0
    const SCALE = Math.min(W, H) * 0.28 * zoom  // px per AU
    const cx = W / 2 + panX, cy = H / 2 + panY

    // Background
    ctx.fillStyle = '#060c12'
    ctx.fillRect(0, 0, W, H)

    // Stars
    const stars = getStars(W, H)
    for (const s of stars) {
      ctx.globalAlpha = s.a
      ctx.fillStyle = '#c3f5ff'
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1

    // Planet orbits
    for (const pl of PLANETS) {
      const orbitR = pl.au * SCALE
      ctx.beginPath()
      ctx.arc(cx, cy, orbitR, 0, Math.PI * 2)
      ctx.strokeStyle = pl.name === 'Earth'
        ? 'rgba(74,158,255,0.25)'
        : 'rgba(255,255,255,0.08)'
      ctx.lineWidth = pl.name === 'Earth' ? 1.5 : 1
      ctx.setLineDash(pl.name === 'Earth' ? [] : [4, 6])
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Asteroid orbits + close-approach dots
    const hitTargets = []  // [{id, name, px, py}] for hover detection

    for (const ast of asteroids) {
      const a = ast.a ?? 1.2, e = ast.e ?? 0.3, w = ast.w ?? 0
      if (a > 4 || a < 0.1) continue  // skip very distant asteroids

      const isPHA   = ast.pha
      const isSelected = ast.id === selectedId
      const isHovered  = ast.id === hovered?.id

      // Orbit ellipse
      const pts = orbitPts(a, e, w)
      ctx.beginPath()
      for (let i = 0; i < pts.length; i++) {
        const px = cx + pts[i][0] * SCALE
        const py = cy - pts[i][1] * SCALE  // flip Y for screen coords
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
      }
      ctx.closePath()
      const hasSelection = !!selectedId
      ctx.strokeStyle = isSelected
        ? 'rgba(0,229,255,0.85)'
        : hasSelection
        ? (isPHA ? 'rgba(207,66,56,0.1)' : 'rgba(0,229,255,0.04)')
        : (isPHA ? 'rgba(207,66,56,0.35)' : 'rgba(0,229,255,0.12)')
      ctx.lineWidth = isSelected ? 2 : isPHA ? 1.2 : 0.8
      ctx.stroke()

      // Current position in orbit (computed via Kepler propagation from approach date)
      const [apx, apy] = currentPosition(a, e, w, ast.approach_date)
      const px = cx + apx * SCALE
      const py = cy - apy * SCALE

      if (!isFinite(px) || !isFinite(py)) continue
      hitTargets.push({ id: ast.id, name: ast.name, px, py })

      if (isSelected || isHovered) {
        // Glow ring
        const glowG = ctx.createRadialGradient(px, py, 0, px, py, 18)
        glowG.addColorStop(0, 'rgba(0,229,255,0.5)')
        glowG.addColorStop(1, 'rgba(0,229,255,0)')
        ctx.fillStyle = glowG
        ctx.beginPath(); ctx.arc(px, py, 18, 0, Math.PI * 2); ctx.fill()
      }

      ctx.fillStyle = isSelected
        ? '#00e5ff'
        : hasSelection
        ? (isPHA ? 'rgba(207,66,56,0.3)' : 'rgba(0,229,255,0.15)')
        : isPHA
        ? '#cf4238'
        : isHovered
        ? '#7adeff'
        : 'rgba(0,229,255,0.55)'
      ctx.beginPath()
      ctx.arc(px, py, isSelected ? 6 : isHovered ? 4 : 3, 0, Math.PI * 2)
      ctx.fill()

      // Name label — always shown for selected, hover for others
      if (isSelected) {
        const label = ast.name.replace(/^\(?\d+\)?\s*/, '') || ast.id
        ctx.font = 'bold 12px "IBM Plex Mono", monospace'
        ctx.textAlign = 'left'
        // Background pill
        const tw = ctx.measureText(label).width
        ctx.fillStyle = 'rgba(6,12,18,0.75)'
        ctx.beginPath()
        ctx.roundRect(px + 10, py - 16, tw + 10, 18, 4)
        ctx.fill()
        ctx.fillStyle = '#00e5ff'
        ctx.fillText(label, px + 15, py - 3)
      } else if (isHovered) {
        const label = ast.name.replace(/^\(?\d+\)?\s*/, '') || ast.id
        ctx.font = '11px "IBM Plex Mono", monospace'
        ctx.textAlign = 'left'
        ctx.fillStyle = '#7adeff'
        ctx.fillText(label, px + 8, py - 4)
      }
    }

    // Store hit targets on stateRef for mouse handling
    stateRef.current.hitTargets = hitTargets

    // Sun
    glowCircle(ctx, cx, cy, 10, '#fff7a0', 'rgba(255,230,80,0.35)', 40)

    // Planet dots + labels
    for (const pl of PLANETS) {
      const px = cx + pl.au * SCALE, py = cy  // at 3-o'clock position
      glowCircle(ctx, px, py, pl.r, pl.color, pl.color + '40', pl.r * 3)
      ctx.font = '10px "IBM Plex Mono", monospace'
      ctx.fillStyle = 'rgba(195,245,255,0.5)'
      ctx.textAlign = 'left'
      ctx.fillText(pl.name, px + pl.r + 4, py + 3)
    }

    // Compass / AU legend
    ctx.font = '10px "IBM Plex Mono", monospace'
    ctx.fillStyle = 'rgba(195,245,255,0.25)'
    ctx.textAlign = 'left'
    ctx.fillText(`1 AU = ${SCALE.toFixed(0)}px  ·  Zoom ${zoom.toFixed(1)}×`, 16, H - 16)
  }, [asteroids, selectedId, hovered])

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      stateRef.current.stars = null  // rebuild stars on resize
      draw()
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [draw])

  // Redraw on data/state change
  useEffect(() => { draw() }, [draw])

  // Auto-focus: when selectedId changes, zoom + pan to center on that asteroid
  useEffect(() => {
    if (!selectedId || !asteroids.length) return
    const ast = asteroids.find(a => a.id === selectedId)
    if (!ast) return

    const canvas = canvasRef.current
    if (!canvas) return
    const W = canvas.width || canvas.offsetWidth
    const H = canvas.height || canvas.offsetHeight
    const a = ast.a ?? 1.2, e = ast.e ?? 0.3, w = ast.w ?? 0

    // Compute current position
    const [apx, apy] = currentPosition(a, e, w, ast.approach_date)

    // Zoom so the asteroid's semi-major axis fills ~50% of the view
    const targetZoom = Math.min(6, Math.max(1.5, (Math.min(W, H) * 0.25) / (a * Math.min(W, H) * 0.28)))
    const SCALE = Math.min(W, H) * 0.28 * targetZoom

    // Pan so the asteroid is centered — guard against NaN positions
    if (isFinite(targetZoom)) stateRef.current.zoom = targetZoom
    if (isFinite(apx)) stateRef.current.panX = -apx * SCALE
    if (isFinite(apy)) stateRef.current.panY = apy * SCALE

    draw()
  }, [selectedId, asteroids, draw])

  // Mouse wheel zoom
  const onWheel = useCallback((e) => {
    e.preventDefault()
    stateRef.current.zoom = Math.max(0.4, Math.min(8, stateRef.current.zoom * (e.deltaY < 0 ? 1.12 : 0.9)))
    draw()
  }, [draw])

  // Mouse move: hover detection + pan
  const onMouseMove = useCallback((e) => {
    const s = stateRef.current
    if (s.dragging && s.dragStart) {
      s.panX += e.clientX - s.dragStart.x
      s.panY += e.clientY - s.dragStart.y
      s.dragStart = { x: e.clientX, y: e.clientY }
      draw()
      return
    }
    const rect = canvasRef.current.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const hit = (s.hitTargets || []).find(t => Math.hypot(t.px - mx, t.py - my) < 12)
    if (hit?.id !== hovered?.id) {
      setHovered(hit ?? null)
    }
  }, [draw, hovered])

  const onMouseDown = useCallback((e) => {
    stateRef.current.dragging = true
    stateRef.current.dragStart = { x: e.clientX, y: e.clientY }
  }, [])

  const onMouseUp = useCallback((e) => {
    const s = stateRef.current
    const wasDrag = s.dragStart && (Math.abs(e.clientX - s.dragStart.x) + Math.abs(e.clientY - s.dragStart.y)) > 4
    s.dragging = false
    s.dragStart = null
    if (!wasDrag) {
      // Click: select hovered asteroid
      const rect = canvasRef.current.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const hit = (s.hitTargets || []).find(t => Math.hypot(t.px - mx, t.py - my) < 12)
      onSelect?.(hit ?? null)
    }
  }, [onSelect])

  return (
    <div className={styles.wrap}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ cursor: hovered ? 'pointer' : 'grab' }}
        onWheel={onWheel}
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { stateRef.current.dragging = false; setHovered(null) }}
      />
      <div className={styles.legend}>
        <span className={styles.legendItem}><span className={styles.dotCyan} />NEO</span>
        <span className={styles.legendItem}><span className={styles.dotRed} />PHA</span>
        <span className={styles.legendItem}><span className={styles.dotBlue} />Earth</span>
        <span className={styles.legendHint}>Scroll to zoom · Drag to pan · Click asteroid</span>
      </div>
    </div>
  )
}