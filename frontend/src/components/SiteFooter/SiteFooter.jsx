import { useEffect, useState } from 'react'
import styles from './SiteFooter.module.css'

// Crawlable internal-link footer. Hidden by default to preserve the immersive
// globe; slides up only after the user scrolls down / swipes up twice.
// `active` gates the gesture listeners (only on the main globe view).
export const COLUMNS = [
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

  // No scroll/swipe trigger — it fought globe gestures on both desktop and
  // mobile. The footer opens only via the explicit Links button.
  useEffect(() => { if (!active) setVisible(false) }, [active])

  return (
    <>
      {active && !visible && (
        <button className={styles.fab} onClick={() => setVisible(true)} aria-label="Show links & sitemap" title="Links & sitemap">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
      <footer
        className={`${styles.footer} ${visible ? styles.visible : ''}`}
        aria-hidden={!visible}
        onMouseLeave={() => setVisible(false)}
      >
        <button className={styles.handle} onClick={() => setVisible(false)} aria-label="Collapse footer" title="Collapse">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <button className={styles.footerClose} onClick={() => setVisible(false)} aria-label="Close" title="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
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
    </>
  )
}
