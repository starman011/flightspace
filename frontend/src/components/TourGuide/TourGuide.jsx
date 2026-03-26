import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import styles from './TourGuide.module.css'

const STORAGE_KEY = 'fs_tour_done_v1'
const PAD = 8   // padding around spotlight rect

// Steps reference elements via data-tour="..." attributes.
// Each step provides separate copy for desktop vs mobile.
const STEPS = [
  {
    target:  'live-btn',
    title:   'Enable live tracking',
    body:    'Hit LIVE to stream real-time positions of aircraft, satellites and ships on the globe.',
    mTitle:  'Enable live tracking',
    mBody:   'Tap the notch at the top, then press LIVE to start real-time tracking.',
    icon:    'wifi_tethering',
  },
  {
    target:  'search-btn',
    title:   'Search anything',
    body:    'Look up any flight by callsign, aircraft type or ICAO code for instant details.',
    mTitle:  'Search anything',
    mBody:   'Open the notch and tap Search to find any flight or aircraft.',
    icon:    'search',
  },
  {
    target:  'signal-stream',
    title:   'Explore the data stream',
    body:    'This panel rotates through live space data — solar activity, APOD, launches and more.',
    mTitle:  'Swipe up for space data',
    mBody:   'Swipe up on the bar at the bottom to reveal the Signal Stream — solar data, news, APOD and more. Swipe left/right to cycle panels.',
    icon:    'database',
  },
  {
    target:  'filter-bar',
    title:   'Filter by category',
    body:    'Use the bottom dock to filter by satellites, flights, launches, asteroids or ships.',
    mTitle:  'Filter by category',
    mBody:   'Tap the bar at the very bottom to filter by satellites, flights, launches and more.',
    icon:    'filter_list',
  },
]

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth <= 767)
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth <= 767)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return mobile
}

function getRect(selector) {
  const el = document.querySelector(`[data-tour="${selector}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }
}

export default function TourGuide() {
  const [active, setActive]   = useState(false)
  const [step,   setStep]     = useState(0)
  const [rect,   setRect]     = useState(null)
  const isMobile              = useIsMobile()
  const animFrameRef          = useRef(null)

  // Start tour for first-time visitors only
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return
    // Short delay so the app fully renders before we measure elements
    const t = setTimeout(() => setActive(true), 1200)
    return () => clearTimeout(t)
  }, [])

  // Keep spotlight rect in sync with the target element (handles layout shifts)
  const measureRect = useCallback(() => {
    if (!active) return
    const r = getRect(STEPS[step].target)
    setRect(r)
    animFrameRef.current = requestAnimationFrame(measureRect)
  }, [active, step])

  useLayoutEffect(() => {
    animFrameRef.current = requestAnimationFrame(measureRect)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [measureRect])

  const finish = useCallback(() => {
    setActive(false)
    localStorage.setItem(STORAGE_KEY, '1')
  }, [])

  const next = useCallback(() => {
    if (step < STEPS.length - 1) setStep(s => s + 1)
    else finish()
  }, [step, finish])

  if (!active) return null

  const s          = STEPS[step]
  const title      = isMobile ? s.mTitle : s.title
  const body       = isMobile ? s.mBody  : s.body
  const isLast     = step === STEPS.length - 1

  // Decide tooltip position: below spotlight if there's room, else above
  let tooltipStyle = {}
  if (rect) {
    const below = rect.top + rect.height + 16
    const above = rect.top - 16
    if (below + 160 < window.innerHeight) {
      tooltipStyle = { top: below, left: Math.max(12, Math.min(rect.left, window.innerWidth - 312)) }
    } else {
      tooltipStyle = { bottom: window.innerHeight - above, left: Math.max(12, Math.min(rect.left, window.innerWidth - 312)) }
    }
  }

  return (
    <div className={styles.root} onClick={(e) => { if (e.target === e.currentTarget) finish() }}>
      {/* Dark backdrop with spotlight cutout via box-shadow */}
      {rect && (
        <div
          className={styles.spotlight}
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      )}

      {/* Tooltip card */}
      <div className={styles.tooltip} style={tooltipStyle}>
        <div className={styles.tooltipHeader}>
          <span className={styles.stepIcon}>
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{s.icon}</span>
          </span>
          <span className={styles.stepCount}>{step + 1} / {STEPS.length}</span>
        </div>

        <p className={styles.tooltipTitle}>{title}</p>
        <p className={styles.tooltipBody}>{body}</p>

        <div className={styles.tooltipFooter}>
          <div className={styles.dots}>
            {STEPS.map((_, i) => (
              <span key={i} className={`${styles.dot} ${i === step ? styles.dotActive : ''}`} />
            ))}
          </div>
          <div className={styles.btns}>
            <button className={styles.skipBtn} onClick={finish}>Skip</button>
            <button className={styles.nextBtn} onClick={next}>
              {isLast ? 'Done' : 'Next'}
              {!isLast && <span className="material-symbols-outlined" style={{ fontSize: 13 }}>arrow_forward</span>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
