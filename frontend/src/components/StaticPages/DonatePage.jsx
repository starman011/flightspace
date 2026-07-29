import styles from './StaticPages.module.css'

export default function DonatePage({ onClose }) {
  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <button className={styles.heroClose} onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div className={styles.hero}>
          <img className={styles.heroImg} src="/boy-sky.webp" width="1600" height="916" fetchpriority="high" alt="A child pointing up at a plane crossing the sky" />
          <div className={styles.heroOverlay} />
          <div className={styles.heroText}>
            <p className={styles.heroKicker}>ObjectTracer</p>
            <h1 className={styles.heroTitle}>Support ObjectTracer</h1>
          </div>
        </div>
        <div className={styles.body}>
          <p>
            ObjectTracer is free, ad-free, and open. Running real-time data feeds, 3D rendering infrastructure, and backend servers costs money.
          </p>
          <p>
            Your donation helps keep the project alive and fund new features like weather overlays, push notifications, and historical flight playback.
          </p>

          <h3>What Your Support Enables</h3>
          <ul>
            <li>Server infrastructure for live data feeds</li>
            <li>High-resolution map tiles and textures</li>
            <li>New features and data sources</li>
            <li>Keeping the service free for everyone</li>
          </ul>

          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <a
              className={styles.donateBtn}
              href="https://buymeacoffee.com/objecttracer"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
              Buy Me a Coffee
            </a>
          </div>

          <p style={{ marginTop: 24, textAlign: 'center', fontSize: 12, color: 'rgba(200,210,225,0.4)' }}>
            Every contribution, no matter how small, makes a difference.
          </p>
        </div>
      </div>
    </div>
  )
}
