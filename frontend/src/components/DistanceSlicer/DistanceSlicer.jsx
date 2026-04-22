import { useState, useCallback, useRef, useEffect } from 'react'
import styles from './DistanceSlicer.module.css'

// ── Cosmological distance (flat ΛCDM) ────────────────────────────────────────
const C_KMS = 299792.458, H0 = 67.4, OM = 0.315, OL = 0.685, MPC_LY = 3261600

function zToLY(z) {
  const n = 80, dz = z / n
  let sum = 0
  for (let i = 0; i < n; i++) {
    const zi = (i + 0.5) * dz
    sum += dz / Math.sqrt(OM * (1 + zi) ** 3 + OL)
  }
  return (C_KMS / H0) * sum * MPC_LY
}

function formatLY(ly) {
  if (ly < 1e9) return `${(ly / 1e6).toFixed(0)}M ly`
  return `${(ly / 1e9).toFixed(1)}B ly`
}

const Z_MIN = 0
const Z_MAX = 3.5
const Z_STEP = 0.01

export default function DistanceSlicer({ onChange }) {
  const [minZ, setMinZ] = useState(Z_MIN)
  const [maxZ, setMaxZ] = useState(Z_MAX)
  const debounceRef = useRef(null)

  const emit = useCallback((lo, hi) => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onChange?.(lo, hi)
    }, 50)
  }, [onChange])

  const handleMinChange = useCallback((e) => {
    const v = parseFloat(e.target.value)
    const clamped = Math.min(v, maxZ - Z_STEP)
    setMinZ(clamped)
    emit(clamped, maxZ)
  }, [maxZ, emit])

  const handleMaxChange = useCallback((e) => {
    const v = parseFloat(e.target.value)
    const clamped = Math.max(v, minZ + Z_STEP)
    setMaxZ(clamped)
    emit(minZ, clamped)
  }, [minZ, emit])

  // Reset filter when unmounted
  useEffect(() => () => onChange?.(Z_MIN, Z_MAX), [onChange])

  const minPct = ((minZ - Z_MIN) / (Z_MAX - Z_MIN)) * 100
  const maxPct = ((maxZ - Z_MIN) / (Z_MAX - Z_MIN)) * 100

  return (
    <div className={styles.container} onPointerDown={e => e.stopPropagation()}>
      <div className={styles.title}>Distance Filter</div>

      <div className={styles.sliderRow}>
        <span className={`${styles.label} ${styles.labelHighlight}`}>{formatLY(zToLY(minZ))}</span>
        <div className={styles.sliderTrack}>
          <div className={styles.track} />
          <div className={styles.trackFill} style={{ left: `${minPct}%`, width: `${maxPct - minPct}%` }} />
          <input
            type="range"
            className={styles.slider}
            min={Z_MIN}
            max={Z_MAX}
            step={Z_STEP}
            value={minZ}
            onChange={handleMinChange}
            style={{ position: 'absolute' }}
          />
          <input
            type="range"
            className={styles.slider}
            min={Z_MIN}
            max={Z_MAX}
            step={Z_STEP}
            value={maxZ}
            onChange={handleMaxChange}
            style={{ position: 'absolute' }}
          />
        </div>
        <span className={`${styles.label} ${styles.labelHighlight}`}>{formatLY(zToLY(maxZ))}</span>
      </div>

      <div className={styles.ticks}>
        <span className={styles.tick}>0</span>
        <span className={styles.tick}>1 Bly</span>
        <span className={styles.tick}>5 Bly</span>
        <span className={styles.tick}>10 Bly</span>
        <span className={styles.tick}>13+ Bly</span>
      </div>
    </div>
  )
}
