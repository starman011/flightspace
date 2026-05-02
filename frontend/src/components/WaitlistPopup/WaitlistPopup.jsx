import { useState, useEffect, useRef } from 'react'
import styles from './WaitlistPopup.module.css'

const STORAGE_KEY = 'fs_waitlist_dismissed'
const ENGAGE_MS   = 40_000   // 40 s of interaction before showing

export default function WaitlistPopup() {
  const [visible, setVisible]   = useState(false)
  const [email, setEmail]       = useState('')
  const [status, setStatus]     = useState('idle') // idle | loading | done | error
  const engageRef               = useRef(0)         // accumulated engagement ms
  const lastActiveRef           = useRef(null)      // timestamp of last interaction
  const timerRef                = useRef(null)

  useEffect(() => {
    // Don't show if already dismissed/subscribed in the last 30 days
    const dismissed = localStorage.getItem(STORAGE_KEY)
    if (dismissed && Date.now() - Number(dismissed) < 30 * 86_400_000) return

    // Tick engagement clock while user is active
    const onActivity = () => { lastActiveRef.current = Date.now() }
    window.addEventListener('scroll',     onActivity, { passive: true })
    window.addEventListener('touchmove',  onActivity, { passive: true })
    window.addEventListener('mousemove',  onActivity, { passive: true })
    window.addEventListener('keydown',    onActivity, { passive: true })

    timerRef.current = setInterval(() => {
      if (lastActiveRef.current && Date.now() - lastActiveRef.current < 3000) {
        engageRef.current += 500
      }
      if (engageRef.current >= ENGAGE_MS) {
        setVisible(true)
        clearInterval(timerRef.current)
      }
    }, 500)

    return () => {
      clearInterval(timerRef.current)
      window.removeEventListener('scroll',    onActivity)
      window.removeEventListener('touchmove', onActivity)
      window.removeEventListener('mousemove', onActivity)
      window.removeEventListener('keydown',   onActivity)
    }
  }, [])

  const dismiss = () => {
    setVisible(false)
    localStorage.setItem(STORAGE_KEY, String(Date.now()))
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setStatus('loading')
    try {
      const API = import.meta.env.VITE_API_URL || ''
      const res = await fetch(`${API}/api/v1/waitlist`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim(), source: 'engagement_popup' }),
      })
      if (!res.ok) throw new Error()
      setStatus('done')
      localStorage.setItem(STORAGE_KEY, String(Date.now()))
    } catch {
      setStatus('error')
    }
  }

  if (!visible) return null

  return (
    <div className={styles.backdrop} onClick={(e) => e.target === e.currentTarget && dismiss()}>
      <div className={styles.card}>
        {/* Close */}
        <button className={styles.close} onClick={dismiss} aria-label="Close">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
        </button>

        {/* Orbit glyph */}
        <div className={styles.glyph}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" stroke="rgba(178,255,26,0.15)" strokeWidth="1"/>
            <circle cx="24" cy="24" r="12" stroke="rgba(178,255,26,0.25)" strokeWidth="1"/>
            <circle cx="24" cy="24" r="4"  fill="#b2ff1a" opacity=".8"/>
            <ellipse cx="24" cy="24" rx="20" ry="7"
              stroke="#b2ff1a" strokeWidth="0.9" opacity=".35"
              transform="rotate(-35 24 24)"/>
            <circle cx="38" cy="17" r="2" fill="#b2ff1a" opacity=".6"/>
          </svg>
        </div>

        {status === 'done' ? (
          <div className={styles.success}>
            <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#22ef7e' }}>check_circle</span>
            <p className={styles.successTitle}>You're on the list.</p>
            <p className={styles.successSub}>We'll reach out when something exciting launches.</p>
            <button className={styles.doneBtn} onClick={dismiss}>Got it</button>
          </div>
        ) : (
          <>
            <p className={styles.eyebrow}>We noticed you're exploring</p>
            <h2 className={styles.title}>Something big<br/>is coming.</h2>
            <p className={styles.body}>
              We're building a one-stop platform for everything moving in space —
              live flights, launches, asteroids, satellites, and beyond.
              Your support helps us get there faster.
            </p>

            <form className={styles.form} onSubmit={submit}>
              <input
                className={styles.input}
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                disabled={status === 'loading'}
                autoComplete="email"
              />
              <button
                className={styles.submitBtn}
                type="submit"
                disabled={status === 'loading'}
              >
                {status === 'loading' ? (
                  <span className={styles.spinner} />
                ) : (
                  <>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>rocket_launch</span>
                    Keep me posted
                  </>
                )}
              </button>
            </form>

            {status === 'error' && (
              <p className={styles.errorMsg}>Something went wrong — try again.</p>
            )}

            <button className={styles.skipBtn} onClick={dismiss}>Maybe later</button>
          </>
        )}
      </div>
    </div>
  )
}
