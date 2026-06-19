import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import styles from './MoonPanel.module.css'

// The mini/peek sheet is a mobile-only pattern. On desktop the panel must always
// show full content (otherwise the card renders empty).
function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 767)
  useEffect(() => {
    const fn = () => setM(window.innerWidth <= 767)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return m
}

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

/* ── Current Moon phase (client-side, no API) ─────────────────────────────── */
// Synodic month from a known new moon (2000-01-06 18:14 UTC).
function getMoonPhase(date = new Date()) {
  const SYNODIC = 29.530588853
  const knownNew = Date.UTC(2000, 0, 6, 18, 14, 0)
  const days = (date.getTime() - knownNew) / 86400000
  let p = (days % SYNODIC) / SYNODIC
  if (p < 0) p += 1                                   // phase fraction: 0=new, .5=full
  const age = p * SYNODIC                             // days since new moon
  const illumination = (1 - Math.cos(2 * Math.PI * p)) / 2
  const waxing = p < 0.5
  let name
  if      (age < 1.84566)  name = 'New Moon'
  else if (age < 5.53699)  name = 'Waxing Crescent'
  else if (age < 9.22831)  name = 'First Quarter'
  else if (age < 12.91963) name = 'Waxing Gibbous'
  else if (age < 16.61096) name = 'Full Moon'
  else if (age < 20.30228) name = 'Waning Gibbous'
  else if (age < 23.99361) name = 'Last Quarter'
  else if (age < 27.68493) name = 'Waning Crescent'
  else                     name = 'New Moon'
  return { p, age, illumination, waxing, name }
}

// Renders the lit/dark disc exactly as it appears from Earth for phase fraction p.
// Method: dark base, a lit semicircle on the sunward side, and a terminator
// ellipse (rx = R·|cos 2πp|) that either adds (gibbous) or subtracts (crescent).
function MoonPhaseGlyph({ p, size = 112 }) {
  const R = 50
  const cos = Math.cos(2 * Math.PI * p)
  const waxing = p < 0.5
  const gibbous = cos < 0
  const rx = Math.abs(R * cos)
  const DARK = 'rgba(150, 165, 195, 0.10)'
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={styles.phaseSvg} aria-hidden="true">
      <defs>
        <clipPath id="moonPhaseClip"><circle cx="50" cy="50" r="50" /></clipPath>
        <radialGradient id="moonLitGrad" cx="40" cy="36" r="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#fbf8f0" />
          <stop offset="62%"  stopColor="#dad3c3" />
          <stop offset="100%" stopColor="#a59c88" />
        </radialGradient>
      </defs>
      <g clipPath="url(#moonPhaseClip)">
        <rect x="0" y="0" width="100" height="100" fill={DARK} />
        <rect x={waxing ? 50 : 0} y="0" width="50" height="100" fill="url(#moonLitGrad)" />
        <ellipse cx="50" cy="50" rx={rx} ry="50" fill={gibbous ? 'url(#moonLitGrad)' : DARK} />
        {/* faint maria so the lit face reads as the Moon, not a flat disc */}
        <g fill="rgba(70,72,80,0.18)" clipPath="url(#moonPhaseClip)">
          <circle cx="38" cy="40" r="7" />
          <circle cx="58" cy="34" r="4.5" />
          <circle cx="62" cy="58" r="6" />
          <circle cx="42" cy="62" r="3.5" />
        </g>
      </g>
      <circle cx="50" cy="50" r="49" fill="none" stroke="rgba(200,210,225,0.18)" strokeWidth="1" />
    </svg>
  )
}

export default function MoonPanel({ site, onClose, onReturnHome, onFlyTo, onFilterChange }) {
  const [activeFilter, setActiveFilter] = useState(null)
  // Mobile sheet: 'mini' (collapsed dock, default) or 'peek' (expanded ~38dvh)
  const [sheet, setSheet] = useState('mini')
  const [showPhase, setShowPhase] = useState(true)   // "Tonight's Moon" phase card
  const moon = useMemo(() => getMoonPhase(), [])
  const phasePct = Math.round(moon.illumination * 100)
  const todayStr = useMemo(
    () => new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
    [],
  )

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

  const isMobile = useIsMobile()
  const isMini = isMobile && sheet === 'mini'   // desktop always shows full content
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

            {/* ── Tonight's Moon: live phase from Earth ── */}
            <div className={styles.phaseToggleRow}>
              <span className={styles.phaseToggleLabel}>Tonight&apos;s Moon · From Earth</span>
              <button
                className={styles.phaseToggle}
                data-on={showPhase}
                onClick={() => setShowPhase(v => !v)}
                aria-pressed={showPhase}
                aria-label="Toggle tonight's moon phase"
              >
                <span className={styles.phaseToggleKnob} />
              </button>
            </div>

            {showPhase && (
              <div className={styles.phaseCard}>
                <MoonPhaseGlyph p={moon.p} />
                <div className={styles.phaseInfo}>
                  <p className={styles.phaseName}>{moon.name}</p>
                  <p className={styles.phasePct}>{phasePct}% illuminated</p>
                  <div className={styles.phaseMeta}>
                    <span className={styles.phaseTag}>
                      {moon.name === 'Full Moon' || moon.name === 'New Moon'
                        ? '● ' + moon.name
                        : (moon.waxing ? '↑ Waxing' : '↓ Waning')}
                    </span>
                    <span className={styles.phaseTag}>Day {Math.round(moon.age)} / 29.5</span>
                  </div>
                  <p className={styles.phaseDate}>{todayStr}</p>
                </div>
              </div>
            )}

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
