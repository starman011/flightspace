import { useState, useCallback, useRef } from 'react'
import styles from './MoonPanel.module.css'

const FILTERS = [
  { id: 'iron',     label: 'Iron',      formula: 'FeO',  color: '#ff7a3d' },
  { id: 'titanium', label: 'Titanium',  formula: 'TiO₂', color: '#ffd24a' },
  { id: 'water',    label: 'Water Ice', formula: 'H₂O',  color: '#5ddcff' },
  { id: 'thorium',  label: 'Thorium',   formula: 'Th',   color: '#d76bff' },
]

/* ── Inline SVG Moon glyph ───────────────────────────────────────────────── */
function MoonGlyph() {
  return (
    <svg viewBox="0 0 56 56" className={styles.moonGlyph} aria-hidden="true">
      <defs>
        <radialGradient id="mg-body" cx="38%" cy="36%" r="78%">
          <stop offset="0%"   stopColor="#f4f0e8" />
          <stop offset="48%"  stopColor="#bcb4a2" />
          <stop offset="82%"  stopColor="#5d5648" />
          <stop offset="100%" stopColor="#1e1a14" />
        </radialGradient>
        <radialGradient id="mg-glow" cx="50%" cy="50%" r="50%">
          <stop offset="60%" stopColor="rgba(180,200,255,0)" />
          <stop offset="100%" stopColor="rgba(120,180,255,0.18)" />
        </radialGradient>
      </defs>
      <circle cx="28" cy="28" r="27" fill="url(#mg-glow)" />
      <circle cx="28" cy="28" r="22" fill="url(#mg-body)" />
      <circle cx="20" cy="22" r="2.4" fill="#1e1a14" opacity="0.55" />
      <circle cx="34" cy="18" r="1.6" fill="#1e1a14" opacity="0.45" />
      <circle cx="38" cy="32" r="2.0" fill="#1e1a14" opacity="0.5" />
      <circle cx="22" cy="36" r="1.4" fill="#1e1a14" opacity="0.45" />
      <circle cx="29" cy="40" r="1.0" fill="#1e1a14" opacity="0.35" />
      <circle cx="16" cy="29" r="1.0" fill="#1e1a14" opacity="0.35" />
    </svg>
  )
}

function StatRow({ label, value }) {
  if (value == null) return null
  return (
    <div className={styles.statRow}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
    </div>
  )
}

const FLAGS = { USA: '🇺🇸', USSR: '🇷🇺', China: '🇨🇳', India: '🇮🇳', Japan: '🇯🇵' }

