import { useState } from 'react'
import styles from './FilterRail.module.css'

const FILTERS = [
  { id: 'flights',    icon: '✈',  label: 'Flights',   type: 'planes',     scale: 'earth' },
  { id: 'ships',      icon: '⛵',  label: 'Ships',     type: 'ships',      scale: 'earth' },
  { id: 'satellites', icon: '🛰',  label: 'Satellites',type: 'satellites', scale: 'earth' },
  { id: 'asteroids',  icon: '☄',  label: 'Asteroids', type: 'asteroids',  scale: 'solar' },
  { id: 'rockets',    icon: '🚀',  label: 'Launches',  type: 'rockets',    scale: 'earth' },
  { id: 'planets',    icon: '🪐',  label: 'Planets',   type: 'planets',    scale: 'solar' },
  { id: 'earth',      icon: '🌍',  label: 'Earth',     type: 'all',        scale: 'earth' },
]

/**
 * FilterRail — left-edge vertical icon strip.
 *
 * Props:
 *   filters        { type, altitude } — current filter state
 *   onFiltersChange(filters)          — called when type filter changes
 *   onCameraScale(scale)              — called with 'earth' | 'solar'
 *   onLaunchPanelToggle()             — called when Rockets icon is clicked
 *   launchPanelOpen  boolean
 */
export default function FilterRail({
  filters,
  onFiltersChange,
  onCameraScale,
  onLaunchPanelToggle,
  launchPanelOpen,
}) {
  const [activeId, setActiveId] = useState(null)

  const handleClick = (f) => {
    const isDeselect = activeId === f.id

    if (isDeselect) {
      // Deselect — return to all / earth
      setActiveId(null)
      onFiltersChange({ type: 'all', altitude: 'all' })
      onCameraScale?.('earth')
      if (f.id === 'rockets') onLaunchPanelToggle?.()
      return
    }

    setActiveId(f.id)
    onFiltersChange({ type: f.type, altitude: 'all' })
    onCameraScale?.(f.scale)

    if (f.id === 'rockets') onLaunchPanelToggle?.()
  }

  return (
    <nav className={styles.rail} aria-label="Entity filters">
      {FILTERS.map((f) => {
        const isActive = activeId === f.id || (f.id === 'rockets' && launchPanelOpen)
        return (
          <button
            key={f.id}
            className={`${styles.btn} ${isActive ? styles.active : ''}`}
            onClick={() => handleClick(f)}
            title={f.label}
            aria-pressed={isActive}
          >
            <span className={styles.icon}>{f.icon}</span>
            <span className={styles.label}>{f.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
