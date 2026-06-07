import { useEffect, useRef, useState } from 'react'
import styles from './SiteFooter.module.css'

// Crawlable internal-link footer. Hidden by default to preserve the immersive
// globe; slides up only after the user scrolls down / swipes up twice.
// `active` gates the gesture listeners (only on the main globe view).
const COLUMNS = [
  {
    title: 'Trackers',
    links: [
      ['ISS Live Tracker', '/iss'],
      ['Rocket Launch Tracker', '/launches'],
      ['Asteroid Tracker', '/asteroids'],
      ['Space Journal', '/blog'],
      ['Solar System', '/solar-system'],
    ],
  },
  {
    title: 'Top Airports',
    links: [
      ['New York JFK arrivals', '/airport/JFK'],
      ['Los Angeles LAX', '/airport/LAX'],
      ['London Heathrow LHR', '/airport/LHR'],
      ['Delhi DEL', '/airport/DEL'],
      ['Dubai DXB', '/airport/DXB'],
      ['Mumbai BOM', '/airport/BOM'],
    ],
  },
  {
    title: 'Popular Routes',
    links: [
      ['Delhi → Mumbai', '/route/del-bom'],
      ['New York → Los Angeles', '/route/jfk-lax'],
      ['Dubai → London', '/route/dxb-lhr'],
      ['Mumbai → London', '/route/bom-lhr'],
      ['Atlanta → Miami', '/route/atl-mia'],
    ],
  },
  {
    title: 'Airlines',
    links: [
      ['IndiGo flight tracker', '/airline/indigo'],
      ['Emirates', '/airline/emirates'],
      ['Air India', '/airline/air-india'],
      ['American Airlines', '/airline/american-airlines'],
      ['Singapore Airlines', '/airline/singapore-airlines'],
    ],
  },
]

export default function SiteFooter({ active = true }) {
  const [visible, setVisible] = useState(false)
  const gestures = useRef(0)
  const resetTimer = useRef(null)

  useEffect(() => {
    if (!active) { setVisible(false); return }

    const bump = () => {
      gestures.current += 1
      clearTimeout(resetTimer.current)
      resetTimer.current = setTimeout(() => { gestures.current = 0 }, 1500)
      if (gestures.current >= 2) { setVisible(true); gestures.current = 0 }
    }

    const onWheel = (e) => {
      if (e.deltaY > 25) bump()           // scroll down → toward footer
      else if (e.deltaY < -25 && visible) setVisible(false) // scroll up → hide
    }

    let touchStartY = null
    const onTouchStart = (e) => { touchStartY = e.touches[0].clientY }
    const onTouchEnd = (e) => {
      if (touchStartY == null) return
      const dy = touchStartY - e.changedTouches[0].clientY
      if (dy > 55) bump()                 // swipe up → toward footer
      else if (dy < -55 && visible) setVisible(false)
      touchStartY = null
    }

    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
      clearTimeout(resetTimer.current)
    }
  }, [active, visible])

  return (
    <footer className={`${styles.footer} ${visible ? styles.visible : ''}`} aria-hidden={!visible}>
      <button className={styles.handle} onClick={() => setVisible(v => !v)} aria-label="Toggle footer">
        <span className={styles.handleBar} />
      </button>
      <div className={styles.inner}>
        {COLUMNS.map(col => (
          <nav key={col.title} className={styles.col} aria-label={col.title}>
            <h3 className={styles.colTitle}>{col.title}</h3>
            {col.links.map(([label, href]) => (
              <a key={href} href={href} className={styles.link}>{label}</a>
            ))}
          </nav>
        ))}
      </div>
      <div className={styles.bottom}>
        <span>© {new Date().getFullYear()} ObjectTracer — real-time 3D flight &amp; space tracker</span>
        <span className={styles.bottomLinks}>
          <a href="/about">About</a><a href="/faq">FAQ</a><a href="/contact">Contact</a><a href="/donate">Donate</a>
        </span>
      </div>
    </footer>
  )
}
