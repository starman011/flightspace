import { useState, useEffect } from 'react'
import styles from './LaunchPanel.module.css'

const API = import.meta.env.VITE_API_URL || ''

/** Parse ISO date → { dd, hh, mm, ss } parts, or null if launched */
function parseCountdown(netISO) {
  if (!netISO) return null
  const diff = new Date(netISO) - Date.now()
  if (diff <= 0) return null
  return {
    dd: String(Math.floor(diff / 86400000)).padStart(2, '0'),
    hh: String(Math.floor((diff % 86400000) / 3600000)).padStart(2, '0'),
    mm: String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0'),
    ss: String(Math.floor((diff % 60000) / 1000)).padStart(2, '0'),
  }
}

function useCountdownParts(netISO) {
  const [parts, setParts] = useState(() => parseCountdown(netISO))
  useEffect(() => {
    if (!netISO) return
    const tick = () => setParts(parseCountdown(netISO))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [netISO])
  return parts
}

function useCountdownLabel(netISO) {
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

/** Hero countdown for the first upcoming launch */
function HeroCountdown({ launch }) {
  const parts = useCountdownParts(launch?.net)
  if (!launch) return null

  const statusClass = launch.status_abbr === 'Go' ? styles.statusGo
    : launch.status_abbr === 'TBD' ? styles.statusTbd
    : styles.statusHold

  return (
    <div className={styles.heroSection}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <span className={`${styles.statusChip} ${statusClass}`}>{launch.status_abbr || '?'}</span>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-label-md)', color: 'var(--on-surface)' }}>
          {launch.mission_name || launch.name}
        </span>
      </div>

      {parts ? (
        <div className={styles.countdown}>
          {[['dd','Days'],['hh','Hrs'],['mm','Min'],['ss','Sec']].map(([key, lab], i) => (
            <span key={key} style={{ display: 'flex', alignItems: 'baseline' }}>
              {i > 0 && <span className={styles.countSep}>:</span>}
              <span className={styles.countUnit}>
                <span className={styles.countNum}>{parts[key]}</span>
                <span className={styles.countLabel}>{lab}</span>
              </span>
            </span>
          ))}
        </div>
      ) : (
        <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--tertiary-container)', fontSize: '1.25rem', fontWeight: 700, padding: '8px 0' }}>
          LAUNCHED
        </div>
      )}

      <div className={styles.heroMeta}>
        <div className={styles.heroMetaItem}>
          <span className={styles.heroMetaLabel}>Launch Window</span>
          <span className={styles.heroMetaValue}>
            {launch.net ? new Date(launch.net).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'TBD'}
          </span>
        </div>
        <div className={styles.heroMetaItem}>
          <span className={styles.heroMetaLabel}>Pad Location</span>
          <span className={styles.heroMetaValue}>{launch.pad || 'TBD'}</span>
        </div>
      </div>
    </div>
  )
}

function MissionRow({ launch, onClick, isPinned, onPin }) {
  const label = useCountdownLabel(launch.net)
  const isPast = launch.is_past
  const statusClass = launch.status_abbr === 'Go' ? styles.statusGo
    : launch.status_abbr === 'TBD' ? styles.statusTbd
    : styles.statusHold

  return (
    <div className={styles.missionRow} onClick={() => onClick?.(launch)} style={{ cursor: 'pointer' }}>
      <div className={styles.missionIcon}>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--primary)', opacity: 0.7 }}>
          rocket_launch
        </span>
      </div>
      <div className={styles.missionBody}>
        <p className={styles.missionName}>{launch.mission_name || launch.name}</p>
        <p className={styles.missionSub}>
          {launch.provider}{launch.rocket ? ` • ${launch.rocket}` : ''}
        </p>
      </div>
      <div className={styles.missionRight}>
        <p className={styles.missionDate}>
          {isPast ? 'Past' : label || '—'}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            className={`${styles.pinBtn} ${isPinned ? styles.pinBtnActive : ''}`}
            title={isPinned ? 'Unpin from home' : 'Pin countdown to home'}
            onClick={(e) => { e.stopPropagation(); onPin?.(isPinned ? null : launch) }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
              {isPinned ? 'push_pin' : 'keep'}
            </span>
          </button>
          <span className={`${styles.statusChip} ${statusClass}`}>{launch.status_abbr || '?'}</span>
        </div>
      </div>
    </div>
  )
}

