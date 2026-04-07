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

function fmtEta(minutes) {
  if (minutes == null) return null
  if (minutes < 1) return '< 1 min'
  if (minutes < 60) return `${Math.round(minutes)} min`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
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
  const [route,   setRoute]   = useState(null)
  const panelRef = useRef(null)
  const photoTriedReg = useRef(false)

  const cat = liveData?.cat || 'plane'
  const isFlight = cat === 'plane' || cat === 'helicopter'

  const routeRef = useRef(null)
  useEffect(() => { routeRef.current = route }, [route])

  const refreshLive = useCallback(() => {
    if (!icao24 || !isFlight) return
    fetch(`${API}/api/v1/aircraft/${icao24}`, { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(data => {
        setDetail(data)
        // Don't send raw trail here — let the enrichment effect handle it
      })
      .catch(() => {})
  }, [icao24, isFlight])

  useEffect(() => {
    if (!icao24) return
    setDetail(null)
    setPhoto(null)
    setRoute(null)
    setError(null)
    photoTriedReg.current = false

    if (isFlight) {
      setLoading(true)
      fetch(`${API}/api/v1/aircraft/${icao24}`, { credentials: 'include' })
        .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
        .then(data => {
          setDetail(data)
          // Trail sent via enrichment effect once route data arrives
        })
        .catch(e => setError(e.message))
        .finally(() => setLoading(false))

      // Fetch route (departure/arrival airports)
      fetch(`${API}/api/v1/aircraft/${icao24}/route`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setRoute(d) })
        .catch(() => {})

      // Fetch photo by hex code
      fetchPhotoFromUrl(`https://api.planespotters.net/pub/photos/hex/${icao24}`).then(setPhoto)

      const iv = setInterval(refreshLive, 15000)
      return () => clearInterval(iv)
    }
  }, [icao24]) // eslint-disable-line react-hooks/exhaustive-deps

  // Send trail to Globe — enriched with route endpoints when available
  useEffect(() => {
    if (!detail?.trail?.length) return
    const trail = detail.trail

    // No route yet — send raw trail so something shows immediately
    if (!route) {
      onTrailData?.(trail)
      return
    }

    // Enrich: extend trail from departure airport to arrival airport
    const enriched = [...trail]

    // Prepend departure airport
    if (route.dep_lat != null) {
      const firstPt = trail[0]
      const distToDep = haversineKm(firstPt.latitude, firstPt.longitude, route.dep_lat, route.dep_lon)
      if (distToDep > 20) {
        enriched.unshift({
          latitude: route.dep_lat,
          longitude: route.dep_lon,
          altitude: 0,
          timestamp: firstPt.timestamp,
        })
      }
    }

    // Append arrival airport
    if (route.arr_lat != null) {
      const lastPt = trail[trail.length - 1]
      const distToArr = haversineKm(lastPt.latitude, lastPt.longitude, route.arr_lat, route.arr_lon)
      if (distToArr > 20) {
        enriched.push({
          latitude: route.arr_lat,
          longitude: route.arr_lon,
          altitude: 0,
          timestamp: new Date().toISOString(),
        })
      }
    }

    onTrailData?.(enriched)
  }, [route, detail?.trail]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fit: when tracking starts and we have route or trail data, zoom to show full route
  const didAutoFit = useRef(false)
  useEffect(() => {
    if (!isTracking) { didAutoFit.current = false; return }
    if (didAutoFit.current) return
    // Wait until we have either route coords or trail data to fit
    const hasRoute = route?.dep_lat != null || route?.arr_lat != null
    const hasTrail = detail?.trail?.length > 1
    if (!hasRoute && !hasTrail) return
    didAutoFit.current = true
    // Small delay so drawTrail has time to process the enriched trail
    setTimeout(() => onFitRoute?.(route), 300)
  }, [isTracking, route, detail?.trail]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Route: from API (OpenFlights route DB or heading-based estimation)
  const depName = route?.departure_iata || route?.departure_name || 'DEP'
  const arrName = route?.arrival_iata || route?.arrival_name || 'ARR'
  const etaMin = route?.eta_min

  // Distance: route API dep→arr coords
  const distKm = (route?.dep_lat != null && route?.arr_lat != null)
    ? haversineKm(route.dep_lat, route.dep_lon, route.arr_lat, route.arr_lon)
    : (route?.dep_lat != null && displayLat != null) ? haversineKm(route.dep_lat, route.dep_lon, displayLat, displayLon)
    : null

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
            referrerPolicy="no-referrer"
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

      {/* ── Route card: DEP → ARR (from route API) ── */}
      {route && (
        <div className={styles.routeCard}>
          <div className={styles.routeCol}>
            <span className={styles.routeDot} style={{ background: '#22ff88' }} />
            <span className={styles.routeCode}>{depName}</span>
            {route.dep_lat != null && (
              <span className={styles.routeCoord}>
                {route.dep_lat.toFixed(2)}°, {route.dep_lon.toFixed(2)}°
              </span>
            )}
          </div>
          <div className={styles.routeCenter}>
            <div className={styles.routeArc} />
            {distKm != null && <span className={styles.routeDist}>{fmtDist(distKm)}</span>}
            {etaMin != null && <span className={styles.routeEta}>ETA {fmtEta(etaMin)}</span>}
          </div>
          <div className={styles.routeCol}>
            <span className={styles.routeDot} style={{ background: '#ff6622' }} />
            <span className={styles.routeCode}>{arrName}</span>
            {route.arr_lat != null && (
              <span className={styles.routeCoord}>
                {route.arr_lat.toFixed(2)}°, {route.arr_lon.toFixed(2)}°
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Position card: when no route data but we have position ── */}
      {!route && hasPosition && (
        <div className={styles.routeCard}>
          <div className={styles.routeCol}>
            <span className={styles.routeDot} style={{ background: '#ff6622' }} />
            <span className={styles.routeCode}>{nearestAirport(displayLat, displayLon)?.name ?? 'POS'}</span>
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
                // Trail + fit handled by the autoFit effect below
              }
            }}
          >
            {isTracking ? 'Stop Tracking' : 'Track Flight'}
          </button>
          {isTracking && (
            <button className={styles.fitBtn} onClick={() => onFitRoute?.(route)}>fit</button>
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
            {etaMin != null && <span>ETA {fmtEta(etaMin)}</span>}
          </div>
        </div>
      )}
    </aside>
  )
}
