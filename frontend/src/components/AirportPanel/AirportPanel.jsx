import { useEffect, useState } from 'react'
import styles from './AirportPanel.module.css'

const API = import.meta.env.VITE_API_URL || ''

export default function AirportPanel({ iata, onClose, onFlightClick }) {
  const [tab, setTab] = useState('arrivals')
  const [arrivals, setArrivals] = useState([])
  const [departures, setDepartures] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!iata) return
    setLoading(true)

    Promise.all([
      fetch(`${API}/api/v1/airports/${iata}/arrivals`).then(r => r.json()).catch(() => ({})),
      fetch(`${API}/api/v1/airports/${iata}/departures`).then(r => r.json()).catch(() => ({})),
    ]).then(([arrData, depData]) => {
      setArrivals(arrData.arrivals || [])
      setDepartures(depData.departures || [])
      setLoading(false)
    })

    const interval = setInterval(() => {
      Promise.all([
        fetch(`${API}/api/v1/airports/${iata}/arrivals`).then(r => r.json()).catch(() => ({})),
        fetch(`${API}/api/v1/airports/${iata}/departures`).then(r => r.json()).catch(() => ({})),
      ]).then(([arrData, depData]) => {
        setArrivals(arrData.arrivals || [])
        setDepartures(depData.departures || [])
      })
    }, 5000)
    return () => clearInterval(interval)
  }, [iata])

  const data = tab === 'arrivals' ? arrivals : departures

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.title}>
          <span className={styles.iata}>{iata}</span>
        </div>
        <button className={styles.share} onClick={() => {
          const url = `${window.location.origin}/airport/${iata}`
          navigator.clipboard.writeText(url).then(() => {
            const btn = document.activeElement
            if (btn) { btn.textContent = '✓'; setTimeout(() => { btn.textContent = '↗' }, 1500) }
          }).catch(() => {})
        }} title="Copy link">↗</button>
        <button className={styles.close} onClick={onClose}>&times;</button>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tabBtn} ${tab === 'arrivals' ? styles.tabActive : ''}`}
          onClick={() => setTab('arrivals')}
        >
          Arrivals
          {arrivals.length > 0 && <span className={styles.tabBadge}>{arrivals.length}</span>}
        </button>
        <button
          className={`${styles.tabBtn} ${tab === 'departures' ? styles.tabActive : ''}`}
          onClick={() => setTab('departures')}
        >
          Departures
          {departures.length > 0 && <span className={styles.tabBadge}>{departures.length}</span>}
        </button>
      </div>

      {loading && <div className={styles.loading}>Loading traffic...</div>}

      {!loading && data.length === 0 && (
        <div className={styles.empty}>
          No {tab === 'arrivals' ? 'inbound' : 'outbound'} aircraft detected
        </div>
      )}

      {!loading && data.length > 0 && (
        <div className={styles.list}>
          <div className={`${styles.listHeader} ${tab === 'departures' ? styles.listHeaderDep : ''}`}>
            <span>Flight</span>
            <span>Dist</span>
            {tab === 'arrivals' && <span>ETA</span>}
            <span>Alt</span>
          </div>
          {data.map(a => (
            <div
              key={a.icao24}
              className={`${styles.row} ${tab === 'departures' ? styles.rowDep : ''}`}
              onClick={() => onFlightClick?.(a.icao24)}
            >
              <span className={styles.callsign}>{a.callsign || a.icao24}</span>
              <span className={styles.dim}>{a.dist_km < 10 ? a.dist_km.toFixed(1) : Math.round(a.dist_km)} km</span>
              {tab === 'arrivals' && (
                <span className={styles.eta}>{a.eta_min < 1 ? '<1' : Math.round(a.eta_min)} min</span>
              )}
              <span className={styles.dim}>{a.alt_ft ? `${Math.round(a.alt_ft / 100) * 100} ft` : '—'}</span>
            </div>
          ))}
        </div>
      )}

      {!loading && data.length > 0 && (
        <div className={styles.footer}>
          {data.length} aircraft {tab === 'arrivals' ? 'inbound' : 'outbound'}
        </div>
      )}
    </div>
  )
}
