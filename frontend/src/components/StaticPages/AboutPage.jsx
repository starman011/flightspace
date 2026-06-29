import styles from './StaticPages.module.css'

export default function AboutPage({ onClose }) {
  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <button className={styles.heroClose} onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div className={styles.hero}>
          <img className={styles.heroImg} src="/flight-sky.jpg" alt="A plane crossing the sky, framed by spring flowers" />
          <div className={styles.heroOverlay} />
          <div className={styles.heroText}>
            <p className={styles.heroKicker}>ObjectTracer</p>
            <h1 className={styles.heroTitle}>About ObjectTracer</h1>
          </div>
        </div>
        <div className={styles.body}>
          <p>
            ObjectTracer is a real-time 3D tracker for flights, satellites, ships, and space launches — rendered on an interactive globe.
          </p>

          <h3>What You Can Track</h3>
          <ul>
            <li><strong>Flights</strong> — live aircraft positions, routes, and telemetry from ADS-B data</li>
            <li><strong>Satellites</strong> — ISS, Starlink, and orbital objects with live feeds</li>
            <li><strong>Ships</strong> — maritime vessel positions worldwide</li>
            <li><strong>Launches</strong> — upcoming and live rocket launches with pad locations</li>
            <li><strong>Asteroids</strong> — near-Earth objects in our solar system</li>
          </ul>

          <h3>Built With</h3>
          <p>
            Three.js for 3D rendering, React for the UI, Go for the backend, and live data from ADS-B, TLE, and space agency feeds. Open data, no tracking, no ads.
          </p>

          <h3>Open Source</h3>
          <p>
            ObjectTracer is built in the open. We believe space and aviation data should be accessible to everyone.
          </p>
        </div>
      </div>
    </div>
  )
}
