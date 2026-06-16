import { useState, useEffect, useCallback } from 'react'
import styles from './TourGuide.module.css'

// Bumped to v2: the old spotlight tour pointed at elements that no longer exist
// (status-bar / filter-bar) and rendered broken on both breakpoints. Bumping the
// key lets everyone see the fixed guide once.
const STORAGE_KEY = 'fs_tour_done_v2'

// A centered, fully-responsive card carousel — no element measurement, so it
// renders identically and correctly on desktop and mobile. Copy adapts the
// interaction verb (click vs tap) per device.
const STEPS = [
  {
    icon:  'public',
    title: 'Welcome to ObjectTracer',
    body:  'A live 3D globe for everything above the horizon — aircraft, ships, the ISS, satellites, rockets and asteroids. Here are the four things worth knowing.',
    mBody: 'A live 3D globe for everything above the horizon — flights, ships, the ISS, satellites, rockets and asteroids. Four quick things to know.',
  },
  {
    icon:  'wifi_tethering',
    title: 'Turn on live tracking',
    body:  'Find the LIVE toggle in the bottom bar and click it to stream real-time positions of aircraft, ships and satellites.',
    mBody: 'Open the bottom bar and tap LIVE to start streaming real-time aircraft, ships and satellites.',
  },
  {
    icon:  'search',
    title: 'Search anything',
    body:  'Use Search to look up any flight by callsign, aircraft type or ICAO code — the globe flies straight to it.',
    mBody: 'Tap Search to find any flight by callsign, aircraft type or ICAO code — the globe flies right to it.',
  },
  {
    icon:  'tune',
    title: 'Filter & explore',
    body:  'Use the bottom dock to filter by satellites, flights, launches, asteroids or ships — and switch scale from Earth out to deep space.',
    mBody: 'Swipe up the bottom bar for filters (satellites, flights, launches, asteroids, ships) plus live space data, and switch scale from Earth to deep space.',
  },
]

function useIsMobile() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth <= 640)
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth <= 640)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return mobile
}

export default function TourGuide() {
  const [active, setActive] = useState(false)
  const [step,   setStep]   = useState(0)
  const isMobile            = useIsMobile()

  // First-time visitors only, after the app has rendered.
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return
    const t = setTimeout(() => setActive(true), 1000)
    return () => clearTimeout(t)
  }, [])

  const finish = useCallback(() => {
    setActive(false)
    localStorage.setItem(STORAGE_KEY, '1')
  }, [])

  const next = useCallback(() => {
    setStep(s => {
      if (s < STEPS.length - 1) return s + 1
      finish()
      return s
    })
  }, [finish])

  const back = useCallback(() => setStep(s => Math.max(0, s - 1)), [])

  // Keyboard: Esc skips, ←/→ navigate, Enter advances
  useEffect(() => {
    if (!active) return
    const onKey = (e) => {
      if (e.key === 'Escape') finish()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      else if (e.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, finish, next, back])

  if (!active) return null

  const s      = STEPS[step]
  const body   = isMobile ? s.mBody : s.body
  const isLast = step === STEPS.length - 1
  const isFirst = step === 0

  return (
    <div
      className={styles.root}
      role="dialog"
      aria-modal="true"
      aria-label="Getting started"
      onClick={(e) => { if (e.target === e.currentTarget) finish() }}
    >
      <div className={styles.card} key={step}>
        <button className={styles.close} onClick={finish} aria-label="Close guide">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
        </button>

        <div className={styles.iconBadge}>
          <span className="material-symbols-outlined" style={{ fontSize: 26 }}>{s.icon}</span>
        </div>

        <span className={styles.stepCount}>Step {step + 1} of {STEPS.length}</span>
        <h2 className={styles.title}>{s.title}</h2>
        <p className={styles.body}>{body}</p>

        <div className={styles.dots}>
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`${styles.dot} ${i === step ? styles.dotActive : ''}`}
              onClick={() => setStep(i)}
            />
          ))}
        </div>

        <div className={styles.footer}>
          <button className={styles.skipBtn} onClick={finish}>
            {isLast ? '' : 'Skip'}
          </button>
          <div className={styles.navBtns}>
            {!isFirst && (
              <button className={styles.backBtn} onClick={back}>Back</button>
            )}
            <button className={styles.nextBtn} onClick={next}>
              {isLast ? 'Start exploring' : 'Next'}
              {!isLast && (
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>arrow_forward</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
