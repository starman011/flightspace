import { useState, useEffect } from 'react'
import styles from './BetaWelcome.module.css'

const STORAGE_KEY = 'objecttracer_sessions'

// Minimalist line icons (no emoji).
const I = {
  tower:  'M12 2v5M8 22l4-15 4 15M5 22h14',
  layers: 'M12 3 3 7.5 12 12l9-4.5L12 3zM3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5',
  rocket: 'M14.5 4.5c3 0 5 2 5 5-1.6 6-7.5 9-9.6 9.6C9.5 16.5 8.5 6.6 14.5 4.5zM10 16l-2 2m-3-3s.5-2.5 2-4',
  moon:   'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z',
  signal: 'M5 12a7 7 0 0 1 7-7M5 12a7 7 0 0 0 7 7M12 12h.01',
}
const Icon = ({ d }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
)

// Bento cells — a mix of photo tiles (the "flavours") and compact icon tiles.
const CELLS = [
  { img: '/flight-sky.jpg', title: 'Live flights',  desc: 'Aircraft, satellites & ships on a real-time 3D globe', span: 'wideTall' },
  { img: '/night-sky.jpg',  title: 'Deep space',    desc: 'Galaxies & the cosmic web',                          span: 'wide' },
  { icon: 'tower',  title: 'Airports',  desc: '930 live boards' },
  { icon: 'layers', title: 'Fleets',    desc: 'By airline / type' },
  { icon: 'rocket', title: 'Launches',  desc: 'Live countdowns' },
  { icon: 'moon',   title: 'The Moon',  desc: 'Sites & orbiters' },
  { img: '/boy-sky.jpg',    title: 'Just look up',  desc: 'The wonder overhead, made visible',                  span: 'wide' },
]

export default function BetaWelcome() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const n = (parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10) || 0) + 1
    localStorage.setItem(STORAGE_KEY, String(n))
    if (n <= 2) setVisible(true)   // sessions 1 & 2 only
  }, [])

  if (!visible) return null

  return (
    <div data-greet className={styles.overlay} onClick={() => setVisible(false)}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <button className={styles.close} onClick={() => setVisible(false)} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>

        <div className={styles.head}>
          <h2 className={styles.title}>Welcome to ObjectTracer</h2>
          <p className={styles.subtitle}>Everything above you — live on one 3D globe.</p>
        </div>

        <div className={styles.bento}>
          {CELLS.map((c, i) => (
            <div key={i} className={`${styles.cell} ${c.img ? styles.photo : styles.tile} ${c.span ? styles[c.span] : ''}`}>
              {c.img && <><img className={styles.cellImg} src={c.img} alt="" loading="lazy" /><div className={styles.veil} /></>}
              {c.icon && <span className={styles.icon}><Icon d={I[c.icon]} /></span>}
              <div className={styles.cellText}>
                <h3 className={styles.cellTitle}>{c.title}</h3>
                <p className={styles.cellDesc}>{c.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <button className={styles.enterBtn} onClick={() => setVisible(false)}>Enter ObjectTracer</button>
      </div>
    </div>
  )
}
