import { useEffect, useState, useCallback, useRef } from 'react'
import styles from './DetailPanel.module.css'
import { formatAltitude, formatSpeed, formatHeading, formatCallsign } from '../../utils/formatters'
import { PLACES } from '../Globe/placeData'

const API = import.meta.env.VITE_API_URL || ''

/* ── Airport lookup table (built once) ─────────────────────────────────────── */
const AIRPORTS = PLACES.filter(p => p.type === 'airport')

function nearestAirport(lat, lon) {
  let best = null, bestD = Infinity
  for (const a of AIRPORTS) {
    const d = haversineKm(lat, lon, a.lat, a.lon)
    if (d < bestD) { bestD = d; best = a }
  }
  return bestD < 150 ? best : null   // only match within 150 km
}

/* ── Photo fetch ───────────────────────────────────────────────────────────── */
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

/* ── Helpers ───────────────────────────────────────────────────────────────── */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function fmtDist(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 100) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}

function fmtDuration(startTimestamp) {
  if (!startTimestamp) return null
  const ms = Date.now() - new Date(startTimestamp).getTime()
  if (ms < 0) return null
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return '< 1 min'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatAge(timestamp) {
  if (!timestamp) return null
  const secs = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000)
  if (secs < 10) return 'just now'
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}

function categoryLabel(cat) {
  if (cat === 'satellite') return 'Satellite Details'
  if (cat === 'ship') return 'Vessel Details'
  if (cat === 'helicopter') return 'Helicopter Details'
  return 'Flight Details'
}

