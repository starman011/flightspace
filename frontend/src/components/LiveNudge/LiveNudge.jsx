import { useEffect, useState, useRef } from 'react'
import styles from './LiveNudge.module.css'

// Live nudge: a card that grows in BELOW the pages pill (title, message and
// Go Live stacked), holds long enough to read, then collapses into a compact
// pulsing chip at the same spot so the globe/page stays unobstructed.
// Anchored to the pill's live geometry, desktop and mobile alike.
const DISMISS_KEY = 'fs_live_nudge_dismissed'
const BIG_MS = 5200   // how long the expanded card stays before collapsing

export default function LiveNudge({ visible, onGoLive }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
  })
  const [phase, setPhase] = useState('hidden')   // hidden | big | chip
  const [anchor, setAnchor] = useState(null)     // { top, left } below the pill
  const timersRef = useRef([])

  // Phase lifecycle: card grows in shortly after eligible, then collapses.
  useEffect(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    if (!visible || dismissed) { setPhase('hidden'); return }
    timersRef.current.push(setTimeout(() => setPhase('big'), 500))
    timersRef.current.push(setTimeout(() => setPhase('chip'), 500 + BIG_MS))
    return () => timersRef.current.forEach(clearTimeout)
  }, [visible, dismissed])

  // Anchor below the pages pill, aligned to its left edge.
  useEffect(() => {
    if (!visible || dismissed) return
    const pill = document.querySelector('[data-pagespill]')
    if (!pill) { setAnchor({ top: 70, left: 16 }); return }
    const place = () => {
      const r = pill.getBoundingClientRect()
      setAnchor({ top: r.bottom + 10, left: r.left })
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

  return phase === 'big' ? (
    <div className={styles.card} style={{ top: anchor.top, left: anchor.left }} role="status" aria-live="polite">
      <div className={styles.head}>
        <p className={styles.title}>The skies are asleep</p>
        <button className={styles.close} onClick={dismiss} aria-label="Dismiss">×</button>
      </div>
      <p className={styles.body}>Real flights, ships &amp; satellites, one tap away.</p>
      <button className={styles.cta} onClick={onGoLive}>
        <span className={styles.ctaDot} />Go Live
      </button>
    </div>
  ) : (
    <button
      className={styles.chip}
      style={{ top: anchor.top, left: anchor.left }}
      onClick={onGoLive} title="Go Live" aria-label="Go Live"
    >
      <span className={styles.ctaDot} />Go Live
    </button>
  )
}
