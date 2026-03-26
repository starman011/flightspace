import { useState, useEffect, useRef } from 'react'
import styles from './CommandCenterOverlay.module.css'

// ── Meteor shower annual calendar ─────────────────────────────────────────
const SHOWERS = [
  { name: 'Quadrantids',    peak: [1,  3],  active: { m1:12, d1:28, m2:1,  d2:12 }, zhr: 120, const: 'Boötes',     desc: 'Brief but intense — peak lasts only a few hours. Blue and yellow meteors with bright fireballs and persistent trains from the obsolete constellation Quadrans Muralis.',    url: 'https://www.amsmeteors.org/meteor-showers/meteor-shower-database/quadrantids/'    },
  { name: 'Lyrids',         peak: [4,  22], active: { m1:4,  d1:14, m2:4,  d2:30 }, zhr: 20,  const: 'Lyra',       desc: 'Medium-strength shower active for about two weeks. Usually lacks persistent trains but can produce bright fireballs. Rates are good for three nights around maximum.',    url: 'https://www.amsmeteors.org/meteor-showers/meteor-shower-database/lyrids/'         },
  { name: 'Eta Aquariids',  peak: [5,  5],  active: { m1:4,  d1:19, m2:5,  d2:28 }, zhr: 60,  const: 'Aquarius',   desc: 'Debris from Halley\'s Comet. Best viewed from the Southern Hemisphere. Fast meteors with fine glowing trains — rates roughly double in southern latitudes.',           url: 'https://www.amsmeteors.org/meteor-showers/meteor-shower-database/eta-aquariids/'  },
  { name: 'S. δ Aquariids', peak: [7,  30], active: { m1:7,  d1:12, m2:8,  d2:23 }, zhr: 20,  const: 'Aquarius',   desc: 'Broad-peak southern shower with faint meteors and no persistent trains. Often observed alongside the Perseids during late July.',                                       url: 'https://www.amsmeteors.org/meteor-showers/meteor-shower-database/southern-delta-aquariids/' },
  { name: 'Perseids',       peak: [8,  12], active: { m1:7,  d1:17, m2:8,  d2:24 }, zhr: 100, const: 'Perseus',    desc: 'One of the most prolific showers of the year. Bright, swift meteors with persistent trains from Comet 109P/Swift-Tuttle. The best mid-summer show in the Northern Hemisphere.', url: 'https://www.amsmeteors.org/meteor-showers/meteor-shower-database/perseids/'       },
  { name: 'Orionids',       peak: [10, 21], active: { m1:10, d1:2,  m2:11, d2:7  }, zhr: 20,  const: 'Orion',      desc: 'Also from Halley\'s Comet debris. Fast meteors with persistent glowing trains. Can produce bright meteors rivaling the Perseids during active years.',                  url: 'https://www.amsmeteors.org/meteor-showers/meteor-shower-database/orionids/'       },
  { name: 'Leonids',        peak: [11, 17], active: { m1:11, d1:6,  m2:11, d2:30 }, zhr: 15,  const: 'Leo',        desc: 'Historically capable of producing meteor storms (1833, 1966, 1999). Sourced from Comet 55P/Tempel-Tuttle. Fast, bright meteors with long glowing trains.',            url: 'https://www.amsmeteors.org/meteor-showers/meteor-shower-database/leonids/'        },
  { name: 'Geminids',       peak: [12, 14], active: { m1:12, d1:4,  m2:12, d2:20 }, zhr: 150, const: 'Gemini',     desc: 'The strongest and most reliable annual shower. Uniquely sourced from asteroid 3200 Phaethon rather than a comet. Multi-colored meteors in yellow, red, and green.',    url: 'https://www.amsmeteors.org/meteor-showers/meteor-shower-database/geminids/'       },
  { name: 'Ursids',         peak: [12, 22], active: { m1:12, d1:17, m2:12, d2:26 }, zhr: 10,  const: 'Ursa Minor', desc: 'Minor winter solstice shower from Comet 8P/Tuttle. Often overlooked due to proximity to the holidays. Occasional outbursts to 50 ZHR have been observed.',             url: 'https://www.amsmeteors.org/meteor-showers/meteor-shower-database/ursids/'         },
]

const MONTHS_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function ordinal(n) {
  const v = n % 100
  const s = (v >= 11 && v <= 13) ? 'th' : (['st','nd','rd'][n % 10 - 1] || 'th')
  return `${n}${s}`
}

function fmtRange(a) {
  if (!a) return ''
  return a.m1 === a.m2
    ? `${MONTHS_FULL[a.m1-1]} ${ordinal(a.d1)} to ${ordinal(a.d2)}`
    : `${MONTHS_FULL[a.m1-1]} ${ordinal(a.d1)} to ${MONTHS_FULL[a.m2-1]} ${ordinal(a.d2)}`
}

function fmtPeakNight(date) {
  const next = new Date(date)
  next.setDate(next.getDate() + 1)
  return `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}–${next.getDate()}, ${date.getFullYear()}`
}

// Simple synodic moon illumination (0–100 %)
// Reference new moon: Jan 6, 2000 18:14 UTC
function moonIllum(date) {
  const REF = new Date(2000, 0, 6, 18, 14)
  const SYNODIC = 29.530588853
  const phase = (((date - REF) / 86400000) % SYNODIC + SYNODIC) % SYNODIC
  return Math.round(50 * (1 - Math.cos(2 * Math.PI * phase / SYNODIC)))
}

function nextShowers(n) {
  const now  = new Date()
  const year = now.getFullYear()
  return SHOWERS
    .map(s => {
      const d = new Date(year, s.peak[0] - 1, s.peak[1])
      if (d < now) d.setFullYear(year + 1)
      return { ...s, date: d, daysAway: Math.ceil((d - now) / 86400000), illum: moonIllum(d) }
    })
    .sort((a, b) => a.date - b.date)
    .slice(0, n)
}

function timeAgo(iso) {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000)
  if (h < 1) return `${Math.floor((Date.now() - new Date(iso).getTime()) / 60000)}m ago`
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── Science quotes rotated daily ──────────────────────────────────────────
const QUOTES = [
  { q: "The cosmos is within us. We are made of star-stuff.", a: "Carl Sagan", t: "Cosmos, 1980" },
  { q: "Look up at the stars and not down at your feet.", a: "Stephen Hawking", t: "" },
  { q: "For small creatures such as we, the vastness is bearable only through love.", a: "Carl Sagan", t: "Contact, 1985" },
  { q: "Not only is the universe stranger than we think, it is stranger than we can think.", a: "Werner Heisenberg", t: "" },
  { q: "We are all connected; to each other, biologically; to the earth, chemically; to the rest of the universe, atomically.", a: "Neil deGrasse Tyson", t: "" },
  { q: "The sky calls to us. If we do not destroy ourselves, we will one day venture to the stars.", a: "Carl Sagan", t: "" },
  { q: "Equipped with his five senses, man explores the universe around him and calls the adventure science.", a: "Edwin Hubble", t: "" },
  { q: "The greatest enemy of knowledge is not ignorance, it is the illusion of knowledge.", a: "Stephen Hawking", t: "" },
  { q: "The universe is under no obligation to make sense to you.", a: "Neil deGrasse Tyson", t: "" },
  { q: "In questions of science, the authority of a thousand is not worth the humble reasoning of a single individual.", a: "Galileo Galilei", t: "" },
  { q: "Somewhere, something incredible is waiting to be known.", a: "Carl Sagan", t: "" },
  { q: "Imagination is more important than knowledge.", a: "Albert Einstein", t: "" },
  { q: "What is a scientist after all? It is a curious person looking through a keyhole.", a: "Jacques Cousteau", t: "" },
  { q: "Science is not only a disciple of reason but, also, one of romance and passion.", a: "Stephen Hawking", t: "" },
  { q: "If the stars should appear one night in a thousand years, how would men believe and adore.", a: "Ralph Waldo Emerson", t: "" },
  { q: "The surface of the Earth is the shore of the cosmic ocean.", a: "Carl Sagan", t: "Cosmos, 1980" },
  { q: "We are just an advanced breed of monkeys on a minor planet of a very average star.", a: "Stephen Hawking", t: "" },
  { q: "Physics is like sex: sure, it may give some practical results, but that's not why we do it.", a: "Richard Feynman", t: "" },
  { q: "An unexamined life is not worth living — an unexamined universe even less so.", a: "Neil deGrasse Tyson", t: "" },
  { q: "The important thing is not to stop questioning. Curiosity has its own reason for existing.", a: "Albert Einstein", t: "" },
]

