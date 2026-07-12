import { useState } from 'react'
import styles from './PagesPill.module.css'
import { FilterIcon } from '../BottomBar/BottomBar'

const PAGES = [
  { id: 'earth',     scale: 'earth',  label: 'Earth' },
  { id: 'moon',      scale: 'moon',   label: 'Moon' },
  { id: 'solar',     scale: 'solar',  label: 'Solar System' },
  { id: 'galaxy',    scale: 'galaxy', label: 'Deep Space' },
  { id: 'rockets',   filter: true,    label: 'Launches' },
  { id: 'asteroids', filter: true,    label: 'NEO' },
  { id: 'flights',   page: 'flight',  label: 'Flights near you' },
  { id: 'planes',    page: 'planes',  label: 'Live fleets' },
  { id: 'journal',   page: 'blog',    label: 'Journal' },
]

function PageIcon({ id, size = 16 }) {
  switch (id) {
    case 'earth': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="12" r="10" /><path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    )
    case 'moon': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
      </svg>
    )
    case 'solar': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    )
    case 'galaxy': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="12" r="2" />
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10" />
        <path d="M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2" />
        <path d="M2 12c0-3 4-6 10-6s10 3 10 6-4 6-10 6-10-3-10-6" />
      </svg>
    )
    case 'rockets':
    case 'asteroids':
      return <FilterIcon id={id} size={size} />
    case 'flights': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
      </svg>
    )
    case 'planes': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 3 7.5 12 12l9-4.5L12 3z" />
        <path d="M3 12l9 4.5 9-4.5" />
        <path d="M3 16.5 12 21l9-4.5" />
      </svg>
    )
    case 'journal': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    )
    default: return null
  }
}

export default function PagesPill({
  activeScale, activeFilter, activePage,
  onScaleChange, onActiveFilterChange, onFiltersChange,
  onLaunchPanelToggle, onPageOpen, hidden, overPage,
}) {
  const [expanded, setExpanded] = useState(false)
  if (hidden) return null

  const handleClick = (page) => {
    if (page.page) {
      onPageOpen?.(page.page)
      return
    }
    if (page.id === 'rockets') {
      onLaunchPanelToggle?.()
      return
    }
    if (page.filter) {
      onActiveFilterChange?.(activeFilter === page.id ? null : page.id)
      onFiltersChange?.(activeFilter === page.id ? {} : { type: page.id })
      if (page.id === 'asteroids') onScaleChange?.('solar')
      return
    }
    onActiveFilterChange?.(null)
    onFiltersChange?.({})
    onScaleChange?.(page.scale)
  }

  const isActive = (page) => {
    if (page.page) return activePage === page.page
    if (activePage) return false      // a page overlay is open → no scale/filter is "active"
    if (page.filter) return activeFilter === page.id
    return activeScale === page.scale && !activeFilter
  }

  return (
    <nav data-pagespill className={`${styles.pill} ${overPage ? styles.overPage : ''} ${expanded ? styles.expanded : ''}`} aria-label="Pages">
      <button
        className={styles.toggle}
        onClick={() => setExpanded(e => !e)}
        aria-label={expanded ? 'Show fewer' : 'Show all'}
        title={expanded ? 'Show fewer' : 'Show all'}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {expanded ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {PAGES.map(page => (
        <button
          key={page.id}
          className={`${styles.btn} ${isActive(page) ? styles.active : ''}`}
          onClick={() => handleClick(page)}
          title={page.label}
          aria-label={page.label}
        >
          <PageIcon id={page.id} />
          {isActive(page) && <span className={styles.activeLabel}>{page.label}</span>}
        </button>
      ))}
    </nav>
  )
}
