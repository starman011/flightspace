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
    id: 'rockets', type: 'rockets', scale: 'earth', label: 'Launches',
    subs: [],
  },
  {
    id: 'ships', type: 'ships', scale: 'earth', label: 'Ships',
    subs: [
      { id: 'all-ships', label: 'All Ships', type: 'ships' },
    ],
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
  { id: 'solar',  label: 'Solar System' },
  { id: 'galaxy', label: 'Deep Space' },
]

export default function BottomBar({
  activeFilter, onActiveFilterChange, onFiltersChange,
  activeScale, onScaleChange,
  onSearchOpen, onLaunchPanelToggle,
  liveEnabled, onLiveToggle,
  connectionStatus,
  audioMuted, onAudioToggle,
  hidden,
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [openPopover, setOpenPopover] = useState(null)
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

  // Auto-collapse after 5s on mount
  useEffect(() => {
    collapseTimeout.current = setTimeout(() => setCollapsed(true), 5000)
    return () => clearTimeout(collapseTimeout.current)
  }, [])

  if (hidden) return null

  // Active icon for collapsed preview
  const activeFilterObj = FILTERS.find(f => f.id === activeFilter)
  const activeScaleObj = SCALES.find(s => s.id === activeScale)

  return (
    <nav
      className={`${styles.bar} ${collapsed ? styles.collapsed : ''}`}
      aria-label="Navigation"
      ref={barRef}
      onMouseEnter={expand}
      onMouseLeave={scheduleCollapse}
    >
      {/* ── Collapsed state: compact preview pill ── */}
      {collapsed && (
        <button className={styles.preview} onClick={expand}>
          <span className={styles.previewIcons}>
            {activeFilterObj
              ? <><FilterIcon id={activeFilterObj.id} size={15} /><span className={styles.previewDot} /></>
              : <ScaleIcon id={activeScale} size={15} />
            }
          </span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </button>
      )}

      {/* ── Expanded state: full icon bar ── */}
      {!collapsed && (
        <div className={styles.content}>
          <div className={styles.group}>
            {FILTERS.map(f => (
              <div
                key={f.id}
                className={styles.btnWrap}
                onMouseEnter={() => handleFilterHover(f)}
                onMouseLeave={handleFilterLeave}
              >
                <button
                  className={`${styles.btn} ${styles.expandable} ${activeFilter === f.id ? styles.active : ''}`}
                  onClick={() => handleFilterClick(f)}
                  aria-label={f.label}
                >
                  <span className={styles.iconWrap}><FilterIcon id={f.id} /></span>
                  <span className={styles.label}>{f.label}</span>
                  {activeFilter === f.id && <span className={styles.dot} />}
                </button>

                {openPopover === f.id && f.subs?.length > 0 && (
                  <div
                    className={styles.popover}
                    onMouseEnter={handlePopoverEnter}
                    onMouseLeave={handleFilterLeave}
                  >
                    <div className={styles.popoverArrow} />
                    <p className={styles.popoverTitle}>{f.label}</p>
                    {f.subs.map(sub => (
                      <button
                        key={sub.id}
                        className={`${styles.popoverItem} ${activeFilter === f.id ? styles.popoverItemActive : ''}`}
                        onClick={() => handleSubClick(f, sub)}
                      >
                        <span className={styles.popoverDot} />
                        {sub.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <span className={styles.sep} />

          <div className={styles.group}>
            {SCALES.map(s => (
              <button
                key={s.id}
                className={`${styles.btn} ${styles.expandable} ${activeScale === s.id ? styles.active : ''}`}
                onClick={() => handleScale(s)}
                aria-label={s.label}
              >
                <span className={styles.iconWrap}><ScaleIcon id={s.id} /></span>
                <span className={styles.label}>{s.label}</span>
                {activeScale === s.id && <span className={styles.dot} />}
              </button>
            ))}
          </div>

          <span className={styles.sep} />

          <div className={styles.group}>
            <button className={`${styles.btn} ${styles.expandable}`} onClick={onSearchOpen} aria-label="Search">
              <span className={styles.iconWrap}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
              </span>
              <span className={styles.label}>Search</span>
            </button>
            <button
              className={`${styles.btn} ${styles.expandable} ${!audioMuted ? styles.audioOn : ''}`}
              onClick={onAudioToggle}
              aria-label={audioMuted ? 'Unmute audio' : 'Mute audio'}
            >
              <span className={styles.iconWrap}>
                {audioMuted ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                )}
              </span>
              <span className={styles.label}>{audioMuted ? 'Unmute' : 'Audio'}</span>
            </button>
            <button
              className={`${styles.btn} ${styles.liveBtn} ${liveEnabled ? styles.liveOn : ''}`}
              onClick={onLiveToggle}
              title={liveEnabled ? 'Live tracking ON' : 'Live tracking OFF'}
              aria-label="Toggle live"
            >
              <span className={`${styles.liveDot} ${liveEnabled ? styles.liveDotOn : ''} ${connectionStatus === 'connecting' ? styles.liveDotConnecting : ''}`} />
            </button>
          </div>

          {/* Collapse button at the end */}
          <button
            className={styles.collapseBtn}
            onClick={() => { setCollapsed(true); clearTimeout(collapseTimeout.current) }}
            aria-label="Collapse"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
      )}
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
