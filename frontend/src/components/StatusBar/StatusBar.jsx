import { useState, useEffect, useRef } from 'react'
import styles from './StatusBar.module.css'

export default function StatusBar({
  connectionStatus, activeScale, onScaleChange, onSearchOpen,
  liveEnabled, onLiveToggle, trackedCount = 0,
}) {
  const [expanded, setExpanded] = useState(false)
  const notchRef = useRef(null)

  const isLive       = connectionStatus === 'connected'
  const isConnecting = connectionStatus === 'connecting'

  // Close on outside click
  useEffect(() => {
    if (!expanded) return
    const handler = e => {
      if (notchRef.current && !notchRef.current.contains(e.target)) {
        setExpanded(false)
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [expanded])

  return (
    <div
      ref={notchRef}
      className={`${styles.notch} ${expanded ? styles.expanded : ''}`}
      data-tour="status-bar"
    >
      {/* ── Handle — always visible pill ───────────────────────────── */}
      <button
        className={styles.handle}
        onClick={() => setExpanded(o => !o)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
      >
        {/* Logo glyph */}
        <svg className={styles.logoIcon} width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.1" opacity=".5"/>
          <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.3"/>
          <circle cx="8" cy="8" r="1" fill="currentColor"/>
          {/* orbit ring */}
          <ellipse cx="8" cy="8" rx="6.5" ry="2.5" stroke="currentColor" strokeWidth="0.9" opacity=".35"
            transform="rotate(-30 8 8)"/>
        </svg>

        <span className={styles.wordmark}>FLIGHTSPACE</span>

        <div className={styles.handleMeta}>
          <span className={`${styles.statusDot}
            ${isLive ? styles.dotLive : isConnecting ? styles.dotConnecting : styles.dotOff}`}
          />
          {isLive && (
            <span className={styles.trackedBadge}>{trackedCount.toLocaleString()}</span>
          )}
        </div>

        <svg
          className={`${styles.chevron} ${expanded ? styles.chevronUp : ''}`}
          width="10" height="6" viewBox="0 0 10 6" fill="none"
        >
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* ── Expanded panel — slides down ───────────────────────────── */}
      <div className={styles.panelWrap}>
        <div className={styles.panel}>
          <div className={styles.divider} />

          <div className={styles.panelRow}>
            {/* Scale nav */}
            <nav className={styles.scaleNav}>
              <NavBtn
                label="Earth"
                active={!activeScale || activeScale === 'earth'}
                onClick={() => { onScaleChange?.('earth'); setExpanded(false) }}
              />
              <span className={styles.navSep} />
              <NavBtn
                label="Moon"
                active={activeScale === 'moon'}
                onClick={() => { onScaleChange?.('moon'); setExpanded(false) }}
              />
              <span className={styles.navSep} />
              <NavBtn
                label="Solar System"
                active={activeScale === 'solar'}
                onClick={() => { onScaleChange?.('solar'); setExpanded(false) }}
              />
              <span className={styles.navSep} />
              <NavBtn
                label="Deep Space"
                active={activeScale === 'galaxy'}
                onClick={() => { onScaleChange?.('galaxy'); setExpanded(false) }}
              />
            </nav>

            {/* Right controls */}
            <div className={styles.panelActions}>
              <button
                className={`${styles.liveBtn} ${liveEnabled ? styles.liveBtnOn : ''}`}
                onClick={onLiveToggle}
                title={liveEnabled ? 'Disable live tracking' : 'Enable live tracking'}
                data-tour="live-btn"
              >
                <span className={`${styles.liveLed} ${liveEnabled ? styles.liveLedOn : ''}`} />
                LIVE
              </button>

              <button className={styles.searchBtn} onClick={() => { onSearchOpen?.(); setExpanded(false) }} data-tour="search-btn">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M8.5 8.5L11 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                Search
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function NavBtn({ label, active, onClick }) {
  return (
    <button
      className={`${styles.navBtn} ${active ? styles.navBtnActive : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  )
}