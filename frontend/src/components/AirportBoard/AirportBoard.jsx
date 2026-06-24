import { useEffect, useState, useCallback } from 'react'
import styles from './AirportBoard.module.css'
import { AIRPORTS } from '../Globe/airportData.js'
import { airlineFromCs, aircraftName } from '../../data/flightLabels.js'

const API = import.meta.env.VITE_API_URL || ''
const LOOKUP = Object.fromEntries(AIRPORTS.map(a => [a.iata, a]))

const peerLabel = (code) => {
  if (!code) return '—'
  const a = LOOKUP[code]
  return a ? `${a.city} (${code})` : code
}
const flightName = (cs, icao24) => {
  const id = cs || icao24 || ''
  const al = airlineFromCs(cs)
  return al ? `${al} ${id}` : id
}

// Full-screen airport flight board (FIDS-style): recent completed flights
// (real origin/destination + time from OpenSky) plus live en-route aircraft.
export default function AirportBoard({ iata, onClose, onFlightClick }) {
  const [d, setD] = useState({ arrivals: [], departures: [], recentArrivals: [], recentDepartures: [] })
  const [tab, setTab] = useState('arrivals')
  const [loading, setLoading] = useState(true)
  const apt = LOOKUP[iata]

  const load = useCallback(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      fetch(`${API}/api/v1/airports/${iata}/arrivals`).then(r => r.json()).catch(() => ({})),
      fetch(`${API}/api/v1/airports/${iata}/departures`).then(r => r.json()).catch(() => ({})),
    ]).then(([a, dep]) => {
      if (!alive) return
      setD({
        arrivals: a.arrivals || [], recentArrivals: a.recentArrivals || [],
        departures: dep.departures || [], recentDepartures: dep.recentDepartures || [],
      })
      setLoading(false)
    })
    return () => { alive = false }
  }, [iata])

  useEffect(() => load(), [load])
  useEffect(() => {
    const t = setInterval(load, 60000)         // refresh every minute
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => { clearInterval(t); window.removeEventListener('keydown', onKey) }
  }, [load, onClose])

  const isArr = tab === 'arrivals'
  const recent = isArr ? d.recentArrivals : d.recentDepartures
  const live = isArr ? d.arrivals : d.departures

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className={styles.board}>
        <header className={styles.head}>
          <div>
            <h2 className={styles.title}>{apt ? apt.city : iata} <span className={styles.code}>{iata}</span></h2>
            <p className={styles.sub}>{apt ? apt.name : 'Airport'} · live flight board</p>
          </div>
          <button className={styles.close} onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className={styles.tabs}>
          <button className={`${styles.tab} ${isArr ? styles.tabOn : ''}`} onClick={() => setTab('arrivals')}>Arrivals</button>
          <button className={`${styles.tab} ${!isArr ? styles.tabOn : ''}`} onClick={() => setTab('departures')}>Departures</button>
        </div>

        <div className={styles.scroll}>
          {loading && <p className={styles.empty}>Loading flight board…</p>}

          {!loading && recent.length > 0 && (
            <>
              <div className={styles.section}>{isArr ? 'Recently arrived' : 'Recently departed'}</div>
              <div className={`${styles.rowHead} ${styles.recentGrid}`}>
                <span>Flight</span><span>{isArr ? 'From' : 'To'}</span><span>{isArr ? 'Arrived' : 'Departed'}</span>
              </div>
              {recent.map((f, i) => (
                <div key={`r${i}`} className={`${styles.row} ${styles.recentGrid}`}
                     onClick={() => f.icao24 && onFlightClick?.(f.icao24)}>
                  <span className={styles.flight}>{flightName(f.callsign, f.icao24)}</span>
                  <span className={styles.peer}>{peerLabel(f.peer)}</span>
                  <span className={styles.time}>{f.time_utc ? `${f.time_utc} UTC` : '—'}</span>
                </div>
              ))}
            </>
          )}

          {!loading && (
            <>
              <div className={styles.section}>{isArr ? 'Arriving now' : 'Departing now'}</div>
              {live.length === 0 ? (
                <p className={styles.empty}>No {isArr ? 'inbound' : 'outbound'} aircraft detected right now.</p>
              ) : (
                <>
                  <div className={`${styles.rowHead} ${styles.liveGrid}`}>
                    <span>Flight</span><span>Aircraft</span><span>{isArr ? 'ETA' : 'Status'}</span><span>Altitude</span>
                  </div>
                  {live.map((f, i) => (
                    <div key={`l${i}`} className={`${styles.row} ${styles.liveGrid}`}
                         onClick={() => f.icao24 && onFlightClick?.(f.icao24)}>
                      <span className={styles.flight}>{flightName(f.callsign, f.icao24)}</span>
                      <span className={styles.peer}>{aircraftName(f.type) || '—'}</span>
                      <span className={styles.time}>
                        {isArr ? (f.eta_min != null && f.eta_min > 0 ? `in ${Math.round(f.eta_min)} min` : 'on approach') : 'climbing out'}
                      </span>
                      <span className={styles.alt}>{f.alt_ft ? `${Math.round(f.alt_ft).toLocaleString()} ft` : '—'}</span>
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          <p className={styles.note}>
            Recent flights from OpenSky Network (real origin/destination + time). Live aircraft from ADS-B.
            Times in UTC. Tap any flight to track it on the 3D globe.
          </p>
        </div>
      </div>
    </div>
  )
}
