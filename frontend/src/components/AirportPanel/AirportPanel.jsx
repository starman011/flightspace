import { useEffect, useState } from 'react'
import styles from './AirportPanel.module.css'

const API = import.meta.env.VITE_API_URL || ''

export default function AirportPanel({ iata, onClose, onFlightClick }) {
  const [arrivals, setArrivals] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!iata) return
    setLoading(true)
    fetch(`${API}/api/v1/airports/${iata}/arrivals`)
      .then(r => r.json())
      .then(d => { setArrivals(d.arrivals || []); setLoading(false) })
      .catch(() => setLoading(false))

    const interval = setInterval(() => {
      fetch(`${API}/api/v1/airports/${iata}/arrivals`)
        .then(r => r.json())
        .then(d => setArrivals(d.arrivals || []))
        .catch(() => {})
    }, 5000)
    return () => clearInterval(interval)
  }, [iata])

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.title}>
          <span className={styles.iata}>{iata}</span>
          <span className={styles.subtitle}>Inbound Traffic</span>
        </div>
        <button className={styles.close} onClick={onClose}>&times;</button>
      </div>

      {loading && <div className={styles.loading}>Loading arrivals...</div>}

      {!loading && arrivals.length === 0 && (
        <div className={styles.empty}>No inbound aircraft detected</div>
      )}

      {!loading && arrivals.length > 0 && (
        <div className={styles.list}>
          <div className={styles.listHeader}>
            <span>Flight</span>
            <span>Dist</span>
            <span>ETA</span>
            <span>Alt</span>
          </div>
          {arrivals.map(a => (
            <div
              key={a.icao24}
              className={styles.row}
              onClick={() => onFlightClick?.(a.icao24)}
            >
              <span className={styles.callsign}>{a.callsign || a.icao24}</span>
              <span className={styles.dim}>{a.dist_km < 10 ? a.dist_km.toFixed(1) : Math.round(a.dist_km)} km</span>
              <span className={styles.eta}>{a.eta_min < 1 ? '<1' : Math.round(a.eta_min)} min</span>
              <span className={styles.dim}>{a.alt_ft ? `${Math.round(a.alt_ft / 100) * 100} ft` : '—'}</span>
            </div>
          ))}
        </div>
      )}

      {!loading && arrivals.length > 0 && (
        <div className={styles.footer}>
          {arrivals.length} aircraft inbound &middot; updated every 15s
        </div>
      )}
    </div>
  )
}
