import { useState, useMemo } from 'react'
import styles from './WaitlistPage.module.css'

/* ── Hero image pool ─────────────────────────────────────────────── */
const HEROES = [
  'photo-1462331940025-496dfbfc7564', // Milky Way
  'photo-1543722530-d2c3201371e7',    // Deep space galaxies
  'photo-1451187580459-43490279c0fa', // Earth from space
  'photo-1419242902214-272b3f66ee7a', // Meteor/stars
]

/* ── Feature icons (inline SVG, 16×16) ──────────────────────────── */
function IconLiveFlights() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
    </svg>
  )
}

function IconISS() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <ellipse cx="12" cy="12" rx="10" ry="4"/>
      <circle cx="12" cy="2" r="1.5" fill="currentColor" stroke="none"/>
    </svg>
  )
}

function IconSatellites() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12a10 10 0 1 1 20 0"/>
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
    </svg>
  )
}

function IconWind() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/>
    </svg>
  )
}

function IconMoon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}

function IconSolar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
    </svg>
  )
}

function IconRocket() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
      <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
    </svg>
  )
}

function IconDeepSpace() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
    </svg>
  )
}

/* ── Feature data ────────────────────────────────────────────────── */
const FEATURES = [
  { name: 'Live Flights',    desc: '10,000+ planes in real time',           Icon: IconLiveFlights },
  { name: 'ISS Position',   desc: 'Live at 28,000 km/h',                   Icon: IconISS         },
  { name: 'Satellites',     desc: 'Hundreds with live orbits',              Icon: IconSatellites  },
  { name: 'Wind Layer',     desc: 'Global atmospheric patterns',            Icon: IconWind        },
  { name: 'Moon Explorer',  desc: 'Apollo sites, craters, missions',        Icon: IconMoon        },
  { name: 'Solar System',   desc: '8 planets at real positions',            Icon: IconSolar       },
  { name: 'Rocket Launches',desc: 'SpaceX, ISRO, ESA live',                Icon: IconRocket      },
  { name: 'Deep Space',     desc: '2M+ galaxies — fly the universe',        Icon: IconDeepSpace, beta: true },
]

const ROADMAP = [
  { name: 'Precision Tracking',    desc: 'Sub-second position updates on any object — earth to deep space.' },
  { name: 'Smart Custom Alerts',   desc: 'ISS overhead, launches 30 min before liftoff, flight landings.' },
  { name: 'Flight Replay',         desc: 'Rewind any flight or launch trajectory, hour by hour, on the live globe.' },
]

/* ── Component ───────────────────────────────────────────────────── */
export default function WaitlistPage({ onClose }) {
  const [email, setEmail]   = useState('')
  const [status, setStatus] = useState('idle')

  const heroId = useMemo(() => HEROES[Math.floor(Math.random() * HEROES.length)], [])

  const submit = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setStatus('loading')
    try {
      const API = import.meta.env.VITE_API_URL || ''
      const res = await fetch(`${API}/api/v1/waitlist`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim(), source: 'waitlist_page' }),
      })
      if (!res.ok) throw new Error()
      setStatus('done')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className={styles.overlay}>

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className={styles.topBar}>
        <p className={styles.wordmark}>
          <span className={styles.wordmarkDot}/>
          ObjectTracer
        </p>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {/* ── Two-column body ─────────────────────────────────────── */}
      <div className={styles.body}>

        {/* LEFT */}
        <div className={styles.left}>

          {/* Hero image */}
          <img
            className={styles.hero}
            src={`https://images.unsplash.com/${heroId}?w=900&h=400&fit=crop&q=85&auto=format`}
            alt="Space"
          />

          {/* Mission copy */}
          <div>
            <p className={styles.eyebrow}>Our Mission</p>
            <h2 className={styles.headline}>
              The universe is alive.<br/>Watch it happen live.
            </h2>
          </div>
          <p className={styles.copy}>
            Right now, planes thread invisible corridors above your head. The ISS races overhead at 28,000 km/h. Asteroids drift silently through the inner solar system.
            We built ObjectTracer so everyone — not just engineers — can see all of it, in real time, for free.
          </p>

          {/* Feature grid */}
          <div className={styles.featSection}>
            <p className={styles.featLabel}>Available now</p>
            <div className={styles.grid}>
              {FEATURES.map((f, i) => (
                <div
                  key={f.name}
                  className={styles.card}
                  style={{ animationDelay: `${i * 0.04}s` }}
                >
                  <div className={styles.icon}>
                    <f.Icon/>
                  </div>
                  <p className={styles.cardName}>
                    {f.name}
                    {f.beta && <span className={styles.beta}>BETA</span>}
                  </p>
                  <p className={styles.cardDesc}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* RIGHT */}
        <div className={styles.right}>

          {/* Form section */}
          <p className={styles.formLabel}>Join the mission</p>
          <h3 className={styles.formHeadline}>Get notified as new features launch.</h3>
          <p className={styles.formSub}>
            You joined early. Your feedback shapes what we build next. Reply to your welcome email anytime — we read everything.
          </p>

          {status === 'done' ? (
            <div className={styles.success}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="#b2ff1a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <p className={styles.successText}>You're in. Welcome aboard.</p>
            </div>
          ) : (
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                {status === 'loading'
                  ? <span className={styles.spinner}/>
                  : 'Join the mission'}
              </button>
              {status === 'error' && (
                <p className={styles.errorText}>Something went wrong — please try again.</p>
              )}
            </form>
          )}

          {/* Divider */}
          <div className={styles.divider}>
            <div className={styles.dividerLine}/>
            <span className={styles.dividerText}>Coming next</span>
            <div className={styles.dividerLine}/>
          </div>

          {/* Roadmap */}
          <div className={styles.roadmapList}>
            {ROADMAP.map(r => (
              <div key={r.name} className={styles.roadmapItem}>
                <div className={styles.roadmapDot}/>
                <div>
                  <p className={styles.roadmapName}>{r.name}</p>
                  <p className={styles.roadmapDesc}>{r.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Share line */}
          <p className={styles.share}>
            Know someone who loves space or aviation?{' '}
            Send them to{' '}
            <a href="https://objecttracer.com" className={styles.shareLink}>
              objecttracer.com
            </a>
            {' '}— every person who joins makes the platform better.
          </p>

        </div>
      </div>
    </div>
  )
}
