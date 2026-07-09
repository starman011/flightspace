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

// ── ISS live stream + crew + missions ─────────────────────────────────────
// NASA TV official channel live embed — always-on, no scraping needed
// NASA TV persistent live stream — fallback when RSS finds nothing
// Channel-based live embed auto-resolves to whatever is CURRENTLY live on the
// official NASA ISS channel — robust against video-ID changes (the cause of
// recurring "stream not available" errors from scraped fixed IDs).
// Perpetual 24/7 ISS live stream (verified embeddable). The channel-based
// live_stream embed showed "unavailable" whenever the channel wasn't live;
// a continuous 24/7 stream video stays up reliably.
const NASA_ISS_VIDEO = 'vytmBNhc9ig'
const NASA_TV_FALLBACK = `https://www.youtube.com/embed/${NASA_ISS_VIDEO}?autoplay=1&mute=1&rel=0&modestbranding=1`
const NASA_ISS_WATCH = `https://www.youtube.com/watch?v=${NASA_ISS_VIDEO}`

function ISSStream() {
  // Use the reliable channel-based NASA ISS live embed directly. (The scraped
  // backend video ID kept resolving to ended/non-live videos.)
  const src = NASA_TV_FALLBACK
  const [theater, setTheater] = useState(false)
  const wrapRef = useRef(null)

  const goFullscreen = () => {
    const el = wrapRef.current
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => {})
  }

  const iframe = (
    <iframe
      src={src}
      className={styles.issIframe}
      allow="autoplay; encrypted-media; fullscreen"
      allowFullScreen
      title="NASA ISS Live"
    />
  )

  return (
    <>
      <div className={styles.issStream} ref={wrapRef}>
        {iframe}
        <div className={styles.streamBadge}>
          <span className={styles.liveDot} />
          LIVE · NASA TV
        </div>
        <div className={styles.streamControls}>
          <button onClick={() => setTheater(true)} title="Theater / half-screen" aria-label="Theater mode">⤢</button>
          <button onClick={goFullscreen} title="Fullscreen" aria-label="Fullscreen">⛶</button>
          <a href={NASA_ISS_WATCH} target="_blank" rel="noopener noreferrer" title="Open on YouTube" aria-label="Open on YouTube">↗</a>
        </div>
      </div>

      {theater && (
        <div className={styles.theaterOverlay} onClick={() => setTheater(false)}>
          <div className={styles.theaterPanel} ref={wrapRef} onClick={e => e.stopPropagation()}>
            {iframe}
            <div className={styles.theaterBar}>
              <span className={styles.streamBadge} style={{ position: 'static' }}>
                <span className={styles.liveDot} /> ISS · LIVE
              </span>
              <span style={{ flex: 1 }} />
              <button onClick={goFullscreen} title="Fullscreen">⛶</button>
              <a href={NASA_ISS_WATCH} target="_blank" rel="noopener noreferrer" title="Open on YouTube">↗</a>
              <button onClick={() => setTheater(false)} title="Close">✕</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ISSCrew() {
  const [crew, setCrew] = useState(null)
  useEffect(() => {
    fetch(`${API}/api/v1/iss/crew`)
      .then(r => r.json())
      .then(data => setCrew(data.people?.filter(p => p.craft === 'ISS') || []))
      .catch(() => {})
  }, [])
  if (!crew || crew.length === 0) return null
  return (
    <div className={styles.issCrew}>
      <div className={styles.issLabel}>
        <span className="material-symbols-outlined" style={{ fontSize: 11, color: 'rgba(178,255,26,0.6)' }}>group</span>
        CREW ON BOARD · {crew.length}
      </div>
      <div className={styles.crewGrid}>
        {crew.map(c => (
          <div key={c.name} className={styles.crewMember}>
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'rgba(178,255,26,0.5)' }}>person</span>
            <span className={styles.crewName}>{c.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ISSMissions() {
  const [missions, setMissions] = useState(null)
  useEffect(() => {
    fetch(`${API}/api/v1/launches`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        const issMissions = data.filter(l =>
          l.mission?.orbit?.name?.includes('Low Earth') ||
          l.name?.toLowerCase().includes('iss') ||
          l.name?.toLowerCase().includes('crew') ||
          l.name?.toLowerCase().includes('progress') ||
          l.name?.toLowerCase().includes('crs') ||
          l.name?.toLowerCase().includes('starliner') ||
          l.name?.toLowerCase().includes('soyuz')
        ).slice(0, 4)
        setMissions(issMissions)
      })
      .catch(() => {})
  }, [])
  if (!missions || missions.length === 0) return null
  return (
    <div className={styles.issMissions}>
      <div className={styles.issLabel}>
        <span className="material-symbols-outlined" style={{ fontSize: 11, color: 'rgba(178,255,26,0.6)' }}>rocket_launch</span>
        UPCOMING ISS MISSIONS
      </div>
      {missions.map((m, i) => (
        <div key={i} className={styles.missionRow}>
          <span className={styles.missionName}>{m.name}</span>
          <span className={styles.missionDate}>
            {m.net ? new Date(m.net).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── ISS Orbital Specs ─────────────────────────────────────────────────────
const ISS_SPECS = [
  { label: 'Inclination',    value: '51.64°' },
  { label: 'Orbital Period', value: '92.68 min' },
  { label: 'Mean Altitude',  value: '408 km' },
  { label: 'Velocity',       value: '7.66 km/s' },
  { label: 'Mass',           value: '~420,000 kg' },
  { label: 'Wingspan',       value: '109 m' },
  { label: 'Volume',         value: '916 m³' },
  { label: 'In orbit since', value: 'Nov 1998' },
]

// Public-domain ISS imagery (NASA via Wikimedia) — gives the card visuals
// beyond the numbers.
const ISS_IMAGES = [
  { src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/International_Space_Station_after_undocking_of_STS-132.jpg/800px-International_Space_Station_after_undocking_of_STS-132.jpg', alt: 'The International Space Station in orbit above Earth' },
  { src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/The_Earth_seen_from_Apollo_17.jpg/800px-The_Earth_seen_from_Apollo_17.jpg', alt: 'Earth as seen from space' },
  { src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/NGC_4414_%28NASA-med%29.jpg/800px-NGC_4414_%28NASA-med%29.jpg', alt: 'A spiral galaxy in deep space' },
]

export default function DetailPanel({ icao24, liveData, onClose, onTrailData, isAuthenticated, isTracking, onTrack, onFitRoute, isSaved, onToggleSave, onSignIn, viewerCount = 0, watchObject }) {
  const [detail, setDetail]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [photo,   setPhoto]   = useState(null)
  const [route,   setRoute]   = useState(null)
  const [history, setHistory] = useState(null)
  const [playback, setPlayback] = useState(null) // { trail, index, playing }
  const playbackTimer = useRef(null)
  // Mobile sheet: 'peek' (default ~38dvh) or 'mini' (collapsed strip ~80px)
  const [sheet, setSheet]     = useState('peek')
  const [closing, setClosing] = useState(false)
  const panelRef = useRef(null)
  const photoTriedReg = useRef(false)

  // ISS detail can open without live WebSocket data (direct /iss URL).
  // Derive satellite category from the id so crew/stream/specs always render.
  const cat = liveData?.cat || (icao24 === 'ISS' ? 'satellite' : '')
  const isFlight = cat === 'plane' || cat === 'helicopter'

  const routeRef = useRef(null)
  useEffect(() => { routeRef.current = route }, [route])

  const mountedRef = useRef(true)
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  // Controlled close: play an exit animation, then unmount — prevents the
  // panel from flashing its base (desktop) layout for a frame on mobile.
  const requestClose = useCallback(() => {
    setClosing(true)
    setTimeout(() => onClose?.(), 240)
  }, [onClose])

  // Reset sheet + closing when a new flight is selected
  useEffect(() => { setSheet('peek'); setClosing(false) }, [icao24])

  // Social presence: tell server we're watching this object
  useEffect(() => {
    if (icao24 && watchObject) {
      watchObject(icao24)
      return () => watchObject('')
    }
  }, [icao24, watchObject])

  /* ── Fluid swipe gesture for the mobile sheet ────────────────────────────
     The card tracks the finger in real time (max-height follows the drag) and
     snaps to the nearest state on release — with a velocity flick shortcut, so
     a single drag can travel mini→full. The old version had no touchmove (card
     felt dead) and stepped one state per gesture (needed several drags). */
  const touchStartY   = useRef(null)
  const touchStartH   = useRef(0)
  const draggingRef   = useRef(false)
  const dragVy        = useRef(0)   // px/ms, + = downward
  const lastY         = useRef(0)
  const lastT         = useRef(0)
  const clearInlineTimer = useRef(null)

  const snapHeights = () => {
    const vh = window.innerHeight || 800
    return { mini: 80, peek: Math.round(vh * 0.38), full: Math.round(vh * 0.88) }
  }

  const handleTouchStart = useCallback((e) => {
    const el = panelRef.current
    if (!el) return
    clearTimeout(clearInlineTimer.current)
    touchStartY.current = e.touches[0].clientY
    touchStartH.current = el.getBoundingClientRect().height
    lastY.current = e.touches[0].clientY
    lastT.current = e.timeStamp
    dragVy.current = 0
    draggingRef.current = true
    el.style.transition = 'none'   // 1:1 finger tracking, no lag
  }, [])

  const handleTouchMove = useCallback((e) => {
    if (!draggingRef.current) return
    const el = panelRef.current
    if (!el) return
    const y = e.touches[0].clientY
    const s = snapHeights()
    // Drag up (y decreases) → taller card
    const h = Math.max(s.mini, Math.min(s.full, touchStartH.current + (touchStartY.current - y)))
    el.style.maxHeight = `${h}px`
    const dt = e.timeStamp - lastT.current
    if (dt > 0) dragVy.current = (y - lastY.current) / dt
    lastY.current = y
    lastT.current = e.timeStamp
  }, [])

  const handleTouchEnd = useCallback((e) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    const el = panelRef.current
    if (!el) { touchStartY.current = null; return }
    const dyTotal = e.changedTouches[0].clientY - (touchStartY.current ?? 0)
    const s = snapHeights()
    const curH = el.getBoundingClientRect().height
    const v = dragVy.current

    let target
    if (Math.abs(dyTotal) < 6) {
      // Tap the handle → expand one step (mini→peek→full, full→peek)
      target = sheet === 'mini' ? 'peek' : sheet === 'peek' ? 'full' : 'peek'
    } else if (v < -0.5) {
      target = 'full'   // fast flick up → straight to full
    } else if (v > 0.5) {
      target = 'mini'   // fast flick down → collapse
    } else {
      // Settle on the nearest snap height to where the finger let go
      const order = [['mini', s.mini], ['peek', s.peek], ['full', s.full]]
      target = order.reduce((best, cur) =>
        Math.abs(cur[1] - curH) < Math.abs(best[1] - curH) ? cur : best)[0]
    }

    // Animate from the drag position to the target, then hand back to the class
    el.style.transition = ''
    el.style.maxHeight = `${s[target]}px`
    setSheet(target)
    clearInlineTimer.current = setTimeout(() => {
      if (panelRef.current && !draggingRef.current) panelRef.current.style.maxHeight = ''
    }, 360)
    touchStartY.current = null
  }, [sheet])

  // ISS fetches the same detail endpoint so position loads without WebSocket
  const fetchesDetail = isFlight || icao24 === 'ISS'

  const refreshLive = useCallback(() => {
    if (!icao24 || !fetchesDetail) return
    fetch(`${API}/api/v1/aircraft/${icao24}`, { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(data => { if (mountedRef.current) setDetail(data) })
      .catch(() => {})
  }, [icao24, fetchesDetail])

  useEffect(() => {
    if (!icao24) return
    setDetail(null)
    setPhoto(null)
    setRoute(null)
    setError(null)
    photoTriedReg.current = false
    let cancelled = false

    if (fetchesDetail) {
      setLoading(true)
      fetch(`${API}/api/v1/aircraft/${icao24}`, { credentials: 'include' })
        .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
        .then(data => { if (!cancelled) setDetail(data) })
        .catch(e => { if (!cancelled) setError(e.message) })
        .finally(() => { if (!cancelled) setLoading(false) })

      // Aircraft-only: route + photo (ISS has neither)
      if (isFlight) {
        fetch(`${API}/api/v1/aircraft/${icao24}/route`, { credentials: 'include' })
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d && !cancelled) setRoute(d) })
          .catch(() => {})

        fetchPhotoFromUrl(`https://api.planespotters.net/pub/photos/hex/${icao24}`)
          .then(p => { if (!cancelled) setPhoto(p) })
      }

      const iv = setInterval(refreshLive, 5000)
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

  // Fetch flight history (archived trails)
  useEffect(() => {
    if (!icao24 || !isFlight) return
    setHistory(null)
    fetch(`/api/v1/aircraft/${icao24}/history`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.flights?.length) setHistory(d.flights) })
      .catch(() => {})
  }, [icao24, isFlight])

  // Playback animation tick
  useEffect(() => {
    if (!playback?.playing) return
    playbackTimer.current = setInterval(() => {
      setPlayback(prev => {
        if (!prev || prev.index >= prev.trail.length - 1) {
          clearInterval(playbackTimer.current)
          return prev ? { ...prev, playing: false } : null
        }
        const next = prev.index + 1
        // Send partial trail up to current index to Globe
        onTrailData?.(prev.trail.slice(0, next + 1), route)
        return { ...prev, index: next }
      })
    }, 80)
    return () => clearInterval(playbackTimer.current)
  }, [playback?.playing]) // eslint-disable-line react-hooks/exhaustive-deps

  const startPlayback = useCallback((trail) => {
    // Trail is newest-first from Redis, reverse for chronological playback
    const chronological = [...trail].reverse()
    setPlayback({ trail: chronological, index: 0, playing: true })
    onTrailData?.(chronological.slice(0, 1), route)
  }, [route, onTrailData])

  const stopPlayback = useCallback(() => {
    clearInterval(playbackTimer.current)
    setPlayback(null)
    // Restore live trail
    if (detail?.trail) onTrailData?.(detail.trail, route)
  }, [detail, route, onTrailData])

  const seekPlayback = useCallback((index) => {
    setPlayback(prev => {
      if (!prev) return null
      onTrailData?.(prev.trail.slice(0, index + 1), route)
      return { ...prev, index, playing: false }
    })
  }, [route, onTrailData])

  // Fallback: try registration-based photo if hex returned nothing
  useEffect(() => {
    if (photo || !detail?.registration || photoTriedReg.current) return
    photoTriedReg.current = true
    fetchPhotoFromUrl(
      `https://api.planespotters.net/pub/photos/reg/${detail.registration}`
    ).then(p => { if (p) setPhoto(p) })
  }, [photo, detail?.registration])

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') requestClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [requestClose])

  useEffect(() => {
    const handler = e => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        if (e.target?.tagName === 'CANVAS') return
        requestClose()
      }
    }
    const t = setTimeout(() => document.addEventListener('pointerdown', handler), 200)
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', handler) }
  }, [requestClose])

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

  const hasRoute = route?.source === 'routes_db' || route?.source === 'adsbdb'
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
  const panelCls = `${styles.panel} ${isMini ? styles.panelMini : ''} ${sheet === 'full' ? styles.panelFull : ''} ${closing ? styles.closing : ''}`

  return (
    <aside ref={panelRef} className={panelCls}>
      {/* ── Mobile drag handle + swipe zone ── */}
      <div
        className={styles.dragZone}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className={styles.dragHandle} />
      </div>

      {/* ── Close button (always visible) ── */}
      <button className={styles.closeBtn} onClick={requestClose} aria-label="close">×</button>

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
          {hasRoute && (
            <div className={styles.miniRoute}>
              <span className={styles.miniIata}>{depIata}</span>
              <svg viewBox="0 0 24 24" width="12" height="12" className={styles.miniPlane}>
                <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" fill="currentColor" />
              </svg>
              <span className={styles.miniIata}>{arrIata}</span>
            </div>
          )}
          {etaMin != null && (
            <span className={styles.miniEta}>{fmtEta(etaMin)}</span>
          )}
        </div>
      )}

      {/* ── Full peek content (hidden when mini) ── */}
      {!isMini && (
        <>
          {/* ── Hero: live stream for ISS, photo for aircraft ── */}
          {cat === 'satellite' && icao24 === 'ISS' ? (
            <ISSStream />
          ) : (
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
          )}

          {/* ── Flight identity ── */}
          <div className={styles.identity}>
            <div className={styles.identityRow}>
              {route?.airline_iata && (
                <img
                  className={styles.airlineLogo}
                  src={`https://pics.avs.io/36/36/${route.airline_iata}@2x.png`}
                  alt=""
                  onError={e => { e.target.style.display = 'none' }}
                />
              )}
              <span className={styles.callsign}>{displayName}</span>
              {typeCode && <span className={styles.typeCode}>{typeCode}</span>}
            </div>
            <div className={styles.identitySub}>
              {operator && <span>{operator}</span>}
              {typeDesc && <span>{typeDesc}</span>}
              {detail?.registration && detail.registration !== typeDesc && <span>{detail.registration}</span>}
            </div>
            {viewerCount > 1 && (
              <div className={styles.viewerCount}>
                <span className={styles.viewerDot} />
                {viewerCount} watching
              </div>
            )}
          </div>

          {loading && <p className={styles.state}>loading…</p>}
          {error && isFlight && <p className={styles.state}>error {error}</p>}

          {/* ── Route: departure → arrival ── */}
          {hasRoute && (
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
          {!hasRoute && hasPosition && (
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

          {/* ── ISS details: crew, specs, upcoming missions ── */}
          {cat === 'satellite' && icao24 === 'ISS' && (
            <>
              <div className={styles.issGallery}>
                {ISS_IMAGES.map((g, i) => (
                  <img key={i} src={g.src} alt={g.alt} loading="lazy" className={styles.issGalleryImg}
                    referrerPolicy="no-referrer"
                    onError={e => { e.currentTarget.style.display = 'none' }} />
                ))}
              </div>
              <ISSCrew />
              <div className={styles.issSpecs}>
                <div className={styles.issLabel}>
                  <span className="material-symbols-outlined" style={{ fontSize: 11 }}>info</span>
                  ORBITAL PARAMETERS
                </div>
                <div className={styles.specsGrid}>
                  {ISS_SPECS.map(s => (
                    <div key={s.label} className={styles.specRow}>
                      <span className={styles.specLabel}>{s.label}</span>
                      <span className={styles.specValue}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <ISSMissions />
            </>
          )}

          {/* ── Track / fit ── */}
          {/* ── Flight History Timeline ── */}
          {isFlight && history && history.length > 0 && (
            <div className={styles.historySection}>
              <p className={styles.historyTitle}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Flight History
              </p>
              {history.map((h, i) => {
                const start = new Date(h.started_at)
                const end = new Date(h.ended_at)
                const dur = Math.round((end - start) / 60000)
                const isPlaying = playback && playback.trail === h._chronological
                return (
                  <div key={h.id || i} className={styles.historyItem}>
                    <div className={styles.historyMeta}>
                      <span>{start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                      <span>{start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} – {end.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                      <span>{dur}min · {h.point_count}pts</span>
                    </div>
                    {!playback ? (
                      <button className={styles.replayBtn} onClick={() => {
                        const trail = typeof h.trail === 'string' ? JSON.parse(h.trail) : h.trail
                        h._chronological = [...trail].reverse()
                        startPlayback(h._chronological)
                      }}>
                        ▶ Replay
                      </button>
                    ) : isPlaying ? (
                      <div className={styles.scrubberWrap}>
                        <button className={styles.replayBtn} onClick={() => {
                          if (playback.playing) {
                            clearInterval(playbackTimer.current)
                            setPlayback(p => p ? { ...p, playing: false } : null)
                          } else {
                            setPlayback(p => p ? { ...p, playing: true } : null)
                          }
                        }}>
                          {playback.playing ? '⏸' : '▶'}
                        </button>
                        <input
                          type="range"
                          className={styles.scrubber}
                          min={0}
                          max={playback.trail.length - 1}
                          value={playback.index}
                          onChange={e => seekPlayback(parseInt(e.target.value))}
                        />
                        <button className={styles.replayBtn} onClick={stopPlayback}>✕</button>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}

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
                isAuthenticated ? (
                  <button
                    className={styles.fitBtn}
                    data-haptic-heavy
                    title={isSaved ? 'Remove from saved flights' : 'Save flight to your account'}
                    onClick={() => onToggleSave({
                      icao24,
                      callsign: liveData?.callsign || detail?.callsign || null,
                      label: liveData?.name || detail?.model || null,
                    })}
                  >
                    {isSaved ? '★ Saved' : '☆ Save'}
                  </button>
                ) : (
                  <button
                    className={styles.fitBtn}
                    title="Sign in to save flights"
                    onClick={() => onSignIn?.()}
                  >
                    ☆ Save
                  </button>
                )
              )}
              <button
                className={styles.fitBtn}
                title="Copy link to this flight"
                onClick={() => {
                  const url = `${window.location.origin}/flight/${icao24}`
                  navigator.clipboard.writeText(url).then(() => {
                    const btn = document.activeElement
                    if (btn) { btn.textContent = '✓ Copied'; setTimeout(() => { btn.textContent = '↗ Share' }, 1500) }
                  }).catch(() => {})
                }}
              >
                ↗ Share
              </button>
            </div>
          )}
        </>
      )}
    </aside>
  )
}
