import styles from './SkyObjectPanel.module.css'

// ── Constellation mythology / descriptions ───────────────────────────────────
const CONSTELLATION_INFO = {
  Ori: { myth: 'The Hunter of Greek mythology, placed in the sky by Zeus. Contains Betelgeuse and Rigel, two of the brightest stars.' },
  UMa: { myth: 'The Great Bear. Contains the Big Dipper asterism, used for navigation for thousands of years.' },
  UMi: { myth: 'The Little Bear. Polaris, the North Star, sits at the tip of its tail.' },
  Sco: { myth: 'The Scorpion sent by Gaia to slay Orion. Its heart is the red supergiant Antares.' },
  Cyg: { myth: 'The Swan, flying along the Milky Way. Contains Deneb and the Northern Cross asterism.' },
  Lyr: { myth: 'The Lyre of Orpheus. Vega, its brightest star, was the northern pole star 12,000 years ago.' },
  Sgr: { myth: 'The Archer, a centaur. Points toward the center of the Milky Way galaxy.' },
  Leo: { myth: 'The Nemean Lion slain by Heracles. Regulus marks its heart.' },
  Gem: { myth: 'The Twins Castor and Pollux, inseparable brothers of Greek myth.' },
  Tau: { myth: 'The Bull. Contains the Pleiades and Hyades star clusters, and the red giant Aldebaran.' },
  CMa: { myth: 'The Greater Dog, companion to Orion. Contains Sirius, the brightest star in the night sky.' },
  Crv: { myth: 'The Crow, sent by Apollo to fetch water.' },
  Cru: { myth: 'The Southern Cross, the smallest constellation. Used for navigation in the southern hemisphere.' },
  Cas: { myth: 'The Queen of Ethiopia, recognizable by her W-shape.' },
  Per: { myth: 'The Hero who slew Medusa. Contains Algol, the "Demon Star," an eclipsing binary.' },
  And: { myth: 'The Chained Princess, daughter of Cassiopeia. Contains M31, the Andromeda Galaxy — nearest large galaxy to the Milky Way.' },
  Aql: { myth: 'The Eagle that carried Zeus\'s thunderbolts. Altair forms the Summer Triangle with Vega and Deneb.' },
  Peg: { myth: 'The Winged Horse. The Great Square of Pegasus is a prominent autumn asterism.' },
  Cen: { myth: 'The Centaur. Contains Alpha Centauri, the nearest star system to the Sun at 4.37 light-years.' },
  Eri: { myth: 'The River, one of the longest constellations. Achernar marks its southern end.' },
  Vir: { myth: 'The Maiden, associated with harvest goddesses. Contains the Virgo Cluster of galaxies.' },
  Boo: { myth: 'The Herdsman. Arcturus, its brightest star, is the fourth-brightest in the night sky.' },
  Oph: { myth: 'The Serpent Bearer, identified with Asclepius the healer.' },
  Her: { myth: 'The Strongman, Heracles of Greek myth. Contains M13, the Great Globular Cluster.' },
  Car: { myth: 'The Keel of the ship Argo. Contains Canopus, the second-brightest star.' },
  Psc: { myth: 'The Fishes, tied together by a cord. Associated with Aphrodite and Eros.' },
  Ari: { myth: 'The Ram with the Golden Fleece sought by Jason and the Argonauts.' },
  Cap: { myth: 'The Sea Goat — half goat, half fish. One of the oldest recognized constellations.' },
  Aqr: { myth: 'The Water Bearer, pouring water into the mouth of the Southern Fish.' },
  Lib: { myth: 'The Scales of justice, once part of Scorpius.' },
  Dra: { myth: 'The Dragon, coiled around the north celestial pole. Thuban was the pole star 4,000 years ago.' },
}

// ── Spectral class descriptions ──────────────────────────────────────────────
function spectralDesc(bv) {
  if (bv < -0.1) return 'Blue-white hot star (O/B type)'
  if (bv < 0.3)  return 'White star (A/F type)'
  if (bv < 0.6)  return 'Yellow-white star (F/G type)'
  if (bv < 0.8)  return 'Yellow star, Sun-like (G type)'
  if (bv < 1.2)  return 'Orange star (K type)'
  return 'Red cool star (M type)'
}

