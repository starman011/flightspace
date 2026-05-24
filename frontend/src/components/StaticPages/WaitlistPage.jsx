import { useState } from 'react'
import styles from './StaticPages.module.css'

const CURRENT_FEATURES = [
  { name: 'Live Flights',     desc: '10,000+ planes tracked in real time' },
  { name: 'ISS Position',     desc: 'International Space Station live at 28,000 km/h' },
  { name: 'Satellites',       desc: 'Hundreds of active satellites with live orbits' },
  { name: 'Wind Layer',       desc: 'Global atmospheric wind patterns, live overlay' },
  { name: 'Moon Explorer',    desc: '3D lunar surface — Apollo sites, craters, missions' },
  { name: 'Solar System',     desc: 'All 8 planets at real positions, rendered to scale' },
  { name: 'Rocket Launches',  desc: 'Live countdowns — SpaceX, ISRO, ESA, Rocket Lab' },
  { name: 'Deep Space',       desc: '2M+ galaxies — fly through the observable universe', beta: true },
]

const SECTIONS = [
  {
    label: '01 — EARTH VIEW',
    photo: 'photo-1614730321146-b6fa6a46bcb4',
    heading: 'Live Flights, ISS & Wind Layer',
    body: 'Watch 10,000+ commercial flights move in real time. Track the ISS completing a full lap every 90 minutes at 28,000 km/h. Overlay live global wind patterns.',
  },
  {
    label: '02 — LUNAR SURFACE',
    photo: 'photo-1446941611757-91d2c3bd3d45',
    heading: 'Lunar Explorer',
    body: 'Navigate the Moon in 3D. Every Apollo landing site, Chang\'e missions, future Artemis targets.',
  },
  {
    label: '03 — SOLAR SYSTEM',
    photo: 'photo-1614732414444-096e5f1122d5',
    heading: 'Planets in Motion',
    body: 'All eight planets at their real positions right now. Orbital mechanics, active missions, asteroid belt — live 3D to scale.',
  },
  {
    label: '04 — DEEP SPACE (BETA)',
    photo: 'photo-1543722530-d2c3201371e7',
    heading: 'Galaxies & Deep Field',
    body: 'Over 2 million galaxies mapped into a 3D deep-field view. Fly through the observable universe from the Milky Way\'s edge to objects 13 billion light-years away.',
  },
  {
    label: '05 — LAUNCHES',
    photo: 'photo-1541185934-01b600ea069c',
    heading: 'Every Launch, Live',
    body: 'Live countdown timers for every scheduled orbital launch — SpaceX, Rocket Lab, ISRO, ESA and more.',
  },
  {
    label: '06 — NEAR-EARTH OBJECTS',
    photo: 'photo-1419242902214-272b3f66ee7a',
    heading: 'Asteroids & Close Approaches',
    body: 'Monitor near-Earth asteroids, visualise orbital paths, track confirmed close approaches. Data from NASA\'s Center for Near-Earth Object Studies.',
  },
]

const ROADMAP = [
  {
    name: 'Precision Tracking',
    desc: 'Sub-second position updates on any object — earth surface to deep space.',
  },
  {
    name: 'Smart Custom Alerts',
    desc: 'ISS overhead, launches 30 min before liftoff, flight landings — you set the rules.',
  },
  {
    name: 'Flight Replay',
    desc: 'Rewind any flight or launch trajectory, hour by hour, on the live globe.',
  },
]

