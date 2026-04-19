import styles from './ProfileButton.module.css'

export default function ProfileButton({
  isAuthenticated, user, onSignIn,
  trackedFlights = [], pinnedLaunches = [],
  onProfileOpen,
}) {
  if (!isAuthenticated) {
    return (
      <button className={styles.btn} onClick={onSignIn} title="Sign in">
        <span className={styles.icon}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
        </span>
      </button>
    )
  }

  const initials = user?.display_name
    ? user.display_name.slice(0, 2).toUpperCase()
    : null
  const savedCount = trackedFlights.length + pinnedLaunches.length

  return (
    <button
      className={`${styles.btn} ${styles.btnAuth}`}
      onClick={() => onProfileOpen?.()}
      title={user?.display_name || 'Account'}
    >
      {initials
        ? <span className={styles.initials}>{initials}</span>
        : <span className={styles.icon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
          </span>
      }
      {savedCount > 0 && <span className={styles.savedBadge}>{savedCount}</span>}
      <span className={styles.onlineDot} />
    </button>
  )
}
