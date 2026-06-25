import { useEffect, useState, useCallback } from 'react'
import styles from './AirportBoard.module.css'
import { AIRPORTS } from '../Globe/airportData.js'
import { airlineFromCs, aircraftName } from '../../data/flightLabels.js'
import { cityFlavor } from '../../data/cityFlavor.js'

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

// Full-screen city flight experience: city hero + guide, then a FIDS-style
// board of recent (real origin/destination from OpenSky) + live aircraft.
export default function AirportBoard({ iata, onClose, onFlightClick }) {
  const [d, setD] = useState({ arrivals: [], departures: [], recentArrivals: [], recentDepartures: [] })
  const [tab, setTab] = useState('arrivals')
  const [loading, setLoading] = useState(true)
  const [wiki, setWiki] = useState(null)
  const apt = LOOKUP[iata]
  const cityName = apt ? apt.city : iata
  const flavor = cityFlavor(iata)

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
    const t = setInterval(load, 60000)
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => { clearInterval(t); window.removeEventListener('keydown', onKey) }
  }, [load, onClose])

  // City intro + photo from Wikipedia.
  useEffect(() => {
    let alive = true
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cityName)}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (alive && j) setWiki({ extract: j.extract, img: j.thumbnail?.source || j.originalimage?.source || null }) })
      .catch(() => {})
    return () => { alive = false }
  }, [cityName])

  const isArr = tab === 'arrivals'
  const recent = isArr ? d.recentArrivals : d.recentDepartures
  const live = isArr ? d.arrivals : d.departures

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className={styles.board}>
        <button className={styles.close} onClick={onClose} aria-label="Close">✕</button>

        {/* ── City hero ── */}
        <header className={styles.hero} style={wiki?.img ? { backgroundImage: `linear-gradient(180deg, rgba(6,10,16,0.45), rgba(6,10,16,0.96)), url('${wiki.img}')` } : undefined}>
          <div className={styles.heroInner}>
            <p className={styles.eyebrow}>{apt ? apt.name : 'Airport'} · {iata}</p>
            <h2 className={styles.title}>{cityName}</h2>
            {(flavor?.knownFor || wiki?.extract) && (
              <p className={styles.intro}>{flavor?.knownFor || wiki.extract}</p>
            )}
          </div>
        </header>

        <div className={styles.scroll}>
          {/* ── City guide ── */}
          {(flavor || wiki?.extract) && (
            <div className={styles.guide}>
              {wiki?.extract && flavor?.knownFor && <p className={styles.about}>{wiki.extract}</p>}
              {flavor && (
                <div className={styles.flavorGrid}>
                  {flavor.places?.length > 0 && (
                    <div className={styles.flavorCard}>
                      <div className={styles.flavorHead}>◎ Places to visit</div>
                      <ul>{flavor.places.map(p => <li key={p}>{p}</li>)}</ul>
                    </div>
                  )}
                  {flavor.cuisine?.length > 0 && (
                    <div className={styles.flavorCard}>
                      <div className={styles.flavorHead}>🍴 Local cuisine</div>
                      <ul>{flavor.cuisine.map(c => <li key={c}>{c}</li>)}</ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Flight board ── */}
          <div className={styles.tabs}>
            <button className={`${styles.tab} ${isArr ? styles.tabOn : ''}`} onClick={() => setTab('arrivals')}>Arrivals</button>
            <button className={`${styles.tab} ${!isArr ? styles.tabOn : ''}`} onClick={() => setTab('departures')}>Departures</button>
          </div>

          {loading && <p className={styles.empty}>Loading flight board…</p>}

          {!loading && recent.length > 0 && (
            <>
              <div className={styles.section}>{isArr ? 'Recently arrived' : 'Recently departed'}</div>
              <div className={`${styles.rowHead} ${styles.recentGrid}`}>
                <span>Flight</span><span>{isArr ? 'From' : 'To'}</span><span>{isArr ? 'Arrived' : 'Departed'}</span>
              </div>
              {recent.map((f, i) => (
                <div key={`r${i}`} className={`${styles.row} ${styles.recentGrid}`} onClick={() => f.icao24 && onFlightClick?.(f.icao24)}>
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
                    <span>Flight</span><span>{isArr ? 'From' : 'To'}</span><span>{isArr ? 'ETA' : 'Status'}</span><span>Altitude</span>
                  </div>
                  {live.map((f, i) => {
                    const code = isArr ? f.origin : f.dest
                    const where = code ? peerLabel(code) : (aircraftName(f.type) || '—')
                    return (
                      <div key={`l${i}`} className={`${styles.row} ${styles.liveGrid}`} onClick={() => f.icao24 && onFlightClick?.(f.icao24)}>
                        <span className={styles.flight}>{flightName(f.callsign, f.icao24)}</span>
                        <span className={styles.peer}>{where}</span>
                        <span className={styles.time}>
                          {isArr ? (f.eta_min != null && f.eta_min > 0 ? `in ${Math.round(f.eta_min)} min` : 'on approach') : 'climbing out'}
                        </span>
                        <span className={styles.alt}>{f.alt_ft ? `${Math.round(f.alt_ft).toLocaleString()} ft` : '—'}</span>
                      </div>
                    )
                  })}
                </>
              )}
            </>
          )}

          <p className={styles.note}>
            Recent flights from OpenSky Network (real origin/destination + time, UTC). Live aircraft from ADS-B.
            Tap any flight to track it on the 3D globe.
          </p>
        </div>
      </div>
    </div>
  )
}
