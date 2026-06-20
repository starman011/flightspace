import { useState, useEffect } from 'react'
import styles from './GalaxyPanel.module.css'

const API = import.meta.env.VITE_API_URL || ''

// ── Cosmological computations (flat ΛCDM) ────────────────────────────────────

const C_KMS  = 299_792.458        // speed of light km/s
const H0     = 67.4               // Hubble constant km/s/Mpc
const OM     = 0.315              // matter density
const OL     = 0.685              // dark energy density
const MPC_LY = 3_261_600          // light-years per Mpc

// Comoving distance via numerical integration of 1/E(z)
function comovingDistMpc(z) {
  const n = 200, dz = z / n
  let sum = 0
  for (let i = 0; i < n; i++) {
    const zi = (i + 0.5) * dz
    sum += dz / Math.sqrt(OM * (1 + zi) ** 3 + OL)
  }
  return (C_KMS / H0) * sum
}

// Lookback time in Gyr
function lookbackGyr(z) {
  const tH = 977.8 / H0 // Hubble time in Gyr
  const n = 200, dz = z / n
  let sum = 0
  for (let i = 0; i < n; i++) {
    const zi = (i + 0.5) * dz
    sum += dz / ((1 + zi) * Math.sqrt(OM * (1 + zi) ** 3 + OL))
  }
  return tH * sum
}

// Recession velocity (relativistic)
function recessionVelocity(z) {
  return C_KMS * ((1 + z) ** 2 - 1) / ((1 + z) ** 2 + 1)
}

// Flux (nanomaggies) → AB magnitude
function fluxToMag(flux) {
  if (!flux || flux <= 0) return null
  return 22.5 - 2.5 * Math.log10(flux)
}

// Morphology codes → human labels
const MORPH_MAP = {
  PSF: 'Point Source',
  DEV: 'Elliptical (de Vaucouleurs)',
  EXP: 'Spiral (Exponential)',
  SER: 'Sérsic Profile',
  REX: 'Round Exponential',
}

// ── Formatters ───────────────────────────────────────────────────────────────

function fmtRA(deg) {
  const h = deg / 15
  const hh = Math.floor(h)
  const mm = Math.floor((h - hh) * 60)
  const ss = ((h - hh) * 60 - mm) * 60
  return `${hh}h ${mm}m ${ss.toFixed(1)}s`
}

function fmtDec(deg) {
  const sign = deg >= 0 ? '+' : '−'
  const abs = Math.abs(deg)
  const dd = Math.floor(abs)
  const mm = Math.floor((abs - dd) * 60)
  const ss = ((abs - dd) * 60 - mm) * 60
  return `${sign}${dd}° ${mm}′ ${ss.toFixed(0)}″`
}

function fmtBigNum(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' billion'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' million'
  return n.toLocaleString()
}

// ── Component ────────────────────────────────────────────────────────────────

