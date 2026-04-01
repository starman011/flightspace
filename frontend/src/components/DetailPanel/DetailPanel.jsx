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

function TelemEntry({ label, value, accent, time }) {
  if (value == null) return null
  return (
    <div className={styles.telemEntry}>
      <div className={styles.telemEntryHeader}>
        <span className={styles.telemKey}>{label}</span>
        {time && <span className={styles.telemTime}>{time}</span>}
      </div>
      <div className={`${accent === 'up' ? styles.telemValueAccent : accent === 'down' ? styles.telemValueDown : ''}`}>
        <span className={styles.telemValue}>{value}</span>
      </div>
    </div>
  )
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
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose?.()
    }
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 120)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler) }
  }, [onClose])

  if (!icao24) return null

  const vr    = detail?.current?.vertical_rate
  const vrDir = vr == null ? null : vr > 100 ? 'up' : vr < -100 ? 'down' : null
  const now   = new Date().toISOString().slice(11, 19)

  return (
    <aside ref={panelRef} className={styles.panel}>

      {/* System status bar */}
      <div className={styles.topBar}>
        <span className={styles.nominalBadge}>SYSTEM: NOMINAL</span>
        <span className={styles.locLabel}>
          {detail?.current?.lat != null
            ? `${detail.current.lat.toFixed(4)}° N, ${detail.current.lon?.toFixed(4)}° W`
            : 'LOC: ---'}
        </span>
      </div>

      {/* Page header */}
      <div className={styles.pageHeader}>
        <p className={styles.pageTitle}>Data Explorer</p>
        <div className={styles.callsignRow}>
          <span className={styles.callsign}>
            {detail?.callsign ? formatCallsign(detail.callsign) : icao24.toUpperCase()}
          </span>
          {detail?.type_code && (
            <span className={styles.typeCode}>{detail.type_code}</span>
          )}
        </div>
        {detail?.type_description && (
          <p className={styles.pageDesc}>{detail.type_description}</p>
        )}
      </div>

      {/* Track + route + close controls */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          {detail?.operator && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-label-sm)', color: 'var(--on-surface-variant)' }}>
              {detail.operator}
            </span>
          )}
        </div>
        <div className={styles.headerRight}>
          {detail?.trail?.length > 1 && (
            <button
              className={styles.routeBtn}
              onClick={() => {
                if (!isTracking) onTrack?.(icao24)
                setTimeout(() => onFitRoute?.(), 200)
              }}
              title="Show route — zoom to fit departure and current position"
            >
              route
            </button>
          )}
          <button
            className={`${styles.trackBtn} ${isTracking ? styles.tracking : ''}`}
            onClick={() => onTrack?.(isTracking ? null : icao24)}
            title={isTracking ? 'stop tracking' : 'track live'}
          >
            {isTracking ? 'tracking' : 'track'}
          </button>
          <button className={styles.close} onClick={onClose} aria-label="close">×</button>
        </div>
      </div>

      {/* Route summary: departure → current position */}
      {detail?.trail?.length > 1 && detail?.current && (
        <div className={styles.routeCard}>
          <div className={styles.routeEndpoint}>
            <span className={styles.routeDot} style={{ background: '#2088ff' }} />
            <span className={styles.routeLabel}>DEP</span>
            <span className={styles.routeCoord}>
              {detail.trail[0].latitude.toFixed(2)}°, {detail.trail[0].longitude.toFixed(2)}°
            </span>
          </div>
          <div className={styles.routeLine} />
          <div className={styles.routeEndpoint}>
            <span className={styles.routeDot} style={{ background: '#00eeff' }} />
            <span className={styles.routeLabel}>NOW</span>
            <span className={styles.routeCoord}>
              {detail.current.latitude.toFixed(2)}°, {detail.current.longitude.toFixed(2)}°
            </span>
          </div>
        </div>
      )}

      {loading && <p className={styles.state}>loading telemetry…</p>}
      {error   && <p className={styles.state}>error {error}</p>}

      {/* Aircraft photo */}
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

      {/* Signal precision */}
      {detail?.current && (
        <div className={styles.precisionCard}>
          <div>
            <p className={styles.precisionLabel}>Signal Precision</p>
            <p className={styles.precisionSub}>PEAK DETECTION: ALPHA-7</p>
          </div>
          <span className={styles.precisionValue}>98.4%</span>
        </div>
      )}

      {/* Telemetry stream */}
      {detail && (
        <div className={styles.body}>
          <div className={styles.streamHead}>
            <span className={styles.streamHeadLabel}>Live Telemetry Stream</span>
            <span className={styles.streamLiveDot} />
          </div>

          <div className={styles.telemSection}>
            {/* Identity */}
            {detail.registration && (
              <TelemEntry label="REG" value={detail.registration} time={now} />
            )}
            {detail.operator && (
              <TelemEntry label="OPERATOR" value={detail.operator} time={now} />
            )}

            {/* Live telemetry */}
            {detail.current && (
              <>
                {detail.current.altitude != null && (
                  <TelemEntry label="ALTITUDE" value={formatAltitude(detail.current.altitude)} time={now} />
                )}
                {detail.current.velocity != null && (
                  <TelemEntry label="VELOCITY" value={formatSpeed(detail.current.velocity)} time={now} />
                )}
                {detail.current.heading != null && (
                  <TelemEntry label="HEADING" value={formatHeading(detail.current.heading)} time={now} />
                )}
                {vr != null && (
                  <TelemEntry
                    label="VERT RATE"
                    value={`${vr > 0 ? '+' : ''}${Math.round(vr)} fpm`}
                    accent={vrDir}
                    time={now}
                  />
                )}
                <TelemEntry
                  label="ON GROUND"
                  value={detail.current.on_ground ? 'YES' : 'NO'}
                  time={formatAge(detail.current.timestamp)}
                />
              </>
            )}

            {detail.trail?.length > 0 && (
              <TelemEntry label="TRAIL PTS" value={`${detail.trail.length}`} time={now} />
            )}
          </div>
        </div>
      )}
    </aside>
  )
}
