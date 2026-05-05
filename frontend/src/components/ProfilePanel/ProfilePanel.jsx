import { useState } from 'react'
import styles from './ProfilePanel.module.css'

export default function ProfilePanel({
  open, onClose, user,
  trackedFlights = [], pinnedLaunches = [],
  onSelectFlight, onUntrackFlight, onUnpinLaunch,
  liveAircraft, onSignOut,
}) {
  const [tab, setTab] = useState('flights')

  if (!open) return null

  // Separate satellites (ISS etc.) from regular flights
  const SAT_IDS = new Set(['ISS'])
  const flights = trackedFlights.filter(f => !SAT_IDS.has(f.icao24))
  const satellites = trackedFlights.filter(f => SAT_IDS.has(f.icao24))

  // Enrich tracked flights with live data when available
  const enriched = flights.map(f => {
    const live = liveAircraft?.get(f.icao24)
    return { ...f, live: live || null }
  })
  const enrichedSats = satellites.map(f => {
    const live = liveAircraft?.get(f.icao24)
    return { ...f, live: live || null }
  })

  const inAir  = enriched.filter(f => f.live)
  const offline = enriched.filter(f => !f.live)

  return (
    <div className={`${styles.panel} ${open ? styles.open : ''}`}>
      {/* Banner */}
      <div className={styles.banner}>
        {user?.picture ? (
          <img src={user.picture} alt="" className={styles.bannerImg} referrerPolicy="no-referrer" />
        ) : (
          <div className={styles.bannerFallback} />
        )}
        <div className={styles.bannerOverlay} />
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* Profile identity */}
      <div className={styles.identity}>
        <div className={styles.avatarLarge}>
          {user?.picture ? (
            <img src={user.picture} alt="" className={styles.avatarImg} referrerPolicy="no-referrer" />
          ) : (
            <span className={styles.avatarInitial}>
              {(user?.display_name || 'T')[0].toUpperCase()}
            </span>
          )}
        </div>
        <div>
          <h2 className={styles.title}>{user?.display_name || 'Traveller'}</h2>
          <p className={styles.subtitle}>{user?.email || ''}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'flights' ? styles.tabActive : ''}`}
          onClick={() => setTab('flights')}
        >
          Flights
          {flights.length > 0 && (
            <span className={styles.tabBadge}>{flights.length}</span>
          )}
        </button>
        <button
          className={`${styles.tab} ${tab === 'satellites' ? styles.tabActive : ''}`}
          onClick={() => setTab('satellites')}
        >
          Satellites
          {satellites.length > 0 && (
            <span className={styles.tabBadge}>{satellites.length}</span>
          )}
        </button>
        <button
          className={`${styles.tab} ${tab === 'launches' ? styles.tabActive : ''}`}
          onClick={() => setTab('launches')}
        >
          Launches
          {pinnedLaunches.length > 0 && (
            <span className={styles.tabBadge}>{pinnedLaunches.length}</span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {tab === 'flights' && (
          <>
            {/* In-air flights */}
            {inAir.length > 0 && (
              <div className={styles.section}>
                <p className={styles.sectionLabel}>
                  <span className={styles.liveDot} />
                  IN AIR — {inAir.length}
                </p>
                {inAir.map(f => (
                  <FlightCard
                    key={f.icao24}
                    flight={f}
                    onSelect={() => onSelectFlight?.(f.icao24)}
                    onRemove={() => onUntrackFlight?.(f.icao24)}
                  />
                ))}
              </div>
            )}

            {/* Offline flights */}
            {offline.length > 0 && (
              <div className={styles.section}>
                <p className={styles.sectionLabel}>LAST TRACKED — {offline.length}</p>
                {offline.map(f => (
                  <FlightCard
                    key={f.icao24}
                    flight={f}
                    onSelect={() => onSelectFlight?.(f.icao24)}
                    onRemove={() => onUntrackFlight?.(f.icao24)}
                  />
                ))}
              </div>
            )}

            {flights.length === 0 && (
              <Empty icon="flight" text="No tracked flights yet. Select a flight on the globe and save it." />
            )}
          </>
        )}

        {tab === 'satellites' && (
          <>
            {enrichedSats.length > 0 ? (
              <div className={styles.section}>
                <p className={styles.sectionLabel}>
                  {enrichedSats.some(s => s.live) && <span className={styles.liveDot} />}
                  TRACKED — {enrichedSats.length}
                </p>
                {enrichedSats.map(s => (
                  <div key={s.icao24} className={styles.card} onClick={() => onSelectFlight?.(s.icao24)}>
                    <div className={styles.cardLeft}>
                      <div className={`${styles.cardIcon} ${styles.cardIconSat}`}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                          <path d="M13 7L9 3L5 7l4 4"/>
                          <path d="M17 11l4 4-4 4-4-4"/>
                          <path d="M8 12l4 4"/>
                          <path d="M16 8l-4-4"/>
                          <circle cx="5" cy="19" r="2"/>
                          <path d="M9 15c1.1 1.1 1.1 2.9 0 4"/>
                          <path d="M12 12c2.2 2.2 2.2 5.8 0 8"/>
                        </svg>
                      </div>
                      <div className={styles.cardInfo}>
                        <p className={styles.cardTitle}>
                          {s.callsign || s.icao24}
                          {s.live && <span className={styles.liveTag}>LIVE</span>}
                        </p>
                        {s.live ? (
                          <div className={styles.cardTelemetry}>
                            <span>{Math.round(s.live.alt_baro ?? s.live.alt_geom ?? 0).toLocaleString()} ft</span>
                            <span className={styles.telSep} />
                            <span>{Math.round(s.live.gs ?? 0)} kts</span>
                          </div>
                        ) : (
                          <p className={styles.cardSub}>{s.icao24}</p>
                        )}
                      </div>
                    </div>
                    <button className={styles.cardRemove} onClick={e => { e.stopPropagation(); onUntrackFlight?.(s.icao24) }} title="Remove">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <Empty icon="satellite_alt" text="No tracked satellites. Select the ISS or a satellite on the globe and save it." />
            )}
          </>
        )}

        {tab === 'launches' && (
          <>
            {pinnedLaunches.length > 0 ? (
              <div className={styles.section}>
                <p className={styles.sectionLabel}>PINNED — {pinnedLaunches.length}</p>
                {pinnedLaunches.map(l => (
                  <LaunchCard
                    key={l.launch_id || l.id}
                    launch={l}
                    onRemove={() => onUnpinLaunch?.(l.id)}
                  />
                ))}
              </div>
            ) : (
              <Empty icon="rocket_launch" text="No pinned launches. Pin a launch from the Launches panel." />
            )}
          </>
        )}
      </div>

      {/* Sign out */}
      <div className={styles.footer}>
        <button className={styles.signOutBtn} onClick={() => { onClose(); onSignOut?.() }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Sign out
        </button>
      </div>
    </div>
  )
}

function FlightCard({ flight, onSelect, onRemove }) {
  const { live } = flight
  const isLive = !!live

  return (
    <div className={styles.card} onClick={onSelect}>
      <div className={styles.cardLeft}>
        <div className={styles.cardIcon}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/>
          </svg>
        </div>
        <div className={styles.cardInfo}>
          <p className={styles.cardTitle}>
            {flight.callsign || flight.icao24}
            {isLive && <span className={styles.liveTag}>LIVE</span>}
          </p>
          {isLive ? (
            <div className={styles.cardTelemetry}>
              <span>{Math.round(live.alt_baro ?? live.alt_geom ?? 0).toLocaleString()} ft</span>
              <span className={styles.telSep} />
              <span>{Math.round(live.gs ?? 0)} kts</span>
              <span className={styles.telSep} />
              <span>{Math.round(live.track ?? 0)}°</span>
            </div>
          ) : (
            <p className={styles.cardSub}>
              {flight.icao24}
              {flight.savedAt && <> · saved {new Date(flight.savedAt).toLocaleDateString()}</>}
            </p>
          )}
        </div>
      </div>
      <button className={styles.cardRemove} onClick={e => { e.stopPropagation(); onRemove() }} title="Remove">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  )
}

function LaunchCard({ launch, onRemove }) {
  const net = launch.net ? new Date(launch.net) : null
  const isPast = net && net < Date.now()

  return (
    <div className={styles.card}>
      <div className={styles.cardLeft}>
        <div className={`${styles.cardIcon} ${styles.cardIconLaunch}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
            <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
            <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
            <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
          </svg>
        </div>
        <div className={styles.cardInfo}>
          <p className={styles.cardTitle}>{launch.name || launch.rocket || 'Unknown'}</p>
          <p className={styles.cardSub}>
            {launch.provider && <>{launch.provider} · </>}
            {net ? (isPast ? 'Launched ' : '') + net.toLocaleDateString() : 'TBD'}
            {launch.status_abbr && <> · {launch.status_abbr}</>}
          </p>
        </div>
      </div>
      <button className={styles.cardRemove} onClick={e => { e.stopPropagation(); onRemove() }} title="Unpin">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  )
}

function Empty({ icon, text }) {
  return (
    <div className={styles.empty}>
      <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'rgba(178,255,26,0.15)' }}>{icon}</span>
      <p>{text}</p>
    </div>
  )
}
