import { useEffect, useState } from 'react'
import styles from './LiveNudge.module.css'

// Shown on the Earth view while Live is OFF — the globe is empty until live data
// is streaming, so this nudges the visitor to flip it on (one tap). Honors the
// "no auto-live" rule: data only starts when the user clicks Go Live.
const DISMISS_KEY = 'fs_live_nudge_dismissed'

export default function LiveNudge({ visible, onGoLive }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
  })
  const [shown, setShown] = useState(false)

  // Animate in shortly after it becomes eligible.
  useEffect(() => {
    if (visible && !dismissed) {
      const t = setTimeout(() => setShown(true), 60)
      return () => clearTimeout(t)
    }
    setShown(false)
  }, [visible, dismissed])

  if (!visible || dismissed) return null

  const dismiss = () => {
    setDismissed(true)
    try { sessionStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
  }

  return (
    <div className={`${styles.wrap} ${shown ? styles.in : ''}`} role="status" aria-live="polite">
      <div className={styles.text}>
        <p className={styles.title}>The skies are asleep</p>
        <p className={styles.body}>Real flights, ships &amp; satellites — one tap away.</p>
      </div>
      <button className={styles.cta} onClick={onGoLive}>
        Go Live<span className={styles.ctaDot} />
      </button>
      <button className={styles.close} onClick={dismiss} aria-label="Dismiss">×</button>
    </div>
  )
}
