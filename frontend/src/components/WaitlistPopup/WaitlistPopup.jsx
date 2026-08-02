import { useState, useEffect, useRef } from 'react'
import styles from './WaitlistPopup.module.css'

const STORAGE_KEY = 'fs_waitlist_dismissed'
const ENGAGE_MS   = 40_000

const FEATURES = [
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
      </svg>
    ),
    label: 'Precision tracking',
    desc: 'Sub-second updates, surface to deep space',
  },
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    ),
    label: 'Smart alerts',
    desc: 'ISS overhead, launches & landings',
  },
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M13 7L9 3 5 7l4 4"/><path d="M17 11l4 4-4 4-4-4"/><path d="M8 12l4 4"/><path d="M16 8l-4-4"/><circle cx="5" cy="19" r="2"/><path d="M9 15a4 4 0 0 1 0 4"/>
      </svg>
    ),
    label: 'All in one',
    desc: 'Flights, satellites, launches, asteroids',
  },
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    label: 'Flight replay',
    desc: 'Rewind any flight or launch',
  },
]

export default function WaitlistPopup() {
  const [visible, setVisible]   = useState(false)
  const [email, setEmail]       = useState('')
  const [status, setStatus]     = useState('idle')
  const engageRef               = useRef(0)
  const lastActiveRef           = useRef(null)
  const timerRef                = useRef(null)

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY)
    if (dismissed && Date.now() - Number(dismissed) < 30 * 86_400_000) return

    const onActivity = () => { lastActiveRef.current = Date.now() }
    window.addEventListener('scroll',    onActivity, { passive: true })
    window.addEventListener('touchmove', onActivity, { passive: true })
    window.addEventListener('mousemove', onActivity, { passive: true })
    window.addEventListener('keydown',   onActivity, { passive: true })

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

  // Flag the document so persistent chrome (the bottom nav) can step aside.
  useEffect(() => {
    if (!visible) return
    document.body.setAttribute('data-modal-open', 'waitlist')
    return () => document.body.removeAttribute('data-modal-open')
  }, [visible])

  if (!visible) return null

  return (
    <div className={styles.backdrop} onClick={(e) => e.target === e.currentTarget && dismiss()}>
      <div className={styles.card}>
        {/* Always-visible red close (does not scroll away) */}
        <button className={styles.close} onClick={dismiss} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>

        <div className={styles.scroll}>
          {status === 'done' ? (
            <div className={styles.success}>
              <div className={styles.successGlyph}>
                <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                  <circle cx="22" cy="22" r="20" stroke="rgba(34,239,126,0.2)" strokeWidth="1.5"/>
                  <polyline points="13,22 19,28 31,16" stroke="#22ef7e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className={styles.successTitle}>Welcome aboard.</p>
              <p className={styles.successSub}>We'll reach out as new features launch. Got an idea? Reply to your welcome email — we read every one.</p>
              <button className={styles.doneBtn} onClick={dismiss}>Let&rsquo;s go</button>
            </div>
          ) : (
            <>
              <div className={styles.hero}>
                <img className={styles.heroImg} src="/night-sky.webp" width="1600" height="1066" alt="The Milky Way over a hillside" loading="lazy" />
                <div className={styles.heroVeil} />
                <div className={styles.heroText}>
                  <p className={styles.eyebrow}>Our mission</p>
                  <h2 className={styles.title}>Space &amp; aviation, for everyone</h2>
                </div>
              </div>

              <div className={styles.body}>
                <p className={styles.mission}>Track anything that moves above you — flights, satellites, launches, asteroids. Live, free, no gatekeeping.</p>

                <div className={styles.features}>
                  {FEATURES.map((f, i) => (
                    <div key={i} className={styles.feature}>
                      <span className={styles.featureIcon}>{f.icon}</span>
                      <div>
                        <p className={styles.featureName}>{f.label}</p>
                        <p className={styles.featureDesc}>{f.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

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
                  <button className={styles.submitBtn} type="submit" disabled={status === 'loading'}>
                    {status === 'loading' ? <span className={styles.spinner} /> : 'Join the mission'}
                  </button>
                </form>

                {status === 'error' && <p className={styles.errorMsg}>Something went wrong — try again.</p>}

                <button className={styles.skipBtn} onClick={dismiss}>Maybe later</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
