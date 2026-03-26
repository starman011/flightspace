import styles from './Filters.module.css'

const TYPE_OPTIONS = [
  { value: 'all',         label: 'all' },
  { value: 'planes',      label: '✈ planes' },
  { value: 'helicopters', label: '⬡ helis' },
  { value: 'satellites',  label: '◈ sats' },
  { value: 'ships',       label: '⬟ ships' },
]

const ALT_OPTIONS = [
  { value: 'all',  label: 'any alt' },
  { value: 'low',  label: '< 10k ft' },
  { value: 'mid',  label: '10–30k ft' },
  { value: 'high', label: '> 30k ft' },
]

const isActive = (filters) =>
  filters.type !== 'all' || filters.altitude !== 'all'

export default function Filters({ filters, onFiltersChange }) {
  const set = (key, val) => onFiltersChange({ ...filters, [key]: val })

  // Altitude filter only makes sense for air vehicles
  const altDisabled = filters.type === 'satellites' || filters.type === 'ships'

  return (
    <div className={styles.bar}>
      {/* Entity type toggles */}
      <div className={styles.group}>
        {TYPE_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            className={`${styles.btn} ${filters.type === value ? styles.active : ''}`}
            onClick={() => {
              set('type', value)
              // Clear altitude filter when switching to non-air types
              if (value === 'satellites' || value === 'ships') {
                onFiltersChange({ type: value, altitude: 'all' })
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.sep} />

      {/* Altitude toggles (greyed out for non-air types) */}
      <div className={`${styles.group} ${altDisabled ? styles.dimmed : ''}`}>
        {ALT_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            className={`${styles.btn} ${filters.altitude === value ? styles.active : ''}`}
            onClick={() => !altDisabled && set('altitude', value)}
            disabled={altDisabled}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Dot indicator for active filters */}
      {isActive(filters) && <span className={styles.dot} title="filters active" />}
    </div>
  )
}