function dailyQuote() {
  const d = new Date()
  const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000)
  return QUOTES[dayOfYear % QUOTES.length]
}

// Module-level caches to survive remounts without re-fetching
let _newsCache = [], _newsCachedAt = 0
let _kpCache = null, _kpCachedAt = 0
let _kpHistCache = null, _kpHistCachedAt = 0
let _apodCache = null, _apodCachedAt = 0

function useSpaceNews() {
  const [news,    setNews]    = useState(_newsCache)
  const [offset,  setOffset]  = useState(_newsCache.length)
  const [hasMore, setHasMore] = useState(true)
  const [fetching,setFetching]= useState(false)

  useEffect(() => {
    if (_newsCache.length > 0 && Date.now() - _newsCachedAt < 600_000) { setNews(_newsCache); return }
    fetchPage(0)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function fetchPage(off) {
    if (fetching) return
    setFetching(true)
    fetch(`https://api.spaceflightnewsapi.net/v4/articles/?limit=4&offset=${off}&ordering=-published_at`)
      .then(r => r.json())
      .then(d => {
        const items = d.results ?? []
        const all   = off === 0 ? items : [..._newsCache, ...items]
        _newsCache = all; _newsCachedAt = Date.now()
        setNews(all); setOffset(all.length); setHasMore(items.length === 4)
      })
      .catch(() => {})
      .finally(() => setFetching(false))
  }

  return { news, loadMore: () => fetchPage(offset), hasMore, fetching }
}

function useSolarKpHistory() {
  const [hist, setHist] = useState(_kpHistCache ?? [])
  useEffect(() => {
    if (_kpHistCache && Date.now() - _kpHistCachedAt < 600_000) { setHist(_kpHistCache); return }
    fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json')
      .then(r => r.json())
      .then(d => {
        const rows   = Array.isArray(d) ? d.slice(1) : []
        const parsed = rows.slice(-16).map(r => ({ time: String(r[0] ?? '').slice(11,16), kp: parseFloat(r[1] ?? 0) }))
        _kpHistCache = parsed; _kpHistCachedAt = Date.now(); setHist(parsed)
      })
      .catch(() => {})
  }, [])
  return hist
}

function useSolarKp() {
  const [kp, setKp] = useState(_kpCache)
  useEffect(() => {
    if (_kpCache !== null && Date.now() - _kpCachedAt < 600_000) { setKp(_kpCache); return }
    fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json')
      .then(r => r.json())
      .then(d => { const v = parseFloat(d[d.length - 1]?.[1] ?? 0); _kpCache = v; _kpCachedAt = Date.now(); setKp(v) })
      .catch(() => {})
  }, [])
  return kp
}

function useApod() {
  const [apod, setApod] = useState(_apodCache)
  useEffect(() => {
    if (_apodCache && Date.now() - _apodCachedAt < 3_600_000) { setApod(_apodCache); return }
    fetch((import.meta.env.VITE_API_URL || '') + '/api/v1/apod')
      .then(r => r.json())
      .then(d => {
        const entry = (d.media_type === 'image') ? d : apodFallback()
        _apodCache = entry; _apodCachedAt = Date.now(); setApod(entry)
      })
      .catch(() => { setApod(apodFallback()) })
  }, [])
  return apod
}

// ── Bento tile components ────────────────────────────���───��───────��──────��──

// ── Globe filter categories (shown as chips inside mobile sheet) ─────────────
const SHEET_CATS = [
  { id: 'all',        icon: 'public',          label: 'All',      type: 'all',        scale: 'earth' },
  { id: 'satellites', icon: 'satellite_alt',   label: 'Sat',      type: 'satellites', scale: 'earth' },
  { id: 'flights',    icon: 'flight',          label: 'Flights',  type: 'planes',     scale: 'earth' },
  { id: 'ships',      icon: 'directions_boat', label: 'Ships',    type: 'ships',      scale: 'earth' },
  { id: 'rockets',    icon: 'rocket_launch',   label: 'Launches', type: 'rockets',    scale: 'earth' },
  { id: 'asteroids',  icon: 'wb_iridescent',   label: 'NEO',      type: 'asteroids',  scale: 'solar' },
]

function MobileFilterRow({ activeFilter, onFiltersChange, onCameraScale, onActiveFilterChange, onLaunchPanelToggle }) {
  function handle(cat) {
    const deselect = (activeFilter ?? 'all') === cat.id
    onFiltersChange?.({ type: deselect ? 'all' : cat.type, altitude: 'all' })
    onCameraScale?.(deselect ? 'earth' : cat.scale)
    onActiveFilterChange?.(deselect ? null : cat.id)
    if (cat.id === 'rockets') onLaunchPanelToggle?.()
  }
  return (
    <div className={styles.mobileFilterRow}>
      {SHEET_CATS.map(cat => (
        <button
          key={cat.id}
          className={`${styles.mobileFilterChip} ${(activeFilter ?? 'all') === cat.id ? styles.mobileFilterChipOn : ''}`}
          onClick={() => handle(cat)}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{cat.icon}</span>
          {cat.label}
        </button>
      ))}
    </div>
  )
}

const openTab = url => window.open(url, '_blank', 'noopener,noreferrer')

// Solar background — pure CSS gradient (no external image dependency)

// APOD fallback pool — rotated by day, used when NASA returns video or 429
const APOD_FALLBACKS = [
  { url: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=600&q=80', title: 'Milky Way Core',  copyright: 'Unsplash' },
  { url: 'https://images.unsplash.com/photo-1543722530-d2c3201371e7?w=600&q=80', title: 'Galaxy Panorama', copyright: 'Unsplash' },
  { url: 'https://images.unsplash.com/photo-1537420327992-d6e192287183?w=600&q=80', title: 'Deep Space',     copyright: 'Unsplash' },
  { url: 'https://images.unsplash.com/photo-1506443432602-ac2fcd6f54e0?w=600&q=80', title: 'Cosmic Vista',  copyright: 'Unsplash' },
]
function apodFallback() {
  const d = new Date()
  const day = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000)
  return { ...APOD_FALLBACKS[day % APOD_FALLBACKS.length], media_type: 'image' }
}

// Meteor shower backgrounds — Unsplash night-sky photos (reliable CDN)
const METEOR_BGS = [
  'https://images.unsplash.com/photo-1506443432602-ac2fcd6f54e0?w=600&q=80',
  'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=600&q=80',
  'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=600&q=80',
]

// ── Notable comets — static educational data ───────────────────────────────
const COMETS = [
  {
    name: 'C/2023 A3',       fullName: 'Tsuchinshan–ATLAS',
    perihelion: 'Sep 2024',  nextReturn: null,
    mag: -0.6,               currentMag: '~10+ (fading)',
    desc: 'Brightest comet in decades at peak, reaching mag −0.6 in Oct 2024. Now fading well past naked-eye visibility as it recedes past Jupiter.',
  },
  {
    name: '1P/Halley',       fullName: "Halley's Comet",
    perihelion: 'Jul 2061',  nextReturn: '2061',
    mag: null,               currentMag: 'Not visible (~mag 27)',
    desc: "The most famous periodic comet — currently beyond Neptune on its 75-year orbit. Last visible 1986. Next return: July 28, 2061.",
  },
  {
    name: '12P/Pons-Brooks', fullName: 'Pons-Brooks',
    perihelion: 'Apr 2024',  nextReturn: '~2094',
    mag: 4.9,                currentMag: 'Not visible (receding)',
    desc: 'Nicknamed the "Devil Comet" for dramatic outbursts that created cryovolcanic horn shapes. Orbital period ~71 years. Returns ~2094.',
  },
  {
    name: '29P/S-W 1',       fullName: 'Schwassmann–Wachmann 1',
    perihelion: 'Ongoing',   nextReturn: null,
    mag: null,               currentMag: '~11–13 (outbursts)',
    desc: 'Cryovolcanically active centaur orbiting between Jupiter and Saturn. Produces regular outbursts detectable with amateur telescopes.',
  },
]

// ── Planets visible from Earth — approximate for 2026 ────────────────────
// Magnitudes and sky position are illustrative; not a real-time ephemeris.
const PLANETS = [
  { name: 'Venus',   img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Venus-real_color.jpg/60px-Venus-real_color.jpg',   mag: -4.4, naked: true,  sky: 'Morning', color: '#fff6c0' },
  { name: 'Mars',    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/OSIRIS_Mars_true_color.jpg/60px-OSIRIS_Mars_true_color.jpg',   mag:  0.3, naked: true,  sky: 'Evening', color: '#ff7050' },
  { name: 'Jupiter', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Jupiter_and_its_shrunken_Great_Red_Spot.jpg/60px-Jupiter_and_its_shrunken_Great_Red_Spot.jpg', mag: -2.0, naked: true,  sky: 'Evening', color: '#c8a470' },
  { name: 'Saturn',  img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Saturn_during_Equinox.jpg/60px-Saturn_during_Equinox.jpg',  mag:  1.2, naked: true,  sky: 'Morning', color: '#d4c090' },
  { name: 'Uranus',  img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Uranus2.jpg/60px-Uranus2.jpg',  mag:  5.8, naked: false, sky: 'Evening', color: '#80d4e0' },
  { name: 'Neptune', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Neptune_-_Voyager_2_%2829347980845%29_flatten_crop.jpg/60px-Neptune_-_Voyager_2_%2829347980845%29_flatten_crop.jpg', mag:  7.9, naked: false, sky: 'Morning', color: '#5078d0' },
]

// ── Smart Stack definitions ────────────────────────────────────────────────
const STACK_DEFS = [
  { id: 'iss',      label: 'ISS Tracker',       icon: 'satellite_alt' },
  { id: 'apod',     label: 'Image of the Day',  icon: 'photo_camera'  },
  { id: 'solar',    label: 'Solar Activity',    icon: 'wb_sunny'      },
  { id: 'meteors',  label: 'Meteor Showers',    icon: 'star_rate'     },
  { id: 'news',     label: 'Space News',        icon: 'article'       },
  { id: 'nightsky', label: 'Night Sky',         icon: 'nights_stay'   },
  { id: 'quote',    label: 'Daily Inspiration', icon: 'format_quote'  },
]

// ── Stack slide components ─────────────────────────────────────────────────

function ApodStack({ apod }) {
  const dest = apod?.hdurl || apod?.url || 'https://apod.nasa.gov/apod/astropix.html'
  return (
    <div className={styles.apodStack} onClick={() => openTab(dest)}>
      {apod?.url && (
        <div className={styles.apodStackBg} style={{ backgroundImage: `url(${apod.url})` }} />
      )}
      <div className={styles.apodStackShade} />
      <div className={styles.apodStackContent}>
        <span className={styles.stackChip}>
          <span className="material-symbols-outlined" style={{ fontSize: 10 }}>photo_camera</span>
          Astronomy Picture of the Day
        </span>
        <p className={styles.apodStackTitle}>{apod?.title ?? 'Loading…'}</p>
        <p className={styles.apodStackCredit}>
          {apod?.copyright ? `© ${apod.copyright.trim().replace(/\n/g, ' ')}` : (apod ? 'NASA / Public Domain' : '')}
        </p>
      </div>
      <span className={styles.apodStackBadge}>
        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>open_in_new</span>
      </span>
    </div>
  )
}

function SolarStack({ kp, kpHistory = [], expanded }) {
  const level  = kp == null ? null : kp >= 5 ? 'STORM' : kp >= 4 ? 'ACTIVE' : 'NOMINAL'
  const accent = level === 'STORM' ? '#ff6b35' : level === 'ACTIVE' ? '#ffd700' : '#22ef7e'
  const desc   = level === 'STORM'
    ? 'Geomagnetic storm in progress. Aurora visible at mid-latitudes.'
    : level === 'ACTIVE'
    ? 'Elevated solar activity. Aurora possible at high latitudes.'
    : 'Solar activity nominal. No significant disturbances.'

  if (expanded) {
    const auroraLat = kp != null ? Math.max(30, 66.5 - kp * 2.5).toFixed(1) : null
    return (
      <div className={styles.solarExpanded}>
        {/* Current status bar */}
        <div className={styles.solarExpandedHeader}>
          <div>
            <p className={styles.solarExpandedKpNum} style={{ color: accent }}>{kp?.toFixed(1) ?? '—'}</p>
            <p className={styles.solarExpandedKpLabel}>Planetary Kp Index</p>
          </div>
          <div className={styles.solarExpandedStatus}>
            <span className={styles.solarExpandedLevel} style={{ color: accent }}>{level ?? 'Loading'}</span>
            <p className={styles.solarExpandedDesc}>{desc}</p>
          </div>
        </div>
        {/* Aurora latitude */}
        {auroraLat && (
          <div className={styles.solarAuroraRow}>
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#22ef7e' }}>north_star</span>
            <div>
              <p className={styles.solarAuroraLabel}>Aurora visible equatorward of {auroraLat}° latitude</p>
              {kp >= 4 && <p className={styles.solarAuroraAlert}>Unusually southern visibility tonight</p>}
            </div>
          </div>
        )}
        {/* 48-hour Kp bar chart */}
        {kpHistory.length > 0 && (
          <div className={styles.kpChartWrap}>
            <p className={styles.kpChartTitle}>48-hour Kp history · 3-hour intervals</p>
            <div className={styles.kpBars}>
              {kpHistory.map((r, i) => (
                <div key={i} className={styles.kpBarCol} title={`${r.time} UTC — Kp ${r.kp.toFixed(1)}`}>
                  <div
                    className={styles.kpBar}
                    style={{
                      height: `${Math.max(4, (r.kp / 9) * 100)}%`,
                      background: r.kp >= 5 ? '#ff6b35' : r.kp >= 4 ? '#ffd700' : '#22ef7e',
                    }}
                  />
                  {i % 4 === 0 && <span className={styles.kpBarLabel}>{r.time}</span>}
                </div>
              ))}
            </div>
            <div className={styles.kpThresholds}>
              {[[5,'#ff6b35','Storm'],[4,'#ffd700','Active'],[0,'#22ef7e','Quiet']].map(([v,c,l]) => (
                <span key={l} className={styles.kpThresholdChip} style={{ color: c }}>Kp≥{v} {l}</span>
              ))}
            </div>
          </div>
        )}
        {/* Solar cycle context */}
        <div className={styles.solarCycleCard}>
          <p className={styles.solarCycleTitle}>Solar Cycle 25 · Near Maximum</p>
          <p className={styles.solarCycleDesc}>
            Cycle 25 began Dec 2019. Solar maximum expected 2025–2026 — prime time for aurora
            observation, radio propagation, and solar imaging. The Sun's 11-year activity cycle
            drives geomagnetic storms, aurora, and HF radio blackouts.
          </p>
          <button className={styles.solarCycleLink} onClick={() => openTab('https://www.swpc.noaa.gov/')}>
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>open_in_new</span>
            NOAA Space Weather Center
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.solarStack} onClick={() => openTab('https://www.swpc.noaa.gov/products/planetary-k-index')}>
      <div className={styles.solarBg} />
      <div className={styles.solarShade} />
      <div className={styles.solarContent}>
        <span className={styles.stackChip}>
          <span className="material-symbols-outlined" style={{ fontSize: 10 }}>wb_sunny</span>
          NASA SDO · AIA 304Å · Live
        </span>
        <p className={styles.solarLevel} style={{ color: accent }}>{level ?? '—'}</p>
        <p className={styles.solarKp}>Kp {kp != null ? kp.toFixed(1) : '—'} · {desc}</p>
      </div>
    </div>
  )
}

function MeteorsStack({ showers, expanded }) {
  const [idx, setIdx] = useState(0)
  const s = showers[idx]
  if (!s) return null

  if (expanded) {
    // Full annual calendar — all 9 showers, infinitely scrollable
    const allShowers = nextShowers(9)
    return (
      <div className={styles.meteorsExpanded}>
        <p className={styles.expandedSectionLabel}>
          <span className="material-symbols-outlined" style={{ fontSize: 10 }}>calendar_month</span>
          Annual Meteor Shower Calendar · {allShowers.length} showers
        </p>
        <div className={styles.showerCalendar}>
          {allShowers.map((sh) => (
            <div key={sh.name} className={styles.showerCard} onClick={() => openTab(sh.url)}>
              <div className={styles.showerCardTop}>
                <div>
                  <p className={styles.showerCardName}>{sh.name}</p>
                  <p className={styles.showerCardConst}>Radiant: {sh.const}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p className={styles.showerZhr}>{sh.zhr} <span className={styles.showerZhrUnit}>ZHR</span></p>
                  <p className={styles.showerMoon}>Moon {sh.illum}%</p>
                </div>
              </div>
              <div className={styles.showerCardDates}>
                <span className={styles.showerPeak}>Peak: {fmtPeakNight(sh.date)}</span>
                <span className={styles.showerActive}>{fmtRange(sh.active)}</span>
              </div>
              <p className={styles.showerDesc}>{sh.desc}</p>
              <div className={styles.showerZhrBar}>
                <div className={styles.showerZhrFill} style={{ width: `${Math.min(100, (sh.zhr / 150) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
        <p className={styles.expandedFootnote}>ZHR = Zenithal Hourly Rate under ideal conditions · tap shower for AMS database</p>
      </div>
    )
  }

  return (
    <div className={styles.meteorsStack}>
      <div
        className={styles.meteorsFeatured}
        style={{ backgroundImage: `url(${METEOR_BGS[idx % METEOR_BGS.length]})` }}
        onClick={() => openTab(s.url)}
      >
        <div className={styles.meteorsFeatShade} />
        <div className={styles.meteorsFeatContent}>
          <span className={styles.stackChip}>
            <span className="material-symbols-outlined" style={{ fontSize: 10 }}>star_rate</span>
            {s.daysAway === 0 ? 'TONIGHT' : `In ${s.daysAway} days`} · {s.zhr} ZHR
          </span>
          <p className={styles.meteorsFeatName}>{s.name}</p>
          <p className={styles.meteorsFeatSub}>
            Peak {fmtPeakNight(s.date)}
            <span className={styles.meteorsDot} />
            Moon {s.illum}%
            <span className={styles.meteorsDot} />
            {s.zhr} ZHR
          </p>
          <p className={styles.meteorsFeatActive}>{fmtRange(s.active)}</p>
          <p className={styles.meteorsDescText}>{s.desc}</p>
        </div>
      </div>
      <div className={styles.meteorsUpcoming}>
        <p className={styles.meteorsUpcomingLabel}>
          <span className="material-symbols-outlined" style={{ fontSize: 9 }}>schedule</span>
          Upcoming
        </p>
        {showers.slice(0, 3).map((sh, i) => (
          <button
            key={sh.name}
            className={`${styles.meteorsUpcomingRow} ${i === idx ? styles.meteorsUpcomingActive : ''}`}
            onClick={() => setIdx(i)}
          >
            <span className={styles.meteorsUpcomingName}>{sh.name}</span>
            <span className={styles.meteorsUpcomingDate}>{fmtRange(sh.active)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function NewsStack({ news, loadMore, hasMore, fetching, expanded }) {
  const [hero, ...rest] = expanded ? news : news.slice(0, 3)
  if (!hero) return <div className={styles.newsStack} />

  if (expanded) {
    return (
      <div className={styles.newsExpanded}>
        <p className={styles.expandedSectionLabel}>
          <span className="material-symbols-outlined" style={{ fontSize: 10 }}>article</span>
          Space News Feed · {news.length} articles
        </p>
        {news.map((item) => (
          <div key={item.id} className={styles.newsExpandedRow} onClick={() => item.url && openTab(item.url)}>
            {item.image_url && (
              <div className={styles.newsExpandedThumb} style={{ backgroundImage: `url(${item.image_url})` }} />
            )}
            <div className={styles.newsExpandedBody}>
              <span className={styles.newsExpandedSource}>{item.news_site}</span>
              <p className={styles.newsExpandedTitle}>{item.title}</p>
              {item.summary && <p className={styles.newsExpandedSummary}>{item.summary}</p>}
              <p className={styles.newsExpandedAge}>{timeAgo(item.published_at)}</p>
            </div>
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'rgba(0,229,255,0.35)', flexShrink: 0, marginTop: 2 }}>open_in_new</span>
          </div>
        ))}
        {hasMore && (
          <button className={styles.loadMoreBtn} onClick={loadMore} disabled={fetching}>
            {fetching
              ? <><span className="material-symbols-outlined" style={{ fontSize: 14 }}>hourglass_empty</span> Loading…</>
              : <><span className="material-symbols-outlined" style={{ fontSize: 14 }}>expand_more</span> Load more</>}
          </button>
        )}
        <p className={styles.expandedFootnote}>Source: Spaceflight News API</p>
      </div>
    )
  }

  return (
    <div className={styles.newsStack}>
      <div
        className={styles.newsHero}
        style={hero.image_url ? { backgroundImage: `url(${hero.image_url})` } : undefined}
        onClick={() => hero.url && openTab(hero.url)}
      >
        <div className={styles.newsHeroShade} />
        <div className={styles.newsHeroContent}>
          <span className={styles.newsHeroSource}>{hero.news_site}</span>
          <p className={styles.newsHeroTitle}>{hero.title}</p>
          <p className={styles.newsHeroAge}>{timeAgo(hero.published_at)}</p>
        </div>
        <span className={styles.newsHeroBadge}>
          <span className="material-symbols-outlined" style={{ fontSize: 11 }}>open_in_new</span>
        </span>
      </div>
      {rest.length > 0 && (
        <div className={styles.newsSecondary}>
          {rest.map((item, i) => (
            <div key={item.id}>
              {i > 0 && <div className={styles.newsDivider} />}
              <div className={styles.newsSecondaryRow} onClick={() => item.url && openTab(item.url)}>
                <p className={styles.newsSecondaryTitle}>{item.title}</p>
                <p className={styles.newsSecondaryMeta}>{item.news_site} · {timeAgo(item.published_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function QuoteStack({ quote, expanded }) {
  const [copied, setCopied] = useState(false)
  const copy = (q) => {
    navigator.clipboard?.writeText(`"${q.q}" — ${q.a}`).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  if (expanded) {
    return (
      <div className={styles.quotesExpanded}>
        <p className={styles.expandedSectionLabel}>
          <span className="material-symbols-outlined" style={{ fontSize: 10 }}>format_quote</span>
          Science Quotes · swipe or tap to copy
        </p>
        {QUOTES.map((q, i) => (
          <div key={i} className={styles.quoteExpandedCard} onClick={() => copy(q)}>
            <p className={styles.quoteExpandedMark}>"</p>
            <p className={styles.quoteExpandedText}>{q.q}</p>
            <p className={styles.quoteExpandedAuthor}>— {q.a}{q.t ? `, ${q.t}` : ''}</p>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={styles.quoteStack} onClick={() => copy(quote)}>
      <span className={styles.stackChip}>
        <span className="material-symbols-outlined" style={{ fontSize: 10 }}>format_quote</span>
        {copied ? 'Copied to clipboard!' : 'Daily Inspiration'}
      </span>
      <p className={styles.quoteStackMark}>"</p>
      <p className={styles.quoteStackText}>{quote.q}</p>
      <p className={styles.quoteStackAuthor}>— {quote.a}{quote.t ? `, ${quote.t}` : ''}</p>
    </div>
  )
}

// Night Sky — comets + planetary visibility
function NightSkyStack({ expanded }) {
  const [idx, setIdx] = useState(0)
  const c = COMETS[idx]

  if (expanded) {
    return (
      <div className={styles.nightSkyExpanded}>
        {/* All comets — scrollable catalog */}
        <p className={styles.expandedSectionLabel}>
          <span className="material-symbols-outlined" style={{ fontSize: 10 }}>blur_circular</span>
          Active Comet Catalog · {COMETS.length} tracked
        </p>
        {COMETS.map(comet => (
          <div key={comet.name} className={styles.cometExpandedCard}>
            <div className={styles.cometExpandedHeader}>
              <div>
                <p className={styles.cometExpandedName}>{comet.name}</p>
                <p className={styles.cometExpandedFull}>{comet.fullName}</p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {comet.perihelion && <p className={styles.cometExpandedPeri}>Perihelion: {comet.perihelion}</p>}
                {comet.nextReturn && <p className={styles.cometExpandedReturn}>Returns: {comet.nextReturn}</p>}
              </div>
            </div>
            <p className={styles.cometExpandedDesc}>{comet.desc}</p>
            <p className={styles.cometExpandedMag}>Current brightness: {comet.currentMag}</p>
          </div>
        ))}

        {/* Full planet table */}
        <p className={styles.expandedSectionLabel} style={{ marginTop: 12 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 10 }}>visibility</span>
          Planetary Visibility · {new Date().getFullYear()} · naked eye unless noted
        </p>
        <div className={styles.planetsExpandedTable}>
          <div className={styles.planetsExpandedHead}>
            <span>Planet</span><span>Sky</span><span>Mag</span><span>Note</span>
          </div>
          {PLANETS.map(p => (
            <div key={p.name} className={styles.planetsExpandedRow}>
              <div className={styles.planetsExpandedName}>
                <img src={p.img} alt={p.name} className={styles.planetImg} />
                {p.name}
              </div>
              <span className={styles.planetsExpandedSky}>{p.sky}</span>
              <span className={styles.planetsExpandedMag} style={{ color: p.color }}>
                {p.mag > 0 ? '+' : ''}{p.mag.toFixed(1)}
              </span>
              <span>{p.naked ? '👁 Naked eye' : <span className={styles.planetBino}>BINO</span>}</span>
            </div>
          ))}
        </div>
        <p className={styles.expandedFootnote}>Magnitude scale: lower = brighter. −4 = Venus (very bright). +7 = binocular limit.</p>
      </div>
    )
  }

  return (
    <div className={styles.nightSkyStack}>
      <div className={styles.cometHero} onClick={() => setIdx((idx + 1) % COMETS.length)}>
        <div className={styles.cometStars} />
        <div className={styles.cometShade} />
        <div className={styles.cometContent}>
          <span className={styles.stackChip}>
            <span className="material-symbols-outlined" style={{ fontSize: 10 }}>blur_circular</span>
            Comets · {idx + 1}/{COMETS.length} · tap to cycle
          </span>
          <p className={styles.cometName}>{c.name}</p>
          <p className={styles.cometFullName}>{c.fullName}</p>
          <p className={styles.cometDesc}>{c.desc}</p>
          <p className={styles.cometStatus}>Now: {c.currentMag}{c.nextReturn ? ` · Returns ${c.nextReturn}` : ''}</p>
        </div>
      </div>
      <div className={styles.planetsWrap}>
        <p className={styles.planetsLabel}>
          <span className="material-symbols-outlined" style={{ fontSize: 9 }}>visibility</span>
          Planets · approx {new Date().getFullYear()} · naked eye unless noted
        </p>
        <div className={styles.planetsGrid}>
          {PLANETS.map(p => (
            <div key={p.name} className={styles.planetRow}>
              <img src={p.img} alt={p.name} className={styles.planetImg} />
              <span className={styles.planetName}>{p.name}</span>
              <span className={styles.planetSky}>{p.sky}</span>
              {!p.naked && <span className={styles.planetBino}>BINO</span>}
              <span className={styles.planetMag}>{p.mag > 0 ? '+' : ''}{p.mag.toFixed(1)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── ISS orbital parameters (stable values) ────────────────────────────────
const ISS_ORBITAL = [
  { label: 'Inclination',   value: '51.64°' },
  { label: 'Orbital Period',value: '92.68 min' },
  { label: 'Orbits / Day',  value: '15.49' },
  { label: 'Mean Altitude', value: '408 km' },
  { label: 'Velocity',      value: '7.66 km/s' },
  { label: 'Eccentricity',  value: '~0.0001' },
  { label: 'Apogee',        value: '~420 km' },
  { label: 'Perigee',       value: '~400 km' },
  { label: 'Wingspan',      value: '109 m' },
  { label: 'Mass',          value: '~420,000 kg' },
  { label: 'Pressurised Vol',value: '916 m³' },
  { label: 'In orbit since', value: 'Nov 1998' },
  { label: 'Ham radio UL',  value: '145.200 MHz' },
  { label: 'Ham radio DL',  value: '437.800 MHz' },
]

// ── ISS Stack panel ────────────────────────────────────────────────────────
function ISSStack({ issData, onISSLink, expanded }) {
  const [toast, setToast] = useState(null)
  const hasISS   = issData != null
  const issLat   = issData?.lat
  const issLon   = issData?.lon
  const issAlt   = issData?.alt_km ?? 408
  const issLatStr = issLat != null ? `${Math.abs(issLat).toFixed(2)}° ${issLat >= 0 ? 'N' : 'S'}` : '—'
  const issLonStr = issLon != null ? `${Math.abs(issLon).toFixed(2)}° ${issLon >= 0 ? 'E' : 'W'}` : '—'
  const region   = geoRegion(issLat, issLon)

  const telemetry = (
    <div className={styles.issTelemetry}>
      {[
        { label: 'Latitude',  value: issLatStr },
        { label: 'Longitude', value: issLonStr },
        { label: 'Altitude',  value: `${issAlt.toFixed(0)} km` },
        { label: 'Velocity',  value: '27,600 km/h' },
      ].map(c => (
        <div key={c.label} className={styles.issTelemCell}>
          <span className={styles.issTelemLabel}>{c.label}</span>
          <span className={styles.issTelemValue}>{c.value}</span>
        </div>
      ))}
    </div>
  )

  const linkBtn = (
    <button
      className={styles.linkBtn}
      onClick={() => {
        onISSLink?.selectISS()
        onISSLink?.trackISS()
        if (hasISS) {
          onISSLink?.flyTo(issLat, issLon)
          const coords = `${issLatStr}, ${issLonStr}`
          navigator.clipboard?.writeText(coords).catch(() => {})
          setToast(`Locked on ISS · ${coords}`)
          setTimeout(() => setToast(null), 2200)
        }
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>wifi_tethering</span>
      LINK TO ISS
    </button>
  )

  if (expanded) {
    return (
      <div className={styles.issStackWrap}>
        <div className={styles.issHeader}>
          <div className={styles.issIconWrap}>
            <div className={styles.issIcon}>
              <span className={styles.issSolarL} />
              <span className={styles.issBody} />
              <span className={styles.issSolarR} />
            </div>
            {hasISS && <span className={styles.issLiveDot} />}
          </div>
          <div>
            <p className={styles.focusLabel}>{hasISS ? 'LIVE · ISS TRAJECTORY' : 'ISS · AWAITING SIGNAL'}</p>
            <h3 className={styles.focusTitle}>International Space Station</h3>
          </div>
        </div>
        {telemetry}
        <p className={styles.issRegionNote}>
          {hasISS ? `Over ${region} · Orbiting at 27,600 km/h` : 'Awaiting live position data…'}
        </p>
        {linkBtn}
        {toast && <div className={styles.toast}><span className="material-symbols-outlined" style={{ fontSize: 13 }}>check_circle</span>{toast}</div>}

        {/* Orbital parameters table */}
        <p className={styles.expandedSectionLabel} style={{ marginTop: 16 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 10 }}>orbit</span>
          Orbital Parameters
        </p>
        <div className={styles.issOrbitalGrid}>
          {ISS_ORBITAL.map(p => (
            <div key={p.label} className={styles.issOrbitalCell}>
              <span className={styles.issOrbitalLabel}>{p.label}</span>
              <span className={styles.issOrbitalValue}>{p.value}</span>
            </div>
          ))}
        </div>
        <button className={styles.solarCycleLink} onClick={() => openTab('https://spotthestation.nasa.gov/')}>
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>open_in_new</span>
          Spot the Station · NASA
        </button>
      </div>
    )
  }

  return (
    <div className={styles.issStackWrap}>
      <div className={styles.issHeader}>
        <div className={styles.issIconWrap}>
          <div className={styles.issIcon}>
            <span className={styles.issSolarL} />
            <span className={styles.issBody} />
            <span className={styles.issSolarR} />
          </div>
          {hasISS && <span className={styles.issLiveDot} />}
        </div>
        <div>
          <p className={styles.focusLabel}>{hasISS ? 'LIVE · ISS TRAJECTORY' : 'ISS · AWAITING SIGNAL'}</p>
          <h3 className={styles.focusTitle}>International Space Station</h3>
        </div>
      </div>
      {telemetry}
      <p className={styles.issRegionNote}>
        {hasISS ? `Over ${region} · Orbiting at 27,600 km/h` : 'Awaiting live position data…'}
      </p>
      {linkBtn}
      {toast && (
        <div className={styles.toast}>
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>check_circle</span>
          {toast}
        </div>
      )}
    </div>
  )
}

// ── Smart Stack container ──────────────────────────────────────────────────
function SmartStack({ apod, kp, kpHistory, showers, news, loadMoreNews, hasMoreNews, fetchingNews, quote, pinnedLaunch, onUnpinLaunch, issData, onISSLink, onPanelChange, expanded }) {
  const [active, setActive]   = useState(0)
  const pausedRef             = useRef(false)
  const pauseTimerRef         = useRef(null)
  const total = STACK_DEFS.length

  // Auto-rotate every 9 s, pauses for 25 s after user interaction
  useEffect(() => {
    const id = setInterval(() => {
      if (!pausedRef.current) setActive(a => {
        const next = (a + 1) % total
        onPanelChange?.(next)
        return next
      })
    }, 9000)
    return () => clearInterval(id)
  }, [total, onPanelChange])

  const go = (idx) => {
    pausedRef.current = true
    setActive(idx)
    onPanelChange?.(idx)
    clearTimeout(pauseTimerRef.current)
    pauseTimerRef.current = setTimeout(() => { pausedRef.current = false }, 25000)
  }
  const prev = () => go((active - 1 + total) % total)
  const next = () => go((active + 1) % total)

  // ── Horizontal swipe to change panel ──────────────────────────────────────
  const swipeWrapRef = useRef(null)
  const swipeTRef    = useRef({ startX: 0, startY: 0, dir: null, on: false })
  // Keep latest go/active in refs so the passive-false listener sees them
  const goRef        = useRef(go);     goRef.current     = go
  const activeRef    = useRef(active); activeRef.current = active

  useEffect(() => {
    const el = swipeWrapRef.current
    if (!el) return
    const onMove = (e) => {
      const t  = swipeTRef.current
      if (!t.on) return
      const dx = e.touches[0].clientX - t.startX
      const dy = e.touches[0].clientY - t.startY
      // Lock direction on first 8 px of movement
      if (!t.dir && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        t.dir = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v'
      }
      if (t.dir === 'h') {
        e.preventDefault()
        el.style.transition = 'none'
        el.style.transform  = `translateX(${dx * 0.5}px)`
      }
    }
    // Must be non-passive to call preventDefault
    el.addEventListener('touchmove', onMove, { passive: false })
    return () => el.removeEventListener('touchmove', onMove)
  }, [])

  const onSwipeStart = (e) => {
    swipeTRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, dir: null, on: true }
  }
  const onSwipeEnd = (e) => {
    const t  = swipeTRef.current
    t.on     = false
    const dx = e.changedTouches[0].clientX - t.startX
    if (swipeWrapRef.current) {
      swipeWrapRef.current.style.transition = 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)'
      swipeWrapRef.current.style.transform  = ''
    }
    if (t.dir === 'h') {
      if (dx < -50) goRef.current((activeRef.current + 1) % total)
      if (dx >  50) goRef.current((activeRef.current - 1 + total) % total)
    }
  }

  const def = STACK_DEFS[active]

  return (
    <div className={styles.smartStack}>
      {/* Navigation header */}
      <div className={styles.stackHeader}>
        <button className={styles.stackNavBtn} onClick={prev} aria-label="Previous">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chevron_left</span>
        </button>
        <span className={styles.stackLabel}>
          <span className="material-symbols-outlined" style={{ fontSize: 11 }}>{def.icon}</span>
          {def.label}
        </span>
        <button className={styles.stackNavBtn} onClick={next} aria-label="Next">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chevron_right</span>
        </button>
      </div>

      {/* Pinned launch — always visible */}
      {pinnedLaunch && <PinnedCountdown launch={pinnedLaunch} onUnpin={onUnpinLaunch} />}

      {/* Swipe wrapper — horizontal swipe changes panel, vertical scroll passes through */}
      <div
        ref={swipeWrapRef}
        className={styles.swipeArea}
        onTouchStart={onSwipeStart}
        onTouchEnd={onSwipeEnd}
      >
        {/* Animated slide content — key forces remount + CSS animation */}
        <div key={`${active}-${expanded}`} className={styles.stackSlide}>
          {active === 0 && <ISSStack issData={issData} onISSLink={onISSLink} expanded={expanded} />}
          {active === 1 && <ApodStack apod={apod} />}
          {active === 2 && <SolarStack kp={kp} kpHistory={kpHistory} expanded={expanded} />}
          {active === 3 && <MeteorsStack showers={showers} expanded={expanded} />}
          {active === 4 && <NewsStack news={news} loadMore={loadMoreNews} hasMore={hasMoreNews} fetching={fetchingNews} expanded={expanded} />}
          {active === 5 && <NightSkyStack expanded={expanded} />}
          {active === 6 && <QuoteStack quote={quote} expanded={expanded} />}
        </div>
      </div>

      {/* Dot indicators */}
      <div className={styles.stackDots}>
        {STACK_DEFS.map((d, i) => (
          <button
            key={d.id}
            className={`${styles.stackDot} ${i === active ? styles.stackDotActive : ''}`}
            onClick={() => go(i)}
            aria-label={d.label}
          />
        ))}
      </div>
    </div>
  )
}

function useUtcTime() {
  const [time, setTime] = useState(() => new Date().toISOString().slice(11, 19))
  useEffect(() => {
    const id = setInterval(() => setTime(new Date().toISOString().slice(11, 19)), 1000)
    return () => clearInterval(id)
  }, [])
  return time
}

/** Derive a human-readable region from lat/lon */
function geoRegion(lat, lon) {
  if (lat == null || lon == null) return 'Unknown Region'
  // Oceans first (broad lat/lon boxes)
  if (lat > -60 && lat < 60 && lon > -180 && lon < -30) return 'the Pacific Ocean'
  if (lat > -60 && lat < 60 && lon > -30  && lon < 20)  return 'the Atlantic Ocean'
  if (lat > -60 && lat < 30 && lon > 20   && lon < 110) return 'the Indian Ocean'
  // Continents / regions
  if (lat > 50  && lat < 72  && lon > -25  && lon < 40)  return 'Northern Europe'
  if (lat > 35  && lat < 50  && lon > -10  && lon < 40)  return 'Central Europe'
  if (lat > 22  && lat < 40  && lon > -10  && lon < 45)  return 'the Mediterranean'
  if (lat > 5   && lat < 40  && lon > 40   && lon < 65)  return 'the Middle East'
  if (lat > 5   && lat < 40  && lon > 65   && lon < 100) return 'South Asia'
  if (lat > 15  && lat < 55  && lon > 100  && lon < 150) return 'East Asia'
  if (lat > 50  && lat < 75  && lon > 40   && lon < 180) return 'Siberia'
  if (lat > 25  && lat < 50  && lon > -130 && lon < -60) return 'North America'
  if (lat > 5   && lat < 25  && lon > -120 && lon < -60) return 'Central America'
  if (lat > -60 && lat < 5   && lon > -90  && lon < -30) return 'South America'
  if (lat > -40 && lat < 40  && lon > -20  && lon < 55)  return 'Africa'
  if (lat > -50 && lat < -10 && lon > 110  && lon < 180) return 'Australia'
  if (lat > 70)  return 'the Arctic Circle'
  if (lat < -60) return 'Antarctica'
  return 'Open Ocean'
}

/** Orbital velocity is essentially constant for LEO */
const ISS_VEL_KMH = 27_600

/**
 * CommandCenterOverlay — V2 hero overlays on top of the Globe.
 * Left: active tag + hero title + stats + live ISS focused entity card.
 * Right: Signal Stream feed panel.
 */
function PinnedCountdown({ launch, onUnpin }) {
  const [parts, setParts] = useState(() => {
    if (!launch?.net) return null
    const diff = new Date(launch.net) - Date.now()
    if (diff <= 0) return null
    return {
      dd: String(Math.floor(diff / 86400000)).padStart(2, '0'),
      hh: String(Math.floor((diff % 86400000) / 3600000)).padStart(2, '0'),
      mm: String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0'),
      ss: String(Math.floor((diff % 60000) / 1000)).padStart(2, '0'),
    }
  })

  useEffect(() => {
    if (!launch?.net) return
    const tick = () => {
      const diff = new Date(launch.net) - Date.now()
      if (diff <= 0) { setParts(null); return }
      setParts({
        dd: String(Math.floor(diff / 86400000)).padStart(2, '0'),
        hh: String(Math.floor((diff % 86400000) / 3600000)).padStart(2, '0'),
        mm: String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0'),
        ss: String(Math.floor((diff % 60000) / 1000)).padStart(2, '0'),
      })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [launch?.net])

  const statusClass = launch.status_abbr === 'Go' ? styles.pinnedStatusGo
    : launch.status_abbr === 'TBD' ? styles.pinnedStatusTbd
    : styles.pinnedStatusHold

  return (
    <div className={styles.pinnedTile}>
      <div className={styles.pinnedHeader}>
        <div className={styles.pinnedMeta}>
          <span className={`${styles.pinnedStatus} ${statusClass}`}>{launch.status_abbr || '?'}</span>
          <p className={styles.pinnedName}>{launch.mission_name || launch.name}</p>
          <p className={styles.pinnedSub}>{launch.provider}{launch.rocket ? ` · ${launch.rocket}` : ''}</p>
        </div>
        <button className={styles.pinnedUnpin} onClick={onUnpin} title="Unpin">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>push_pin</span>
        </button>
      </div>

      {parts ? (
        <div className={styles.pinnedCountdown}>
          {[['dd','D'],['hh','H'],['mm','M'],['ss','S']].map(([k, l], i) => (
            <span key={k} className={styles.pinnedCountUnit}>
              {i > 0 && <span className={styles.pinnedSep}>:</span>}
              <span className={styles.pinnedNum}>{parts[k]}</span>
              <span className={styles.pinnedLab}>{l}</span>
            </span>
          ))}
        </div>
      ) : (
        <p className={styles.pinnedLaunched}>LAUNCHED</p>
      )}
    </div>
  )
}

export default function CommandCenterOverlay({
  trackedCount, connectionStatus, issData, onISSLink, pinnedLaunch, onUnpinLaunch, forceCollapsed,
  activeFilter, onFiltersChange, onCameraScale, onActiveFilterChange, onLaunchPanelToggle,
}) {
  const isLive  = connectionStatus === 'connected'
  const utcTime = useUtcTime()
  const { news, loadMore: loadMoreNews, hasMore: hasMoreNews, fetching: fetchingNews } = useSpaceNews()
  const solarKp  = useSolarKp()
  const kpHistory = useSolarKpHistory()
  const apod     = useApod()
  const showers  = nextShowers(4)
  const quote    = dailyQuote()

  // ── Mobile bottom sheet — 3-state: 'peek' | 'half' | 'full' ─────────────
  const [sheetState, setSheetState] = useState('peek')
  const [introGone, setIntroGone]   = useState(false)
  const streamRef = useRef(null)

  // Globe interaction → dock sheet to peek (graceful, not full-hide)
  useEffect(() => {
    if (forceCollapsed) setSheetState('peek')
  }, [forceCollapsed])
  const touchRef  = useRef({ startY: 0, wasState: 'peek', dragging: false })

  const PEEK_H = 80  // px visible in peek: grab bar + filter row

  const onHandleTouchStart = (e) => {
    touchRef.current = { startY: e.touches[0].clientY, wasState: sheetState, dragging: true }
  }
  const onHandleTouchMove = (e) => {
    if (!touchRef.current.dragging || !streamRef.current) return
    const dy    = e.touches[0].clientY - touchRef.current.startY
    const h     = streamRef.current.clientHeight
    const halfY = h - Math.round(window.innerHeight * 0.52)
    streamRef.current.style.transition = 'none'
    const s = touchRef.current.wasState
    if (s === 'peek'  && dy < 0) streamRef.current.style.transform = `translateY(${Math.max(0, h - PEEK_H + dy * 0.85)}px)`
    if (s === 'half'  && dy > 0) streamRef.current.style.transform = `translateY(${Math.min(h - PEEK_H, halfY + dy * 0.85)}px)`
    if (s === 'half'  && dy < 0) streamRef.current.style.transform = `translateY(${Math.max(0, halfY + dy * 0.85)}px)`
    if (s === 'full'  && dy > 0) streamRef.current.style.transform = `translateY(${Math.min(halfY, dy * 0.85)}px)`
  }
  const onHandleTouchEnd = (e) => {
    if (!touchRef.current.dragging) return
    const dy = e.changedTouches[0].clientY - touchRef.current.startY
    touchRef.current.dragging = false
    if (streamRef.current) { streamRef.current.style.transition = ''; streamRef.current.style.transform = '' }
    const s = touchRef.current.wasState
    if (s === 'peek' && dy < -40) setSheetState('half')
    if (s === 'half' && dy < -60) setSheetState('full')
    if (s === 'half' && dy >  80) setSheetState('peek')
    if (s === 'full' && dy >  60) setSheetState('half')
  }

  const expanded = sheetState === 'full'


  return (
    <div className={styles.overlay}>
      {/* Background SVG grid */}
      <div className={styles.gridBg}>
        <svg className={styles.gridSvg}>
          <defs>
            <pattern id="cc-grid" width="100" height="100" patternUnits="userSpaceOnUse">
              <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#00E5FF" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#cc-grid)" />
        </svg>
        <div className={styles.radialGlow} />
      </div>

      {/* Left hero section */}
      <div className={styles.hero}>
        <div className={styles.activeTag}>
          <span className={`${styles.dot} ${isLive ? styles.dotLive : styles.dotOff}`} />
          <span className={styles.activeLabel}>
            Active Tracking: {isLive ? 'Enabled' : 'Connecting'}
          </span>
        </div>

        <h1 className={styles.heroTitle}>
          PLANETARY <br /><span className={styles.heroAccent}>OBSERVER</span>
        </h1>

        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Objects Tracked</p>
            <p className={styles.statValue}>
              {trackedCount.toLocaleString()}{' '}
              <span className={styles.statUnit}>active</span>
            </p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>ISS Velocity</p>
            <p className={styles.statValue}>
              {ISS_VEL_KMH.toLocaleString()} <span className={styles.statUnit}>km/h</span>
            </p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>ISS Altitude</p>
            <p className={styles.statValue}>
              408 <span className={styles.statUnit}>km</span>
            </p>
          </div>
        </div>

      </div>

      {/* Right: Smart Stack — peek + 3-state swipe on mobile */}
      <div
        ref={streamRef}
        className={[
          styles.stream,
          sheetState === 'peek' ? styles.streamClosed :
          sheetState === 'half' ? styles.streamHalf : '',
        ].filter(Boolean).join(' ')}
        data-tour="signal-stream"
      >
        {/* Grab handle — swipe zone */}
        <div
          className={styles.grabHandle}
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          onClick={() => sheetState === 'peek' && setSheetState('half')}
        >
          <span className={styles.grabBar} />
          {/* Expand / collapse chevron visible in half/full */}
          <button
            className={styles.sheetStateBtn}
            onClick={(e) => {
              e.stopPropagation()
              setSheetState(s => s === 'full' ? 'half' : s === 'half' ? 'peek' : 'half')
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {sheetState === 'full' ? 'keyboard_arrow_down' : 'keyboard_arrow_up'}
            </span>
          </button>
        </div>

        {/* Filter chips — globe filter, always visible as the peek layer */}
        <div className={styles.mobileFilterSection}>
          <p className={styles.mobileFilterLabel}>
            <span className="material-symbols-outlined" style={{ fontSize: 9 }}>tune</span>
            Globe Filter
          </p>
          <MobileFilterRow
            activeFilter={activeFilter}
            onFiltersChange={onFiltersChange}
            onCameraScale={onCameraScale}
            onActiveFilterChange={onActiveFilterChange}
            onLaunchPanelToggle={onLaunchPanelToggle}
          />
        </div>

        {/* Divider — signals content below is a separate stream */}
        <div className={styles.mobileSheetDivider}>
          <span className={styles.mobileSheetDividerLine} />
          <span className={styles.mobileSheetDividerLabel}>
            <span className="material-symbols-outlined" style={{ fontSize: 9 }}>signal_cellular_alt</span>
            Signal Stream
          </span>
          <span className={styles.mobileSheetDividerLine} />
        </div>

        <SmartStack
          apod={apod}
          kp={solarKp}
          kpHistory={kpHistory}
          showers={showers}
          news={news}
          loadMoreNews={loadMoreNews}
          hasMoreNews={hasMoreNews}
          fetchingNews={fetchingNews}
          quote={quote}
          pinnedLaunch={pinnedLaunch}
          onUnpinLaunch={onUnpinLaunch}
          issData={issData}
          onISSLink={onISSLink}
          onPanelChange={() => {}}
          expanded={expanded}
        />
      </div>

      {/* Mobile intro — fades in on load then dissolves to reveal the globe */}
      {!introGone && (
        <div className={styles.mobileIntro} onAnimationEnd={() => setIntroGone(true)}>
          <div className={styles.mobileIntroContent}>
            <p className={styles.mobileIntroTag}>
              <span className={`${styles.dot} ${isLive ? styles.dotLive : styles.dotOff}`} />
              Active Tracking
            </p>
            <h1 className={styles.mobileIntroTitle}>
              PLANETARY<br /><span className={styles.mobileIntroAccent}>OBSERVER</span>
            </h1>
            <p className={styles.mobileIntroSub}>
              {trackedCount > 0 ? `${trackedCount.toLocaleString()} objects tracked` : 'Initialising sensors…'}
            </p>
          </div>
        </div>
      )}

      {/* Encryption watermark */}
      <div className={styles.watermark}>
        <span>Encryption_Level: AES-256</span>
        <span>Local_Time: {utcTime} UTC</span>
      </div>
    </div>
  )
}
