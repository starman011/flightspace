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

// Globe filter categories moved to MobileFilterRow below (SVG icon-based)

// ── Galaxy distance slider (compact, integrated into filter bar) ──────────
const G_C_KMS = 299792.458, G_H0 = 67.4, G_OM = 0.315, G_OL = 0.685, G_MPC_LY = 3261600
function gZtoLY(z) {
  const n = 80, dz = z / n; let sum = 0
  for (let i = 0; i < n; i++) { const zi = (i + 0.5) * dz; sum += dz / Math.sqrt(G_OM * (1 + zi) ** 3 + G_OL) }
  return (G_C_KMS / G_H0) * sum * G_MPC_LY
}
function gFmtLY(ly) { return ly < 1e9 ? `${(ly / 1e6).toFixed(0)}M ly` : `${(ly / 1e9).toFixed(1)}B ly` }

const GZ_MAX = 3.5, GZ_STEP = 0.01, GZ_DEFAULT_MAX = 0.15

function GalaxyDistanceSlider({ onChange }) {
  const [maxZ, setMaxZ] = useState(GZ_DEFAULT_MAX)
  const emitRef = useRef(null)

  // Emit default range on mount
  useEffect(() => { onChange?.(0, GZ_DEFAULT_MAX) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Reset to full on unmount
  useEffect(() => () => onChange?.(0, GZ_MAX), [onChange])

  const handleChange = (e) => {
    const v = Math.max(parseFloat(e.target.value), GZ_STEP)
    setMaxZ(v)
    clearTimeout(emitRef.current)
    emitRef.current = setTimeout(() => onChange?.(0, v), 40)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '2px 0' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(160,140,255,0.7)', whiteSpace: 'nowrap' }}>0</span>
      <input
        type="range" min={GZ_STEP} max={GZ_MAX} step={GZ_STEP} value={maxZ}
        onChange={handleChange}
        onPointerDown={e => e.stopPropagation()}
        style={{ flex: 1, accentColor: '#8c64ff', height: 4, cursor: 'pointer' }}
      />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(160,140,255,0.95)', fontWeight: 600, whiteSpace: 'nowrap', minWidth: 48, textAlign: 'right' }}>
        {gFmtLY(gZtoLY(maxZ))}
      </span>
    </div>
  )
}

const MOBILE_FILTERS = [
  { id: 'all',        type: 'all',        scale: 'earth', label: 'All' },
  { id: 'satellites', type: 'satellites', scale: 'earth', label: 'Sat' },
  { id: 'flights',    type: 'planes',     scale: 'earth', label: 'Flights' },
  { id: 'ships',      type: 'ships',      scale: 'earth', label: 'Ships' },
  { id: 'rockets',    type: 'rockets',    scale: 'earth', label: 'Launches' },
  { id: 'asteroids',  type: 'asteroids',  scale: 'solar', label: 'NEO' },
]

function MobileFilterIcon({ id }) {
  const s = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' }
  switch (id) {
    case 'all': return (
      <svg {...s}><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
    )
    case 'satellites': return (
      <svg {...s}><path d="M13 7L9 3 5 7l4 4" /><path d="M17 11l4 4-4 4-4-4" /><path d="M8 12l4 4" /><path d="M16 8l-4-4" /><circle cx="5" cy="19" r="2" /><path d="M9 15a4 4 0 0 1 0 4" /></svg>
    )
    case 'flights': return (
      <svg {...s}><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" /></svg>
    )
    case 'ships': return (
      <svg {...s}><path d="M2 20a3 3 0 0 0 4 0 3 3 0 0 1 4 0 3 3 0 0 0 4 0 3 3 0 0 1 4 0 3 3 0 0 0 4 0" /><path d="M4 18l-1-5h18l-1 5" /><path d="M12 2v7" /><path d="M7 9h10" /></svg>
    )
    case 'rockets': return (
      <svg {...s}><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /></svg>
    )
    case 'asteroids': return (
      <svg {...s}><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
    )
    default: return null
  }
}

function MobileFilterRow({ activeFilter, onFiltersChange, onCameraScale, onActiveFilterChange, onLaunchPanelToggle,
  liveEnabled, onLiveToggle, onSearchOpen, audioMuted, onAudioToggle, connectionStatus,
}) {
  function handle(e, cat) {
    e.stopPropagation()
    const deselect = (activeFilter ?? 'all') === cat.id
    onFiltersChange?.({ type: deselect ? 'all' : cat.type, altitude: 'all' })
    onCameraScale?.(deselect ? 'earth' : cat.scale)
    onActiveFilterChange?.(deselect ? null : cat.id)
    if (cat.id === 'rockets') onLaunchPanelToggle?.()
  }
  const isConnecting = connectionStatus === 'connecting'
  return null   // old mobile icon strip removed — filters live in the top-bar funnel
  // eslint-disable-next-line no-unreachable
  return (
    <div className={styles.filterIconStrip}>
      {MOBILE_FILTERS.map(cat => (
        <button
          key={cat.id}
          className={`${styles.filterIconBtn} ${(activeFilter ?? 'all') === cat.id ? styles.filterIconBtnOn : ''}`}
          onClick={(e) => handle(e, cat)}
          aria-label={cat.label}
        >
          <MobileFilterIcon id={cat.id} />
        </button>
      ))}

      <span className={styles.filterIconSep} />

      {/* LIVE toggle */}
      <button
        className={`${styles.filterIconBtn} ${styles.filterActionBtn} ${liveEnabled ? styles.filterIconBtnLive : styles.filterIconBtnLiveOff}`}
        onClick={(e) => { e.stopPropagation(); onLiveToggle?.() }}
        aria-label={liveEnabled ? 'Disable live' : 'Enable live'}
        data-haptic-heavy
      >
        <span className={`${styles.liveDotMobile} ${liveEnabled ? styles.liveDotMobileOn : ''} ${isConnecting ? styles.liveDotMobileConnecting : ''}`} />
      </button>

      {/* Search */}
      <button
        className={`${styles.filterIconBtn} ${styles.filterActionBtn}`}
        onClick={(e) => { e.stopPropagation(); onSearchOpen?.() }}
        aria-label="Search"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
        </svg>
      </button>

      {/* Audio */}
      <button
        className={`${styles.filterIconBtn} ${styles.filterActionBtn} ${!audioMuted ? styles.filterIconBtnOn : ''}`}
        onClick={(e) => { e.stopPropagation(); onAudioToggle?.() }}
        aria-label={audioMuted ? 'Unmute' : 'Mute'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          {audioMuted ? (
            <><path d="M11 5L6 9H2v6h4l5 4V5z" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></>
          ) : (
            <><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></>
          )}
        </svg>
      </button>
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
  { id: 'iss',      label: 'ISS Tracker',       icon: 'satellite_alt', color: '#38bdf8' },
  { id: 'apod',     label: 'Astronomy Picture', icon: 'photo_camera',  color: '#e2e8f0' },
  { id: 'solar',    label: 'Solar Activity',    icon: 'wb_sunny',      color: '#fbbf24' },
  { id: 'meteors',  label: 'Meteor Showers',    icon: 'star_rate',     color: '#a78bfa' },
  { id: 'news',     label: 'Space News',        icon: 'article',       color: '#60a5fa' },
  { id: 'nightsky', label: 'Night Sky',         icon: 'nights_stay',   color: '#818cf8' },
  { id: 'quote',    label: 'Daily Quote',       icon: 'format_quote',  color: '#fbbf24' },
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
              <div className={styles.newsExpandedThumb} style={{ backgroundImage: `url(${item.image_url?.replace(/^http:\/\//, 'https://')})` }} />
            )}
            <div className={styles.newsExpandedBody}>
              <span className={styles.newsExpandedSource}>{item.news_site}</span>
              <p className={styles.newsExpandedTitle}>{item.title}</p>
              {item.summary && <p className={styles.newsExpandedSummary}>{item.summary}</p>}
              <p className={styles.newsExpandedAge}>{timeAgo(item.published_at)}</p>
            </div>
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'rgba(163,230,53,0.35)', flexShrink: 0, marginTop: 2 }}>open_in_new</span>
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
        style={hero.image_url ? { backgroundImage: `url(${hero.image_url?.replace(/^http:\/\//, 'https://')})` } : undefined}
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
          Planetary Visibility · {new Date().getFullYear()} · unaided unless noted
        </p>
        <div className={styles.planetsExpandedTable}>
          <div className={styles.planetsExpandedHead}>
            <span>Planet</span><span>Sky</span><span>Mag</span><span>Visibility</span>
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
              <span>{p.naked ? <span className={styles.planetUnaided}>Unaided</span> : <span className={styles.planetBino}>Optical</span>}</span>
            </div>
          ))}
        </div>
        <p className={styles.expandedFootnote}>Magnitude: lower = brighter · −4 (Venus) very bright · +6 unaided limit · +8 binoculars · +13 telescope</p>
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
          Planets · approx {new Date().getFullYear()} · unaided unless noted
        </p>
        <div className={styles.planetsGrid}>
          {PLANETS.map(p => (
            <div key={p.name} className={styles.planetRow}>
              <img src={p.img} alt={p.name} className={styles.planetImg} />
              <span className={styles.planetName}>{p.name}</span>
              <span className={styles.planetSky}>{p.sky}</span>
              {!p.naked && <span className={styles.planetBino}>Optical</span>}
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

// ── Space Feed — vertical scrollable card feed ────────────────────────────

// ── Space Feed — vertical scrollable card feed ────────────────────────────
function SpaceFeed({ apod, kp, kpHistory, showers, news, quote, pinnedLaunch, onUnpinLaunch, issData, onISSLink, trackedFlights = [] }) {
  const [toast, setToast]       = useState(null)
  const [copied, setCopied]     = useState(false)
  const [expanded, setExpanded] = useState(null) // null | 'iss'|'solar'|'news'|'meteors'|'apod'|'nightsky'|'quote'|'flights'

  const hasISS    = issData != null
  const issLat    = issData?.lat
  const issLon    = issData?.lon
  const issAlt    = issData?.alt_km ?? 408
  const issLatStr = issLat != null ? `${Math.abs(issLat).toFixed(2)}° ${issLat >= 0 ? 'N' : 'S'}` : '—'
  const issLonStr = issLon != null ? `${Math.abs(issLon).toFixed(2)}° ${issLon >= 0 ? 'E' : 'W'}` : '—'
  const region    = geoRegion(issLat, issLon)

  const level      = kp == null ? null : kp >= 5 ? 'STORM' : kp >= 4 ? 'ACTIVE' : 'NOMINAL'
  const solarColor = level === 'STORM' ? '#ff6b35' : level === 'ACTIVE' ? '#ffd700' : '#fbbf24'

  const sh = showers[0]
  const [heroNews, ...moreNews] = news.slice(0, 4)

  const copyQuote = (q) => {
    navigator.clipboard?.writeText(`"${q.q}" — ${q.a}`).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  // ── Expanded detail panel — fills entire feed area ───────────────────────
  if (expanded) {
    return (
      <div className={styles.feedExpanded}>
        <button className={styles.feedExpandBack} onClick={() => setExpanded(null)}>
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>arrow_back_ios</span>
          Back
        </button>

        <div className={styles.feedExpandScroll}>

          {/* ISS detail */}
          {expanded === 'iss' && <>
            <p className={styles.feedExpandTitle} style={{ color: '#3A9AFF' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15, verticalAlign: 'middle', marginRight: 6 }}>satellite_alt</span>
              International Space Station
            </p>
            <div className={styles.feedISSMetrics} style={{ marginBottom: 12 }}>
              {[
                { num: issLatStr,          unit: '',    label: 'Latitude'  },
                { num: issLonStr,          unit: '',    label: 'Longitude' },
                { num: issAlt.toFixed(0),  unit: 'km',  label: 'Altitude'  },
                { num: '27.6K',            unit: 'km/h',label: 'Velocity'  },
              ].map(c => (
                <div key={c.label} className={styles.feedMetric}>
                  <span className={styles.feedMetricNum} style={{ color: '#3A9AFF', fontSize: 15 }}>{c.num}</span>
                  {c.unit && <span className={styles.feedMetricUnit}>{c.unit}</span>}
                  <span className={styles.feedMetricLabel}>{c.label}</span>
                </div>
              ))}
            </div>
            <p className={styles.feedISSLocation} style={{ marginBottom: 14 }}>
              {hasISS ? `Over ${region} · Orbiting at 27,600 km/h` : 'Awaiting signal…'}
            </p>
            <p className={styles.feedExpandSectionLabel}>Orbital Parameters</p>
            <div className={styles.feedOrbitalGrid}>
              {ISS_ORBITAL.map(p => (
                <div key={p.label} className={styles.feedOrbitalCell}>
                  <span className={styles.feedOrbitalLabel}>{p.label}</span>
                  <span className={styles.feedOrbitalValue}>{p.value}</span>
                </div>
              ))}
            </div>
            <button
              className={styles.feedLinkBtn}
              style={{ marginTop: 14 }}
              onClick={() => {
                onISSLink?.selectISS(); onISSLink?.trackISS()
                if (hasISS) { onISSLink?.flyTo(issLat, issLon); setToast('Locked on ISS'); setTimeout(() => setToast(null), 2200) }
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 11 }}>wifi_tethering</span>
              Link to ISS
            </button>
            {toast && <p className={styles.feedToast}>{toast}</p>}
            <button className={styles.feedOutLink} onClick={() => openTab('https://spotthestation.nasa.gov/')}>
              <span className="material-symbols-outlined" style={{ fontSize: 11 }}>open_in_new</span>
              Spot the Station · NASA
            </button>
          </>}

          {/* Solar detail */}
          {expanded === 'solar' && <>
            <p className={styles.feedExpandTitle} style={{ color: solarColor }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15, verticalAlign: 'middle', marginRight: 6 }}>wb_sunny</span>
              Solar Activity
            </p>
            <div className={styles.feedSolarRow} style={{ marginBottom: 14 }}>
              <div>
                <span className={styles.feedSolarKp} style={{ color: solarColor, fontSize: 48 }}>
                  {kp != null ? kp.toFixed(1) : '—'}
                </span>
                <span className={styles.feedSolarKpLabel}>Planetary Kp Index</span>
              </div>
              {kpHistory.length > 0 && (
                <div className={styles.feedKpMini} style={{ height: 56 }}>
                  {kpHistory.map((r, i) => (
                    <div key={i} className={styles.feedKpBar} style={{
                      height: `${Math.max(10, (r.kp / 9) * 100)}%`,
                      background: r.kp >= 5 ? '#ff6b35' : r.kp >= 4 ? '#ffd700' : '#fbbf24',
                      opacity: 0.4 + (i / kpHistory.length) * 0.6,
                    }} />
                  ))}
                </div>
              )}
            </div>
            {kp != null && (
              <div className={styles.feedExpandInfoBox} style={{ borderColor: `${solarColor}30`, background: `${solarColor}0e` }}>
                <p style={{ color: solarColor, fontWeight: 700, fontSize: 13, marginBottom: 5, fontFamily: 'system-ui' }}>{level}</p>
                <p style={{ color: '#DCDCDC', fontSize: 11, lineHeight: 1.55, fontFamily: 'system-ui' }}>
                  {level === 'STORM'
                    ? 'Geomagnetic storm in progress. Aurora visible at mid-latitudes.'
                    : level === 'ACTIVE'
                    ? 'Elevated solar activity. Aurora possible at high latitudes.'
                    : 'Solar activity nominal. No significant disturbances.'}
                </p>
                <p style={{ color: 'rgba(220,220,220,0.45)', fontSize: 10, marginTop: 6, fontFamily: 'system-ui' }}>
                  Aurora equatorward of {Math.max(30, 66.5 - kp * 2.5).toFixed(0)}° latitude
                </p>
              </div>
            )}
            <p className={styles.feedExpandSectionLabel} style={{ marginTop: 14 }}>Solar Cycle 25 · Near Maximum</p>
            <p style={{ color: 'rgba(220,220,220,0.5)', fontSize: 10, lineHeight: 1.65, fontFamily: 'system-ui' }}>
              Cycle 25 began Dec 2019. Solar maximum expected 2025–2026 — prime time for aurora observation and solar imaging. The Sun's 11-year activity cycle drives geomagnetic storms and HF radio blackouts.
            </p>
            <button className={styles.feedOutLink} onClick={() => openTab('https://www.swpc.noaa.gov/')}>
              <span className="material-symbols-outlined" style={{ fontSize: 11 }}>open_in_new</span>
              NOAA Space Weather Center
            </button>
          </>}

          {/* News detail */}
          {expanded === 'news' && <>
            <p className={styles.feedExpandTitle} style={{ color: '#4C8CE4' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15, verticalAlign: 'middle', marginRight: 6 }}>article</span>
              Space News · {news.length} stories
            </p>
            {news.map(item => (
              <div key={item.id} className={styles.feedExpandNewsRow} onClick={() => item.url && openTab(item.url)}>
                {item.image_url && (
                  <div className={styles.feedExpandNewsThumb} style={{ backgroundImage: `url(${item.image_url.replace(/^http:\/\//, 'https://')})` }} />
                )}
                <div className={styles.feedExpandNewsBody}>
                  <span className={styles.feedNewsSource}>{item.news_site}</span>
                  <p className={styles.feedNewsRowTitle}>{item.title}</p>
                  <p className={styles.feedNewsAge}>{timeAgo(item.published_at)}</p>
                </div>
              </div>
            ))}
          </>}

          {/* Meteors detail */}
          {expanded === 'meteors' && <>
            <p className={styles.feedExpandTitle} style={{ color: '#a78bfa' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15, verticalAlign: 'middle', marginRight: 6 }}>star_rate</span>
              Meteor Shower Calendar
            </p>
            {nextShowers(9).map(s => (
              <div key={s.name} className={styles.feedExpandMeteorCard} onClick={() => openTab(s.url)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                  <p className={styles.feedMeteorName} style={{ fontSize: 14, marginBottom: 0 }}>{s.name}</p>
                  <p style={{ color: '#a78bfa', fontWeight: 700, fontSize: 13, fontFamily: 'system-ui', flexShrink: 0 }}>
                    {s.zhr} <span style={{ fontWeight: 400, fontSize: 9, opacity: 0.6 }}>ZHR</span>
                  </p>
                </div>
                <p className={styles.feedMeteorSub} style={{ marginBottom: 7 }}>Peak {fmtPeakNight(s.date)} · Moon {s.illum}% · {fmtRange(s.active)}</p>
                <div className={styles.feedMeteorBar}>
                  <div className={styles.feedMeteorFill} style={{ width: `${Math.min(100, (s.zhr / 150) * 100)}%` }} />
                </div>
              </div>
            ))}
            <p style={{ color: 'rgba(220,220,220,0.28)', fontSize: 9, marginTop: 10, fontFamily: 'system-ui', lineHeight: 1.5 }}>
              ZHR = Zenithal Hourly Rate under ideal conditions
            </p>
          </>}

          {/* APOD detail */}
          {expanded === 'apod' && apod && <>
            <p className={styles.feedExpandTitle}>
              <span className="material-symbols-outlined" style={{ fontSize: 15, verticalAlign: 'middle', marginRight: 6 }}>photo_camera</span>
              Astronomy Picture of the Day
            </p>
            {apod.url && (
              <div
                className={styles.feedApodImg}
                style={{ backgroundImage: `url(${apod.url})`, height: 200, cursor: 'pointer', marginBottom: 12 }}
                onClick={() => openTab(apod.hdurl || apod.url)}
              />
            )}
            <p style={{ color: '#F3F2EC', fontWeight: 700, fontSize: 14, lineHeight: 1.4, fontFamily: 'system-ui', marginBottom: 5 }}>{apod.title}</p>
            {apod.copyright && <p style={{ color: 'rgba(220,220,220,0.4)', fontSize: 10, fontFamily: 'system-ui', marginBottom: 10 }}>© {apod.copyright.trim().replace(/\n/g, ' ')}</p>}
            {apod.explanation && <p style={{ color: 'rgba(220,220,220,0.6)', fontSize: 11, lineHeight: 1.65, fontFamily: 'system-ui' }}>{apod.explanation}</p>}
            <button className={styles.feedOutLink} style={{ marginTop: 12 }} onClick={() => openTab(apod.hdurl || apod.url)}>
              <span className="material-symbols-outlined" style={{ fontSize: 11 }}>open_in_new</span>
              Full resolution · NASA APOD
            </button>
          </>}

          {/* Night Sky detail */}
          {expanded === 'nightsky' && <>
            <p className={styles.feedExpandTitle} style={{ color: '#818cf8' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15, verticalAlign: 'middle', marginRight: 6 }}>nights_stay</span>
              Night Sky
            </p>
            <p className={styles.feedExpandSectionLabel}>Planetary Visibility · {new Date().getFullYear()}</p>
            {PLANETS.map(p => (
              <div key={p.name} className={styles.feedExpandPlanetRow}>
                <img src={p.img} alt={p.name} className={styles.feedPlanetImg} style={{ width: 32, height: 32 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ color: '#F3F2EC', fontSize: 12, fontWeight: 600, fontFamily: 'system-ui', marginBottom: 2 }}>{p.name}</p>
                  <p style={{ color: '#DCDCDC', fontSize: 9, fontFamily: 'system-ui', opacity: 0.5 }}>{p.sky} sky · {p.naked ? 'Unaided eye' : 'Optical'}</p>
                </div>
                <span style={{ color: p.color, fontWeight: 700, fontSize: 13, fontFamily: 'system-ui' }}>{p.mag > 0 ? '+' : ''}{p.mag.toFixed(1)}</span>
              </div>
            ))}
            <p className={styles.feedExpandSectionLabel} style={{ marginTop: 16 }}>Active Comets · {COMETS.length} tracked</p>
            {COMETS.map(c => (
              <div key={c.name} className={styles.feedExpandCometCard}>
                <p style={{ color: '#818cf8', fontWeight: 600, fontSize: 12, marginBottom: 3, fontFamily: 'system-ui' }}>{c.name}</p>
                <p style={{ color: 'rgba(220,220,220,0.5)', fontSize: 10, lineHeight: 1.5, fontFamily: 'system-ui' }}>{c.desc}</p>
                <p style={{ color: 'rgba(129,140,248,0.45)', fontSize: 9, marginTop: 4, fontFamily: 'system-ui' }}>
                  {c.currentMag}{c.nextReturn ? ` · Returns ${c.nextReturn}` : ''}
                </p>
              </div>
            ))}
          </>}

          {/* Quote detail */}
          {expanded === 'quote' && <>
            <p className={styles.feedExpandTitle} style={{ color: '#fbbf24' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15, verticalAlign: 'middle', marginRight: 6 }}>format_quote</span>
              Science Quotes
            </p>
            {QUOTES.map((q, i) => (
              <div key={i} className={styles.feedExpandQuoteCard} onClick={() => copyQuote(q)}>
                <p className={styles.feedQuoteMark} style={{ fontSize: 36, marginBottom: 4 }}>"</p>
                <p className={styles.feedQuoteText}>{q.q}</p>
                <p className={styles.feedQuoteAuthor}>— {q.a}{q.t ? `, ${q.t}` : ''}</p>
              </div>
            ))}
            {copied && <p className={styles.feedToast}>Copied!</p>}
          </>}

          {/* Flights detail */}
          {expanded === 'flights' && <>
            <p className={styles.feedExpandTitle} style={{ color: '#2DD4BF' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15, verticalAlign: 'middle', marginRight: 6 }}>airplanemode_active</span>
              Tracked Flights
            </p>
            {trackedFlights.length === 0 ? (
              <div className={styles.feedExpandEmpty}>
                <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'rgba(220,220,220,0.18)' }}>flight_takeoff</span>
                <p style={{ color: 'rgba(220,220,220,0.38)', fontSize: 11, marginTop: 10, fontFamily: 'system-ui', textAlign: 'center', lineHeight: 1.6 }}>
                  No tracked flights yet.<br />Tap a plane on the globe to track it.
                </p>
              </div>
            ) : trackedFlights.map(f => (
              <div key={f.icao24} className={styles.feedExpandFlightRow}>
                <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#2DD4BF' }}>flight</span>
                <div style={{ flex: 1 }}>
                  <p style={{ color: '#F3F2EC', fontWeight: 600, fontSize: 13, fontFamily: 'system-ui', marginBottom: 2 }}>{f.callsign || f.icao24}</p>
                  <p style={{ color: 'rgba(220,220,220,0.42)', fontSize: 10, fontFamily: 'system-ui' }}>{f.icao24}{f.label ? ` · ${f.label}` : ''}</p>
                </div>
              </div>
            ))}
          </>}

        </div>
      </div>
    )
  }

  // ── Feed card list ────────────────────────────────────────────────────────
  return (
    <div className={styles.feedScroll}>
      {pinnedLaunch && <PinnedCountdown launch={pinnedLaunch} onUnpin={onUnpinLaunch} />}

      {/* ── ISS Card ── */}
      <div className={`${styles.feedCard} ${styles.feedCardBlue}`} onClick={() => setExpanded('iss')}>
        <div className={styles.feedHead}>
          <div className={styles.feedHeadLeft}>
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#3A9AFF' }}>satellite_alt</span>
            <span className={styles.feedLabel}>ISS Tracker</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {hasISS && <span className={`${styles.feedBadge} ${styles.feedBadgeLive}`}>LIVE</span>}
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'rgba(220,220,220,0.22)' }}>chevron_right</span>
          </div>
        </div>
        <div className={styles.feedISSMetrics}>
          <div className={styles.feedMetric}>
            <span className={styles.feedMetricNum}>27.6K</span>
            <span className={styles.feedMetricUnit}>km/h</span>
            <span className={styles.feedMetricLabel}>Velocity</span>
          </div>
          <div className={styles.feedMetric}>
            <span className={styles.feedMetricNum}>{issAlt.toFixed(0)}</span>
            <span className={styles.feedMetricUnit}>km</span>
            <span className={styles.feedMetricLabel}>Altitude</span>
          </div>
          <div className={styles.feedMetric}>
            <span className={styles.feedMetricNum}>{issData?.crew ?? '—'}</span>
            <span className={styles.feedMetricUnit}>aboard</span>
            <span className={styles.feedMetricLabel}>Crew</span>
          </div>
        </div>
        <p className={styles.feedISSLocation}>
          {hasISS ? `${issLatStr}, ${issLonStr} · ${region}` : 'Awaiting signal…'}
        </p>
      </div>

      {/* ── Tracked Flights Card ── */}
      <div className={`${styles.feedCard} ${styles.feedCardTeal}`} onClick={() => setExpanded('flights')}>
        <div className={styles.feedHead}>
          <div className={styles.feedHeadLeft}>
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#2DD4BF' }}>airplanemode_active</span>
            <span className={styles.feedLabel}>Tracked Flights</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={styles.feedBadge}>{trackedFlights.length} tracked</span>
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'rgba(220,220,220,0.22)' }}>chevron_right</span>
          </div>
        </div>
        {trackedFlights.length === 0 ? (
          <p className={styles.feedEmptyNote}>No tracked flights · tap a plane on the globe</p>
        ) : (
          <div className={styles.feedFlightList}>
            {trackedFlights.slice(0, 3).map(f => (
              <div key={f.icao24} className={styles.feedFlightRow}>
                <span className="material-symbols-outlined" style={{ fontSize: 11, color: '#2DD4BF' }}>flight</span>
                <span className={styles.feedFlightCall}>{f.callsign || f.icao24}</span>
                <span className={styles.feedFlightIcao}>{f.icao24}</span>
              </div>
            ))}
            {trackedFlights.length > 3 && (
              <p className={styles.feedFlightMore}>+{trackedFlights.length - 3} more</p>
            )}
          </div>
        )}
      </div>

      {/* ── Space News Card ── */}
      {heroNews && (
        <div className={`${styles.feedCard} ${styles.feedCardSteel}`} onClick={() => setExpanded('news')}>
          <div className={styles.feedHead}>
            <div className={styles.feedHeadLeft}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#4C8CE4' }}>article</span>
              <span className={styles.feedLabel}>Space News</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className={styles.feedBadge}>{news.length} stories</span>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'rgba(220,220,220,0.22)' }}>chevron_right</span>
            </div>
          </div>
          {heroNews.image_url && (
            <div className={styles.feedNewsHero} style={{ backgroundImage: `url(${heroNews.image_url.replace(/^http:\/\//, 'https://')})` }} />
          )}
          <div className={styles.feedNewsHeroBody}>
            <span className={styles.feedNewsSource}>{heroNews.news_site}</span>
            <p className={styles.feedNewsTitle}>{heroNews.title}</p>
            <p className={styles.feedNewsAge}>{timeAgo(heroNews.published_at)}</p>
          </div>
          {moreNews.slice(0, 2).map(item => (
            <div key={item.id}>
              <div className={styles.feedNewsDivider} />
              <div className={styles.feedNewsRow}>
                <p className={styles.feedNewsRowTitle}>{item.title}</p>
                <p className={styles.feedNewsRowMeta}>{item.news_site} · {timeAgo(item.published_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Solar Activity Card ── */}
      <div className={`${styles.feedCard} ${styles.feedCardAmber}`} onClick={() => setExpanded('solar')}>
        <div className={styles.feedHead}>
          <div className={styles.feedHeadLeft}>
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#fbbf24' }}>wb_sunny</span>
            <span className={styles.feedLabel}>Solar Activity</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={styles.feedBadge} style={level ? { color: solarColor, borderColor: `${solarColor}33`, background: `${solarColor}18` } : undefined}>
              {level ?? 'Loading'}
            </span>
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'rgba(220,220,220,0.22)' }}>chevron_right</span>
          </div>
        </div>
        <div className={styles.feedSolarRow}>
          <div>
            <span className={styles.feedSolarKp} style={{ color: solarColor }}>{kp != null ? kp.toFixed(1) : '—'}</span>
            <span className={styles.feedSolarKpLabel}>Kp Index</span>
          </div>
          {kpHistory.length > 0 && (
            <div className={styles.feedKpMini}>
              {kpHistory.slice(-16).map((r, i) => (
                <div key={i} className={styles.feedKpBar} style={{
                  height: `${Math.max(10, (r.kp / 9) * 100)}%`,
                  background: r.kp >= 5 ? '#ff6b35' : r.kp >= 4 ? '#ffd700' : '#fbbf24',
                  opacity: 0.5 + (i / 16) * 0.5,
                }} />
              ))}
            </div>
          )}
        </div>
        {kp != null && <p className={styles.feedSolarDesc}>Aurora equatorward of {Math.max(30, 66.5 - kp * 2.5).toFixed(0)}° latitude</p>}
      </div>

      {/* ── Meteor Showers Card ── */}
      {sh && (
        <div className={`${styles.feedCard} ${styles.feedCardViolet}`} onClick={() => setExpanded('meteors')}>
          <div className={styles.feedHead}>
            <div className={styles.feedHeadLeft}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#a78bfa' }}>star_rate</span>
              <span className={styles.feedLabel}>Meteor Showers</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className={styles.feedBadge} style={{ color: '#a78bfa', borderColor: '#a78bfa33', background: '#a78bfa18' }}>
                {sh.daysAway === 0 ? 'Tonight' : `${sh.daysAway}d away`}
              </span>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'rgba(220,220,220,0.22)' }}>chevron_right</span>
            </div>
          </div>
          <p className={styles.feedMeteorName}>{sh.name}</p>
          <p className={styles.feedMeteorSub}>Peak {fmtPeakNight(sh.date)} · {sh.zhr} ZHR · Moon {sh.illum}%</p>
          <div className={styles.feedMeteorBar}>
            <div className={styles.feedMeteorFill} style={{ width: `${Math.min(100, (sh.zhr / 150) * 100)}%` }} />
          </div>
        </div>
      )}

      {/* ── APOD Card ── */}
      {apod && (
        <div className={`${styles.feedCard} ${styles.feedCardAPOD}`} onClick={() => setExpanded('apod')}>
          <div className={styles.feedHead}>
            <div className={styles.feedHeadLeft}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#e2e8f0' }}>photo_camera</span>
              <span className={styles.feedLabel}>Picture of the Day</span>
            </div>
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'rgba(220,220,220,0.22)' }}>chevron_right</span>
          </div>
          {apod.url && <div className={styles.feedApodImg} style={{ backgroundImage: `url(${apod.url})` }} />}
          <p className={styles.feedApodTitle}>{apod.title}</p>
          {apod.copyright && <p className={styles.feedApodCredit}>© {apod.copyright.trim().replace(/\n/g, ' ')}</p>}
        </div>
      )}

      {/* ── Night Sky Card ── */}
      <div className={`${styles.feedCard} ${styles.feedCardIndigo}`} onClick={() => setExpanded('nightsky')}>
        <div className={styles.feedHead}>
          <div className={styles.feedHeadLeft}>
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#818cf8' }}>nights_stay</span>
            <span className={styles.feedLabel}>Night Sky</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={styles.feedBadge} style={{ color: '#818cf8', borderColor: '#818cf833', background: '#818cf818' }}>
              {COMETS.length} comets
            </span>
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'rgba(220,220,220,0.22)' }}>chevron_right</span>
          </div>
        </div>
        <div className={styles.feedPlanetsRow}>
          {PLANETS.map(p => (
            <div key={p.name} className={styles.feedPlanetCell}>
              <img src={p.img} alt={p.name} className={styles.feedPlanetImg} />
              <span className={styles.feedPlanetName}>{p.name}</span>
              <span className={styles.feedPlanetMag} style={{ color: p.color }}>{p.mag > 0 ? '+' : ''}{p.mag.toFixed(1)}</span>
            </div>
          ))}
        </div>
        <p className={styles.feedCometNote}>
          <span className="material-symbols-outlined" style={{ fontSize: 10, color: 'rgba(129,140,248,0.6)', marginRight: 4 }}>blur_circular</span>
          {COMETS[0].name} · {COMETS[0].currentMag}
        </p>
      </div>

      {/* ── Daily Quote Card ── */}
      {quote && (
        <div className={`${styles.feedCard} ${styles.feedCardQuote}`} onClick={() => setExpanded('quote')}>
          <div className={styles.feedHead}>
            <div className={styles.feedHeadLeft}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#fbbf24' }}>format_quote</span>
              <span className={styles.feedLabel}>Daily Inspiration</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className={styles.feedBadge}>{copied ? 'Copied!' : 'Tap to copy'}</span>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'rgba(220,220,220,0.22)' }}>chevron_right</span>
            </div>
          </div>
          <p className={styles.feedQuoteMark}>"</p>
          <p className={styles.feedQuoteText}>{quote.q}</p>
          <p className={styles.feedQuoteAuthor}>— {quote.a}{quote.t ? `, ${quote.t}` : ''}</p>
        </div>
      )}
    </div>
  )
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
  trackedCount, connectionStatus, issData, onISSLink, pinnedLaunch, onUnpinLaunch, forceCollapsed, trackedFlights = [],
  activeFilter, onFiltersChange, onCameraScale, onActiveFilterChange, onLaunchPanelToggle, zoomedIn, hidden,
  activeScale, onDistanceChange,
  liveEnabled, onLiveToggle, onSearchOpen, audioMuted, onAudioToggle,
  onSheetChange, mobileOpen, onClose,
}) {
  const isMobileVp = typeof window !== 'undefined' && window.innerWidth < 768
  if (isMobileVp && !mobileOpen) return null   // feed opens only via the top-bar icon on mobile
  const isLive  = connectionStatus === 'connected'
  const { news } = useSpaceNews()
  const solarKp  = useSolarKp()
  const kpHistory = useSolarKpHistory()
  const apod     = useApod()
  const showers  = nextShowers(4)
  const quote    = dailyQuote()

  // ── Mobile bottom sheet — 3-state: 'peek' | 'half' | 'full' ─────────────
  const [sheetState, setSheetState] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 768) ? 'full' : 'peek')
  const streamRef = useRef(null)
  const [desktopOpen, setDesktopOpen] = useState('open') // 'collapsed' | 'open' | 'wide'
  const userToggledFeedRef = useRef(false)

  // Desktop: auto-collapse the feed after 10s so it gets out of the way. The
  // collapsed pull-tab then shows a gradient border + pull animation hinting it
  // can be reopened. Skipped if the user opens/collapses it manually first.
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth < 768) return
    const t = setTimeout(() => {
      if (!userToggledFeedRef.current) setDesktopOpen('collapsed')
    }, 10000)
    return () => clearTimeout(t)
  }, [])
  const heroSeenRef = useRef(false)
  const [heroCollapsed, setHeroCollapsed] = useState(() => {
    if (sessionStorage.getItem('fs.hero.seen')) { heroSeenRef.current = true; return true }
    setTimeout(() => { sessionStorage.setItem('fs.hero.seen', '1'); heroSeenRef.current = true; setHeroCollapsed(true) }, 5000)
    return false
  })

  // Globe interaction / landing pages → dock the feed out of the way
  // (mobile: sheet to peek; desktop: collapse to the pull-tab)
  useEffect(() => {
    if (forceCollapsed) { setSheetState('peek'); setDesktopOpen('collapsed') }
  }, [forceCollapsed])

  // Auto-dock stream + collapse hero when zoomed in close to Earth
  useEffect(() => {
    if (zoomedIn) {
      setDesktopOpen('collapsed')
      setSheetState('peek')
      setHeroCollapsed(true)
    } else {
      setDesktopOpen('open')
      if (!heroSeenRef.current) setHeroCollapsed(false)
    }
  }, [zoomedIn])
  const grabRef       = useRef(null)
  const sheetStateRef = useRef(sheetState)
  useEffect(() => { sheetStateRef.current = sheetState }, [sheetState])
  // Surface the mobile sheet state so App can dim bottom-left UI beneath it
  useEffect(() => { onSheetChange?.(sheetState) }, [sheetState, onSheetChange])

  const PEEK_H = 80  // px visible in peek: grab bar + filter row

  // Native touch listeners so we can call preventDefault on touchmove
  // and track the gesture even when the finger slides off the grab bar.
  useEffect(() => {
    const grab = grabRef.current
    if (!grab) return

    // Fluid drag: the sheet tracks the finger across the WHOLE range from any
    // state, then snaps to the nearest of peek/half/full by position — with a
    // velocity flick, so one gesture can go peek→full. (Was single-step: each
    // drag advanced one state, so opening fully took several drags.)
    const drag = { startY: 0, baseY: 0, dragging: false, vy: 0, lastY: 0, lastT: 0 }
    const snapY = (state, h) =>
      state === 'full' ? 0 : state === 'half' ? h - Math.round(window.innerHeight * 0.52) : h - PEEK_H

    const onStart = (e) => {
      if (!streamRef.current) return
      clearTimeout(drag.clearT)
      drag.startY   = e.touches[0].clientY
      drag.baseY    = snapY(sheetStateRef.current, streamRef.current.clientHeight)
      drag.lastY    = drag.startY
      drag.lastT    = e.timeStamp
      drag.vy       = 0
      drag.dragging = true
      streamRef.current.style.transition = 'none'
    }

    const onMove = (e) => {
      if (!drag.dragging || !streamRef.current) return
      e.preventDefault()   // stop browser scroll fighting the drag
      const y  = e.touches[0].clientY
      const h  = streamRef.current.clientHeight
      const ty = Math.max(0, Math.min(h - PEEK_H, drag.baseY + (y - drag.startY)))
      streamRef.current.style.transform = `translateY(${ty}px)`
      const dt = e.timeStamp - drag.lastT
      if (dt > 0) drag.vy = (y - drag.lastY) / dt   // px/ms, + = downward
      drag.lastY = y
      drag.lastT = e.timeStamp
    }

    const onEnd = (e) => {
      if (!drag.dragging) return
      drag.dragging = false
      const el = streamRef.current
      if (!el) return
      const h     = el.clientHeight
      const halfY = h - Math.round(window.innerHeight * 0.52)
      const peekY = h - PEEK_H
      const ty    = Math.max(0, Math.min(peekY, drag.baseY + (e.changedTouches[0].clientY - drag.startY)))
      const v     = drag.vy
      let target
      if (v < -0.5) target = 'full'        // fast flick up
      else if (v > 0.5) target = 'peek'    // fast flick down
      else {
        const opts = [['full', 0], ['half', halfY], ['peek', peekY]]
        target = opts.reduce((b, c) => Math.abs(c[1] - ty) < Math.abs(b[1] - ty) ? c : b)[0]
      }
      // Animate from the drag position to the target, then hand back to the class
      el.style.transition = ''
      el.style.transform  = `translateY(${target === 'full' ? 0 : target === 'half' ? halfY : peekY}px)`
      setSheetState(target)
      drag.clearT = setTimeout(() => {
        if (streamRef.current && !drag.dragging) streamRef.current.style.transform = ''
      }, 460)
    }

    grab.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      grab.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
  }, [])

  // expanded kept for potential future use
  // const expanded = sheetState === 'full' || desktopOpen === 'wide'


  return (
    // visibility (not display) — display:none→block restarts every CSS
    // animation inside, replaying feedSlideIn and flashing the collapsed
    // Space Feed open each time a panel (e.g. aircraft card) closes
    <div className={`${styles.overlay} ${isMobileVp ? styles.mobileFeed : ''}`} style={hidden ? { visibility: 'hidden' } : undefined}>
      {isMobileVp && (
        <button className={styles.feedClose} onClick={() => onClose?.()} aria-label="Close space feed">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      )}
      {/* Background SVG grid — hidden when zoomed in */}
      <div className={`${styles.gridBg} ${zoomedIn ? styles.heroHidden : ''}`}>
        <svg className={styles.gridSvg}>
          <defs>
            <pattern id="cc-grid" width="100" height="100" patternUnits="userSpaceOnUse">
              <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#a3e635" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#cc-grid)" />
        </svg>
        <div className={styles.radialGlow} />
      </div>

      {/* Left hero section — collapsible, fully hidden when zoomed in */}
      {heroCollapsed && !zoomedIn && (
        <button
          className={styles.heroDock}
          onClick={() => setHeroCollapsed(false)}
          title="Show Observer panel"
          aria-label="Expand Observer panel"
        >
          <span className={`${styles.dot} ${isLive ? styles.dotLive : styles.dotOff}`} />
          <span className={styles.heroDockLabel}>Observer</span>
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'rgba(163,230,53,0.55)' }}>
            expand_less
          </span>
        </button>
      )}

      <div className={`${styles.hero} ${heroCollapsed || zoomedIn ? styles.heroHidden : ''}`}>
        <button
          className={styles.heroCollapseBtn}
          onClick={() => setHeroCollapsed(true)}
          title="Collapse Observer panel"
          aria-label="Collapse Observer panel"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>expand_more</span>
        </button>

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
          desktopOpen === 'collapsed' ? styles.streamDesktopCollapsed : '',
          desktopOpen === 'wide'      ? styles.streamDesktopWide : '',
        ].filter(Boolean).join(' ')}
        data-tour="signal-stream"
      >
        {/* Desktop: vertical tab — always visible, even when panel collapsed */}
        <div
          className={styles.desktopTab}
          onClick={() => { userToggledFeedRef.current = true; setDesktopOpen(d => d === 'collapsed' ? 'open' : 'collapsed') }}
          title={desktopOpen === 'collapsed' ? 'Open Feed' : 'Collapse Feed'}
        >
          <span className={`material-symbols-outlined ${styles.desktopTabChev}`} style={{ fontSize: 14, color: 'rgba(163,230,53,0.5)' }}>
            {desktopOpen === 'collapsed' ? 'chevron_left' : 'chevron_right'}
          </span>
          <span className={styles.desktopTabLabel}>Feed</span>
        </div>

        {/* Desktop: panel header with expand/collapse controls */}
        <div className={styles.desktopHeader}>
          <span className={styles.desktopHeaderTitle}>
            <span className={`${styles.dot} ${isLive ? styles.dotLive : styles.dotOff}`} style={{ position: 'static', transform: 'none', bottom: 'auto' }} />
            Space Feed
          </span>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              className={styles.desktopHeaderBtn}
              onClick={() => setDesktopOpen(d => d === 'wide' ? 'open' : 'wide')}
              title={desktopOpen === 'wide' ? 'Collapse to normal' : 'Expand to full detail'}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                {desktopOpen === 'wide' ? 'close_fullscreen' : 'open_in_full'}
              </span>
            </button>
            <button
              className={styles.desktopHeaderBtn}
              onClick={() => setDesktopOpen('collapsed')}
              title="Close panel"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>chevron_right</span>
            </button>
          </div>
        </div>

        {/* Grab handle + integrated filter icons */}
        <div
          ref={grabRef}
          className={styles.grabHandle}
          onClick={() => sheetState === 'peek' && setSheetState('half')}
        >
          <span className={styles.grabBar} />

          {/* Filter icons — integrated into grab zone, always visible in peek */}
          <div className={styles.filterIconRow}>
            <MobileFilterRow
              activeFilter={activeFilter}
              onFiltersChange={onFiltersChange}
              onCameraScale={onCameraScale}
              onActiveFilterChange={onActiveFilterChange}
              onLaunchPanelToggle={onLaunchPanelToggle}
              liveEnabled={liveEnabled}
              onLiveToggle={onLiveToggle}
              onSearchOpen={onSearchOpen}
              audioMuted={audioMuted}
              onAudioToggle={onAudioToggle}
              connectionStatus={connectionStatus}
            />
            {activeScale === 'galaxy' && (
              <div className={styles.galaxySliderWrap}>
                <GalaxyDistanceSlider onChange={onDistanceChange} />
              </div>
            )}
          </div>
        </div>

        {/* Divider — signals content below is a separate stream */}
        <div className={`${styles.mobileSheetDivider}${desktopOpen === 'wide' ? ' ' + styles.desktopDividerVisible : ''}`}>
          <span className={styles.mobileSheetDividerLine} />
          <span className={styles.mobileSheetDividerLabel}>
            Feed
          </span>
          <span className={styles.mobileSheetDividerLine} />
        </div>

        <SpaceFeed
          apod={apod}
          kp={solarKp}
          kpHistory={kpHistory}
          showers={showers}
          news={news}
          quote={quote}
          pinnedLaunch={pinnedLaunch}
          onUnpinLaunch={onUnpinLaunch}
          issData={issData}
          onISSLink={onISSLink}
          trackedFlights={trackedFlights}
        />
      </div>


    </div>
  )
}
