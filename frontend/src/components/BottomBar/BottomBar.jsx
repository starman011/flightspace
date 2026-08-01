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

export default function BottomBar({
  activeFilter, onActiveFilterChange, onFiltersChange,
  activeScale, onScaleChange,
  onSearchOpen, onLaunchPanelToggle, onPageOpen,
  liveEnabled, onLiveToggle,
  connectionStatus,
  audioMuted, onAudioToggle,
  showWeather, onWeatherToggle,
  hidden,
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [openPopover, setOpenPopover] = useState(null)
  const [introMode, setIntroMode] = useState(true)
  const popoverTimeout = useRef(null)
  const collapseTimeout = useRef(null)
  const barRef = useRef(null)

  useEffect(() => {
    if (!openPopover) return
    const handleKey = (e) => { if (e.key === 'Escape') setOpenPopover(null) }
    const handleClick = (e) => {
      if (barRef.current && !barRef.current.contains(e.target)) setOpenPopover(null)
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
    onActiveFilterChange?.(s.id === 'solar' ? 'asteroids' : null)
    onFiltersChange?.(s.id === 'solar' ? { type: 'asteroids' } : {})
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
  const TAB_FILTERS = ['flights', 'ships', 'satellites'].map(id => FILTERS.find(f => f.id === id))
  const SPACE_ITEMS = [
    ...SCALES.filter(sc => sc.id !== 'earth'),
    FILTERS.find(f => f.id === 'rockets'),
    FILTERS.find(f => f.id === 'asteroids'),
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
    <nav className={styles.bar} aria-label="Primary navigation" ref={barRef}>
      <button className={styles.tab} onClick={() => onSearchOpen?.()} aria-label="Search flights, airports, airlines">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <span className={styles.tabLabel}>Search</span>
      </button>

      {TAB_FILTERS.map(f => (
        <div key={f.id} className={styles.tabWrap}>
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
            <button className={`${styles.popItem} ${activeScale === 'earth' && !activeFilter ? styles.popOn : ''}`} onClick={() => handleScale(SCALES[0])}>Earth</button>
            {SPACE_ITEMS.map(it => it.subs !== undefined || it.type ? (
              <button key={it.id} className={`${styles.popItem} ${activeFilter === it.id ? styles.popOn : ''}`} onClick={() => handleFilterClick(it)}>{it.label}</button>
            ) : (
              <button key={it.id} className={`${styles.popItem} ${activeScale === it.id ? styles.popOn : ''}`} onClick={() => handleScale(it)}>{it.label}</button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.tabWrap}>
        <button
          className={styles.tab}
          onClick={() => setOpenPopover(p => p === 'more' ? null : 'more')}
          aria-label="More pages and settings"
          aria-expanded={openPopover === 'more'}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
          <span className={styles.tabLabel}>More</span>
        </button>
        {openPopover === 'more' && (
          <div className={styles.pop}>
            {PAGE_ITEMS.map(([id, label]) => (
              <button key={id} className={styles.popItem} onClick={() => { setOpenPopover(null); onPageOpen?.(id) }}>{label}</button>
            ))}
            <span className={styles.popRule} />
            <button className={`${styles.popItem} ${showWeather ? styles.popOn : ''}`} onClick={() => onWeatherToggle?.()}>{showWeather ? 'Weather on' : 'Weather off'}</button>
            <button className={styles.popItem} onClick={() => onAudioToggle?.()}>{audioMuted ? 'Sound off' : 'Sound on'}</button>
          </div>
        )}
      </div>

      <button
        className={`${styles.live} ${liveEnabled ? styles.liveOn : ''}`}
        onClick={() => onLiveToggle?.()}
        aria-label={liveEnabled ? 'Live stream on' : 'Live stream off'}
        aria-pressed={liveEnabled}
      >
        <span className={`${styles.liveDot} ${liveEnabled ? (connectionStatus === 'connected' ? styles.liveDotOn : styles.liveDotConnecting) : ''}`} />
        <span className={styles.tabLabel}>{liveEnabled ? 'LIVE' : 'OFF'}</span>
      </button>
    </nav>
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
