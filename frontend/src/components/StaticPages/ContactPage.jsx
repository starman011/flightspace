import styles from './StaticPages.module.css'

export default function ContactPage({ onClose }) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Contact</h2>
          <button className={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>
        <div className={styles.body}>
          <p>
            Have feedback, found a bug, or want to collaborate? Reach out.
          </p>

          <form onSubmit={e => { e.preventDefault(); onClose() }}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Email</label>
              <input className={styles.formInput} type="email" placeholder="you@example.com" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Message</label>
              <textarea className={styles.formTextarea} placeholder="Tell us what's on your mind..." />
            </div>
            <button type="submit" className={styles.formSubmit}>
              Send Message
            </button>
          </form>

          <h3>Other Ways</h3>
          <p>
            You can also reach us on GitHub or via email at <a href="mailto:helldiver.star@gmail.com">helldiver.star@gmail.com</a>.
          </p>
        </div>
      </div>
    </div>
  )
}
