import styles from './Skeleton.module.css'

/**
 * A placeholder for content that is loading.
 *
 * Decorative by definition, so it is hidden from assistive technology — the
 * container that swaps it for real content should carry `aria-busy` instead,
 * which announces the wait once rather than announcing each bar.
 */
export default function Skeleton({ width, height, radius, circle = false, className = '', style }) {
  const cls = [styles.base, circle ? styles.circle : '', className].filter(Boolean).join(' ')
  return (
    <span
      aria-hidden="true"
      className={cls}
      style={{ width, height, borderRadius: radius, display: 'block', ...style }}
    />
  )
}

/** A run of text lines, last one short so it reads as prose rather than a table. */
export function SkeletonText({ lines = 3, width = '100%', lastWidth = '62%', style }) {
  return (
    <span aria-hidden="true" className={styles.lines} style={style}>
      {Array.from({ length: lines }, (_, i) => (
        <span
          key={i}
          className={`${styles.base} ${styles.text}`}
          style={{ width: i === lines - 1 ? lastWidth : width }}
        />
      ))}
    </span>
  )
}
