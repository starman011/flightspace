import { useState, useMemo } from 'react'
import { useAsteroids } from '../../hooks/useAsteroids'
import SolarMap from '../SolarMap/SolarMap'
import styles from './DeepSpacePanel.module.css'

function fmt(n, decimals = 2) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: decimals })
}

function fmtMiss(km) {
  if (km == null) return '—'
  if (km >= 1_000_000) return `${fmt(km / 1_000_000, 2)}M km`
  return `${fmt(km, 0)} km`
}

function hazardLevel(ast) {
  if (ast.pha) return 'HIGH'
  if (ast.miss_km < 1_000_000) return 'ELEVATED'
  return 'NOMINAL'
}

const NASA_LINKS = [
  {
    label: 'JPL Small-Body Database',
    icon: 'database',
    href: (ast) => `https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${encodeURIComponent(ast.name)}`,
  },
  {
    label: 'CNEOS Close Approaches',
    icon: 'track_changes',
    href: () => 'https://cneos.jpl.nasa.gov/ca/',
  },
  {
    label: 'NASA Planetary Defense',
    icon: 'shield',
    href: () => 'https://www.nasa.gov/planetarydefense/',
  },
  {
    label: 'NASA NeoWs API Feed',
    icon: 'api',
    href: () => 'https://api.nasa.gov/#NeoWs',
  },
]

