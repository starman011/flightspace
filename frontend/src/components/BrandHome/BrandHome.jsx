import styles from './BrandHome.module.css'

/**
 * Circular ObjectTracer mark that links back to the marketing home at `/`.
 *
 * A plain <a>, not a router push: `/` is a static document served outside the
 * SPA, so a client-side navigation would not reach it.
 */
export default function BrandHome({ compact = false, floating = false, className = '' }) {
  const cls = [
    styles.brand,
    compact ? styles.compact : '',
    floating ? styles.floating : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <a href="/" className={cls} aria-label="ObjectTracer home">
      <span className={styles.mark}>
        <img src="/favicon.svg" alt="" width="22" height="22" decoding="async" />
      </span>
      <span className={styles.word}>ObjectTracer</span>
    </a>
  )
}
