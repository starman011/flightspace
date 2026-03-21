import { useState, useEffect, useRef } from 'react'
import styles from './LaunchPanel.module.css'

const API = import.meta.env.VITE_API_URL || ''

function useCountdown(netISO) {
  const [label, setLabel] = useState('')
  useEffect(() => {
    if (!netISO) return
    const tick = () => {
      const diff = new Date(netISO) - Date.now()
      if (diff <= 0) { setLabel('LAUNCHED'); return }
      const d = Math.floor(diff / 86400000)
      const h = Math.floor((diff % 86400000) / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      if (d > 0) setLabel(`T− ${d}d ${h}h ${m}m`)
      else if (h > 0) setLabel(`T− ${h}h ${m}m ${s}s`)
      else setLabel(`T− ${m}m ${s}s`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [netISO])
  return label
}

function LaunchCard({ launch, onLocate }) {
  const countdown = useCountdown(launch.net)
  const isPast = launch.is_past
  const statusClass = launch.status_abbr === 'Go' ? styles.statusGo
    : launch.status_abbr === 'TBD' ? styles.statusTbd
    : styles.statusHold

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={`${styles.statusChip} ${statusClass}`}>{launch.status_abbr || '?'}</span>
        {launch.orbit && <span className={styles.orbitChip}>{launch.orbit}</span>}
        {!isPast && <span className={styles.countdown}>{countdown}</span>}
      </div>

      <div className={styles.missionName}>{launch.mission_name || launch.name}</div>
      <div className={styles.rocketRow}>
        <span className={styles.rocket}>{launch.rocket}</span>
        <span className={styles.provider}>{launch.provider}</span>
      </div>
      <div className={styles.pad}>{launch.pad}</div>

      {launch.mission_desc && (
        <p className={styles.desc}>{launch.mission_desc.slice(0, 160)}{launch.mission_desc.length > 160 ? '…' : ''}</p>
      )}

      {!isPast && launch.pad_lat !== 0 && (
        <button className={styles.locateBtn} onClick={() => onLocate(launch)}>
          ◎ locate pad
        </button>
      )}
    </div>
  )
}

function PeopleSection({ people }) {
  const [open, setOpen] = useState(false)
  if (!people?.people?.length) return null
  const inSpace = people.people.filter(p => p.craft !== 'Earth')
  if (!inSpace.length) return null

  return (
    <div className={styles.peopleSection}>
      <button className={styles.peopleToggle} onClick={() => setOpen(o => !o)}>
        <span className={styles.peopleCount}>{people.number}</span>
        <span className={styles.peopleLabel}>people in space</span>
        <span className={styles.peopleChevron}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className={styles.peopleList}>
          {inSpace.map((p, i) => (
            <div key={i} className={styles.personRow}>
              <span className={styles.personName}>{p.name}</span>
              <span className={styles.personCraft}>{p.craft}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * LaunchPanel — right-anchored sliding panel for rocket launches & crew.
 *
 * Props:
 *   open       boolean
 *   onClose()
 *   onLocatePad({ pad_lat, pad_lon }) — asks Globe to fly to launch pad
 */
export default function LaunchPanel({ open, onClose, onLocatePad }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open || data) return
    setLoading(true)
    fetch(`${API}/api/v1/launches`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [open])

  // Refresh every 15 min while open
  useEffect(() => {
    if (!open) return
    const id = setInterval(() => {
      fetch(`${API}/api/v1/launches`)
        .then(r => r.json())
        .then(setData)
        .catch(() => {})
    }, 15 * 60 * 1000)
    return () => clearInterval(id)
  }, [open])

  // Click-outside close
  useEffect(() => {
    if (!open) return
    const delay = setTimeout(() => {
      const handler = (e) => {
        if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
      }
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }, 120)
    return () => clearTimeout(delay)
  }, [open, onClose])

  return (
    <aside
      ref={panelRef}
      className={`${styles.panel} ${open ? styles.open : ''}`}
      aria-label="Launch manifest"
    >
      <div className={styles.header}>
        <span className={styles.title}>Launches</span>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
      </div>

      {loading && <div className={styles.loading}>fetching manifest…</div>}

      {data && (
        <div className={styles.scroll}>
          <PeopleSection people={data.people_in_space} />

          {data.upcoming?.length > 0 && (
            <section>
              <div className={styles.sectionLabel}>upcoming</div>
              {data.upcoming.map(l => (
                <LaunchCard key={l.id} launch={l} onLocate={onLocatePad} />
              ))}
            </section>
          )}

          {data.recent?.length > 0 && (
            <section>
              <div className={styles.sectionLabel}>recent</div>
              {data.recent.map(l => (
                <LaunchCard key={l.id} launch={l} onLocate={onLocatePad} />
              ))}
            </section>
          )}
        </div>
      )}
    </aside>
  )
}
