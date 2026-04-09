import { useState, useEffect } from 'react'
import styles from './FilterRail.module.css'

const NAV_ITEMS = [
  { id: 'satellites', icon: 'satellite_alt',   label: 'Satellites', type: 'satellites', scale: 'earth' },
  { id: 'flights',    icon: 'flight',           label: 'Flights',    type: 'planes',     scale: 'earth' },
  { id: 'asteroids',  icon: 'wb_iridescent',    label: 'Asteroids',  type: 'asteroids',  scale: 'solar' },
  { id: 'ships',      icon: 'directions_boat',  label: 'Ships',      type: 'ships',      scale: 'earth' },
  { id: 'rockets',    icon: 'rocket_launch',    label: 'Launches',   type: 'rockets',    scale: 'earth' },
]

export default function FilterRail({
  onFiltersChange,
  onCameraScale,
  onLaunchPanelToggle,
  launchPanelOpen,
  onActiveFilterChange,
  activeFilter,
  sidebarOpen,
  onSidebarToggle,
}) {
  const [activeId, setActiveId] = useState(null)

  // Sync local chip highlight when parent clears the filter externally
  useEffect(() => {
    if (activeFilter == null) setActiveId(null)
    else setActiveId(activeFilter)
  }, [activeFilter])

  // Keep CSS variable in sync so dependent overlays reposition
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', sidebarOpen ? '256px' : '0px')
  }, [sidebarOpen])

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && sidebarOpen) onSidebarToggle?.() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [sidebarOpen, onSidebarToggle])

  const handleClick = (item) => {
    const isDeselect = activeId === item.id
    if (isDeselect) {
      setActiveId(null)
      onActiveFilterChange?.(null)
      onFiltersChange({ type: 'all', altitude: 'all' })
      onCameraScale?.('earth')
      if (item.id === 'rockets') onLaunchPanelToggle?.()
      return
    }
    setActiveId(item.id)
    onActiveFilterChange?.(item.id)
    onFiltersChange({ type: item.type, altitude: 'all' })
    onCameraScale?.(item.scale)
    if (item.id === 'rockets') onLaunchPanelToggle?.()
  }

  return (
    <>
      {/* ── Backdrop ── */}
      {sidebarOpen && (
        <div
          className={styles.backdrop}
          onClick={onSidebarToggle}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar drawer ── */}
      <aside
        className={`${styles.sidebar} ${sidebarOpen ? styles.open : ''}`}
        aria-label="Navigation"
        aria-hidden={!sidebarOpen}
      >
        {/* Brand */}
        <div className={styles.brand}>
          <p className={styles.missionLabel}>Mission Control</p>
          <h2 className={styles.sectorName}>Sector 7G</h2>
        </div>

        {/* Nav items */}
        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const isActive = activeId === item.id || (item.id === 'rockets' && launchPanelOpen)
            return (
              <button
                key={item.id}
                className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                onClick={() => handleClick(item)}
                aria-pressed={isActive}
              >
                <span className={`material-symbols-outlined ${styles.navIcon}`}>{item.icon}</span>
                <span className={styles.navLabel}>{item.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Bottom */}
        <div className={styles.bottom}>
          <button className={styles.navItem}>
            <span className={`material-symbols-outlined ${styles.navIcon}`}>settings</span>
            <span className={styles.navLabel}>Settings</span>
          </button>
        </div>
      </aside>
    </>
  )
}
