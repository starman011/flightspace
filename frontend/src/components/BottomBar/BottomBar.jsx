import { useState, useCallback, useRef, useEffect } from 'react'
import styles from './BottomBar.module.css'

const FILTERS = [
  {
    id: 'satellites', type: 'satellites', scale: 'earth', label: 'Satellites',
    subs: [
      { id: 'all-sat', label: 'All Satellites', type: 'satellites' },
      { id: 'iss',     label: 'ISS Only',       type: 'satellites', special: 'iss' },
      { id: 'starlink',label: 'Starlink',       type: 'satellites', special: 'starlink' },
    ],
  },
  {
    id: 'flights', type: 'planes', scale: 'earth', label: 'Flights',
    subs: [
      { id: 'all-flights', label: 'All Flights',  type: 'planes' },
      { id: 'commercial',  label: 'Commercial',   type: 'planes', altitude: 'high' },
      { id: 'low-alt',     label: 'Low Altitude',  type: 'planes', altitude: 'low' },
    ],
  },
  {
    id: 'ships', type: 'ships', scale: 'earth', label: 'Ships',
    subs: [
      { id: 'all-ships', label: 'All Ships', type: 'ships' },
    ],
  },
]

// Filters that live inside the gradient pill with scale buttons
const PILL_FILTERS = [
  {
    id: 'rockets', type: 'rockets', scale: 'earth', label: 'Launches',
    subs: [],
  },
  {
    id: 'asteroids', type: 'asteroids', scale: 'solar', label: 'NEO',
    subs: [
      { id: 'all-neo', label: 'All NEOs', type: 'asteroids' },
    ],
  },
]

const SCALES = [
  { id: 'earth',  label: 'Earth' },
  { id: 'moon',   label: 'Moon' },
  { id: 'solar',  label: 'Solar' },
  { id: 'galaxy', label: 'Deep Space' },
]

const TAB_FILTERS_IDS = ['flights', 'ships', 'satellites']

