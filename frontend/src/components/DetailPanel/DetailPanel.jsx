import { useEffect, useState, useCallback, useRef } from 'react'
import styles from './DetailPanel.module.css'
import { formatAltitude, formatSpeed, formatHeading, formatCallsign } from '../../utils/formatters'

async function fetchPhoto(icao24) {
  try {
    const res = await fetch(`https://api.planespotters.net/pub/photos/hex/${icao24}`, {
      credentials: 'omit',
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data.photos?.length > 0) {
      const p = data.photos[0]
      return {
        url:          p.thumbnail_large?.src ?? p.thumbnail?.src,
        link:         p.link,
        photographer: p.photographer,
      }
    }
  } catch { /* ignore */ }
  return null
}

function formatAge(timestamp) {
  if (!timestamp) return null
  const secs = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000)
  if (secs < 10) return 'just now'
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}

export default function DetailPanel({ icao24, onClose, onTrailData, isTracking, onTrack }) {
  const [detail, setDetail]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [photo,   setPhoto]   = useState(null)
  const panelRef = useRef(null)

  // Live-data refresh helper (called on interval)
  const refreshLive = useCallback(() => {
    if (!icao24) return
    fetch(`/api/v1/aircraft/${icao24}`, { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(data => {
        setDetail(data)
        if (data.trail?.length) onTrailData?.(data.trail)
      })
      .catch(() => {/* keep last-known data on refresh error */})
  }, [icao24, onTrailData])

  // Initial load
  useEffect(() => {
    if (!icao24) return
    setLoading(true)
    setError(null)
    setDetail(null)
    setPhoto(null)

    fetch(`/api/v1/aircraft/${icao24}`, { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(data => {
        setDetail(data)
        if (data.trail?.length) onTrailData?.(data.trail)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))

    // Aircraft photo from planespotters.net
    fetchPhoto(icao24).then(setPhoto)

    // Refresh live position every 15 s
    const iv = setInterval(refreshLive, 15000)
    return () => clearInterval(iv)
  }, [icao24]) // eslint-disable-line react-hooks/exhaustive-deps

  // Escape key → close
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Click outside panel → close (non-blocking: doesn't intercept canvas events)
  useEffect(() => {
    const handler = e => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose?.()
    }
    // Small delay so the opening click doesn't immediately trigger a close
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 120)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler) }
  }, [onClose])

  if (!icao24) return null

  const vr   = detail?.current?.vertical_rate
  const vrDir = vr == null ? null : vr > 100 ? 'up' : vr < -100 ? 'down' : null

  return (
    <aside ref={panelRef} className={styles.panel}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.callsign}>
            {detail?.callsign ? formatCallsign(detail.callsign) : icao24.toUpperCase()}
          </span>
          {detail?.type_code && (
            <span className={styles.typeCode}>{detail.type_code}</span>
          )}
        </div>
        <div className={styles.headerRight}>
          <button
            className={`${styles.trackBtn} ${isTracking ? styles.tracking : ''}`}
            onClick={() => onTrack?.(isTracking ? null : icao24)}
            title={isTracking ? 'stop tracking' : 'track live'}
          >
            {isTracking ? '⊙ tracking' : '◎ track'}
          </button>
          <button className={styles.close} onClick={onClose} aria-label="close">×</button>
        </div>
      </header>

      {loading && <p className={styles.state}>loading...</p>}
      {error   && <p className={styles.state}>error {error}</p>}

      {/* ── Aircraft photo ── */}
      {photo?.url && (
        <a
          href={photo.link}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.photoWrap}
        >
          <img src={photo.url} className={styles.photo} alt="aircraft" loading="lazy" />
          {photo.photographer && (
            <span className={styles.photoCredit}>{photo.photographer}</span>
          )}
        </a>
      )}

      {detail && (
        <div className={styles.body}>
          {/* ── Identity ── */}
          {detail.registration    && <Row label="reg"      value={detail.registration} />}
          {detail.type_description && <Row label="type"     value={detail.type_description} />}
          {detail.operator         && <Row label="operator" value={detail.operator} />}

          {/* ── Live position ── */}
          {detail.current && (
            <>
              <Divider />
              {detail.current.altitude     != null && (
                <Row label="altitude"  value={formatAltitude(detail.current.altitude)} />
              )}
              {detail.current.velocity     != null && (
                <Row label="speed"     value={formatSpeed(detail.current.velocity)} />
              )}
              {detail.current.heading      != null && (
                <Row label="heading"   value={formatHeading(detail.current.heading)} />
              )}
              {vr != null && (
                <Row
                  label="vert rate"
                  value={`${vr > 0 ? '+' : ''}${Math.round(vr)} fpm`}
                  accent={vrDir}
                />
              )}
              <Row label="on ground" value={detail.current.on_ground ? 'yes' : 'no'} />
              <Row label="updated"   value={formatAge(detail.current.timestamp)} />
            </>
          )}

          {/* ── Trail ── */}
          {detail.trail?.length > 0 && (
            <>
              <Divider />
              <Row label="trail" value={`${detail.trail.length} pts`} />
            </>
          )}
        </div>
      )}
    </aside>
  )
}

function Row({ label, value, accent }) {
  if (value == null) return null
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <span className={`${styles.value} ${accent ? styles[accent] : ''}`}>{value}</span>
    </div>
  )
}

function Divider() {
  return <div className={styles.divider} />
}
