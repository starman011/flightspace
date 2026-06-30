import { useState, useEffect, useCallback } from 'react'
import styles from '../FlightPage/FlightPage.module.css'
import { aircraftName, airlineFromCs } from '../../data/flightLabels'
import { COLUMNS as FOOTER_COLUMNS } from '../SiteFooter/SiteFooter'

const API = import.meta.env.VITE_API_URL || ''

// Popular carriers (ICAO callsign prefix → display name) and aircraft types
// (ICAO type code → friendly name). These drive the picker chips.
const AIRLINES = [
  ['UAE', 'Emirates'], ['QTR', 'Qatar Airways'], ['ETD', 'Etihad'],
  ['BAW', 'British Airways'], ['DLH', 'Lufthansa'], ['AFR', 'Air France'], ['KLM', 'KLM'],
  ['AAL', 'American'], ['UAL', 'United'], ['DAL', 'Delta'], ['SWA', 'Southwest'],
  ['IGO', 'IndiGo'], ['AIC', 'Air India'], ['SIA', 'Singapore'], ['CPA', 'Cathay Pacific'],
  ['QFA', 'Qantas'], ['UAE', 'Emirates'], ['THY', 'Turkish'], ['RYR', 'Ryanair'], ['EZY', 'easyJet'],
  ['ANA', 'ANA'], ['JAL', 'Japan Airlines'],
]
const TYPES = [
  ['B738', 'Boeing 737-800'], ['B38M', 'Boeing 737 MAX 8'], ['A320', 'Airbus A320'], ['A20N', 'Airbus A320neo'],
  ['A21N', 'Airbus A321neo'], ['B77W', 'Boeing 777-300ER'], ['B772', 'Boeing 777-200'], ['A359', 'Airbus A350-900'],
  ['B789', 'Boeing 787-9'], ['B788', 'Boeing 787-8'], ['A388', 'Airbus A380'], ['B744', 'Boeing 747-400'],
  ['A333', 'Airbus A330-300'], ['E190', 'Embraer 190'], ['AT76', 'ATR 72-600'], ['DH8D', 'Dash 8 Q400'],
]
// de-dupe (Emirates listed twice above for emphasis in two columns visually)
const UNIQ_AIRLINES = AIRLINES.filter((a, i) => AIRLINES.findIndex(b => b[0] === a[0]) === i)

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
)

