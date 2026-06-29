import { useState, useEffect, useRef, useCallback } from 'react'
import styles from './FlightPage.module.css'
import { AIRPORTS } from '../Globe/airportData'
import { airlineFromCs, aircraftName } from '../../data/flightLabels'
import { COLUMNS as FOOTER_COLUMNS } from '../SiteFooter/SiteFooter'
import { CITY_FLAVOR } from '../../data/cityFlavor'

const API = import.meta.env.VITE_API_URL || ''
const LOOKUP = Object.fromEntries(AIRPORTS.map(a => [a.iata, a]))

/* ── minimalist line icons (no emoji) ─────────────────────────────────────── */
const PinIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10z" /><circle cx="12" cy="11" r="2.2" />
  </svg>
)
const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
)
const GlobeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
    <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" />
  </svg>
)

/* ── geo helpers ──────────────────────────────────────────────────────────── */
function haversine(aLat, aLon, bLat, bLon) {
  const R = 6371, toR = Math.PI / 180
  const dLat = (bLat - aLat) * toR, dLon = (bLon - aLon) * toR
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * toR) * Math.cos(bLat * toR) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
function nearestAirport(lat, lon) {
  let best = null, bestD = Infinity
  for (const a of AIRPORTS) {
    const d = haversine(lat, lon, a.lat, a.lon)
    if (d < bestD) { bestD = d; best = { ...a, dist: Math.round(d) } }
  }
  return best
}
function nearbyAirports(lat, lon, exclIata, n = 3) {
  return AIRPORTS
    .filter(a => a.iata !== exclIata)
    .map(a => ({ ...a, dist: Math.round(haversine(lat, lon, a.lat, a.lon)) }))
    .sort((x, y) => x.dist - y.dist)
    .slice(0, n)
    .filter(a => a.dist < 400)
}
function matchAirport(q) {
  q = (q || '').trim()
  if (!q) return null
  const up = q.toUpperCase()
  if (LOOKUP[up]) return { ...LOOKUP[up] }
  const lc = q.toLowerCase()
  let starts = null, contains = null
  for (const a of AIRPORTS) {
    const city = a.city.toLowerCase(), name = a.name.toLowerCase()
    if (city === lc) return { ...a }
    if (!starts && (city.startsWith(lc) || name.startsWith(lc))) starts = a
    if (!contains && (city.includes(lc) || name.includes(lc))) contains = a
  }
  const m = starts || contains
  return m ? { ...m } : null
}