export default function MoonPanel({ site, onClose, onReturnHome, onFlyTo, onFilterChange }) {
  const [activeFilter, setActiveFilter] = useState(null)
  // Mobile sheet: 'mini' (collapsed dock, default) or 'peek' (expanded ~38dvh)
  const [sheet, setSheet] = useState('mini')

  const handleFilter = (id) => {
    const next = activeFilter === id ? null : id
    setActiveFilter(next)
    onFilterChange?.(next)
  }

  /* ── Swipe gesture ─────────────────────────────────────────────────────── */
  const touchStartY = useRef(null)
  const touchStartSheet = useRef(null)
  const handleTouchStart = useCallback((e) => {
    touchStartY.current = e.touches[0].clientY
    touchStartSheet.current = sheet
  }, [sheet])
  const handleTouchEnd = useCallback((e) => {
    if (touchStartY.current == null) return
    const dy = e.changedTouches[0].clientY - touchStartY.current
    const threshold = 50
    if (dy > threshold) {
      // Swipe down → collapse
      if (touchStartSheet.current === 'peek') setSheet('mini')
    } else if (dy < -threshold) {
      // Swipe up → expand
      if (touchStartSheet.current === 'mini') setSheet('peek')
    }
    touchStartY.current = null
  }, [])

  const isMini = sheet === 'mini'
  const panelCls = `${styles.panel} ${isMini ? styles.panelMini : ''}`

  // ── No site selected: Moon overview ──────────────────────────────────────
  if (!site) {
    return (
      <aside className={panelCls} aria-label="Moon details">
        {/* ── Mobile drag handle ── */}
        <div
          className={styles.dragZone}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className={styles.dragHandle} />
        </div>

        <button className={styles.close} onClick={onClose} aria-label="Close and return to Earth">✕</button>
        <button className={styles.homeBtn} onClick={onReturnHome} aria-label="Return to Earth" title="Return to Earth">
          <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
            <path d="M10 2 L3 9 H5 V17 H9 V12 H11 V17 H15 V9 H17 Z"
                  fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <span>Earth</span>
        </button>

        {/* ── Mini docked strip (mobile only) ── */}
        {isMini && (
          <div className={styles.miniStrip} onClick={() => setSheet('peek')}>
            <div className={styles.miniLeft}>
              <span className={styles.miniMoon}>🌙</span>
              <span className={styles.miniTitle}>The Moon</span>
            </div>
            <span className={styles.miniHint}>
              <span className={styles.miniChevron}>⌃</span>
              explore
            </span>
          </div>
        )}

        {/* ── Full peek content ── */}
        {!isMini && (
          <>
            <header className={styles.header}>
              <MoonGlyph />
              <div className={styles.titles}>
                <p className={styles.eyebrow}>Earth&apos;s Only Natural Satellite</p>
                <h2 className={styles.name}>The Moon</h2>
                <p className={styles.subline}>Luna · Sol III b</p>
              </div>
            </header>

            <div className={styles.divider} />

            <p className={styles.desc}>
              Born 4.5 billion years ago from a world-shattering collision, the Moon
              is humanity&apos;s first foothold beyond Earth. Twelve people have walked
              its surface. Its pull steadies our seasons, lifts our tides, and is
              slowly drifting 3.8 cm further every year.
            </p>

            <div className={styles.stats}>
              <StatRow label="Distance"        value="384 400 km" />
              <StatRow label="Diameter"        value="3 474 km" />
              <StatRow label="Orbital Period"  value="27.3 days" />
              <StatRow label="Surface Gravity" value="1.62 m/s²  (0.166 g)" />
              <StatRow label="Surface Temp"    value="−173 °C → 127 °C" />
              <StatRow label="Atmosphere"      value="Exosphere (trace)" />
              <StatRow label="Age"             value="4.53 Gyr" />
              <StatRow label="Missions Landed" value="25 +  (6 crewed)" />
            </div>

            <div className={styles.hintCard}>
              <span className={styles.hintDot} />
              <p className={styles.hintText}>
                Tap a glowing marker to open a landing-site dossier, or pick a
                resource below to reveal its lunar distribution.
              </p>
            </div>

            <div className={styles.filtersWrap}>
              <p className={styles.filtersTitle}>Resource Map</p>
              <div className={styles.filters}>
                {FILTERS.map(f => {
                  const on = activeFilter === f.id
                  return (
                    <button
                      key={f.id}
                      className={`${styles.filterBtn} ${on ? styles.filterBtnActive : ''}`}
                      style={on ? { borderColor: f.color + '88', color: f.color, background: f.color + '14', boxShadow: `0 0 18px ${f.color}22` } : {}}
                      onClick={() => handleFilter(f.id)}
                    >
                      <span className={styles.filterDot} style={{ background: f.color, boxShadow: `0 0 6px ${f.color}` }} />
                      <span className={styles.filterLabel}>{f.label}</span>
                      <span className={styles.filterFormula}>{f.formula}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </aside>
    )
  }

  // ── Landing site detail ──────────────────────────────────────────────────
  const badgeClass = site.type === 'crewed' ? styles.crewed : site.type === 'impact' ? styles.impact : styles.robotic
  const flag = FLAGS[site.country] || '🏳️'

  return (
    <aside className={panelCls} aria-label={`${site.name} details`}>
      {/* ── Mobile drag handle ── */}
      <div
        className={styles.dragZone}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className={styles.dragHandle} />
      </div>

      <button className={styles.close} onClick={onClose} aria-label="Close">✕</button>
      <button className={styles.homeBtn} onClick={onReturnHome} aria-label="Return to Earth" title="Return to Earth">
        <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
          <path d="M10 2 L3 9 H5 V17 H9 V12 H11 V17 H15 V9 H17 Z"
                fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        <span>Earth</span>
      </button>

      {/* ── Mini docked strip (mobile only) ── */}
      {isMini && (
        <div className={styles.miniStrip} onClick={() => setSheet('peek')}>
          <div className={styles.miniLeft}>
            <span className={styles.miniMoon}>{flag}</span>
            <span className={styles.miniTitle}>{site.name}</span>
            <span className={`${styles.miniBadge} ${badgeClass}`}>{site.type}</span>
          </div>
          <span className={styles.miniHint}>
            <span className={styles.miniChevron}>⌃</span>
            details
          </span>
        </div>
      )}

      {/* ── Full peek content ── */}
      {!isMini && (
        <>
          <header className={styles.header}>
            <span className={styles.flag}>{flag}</span>
            <div className={styles.titles}>
              <p className={styles.eyebrow}>Lunar Landing Site</p>
              <h2 className={styles.name}>{site.name}</h2>
              <span className={`${styles.badge} ${badgeClass}`}>{site.type}</span>
            </div>
          </header>

          <div className={styles.divider} />

          <p className={styles.siteName}>{site.site}</p>
          <p className={styles.desc}>{site.desc}</p>
          {site.crew && (
            <div className={styles.crewBlock}>
              <span className={styles.crewLabel}>Crew</span>
              <span className={styles.crewValue}>{site.crew}</span>
            </div>
          )}

          <div className={styles.stats}>
            <StatRow label="Date"      value={site.date} />
            <StatRow label="Country"   value={site.country} />
            <StatRow label="Latitude"  value={`${site.lat.toFixed(4)}°`} />
            <StatRow label="Longitude" value={`${site.lon.toFixed(4)}°`} />
            <StatRow label="Type"      value={site.type} />
          </div>

          <button className={styles.flyBtn} onClick={() => onFlyTo?.(site.id)}>
            <span className={styles.flyArrow}>→</span> Fly to Site
          </button>

          <div className={styles.filtersWrap}>
            <p className={styles.filtersTitle}>Resource Map</p>
            <div className={styles.filters}>
              {FILTERS.map(f => {
                const on = activeFilter === f.id
                return (
                  <button
                    key={f.id}
                    className={`${styles.filterBtn} ${on ? styles.filterBtnActive : ''}`}
                    style={on ? { borderColor: f.color + '88', color: f.color, background: f.color + '14', boxShadow: `0 0 18px ${f.color}22` } : {}}
                    onClick={() => handleFilter(f.id)}
                  >
                    <span className={styles.filterDot} style={{ background: f.color, boxShadow: `0 0 6px ${f.color}` }} />
                    <span className={styles.filterLabel}>{f.label}</span>
                    <span className={styles.filterFormula}>{f.formula}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </aside>
  )
}