export default function DetailPanel({ icao24, liveData, onClose, onTrailData, isTracking, onTrack, onFitRoute }) {
  const [detail, setDetail]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [photo,   setPhoto]   = useState(null)
  const panelRef = useRef(null)

  const cat = liveData?.cat || 'plane'
  const isFlight = cat === 'plane' || cat === 'helicopter'

  const refreshLive = useCallback(() => {
    if (!icao24 || !isFlight) return
    fetch(`${API}/api/v1/aircraft/${icao24}`, { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(data => {
        setDetail(data)
        if (data.trail?.length) onTrailData?.(data.trail)
      })
      .catch(() => {})
  }, [icao24, isFlight, onTrailData])

  useEffect(() => {
    if (!icao24) return
    setDetail(null)
    setPhoto(null)
    setError(null)

    // Only fetch aircraft detail API for flights/helicopters
    if (isFlight) {
      setLoading(true)
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
    }
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

  /* ── Derive display data from API detail (flights) or liveData (satellites/ships) ── */
  const cur = detail?.current
  const trail = detail?.trail

  // For flights: use API data. For satellites/ships: use liveData directly
  const displayLat = cur?.latitude ?? liveData?.lat
  const displayLon = cur?.longitude ?? liveData?.lon
  const displayAlt = cur?.altitude ?? liveData?.alt
  const displayVel = cur?.velocity ?? liveData?.vel
  const displayHdg = cur?.heading ?? liveData?.hdg
  const displayVR  = cur?.vertical_rate ?? liveData?.vr
  const displayGrnd = cur?.on_ground ?? liveData?.grnd ?? false
  const displayTs  = cur?.timestamp ?? (liveData?.ts ? new Date(liveData.ts * 1000).toISOString() : null)

  const vr    = displayVR
  const vrDir = vr == null ? null : vr > 100 ? 'up' : vr < -100 ? 'down' : null

  // Title / identity
  const displayName = detail?.callsign
    ? formatCallsign(detail.callsign)
    : liveData?.cs
      ? formatCallsign(liveData.cs)
      : liveData?.name
        ? liveData.name
        : icao24.toUpperCase()

  const typeCode = detail?.type_code ?? liveData?.t
  const typeDesc = detail?.type_description
  const operator = detail?.operator

  // Route: departure airport + distance + duration
  const dep = trail?.[0]
  const hasRoute = dep && displayLat != null
  const depAirport = dep ? nearestAirport(dep.latitude, dep.longitude) : null
  const nowAirport = displayLat != null ? nearestAirport(displayLat, displayLon) : null
  const distKm = hasRoute ? haversineKm(dep.latitude, dep.longitude, displayLat, displayLon) : null
  const flightDuration = dep?.timestamp ? fmtDuration(dep.timestamp) : null

  // Satellite-specific
  const altKm = liveData?.alt_km

  return (
    <aside ref={panelRef} className={styles.panel}>

      {/* ── Hero: photo + overlay ── */}
      <div className={styles.hero}>
        {photo?.url ? (
          <img src={photo.url} className={styles.heroImg} alt="aircraft" loading="lazy" />
        ) : (
          <div className={styles.heroPlaceholder}>
            <span className={styles.heroIcon}>
              {cat === 'satellite' ? '🛰' : cat === 'ship' ? '🚢' : cat === 'helicopter' ? '🚁' : '✈'}
            </span>
          </div>
        )}
        <div className={styles.heroOverlay}>
          <button className={styles.closeBtn} onClick={onClose} aria-label="close">×</button>
          <span className={styles.panelTitle}>{categoryLabel(cat)}</span>
          <div className={styles.heroInfo}>
            <span className={styles.callsign}>{displayName}</span>
            {typeCode && <span className={styles.typeCode}>{typeCode}</span>}
          </div>
          {typeDesc && <p className={styles.heroDesc}>{typeDesc}</p>}
          {operator && <p className={styles.heroOp}>{operator}</p>}
        </div>
        {photo?.photographer && (
          <span className={styles.photoCredit}>{photo.photographer}</span>
        )}
      </div>

      {loading && <p className={styles.state}>loading…</p>}
      {error && isFlight && <p className={styles.state}>error {error}</p>}

      {/* ── Route card: ORIGIN → NOW (flights only) ── */}
      {hasRoute && (
        <div className={styles.routeCard}>
          <div className={styles.routeCol}>
            <span className={styles.routeDot} style={{ background: '#2088ff' }} />
            <span className={styles.routeCode}>{depAirport?.name ?? 'DEP'}</span>
            <span className={styles.routeCoord}>
              {dep.latitude.toFixed(2)}°, {dep.longitude.toFixed(2)}°
            </span>
          </div>
          <div className={styles.routeCenter}>
            <div className={styles.routeArc} />
            {distKm != null && <span className={styles.routeDist}>{fmtDist(distKm)}</span>}
            {flightDuration && <span className={styles.routeEta}>{flightDuration}</span>}
          </div>
          <div className={styles.routeCol}>
            <span className={styles.routeDot} style={{ background: '#00eeff' }} />
            <span className={styles.routeCode}>{nowAirport?.name ?? 'NOW'}</span>
            <span className={styles.routeCoord}>
              {displayLat.toFixed(2)}°, {displayLon.toFixed(2)}°
            </span>
          </div>
        </div>
      )}

      {/* ── Satellite / Ship info card (no API trail) ── */}
      {!isFlight && displayLat != null && (
        <div className={styles.routeCard}>
          <div className={styles.routeCol} style={{ flex: 'unset', width: '100%', alignItems: 'flex-start', paddingLeft: 4 }}>
            <span className={styles.routeCode}>POSITION</span>
            <span className={styles.routeCoord}>
              {displayLat.toFixed(4)}°, {displayLon.toFixed(4)}°
            </span>
            {altKm != null && (
              <span className={styles.routeCoord} style={{ color: 'rgba(255,255,255,0.5)' }}>
                Altitude: {Math.round(altKm)} km
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Track button (flights only) ── */}
      {isFlight && (detail || liveData) && (
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
      {(cur || !isFlight) && displayLat != null && (
        <div className={styles.telemetry}>
          <div className={styles.telemGrid}>
            {displayAlt != null && (
              <div className={styles.telemCell}>
                <span className={styles.telemLabel}>ALT</span>
                <span className={styles.telemVal}>{formatAltitude(displayAlt)}</span>
              </div>
            )}
            {altKm != null && !displayAlt && (
              <div className={styles.telemCell}>
                <span className={styles.telemLabel}>ORBIT</span>
                <span className={styles.telemVal}>{Math.round(altKm)} km</span>
              </div>
            )}
            {displayVel != null && (
              <div className={styles.telemCell}>
                <span className={styles.telemLabel}>SPD</span>
                <span className={styles.telemVal}>
                  {cat === 'satellite' ? `${displayVel.toFixed(1)} km/s` : formatSpeed(displayVel)}
                </span>
              </div>
            )}
            {displayHdg != null && (
              <div className={styles.telemCell}>
                <span className={styles.telemLabel}>HDG</span>
                <span className={styles.telemVal}>{formatHeading(displayHdg)}</span>
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
            {detail?.registration && <span>{detail.registration}</span>}
            {liveData?.ctry && <span>{liveData.ctry}</span>}
            <span>{displayGrnd ? 'ON GROUND' : cat === 'satellite' ? 'IN ORBIT' : cat === 'ship' ? 'AT SEA' : 'AIRBORNE'}</span>
            <span>{formatAge(displayTs)}</span>
          </div>
        </div>
      )}
    </aside>
  )
}
