import { useState, useEffect } from 'react'
import styles from './HUD.module.css'

function utcNow() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

function formatAlt(altM) {
  if (altM == null) return '—'
  if (altM < 1000) return `${Math.round(altM)} m`
  if (altM < 1_000_000) return `${(altM / 1000).toFixed(altM < 10000 ? 1 : 0)} km`
  return `${Math.round(altM / 1000).toLocaleString()} km`
}

/**
 * HUD — Orbital HUD overlay component.
 * Four-corner telemetry display using IBM Plex Mono.
 *
 * Props:
 *   trackedCount   number   — total entities on screen
 *   connectionStatus string — 'connected' | 'connecting' | 'disconnected'
 *   cameraAltM     number   — camera altitude in metres (from Globe)
 *   cameraLat      number   — camera target latitude
 *   cameraLon      number   — camera target longitude
 *   scaleLabel     string   — e.g. "500 km" (scale bar label from Globe)
 */
export default function HUD({
  trackedCount = 0,
  connectionStatus = 'disconnected',
  cameraAltM,
  cameraLat,
  cameraLon,
  scaleLabel,
}) {
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

  const lat = cameraLat != null ? `${Math.abs(cameraLat).toFixed(2)}°${cameraLat >= 0 ? 'N' : 'S'}` : '—'
  const lon = cameraLon != null ? `${Math.abs(cameraLon).toFixed(2)}°${cameraLon >= 0 ? 'E' : 'W'}` : '—'

  return (
    <>
      {/* Top-left: camera position */}
      <div className={`${styles.hud} ${styles.topLeft}`} aria-hidden="true">
        <div className={styles.row}>
          <span className={styles.key}>ALT</span>
          <span className={styles.val}>{formatAlt(cameraAltM)}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.key}>LAT</span>
          <span className={styles.val}>{lat}</span>
          <span className={styles.key} style={{ marginLeft: 8 }}>LON</span>
          <span className={styles.val}>{lon}</span>
        </div>
        {scaleLabel && (
          <div className={styles.row}>
            <span className={styles.key}>SCALE</span>
            <span className={styles.val}>1px ≈ {scaleLabel}</span>
          </div>
        )}
      </div>

      {/* Top-right: system status */}
      <div className={`${styles.hud} ${styles.topRight}`} aria-hidden="true">
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
