import styles from './PlanetPanel.module.css'
import { PLANET_DATA } from '../Globe/planetData.js'

function StatRow({ label, value }) {
  if (value == null || value === '') return null
  return (
    <div className={styles.statRow}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
    </div>
  )
}

export default function PlanetPanel({ planet, onClose, onFocus }) {
  if (!planet) return null
  const d = PLANET_DATA[planet]
  if (!d) return null

  const tempStr = d.tempMin != null && d.tempMax != null
    ? `${d.tempMin} °C → ${d.tempMax} °C`
    : d.tempAvg != null ? `${d.tempAvg} °C (avg)` : null

  const moonsStr = d.moons === 0
    ? 'None'
    : d.moonNames?.length
      ? `${d.moons} (${d.moonNames.slice(0, 3).join(', ')}${d.moons > 3 ? '…' : ''})`
      : String(d.moons)

  return (
    <aside className={styles.panel} aria-label={`${d.title} details`}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.symbol} style={{ color: d.color }}>{d.symbol}</div>
        <div className={styles.titles}>
          <h2 className={styles.name}>{d.title}</h2>
          <span className={styles.typeBadge} style={{ background: d.typeColor + '22', color: d.typeColor, borderColor: d.typeColor + '44' }}>
            {d.type}
          </span>
        </div>
        <button className={styles.close} onClick={onClose} aria-label="Close">✕</button>
      </div>

      {/* Stats */}
      <div className={styles.stats}>
        <StatRow label="Distance from Sun"  value={`${d.distanceAU} AU`} />
        <StatRow label="Orbital period"     value={d.periodDays >= 1000 ? `${(d.periodDays / 365.25).toFixed(1)} yr` : `${d.periodDays} days`} />
        <StatRow label="Day length"         value={d.dayHours >= 24 ? `${(d.dayHours / 24).toFixed(1)} d` : `${d.dayHours} hr`} />
        <StatRow label="Diameter"           value={`${d.diameterKM.toLocaleString()} km`} />
        <StatRow label="Mass (Earth = 1)"   value={d.massEarth} />
        <StatRow label="Surface gravity"    value={`${d.gravity} g`} />
        <StatRow label="Moons"              value={moonsStr} />
        <StatRow label="Temperature"        value={tempStr} />
        <StatRow label="Atmosphere"         value={d.atmosphere} />
      </div>

      {/* Facts */}
      <p className={styles.facts}>{d.facts}</p>

      {/* Focus button */}
      <button className={styles.focusBtn} onClick={onFocus}>
        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>center_focus_strong</span>
        Focus Planet
      </button>
    </aside>
  )
}