export default function WaitlistPage({ onClose }) {
  const [email, setEmail]   = useState('')
  const [status, setStatus] = useState('idle')

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
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panelWide} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Join the Waitlist</h2>
          <button className={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>

        {/* Body */}
        <div className={styles.body}>

          {/* ── A. Orbit glyph + mission copy ──────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 32 }}>
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none" style={{ marginBottom: 16 }}>
              <circle cx="26" cy="26" r="22" stroke="rgba(178,255,26,0.1)" strokeWidth="1"/>
              <circle cx="26" cy="26" r="13" stroke="rgba(178,255,26,0.2)" strokeWidth="1"/>
              <circle cx="26" cy="26" r="4"  fill="#b2ff1a" opacity=".85"/>
              <ellipse cx="26" cy="26" rx="22" ry="8"
                stroke="#b2ff1a" strokeWidth="0.9" opacity=".3"
                transform="rotate(-35 26 26)"/>
              <circle cx="41" cy="18" r="2.2" fill="#b2ff1a" opacity=".55"/>
              <circle cx="14" cy="36" r="1.4" fill="#b2ff1a" opacity=".35"/>
            </svg>

            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(178,255,26,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 12px' }}>
              Our Mission
            </p>

            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,0.95)', letterSpacing: '-0.02em', margin: '0 0 18px', lineHeight: 1.25 }}>
              You just joined something we've been dreaming about.
            </h2>

            <p style={{ fontSize: 14, color: 'rgba(200,210,225,0.65)', lineHeight: 1.75, margin: '0 0 12px', maxWidth: 520 }}>
              Right now, as you read this, there are planes threading invisible corridors above your head. Satellites painting arcs across the dark. The ISS racing overhead at 28,000 km/h. Asteroids drifting silently through the inner solar system. The universe is not a still image — it is alive, in motion, happening right now.
            </p>
            <p style={{ fontSize: 14, color: 'rgba(200,210,225,0.65)', lineHeight: 1.75, margin: 0, maxWidth: 520 }}>
              We built ObjectTracer because we wanted to see all of it. Not behind a paywall. Not on a dashboard built for engineers. For everyone — the curious, the dreamers, the kid who looks up at a blinking light and wonders where it is going. The universe is happening live. We just want to help you watch.
            </p>
          </div>

          {/* ── B. Available now + feature grid ────────────────────────── */}
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(178,255,26,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 4px' }}>
            Available to you right now
          </p>
          <p style={{ fontSize: 13, color: 'rgba(200,210,225,0.5)', margin: '0 0 14px' }}>
            Open <span style={{ color: '#b2ff1a' }}>objecttracer.com</span> — live, no account needed.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 32 }}>
            {CURRENT_FEATURES.map((f, i) => (
              <div key={i} style={{
                background: 'rgba(200,210,225,0.03)',
                border: '1px solid rgba(200,210,225,0.07)',
                borderRadius: 12,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}>
                <div style={{
                  width: 28, height: 28,
                  background: 'rgba(178,255,26,0.08)',
                  border: '1px solid rgba(178,255,26,0.2)',
                  borderRadius: 8,
                  marginBottom: 6,
                }}/>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)', margin: 0 }}>
                  {f.name}
                  {f.beta && (
                    <span style={{ marginLeft: 6, fontSize: 9, background: 'rgba(178,255,26,0.12)', color: '#b2ff1a', border: '1px solid rgba(178,255,26,0.25)', borderRadius: 4, padding: '1px 5px', letterSpacing: '0.06em', verticalAlign: 'middle' }}>
                      BETA
                    </span>
                  )}
                </p>
                <p style={{ fontSize: 11, color: 'rgba(200,210,225,0.5)', margin: 0, lineHeight: 1.5 }}>{f.desc}</p>
              </div>
            ))}
          </div>

          {/* ── C. Feature sections with images ────────────────────────── */}
          {SECTIONS.map((s, i) => (
            <div key={i} style={{ marginBottom: 28 }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(178,255,26,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 10px' }}>
                {s.label}
              </p>
              <img
                src={`https://images.unsplash.com/${s.photo}?w=500&h=220&fit=crop&q=85`}
                alt={s.heading}
                style={{ width: '100%', borderRadius: 10, display: 'block', marginBottom: 12, objectFit: 'cover', height: 160 }}
              />
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.92)', margin: '0 0 8px' }}>
                {s.heading}
              </h3>
              <p style={{ fontSize: 13, color: 'rgba(200,210,225,0.6)', lineHeight: 1.65, margin: 0 }}>
                {s.body}
              </p>
            </div>
          ))}

          {/* ── D. Divider ──────────────────────────────────────────────── */}
          <div style={{ borderTop: '1px solid rgba(178,255,26,0.08)', margin: '8px 0 28px' }} />

          {/* ── E. Coming next ──────────────────────────────────────────── */}
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(178,255,26,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 14px' }}>
            Coming next
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
            {ROADMAP.map((r, i) => (
              <div key={i} style={{
                background: 'rgba(200,210,225,0.03)',
                border: '1px solid rgba(200,210,225,0.07)',
                borderRadius: 12,
                padding: '14px 16px',
              }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)', margin: '0 0 4px' }}>{r.name}</p>
                <p style={{ fontSize: 13, color: 'rgba(200,210,225,0.55)', margin: 0, lineHeight: 1.55 }}>{r.desc}</p>
              </div>
            ))}
          </div>

          {/* ── F. Email signup form ────────────────────────────────────── */}
          <div style={{ background: 'rgba(178,255,26,0.03)', border: '1px solid rgba(178,255,26,0.08)', borderRadius: 14, padding: '24px 20px', marginBottom: 20 }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(178,255,26,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 8px' }}>
              Join the mission
            </p>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'rgba(255,255,255,0.92)', margin: '0 0 8px' }}>
              Get notified as new features launch.
            </h3>
            <p style={{ fontSize: 13, color: 'rgba(200,210,225,0.55)', margin: '0 0 18px', lineHeight: 1.55 }}>
              You joined early. Your feedback shapes what we build next. Reply to your welcome email anytime — we read everything.
            </p>

            {status === 'done' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'rgba(178,255,26,0.06)', border: '1px solid rgba(178,255,26,0.2)', borderRadius: 10 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b2ff1a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: '#b2ff1a', margin: 0 }}>You're in. Welcome aboard.</p>
              </div>
            ) : (
              <form onSubmit={submit} style={{ display: 'flex', gap: 8 }}>
                <input
                  className={styles.formInput}
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  disabled={status === 'loading'}
                  autoComplete="email"
                  style={{ flex: 1 }}
                />
                <button
                  className={styles.formSubmit}
                  type="submit"
                  disabled={status === 'loading'}
                >
                  {status === 'loading' ? (
                    <span style={{
                      display: 'inline-block',
                      width: 12, height: 12,
                      border: '2px solid rgba(178,255,26,0.3)',
                      borderTopColor: '#b2ff1a',
                      borderRadius: '50%',
                      animation: 'spin 0.7s linear infinite',
                    }}/>
                  ) : 'Join the mission'}
                </button>
              </form>
            )}

            {status === 'error' && (
              <p style={{ fontSize: 12, color: 'rgba(255,100,100,0.8)', margin: '10px 0 0', fontFamily: 'var(--font-mono)' }}>
                Something went wrong — please try again.
              </p>
            )}
          </div>

          {/* ── G. Spread the word ──────────────────────────────────────── */}
          <p style={{ fontSize: 12, color: 'rgba(200,210,225,0.35)', textAlign: 'center', lineHeight: 1.6, margin: 0 }}>
            Know someone who loves space or aviation? Send them to{' '}
            <a href="https://objecttracer.com" style={{ color: 'rgba(178,255,26,0.5)', textDecoration: 'none' }}>objecttracer.com</a>
            {' '}— every person who joins makes the platform better.
          </p>

        </div>
      </div>
    </div>
  )
}
