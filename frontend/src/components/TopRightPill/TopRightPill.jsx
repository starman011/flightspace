import { useState, useRef, useEffect } from 'react'
import styles from './TopRightPill.module.css'

export default function TopRightPill({
  isAuthenticated, user,
  onSignIn, onSignOut, onProfileOpen,
  onPageOpen,
  hidden,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  // Close on Escape
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [menuOpen])

  if (hidden) return null

  const initials = user?.display_name
    ? user.display_name.slice(0, 2).toUpperCase()
    : null

  return (
    <div className={styles.pill} ref={menuRef}>
      {/* Profile half */}
      <button
        className={styles.profileSide}
        onClick={() => isAuthenticated ? onProfileOpen?.() : onSignIn?.()}
        title={isAuthenticated ? 'Profile' : 'Sign in'}
      >
        {isAuthenticated ? (
          <>
            <span className={styles.avatar}>
              {user?.picture ? (
                <img src={user.picture} alt="" className={styles.avatarImg} referrerPolicy="no-referrer" />
              ) : initials || (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              )}
            </span>
            <span className={styles.name}>
              {user?.display_name?.split(' ')[0] || 'Profile'}
            </span>
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span className={styles.name}>Sign in</span>
          </>
        )}
      </button>

      <span className={styles.divider} />

      {/* Menu half */}
      <button
        className={`${styles.menuSide} ${menuOpen ? styles.menuOpen : ''}`}
        onClick={() => setMenuOpen(o => !o)}
        title="Menu"
        aria-label="Menu"
        aria-expanded={menuOpen}
      >
        <div className={styles.hamburger}>
          <span className={styles.hbar} />
          <span className={styles.hbar} />
          <span className={styles.hbar} />
        </div>
      </button>

      {/* Dropdown */}
      {menuOpen && (
        <div className={styles.dropdown}>
          <button className={styles.menuItem} onClick={() => { setMenuOpen(false); onPageOpen?.('waitlist') }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
              <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
            </svg>
            Join Waitlist
          </button>
          <span className={styles.menuDivider} />
          <button className={styles.menuItem} onClick={() => { setMenuOpen(false); onPageOpen?.('about') }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            About
          </button>
          <button className={styles.menuItem} onClick={() => { setMenuOpen(false); onPageOpen?.('contact') }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            Contact
          </button>
          <button className={styles.menuItem} onClick={() => { setMenuOpen(false); onPageOpen?.('faq') }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/></svg>
            FAQs
          </button>
          <button className={styles.menuItem} onClick={() => { setMenuOpen(false); onPageOpen?.('donate') }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            Donate
          </button>

          {isAuthenticated && (
            <>
              <span className={styles.menuDivider} />
              <button className={styles.menuItem} onClick={() => { setMenuOpen(false); onSignOut?.() }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Sign out
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
