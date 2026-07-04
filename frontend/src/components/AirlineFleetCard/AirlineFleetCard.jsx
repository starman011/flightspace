import styles from './AirlineFleetCard.module.css'

// Right-side card on airline landing pages (/airline/:slug) — shows the
// carrier at a glance and hands off to the Live Fleets page for the full
// board. Unmounts with the landing context (banner Clear).
export default function AirlineFleetCard({ name, prefix, iata, count, onOpenFleet }) {
  return (
    <aside className={styles.card} aria-label={`${name} fleet summary`}>
      <div className={styles.head}>
        {iata && (
          <img
            className={styles.logo}
            src={`https://pics.avs.io/72/72/${iata}@2x.png`}
            alt="" loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        )}
        <div className={styles.title}>
          <span className={styles.name}>{name}</span>
          <span className={styles.codes}>{iata ? `${iata} · ` : ''}{prefix}</span>
        </div>
      </div>

      <div className={styles.stat}>
        <span className={styles.statValue}>{count ?? '—'}</span>
        <span className={styles.statLabel}>
          <span className={styles.liveDot} />
          airborne now
        </span>
      </div>

      <p className={styles.hint}>Every {name} flight on the globe is live ADS-B. Tap one to track it.</p>

      <button className={styles.cta} onClick={onOpenFleet}>
        Open live fleet
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </aside>
  )
}
