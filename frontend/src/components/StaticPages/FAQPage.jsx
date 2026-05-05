import styles from './StaticPages.module.css'

export default function FAQPage({ onClose }) {
  const faqs = [
    { q: 'Is ObjectTracer free?', a: 'Yes. ObjectTracer is completely free with no ads. We rely on donations to keep the servers running.' },
    { q: 'Where does the flight data come from?', a: 'Live aircraft data comes from ADS-B receivers worldwide via adsb.lol. Route information comes from adsbdb.com flight plan database.' },
    { q: 'How accurate is the tracking?', a: 'Positions update every few seconds. Aircraft positions are accurate to within a few hundred meters. Satellite positions are computed from TLE orbital elements.' },
    { q: 'Can I track a specific flight?', a: 'Yes. Click any aircraft on the globe or use the search bar to find flights by callsign, registration, or ICAO24 hex code. You can save flights to your profile.' },
    { q: 'Do I need an account?', a: 'No. You can use ObjectTracer without signing in. Creating an account lets you save flights and launches across devices.' },
    { q: 'What is the ISS live stream?', a: 'When available, we show a live video feed from the International Space Station. The stream is sourced from NASA\'s public feeds.' },
    { q: 'Why is a flight showing no route?', a: 'Routes are only shown when we have verified flight plan data. We never guess destinations — if the data isn\'t available, we show position only.' },
    { q: 'Does ObjectTracer work on mobile?', a: 'Yes. The 3D globe and all features work on mobile browsers. You can also install it as a PWA from the install prompt.' },
  ]

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Frequently Asked Questions</h2>
          <button className={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>
        <div className={styles.body}>
          {faqs.map((f, i) => (
            <div key={i} className={styles.faqItem}>
              <p className={styles.faqQ}>{f.q}</p>
              <p className={styles.faqA}>{f.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
