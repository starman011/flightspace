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

const IS_MOBILE = typeof window !== 'undefined' && window.innerWidth < 768

export default function DetailPanel({ icao24, liveData, onClose, onTrailData, isTracking, onTrack, onFitRoute, isSaved, onToggleSave }) {
  const [detail, setDetail]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [photo,   setPhoto]   = useState(null)
  const [route,   setRoute]   = useState(null)
  // Mobile sheet: 'peek' (default ~38dvh) or 'mini' (collapsed strip ~80px)
  const [sheet, setSheet]     = useState('peek')
  const panelRef = useRef(null)
  const photoTriedReg = useRef(false)

  const cat = liveData?.cat || 'plane'
  const isFlight = cat === 'plane' || cat === 'helicopter'

  const routeRef = useRef(null)
  useEffect(() => { routeRef.current = route }, [route])

  const mountedRef = useRef(true)
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  // Reset sheet to peek when a new flight is selected
  useEffect(() => { setSheet('peek') }, [icao24])

  /* ── Swipe gesture for mobile sheet ──────────────────────────────────────── */
  const touchStartY = useRef(null)
  const touchStartSheet = useRef(null)
  const handleTouchStart = useCallback((e) => {
    touchStartY.current = e.touches[0].clientY
    touchStartSheet.current = sheet
  }, [sheet])
  const handleTouchEnd = useCallback((e) => {
    if (touchStartY.current == null) return
    const dy = e.changedTouches[0].clientY - touchStartY.current
    const threshold = 50
    if (dy > threshold) {
      // Swipe down → collapse
      if (touchStartSheet.current === 'peek') setSheet('mini')
    } else if (dy < -threshold) {
      // Swipe up → expand
      if (touchStartSheet.current === 'mini') setSheet('peek')
    }
    touchStartY.current = null
  }, [])

  const refreshLive = useCallback(() => {
    if (!icao24 || !isFlight) return
    fetch(`${API}/api/v1/aircraft/${icao24}`, { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(data => { if (mountedRef.current) setDetail(data) })
      .catch(() => {})
  }, [icao24, isFlight])

  useEffect(() => {
    if (!icao24) return
    setDetail(null)
    setPhoto(null)
    setRoute(null)
    setError(null)
    photoTriedReg.current = false
    let cancelled = false

    if (isFlight) {
      setLoading(true)
      fetch(`${API}/api/v1/aircraft/${icao24}`, { credentials: 'include' })
        .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
        .then(data => { if (!cancelled) setDetail(data) })
        .catch(e => { if (!cancelled) setError(e.message) })
        .finally(() => { if (!cancelled) setLoading(false) })

      fetch(`${API}/api/v1/aircraft/${icao24}/route`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d && !cancelled) setRoute(d) })
        .catch(() => {})

      fetchPhotoFromUrl(`https://api.planespotters.net/pub/photos/hex/${icao24}`)
        .then(p => { if (!cancelled) setPhoto(p) })

      const iv = setInterval(refreshLive, 15000)
      return () => { cancelled = true; clearInterval(iv) }
    }
  }, [icao24]) // eslint-disable-line react-hooks/exhaustive-deps

  // Send trail + route + live position to Globe
  useEffect(() => {
    if (!detail) return
    const hasTrail = detail.trail?.length > 0
    const hasRoute = route?.dep_lat != null || route?.arr_lat != null
    const hasLive = liveData?.lat != null
    if (!hasTrail && !hasRoute && !hasLive) return
    const trail = [...(detail.trail || [])]
    if (hasLive) {
      trail.push({ latitude: liveData.lat, longitude: liveData.lon, altitude: liveData.alt_baro ?? 0 })
    }
    onTrailData?.(trail, route)
  }, [route, detail, liveData?.lat, liveData?.lon]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fit: when tracking starts, zoom to show full route
  const didAutoFit = useRef(false)
  useEffect(() => {
    if (!isTracking) { didAutoFit.current = false; return }
    const hasRouteCoords = route?.dep_lat != null && route?.arr_lat != null
    const hasTrail = detail?.trail?.length > 1
    if (didAutoFit.current === 'route') return
    if (didAutoFit.current === 'trail' && !hasRouteCoords) return
    if (!hasRouteCoords && !hasTrail) return
    didAutoFit.current = hasRouteCoords ? 'route' : 'trail'
    const t = setTimeout(() => onFitRoute?.(route), 350)
    return () => clearTimeout(t)
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

  const depIata = route?.departure_iata || '---'
  const arrIata = route?.arrival_iata || '---'
  const etaMin = route?.eta_min

  const distKm = (route?.dep_lat != null && route?.arr_lat != null)
    ? haversineKm(route.dep_lat, route.dep_lon, route.arr_lat, route.arr_lon)
    : (route?.dep_lat != null && displayLat != null) ? haversineKm(route.dep_lat, route.dep_lon, displayLat, displayLon)
    : null

  const altKm = liveData?.alt_km
  const hasPosition = displayLat != null
  const statusLabel = displayGrnd ? 'ON GROUND' : cat === 'satellite' ? 'IN ORBIT' : cat === 'ship' ? 'AT SEA' : 'AIRBORNE'

  const isMini = sheet === 'mini'
  const panelCls = `${styles.panel} ${isMini ? styles.panelMini : ''}`

  return (
    <aside ref={panelRef} className={panelCls}>
      {/* ── Mobile drag handle + swipe zone ── */}
      <div
        className={styles.dragZone}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className={styles.dragHandle} />
      </div>

      {/* ── Close button (always visible) ── */}
      <button className={styles.closeBtn} onClick={onClose} aria-label="close">×</button>

      {/* ── Mini collapsed strip (mobile only) ── */}
      {isMini && (
        <div
          className={styles.miniStrip}
          onClick={() => setSheet('peek')}
        >
          <div className={styles.miniLeft}>
            <span className={`${styles.statusDot} ${displayGrnd ? styles.grounded : ''}`} />
            <span className={styles.miniCallsign}>{displayName}</span>
            {typeCode && <span className={styles.miniType}>{typeCode}</span>}
          </div>
          <div className={styles.miniRoute}>
            <span className={styles.miniIata}>{depIata}</span>
            <svg viewBox="0 0 24 24" width="12" height="12" className={styles.miniPlane}>
              <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" fill="currentColor" />
            </svg>
            <span className={styles.miniIata}>{arrIata}</span>
          </div>
          {etaMin != null && (
            <span className={styles.miniEta}>{fmtEta(etaMin)}</span>
          )}
        </div>
      )}

      {/* ── Full peek content (hidden when mini) ── */}
      {!isMini && (
        <>
          {/* ── Hero: aircraft photo ── */}
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
            {photo?.photographer && (
              <span className={styles.photoCredit}>{photo.photographer}</span>
            )}
          </div>

          {/* ── Flight identity ── */}
          <div className={styles.identity}>
            <div className={styles.identityRow}>
              <span className={styles.callsign}>{displayName}</span>
              {typeCode && <span className={styles.typeCode}>{typeCode}</span>}
            </div>
            <div className={styles.identitySub}>
              {operator && <span>{operator}</span>}
              {typeDesc && <span>{typeDesc}</span>}
              {detail?.registration && <span>{detail.registration}</span>}
            </div>
          </div>

          {loading && <p className={styles.state}>loading…</p>}
          {error && isFlight && <p className={styles.state}>error {error}</p>}

          {/* ── Route: departure → arrival ── */}
          {route && (
            <div className={styles.routeCard}>
              <div className={styles.routeRow}>
                <div className={styles.routeAirport}>
                  <span className={styles.iata}>{depIata}</span>
                  <span className={styles.airportName}>{route.departure_name || 'Departure'}</span>
                </div>
                <div className={styles.routeMiddle}>
                  <div className={styles.routeLine}>
                    <span className={styles.routeDotLeft} />
                    <span className={styles.routeDash} />
                    <svg className={styles.routePlane} viewBox="0 0 24 24" width="16" height="16">
                      <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" fill="currentColor" />
                    </svg>
                    <span className={styles.routeDash} />
                    <span className={styles.routeDotRight} />
                  </div>
                  {distKm != null && <span className={styles.routeDist}>{fmtDist(distKm)}</span>}
                </div>
                <div className={styles.routeAirport}>
                  <span className={styles.iata}>{arrIata}</span>
                  <span className={styles.airportName}>{route.arrival_name || 'Arrival'}</span>
                </div>
              </div>
              {etaMin != null && (
                <div className={styles.etaBadge}>
                  <span className={styles.etaLabel}>ETA</span>
                  <span className={styles.etaValue}>{fmtEta(etaMin)}</span>
                </div>
              )}
            </div>
          )}

          {/* ── Position fallback (no route) ── */}
          {!route && hasPosition && (
            <div className={styles.posCard}>
              <div className={styles.posRow}>
                <span className={styles.posLabel}>Position</span>
                <span className={styles.posValue}>{displayLat.toFixed(4)}°, {displayLon.toFixed(4)}°</span>
              </div>
              {nearestAirport(displayLat, displayLon) && (
                <div className={styles.posRow}>
                  <span className={styles.posLabel}>Near</span>
                  <span className={styles.posValue}>{nearestAirport(displayLat, displayLon).name}</span>
                </div>
              )}
              {altKm != null && (
                <div className={styles.posRow}>
                  <span className={styles.posLabel}>Orbit</span>
                  <span className={styles.posValue}>{Math.round(altKm)} km</span>
                </div>
              )}
            </div>
          )}

          {/* ── Live telemetry ── */}
          {hasPosition && (
            <div className={styles.telemetry}>
              <div className={styles.telemStrip}>
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
              <div className={styles.statusBar}>
                <span className={`${styles.statusDot} ${displayGrnd ? styles.grounded : ''}`} />
                <span className={styles.statusText}>{statusLabel}</span>
                {liveData?.ctry && <span className={styles.statusMeta}>{liveData.ctry}</span>}
                {etaMin != null && <span className={styles.statusEta}>ETA {fmtEta(etaMin)}</span>}
              </div>
            </div>
          )}

          {/* ── Track / fit ── */}
          {isFlight && (detail || liveData) && (
            <div className={styles.trackRow}>
              <button
                className={`${styles.trackBtn} ${isTracking ? styles.trackBtnActive : ''}`}
                onClick={() => {
                  if (isTracking) onTrack?.(null)
                  else onTrack?.(icao24)
                }}
              >
                {isTracking ? 'Stop Tracking' : 'Track Flight'}
              </button>
              {isTracking && (
                <button className={styles.fitBtn} onClick={() => onFitRoute?.(route)}>Fit Route</button>
              )}
              {onToggleSave && (
                <button
                  className={styles.fitBtn}
                  title={isSaved ? 'Remove from saved flights' : 'Save flight to your account'}
                  onClick={() => onToggleSave({
                    icao24,
                    callsign: liveData?.callsign || detail?.callsign || null,
                    label: liveData?.name || detail?.model || null,
                  })}
                >
                  {isSaved ? '★ Saved' : '☆ Save'}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </aside>
  )
}
