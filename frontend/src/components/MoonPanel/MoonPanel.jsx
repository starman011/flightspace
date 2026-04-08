import { useState } from 'react'
import styles from './MoonPanel.module.css'

const FILTERS = [
  { id: 'iron',     label: 'Iron (FeO)',   color: '#ff6622' },
  { id: 'titanium', label: 'Titanium',     color: '#ffcc00' },
  { id: 'water',    label: 'Water Ice',    color: '#00ccff' },
  { id: 'thorium',  label: 'Thorium',      color: '#ff44ff' },
]

function StatRow({ label, value }) {
  if (value == null) return null
  return (
    <div className={styles.statRow}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
    </div>
  )
}

export default function MoonPanel({ site, onClose, onFlyTo, onFilterChange }) {
  const [activeFilter, setActiveFilter] = useState(null)

  const handleFilter = (id) => {
    const next = activeFilter === id ? null : id
    setActiveFilter(next)
    onFilterChange?.(next)
  }

  // No site selected — show Moon overview + mineral filters
  if (!site) {
    return (
      <aside className={styles.panel} aria-label="Moon details">
        <div className={styles.header}>
          <span className={styles.icon}>🌙</span>
          <div className={styles.titles}>
            <h2 className={styles.name}>The Moon</h2>
            <span className={`${styles.badge} ${styles.robotic}`}>Earth&apos;s Natural Satellite</span>
          </div>
          <button className={styles.close} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.stats}>
          <StatRow label="Distance from Earth" value="384,400 km" />
          <StatRow label="Diameter"            value="3,474 km" />
          <StatRow label="Orbital period"      value="27.3 days" />
          <StatRow label="Surface gravity"     value="0.166 g" />
          <StatRow label="Surface temp"        value="-173 °C → 127 °C" />
          <StatRow label="Atmosphere"          value="None (exosphere)" />
          <StatRow label="Age"                 value="~4.53 billion years" />
          <StatRow label="Landing missions"    value="25+ (6 crewed)" />
        </div>

        <p className={styles.desc}>
          Tap any landing site marker on the globe to see mission details. Use mineral filters below to visualize resource distribution.
        </p>

        <div className={styles.filters}>
          {FILTERS.map(f => (
            <button
              key={f.id}
              className={`${styles.filterBtn} ${activeFilter === f.id ? styles.filterBtnActive : ''}`}
              style={activeFilter === f.id ? { borderColor: f.color + '66', color: f.color, background: f.color + '18' } : {}}
              onClick={() => handleFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </aside>
    )
  }

  // Landing site selected
  const badgeClass = site.type === 'crewed' ? styles.crewed : site.type === 'impact' ? styles.impact : styles.robotic
  const flag = { USA: '🇺🇸', USSR: '🇷🇺', China: '🇨🇳', India: '🇮🇳', Japan: '🇯🇵' }[site.country] || '🏳️'

  return (
    <aside className={styles.panel} aria-label={`${site.name} details`}>
      <div className={styles.header}>
        <span className={styles.icon}>{flag}</span>
        <div className={styles.titles}>
          <h2 className={styles.name}>{site.name}</h2>
          <span className={`${styles.badge} ${badgeClass}`}>{site.type} landing</span>
        </div>
        <button className={styles.close} onClick={onClose} aria-label="Close">✕</button>
      </div>

      <p className={styles.siteName}>{site.site}</p>
      <p className={styles.desc}>{site.desc}</p>
      {site.crew && <p className={styles.crew}>Crew: {site.crew}</p>}

      <div className={styles.stats}>
        <StatRow label="Date"      value={site.date} />
        <StatRow label="Country"   value={site.country} />
        <StatRow label="Latitude"  value={`${site.lat.toFixed(4)}°`} />
        <StatRow label="Longitude" value={`${site.lon.toFixed(4)}°`} />
        <StatRow label="Type"      value={site.type} />
      </div>

      <button className={styles.flyBtn} onClick={() => onFlyTo?.(site.id)}>
        Fly to Site
      </button>

      <div className={styles.filters}>
        {FILTERS.map(f => (
          <button
            key={f.id}
            className={`${styles.filterBtn} ${activeFilter === f.id ? styles.filterBtnActive : ''}`}
            style={activeFilter === f.id ? { borderColor: f.color + '66', color: f.color, background: f.color + '18' } : {}}
            onClick={() => handleFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
    </aside>
  )
}
