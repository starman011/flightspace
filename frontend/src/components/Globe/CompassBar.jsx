/**
 * CompassBar — Fortnite-style heading strip for deep-space (galaxy) mode.
 * Shows RA in hours/degrees + cardinal markers as camera rotates.
 * Reads heading from a ref (updated by Globe.jsx tick loop) via rAF.
 */
import { useEffect, useRef } from 'react'

const DPR = Math.min(window.devicePixelRatio || 1, 2)
const BAR_W = 420
const BAR_H = 32
const HALF_FOV = 55  // degrees visible each side of center

// RA landmarks (degrees → label)
const MARKS = [
  { deg: 0,   label: '0h' },
  { deg: 45,  label: '3h' },
  { deg: 90,  label: '6h' },
  { deg: 135, label: '9h' },
  { deg: 180, label: '12h' },
  { deg: 225, label: '15h' },
  { deg: 270, label: '18h' },
  { deg: 315, label: '21h' },
]

export default function CompassBar({ headingRef }) {
  const canvasRef = useRef(null)
  const readoutRef = useRef(null)

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    cv.width = BAR_W * DPR
    cv.height = BAR_H * DPR
    const ctx = cv.getContext('2d')
    ctx.scale(DPR, DPR)
    let raf

    function draw() {
      raf = requestAnimationFrame(draw)
      const h = headingRef.current
      if (!h) return
      const ra = h.ra  // 0–360

      ctx.clearRect(0, 0, BAR_W, BAR_H)

      // Background
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.fillRect(0, 0, BAR_W, BAR_H)

      // Tick marks every 5 degrees
      for (let deg = 0; deg < 360; deg += 5) {
        const offset = ((deg - ra + 540) % 360) - 180
        if (Math.abs(offset) > HALF_FOV) continue
        const x = BAR_W / 2 + (offset / HALF_FOV) * (BAR_W / 2)

        const isMajor = deg % 15 === 0
        ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)'
        ctx.lineWidth = isMajor ? 1.5 : 0.5
        ctx.beginPath()
        ctx.moveTo(x, BAR_H)
        ctx.lineTo(x, BAR_H - (isMajor ? 10 : 5))
        ctx.stroke()
      }

      // RA hour labels
      ctx.font = '10px "SF Mono", "Fira Code", monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      for (const m of MARKS) {
        const offset = ((m.deg - ra + 540) % 360) - 180
        if (Math.abs(offset) > HALF_FOV) continue
        const x = BAR_W / 2 + (offset / HALF_FOV) * (BAR_W / 2)
        ctx.fillStyle = 'rgba(255,255,255,0.75)'
        ctx.fillText(m.label, x, 2)
      }

      // Center indicator triangle
      ctx.fillStyle = '#ff4444'
      ctx.beginPath()
      ctx.moveTo(BAR_W / 2, BAR_H)
      ctx.lineTo(BAR_W / 2 - 5, BAR_H - 7)
      ctx.lineTo(BAR_W / 2 + 5, BAR_H - 7)
      ctx.closePath()
      ctx.fill()

      // Update readout text
      if (readoutRef.current) {
        const raH = (ra / 15).toFixed(1)
        const dec = h.dec?.toFixed(1) ?? '0'
        readoutRef.current.textContent = `RA ${raH}h  Dec ${dec}°`
      }
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [headingRef])

  return (
    <div style={{
      position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)',
      zIndex: 900, pointerEvents: 'none', display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 2,
    }}>
      <canvas
        ref={canvasRef}
        style={{ width: BAR_W, height: BAR_H, borderRadius: 4 }}
      />
      <span
        ref={readoutRef}
        style={{
          fontFamily: '"SF Mono", "Fira Code", monospace',
          fontSize: 10, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.5px',
        }}
      />
    </div>
  )
}