function MissionDetail({ launch, onBack, onLocatePad, onClose, isPinned, onPin }) {
  const parts = useCountdownParts(launch.net)
  const statusClass = launch.status_abbr === 'Go' ? styles.statusGo
    : launch.status_abbr === 'TBD' ? styles.statusTbd
    : styles.statusHold

  return (
    <div className={styles.detailView}>
      {/* Back */}
      <button className={styles.detailBack} onClick={onBack}>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
        Mission Manifest
      </button>


      {/* Status + name */}
      <div className={styles.detailHeader}>
        <span className={`${styles.statusChip} ${statusClass}`}>{launch.status || launch.status_abbr}</span>
        <h2 className={styles.detailTitle}>{launch.mission_name || launch.name}</h2>
        <p className={styles.detailSub}>{launch.provider}{launch.rocket ? ` · ${launch.rocket}` : ''}</p>
      </div>

      {/* Countdown */}
      {parts && (
        <div className={styles.detailCountdown}>
          {[['dd','D'],['hh','H'],['mm','M'],['ss','S']].map(([key, lab], i) => (
            <span key={key} className={styles.detailCountUnit}>
              {i > 0 && <span className={styles.countSep}>:</span>}
              <span className={styles.countNum} style={{ fontSize: '1.6rem' }}>{parts[key]}</span>
              <span className={styles.countLabel}>{lab}</span>
            </span>
          ))}
        </div>
      )}

      {/* Info grid */}
      <div className={styles.detailGrid}>
        <div className={styles.detailCell}>
          <span className={styles.detailCellLabel}>Launch Window</span>
          <span className={styles.detailCellValue}>
            {launch.net
              ? new Date(launch.net).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
              : 'TBD'}
          </span>
        </div>
        {launch.orbit && (
          <div className={styles.detailCell}>
            <span className={styles.detailCellLabel}>Target Orbit</span>
            <span className={styles.detailCellValue}>{launch.orbit}</span>
          </div>
        )}
        <div className={`${styles.detailCell} ${styles.detailCellFull}`}>
          <span className={styles.detailCellLabel}>Launch Pad</span>
          <span className={styles.detailCellValue}>{launch.pad || 'TBD'}</span>
          {launch.pad_lat && launch.pad_lon && (
            <span className={styles.detailCoords}>
              {Math.abs(launch.pad_lat).toFixed(4)}°{launch.pad_lat >= 0 ? 'N' : 'S'} &nbsp;
              {Math.abs(launch.pad_lon).toFixed(4)}°{launch.pad_lon >= 0 ? 'E' : 'W'}
            </span>
          )}
        </div>
      </div>

      {/* Mission description */}
      {launch.mission_desc && (
        <div className={styles.detailDesc}>
          <p className={styles.detailDescLabel}>Mission Overview</p>
          <p className={styles.detailDescText}>{launch.mission_desc}</p>
        </div>
      )}

      {/* Pin to Home */}
      <button
        className={`${styles.pinDetailBtn} ${isPinned ? styles.pinDetailBtnActive : ''}`}
        onClick={() => onPin?.(isPinned ? null : launch)}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
          {isPinned ? 'push_pin' : 'keep'}
        </span>
        {isPinned ? 'Pinned to Home Screen' : 'Pin Countdown to Home Screen'}
      </button>

      {/* Ping on Globe */}
      <button
        className={styles.pingBtn}
        onClick={() => { onLocatePad?.(launch); onClose?.() }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>location_on</span>
        Ping Launch Pad on Globe
      </button>

      {/* Read more articles */}
      {(() => {
        const q = encodeURIComponent(launch.mission_name || launch.name)
        const rq = encodeURIComponent(launch.rocket || launch.provider)
        const articles = [
          {
            icon: 'newspaper',
            label: 'SpaceFlightNow — Mission Report',
            href: `https://spaceflightnow.com/?s=${q}`,
          },
          {
            icon: 'rocket_launch',
            label: 'NASASpaceflight — Coverage',
            href: `https://www.nasaspaceflight.com/?s=${q}`,
          },
          {
            icon: 'play_circle',
            label: 'YouTube — Watch Launch',
            href: `https://www.youtube.com/results?search_query=${q}+launch`,
          },
          {
            icon: 'public',
            label: `Wikipedia — ${launch.rocket || launch.provider}`,
            href: `https://en.wikipedia.org/wiki/Special:Search/${rq}`,
          },
          {
            icon: 'travel_explore',
            label: 'Space.com — News Coverage',
            href: `https://www.space.com/search?q=${q}`,
          },
        ]
        return (
          <div className={styles.detailLinks}>
            <p className={styles.detailLinksLabel}>Read More</p>
            {articles.map(a => (
              <a key={a.href} className={styles.detailLink} href={a.href} target="_blank" rel="noopener noreferrer">
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{a.icon}</span>
                {a.label}
                <span className="material-symbols-outlined" style={{ fontSize: 12, marginLeft: 'auto', opacity: 0.4 }}>open_in_new</span>
              </a>
            ))}
          </div>
        )
      })()}
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
 * LaunchPanel — Mission Launchpad (Final) design.
 * Hero countdown at top for next launch + mission manifest list.
 */
export default function LaunchPanel({ open, onClose, onLocatePad, pinnedLaunchId, onPinLaunch, openToMission }) {
  const [data, setData]                   = useState(null)
  const [loading, setLoading]             = useState(false)
  const [selectedMission, setSelected]    = useState(null)

  useEffect(() => {
    if (!open || data) return
    setLoading(true)
    fetch(`${API}/api/v1/launches`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(d => { if (d.upcoming) { setData(d); } setLoading(false) })
      .catch(() => setLoading(false))
  }, [open])

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


  const nextLaunch = data?.upcoming?.[0]

  // Clear selection and data when panel closes so it re-fetches fresh on next open
  useEffect(() => { if (!open) { setSelected(null); setData(null) } }, [open])

  // When panel opens via pad-exit return, jump straight to that mission's detail
  useEffect(() => {
    if (open && openToMission) setSelected(openToMission)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <aside
      className={`${styles.panel} ${open ? styles.open : ''}`}
      aria-label="Mission Launchpad"
    >
      {/* Panel header */}
      <div className={styles.header}>
        <span className={styles.title}>
          {selectedMission ? 'Mission Detail' : 'Mission Launchpad'}
        </span>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
      </div>

      {/* ── Mission detail view ── */}
      {selectedMission ? (
        <MissionDetail
          launch={selectedMission}
          onBack={() => setSelected(null)}
          onLocatePad={onLocatePad}
          onClose={onClose}
          isPinned={pinnedLaunchId === selectedMission.id}
          onPin={onPinLaunch}
        />
      ) : (
        <>
          {nextLaunch && <HeroCountdown launch={nextLaunch} />}
          {loading && <div className={styles.loading}>fetching manifest…</div>}

          {data && (
            <div className={styles.scroll}>
              <PeopleSection people={data.people_in_space} />

              {data.upcoming?.length > 0 && (
                <section>
                  <div className={styles.sectionHead}>
                    <span className={styles.sectionLabel}>Mission Manifest</span>
                  </div>
                  {data.upcoming.map(l => (
                    <MissionRow
                      key={l.id} launch={l} onClick={setSelected}
                      isPinned={pinnedLaunchId === l.id}
                      onPin={onPinLaunch}
                    />
                  ))}
                </section>
              )}

              {data.recent?.length > 0 && (
                <section>
                  <div className={styles.sectionHead}>
                    <span className={styles.sectionLabel}>Archive</span>
                  </div>
                  {data.recent.map(l => (
                    <MissionRow key={l.id} launch={l} onClick={setSelected} />
                  ))}
                </section>
              )}
            </div>
          )}
        </>
      )}
    </aside>
  )
}
