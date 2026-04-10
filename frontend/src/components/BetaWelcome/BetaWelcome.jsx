import { useState, useEffect } from 'react'
import styles from './BetaWelcome.module.css'

const STORAGE_KEY = 'flightspace_sessions'

const FEATURES = [
  {
    title: 'Live Flight Tracking',
    icon: '✈',
    items: [
      'Real-time aircraft, satellites & ships on a 3D globe',
      'Click any flight for route, ETA, altitude, speed & aircraft photos',
      'Filter by planes, helicopters, satellites, ships',
      'Search by callsign, flight number, or ICAO code',
      'Live trail ribbons tracing flight paths',
    ],
  },
  {
    title: 'Signal Stream',
    icon: '📡',
    items: [
      'ISS live tracker with pass predictions',
      'NASA Astronomy Picture of the Day',
      'Solar activity & aurora forecast (NOAA Kp index)',
      'Meteor shower calendar with peak dates & ZHR',
      'Space news feed from Spaceflight News API',
      'Visible planets tonight & daily space quotes',
    ],
  },
  {
    title: 'The Moon',
    icon: '🌙',
    items: [
      'High-res 3D lunar surface with real landing sites',
      'Apollo missions, Chang\'e, Chandrayaan & more',
      'Mineral resource maps — Iron, Titanium, Water Ice, Thorium',
      'Live lunar orbiters with real JPL Horizons orbits',
    ],
  },
  {
    title: 'Solar System',
    icon: '🪐',
    items: [
      'All 8 planets with orbital mechanics visualization',
      'Planet details — mass, gravity, atmosphere, moons',
      'Fly-to any planet with cinematic camera transitions',
    ],
  },
  {
    title: 'Deep Space',
    icon: '🌌',
    items: [
      'Stars & constellations with mythology descriptions',
      'Near-Earth asteroids (NEOs) with hazard levels',
      'AR Free Look mode — point your phone at the sky',
      'Cosmic address — Earth to Laniakea Supercluster',
    ],
  },
  {
    title: 'Launches & Airports',
    icon: '🚀',
    items: [
      'Upcoming rocket launches with live countdowns',
      'Pad locations with fly-to navigation',
      'Airport panels with inbound traffic & ETA',
    ],
  },
]

export default function BetaWelcome() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    const sessions = raw ? parseInt(raw, 10) : 0
    const next = sessions + 1
    localStorage.setItem(STORAGE_KEY, String(next))
    // Show on sessions 1 and 2 only
    if (next <= 2) setVisible(true)
  }, [])

  if (!visible) return null

  return (
    <div className={styles.overlay} onClick={() => setVisible(false)}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <button className={styles.close} onClick={() => setVisible(false)} aria-label="Close">×</button>

        <div className={styles.header}>
          <span className={styles.betaBadge}>BETA</span>
          <h2 className={styles.title}>Welcome to Flightspace</h2>
          <p className={styles.subtitle}>
            A real-time window into everything above us — from flights overhead to the edge of the observable universe.
          </p>
        </div>

        <div className={styles.content}>
          {FEATURES.map(group => (
            <div key={group.title} className={styles.group}>
              <div className={styles.groupHeader}>
                <span className={styles.groupIcon}>{group.icon}</span>
                <h3 className={styles.groupTitle}>{group.title}</h3>
              </div>
              <ul className={styles.list}>
                {group.items.map((item, i) => (
                  <li key={i} className={styles.item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className={styles.footer}>
          <p className={styles.footerText}>
            This is an early beta. Things may break. We&apos;re building in public.
          </p>
          <button className={styles.enterBtn} onClick={() => setVisible(false)}>
            Enter Flightspace
          </button>
        </div>
      </div>
    </div>
  )
}
