import { useEffect, useState, useCallback, useRef } from 'react'
import styles from './DetailPanel.module.css'
import { formatAltitude, formatSpeed, formatHeading, formatCallsign } from '../../utils/formatters'

const API = import.meta.env.VITE_API_URL || ''

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

// Compute distance in km between two lat/lon points (haversine)
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Format distance
function fmtDist(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 100) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}

// Compute ETA string from distance and velocity (knots)
function computeETA(distKm, velocityKts) {
  if (!velocityKts || velocityKts < 10) return null
  const velKmh = velocityKts * 1.852
  const hours = distKm / velKmh
  if (hours < 0.0167) return '< 1 min'
  if (hours < 1) return `${Math.round(hours * 60)} min`
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export default function DetailPanel({ icao24, onClose, onTrailData, isTracking, onTrack, onFitRoute }) {
  const [detail, setDetail]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [photo,   setPhoto]   = useState(null)
  const panelRef = useRef(null)

  const refreshLive = useCallback(() => {
    if (!icao24) return
    fetch(`${API}/api/v1/aircraft/${icao24}`, { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(data => {
        setDetail(data)
        if (data.trail?.length) onTrailData?.(data.trail)
      })
      .catch(() => {})
  }, [icao24, onTrailData])

  useEffect(() => {
    if (!icao24) return
    setLoading(true)
    setError(null)
    setDetail(null)
    setPhoto(null)

    fetch(`${API}/api/v1/aircraft/${icao24}`, { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(data => {
        setDetail(data)
        if (data.trail?.length) onTrailData?.(data.trail)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))

    fetchPhoto(icao24).then(setPhoto)

    const iv = setInterval(refreshLive, 15000)
    return () => clearInterval(iv)
  }, [icao24]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    const handler = e => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        if (e.target?.tagName === 'CANVAS') return
        onClose?.()
      }
    }
    const t = setTimeout(() => document.addEventListener('pointerdown', handler), 200)
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', handler) }
  }, [onClose])

  if (!icao24) return null

  const cur = detail?.current
  const vr    = cur?.vertical_rate
  const vrDir = vr == null ? null : vr > 100 ? 'up' : vr < -100 ? 'down' : null

  // Route info from trail
  const trail = detail?.trail
  const dep = trail?.[0]
  const hasRoute = dep && cur
  const distKm = hasRoute ? haversineKm(dep.latitude, dep.longitude, cur.latitude, cur.longitude) : null
  const eta = distKm && cur?.velocity ? computeETA(distKm, cur.velocity) : null

  return (
    <aside ref={panelRef} className={styles.panel}>

      {/* ── Hero: photo + overlay ── */}
      <div className={styles.hero}>
        {photo?.url ? (
          <img src={photo.url} className={styles.heroImg} alt="aircraft" loading="lazy" />
        ) : (
          <div className={styles.heroPlaceholder} />
        )}
        <div className={styles.heroOverlay}>
          <button className={styles.closeBtn} onClick={onClose} aria-label="close">×</button>
          <div className={styles.heroInfo}>
            <span className={styles.callsign}>
              {detail?.callsign ? formatCallsign(detail.callsign) : icao24.toUpperCase()}
            </span>
            {detail?.type_code && <span className={styles.typeCode}>{detail.type_code}</span>}
          </div>
          {detail?.type_description && (
            <p className={styles.heroDesc}>{detail.type_description}</p>
          )}
          {detail?.operator && (
            <p className={styles.heroOp}>{detail.operator}</p>
          )}
        </div>
        {photo?.photographer && (
          <span className={styles.photoCredit}>{photo.photographer}</span>
        )}
      </div>

      {loading && <p className={styles.state}>loading…</p>}
      {error   && <p className={styles.state}>error {error}</p>}

      {/* ── Route card: DEP → NOW ── */}
      {hasRoute && (
        <div className={styles.routeCard}>
          <div className={styles.routeCol}>
            <span className={styles.routeDot} style={{ background: '#2088ff' }} />
            <span className={styles.routeCode}>DEP</span>
            <span className={styles.routeCoord}>
              {dep.latitude.toFixed(2)}°, {dep.longitude.toFixed(2)}°
            </span>
          </div>
          <div className={styles.routeCenter}>
            <div className={styles.routeArc} />
            {distKm != null && <span className={styles.routeDist}>{fmtDist(distKm)}</span>}
            {eta && <span className={styles.routeEta}>ETA {eta}</span>}
          </div>
          <div className={styles.routeCol}>
            <span className={styles.routeDot} style={{ background: '#00eeff' }} />
            <span className={styles.routeCode}>NOW</span>
            <span className={styles.routeCoord}>
              {cur.latitude.toFixed(2)}°, {cur.longitude.toFixed(2)}°
            </span>
          </div>
        </div>
      )}

      {/* ── Track button ── */}
      {detail && (
        <div className={styles.trackRow}>
          <button
            className={`${styles.trackBtn} ${isTracking ? styles.trackBtnActive : ''}`}
            onClick={() => {
              if (isTracking) {
                onTrack?.(null)
              } else {
                onTrack?.(icao24)
                if (trail?.length > 1) setTimeout(() => onFitRoute?.(), 250)
              }
            }}
          >
            {isTracking ? 'Stop Tracking' : 'Track Flight'}
          </button>
          {isTracking && trail?.length > 1 && (
            <button className={styles.fitBtn} onClick={() => onFitRoute?.()}>fit</button>
          )}
        </div>
      )}

      {/* ── Telemetry ── */}
      {cur && (
        <div className={styles.telemetry}>
          <div className={styles.telemGrid}>
            {cur.altitude != null && (
              <div className={styles.telemCell}>
                <span className={styles.telemLabel}>ALT</span>
                <span className={styles.telemVal}>{formatAltitude(cur.altitude)}</span>
              </div>
            )}
            {cur.velocity != null && (
              <div className={styles.telemCell}>
                <span className={styles.telemLabel}>SPD</span>
                <span className={styles.telemVal}>{formatSpeed(cur.velocity)}</span>
              </div>
            )}
            {cur.heading != null && (
              <div className={styles.telemCell}>
                <span className={styles.telemLabel}>HDG</span>
                <span className={styles.telemVal}>{formatHeading(cur.heading)}</span>
              </div>
            )}
            {vr != null && (
              <div className={styles.telemCell}>
                <span className={styles.telemLabel}>V/S</span>
                <span className={`${styles.telemVal} ${vrDir === 'up' ? styles.up : vrDir === 'down' ? styles.down : ''}`}>
                  {vr > 0 ? '+' : ''}{Math.round(vr)}
                </span>
              </div>
            )}
          </div>
          <div className={styles.telemMeta}>
            {detail.registration && <span>{detail.registration}</span>}
            <span>{cur.on_ground ? 'ON GROUND' : 'AIRBORNE'}</span>
            <span>{formatAge(cur.timestamp)}</span>
          </div>
        </div>
      )}
    </aside>
  )
}
