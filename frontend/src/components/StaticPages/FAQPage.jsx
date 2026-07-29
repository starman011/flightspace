import { useState } from 'react'
import styles from './StaticPages.module.css'

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

const SECTIONS = [
  {
    heading: 'The basics',
    items: [
      { q: 'Is ObjectTracer free?', a: 'Completely, with no ads. It runs on free infrastructure and donations, and it always works without an account.' },
      { q: 'Do I need to sign in?', a: 'No. Every feature works signed out. An account only saves your tracked flights and pinned launches so they follow you across devices.' },
      { q: 'Does it work on my phone?', a: 'Yes. The full 3D globe runs in any modern mobile browser. You can also add it to your home screen as an app from the install prompt.' },
      { q: 'Do you track me?', a: 'No analytics on you beyond what is needed to run the site, no ads, no selling data. We track objects in the sky, not people.' },
    ],
  },
  {
    heading: 'Flights and ships',
    items: [
      { q: 'Where does the flight data come from?', a: 'Live aircraft positions come from open ADS-B receivers worldwide via adsb.lol. Aircraft broadcast their own GPS position roughly twice a second; the receivers pick it up and we plot it. Route and airline details come from the adsbdb flight database.' },
      { q: 'How accurate is it, and how fresh?', a: 'Positions refresh every few seconds and are accurate to a few hundred meters, the same source airlines and controllers use. Between updates the globe smoothly interpolates motion so aircraft glide instead of jumping.' },
      { q: 'Can I follow one specific flight?', a: 'Yes. Click any aircraft, or search by callsign, registration, or ICAO24 hex code. The camera can lock on and follow it, and you can save it to your profile.' },
      { q: 'Why does a flight show no route?', a: 'We only draw a route when we have a verified flight plan. We never guess a destination. If the plan is not available, you still get live position, altitude, speed and heading.' },
      { q: 'Are ships really on the same map?', a: 'Yes. Maritime vessels reporting over AIS appear on the globe alongside the aircraft above them, so you can watch a port and its approach traffic together.' },
    ],
  },
  {
    heading: 'Space',
    items: [
      { q: 'What is the ISS live stream?', a: 'When the International Space Station is in view you can open its live 4K video feed, sourced from NASA public streams, along with the current crew on board and its live orbital position.' },
      { q: 'How are satellite positions calculated?', a: 'From published two-line element sets and standard orbital propagation, the same math used for satellite prediction everywhere. That is why a satellite keeps moving accurately even between data refreshes.' },
      { q: 'Can I get notified before a rocket launch?', a: 'Yes. Open any upcoming launch and turn on a reminder. Your browser will notify you shortly before liftoff, and the launch pad is marked on the globe.' },
      { q: 'How far out does it go?', a: 'Keep zooming out. The view scales from street level through the Moon and the full solar system, out to a catalog of hundreds of thousands of real galaxies.' },
    ],
  },
  {
    heading: 'Under the hood',
    items: [
      { q: 'Is the globe a map image?', a: 'No. It is genuine 3D geometry rendered in your browser with Three.js and WebGL, which is what lets it tilt, orbit and scale continuously instead of snapping between fixed zoom levels.' },
      { q: 'How does it stay fast with so many objects?', a: 'The server streams only the objects in your current view over one WebSocket connection, and the globe draws thousands of them in a handful of GPU calls. We write about exactly how on the Engineering Blog.' },
      { q: 'Can I read about how it is built?', a: 'Yes. The Engineering Blog covers one problem a week in depth, from rendering tens of thousands of aircraft at 60 frames per second to serving the whole sky on a free backend.' },
    ],
  },
]

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={styles.faqItem}>
      <button
        className={styles.faqQ}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span>{q}</span>
        <svg className={`${styles.faqChevron} ${open ? styles.faqChevronOpen : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div className={`${styles.faqAnswer} ${open ? styles.faqAnswerOpen : ''}`}>
        <p className={styles.faqA}>{a}</p>
      </div>
    </div>
  )
}

export default function FAQPage({ onClose }) {
  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <button className={styles.heroClose} onClick={onClose} aria-label="Close"><CloseIcon /></button>

        <div className={styles.hero}>
          <img className={styles.heroImg} src="/boy-sky.webp" width="1600" height="916" fetchpriority="high" alt="A child pointing up at a plane crossing the sky" />
          <div className={styles.heroOverlay} />
          <div className={styles.heroText}>
            <p className={styles.heroKicker}>ObjectTracer</p>
            <h1 className={styles.heroTitle}>Questions, answered</h1>
          </div>
        </div>

        <div className={styles.body}>
          {SECTIONS.map(section => (
            <div key={section.heading} className={styles.faqSection}>
              <h3 className={styles.faqSectionTitle}>{section.heading}</h3>
              {section.items.map(item => <FaqItem key={item.q} {...item} />)}
            </div>
          ))}

          <p className={styles.faqFoot}>
            Still stuck? <a href="/contact">Send us a message</a> and we will get back to you.
          </p>
        </div>
      </div>
    </div>
  )
}
