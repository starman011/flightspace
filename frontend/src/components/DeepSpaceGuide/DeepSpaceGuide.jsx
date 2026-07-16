import styles from './DeepSpaceGuide.module.css'

export default function DeepSpaceGuide({ onClose }) {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.symbol}>
          <span className="material-symbols-outlined">scatter_plot</span>
        </span>
        <div className={styles.titles}>
          <h3 className={styles.name}>Deep Space</h3>
          <span className={styles.subtitle}>DESI DR1 Galaxy Map</span>
        </div>
        <button className={styles.close} onClick={onClose} aria-label="Close">✕</button>
      </div>

      {/* ── What you're seeing ────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>What You're Seeing</div>
        <p className={styles.body}>
          Every dot is a <strong>real galaxy or quasar</strong> observed by the
          Dark Energy Spectroscopic Instrument (DESI) — the most powerful
          galaxy survey ever built. You're looking at 100,000 objects sampled
          from 14.7 million in the full catalog.
        </p>
        <p className={styles.body}>
          Their positions are <strong>astronomically accurate</strong> — mapped
          from Right Ascension, Declination, and redshift into a true 3D
          distribution of the observable universe.
        </p>
      </div>

      {/* ── Color legend ──────────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Color = Distance</div>
        <div className={styles.legendBar} />
        <div className={styles.legendLabels}>
          <span>Nearby</span>
          <span>Distant</span>
        </div>
        <div className={styles.legendItems}>
          <div className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: 'hsl(187, 80%, 58%)' }} />
            <span>z {'<'} 0.3 — under 4 billion light-years</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: 'hsl(223, 75%, 55%)' }} />
            <span>z ≈ 0.5 — around 6 billion light-years</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: 'hsl(260, 70%, 50%)' }} />
            <span>z ≈ 1.0 — about 10 billion light-years</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: 'hsl(310, 60%, 42%)' }} />
            <span>z {'>'} 2.0 — over 12 billion light-years</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: 'hsl(30, 85%, 50%)' }} />
            <span>Quasars — supermassive black holes</span>
          </div>
        </div>
      </div>

      {/* ── What is redshift ──────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>What is Redshift?</div>
        <p className={styles.body}>
          The universe is expanding. As light travels through expanding space,
          its wavelength <strong>stretches</strong> — shifting from blue toward
          red. The farther away an object is, the more its light has stretched.
        </p>
        <p className={styles.body}>
          A redshift of <strong>z = 1</strong> means the light was stretched
          to double its original wavelength. That light left its galaxy about
          <strong> 7.7 billion years ago</strong>, when the universe was
          half its current age.
        </p>
      </div>

      {/* ── Galaxy vs Quasar ──────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Galaxies vs Quasars</div>
        <div className={styles.infoCard}>
          <div className={styles.infoIcon}>⊛</div>
          <div>
            <div className={styles.infoLabel}>Galaxy</div>
            <p className={styles.infoBody}>
              A gravitationally bound system of stars, gas, dust, and dark
              matter. The Milky Way is one. DESI has cataloged 14.7 million
              galaxies with precise distances.
            </p>
          </div>
        </div>
        <div className={styles.infoCard}>
          <div className={styles.infoIcon} style={{ color: '#ffb43c' }}>◈</div>
          <div>
            <div className={styles.infoLabel} style={{ color: '#ffb43c' }}>Quasar</div>
            <p className={styles.infoBody}>
              The brightest objects in the universe. A supermassive black hole
              (billions of solar masses) consuming matter so violently that it
              outshines its entire host galaxy. DESI found 1.7 million of them.
            </p>
          </div>
        </div>
      </div>

      {/* ── Interaction ───────────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>How to Explore</div>
        <div className={styles.tipList}>
          <div className={styles.tip}>
            <span className={styles.tipIcon}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 11V6a2 2 0 0 1 4 0v5" /><path d="M13 8a2 2 0 0 1 4 0v4a6 6 0 0 1-6 6h-1a5 5 0 0 1-4-2l-2.5-3.5a1.5 1.5 0 0 1 2.4-1.8L8 12" /></svg>
            </span>
            <span><strong>Hover</strong> any dot to preview its type and distance</span>
          </div>
          <div className={styles.tip}>
            <span className={styles.tipIcon}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4l7 16 2.5-6.5L20 11z" /></svg>
            </span>
            <span><strong>Click</strong> a dot for full data: distance, lookback time, velocity, spectral info</span>
          </div>
          <div className={styles.tip}>
            <span className={styles.tipIcon}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>
            </span>
            <span><strong>Drag</strong> to rotate the view and see the 3D distribution</span>
          </div>
        </div>
      </div>

      {/* ── The cosmic web ────────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>The Cosmic Web</div>
        <p className={styles.body}>
          Galaxies aren't randomly scattered — they form an immense web-like
          structure. Dense clusters connect via <strong>filaments</strong>,
          separated by vast empty <strong>voids</strong>. This large-scale
          structure formed from tiny density ripples in the early universe,
          amplified by gravity over 13.8 billion years.
        </p>
        <p className={styles.body}>
          DESI is mapping this structure to measure how <strong>dark
          energy</strong> drives the accelerating expansion of the universe —
          one of the deepest mysteries in physics.
        </p>
      </div>

      {/* ── Stats ─────────────────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>DESI DR1 at a Glance</div>
        <div className={styles.statGrid}>
          <div className={styles.statBlock}>
            <div className={styles.statNum}>14.7M</div>
            <div className={styles.statDesc}>galaxies with redshifts</div>
          </div>
          <div className={styles.statBlock}>
            <div className={styles.statNum}>1.7M</div>
            <div className={styles.statDesc}>quasars cataloged</div>
          </div>
          <div className={styles.statBlock}>
            <div className={styles.statNum}>4.75M</div>
            <div className={styles.statDesc}>Milky Way stars</div>
          </div>
          <div className={styles.statBlock}>
            <div className={styles.statNum}>5,000</div>
            <div className={styles.statDesc}>optical fibers simultaneously</div>
          </div>
        </div>
      </div>

      {/* ── Attribution ───────────────────────────────────────────────── */}
      <div className={styles.attribution}>
        Data: DESI Data Release 1 — NOIRLab Astro Data Lab<br />
        DESI Collaboration, 2024
      </div>
    </div>
  )
}