export default function FlightPage({ onClose, onFlightClick, onOpenAirport }) {
  const [apt, setApt] = useState(null)        // { iata, city, name, lat, lon, dist }
  const [nearby, setNearby] = useState([])
  const [tab, setTab] = useState('arr')
  const [arr, setArr] = useState([])
  const [dep, setDep] = useState([])
  const [loading, setLoading] = useState(false)
  const [locating, setLocating] = useState(false)
  const [note, setNote] = useState('')
  const [q, setQ] = useState('')
  const [city, setCity] = useState(null)   // { img, extract, gallery[] } from Wikipedia
  const boardRef = useRef(null)

  const resolve = useCallback((airport) => {
    if (!airport) { setNote('No airport found — try a city like New York, London or Tokyo.'); return }
    setNote('')
    setApt(airport)
    setNearby(nearbyAirports(airport.lat, airport.lon, airport.iata))
    setTab('arr')
    setTimeout(() => boardRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
  }, [])

  const locate = () => {
    setNote('')
    setLocating(true)

    const fromCoords = (lat, lon) => { setLocating(false); resolve(nearestAirport(lat, lon)) }

    // Fallback: approximate location from IP — works when GPS is denied,
    // unavailable, or times out (common on desktop).
    const ipFallback = (blocked) => {
      fetch('https://get.geojs.io/v1/ip/geo.json')
        .then(r => r.json())
        .then(d => {
          const lat = parseFloat(d.latitude), lon = parseFloat(d.longitude)
          if (Number.isFinite(lat) && Number.isFinite(lon)) fromCoords(lat, lon)
          else throw new Error('no coords')
        })
        .catch(() => {
          setLocating(false)
          setNote(blocked
            ? 'Location is blocked — search a city instead.'
            : 'Could not get your location — search a city instead.')
        })
    }

    if (!navigator.geolocation) { ipFallback(false); return }
    navigator.geolocation.getCurrentPosition(
      pos => fromCoords(pos.coords.latitude, pos.coords.longitude),
      err => { console.warn('[flight locate] geolocation error', err?.code, err?.message, '→ IP fallback'); ipFallback(err?.code === 1) },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    )
  }

  const submitSearch = (e) => {
    e.preventDefault()
    resolve(matchAirport(q))
  }

  // load + poll the board for the selected airport
  useEffect(() => {
    if (!apt) return
    let alive = true
    const load = () => {
      setLoading(true)
      Promise.all([
        fetch(`${API}/api/v1/airports/${apt.iata}/arrivals`).then(r => r.json()).catch(() => ({})),
        fetch(`${API}/api/v1/airports/${apt.iata}/departures`).then(r => r.json()).catch(() => ({})),
      ]).then(([a, d]) => {
        if (!alive) return
        setArr(a.arrivals || [])
        setDep(d.departures || [])
        setLoading(false)
      })
    }
    load()
    const t = setInterval(load, 30000)
    return () => { alive = false; clearInterval(t) }
  }, [apt])

  // close on Escape
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Deep link: /flight?a=JFK opens that airport's board directly (shareable).
  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get('a')
    const code = a && a.toUpperCase()
    if (code && LOOKUP[code]) resolve({ ...LOOKUP[code] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Per-airport city photos + intro (Wikipedia) — a real image, a short blurb,
  // and a small gallery so people get a feel for the destination.
  useEffect(() => {
    if (!apt) return
    let alive = true
    setCity(null)
    const title = encodeURIComponent(apt.city)
    Promise.all([
      fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`).then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`https://en.wikipedia.org/api/rest_v1/page/media-list/${title}`).then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([sum, media]) => {
      if (!alive) return
      const img = sum?.originalimage?.source || sum?.thumbnail?.source || null
      const extract = sum?.extract || null
      let gallery = []
      if (media?.items) {
        gallery = media.items
          .filter(it => it.type === 'image' && it.srcset?.length && !/\.svg/i.test(it.srcset[0].src))
          .slice(0, 6)
          .map(it => (it.srcset[0].src.startsWith('//') ? `https:${it.srcset[0].src}` : it.srcset[0].src))
      }
      setCity({ img, extract, gallery })
    })
    return () => { alive = false }
  }, [apt])

  const isArr = tab === 'arr'
  const rows = isArr ? arr : dep

  const peerLabel = (f) => {
    const code = isArr ? f.origin : f.dest
    if (code) return LOOKUP[code]?.city ? `${LOOKUP[code].city} (${code})` : code
    return aircraftName(f.type) || '—'
  }
  const flightName = (f) => {
    const id = f.callsign || f.icao24 || ''
    const al = airlineFromCs(f.callsign)
    return { id, al }
  }
  const arrStatus = (f) => (f.eta_min != null && f.eta_min <= 8
    ? { label: 'On approach', cls: styles.pillGo }
    : { label: 'Inbound', cls: styles.pillOk })
  const etaText = (f) => (f.eta_min == null ? '—' : f.eta_min <= 1 ? 'Landing' : `${Math.round(f.eta_min)} min`)
  const altText = (f) => (f.alt_ft ? `${(Math.round(f.alt_ft / 100) * 100).toLocaleString()} ft` : '—')

  return (
    <div className={styles.overlay}>
      <button className={styles.close} onClick={onClose} aria-label="Close"><CloseIcon /></button>

      {/* ── page 1 · cinematic cover ── */}
      <section className={styles.cover}>
        <div className={styles.coverImg} />
        <div className={styles.coverVeil} />
        <div className={styles.coverText}>
          <p className={styles.eyebrow}>ObjectTracer · Live flights</p>
          <h1 className={styles.coverTitle}>What&rsquo;s flying<br />overhead?</h1>
          <p className={styles.blurb}>
            Live arrivals and departures from the airport nearest you. Share your location, or search any city.
          </p>
        </div>
        <div className={styles.cue}><span>scroll</span><span className={styles.cueBar} /></div>
      </section>

      {/* ── locate ── */}
      <section className={`${styles.section} ${styles.locSec}`}>
        <div className={`${styles.glass} ${styles.locCard}`}>
          <p className={styles.locEyebrow}>Flights near you</p>
          <h2 className={styles.locTitle}>Find your<br />nearest airport</h2>
          <p className={styles.locSub}>See what&rsquo;s arriving and departing around you, live from ADS-B. Share your location, or pick a city.</p>
          <div className={styles.locActions}>
            <button className={styles.btn} onClick={locate} disabled={locating}>
              <PinIcon /><span>{locating ? 'Locating…' : 'Use my location'}</span>
            </button>
            <span className={styles.locOr}>or</span>
            <form onSubmit={submitSearch} style={{ flex: 1, minWidth: 190, display: 'flex' }}>
              <input
                className={styles.locInput}
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search a city or airport…"
              />
            </form>
          </div>
          <div className={styles.locChips}>
            <span>Try</span>
            {[['JFK', 'New York'], ['LHR', 'London'], ['HND', 'Tokyo'], ['DXB', 'Dubai']].map(([code, label]) => (
              LOOKUP[code] && <button key={code} className={styles.chip} onClick={() => resolve({ ...LOOKUP[code] })}>{label}</button>
            ))}
          </div>
          {note && <p className={styles.locNote}>{note}</p>}
        </div>
      </section>

      {/* ── airport board ── */}
      {apt && (
        <section className={`${styles.section} ${styles.aptSec}`} ref={boardRef}>
          <div className={`${styles.glass} ${styles.aptBoard}`}>
            {city?.img && (
              <div className={styles.cityHero}>
                <img src={city.img} alt={apt.city} loading="lazy" />
                <div className={styles.cityHeroVeil} />
                <span className={styles.cityHeroLabel}>{apt.city}</span>
              </div>
            )}
            <div className={styles.aptBar}>
              <div>
                <span className={styles.aptKicker}>Nearest airport</span>
                <div className={styles.aptTitle}>
                  <span className={styles.aptCode}>{apt.iata}</span>
                  <span className={styles.aptName}>{apt.name}{apt.dist != null ? ` · ${apt.dist} km away` : ''}</span>
                </div>
              </div>
              {nearby.length > 0 && (
                <div className={styles.nearby}>
                  <span>Nearby</span>
                  {nearby.map(n => (
                    <button key={n.iata} className={styles.nchip} onClick={() => resolve({ ...n })}>{n.iata} · {n.dist}km</button>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.tabs}>
              <button className={`${styles.tab} ${isArr ? styles.tabOn : ''}`} onClick={() => setTab('arr')}>Arrivals</button>
              <button className={`${styles.tab} ${!isArr ? styles.tabOn : ''}`} onClick={() => setTab('dep')}>Departures</button>
            </div>

            {loading && rows.length === 0 ? (
              <p className={styles.loading}>Scanning the sky around {apt.iata}…</p>
            ) : rows.length === 0 ? (
              <p className={styles.empty}>No {isArr ? 'inbound' : 'outbound'} aircraft detected right now.</p>
            ) : (
              <>
                <div className={styles.head}>
                  <span>Flight</span><span>{isArr ? 'From' : 'To'}</span><span>Status</span><span>{isArr ? 'ETA' : 'Altitude'}</span>
                </div>
                {rows.map((f, i) => {
                  const { id, al } = flightName(f)
                  const status = isArr ? arrStatus(f) : { label: 'Departing', cls: styles.pillGo }
                  return (
                    <div key={f.icao24 || i} className={styles.row} onClick={() => f.icao24 && onFlightClick?.(f.icao24, apt ? { lat: apt.lat, lon: apt.lon } : null)}>
                      <span className={styles.rcs}>{id}{al && <small>{al}</small>}</span>
                      <span className={styles.rcity}>{peerLabel(f)}</span>
                      <span className={`${styles.pill} ${status.cls}`}>{status.label}</span>
                      <span className={styles.rtime}>{isArr ? etaText(f) : altText(f)}</span>
                    </div>
                  )
                })}
              </>
            )}

            <div className={styles.foot}>
              <span>Live aircraft from ADS-B · tap a flight to track it on the 3D globe</span>
              <button className={styles.btnGhost} onClick={() => { onOpenAirport?.(apt.iata); onClose?.() }}>
                <GlobeIcon /><span>Open {apt.iata} on the globe</span>
              </button>
            </div>
          </div>

          {(CITY_FLAVOR[apt.iata] || city?.extract) && (() => {
            const flavor = CITY_FLAVOR[apt.iata]
            return (
              <div className={`${styles.glass} ${styles.cityGuide}`}>
                <div className={styles.guideHead}>
                  <span className={styles.aptKicker}>Discover</span>
                  <h3 className={styles.guideTitle}>{apt.city}</h3>
                </div>
                {(flavor?.knownFor || city?.extract) && (
                  <p className={styles.guideIntro}>{flavor?.knownFor || city.extract}</p>
                )}
                {city?.gallery?.length > 0 && (
                  <div className={styles.gallery}>
                    {city.gallery.map((src, i) => (
                      <img key={i} src={src} alt={`${apt.city} ${i + 1}`} loading="lazy" />
                    ))}
                  </div>
                )}
                {(flavor?.places?.length || flavor?.cuisine?.length) ? (
                  <div className={styles.guideGrid}>
                    {flavor?.places?.length > 0 && (
                      <div className={styles.guideCol}>
                        <h4>Places to visit</h4>
                        <ul>{flavor.places.map(p => <li key={p}>{p}</li>)}</ul>
                      </div>
                    )}
                    {flavor?.cuisine?.length > 0 && (
                      <div className={styles.guideCol}>
                        <h4>Local cuisine</h4>
                        <ul>{flavor.cuisine.map(c => <li key={c}>{c}</li>)}</ul>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )
          })()}
        </section>
      )}

      {/* ── site footer (internal links + sitemap) ── */}
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
