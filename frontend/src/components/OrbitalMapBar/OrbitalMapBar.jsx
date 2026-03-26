import { useState } from 'react'
import styles from './OrbitalMapBar.module.css'

// ── Cosmic Address — concentric rings diagram ────────────────────────────────
// Each ring = one zoom level of our cosmic address, inner → outer = home → cosmos
const CA_RINGS = [
  { r: 58, label: 'Laniakea SC',  dim: '520 Mpc', c: 'rgba(38,56,126,0.22)',  ly: 10  },
  { r: 51, label: 'Virgo SC',     dim: '33 Mpc',  c: 'rgba(46,74,148,0.30)',  ly: 26  },
  { r: 43, label: 'Local Group',  dim: '3 Mpc',   c: 'rgba(54,94,168,0.38)',  ly: 42  },
  { r: 33, label: 'Milky Way',    dim: '30 kpc',  c: 'rgba(62,116,186,0.47)', ly: 58  },
  { r: 23, label: 'Orion Arm',    dim: '1.1 kpc', c: 'rgba(54,146,210,0.56)', ly: 74  },
  { r: 13, label: 'Solar System', dim: '287 AU',  c: 'rgba(0,194,224,0.66)',  ly: 90  },
  { r: 5,  label: 'Earth',        dim: '◉ you are here', c: '#00e5ff',        ly: 106 },
]

function CosmicAddressWidget() {
  const cx = 60, cy = 61   // circle center in the SVG
  const tickX = 122         // x where tick lines converge before labels

  return (
    <div className={styles.cosmicWrap}>
      <p className={styles.cosmicHeader}>
        <span className="material-symbols-outlined" style={{ fontSize: 9, verticalAlign: 'middle', marginRight: 3 }}>
          explore
        </span>
        COSMIC ADDRESS
      </p>

      <svg viewBox="0 0 218 122" className={styles.cosmicSvg} aria-label="Cosmic Address — nested rings">
        <defs>
          {/* Earth center glow */}
          <radialGradient id="caGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#00e5ff" stopOpacity="0" />
          </radialGradient>
          {/* Bloom filter for Earth dot */}
          <filter id="caBloom" x="-150%" y="-150%" width="400%" height="400%">
            <feGaussianBlur stdDeviation="1.8" result="b" />
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* Faint star scatter */}
        {[[8,8],[22,18],[14,48],[30,80],[48,6],[52,102],[35,38],[18,96],[44,72]].map(([x,y],i) => (
          <circle key={i} cx={x} cy={y} r={0.5 + (i%3)*0.3} fill="white" opacity={0.12 + (i%4)*0.06} />
        ))}

        {/* Concentric rings → tick lines → labels (outer first so inner renders on top) */}
        {CA_RINGS.map((ring) => (
          <g key={ring.label}>
            {/* The ring itself */}
            <circle
              cx={cx} cy={cy} r={ring.r}
              fill="none"
              stroke={ring.c}
              strokeWidth={ring.r === 5 ? 1.4 : 0.65}
              strokeDasharray={ring.r > 5 ? '2.5 4.5' : undefined}
            />
            {/* Tick: from ring's 3-o'clock edge → label column */}
            <line
              x1={cx + ring.r} y1={cy}
              x2={tickX} y2={ring.ly}
              stroke={ring.c}
              strokeWidth="0.45"
              opacity="0.5"
            />
            {/* Name */}
            <text
              x={tickX + 4} y={ring.ly + 4}
              fontFamily="'IBM Plex Mono',monospace"
              fontSize="6.5"
              fill={ring.c}
              letterSpacing="0.25"
            >{ring.label}</text>
            {/* Scale dim */}
            <text
              x={tickX + 4} y={ring.ly + 12}
              fontFamily="'IBM Plex Mono',monospace"
              fontSize="5.5"
              fill={ring.c}
              opacity="0.52"
              letterSpacing="0.2"
            >{ring.dim}</text>
          </g>
        ))}

        {/* Earth glow halo */}
        <circle cx={cx} cy={cy} r={11} fill="url(#caGlow)" />

        {/* Earth: pulsing animated dot */}
        <circle cx={cx} cy={cy} r={2.8} fill="#00e5ff" filter="url(#caBloom)">
          <animate attributeName="r"       values="2.8;4.6;2.8" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.4;1"     dur="2.4s" repeatCount="indefinite" />
        </circle>
        {/* Hard inner dot — always solid */}
        <circle cx={cx} cy={cy} r={1.1} fill="#ffffff" />
      </svg>
    </div>
  )
}

