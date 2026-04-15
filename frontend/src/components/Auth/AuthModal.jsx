import { useState, useRef, useEffect } from 'react'
import styles from './AuthModal.module.css'

export default function AuthModal({ onClose, onLogin, onRegister }) {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [name, setName]         = useState('')
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)
  const overlayRef = useRef(null)

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'login') {
        await onLogin(email, password)
      } else {
        await onRegister(email, password, name)
      }
      onClose()
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className={styles.overlay}
      ref={overlayRef}
      onMouseDown={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className={styles.modal}>
        <button className={styles.close} onClick={onClose} aria-label="Close">✕</button>

        <div className={styles.header}>
          <div className={styles.logo}>✦</div>
          <h2 className={styles.title}>
            {mode === 'login' ? 'Welcome back' : 'Join Flightspace'}
          </h2>
          <p className={styles.subtitle}>
            {mode === 'login'
              ? 'Sign in to track flights & save your watchlist'
              : 'Create an account to unlock personalized tracking'}
          </p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className={styles.field}>
              <label className={styles.label}>Display name</label>
              <input
                className={styles.input}
                type="text"
                placeholder="Starman"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>
          )}
          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <input
              className={styles.input}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Password</label>
            <input
              className={styles.input}
              type="password"
              placeholder={mode === 'register' ? 'Min 8 characters' : '••••••••'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 8 : undefined}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button className={styles.submit} type="submit" disabled={loading}>
            {loading ? 'Loading…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className={styles.footer}>
          {mode === 'login' ? (
            <span>No account? <button className={styles.switchBtn} onClick={() => { setMode('register'); setError(null) }}>Create one</button></span>
          ) : (
            <span>Already have one? <button className={styles.switchBtn} onClick={() => { setMode('login'); setError(null) }}>Sign in</button></span>
          )}
        </div>

        {/* Signed-in perks */}
        {mode === 'register' && (
          <div className={styles.perks}>
            <p className={styles.perksTitle}>With an account you can:</p>
            <ul className={styles.perksList}>
              <li>Bookmark aircraft & callsigns to your watchlist</li>
              <li>Save your preferred globe view &amp; filters</li>
              <li>Track space launches with personal countdowns</li>
              <li>History of flights you've viewed</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
