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
let _apodCache = null, _apodCachedAt = 0

function useSpaceNews() {
  const [news, setNews] = useState(_newsCache)
  useEffect(() => {
    if (Date.now() - _newsCachedAt < 600_000) { setNews(_newsCache); return }
    fetch('https://api.spaceflightnewsapi.net/v4/articles/?limit=3&ordering=-published_at')
      .then(r => r.json())
      .then(d => { _newsCache = d.results ?? []; _newsCachedAt = Date.now(); setNews(_newsCache) })
      .catch(() => {})
  }, [])
  return news
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
    fetch('/api/v1/apod')
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

function SolarStack({ kp }) {
  const level  = kp == null ? null : kp >= 5 ? 'STORM' : kp >= 4 ? 'ACTIVE' : 'NOMINAL'
  const accent = level === 'STORM' ? '#ff6b35' : level === 'ACTIVE' ? '#ffd700' : '#22ef7e'
  const desc   = level === 'STORM'
    ? 'Geomagnetic storm in progress. Aurora visible at mid-latitudes.'
    : level === 'ACTIVE'
    ? 'Elevated solar activity. Aurora possible at high latitudes.'
    : 'Solar activity nominal. No significant disturbances.'
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

function MeteorsStack({ showers }) {
  const [idx, setIdx] = useState(0)
  const s = showers[idx]
  if (!s) return null
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

function NewsStack({ news }) {
  const [hero, ...rest] = news.slice(0, 3)
  if (!hero) return <div className={styles.newsStack} />
  return (
    <div className={styles.newsStack}>
      {/* Hero — image commands full panel, title breathes over it */}
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

      {/* Secondary — pure typography, no boxes */}
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

function QuoteStack({ quote }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(`"${quote.q}" — ${quote.a}`).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <div className={styles.quoteStack} onClick={copy}>
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
function NightSkyStack() {
  const [idx, setIdx] = useState(0)
  const c = COMETS[idx]
  return (
    <div className={styles.nightSkyStack}>
      {/* Comet hero */}
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

      {/* Planet visibility */}
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

// ── Smart Stack container ──────────────────────────────────────────────────
function SmartStack({ apod, kp, showers, news, quote, pinnedLaunch, onUnpinLaunch }) {
  const [active, setActive]   = useState(0)
  const pausedRef             = useRef(false)
  const pauseTimerRef         = useRef(null)
  const total = STACK_DEFS.length

  // Auto-rotate every 9 s, pauses for 25 s after user interaction
  useEffect(() => {
    const id = setInterval(() => {
      if (!pausedRef.current) setActive(a => (a + 1) % total)
    }, 9000)
    return () => clearInterval(id)
  }, [total])

  const go = (idx) => {
    pausedRef.current = true
    setActive(idx)
    clearTimeout(pauseTimerRef.current)
    pauseTimerRef.current = setTimeout(() => { pausedRef.current = false }, 25000)
  }
  const prev = () => go((active - 1 + total) % total)
  const next = () => go((active + 1) % total)

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

      {/* Animated slide content — key forces remount + CSS animation */}
      <div key={active} className={styles.stackSlide}>
        {active === 0 && <ApodStack apod={apod} />}
        {active === 1 && <SolarStack kp={kp} />}
        {active === 2 && <MeteorsStack showers={showers} />}
        {active === 3 && <NewsStack news={news} />}
        {active === 4 && <NightSkyStack />}
        {active === 5 && <QuoteStack quote={quote} />}
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

export default function CommandCenterOverlay({ trackedCount, connectionStatus, issData, onISSLink, activeFilter, pinnedLaunch, onUnpinLaunch }) {
  const showIssCard = activeFilter == null || activeFilter === 'satellites'
  const isLive = connectionStatus === 'connected'
  const utcTime = useUtcTime()
  const [toast, setToast] = useState(null)
  const news    = useSpaceNews()
  const solarKp = useSolarKp()
  const apod    = useApod()
  const showers = nextShowers(4)
  const quote   = dailyQuote()

  const hasISS   = issData != null
  const issLat   = issData?.lat
  const issLon   = issData?.lon
  const issAlt   = issData?.alt_km ?? 408
  const issCrew  = issData?.crew ?? 0
  const issRegion = geoRegion(issLat, issLon)

  const issLatStr = issLat != null
    ? `${Math.abs(issLat).toFixed(2)}° ${issLat >= 0 ? 'N' : 'S'}`
    : '—'
  const issLonStr = issLon != null
    ? `${Math.abs(issLon).toFixed(2)}° ${issLon >= 0 ? 'E' : 'W'}`
    : '—'

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
              {issAlt.toFixed(0)} <span className={styles.statUnit}>km</span>
            </p>
          </div>
        </div>

        {/* ── Live ISS card — only when filter is All or Satellites ── */}
        {showIssCard && <div className={styles.focusCard}>
          {/* Pulsing target icon */}
          <div className={styles.focusTarget}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--primary-container)' }}>
              target
            </span>
          </div>

          {/* Header row: ISS icon + label */}
          <div className={styles.issHeader}>
            <div className={styles.issIconWrap}>
              {/* Custom ISS silhouette in CSS */}
              <div className={styles.issIcon}>
                <span className={styles.issSolarL} />
                <span className={styles.issBody} />
                <span className={styles.issSolarR} />
              </div>
              {hasISS && <span className={styles.issLiveDot} />}
            </div>
            <div>
              <p className={styles.focusLabel}>
                {hasISS ? 'LIVE · ISS TRAJECTORY' : 'ISS · AWAITING SIGNAL'}
              </p>
              <h2 className={styles.focusTitle}>
                International Space Station
              </h2>
            </div>
          </div>

          {/* Telemetry grid */}
          <div className={styles.issTelemetry}>
            <div className={styles.issTelemCell}>
              <span className={styles.issTelemLabel}>Latitude</span>
              <span className={styles.issTelemValue}>{issLatStr}</span>
            </div>
            <div className={styles.issTelemCell}>
              <span className={styles.issTelemLabel}>Longitude</span>
              <span className={styles.issTelemValue}>{issLonStr}</span>
            </div>
            <div className={styles.issTelemCell}>
              <span className={styles.issTelemLabel}>Altitude</span>
              <span className={styles.issTelemValue}>{issAlt.toFixed(0)} km</span>
            </div>
            {issCrew > 0 && (
              <div className={styles.issTelemCell}>
                <span className={styles.issTelemLabel}>Crew</span>
                <span className={styles.issTelemValue}>{issCrew} aboard</span>
              </div>
            )}
          </div>

          <p className={styles.focusDesc}>
            {hasISS
              ? `Currently traversing over ${issRegion}. Orbiting at ${ISS_VEL_KMH.toLocaleString()} km/h.`
              : 'Awaiting live position data from ISS poller…'}
          </p>

          <button
            className={styles.linkBtn}
            aria-label="Link ISS"
            onClick={() => {
              // Always open detail panel + start tracking
              onISSLink?.selectISS()
              onISSLink?.trackISS()
              // Fly camera + copy coords only when live position is available
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
            LINK
          </button>

          {toast && (
            <div className={styles.toast}>
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>check_circle</span>
              {toast}
            </div>
          )}
        </div>}
      </div>

      {/* Right: Smart Stack */}
      <div className={styles.stream}>
        <SmartStack
          apod={apod}
          kp={solarKp}
          showers={showers}
          news={news}
          quote={quote}
          pinnedLaunch={pinnedLaunch}
          onUnpinLaunch={onUnpinLaunch}
        />
      </div>

      {/* Encryption watermark */}
      <div className={styles.watermark}>
        <span>Encryption_Level: AES-256</span>
        <span>Local_Time: {utcTime} UTC</span>
      </div>
    </div>
  )
}