export default function GalaxyPanel({ galaxy, onClose }) {
  const [detail, setDetail] = useState(null)
  const [enrich, setEnrich] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!galaxy?.targetid) return
    setDetail(null)
    setEnrich(null)
    setLoading(true)
    fetch(`${API}/api/v1/desi/galaxy/${galaxy.targetid}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setDetail(d))
      .catch(() => {})
      .finally(() => setLoading(false))
    // Enrichment: cross-match NED/SIMBAD for known names
    fetch(`${API}/api/v1/desi/enrich?ra=${galaxy.ra}&dec=${galaxy.dec}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.known_name) setEnrich(d) })
      .catch(() => {})
  }, [galaxy?.targetid, galaxy?.ra, galaxy?.dec])

  if (!galaxy) return null

  const z = galaxy.z
  const isQSO = galaxy.spectype === 'QSO'
  const distMpc = comovingDistMpc(z)
  const distLY = distMpc * MPC_LY
  const lookback = lookbackGyr(z)
  const vRec = recessionVelocity(z)
  const zPct = Math.min(z / 3.5, 1) * 100

  // Detail-derived values
  const magG = detail?.flux_g ? fluxToMag(detail.flux_g) : null
  const magR = detail?.flux_r ? fluxToMag(detail.flux_r) : null
  const magZ = detail?.flux_z ? fluxToMag(detail.flux_z) : null
  const magW1 = detail?.flux_w1 ? fluxToMag(detail.flux_w1) : null
  const magW2 = detail?.flux_w2 ? fluxToMag(detail.flux_w2) : null
  const morph = detail?.morphtype ? (MORPH_MAP[detail.morphtype] || detail.morphtype) : null
  const stellarMass = detail?.logmstar ? Math.pow(10, detail.logmstar) : null
  const shapeR = detail?.shape_r  // half-light radius in arcsec
  const ebv = detail?.ebv         // galactic dust reddening
  const halpha = detail?.halpha_flux
  const hbeta = detail?.hbeta_flux
  const oiii = detail?.oiii_flux

  return (
    <div className={styles.panel} onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <span className={`${styles.symbol} ${isQSO ? styles.symbolQso : ''}`}>{isQSO ? '◈' : '⊛'}</span>
        <div className={styles.titles}>
          <h3 className={styles.name}>
            {enrich?.known_name || `DESI ${isQSO ? 'Quasar' : 'Galaxy'}`}
          </h3>
          <span className={`${styles.typeBadge} ${isQSO ? styles.qso : styles.galaxy}`}>
            {isQSO ? 'QSO — Active Galactic Nucleus' : 'Galaxy'}
            {detail?.subtype ? ` · ${detail.subtype}` : ''}
            {enrich?.source ? ` · ${enrich.source}` : ''}
          </span>
        </div>
        <button className={styles.close} onClick={onClose}>✕</button>
      </div>

      {/* ── Telescope image (Legacy Survey cutout) ─────────────────────── */}
      <div className={styles.imageWrap}>
        <img
          className={styles.image}
          src={`https://www.legacysurvey.org/viewer/cutout.jpg?ra=${galaxy.ra}&dec=${galaxy.dec}&size=256&layer=ls-dr10&pixscale=0.25`}
          alt={`Sky cutout at RA ${galaxy.ra.toFixed(2)}, Dec ${galaxy.dec.toFixed(2)}`}
          loading="eager"
        />
        <div className={styles.imageLabel}>Legacy Survey DR10 — {galaxy.ra.toFixed(2)}°, {galaxy.dec.toFixed(2)}°</div>
      </div>

      {/* ── Redshift bar ───────────────────────────────────────────────── */}
      <div>
        <div className={styles.sectionTitle}>Redshift Position</div>
        <div className={styles.zBar}>
          <div className={styles.zMarker} style={{ left: `${zPct}%` }} />
        </div>
      </div>

      {/* ── Core stats ─────────────────────────────────────────────────── */}
      <div className={styles.stats}>
        <div className={styles.statRow}>
          <span className={styles.statLabel}>Redshift (z)</span>
          <span className={`${styles.statValue} ${styles.statHighlight}`}>
            {z.toFixed(6)}
          </span>
        </div>
        <div className={styles.statRow}>
          <span className={styles.statLabel}>Distance</span>
          <span className={styles.statValue}>
            {fmtBigNum(Math.round(distLY))} ly
          </span>
        </div>
        <div className={styles.statRow}>
          <span className={styles.statLabel}>Lookback Time</span>
          <span className={styles.statValue}>
            {lookback.toFixed(2)} Gyr ago
          </span>
        </div>
        <div className={styles.statRow}>
          <span className={styles.statLabel}>Recession Velocity</span>
          <span className={styles.statValue}>
            {Math.round(vRec).toLocaleString()} km/s
          </span>
        </div>
        <div className={styles.statRow}>
          <span className={styles.statLabel}>Right Ascension</span>
          <span className={styles.statValue}>{fmtRA(galaxy.ra)}</span>
        </div>
        <div className={styles.statRow}>
          <span className={styles.statLabel}>Declination</span>
          <span className={styles.statValue}>{fmtDec(galaxy.dec)}</span>
        </div>
        <div className={styles.statRow}>
          <span className={styles.statLabel}>DESI Target ID</span>
          <span className={styles.statValue}>{galaxy.targetid}</span>
        </div>
      </div>

      {/* ── Detail section (loaded async) ──────────────────────────────── */}
      {loading && <div className={styles.loading}>Fetching spectral data…</div>}

      {detail && (
        <>
          {/* Photometry */}
          {(magG || magR || magZ) && (
            <div>
              <div className={styles.sectionTitle}>Apparent Magnitude</div>
              <div className={styles.stats}>
                {magG && (
                  <div className={styles.statRow}>
                    <span className={styles.statLabel}>g-band (blue)</span>
                    <span className={styles.statValue}>{magG.toFixed(2)}</span>
                  </div>
                )}
                {magR && (
                  <div className={styles.statRow}>
                    <span className={styles.statLabel}>r-band (red)</span>
                    <span className={styles.statValue}>{magR.toFixed(2)}</span>
                  </div>
                )}
                {magZ && (
                  <div className={styles.statRow}>
                    <span className={styles.statLabel}>z-band (near-IR)</span>
                    <span className={styles.statValue}>{magZ.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Physical properties */}
          <div>
            <div className={styles.sectionTitle}>Physical Properties</div>
            <div className={styles.stats}>
              {morph && (
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Morphology</span>
                  <span className={styles.statValue}>{morph}</span>
                </div>
              )}
              {stellarMass && (
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Stellar Mass</span>
                  <span className={styles.statValue}>
                    {fmtBigNum(Math.round(stellarMass))} M☉
                  </span>
                </div>
              )}
              {shapeR != null && shapeR > 0 && (
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Half-light Radius</span>
                  <span className={styles.statValue}>{shapeR.toFixed(2)}″</span>
                </div>
              )}
              {ebv != null && (
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Galactic Dust (E(B-V))</span>
                  <span className={styles.statValue}>{ebv.toFixed(4)} mag</span>
                </div>
              )}
              {detail.zerr != null && (
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Redshift Error</span>
                  <span className={styles.statValue}>±{detail.zerr.toFixed(6)}</span>
                </div>
              )}
              {detail.deltachi2 != null && (
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Redshift Confidence (Δχ²)</span>
                  <span className={styles.statValue}>{detail.deltachi2.toFixed(1)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Infrared photometry */}
          {(magW1 || magW2) && (
            <div>
              <div className={styles.sectionTitle}>Infrared (WISE)</div>
              <div className={styles.stats}>
                {magW1 && (
                  <div className={styles.statRow}>
                    <span className={styles.statLabel}>W1 (3.4 μm)</span>
                    <span className={styles.statValue}>{magW1.toFixed(2)} mag</span>
                  </div>
                )}
                {magW2 && (
                  <div className={styles.statRow}>
                    <span className={styles.statLabel}>W2 (4.6 μm)</span>
                    <span className={styles.statValue}>{magW2.toFixed(2)} mag</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Emission lines */}
          {(halpha || hbeta || oiii) && (
            <div>
              <div className={styles.sectionTitle}>Emission Lines</div>
              <div className={styles.stats}>
                {halpha && (
                  <div className={styles.statRow}>
                    <span className={styles.statLabel}>Hα (6563 Å)</span>
                    <span className={styles.statValue}>{halpha.toExponential(2)} erg/s/cm²</span>
                  </div>
                )}
                {hbeta && (
                  <div className={styles.statRow}>
                    <span className={styles.statLabel}>Hβ (4861 Å)</span>
                    <span className={styles.statValue}>{hbeta.toExponential(2)} erg/s/cm²</span>
                  </div>
                )}
                {oiii && (
                  <div className={styles.statRow}>
                    <span className={styles.statLabel}>[OIII] (5007 Å)</span>
                    <span className={styles.statValue}>{oiii.toExponential(2)} erg/s/cm²</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Survey metadata */}
          {detail.survey && (
            <div>
              <div className={styles.sectionTitle}>Observation</div>
              <div className={styles.stats}>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Survey</span>
                  <span className={styles.statValue}>{detail.survey.toUpperCase()}</span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Program</span>
                  <span className={styles.statValue}>{detail.program?.toUpperCase()}</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Understanding the data ──────────────────────────────────────── */}
      <div>
        <div className={styles.sectionTitle}>Understanding This Object</div>
        <p className={styles.description}>
          {isQSO
            ? `This quasar is a supermassive black hole — possibly billions of times the mass of our Sun — actively devouring matter. The infalling material heats to millions of degrees, producing a beacon of light visible across the observable universe. The light you see left this object ${lookback.toFixed(1)} billion years ago, when the universe was ${(13.8 - lookback).toFixed(1)} billion years old.`
            : `This is a gravitationally bound system of billions of stars, gas clouds, dust, and dark matter — a galaxy. The light from it left ${lookback.toFixed(1)} billion years ago, when the universe was just ${(13.8 - lookback).toFixed(1)} billion years old. Since then, the expanding universe has carried it ${(distMpc * 3.2616 / 1000).toFixed(1)} billion light-years away from us.`
          }
        </p>
      </div>

      <div>
        <div className={styles.sectionTitle}>What the Numbers Mean</div>
        <div className={styles.explainer}>
          <strong>Redshift (z = {z.toFixed(4)})</strong> — Space itself has
          expanded, stretching this object's light by {((1 + z) * 100 - 100).toFixed(1)}%.
          Higher z means farther away and further back in time.
        </div>
        <div className={styles.explainer}>
          <strong>Recession velocity ({Math.round(vRec).toLocaleString()} km/s)</strong> — This
          object is moving away from us at {Math.round(vRec / C_KMS * 100)}% the
          speed of light, carried by the expansion of space.
        </div>
        <div className={styles.explainer}>
          <strong>Lookback time ({lookback.toFixed(2)} Gyr)</strong> — Light
          travels at 300,000 km/s, but this photon has been traveling
          for {lookback.toFixed(1)} billion years to reach your screen right now.
        </div>
        {morph && (
          <div className={styles.explainer}>
            <strong>Morphology ({morph})</strong> —
            {detail?.morphtype === 'EXP'
              ? ' A disk galaxy with spiral arms, similar in structure to our own Milky Way.'
              : detail?.morphtype === 'DEV'
              ? ' An elliptical galaxy — a smooth, rounded collection of old stars with little gas or dust.'
              : detail?.morphtype === 'PSF'
              ? ' Appears as a point source — either extremely distant or dominated by a bright central nucleus.'
              : detail?.morphtype === 'SER'
              ? ' A complex profile between spiral and elliptical — possibly a merger remnant.'
              : ' Shape classification from the Legacy Survey imaging.'}
          </div>
        )}
        {stellarMass && (
          <div className={styles.explainer}>
            <strong>Stellar mass ({fmtBigNum(Math.round(stellarMass))} M☉)</strong> — The
            total mass of all stars in this {isQSO ? 'host' : ''} galaxy, measured
            in solar masses. {stellarMass > 1e11
              ? 'This is a massive galaxy, larger than the Milky Way.'
              : stellarMass > 1e10
              ? 'Comparable in mass to the Milky Way.'
              : 'A smaller galaxy — dwarf or low-mass system.'}
          </div>
        )}
      </div>

      {/* ── Cross-identifications ────────────────────────────────────── */}
      {enrich && (
        <div>
          <div className={styles.sectionTitle}>Cross-Identifications</div>
          <div className={styles.stats}>
            <div className={styles.statRow}>
              <span className={styles.statLabel}>Catalog Name</span>
              <span className={styles.statValue}>{enrich.known_name}</span>
            </div>
            {enrich.object_type && (
              <div className={styles.statRow}>
                <span className={styles.statLabel}>NED Type</span>
                <span className={styles.statValue}>{enrich.object_type}</span>
              </div>
            )}
            {enrich.ned_redshift && (
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Catalog z</span>
                <span className={styles.statValue}>{enrich.ned_redshift}</span>
              </div>
            )}
            {enrich.other_names?.length > 0 && (
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Also Known As</span>
                <span className={styles.statValue}>{enrich.other_names.join(', ')}</span>
              </div>
            )}
            <div className={styles.statRow}>
              <span className={styles.statLabel}>Source</span>
              <span className={styles.statValue}>{enrich.source}</span>
            </div>
          </div>
        </div>
      )}

      <p className={styles.description} style={{ fontSize: 10, opacity: 0.4 }}>
        Data: DESI DR1 — NOIRLab Astro Data Lab · Images: Legacy Survey DR10
        {enrich?.source ? ` · Cross-IDs: ${enrich.source}` : ''}
      </p>
    </div>
  )
}
