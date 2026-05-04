import styles from './PWABanner.module.css'

export default function PWABanner({ onInstall, onDismiss }) {
  return (
    <div className={styles.banner}>
      <div className={styles.content}>
        <span className={styles.icon}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </span>
        <span className={styles.text}>Install ObjectTracer for offline access</span>
      </div>
      <div className={styles.actions}>
        <button className={styles.installBtn} onClick={onInstall}>Install</button>
        <button className={styles.dismissBtn} onClick={onDismiss}>Not now</button>
      </div>
    </div>
  )
}
