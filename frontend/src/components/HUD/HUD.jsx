import { useState, useEffect } from 'react'
import styles from './HUD.module.css'

function utcNow() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

/** HUD — top-right telemetry: tracked count, feed status, UTC clock */
export default function HUD({ trackedCount = 0, connectionStatus = 'disconnected', zoomedIn = false }) {
  const [utc, setUtc] = useState(utcNow)
  const [latency, setLatency] = useState('—')

  useEffect(() => {
    const id = setInterval(() => setUtc(utcNow()), 1000)
    return () => clearInterval(id)
  }, [])

  // Estimate WS feed latency using last message timing
  useEffect(() => {
    if (connectionStatus === 'connected') {
      setLatency('live')
    } else if (connectionStatus === 'connecting') {
      setLatency('…')
    } else {
      setLatency('off')
    }
  }, [connectionStatus])

  return (
    <>
      {/* Top-right: system status */}
      <div className={`${styles.hud} ${styles.topRight} ${zoomedIn ? styles.docked : ''}`} aria-hidden="true">
        <div className={styles.row}>
          <span className={styles.key}>TRACKED</span>
          <span className={styles.val}>{trackedCount.toLocaleString()}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.key}>FEED</span>
          <span className={`${styles.val} ${connectionStatus === 'connected' ? styles.live : styles.offline}`}>
            {latency}
          </span>
        </div>
        <div className={styles.row}>
          <span className={styles.key}>UTC</span>
          <span className={styles.val}>{utc}</span>
        </div>
      </div>
    </>
  )
}
