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
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!galaxy?.targetid) return
    setDetail(null)
    setLoading(true)
    fetch(`${API}/api/v1/desi/galaxy/${galaxy.targetid}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setDetail(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [galaxy?.targetid])

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
  const morph = detail?.morphtype ? (MORPH_MAP[detail.morphtype] || detail.morphtype) : null
  const stellarMass = detail?.logmstar ? Math.pow(10, detail.logmstar) : null

  return (
    <div className={styles.panel}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <span className={styles.symbol}>{isQSO ? '◈' : '⊛'}</span>
        <div className={styles.titles}>
          <h3 className={styles.name}>
            DESI {isQSO ? 'Quasar' : 'Galaxy'}
          </h3>
          <span className={`${styles.typeBadge} ${isQSO ? styles.qso : styles.galaxy}`}>
            {isQSO ? 'QSO — Active Galactic Nucleus' : 'Galaxy'}
            {detail?.subtype ? ` · ${detail.subtype}` : ''}
          </span>
        </div>
        <button className={styles.close} onClick={onClose}>✕</button>
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
          {(morph || stellarMass) && (
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
                {detail.survey && (
                  <div className={styles.statRow}>
                    <span className={styles.statLabel}>Survey</span>
                    <span className={styles.statValue}>
                      {detail.survey.toUpperCase()} / {detail.program}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Context blurb ──────────────────────────────────────────────── */}
      <p className={styles.description}>
        {isQSO
          ? `This quasar — a supermassive black hole actively consuming matter — emitted the light you see ${lookback.toFixed(1)} billion years ago. It is receding from us at ${Math.round(vRec / C_KMS * 100)}% the speed of light.`
          : `Light from this galaxy left ${lookback.toFixed(1)} billion years ago, when the universe was ${(13.8 - lookback).toFixed(1)} billion years old. It is one of ${galaxy.spectype === 'GALAXY' ? '14.7 million' : '1.7 million'} objects cataloged by the DESI instrument.`
        }
      </p>
      <p className={styles.description} style={{ fontSize: 10, opacity: 0.4 }}>
        Data: DESI DR1 — NOIRLab Astro Data Lab
      </p>
    </div>
  )
}
