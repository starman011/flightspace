import { useEffect, useState, useRef } from 'react'
import styles from './LiveNudge.module.css'

// Live nudge, integrated with the left pages pill: it springs out of the pill
// BIG (message + Go Live), holds long enough to read, then collapses into a
// compact pulsing chip beside the pill so the globe/page stays unobstructed.
// Anchored to the pill's live geometry, so it tracks desktop and mobile alike.
const DISMISS_KEY = 'fs_live_nudge_dismissed'
const BIG_MS = 5200   // how long the expanded message stays before collapsing

export default function LiveNudge({ visible, onGoLive }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
  })
  const [phase, setPhase] = useState('hidden')   // hidden | big | chip
  const [anchor, setAnchor] = useState(null)     // { top, left, h } from the pill
  const timersRef = useRef([])

  // Phase lifecycle: appear big shortly after eligible, then collapse to chip.
  useEffect(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    if (!visible || dismissed) { setPhase('hidden'); return }
    timersRef.current.push(setTimeout(() => setPhase('big'), 500))
    timersRef.current.push(setTimeout(() => setPhase('chip'), 500 + BIG_MS))
    return () => timersRef.current.forEach(clearTimeout)
  }, [visible, dismissed])

  // Anchor to the pages pill: sit flush to its right edge, match its height.
  useEffect(() => {
    if (!visible || dismissed) return
    const pill = document.querySelector('[data-pagespill]')
    if (!pill) { setAnchor({ top: 16, left: 16, h: 44 }); return }
    const place = () => {
      const r = pill.getBoundingClientRect()
      setAnchor({ top: r.top, left: r.right + 8, h: r.height })
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(pill)
    window.addEventListener('resize', place)
    return () => { ro.disconnect(); window.removeEventListener('resize', place) }
  }, [visible, dismissed])

  if (!visible || dismissed || phase === 'hidden' || !anchor) return null

  const dismiss = () => {
    setDismissed(true)
    try { sessionStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
  }

  return (
    <div
      className={`${styles.wrap} ${phase === 'big' ? styles.big : styles.chip}`}
      style={{ top: anchor.top, left: anchor.left, height: anchor.h }}
      role="status" aria-live="polite"
    >
      {phase === 'big' ? (
        <>
          <div className={styles.text}>
            <p className={styles.title}>The skies are asleep</p>
            <p className={styles.body}>Real flights, ships &amp; satellites, one tap away.</p>
          </div>
          <button className={styles.cta} onClick={onGoLive}>
            Go Live<span className={styles.ctaDot} />
          </button>
          <button className={styles.close} onClick={dismiss} aria-label="Dismiss">×</button>
        </>
      ) : (
        <button className={styles.chipBtn} onClick={onGoLive} title="Go Live" aria-label="Go Live">
          <span className={styles.ctaDot} />
          <span className={styles.chipLabel}>Go Live</span>
        </button>
      )}
    </div>
  )
}
