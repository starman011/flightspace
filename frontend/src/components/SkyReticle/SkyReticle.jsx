import styles from './SkyReticle.module.css'

// Center reticle + live RA/Dec readout shown while exploring deep space with
// Free Look / Point at the Sky. `heading` is { raHms, decDms, target }.
export default function SkyReticle({ active, heading, located }) {
  if (!active) return null
  const target = heading?.target
  return (
    <div className={styles.wrap} aria-hidden="true">
      <div className={`${styles.reticle} ${target ? styles.locked : ''}`} />
      {target && <div className={styles.target}>{target}</div>}
      {heading && (
        <div className={styles.readout}>
          <span className={styles.coord}>RA {heading.raHms}</span>
          <span className={styles.sep}>·</span>
          <span className={styles.coord}>Dec {heading.decDms}</span>
          {located && <span className={styles.live} title="Aligned to your sky">◉ your sky</span>}
        </div>
      )}
    </div>
  )
}