export default function BottomBar({
  activeFilter, onActiveFilterChange, onFiltersChange,
  activeScale, onScaleChange,
  onSearchOpen, onLaunchPanelToggle, onPageOpen, objectCount, onSearchSelect, onFeedToggle, topHidden,
  isAuthenticated, user, onSignIn, onSignOut, onProfileOpen,
  liveEnabled, onLiveToggle,
  connectionStatus,
  audioMuted, onAudioToggle,
  showWeather, onWeatherToggle,
  hidden,
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [hint, setHint] = useState('')
  const [liveWave, setLiveWave] = useState(false)   // full-screen activation pulse
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const topRef = useRef(null)
  const API_BASE = import.meta.env.VITE_API_URL || ''
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${API_BASE}/api/v1/aircraft/search?q=${encodeURIComponent(q.trim())}&limit=6`)
        if (r.ok) { const d = await r.json(); setResults(Array.isArray(d) ? d : (d.results || d.aircraft || [])) }
      } catch { /* offline */ }
    }, 250)
    return () => clearTimeout(t)
  }, [q, API_BASE])
  const [light, setLight] = useState(() => typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light')
  const toggleTheme = () => {
    const el = document.documentElement
    const next = el.getAttribute('data-theme') === 'light' ? 'dark' : 'light'
    if (next === 'light') el.setAttribute('data-theme', 'light'); else el.removeAttribute('data-theme')
    try { localStorage.setItem('ot-theme', next) } catch { /* private mode */ }
    setLight(next === 'light')
  }
  useEffect(() => {
    const WORDS = ['New York', 'ITY113', 'Emirates', 'JFK', 'BA275']
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setHint(WORDS[0]); return }
    let hi = 0, ci = 0, dir = 1, t
    const tick = () => {
      const w = WORDS[hi]
      ci += dir
      if (ci > w.length + 9) { dir = -1; ci = w.length }          // hold, then delete
      if (ci < 0) { dir = 1; ci = 0; hi = (hi + 1) % WORDS.length }
      setHint(w.slice(0, Math.max(0, Math.min(ci, w.length))))
      t = setTimeout(tick, dir === 1 ? (ci >= w.length ? 150 : 95) : 45)
    }
    t = setTimeout(tick, 900)
    return () => clearTimeout(t)
  }, [])
  const [openPopover, setOpenPopover] = useState(null)
  const [introMode, setIntroMode] = useState(true)
  const popoverTimeout = useRef(null)
  const collapseTimeout = useRef(null)
  const barRef = useRef(null)

  useEffect(() => {
    if (!openPopover) return
    const handleKey = (e) => { if (e.key === 'Escape') setOpenPopover(null) }
    const handleClick = (e) => {
      // outside-click must ignore BOTH containers — the funnel lives in the
      // top area, not the bar; without this its pointerdown closed the popover
      // and the same click's toggle reopened it (so it never closed).
      if (!barRef.current?.contains(e.target) && !topRef.current?.contains(e.target)) setOpenPopover(null)
    }
    document.addEventListener('keydown', handleKey)
    document.addEventListener('pointerdown', handleClick)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('pointerdown', handleClick)
    }
  }, [openPopover])

  const handleFilterClick = useCallback((f) => {
    if (f.id === 'rockets') {
      onLaunchPanelToggle?.()
      setOpenPopover(null)
      return
    }
    if (f.subs?.length > 0) {
      setOpenPopover(prev => prev === f.id ? null : f.id)
    }
    const isActive = activeFilter === f.id
    onActiveFilterChange?.(isActive ? null : f.id)
    onFiltersChange?.(isActive ? {} : { type: f.type })
    if (!isActive) onScaleChange?.(f.scale)
  }, [activeFilter, onActiveFilterChange, onFiltersChange, onScaleChange, onLaunchPanelToggle])

  const handleFilterHover = useCallback((f) => {
    clearTimeout(popoverTimeout.current)
    if (f.subs?.length > 0 && f.id !== 'rockets') setOpenPopover(f.id)
  }, [])

  const handleFilterLeave = useCallback(() => {
    popoverTimeout.current = setTimeout(() => setOpenPopover(null), 300)
  }, [])

  const handlePopoverEnter = useCallback(() => {
    clearTimeout(popoverTimeout.current)
  }, [])

  const handleSubClick = useCallback((f, sub) => {
    onActiveFilterChange?.(f.id)
    const filterObj = { type: sub.type }
    if (sub.altitude) filterObj.altitude = sub.altitude
    if (sub.special) filterObj.special = sub.special
    onFiltersChange?.(filterObj)
    onScaleChange?.(f.scale)
    setOpenPopover(null)
  }, [onActiveFilterChange, onFiltersChange, onScaleChange])

  const handleScale = useCallback((s) => {
    // Scales are pure scene changes now — NEO is its own Space-menu entry, so
    // Solar no longer force-enables the asteroids filter (that showed the NEO
    // view instead of the solar system).
    onActiveFilterChange?.(null)
    onFiltersChange?.({})
    onScaleChange?.(s.id)
    setOpenPopover(null)
  }, [onActiveFilterChange, onFiltersChange, onScaleChange])

  const expand = useCallback(() => {
    clearTimeout(collapseTimeout.current)
    setCollapsed(false)
  }, [])

  const scheduleCollapse = useCallback(() => {
    clearTimeout(collapseTimeout.current)
    collapseTimeout.current = setTimeout(() => {
      setCollapsed(true)
      setOpenPopover(null)
    }, 3000)
  }, [])

  // Intro mode: show all labels for 3s so first-time users see what icons mean
  useEffect(() => {
    const t = setTimeout(() => setIntroMode(false), 3000)
    return () => clearTimeout(t)
  }, [])

  // Auto-collapse after 6s on mount
  useEffect(() => {
    collapseTimeout.current = setTimeout(() => setCollapsed(true), 6000)
    return () => clearTimeout(collapseTimeout.current)
  }, [])

  if (hidden) return null

  // ── Consolidated 5-tab bar: Search · Flights · Ships · Orbit · Space · More · LIVE
  const TAB_FILTERS = TAB_FILTERS_IDS.map(id => FILTERS.find(f => f.id === id))
  const SPACE_ITEMS = [
    ...SCALES.filter(sc => sc.id !== 'earth'),
    ...PILL_FILTERS,          // Launches + NEO (they live in PILL_FILTERS, not FILTERS)
  ]
  const PAGE_ITEMS = [['flight', 'Flights near you'], ['planes', 'Live fleets'], ['blog', 'Journal']]
  const spaceOn = ['moon', 'solar', 'galaxy'].includes(activeScale) || activeFilter === 'asteroids'

  const sub = (f) => openPopover === f.id && f.subs?.length > 0 && (
    <div className={styles.pop} onMouseEnter={handlePopoverEnter} onMouseLeave={handleFilterLeave}>
      {f.subs.map(su => (
        <button key={su.id} className={styles.popItem} onClick={() => handleSubClick(f, su)}>{su.label}</button>
      ))}
    </div>
  )

  return (
    <>
    {liveWave && <div className={styles.liveWave} aria-hidden="true" />}
    <div className={`${styles.topArea}  ${topHidden ? styles.topGone : ''}`} ref={topRef}>
      <div className={styles.topRow}>
        <div className={styles.topSearch}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          {q === '' && <span className={styles.hintText} aria-hidden="true">{hint}<span className={styles.caret} /></span>}
          <input
            className={styles.topInput}
            value={q}
            onChange={e => setQ(e.target.value)}
            
            aria-label="Search flights, airports, airlines"
            enterKeyHint="search"
          />
          {results.length > 0 && (
            <div className={styles.searchResults}>
              {results.map((r, i) => (
                <button key={r.icao24 || i} className={styles.popItem}
                  onClick={() => { onSearchSelect?.(r); setQ(''); setResults([]) }}>
                  {(r.callsign || r.icao24 || '').trim()}{r.type ? ` · ${r.type}` : ''}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className={styles.topChipWrap}>
          <button className={`${styles.topChip} ${activeFilter ? styles.topChipOn : ''}`} onClick={() => setOpenPopover(p => p === 'topfilters' ? null : 'topfilters')} aria-label="Filter options" aria-expanded={openPopover === 'topfilters'}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></svg>
          </button>
          {openPopover === 'topfilters' && (
            <div className={`${styles.pop} ${styles.popDown}`}>
              {TAB_FILTERS.filter(f => f.subs?.length).map((f, i) => (
                <div key={f.id}>
                  {i > 0 && <span className={styles.popRule} />}
                  {f.subs.map(su => (
                    <button key={su.id} className={`${styles.popItem} ${activeFilter === f.id ? styles.popOn : ''}`} onClick={() => { handleSubClick(f, su); setOpenPopover(null) }}>
                      <FilterIcon id={f.id} size={14} /> {su.label}
                    </button>
                  ))}
                </div>
              ))}
              <span className={styles.popRule} />
              <button className={styles.popItem} onClick={() => { onActiveFilterChange?.(null); onFiltersChange?.({}); setOpenPopover(null) }}>Clear filters</button>
            </div>
          )}
        </div>
        <button className={styles.topChip} onClick={() => onFeedToggle?.()} aria-label="Open space feed">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1.5" fill="currentColor" stroke="none"/></svg>
        </button>
      </div>
      {objectCount > 0 && (
        <div className={styles.countStrip}>
          <span className={styles.countDot} />
          {objectCount.toLocaleString()} tracked now
        </div>
      )}
    </div>
    <nav className={styles.bar} aria-label="Primary navigation" ref={barRef}>

      <button
        className={`${styles.tab} ${activeScale === 'earth' && !activeFilter ? styles.tabOn : ''}`}
        onClick={() => handleScale(SCALES[0])}
        aria-label="Home — Earth globe"
      >
        <ScaleIcon id="earth" size={19} />
        <span className={styles.tabLabel}>Home</span>
      </button>

      {TAB_FILTERS.map(f => (
        <div key={f.id} className={`${styles.tabWrap} ${styles.layerTab}`}>
          <button
            className={`${styles.tab} ${activeFilter === f.id ? styles.tabOn : ''}`}
            onClick={() => handleFilterClick(f)}
            aria-label={f.label}
          >
            <FilterIcon id={f.id} size={19} />
            <span className={styles.tabLabel}>{f.id === 'satellites' ? 'Orbit' : f.label}</span>
          </button>
          {sub(f)}
        </div>
      ))}

      <div className={styles.tabWrap}>
        <button
          className={`${styles.tab} ${spaceOn ? styles.tabOn : ''}`}
          onClick={() => setOpenPopover(p => p === 'space' ? null : 'space')}
          aria-label="Space destinations"
          aria-expanded={openPopover === 'space'}
        >
          <ScaleIcon id="galaxy" size={19} />
          <span className={styles.tabLabel}>Space</span>
        </button>
        {openPopover === 'space' && (
          <div className={styles.pop}>
            {SPACE_ITEMS.map(it => it.subs !== undefined || it.type ? (
              <button key={it.id} className={`${styles.popItem} ${activeFilter === it.id ? styles.popOn : ''}`} onClick={() => handleFilterClick(it)}>{it.label}</button>
            ) : (
              <button key={it.id} className={`${styles.popItem} ${activeScale === it.id ? styles.popOn : ''}`} onClick={() => handleScale(it)}>{it.label}</button>
            ))}
          </div>
        )}
      </div>

      <button className={styles.tab} onClick={() => onPageOpen?.('blog')} aria-label="Journal">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        <span className={styles.tabLabel}>Journal</span>
      </button>

      <button
        className={styles.tab}
        onClick={() => (isAuthenticated ? onProfileOpen?.() : onSignIn?.())}
        aria-label={isAuthenticated ? 'Your profile' : 'Sign in'}
      >
          {isAuthenticated && user?.picture
            ? <img src={user.picture} alt="" className={styles.avatarImg} referrerPolicy="no-referrer" />
            : <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
        <span className={styles.tabLabel}>{isAuthenticated ? (user?.display_name?.split(' ')[0] || 'You') : 'Profile'}</span>
      </button>


      <button
        className={`${styles.live} ${liveEnabled ? styles.liveOn : ''}`}
        onClick={() => { if (!liveEnabled) { setLiveWave(true); setTimeout(() => setLiveWave(false), 2100) } onLiveToggle?.() }}
        aria-label={liveEnabled ? 'Live stream on' : 'Live stream off'}
        aria-pressed={liveEnabled}
      >
        <span className={`${styles.liveDot} ${liveEnabled ? (connectionStatus === 'connected' ? styles.liveDotOn : styles.liveDotConnecting) : ''}`} />
        <span className={styles.tabLabel}>{liveEnabled ? 'LIVE' : 'OFF'}</span>
      </button>

      <div className={styles.tabWrap}>
        <button
          className={styles.tab}
          onClick={() => setOpenPopover(p => p === 'menu' ? null : 'menu')}
          aria-label="Menu"
          aria-expanded={openPopover === 'menu'}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
          <span className={styles.tabLabel}>Menu</span>
        </button>
        {openPopover === 'menu' && (
          <div className={`${styles.pop} ${styles.popMenu}`}>
            {PAGE_ITEMS.map(([id, label]) => (
              <button key={id} className={styles.popItem} onClick={() => { setOpenPopover(null); onPageOpen?.(id) }}>{label}</button>
            ))}
            <button className={styles.popItem} onClick={() => { setOpenPopover(null); onLaunchPanelToggle?.() }}>Launches</button>
            <button className={styles.popItem} onClick={() => { setOpenPopover(null); handleFilterClick(PILL_FILTERS[1]) }}>Near-Earth Objects</button>
            <span className={styles.popRule} />
            <button className={styles.popItem} onClick={toggleTheme}>{light ? 'Dark mode' : 'Light mode'}</button>
            <button className={`${styles.popItem} ${showWeather ? styles.popOn : ''}`} onClick={() => onWeatherToggle?.()}>{showWeather ? 'Weather on' : 'Weather off'}</button>
            <button className={styles.popItem} onClick={() => onAudioToggle?.()}>{audioMuted ? 'Sound off' : 'Sound on'}</button>
            {[['about','About'],['faq','FAQ'],['contact','Contact'],['donate','Donate'],['waitlist','Waitlist']].map(([id,label]) => (
              <button key={id} className={styles.popItem} onClick={() => { setOpenPopover(null); onPageOpen?.(id) }}>{label}</button>
            ))}
            {isAuthenticated && (<><span className={styles.popRule} /><button className={styles.popItem} onClick={() => { setOpenPopover(null); onSignOut?.() }}>Sign out</button></>)}
          </div>
        )}
      </div>
    </nav>
    </>
  )
}

export function FilterIcon({ id, size = 18 }) {
  const s = size
  switch (id) {
    case 'satellites': return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M13 7L9 3 5 7l4 4" /><path d="M17 11l4 4-4 4-4-4" />
        <path d="M8 12l4 4" /><path d="M16 8l-4-4" />
        <circle cx="5" cy="19" r="2" /><path d="M9 15a4 4 0 0 1 0 4" />
      </svg>
    )
    case 'flights': return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
      </svg>
    )
    case 'rockets': return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
        <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
        <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
        <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
      </svg>
    )
    case 'ships': return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M2 20a3 3 0 0 0 4 0 3 3 0 0 1 4 0 3 3 0 0 0 4 0 3 3 0 0 1 4 0 3 3 0 0 0 4 0" />
        <path d="M4 18l-1-5h18l-1 5" /><path d="M12 2v7" /><path d="M7 9h10" />
      </svg>
    )
    case 'asteroids': return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
    )
    default: return null
  }
}

function ScaleIcon({ id, size = 18 }) {
  const s = size
  switch (id) {
    case 'earth': return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="12" r="10" /><path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    )
    case 'moon': return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
      </svg>
    )
    case 'solar': return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    )
    case 'galaxy': return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="12" r="2" />
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10" />
        <path d="M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2" />
        <path d="M2 12c0-3 4-6 10-6s10 3 10 6-4 6-10 6-10-3-10-6" />
      </svg>
    )
    default: return null
  }
}