function formatRA(h) {
  const hh = Math.floor(h)
  const mm = Math.floor((h - hh) * 60)
  const ss = ((h - hh) * 3600 - mm * 60).toFixed(1)
  return `${hh}h ${mm}m ${ss}s`
}

function formatDec(d) {
  const sign = d >= 0 ? '+' : '-'
  const abs = Math.abs(d)
  const dd = Math.floor(abs)
  const mm = Math.floor((abs - dd) * 60)
  const ss = Math.round(((abs - dd) * 3600 - mm * 60))
  return `${sign}${dd}\u00b0 ${mm}\u2032 ${ss}\u2033`
}

function StatRow({ label, value }) {
  if (value == null || value === '') return null
  return (
    <div className={styles.statRow}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
    </div>
  )
}

export default function SkyObjectPanel({ skyObject, onClose }) {
  if (!skyObject) return null

  if (skyObject.type === 'star') return (
    <aside className={styles.panel} aria-label={`${skyObject.name} details`}>
      <div className={styles.header}>
        <div className={styles.symbol}>&#x2726;</div>
        <div className={styles.titles}>
          <h2 className={styles.name}>{skyObject.name}</h2>
          <span className={styles.typeBadge} style={{ background: 'rgba(180,200,255,0.12)', color: '#b4c8ff', borderColor: 'rgba(180,200,255,0.25)' }}>
            Star
          </span>
        </div>
        <button className={styles.close} onClick={onClose} aria-label="Close">&#x2715;</button>
      </div>
      <div className={styles.stats}>
        <StatRow label="Visual magnitude" value={skyObject.vmag?.toFixed(2)} />
        <StatRow label="Spectral type" value={spectralDesc(skyObject.bv)} />
        <StatRow label="B-V color index" value={skyObject.bv?.toFixed(2)} />
        <StatRow label="Right Ascension" value={formatRA(skyObject.ra)} />
        <StatRow label="Declination" value={formatDec(skyObject.dec)} />
        <StatRow label="Catalog ID" value={`HR ${skyObject.hr}`} />
      </div>
    </aside>
  )

  if (skyObject.type === 'constellation') {
    const info = CONSTELLATION_INFO[skyObject.id]
    return (
      <aside className={styles.panel} aria-label={`${skyObject.name} details`}>
        <div className={styles.header}>
          <div className={styles.symbol}>&#x2727;</div>
          <div className={styles.titles}>
            <h2 className={styles.name}>{skyObject.name}</h2>
            <span className={styles.typeBadge} style={{ background: 'rgba(100,150,220,0.12)', color: '#6496dc', borderColor: 'rgba(100,150,220,0.25)' }}>
              Constellation
            </span>
          </div>
          <button className={styles.close} onClick={onClose} aria-label="Close">&#x2715;</button>
        </div>
        <div className={styles.stats}>
          <StatRow label="IAU Abbreviation" value={skyObject.id} />
        </div>
        {info?.myth && <p className={styles.facts}>{info.myth}</p>}
      </aside>
    )
  }

  if (skyObject.type === 'planet') return (
    <aside className={styles.panel} aria-label={`${skyObject.name} details`}>
      <div className={styles.header}>
        <div className={styles.symbol}>&#x2609;</div>
        <div className={styles.titles}>
          <h2 className={styles.name}>{skyObject.name}</h2>
          <span className={styles.typeBadge} style={{ background: 'rgba(255,220,120,0.12)', color: '#ffdc78', borderColor: 'rgba(255,220,120,0.25)' }}>
            {skyObject.name === 'Moon' ? 'Natural Satellite' : skyObject.name === 'Sun' ? 'Star' : 'Planet'}
          </span>
        </div>
        <button className={styles.close} onClick={onClose} aria-label="Close">&#x2715;</button>
      </div>
      <p className={styles.facts}>
        Visible tonight in the sky. Switch to Solar System view for orbital details.
      </p>
    </aside>
  )

  return null
}
