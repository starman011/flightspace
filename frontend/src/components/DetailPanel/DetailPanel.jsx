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
  return bestD < 150 ? best : null
}

/* ── Photo fetch — tries hex, then registration ────────────────────────────── */
async function fetchPhotoFromUrl(url) {
  try {
    const res = await fetch(url, { credentials: 'omit' })
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
  const photoTriedReg = useRef(false)

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
    photoTriedReg.current = false

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

      // Fetch photo by hex code
      fetchPhotoFromUrl(`https://api.planespotters.net/pub/photos/hex/${icao24}`).then(setPhoto)

      const iv = setInterval(refreshLive, 15000)
      return () => clearInterval(iv)
    }
  }, [icao24]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fallback: try registration-based photo if hex returned nothing
  useEffect(() => {
    if (photo || !detail?.registration || photoTriedReg.current) return
    photoTriedReg.current = true
    fetchPhotoFromUrl(
      `https://api.planespotters.net/pub/photos/reg/${detail.registration}`
    ).then(p => { if (p) setPhoto(p) })
  }, [photo, detail?.registration])

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

  /* ── Derive display data ─────────────────────────────────────────────────── */
  const cur = detail?.current
  const trail = detail?.trail

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

  const displayName = detail?.callsign
    ? formatCallsign(detail.callsign)
    : liveData?.cs
      ? formatCallsign(liveData.cs)
      : liveData?.name ?? icao24.toUpperCase()

  const typeCode = detail?.type_code ?? liveData?.t
  const typeDesc = detail?.type_description
  const operator = detail?.operator

  // Route: trail-based (DEP→NOW) or position-only
  const dep = trail?.length > 0 ? trail[0] : null
  const hasTrailRoute = dep && displayLat != null
  const depAirport = dep ? nearestAirport(dep.latitude, dep.longitude) : null
  const nowAirport = displayLat != null ? nearestAirport(displayLat, displayLon) : null
  const distKm = hasTrailRoute ? haversineKm(dep.latitude, dep.longitude, displayLat, displayLon) : null
  const flightDuration = dep?.timestamp ? fmtDuration(dep.timestamp) : null

  const altKm = liveData?.alt_km
  const hasPosition = displayLat != null

  return (
    <aside ref={panelRef} className={styles.panel}>

      {/* ── Hero: photo + overlay ── */}
      <div className={styles.hero}>
        {photo?.url ? (
          <img
            src={photo.url}
            className={styles.heroImg}
            alt="aircraft"
            loading="lazy"
            crossOrigin="anonymous"
            onError={() => setPhoto(null)}
          />
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

      {/* ── Route card: DEP → NOW (when trail exists) ── */}
      {hasTrailRoute && (
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

      {/* ── Position card: when no trail but we have position (always visible) ── */}
      {!hasTrailRoute && hasPosition && (
        <div className={styles.routeCard}>
          <div className={styles.routeCol}>
            <span className={styles.routeDot} style={{ background: '#00eeff' }} />
            <span className={styles.routeCode}>{nowAirport?.name ?? 'POS'}</span>
            <span className={styles.routeCoord}>
              {displayLat.toFixed(2)}°, {displayLon.toFixed(2)}°
            </span>
          </div>
          {altKm != null && (
            <div className={styles.routeCol}>
              <span className={styles.routeCode}>ORBIT</span>
              <span className={styles.routeCoord} style={{ color: 'rgba(255,255,255,0.5)' }}>
                {Math.round(altKm)} km
              </span>
            </div>
          )}
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
                if (trail?.length) onTrailData?.(trail)
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

      {/* ── Telemetry (always show when we have position data) ── */}
      {hasPosition && (
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