const CATEGORIES = [
  { id: 'all',        icon: 'public',          label: 'All',       type: 'all',       scale: 'earth' },
  { id: 'satellites', icon: 'satellite_alt',   label: 'Satellites', type: 'satellites', scale: 'earth' },
  { id: 'flights',    icon: 'flight',          label: 'Flights',   type: 'planes',    scale: 'earth' },
  { id: 'ships',      icon: 'directions_boat', label: 'Ships',     type: 'ships',     scale: 'earth' },
  { id: 'rockets',    icon: 'rocket_launch',   label: 'Launches',  type: 'rockets',   scale: 'earth' },
  { id: 'asteroids',  icon: 'wb_iridescent',   label: 'Asteroids', type: 'asteroids', scale: 'solar' },
]

const TABS = [
  { id: 'map',       icon: 'layers',     label: 'Map View' },
  { id: 'telemetry', icon: 'monitoring', label: 'Telemetry' },
  { id: 'orbit',     icon: 'timeline',   label: 'Orbit History' },
]

// Altitude slider value (0-100) maps to three bands
function altBand(v) {
  if (v < 33) return 'low'
  if (v < 66) return 'mid'
  return 'high'
}

export default function OrbitalMapBar({
  onFiltersChange,
  onCameraScale,
  onActiveFilterChange,
  onLaunchPanelToggle,
}) {
  const [activeTab,   setActiveTab]   = useState('telemetry')
  const [activeCat,   setActiveCat]   = useState('all')
  const [altValue,    setAltValue]    = useState(100)   // 100 = show all / GEO
  const [currentType, setCurrentType] = useState('all')
  const [dockOpen,    setDockOpen]    = useState(false)

  function handleCat(cat) {
    const isDeselect = activeCat === cat.id
    const nextId   = isDeselect ? 'all' : cat.id
    const nextType = isDeselect ? 'all' : cat.type
    const nextScale = isDeselect ? 'earth' : cat.scale

    setActiveCat(nextId)
    setCurrentType(nextType)
    const band = altValue >= 99 ? 'all' : altBand(altValue)
    onFiltersChange?.({ type: nextType, altitude: band })
    onCameraScale?.(nextScale)
    onActiveFilterChange?.(isDeselect ? null : cat.id)
    if (cat.id === 'rockets') onLaunchPanelToggle?.()
  }

  function handleAlt(e) {
    const v = Number(e.target.value)
    setAltValue(v)
    const band = v >= 99 ? 'all' : altBand(v)
    onFiltersChange?.({ type: currentType, altitude: band })
  }

  const altLabel = altValue >= 99 ? 'ALL' : altValue < 33 ? 'LEO' : altValue < 66 ? 'MEO' : 'GEO'

  return (
    <>
      {/* Cosmic address — top-left, below HUD */}
      <CosmicAddressWidget />

      {/* Mobile: always-visible category chip strip above the stream peek */}
      <div className={styles.mobileBar} data-tour="filter-bar">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            className={`${styles.mobileChip} ${activeCat === cat.id ? styles.mobileChipOn : ''}`}
            onClick={() => handleCat(cat)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{cat.icon}</span>
            <span className={styles.mobileChipLabel}>{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Desktop: hover/tap-to-expand dock */}
      <div className={`${styles.dockWrap}${dockOpen ? ` ${styles.dockOpen}` : ''}`} data-tour="filter-bar">
        {/* Collapsed indicator bar (always visible) — tap on mobile to open */}
        <div className={styles.collapseBar} onClick={() => setDockOpen(o => !o)}>
          <span className={styles.collapseHandle} />
        </div>

        {/* Expanded content */}
        <div className={styles.dockContent}>
          {/* Category chips row */}
          <div className={styles.filterStrip}>
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                className={`${styles.catChip} ${activeCat === cat.id ? styles.catChipOn : ''}`}
                onClick={() => handleCat(cat)}
                title={cat.label}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{cat.icon}</span>
                {cat.label}
              </button>
            ))}

            <div className={styles.stripDivider} />

            {/* Altitude slider */}
            <div className={styles.sliderCol}>
              <span className={styles.sliderLabel}>Alt</span>
              <input
                type="range"
                min={0}
                max={100}
                value={altValue}
                onChange={handleAlt}
                className={styles.altSlider}
              />
              <span className={styles.altBadge}>{altLabel}</span>
            </div>
          </div>

          <div className={styles.dockDivider} />

          {/* Tab strip */}
          <div className={styles.tabStrip}>
            {TABS.map((tab, i) => (
              <span key={tab.id} className={styles.tabItem}>
                {i > 0 && <span className={styles.tabDivider} />}
                <button
                  className={`${styles.tabBtn} ${activeTab === tab.id ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{tab.icon}</span>
                  {tab.label}
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
