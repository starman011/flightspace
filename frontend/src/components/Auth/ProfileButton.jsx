import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import styles from './ProfileButton.module.css'

export default function ProfileButton({
  isAuthenticated, user, onSignIn, onSignOut,
  trackedFlights = [], pinnedLaunches = [],
  onProfileOpen,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  // Position menu below button via fixed coords
  useEffect(() => {
    if (!menuOpen || !btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setMenuPos({
      top: rect.bottom + 8,
      left: Math.max(8, rect.right - 180),
    })
  }, [menuOpen])

  // Close on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => {
      if (menuRef.current?.contains(e.target)) return
      if (btnRef.current?.contains(e.target)) return
      setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const initials = user?.display_name
    ? user.display_name.slice(0, 2).toUpperCase()
    : null

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

  const hasSaved = trackedFlights.length > 0 || pinnedLaunches.length > 0

  const menu = menuOpen && createPortal(
    <div
      ref={menuRef}
      className={styles.menu}
      style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
    >
      <div className={styles.menuHeader}>
        <p className={styles.menuName}>{user?.display_name || 'Traveller'}</p>
        <p className={styles.menuEmail}>{user?.email || ''}</p>
      </div>
      <div className={styles.menuDivider} />

      <button
        className={styles.menuItem}
        onClick={() => { setMenuOpen(false); onProfileOpen?.() }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
          <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/>
        </svg>
        My Flights & Launches
        {hasSaved && <span className={styles.menuBadge}>{trackedFlights.length + pinnedLaunches.length}</span>}
      </button>

      <button
        className={styles.menuItem}
        onClick={() => { setMenuOpen(false); onSignOut() }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        Sign out
      </button>
    </div>,
    document.body
  )

  return (
    <>
      <button
        ref={btnRef}
        className={`${styles.btn} ${styles.btnAuth}`}
        onClick={() => setMenuOpen(o => !o)}
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
        {hasSaved && <span className={styles.savedBadge}>{trackedFlights.length + pinnedLaunches.length}</span>}
        <span className={styles.onlineDot} />
      </button>
      {menu}
    </>
  )
}
