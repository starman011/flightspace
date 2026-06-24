import { useEffect, useState } from 'react'
import styles from './AirportPanel.module.css'
import { AIRPORTS } from '../Globe/airportData.js'
import { airlineFromCs, aircraftName } from '../../data/flightLabels.js'
import AirportBoard from '../AirportBoard/AirportBoard.jsx'

const API = import.meta.env.VITE_API_URL || ''

const AIRPORT_LOOKUP = Object.fromEntries(AIRPORTS.map(a => [a.iata, a]))

export default function AirportPanel({ iata, onClose, onFlightClick }) {
  const [tab, setTab] = useState('arrivals')
  const [boardOpen, setBoardOpen] = useState(false)
  const [arrivals, setArrivals] = useState([])
  const [departures, setDepartures] = useState([])
  const [loading, setLoading] = useState(true)
  const [cityImage, setCityImage] = useState(null)

  const airportInfo = AIRPORT_LOOKUP[iata]
  const cityName = airportInfo?.city || iata

  useEffect(() => {
    if (!cityName) return
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cityName)}`)
      .then(r => r.json())
      .then(data => { if (data.thumbnail?.source) setCityImage(data.thumbnail.source) })
      .catch(() => {})
  }, [cityName])

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
      {cityImage && (
        <div style={{ position: 'relative', height: 110, overflow: 'hidden', borderRadius: '12px 12px 0 0' }}>
          <img src={cityImage} alt={cityName}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to bottom, transparent 30%, rgba(4,9,14,0.95) 100%)',
          }} />
          <div style={{
            position: 'absolute', bottom: 10, left: 14,
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(200,220,240,0.7)',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>{cityName}</div>
        </div>
      )}
      <div className={styles.header}>
        <div className={styles.title}>
          <span className={styles.iata}>{iata}</span>
          {airportInfo?.name && !cityImage && (
            <span style={{ fontSize: 10, color: 'rgba(200,220,240,0.5)', marginLeft: 8,
              fontFamily: 'var(--font-mono)' }}>{airportInfo.city}</span>
          )}
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

      {boardOpen && (
        <AirportBoard iata={iata} onClose={() => setBoardOpen(false)} onFlightClick={onFlightClick} />
      )}

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
              <span className={styles.callsign}>
                {a.callsign || a.icao24}
                {(() => {
                  const al = airlineFromCs(a.callsign)
                  const ac = aircraftName(a.type)
                  const meta = [al, ac].filter(Boolean).join(' · ')
                  return meta ? <span className={styles.sub}>{meta}</span> : null
                })()}
              </span>
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

      <button className={styles.fullBoardBtn} onClick={() => setBoardOpen(true)}>
        <span className={styles.fullBoardIcon}>🛬</span>
        <span>
          <strong>Full {cityName} flight board</strong>
          <small>Live + recent arrivals &amp; departures · city guide</small>
        </span>
        <span className={styles.fullBoardArrow}>→</span>
      </button>
    </div>
  )
}