function AsteroidDetail({ ast, onClose }) {
  if (!ast) return (
    <div className={styles.noSelect}>
      <span className="material-symbols-outlined" style={{ fontSize: 28 }}>radar</span>
      Click an asteroid to view details
    </div>
  )
  return (
    <div className={styles.asteroidDetail}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p className={styles.detailName}>{ast.name.replace(/^\(?\d+\)?\s*/, '') || ast.id}</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(132,147,150,0.6)', marginTop: 2 }}>
            ID: {ast.id}
          </p>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(195,245,255,0.3)', padding: 4 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
        </button>
      </div>

      {ast.pha && (
        <div className={styles.detailPha}>
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>warning</span>
          Potentially Hazardous
        </div>
      )}

      <div className={styles.detailGrid}>
        <div className={styles.detailCell}>
          <p className={styles.detailCellLabel}>Miss Distance</p>
          <p className={styles.detailCellValue}>{fmtMiss(ast.miss_km)}</p>
        </div>
        <div className={styles.detailCell}>
          <p className={styles.detailCellLabel}>Lunar Distance</p>
          <p className={styles.detailCellValue}>{fmt(ast.miss_ld, 2)} LD</p>
        </div>
        <div className={styles.detailCell}>
          <p className={styles.detailCellLabel}>Velocity</p>
          <p className={styles.detailCellValue}>{fmt(ast.vel_kps, 2)} km/s</p>
        </div>
        <div className={styles.detailCell}>
          <p className={styles.detailCellLabel}>Approach Date</p>
          <p className={styles.detailCellValue} style={{ fontSize: 11 }}>
            {ast.approach_date
              ? new Date(ast.approach_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : '—'}
          </p>
        </div>
        <div className={styles.detailCell}>
          <p className={styles.detailCellLabel}>Min Diameter</p>
          <p className={styles.detailCellValue}>{fmt(ast.diam_min, 3)} km</p>
        </div>
        <div className={styles.detailCell}>
          <p className={styles.detailCellLabel}>Max Diameter</p>
          <p className={styles.detailCellValue}>{fmt(ast.diam_max, 3)} km</p>
        </div>
        {ast.a > 0 && (
          <div className={styles.detailCell}>
            <p className={styles.detailCellLabel}>Semi-Major Axis</p>
            <p className={styles.detailCellValue}>{fmt(ast.a, 3)} AU</p>
          </div>
        )}
        {ast.e > 0 && (
          <div className={styles.detailCell}>
            <p className={styles.detailCellLabel}>Eccentricity</p>
            <p className={styles.detailCellValue}>{fmt(ast.e, 4)}</p>
          </div>
        )}
      </div>

      <p className={styles.detailSection}>Official References</p>
      <div className={styles.refLinks}>
        {NASA_LINKS.map(link => (
          <a
            key={link.label}
            className={styles.refLink}
            href={link.href(ast)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{link.icon}</span>
            {link.label}
            <span className="material-symbols-outlined" style={{ fontSize: 12, marginLeft: 'auto', opacity: 0.4 }}>open_in_new</span>
          </a>
        ))}
      </div>
    </div>
  )
}

export default function DeepSpacePanel({ open, onClose }) {
  const { asteroids, loading, error } = useAsteroids(open)
  const [query, setQuery]               = useState('')
  const [view,  setView]                = useState('directory')  // 'directory' | 'solarmap'
  const [selectedAsteroid, setSelectedAsteroid] = useState(null)

  const filtered = useMemo(() => {
    if (!query.trim()) return asteroids
    const q = query.toLowerCase()
    return asteroids.filter(a => a.name?.toLowerCase().includes(q) || a.id?.includes(q))
  }, [asteroids, query])

  // Summary stats
  const phaCount    = asteroids.filter(a => a.pha).length
  const avgVel      = asteroids.length
    ? asteroids.reduce((s, a) => s + (a.vel_kps ?? 0), 0) / asteroids.length
    : 0
  const closestMiss = asteroids.length
    ? Math.min(...asteroids.map(a => a.miss_km ?? Infinity))
    : null
  const closestPct  = closestMiss != null
    ? Math.min(100, (1 - closestMiss / 7_500_000) * 100).toFixed(1)
    : 0

  return (
    <div className={`${styles.panel} ${open ? styles.open : ''}`} aria-label="Deep Space Directory">

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className={styles.badge}>
          <span className={styles.badgeDot} />
          {loading ? 'Scanning Deep Field…' : `${asteroids.length} Objects Cataloged`}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'rgba(178,255,26,0.06)', border: '1px solid rgba(178,255,26,0.15)',
              borderRadius: 8, color: 'rgba(195,245,255,0.6)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
              textTransform: 'uppercase', padding: '6px 12px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_back</span>
            Back to Globe
          </button>
        )}
      </div>
      <h1 className={styles.pageTitle}>Deep Space Directory</h1>
      <p className={styles.pageDesc}>
        Live near-earth object feed from NASA NeoWs. 7-day close-approach window.
        {phaCount > 0 && <> <span className={styles.phaWarn}>{phaCount} potentially hazardous.</span></>}
      </p>

      {/* ── View tab switcher ── */}
      <div className={styles.viewTabs}>
        <button
          className={`${styles.viewTab} ${view === 'directory' ? styles.viewTabActive : ''}`}
          onClick={() => setView('directory')}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>table_rows</span>
          Directory
        </button>
        <button
          className={`${styles.viewTab} ${view === 'solarmap' ? styles.viewTabActive : ''}`}
          onClick={() => setView('solarmap')}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>scatter_plot</span>
          Solar Map
        </button>
      </div>

      {view === 'solarmap' ? (
        /* ── Solar Map view ── */
        <div className={`${styles.solarLayout} ${selectedAsteroid ? styles.solarLayoutWithDetail : ''}`}>
          <SolarMap
            asteroids={asteroids}
            selectedId={selectedAsteroid?.id ?? null}
            onSelect={(hit) => {
              if (!hit) { setSelectedAsteroid(null); return }
              const full = asteroids.find(a => a.id === hit.id)
              setSelectedAsteroid(full ?? null)
            }}
          />
          <AsteroidDetail
            ast={selectedAsteroid}
            onClose={() => setSelectedAsteroid(null)}
          />
        </div>
      ) : (
        /* ── Directory view ── */
        <>
          {/* Search */}
          <div className={styles.searchRow}>
            <div className={styles.searchWrap}>
              <span className={`material-symbols-outlined ${styles.searchIcon}`}>search</span>
              <input
                className={styles.searchInput}
                type="text"
                placeholder="Search by name or ID…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            <button className={styles.filterBtn} onClick={() => setQuery('')}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>filter_list</span>
              Clear
            </button>
          </div>

          {/* Risk Assessment */}
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Active Risk Assessment</h2>
            <span className={styles.sectionMeta}>
              {loading ? 'Fetching…' : error ? 'Data unavailable' : 'System Status: Live'}
            </span>
          </div>

          <div className={styles.riskGrid}>
            <div className={styles.riskCard}>
              <span className={`material-symbols-outlined ${styles.riskIcon}`} style={{ color: 'var(--on-error)' }}>warning</span>
              <p className={styles.riskLabel}>Closest Approach</p>
              <p className={styles.riskValue}>{closestMiss != null ? fmtMiss(closestMiss) : '—'}</p>
              <div className={styles.riskBar}>
                <div className={styles.riskBarFill} style={{ width: `${closestPct}%`, background: 'var(--error-container)' }} />
              </div>
              <div className={styles.riskAlert}>
                <span className={styles.riskDot} />
                {phaCount > 0 ? `${phaCount} PHA Objects` : 'No imminent threat'}
              </div>
            </div>

            <div className={styles.riskCard}>
              <p className={styles.riskLabel}>Avg Velocity</p>
              <p className={styles.riskValue}>{fmt(avgVel, 1)} <span className={styles.riskUnit}>km/s</span></p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 'var(--space-3)' }}>
                <div className={styles.avatarGroup}>
                  {asteroids.slice(0, 3).map((a, i) => (
                    <div key={a.id} className={styles.avatar}>{String.fromCharCode(65 + i)}{i + 1}</div>
                  ))}
                </div>
                <span className={styles.avatarLabel}>{asteroids.length} Objects Tracked</span>
              </div>
            </div>

            <div className={styles.riskCard}>
              <p className={styles.riskLabel}>System Health</p>
              <p className={styles.riskValue}>{error ? 'OFFLINE' : '98.2%'}</p>
              <div className={styles.nominalTag}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  {error ? 'error' : 'check_circle'}
                </span>
                {error ? `Error: ${error}` : 'All systems nominal'}
              </div>
            </div>
          </div>

          {/* Object list */}
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Near-Earth Objects</h2>
            <span className={styles.sectionMeta}>{filtered.length} results</span>
          </div>

          {loading && asteroids.length === 0 ? (
            <div className={styles.emptyState}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, opacity: 0.3 }}>radar</span>
              <p>Scanning NASA NeoWs feed…</p>
            </div>
          ) : error && asteroids.length === 0 ? (
            <div className={styles.emptyState}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, opacity: 0.3 }}>signal_disconnected</span>
              <p>Could not load asteroid data. Backend may be offline.</p>
            </div>
          ) : (
            <div className={styles.neoTable}>
              <div className={styles.neoHead}>
                <span>Name</span>
                <span>Miss Distance</span>
                <span>Velocity</span>
                <span>Diameter</span>
                <span>Approach</span>
                <span>Risk</span>
              </div>
              {filtered.map(a => {
                const level = hazardLevel(a)
                return (
                  <div
                    key={a.id}
                    className={`${styles.neoRow} ${a.pha ? styles.neoRowPha : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => { setSelectedAsteroid(a); setView('solarmap') }}
                  >
                    <span className={styles.neoName}>
                      {a.pha && <span className={styles.phaDot} title="Potentially Hazardous" />}
                      {a.name?.replace(/^\(?\d+\)?\s*/, '') ?? a.id}
                    </span>
                    <span className={styles.neoVal}>{fmtMiss(a.miss_km)}</span>
                    <span className={styles.neoVal}>{fmt(a.vel_kps, 2)} km/s</span>
                    <span className={styles.neoVal}>
                      {fmt(a.diam_min, 3)}–{fmt(a.diam_max, 3)} km
                    </span>
                    <span className={styles.neoMeta}>
                      {a.approach_date
                        ? new Date(a.approach_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </span>
                    <span className={`${styles.neoRisk} ${styles['risk' + level]}`}>{level}</span>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}