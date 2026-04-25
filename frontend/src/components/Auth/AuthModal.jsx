import { useState, useRef, useEffect, useCallback } from 'react'
import styles from './AuthModal.module.css'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

// Load external script once, return promise
const scriptCache = {}
function loadScript(src) {
  if (scriptCache[src]) return scriptCache[src]
  scriptCache[src] = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = resolve
    s.onerror = reject
    document.head.appendChild(s)
  })
  return scriptCache[src]
}

export default function AuthModal({ onClose, onLogin, onRegister, onGoogleLogin, onAppleLogin }) {
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

  // ── Google Sign-In ──────────────────────────────────────────────────────────
  const handleGoogle = useCallback(async () => {
    if (!GOOGLE_CLIENT_ID) {
      setError('Google sign-in not configured')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await loadScript('https://accounts.google.com/gsi/client')
      const { google } = window
      if (!google?.accounts?.id) throw new Error('Google SDK failed to load')

      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          try {
            await onGoogleLogin(response.credential)
            onClose()
          } catch (err) {
            setError(err.message || 'Google sign-in failed')
            setLoading(false)
          }
        },
        auto_select: false,
      })
      google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          // Fallback: open One Tap popup manually
          google.accounts.id.renderButton(
            document.getElementById('google-signin-fallback'),
            { theme: 'filled_black', size: 'large', width: '100%', shape: 'pill' }
          )
          setLoading(false)
        }
      })
    } catch (err) {
      setError('Failed to load Google sign-in')
      setLoading(false)
    }
  }, [onGoogleLogin, onClose])

  // ── Apple Sign-In ───────────────────────────────────────────────────────────
  const handleApple = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      await loadScript('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js')
      const { AppleID } = window
      if (!AppleID?.auth) throw new Error('Apple SDK failed to load')

      AppleID.auth.init({
        clientId: import.meta.env.VITE_APPLE_CLIENT_ID || '',
        scope: 'name email',
        redirectURI: window.location.origin,
        usePopup: true,
      })

      const response = await AppleID.auth.signIn()
      const idToken = response.authorization?.id_token
      if (!idToken) throw new Error('No token received from Apple')

      const fullName = response.user
        ? [response.user.name?.firstName, response.user.name?.lastName].filter(Boolean).join(' ')
        : null

      await onAppleLogin(idToken, fullName)
      onClose()
    } catch (err) {
      if (err.error === 'popup_closed_by_user') {
        setLoading(false)
        return
      }
      setError(err.message || 'Apple sign-in failed')
    } finally {
      setLoading(false)
    }
  }, [onAppleLogin, onClose])

  return (
    <div
      className={styles.overlay}
      ref={overlayRef}
      onMouseDown={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className={styles.modal}>
        <button className={styles.close} onClick={onClose} aria-label="Close">&#x2715;</button>

        <div className={styles.header}>
          <div className={styles.logo}>&#x2726;</div>
          <h2 className={styles.title}>
            {mode === 'login' ? 'Welcome back' : 'Join ObjectTracer'}
          </h2>
          <p className={styles.subtitle}>
            {mode === 'login'
              ? 'Sign in to track flights & save your watchlist'
              : 'Create an account to unlock personalized tracking'}
          </p>
        </div>

        {/* ── Social Login Buttons ───────────────────────────────────── */}
        <div className={styles.socialButtons}>
          <button className={styles.socialBtn} onClick={handleGoogle} disabled={loading}>
            <svg className={styles.socialIcon} viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
          <div id="google-signin-fallback" />

          <button className={styles.socialBtn} onClick={handleApple} disabled={loading}>
            <svg className={styles.socialIcon} viewBox="0 0 24 24" fill="#fff">
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
            Continue with Apple
          </button>
        </div>

        <div className={styles.divider}>
          <span className={styles.dividerLine} />
          <span className={styles.dividerText}>or</span>
          <span className={styles.dividerLine} />
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
              placeholder={mode === 'register' ? 'Min 8 characters' : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 8 : undefined}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button className={styles.submit} type="submit" disabled={loading}>
            {loading ? 'Loading\u2026' : mode === 'login' ? 'Sign in' : 'Create account'}
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