export default function PlanesPage({ onClose, onFlightClick }) {
  const [mode, setMode] = useState('airline')
  const [sel, setSel] = useState(null)        // { code, name, mode }
  const [data, setData] = useState(null)      // { count, flights[] }
  const [loading, setLoading] = useState(false)

  const fetchFleet = useCallback((m, code) => {
    const q = m === 'airline' ? `airline=${encodeURIComponent(code)}` : `type=${encodeURIComponent(code)}`
    return fetch(`${API}/api/v1/fleet?${q}`).then(r => r.json())
  }, [])

  const pick = useCallback((m, code, name) => {
    setSel({ code, name, mode: m })
    setLoading(true)
    setData(null)
    fetchFleet(m, code).then(d => { setData(d || { count: 0, flights: [] }); setLoading(false) })
      .catch(() => { setData({ count: 0, flights: [] }); setLoading(false) })
    setTimeout(() => document.getElementById('planesBoard')?.scrollIntoView({ behavior: 'smooth' }), 80)
  }, [fetchFleet])

  // Deep link: /planes?airline=UAE or /planes?type=B77W
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const a = p.get('airline'), t = p.get('type')
    if (a) { setMode('airline'); pick('airline', a.toUpperCase(), (UNIQ_AIRLINES.find(x => x[0] === a.toUpperCase()) || [a, a])[1]) }
    else if (t) { setMode('type'); pick('type', t.toUpperCase(), (TYPES.find(x => x[0] === t.toUpperCase()) || [t, t])[1]) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refresh the selected fleet every 30s
  useEffect(() => {
    if (!sel) return
    const t = setInterval(() => { fetchFleet(sel.mode, sel.code).then(d => d && setData(d)).catch(() => {}) }, 30000)
    return () => clearInterval(t)
  }, [sel, fetchFleet])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const flights = data?.flights || []
  const chips = mode === 'airline' ? UNIQ_AIRLINES : TYPES

  return (
    <div className={styles.overlay}>
      <button className={styles.close} onClick={onClose} aria-label="Close"><CloseIcon /></button>

      {/* cover */}
      <section className={styles.cover}>
        <div className={styles.coverImg} />
        <div className={styles.coverVeil} />
        <div className={styles.coverText}>
          <p className={styles.eyebrow}>ObjectTracer · Live fleets</p>
          <h1 className={styles.coverTitle}>Who&rsquo;s flying<br />right now?</h1>
          <p className={styles.blurb}>Pick an airline or an aircraft type and see every one of them airborne worldwide — then tap any flight to track it on the 3D globe.</p>
        </div>
        <div className={styles.cue}><span>scroll</span><span className={styles.cueBar} /></div>
      </section>

      {/* picker */}
      <section className={`${styles.section} ${styles.locSec}`}>
        <div className={`${styles.glass} ${styles.locCard}`}>
          <p className={styles.locEyebrow}>Live fleets</p>
          <h2 className={styles.locTitle}>Track a fleet</h2>
          <p className={styles.locSub}>Browse by airline or aircraft type — counts are live from ADS-B.</p>
          <div className={styles.tabs} style={{ marginTop: 20 }}>
            <button className={`${styles.tab} ${mode === 'airline' ? styles.tabOn : ''}`} onClick={() => setMode('airline')}>Airlines</button>
            <button className={`${styles.tab} ${mode === 'type' ? styles.tabOn : ''}`} onClick={() => setMode('type')}>Aircraft types</button>
          </div>
          <div className={styles.locChips} style={{ marginTop: 18 }}>
            {chips.map(([code, name]) => (
              <button key={code} className={styles.chip} onClick={() => pick(mode, code, name)}>{name}</button>
            ))}
          </div>
        </div>
      </section>

      {/* board */}
      {sel && (
        <section className={`${styles.section} ${styles.aptSec}`} id="planesBoard">
          <div className={`${styles.glass} ${styles.aptBoard}`}>
            <div className={styles.aptBar}>
              <div>
                <span className={styles.aptKicker}>{sel.mode === 'airline' ? 'Airline fleet' : 'Aircraft type'}</span>
                <div className={styles.aptTitle}>
                  <span className={styles.aptCode}>{sel.code}</span>
                  <span className={styles.aptName}>{sel.name} · {data ? `${data.count} airborne now` : 'loading…'}</span>
                </div>
              </div>
            </div>

            {loading && flights.length === 0 ? (
              <p className={styles.loading}>Scanning the skies for {sel.name}…</p>
            ) : flights.length === 0 ? (
              <p className={styles.empty}>None airborne right now. Try another {sel.mode === 'airline' ? 'airline' : 'type'}.</p>
            ) : (
              <>
                <div className={styles.head}>
                  <span>Flight</span><span>{sel.mode === 'airline' ? 'Aircraft' : 'Airline'}</span><span>Country</span><span>Altitude</span>
                </div>
                {flights.map((f, i) => {
                  const cs = f.callsign || f.icao24 || ''
                  const second = sel.mode === 'airline' ? (aircraftName(f.type) || f.type || '—') : (airlineFromCs(f.callsign) || '—')
                  const alt = f.alt_ft ? `${(Math.round(f.alt_ft / 100) * 100).toLocaleString()} ft` : (f.on_ground ? 'on ground' : '—')
                  return (
                    <div key={f.icao24 || i} className={styles.row}
                      onClick={() => f.icao24 && onFlightClick?.(f.icao24, f.lat != null ? { lat: f.lat, lon: f.lon } : null)}>
                      <span className={styles.rcs}>{cs}</span>
                      <span className={styles.rcity}>{second}</span>
                      <span className={styles.rtime}>{f.country || '—'}</span>
                      <span className={styles.rtime}>{alt}</span>
                    </div>
                  )
                })}
              </>
            )}

            <div className={styles.foot}>
              <span>Live aircraft from ADS-B · tap a flight to track it on the 3D globe</span>
            </div>
          </div>
        </section>
      )}

      {/* footer */}
      <footer className={styles.footer}>
        <div className={styles.footerCols}>
          {FOOTER_COLUMNS.map(col => (
            <nav key={col.title} className={styles.footerCol} aria-label={col.title}>
              <h3 className={styles.footerColTitle}>{col.title}</h3>
              {col.links.map(([label, href]) => (
                <a key={href} href={href} className={styles.footerLink}>{label}</a>
              ))}
            </nav>
          ))}
        </div>
        <div className={styles.footerBottom}>
          <span>© {new Date().getFullYear()} ObjectTracer — real-time 3D flight &amp; space tracker</span>
          <span className={styles.footerBottomLinks}>
            <a href="/about">About</a><a href="/faq">FAQ</a><a href="/contact">Contact</a><a href="/donate">Donate</a>
          </span>
        </div>
      </footer>
    </div>
  )
}
