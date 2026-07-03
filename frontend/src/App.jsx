import { useState, useCallback, useRef, useMemo, Component, useEffect } from 'react'

class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050a0f', color: '#ff6b6b', fontFamily: 'monospace', fontSize: 13, padding: 32, textAlign: 'center' }}>
        {this.state.error.message}
      </div>
    )
    return this.props.children
  }
}
import { Globe } from './components/Globe/Globe'
import DetailPanel from './components/DetailPanel/DetailPanel'
import SearchBar from './components/SearchBar/SearchBar'
import LaunchPanel from './components/LaunchPanel/LaunchPanel'
import ProfilePanel from './components/ProfilePanel/ProfilePanel'
import BottomBar from './components/BottomBar/BottomBar'
import TopRightPill from './components/TopRightPill/TopRightPill'
import PagesPill from './components/PagesPill/PagesPill'
import AboutPage from './components/StaticPages/AboutPage'
import WaitlistPage from './components/StaticPages/WaitlistPage'
import ContactPage from './components/StaticPages/ContactPage'
import FAQPage from './components/StaticPages/FAQPage'
import DonatePage from './components/StaticPages/DonatePage'
import BlogPage from './components/StaticPages/BlogPage'
import FlightPage from './components/FlightPage/FlightPage'
import PlanesPage from './components/PlanesPage/PlanesPage'
import AdminPage from './components/AdminPage/AdminPage'
import CommandCenterOverlay from './components/CommandCenterOverlay/CommandCenterOverlay'
import DeepSpacePanel from './components/DeepSpacePanel/DeepSpacePanel'
// OrbitalMapBar removed — filters now in BottomBar (desktop) and CommandCenterOverlay (mobile)
import PlanetPanel from './components/PlanetPanel/PlanetPanel'
import AirportPanel from './components/AirportPanel/AirportPanel'
import SkyObjectPanel from './components/SkyObjectPanel/SkyObjectPanel'
import GalaxyPanel from './components/GalaxyPanel/GalaxyPanel'
import DeepSpaceGuide from './components/DeepSpaceGuide/DeepSpaceGuide'
import GalaxyConeView from './components/GalaxyConeView/GalaxyConeView'
// DistanceSlicer now integrated into CommandCenterOverlay
import MoonPanel from './components/MoonPanel/MoonPanel'
import WaitlistPopup from './components/WaitlistPopup/WaitlistPopup'
import TourGuide from './components/TourGuide/TourGuide'
import BetaWelcome from './components/BetaWelcome/BetaWelcome'
import LoadingScreen from './components/LoadingScreen/LoadingScreen'
import AuthModal from './components/Auth/AuthModal'
import { useAmbientAudio } from './hooks/useAmbientAudio'
import { useHaptics } from './hooks/useHaptics'
import { useSession } from './hooks/useSession'
import { useAircraft } from './hooks/useAircraft'
import { useAsteroids } from './hooks/useAsteroids'
import { usePins } from './hooks/usePins'
import { usePWAInstall } from './hooks/usePWAInstall'
import { parseInitialState, stateToPath, updateRouteMeta } from './utils/routing'
import PWABanner from './components/PWABanner/PWABanner'
import FlightLanding from './components/FlightLanding/FlightLanding'
import ContextBanner from './components/ContextBanner/ContextBanner'
import LiveNudge from './components/LiveNudge/LiveNudge'
import SkyReticle from './components/SkyReticle/SkyReticle'
import SiteFooter from './components/SiteFooter/SiteFooter'
import WindLegend from './components/WindLegend/WindLegend'
import { AIRPORTS } from './components/Globe/airportData'

const AIRPORT_BY_IATA = Object.fromEntries(AIRPORTS.map(a => [a.iata, a]))

// Predict the ISS ground track forward ~95 min (≈1 orbit) from its current
// position. Circular orbit, inclination 51.64°, period 92.68 min, minus Earth
// rotation. Approximate (assumes ascending/prograde) but visually accurate.
function issGroundTrack(lat0, lon0, minutes = 95, stepMin = 1.5) {
  const inc = 51.64 * Math.PI / 180
  const T = 92.68
  const we = 360 / (23.9345 * 60) // Earth rotation, deg/min
  const sinLat0 = Math.sin(lat0 * Math.PI / 180)
  const u0 = Math.asin(Math.max(-1, Math.min(1, sinLat0 / Math.sin(inc))))
  const dLon0 = Math.atan2(Math.cos(inc) * Math.sin(u0), Math.cos(u0)) * 180 / Math.PI
  const lonNode = lon0 - dLon0
  const pts = []
  for (let t = 0; t <= minutes; t += stepMin) {
    const u = u0 + 2 * Math.PI * (t / T)
    const lat = Math.asin(Math.sin(inc) * Math.sin(u)) * 180 / Math.PI
    let lon = lonNode + Math.atan2(Math.cos(inc) * Math.sin(u), Math.cos(u)) * 180 / Math.PI - we * t
    lon = ((lon + 180) % 360 + 360) % 360 - 180
    pts.push({ latitude: lat, longitude: lon, altitude: 0 })
  }
  return pts
}

// ── Pad Focus Badge ───────────────────────────────────────────────────────────
function PadFocusBadge({ launch, onExit }) {
  const lat = launch.pad_lat, lon = launch.pad_lon
  const latStr = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}`
  const lonStr = `${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'W'}`

  return (
    <div style={{
      position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)',
      zIndex: 200, display: 'flex', alignItems: 'center', gap: 16,
      background: 'rgba(6,12,18,0.88)', backdropFilter: 'blur(18px)',
      border: '1px solid rgba(178,255,26,0.3)', borderRadius: 12,
      padding: '12px 20px', boxShadow: '0 0 40px rgba(178,255,26,0.12)',
    }}>
      {/* Pulsing ping dot */}
      <div style={{ position: 'relative', width: 12, height: 12, flexShrink: 0 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: '#b2ff1a', animation: 'padPing 1.6s ease-out infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%', background: '#b2ff1a',
        }} />
      </div>

      <div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase',
          letterSpacing: '0.1em', color: 'rgba(178,255,26,0.6)', marginBottom: 3 }}>
          Launch Pad · Locked
        </p>
        <p style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14,
          color: '#fff', marginBottom: 2 }}>
          {launch.pad || (launch.mission_name || launch.name)}
        </p>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(195,245,255,0.5)' }}>
          {latStr} · {lonStr}
        </p>
      </div>

      <button onClick={onExit} style={{
        background: 'rgba(178,255,26,0.08)', border: '1px solid rgba(178,255,26,0.2)',
        borderRadius: 8, color: 'rgba(178,255,26,0.7)', fontFamily: 'var(--font-mono)',
        fontSize: 11, padding: '6px 14px', cursor: 'pointer', whiteSpace: 'nowrap',
        letterSpacing: '0.06em',
      }}>
        ✕ Exit
      </button>
    </div>
  )
}



export default function App() {
  const { sessionToken, isAuthenticated, user, sessionError, login, register, logout, googleLogin } = useSession()

  // Initialise from URL on first render — must be before any useState that reads it
  const init = parseInitialState(window.location.pathname)

  const [showLoading, setShowLoading] = useState(true)
  const showLoadingRef = useRef(true)
  useEffect(() => { showLoadingRef.current = showLoading }, [showLoading])
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [errorDismissed, setErrorDismissed] = useState(false)
  // Keep LIVE off on direct URL — DetailPanel fetches ISS/aircraft via REST first
  // WebSocket only connects when user explicitly enables LIVE (prevents session-not-ready lag)
  const [liveEnabled, setLiveEnabled] = useState(false)
  // Show flight landing screen only for regular aircraft (not ISS)
  const [showFlightLanding, setShowFlightLanding] = useState(
    !!init.selectedIcao24 && init.selectedIcao24 !== 'ISS'
  )
  const [showWeather, setShowWeather] = useState(false)
  const { aircraft, filteredAircraft, setFilters, connectionStatus, setBounds, solarData, viewerCounts, watchObject } = useAircraft(sessionToken, liveEnabled)
  const pwa = usePWAInstall()
  const audio = useAmbientAudio()
  useHaptics()

  const [selectedIcao24, setSelectedIcao24] = useState(init.selectedIcao24)
  const [searchOpen, setSearchOpen]         = useState(false)
  // Only auto-track regular aircraft from URL, not ISS (ISS tracked after live enables)
  const [trackingId, setTrackingId]         = useState(
    init.selectedIcao24 && init.selectedIcao24 !== 'ISS' ? init.selectedIcao24 : null
  )
  const [launchPanelOpen, setLaunchPanelOpen] = useState(init.launchPanelOpen)
  const [profilePanelOpen, setProfilePanelOpen] = useState(init.profilePanelOpen)
  const [activeScale, setActiveScale]       = useState(init.activeScale)

  const { asteroids } = useAsteroids(activeScale === 'solar')
  const [activeFilter, setActiveFilter]     = useState(init.activeFilter)
  const [zoomedIn, setZoomedIn]             = useState(false)
  const [selectedPlanet, setSelectedPlanet] = useState(null)
  const [selectedAirport, setSelectedAirport] = useState(init.selectedAirport)
  const [selectedSkyObject, setSelectedSkyObject] = useState(null)
  const [selectedGalaxy, setSelectedGalaxy] = useState(null)
  const [guideHidden, setGuideHidden]       = useState(false)
  const [activePage, setActivePage]         = useState(init.activePage)
  const [flightApt, setFlightApt]           = useState(init.flightAirport || null)  // airport shown in the flight board (drives /flights/{iata} URL)
  const [coneExpanded, setConeExpanded]     = useState(false)
  const [scaleReady, setScaleReady]         = useState(init.activeScale === 'earth' ? 'earth' : null)
  const [selectedMoonSite, setSelectedMoonSite] = useState(null)
  const [focusedPad, setFocusedPad]         = useState(null)
  const pins = usePins(isAuthenticated, sessionToken)
  // The CommandCenterOverlay shows ONE pinned launch. We display the most
  // recently pinned one (last in the list).
  const lastPin = pins.pinnedLaunches[pins.pinnedLaunches.length - 1] || null
  const pinnedLaunch = lastPin ? (lastPin._full || {
    id: lastPin.id,
    mission_name: lastPin.name,
    name: lastPin.name,
    net: lastPin.net_time,
  }) : null
  const handlePinLaunch = useCallback((launch) => {
    if (launch) pins.pinLaunch(launch)
    else if (pinnedLaunch) pins.unpinLaunch(pinnedLaunch.id)
  }, [pins, pinnedLaunch])
  const [returnMission, setReturnMission]   = useState(init.selectedLaunchId)
  // Landing-page context (airline / route / city / region) from the deep-link URL
  const [landing, setLanding] = useState(() => {
    if (init.airlineFilter) return { kind: 'airline', ...init.airlineFilter }
    if (init.routeFocus)    return { kind: 'route', ...init.routeFocus }
    if (init.cityFocus)     return { kind: 'city', ...init.cityFocus }
    if (init.regionFocus)   return { kind: 'region', ...init.regionFocus }
    if (init.satFilter)     return { kind: 'satellite', ...init.satFilter }
    return null
  })
  const [streamCollapsed, setStreamCollapsed] = useState(false)
  const [arActive, setArActive] = useState(false)
  const [skyHeading, setSkyHeading] = useState(null)   // { raHms, decDms } live readout
  const [skyLocated, setSkyLocated] = useState(false)  // user granted location → real-sky
  const [arMsg, setArMsg] = useState(null)             // status/diagnostic toast for sky view
  const [skyFlat, setSkyFlat] = useState(false)        // phone lying flat → prompt to lift it
  const [skyImgLoading, setSkyImgLoading] = useState(false)  // fetching high-res sky cutout
  const [locating, setLocating] = useState(false)            // geolocating for "fly to my location"
  const [locateMsg, setLocateMsg] = useState(null)           // feedback toast for the locate button
  const [skyCamOn, setSkyCamOn] = useState(false)      // camera passthrough active
  const skyVideoRef = useRef(null)
  const skyStreamRef = useRef(null)
  const [liveToast, setLiveToast] = useState(false)
  const collapseTimerRef = useRef(null)
  const globeRef = useRef(null)
  // Always-fresh aircraft map for use inside one-shot effects (avoids stale closure)
  const aircraftRef = useRef(aircraft)
  useEffect(() => { aircraftRef.current = aircraft }, [aircraft])

  const handleGlobeInteract = useCallback(() => {
    // Collapse the signal stream while the user works the globe, and leave it
    // collapsed — the old 3s auto-re-expand made the feed "open on its own".
    setStreamCollapsed(true)
    clearTimeout(collapseTimerRef.current)
  }, [])

  // Sync state → URL + SEO meta tags (replaceState only — no React Router re-renders).
  // Skip the FIRST run so deep-link landing URLs (/airline/indigo, /route/del-bom,
  // /city/mumbai, /flights/india) are preserved until the user navigates.
  const skipFirstUrlSync = useRef(!!landing)
  useEffect(() => {
    if (skipFirstUrlSync.current) { skipFirstUrlSync.current = false; return }
    const path = stateToPath(selectedIcao24, activeScale, launchPanelOpen, activeFilter, profilePanelOpen, selectedAirport, activePage, flightApt)
    updateRouteMeta(path)
    if (window.location.pathname === path) return
    window.history.replaceState(null, '', path)
  }, [selectedIcao24, activeScale, launchPanelOpen, activeFilter, profilePanelOpen, selectedAirport, activePage, flightApt])

// Sync initial scale to Globe on mount (e.g., direct /deep-space URL)
  useEffect(() => {
    if (init.activeScale !== 'earth') {
      globeRef.current?.setCameraScale?.(init.activeScale)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Landing-page behaviors: make SEO deep-links actually DO something ──────
  // Runs once after the globe mounts. Enables live tracking, flies the camera,
  // applies filters, and draws routes so the page is never a blank homepage.
  useEffect(() => {
    if (!landing && !init.issMode) return
    let tries = 0
    const run = () => {
      const g = globeRef.current
      // Wait for BOTH the globe AND the loading screen to finish before
      // enabling live — otherwise the initial WebSocket snapshot jams the main
      // thread while the loader is still up (page appears frozen / unclickable).
      if ((!g || showLoadingRef.current) && tries++ < 80) { setTimeout(run, 150); return }

      // ISS deep-link: enable live, select + track, fly to it, draw orbit track
      if (init.issMode) {
        setLiveEnabled(true)
        setSelectedIcao24('ISS')
        setTrackingId('ISS')
        let posTries = 0
        const flyToISS = () => {
          const iss = aircraftRef.current.get('ISS')
          if (iss?.lat != null) {
            g?.flyTo?.(iss.lat, iss.lon)
            g?.drawTrail?.(issGroundTrack(iss.lat, iss.lon))
          } else if (posTries++ < 40) {
            setTimeout(flyToISS, 250)
          }
        }
        flyToISS()
        return
      }

      if (landing?.kind === 'airline') {
        setLiveEnabled(true)
        setFilters(prev => ({ ...prev, airline: landing.prefix }))
        return
      }
      if (landing?.kind === 'route') {
        setLiveEnabled(true)
        const o = AIRPORT_BY_IATA[landing.origin]
        const d = AIRPORT_BY_IATA[landing.dest]
        if (o && d) {
          g?.fitRoute?.({ dep_lat: o.lat, dep_lon: o.lon, arr_lat: d.lat, arr_lon: d.lon })
          g?.drawTrail?.([], { dep_lat: o.lat, dep_lon: o.lon, arr_lat: d.lat, arr_lon: d.lon })
        }
        return
      }
      if (landing?.kind === 'city') {
        setLiveEnabled(true)
        const ap = AIRPORT_BY_IATA[landing.iata]
        if (ap) g?.flyTo?.(ap.lat, ap.lon)
        return
      }
      if (landing?.kind === 'region') {
        setLiveEnabled(true)
        g?.flyTo?.(landing.lat, landing.lon)
        return
      }
      if (landing?.kind === 'satellite') {
        setLiveEnabled(true)
        setFilters(prev => ({ ...prev, type: 'satellites', satName: landing.name }))
        return
      }
    }
    run()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Draw the ISS orbit ground-track whenever ISS is selected (any entry path),
  // so users see which locations it's passing over. Cleared on deselect.
  useEffect(() => {
    if (selectedIcao24 !== 'ISS') return
    const API = import.meta.env.VITE_API_URL || ''
    let cancelled = false, tries = 0
    const draw = () => {
      if (cancelled) return
      const live = aircraftRef.current.get('ISS')
      if (live?.lat != null) {
        globeRef.current?.drawTrail?.(issGroundTrack(live.lat, live.lon))
        return
      }
      fetch(`${API}/api/v1/aircraft/ISS`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (cancelled) return
          const lat = d?.current?.latitude, lon = d?.current?.longitude
          if (lat != null) globeRef.current?.drawTrail?.(issGroundTrack(lat, lon))
          else if (tries++ < 8) setTimeout(draw, 600)
        })
        .catch(() => { if (tries++ < 8) setTimeout(draw, 600) })
    }
    draw()
    return () => { cancelled = true }
  }, [selectedIcao24])

const aircraftWithShips = useMemo(() => new Map(filteredAircraft), [filteredAircraft])

  // In pad-focus mode pass an empty map so the globe is clean
  const globeAircraft = useMemo(
    () => focusedPad ? new Map() : aircraftWithShips,
    [focusedPad, aircraftWithShips]
  )

  const handleAircraftClick = useCallback((icao24) => {
    setSelectedIcao24(icao24)
    setLiveEnabled(prev => {
      if (!prev) {
        setLiveToast(true)
        setTimeout(() => setLiveToast(false), 3000)
        return true
      }
      return prev
    })
  }, [])

  // From the /flight page: immediately go live, track, and fly to the picked
  // flight on the globe (don't leave the user on the static offline card).
  const handleTrackFromFlightPage = useCallback((icao24, hint) => {
    setActivePage(null)
    if (activeScale !== 'earth') { setActiveScale('earth'); globeRef.current?.setCameraScale?.('earth') }
    setLiveEnabled(true)
    setSelectedIcao24(icao24)
    setTrackingId(icao24)                 // auto-follow (lock pauses during zoom, eases back)
    watchObject?.(icao24)                 // stream this specific aircraft even if out of view
    // Anticipate: fly toward the airport area right away for immediate motion;
    // the tracking lock then follows the aircraft once its position streams in.
    if (hint?.lat != null && hint?.lon != null) {
      setTimeout(() => globeRef.current?.flyTo?.(hint.lat, hint.lon), 80)
    }
  }, [activeScale, watchObject])

  const openedFromProfileRef = useRef(false)
  const handlePanelClose = useCallback(() => {
    setSelectedIcao24(null)
    setTrackingId(null)
    globeRef.current?.drawTrail?.([])
    if (openedFromProfileRef.current) {
      openedFromProfileRef.current = false
      setProfilePanelOpen(true)
    }
  }, [])

  const handleSearchSelect = useCallback((result) => {
    if (result._type === 'galaxy') {
      setSelectedGalaxy({
        type: 'desi_galaxy',
        targetid: result.targetid || '',
        ra: result.ra,
        dec: result.dec,
        z: result.z,
        spectype: result.spectype === 'QSO' ? 'QSO' : 'GALAXY',
      })
      // Switch to galaxy mode if needed
      if (activeScale !== 'galaxy') {
        setActiveScale('galaxy')
        globeRef.current?.setCameraScale?.('galaxy')
      }
      // Fly camera to galaxy position
      setTimeout(() => {
        globeRef.current?.flyToGalaxy?.(result.ra, result.dec, result.z)
      }, activeScale !== 'galaxy' ? 800 : 50)
    } else if (result._type === 'airport') {
      // Zoom to the city's airport and open its live arrivals/departures board.
      const toEarth = activeScale !== 'earth'
      if (toEarth) {
        setActiveScale('earth')
        globeRef.current?.setCameraScale?.('earth')
      }
      setSelectedAirport(result.iata)
      if (result.lat != null && result.lon != null) {
        setTimeout(() => globeRef.current?.flyTo?.(result.lat, result.lon), toEarth ? 800 : 50)
      }
    } else {
      setSelectedIcao24(result.icao24)
    }
    setSearchOpen(false)
  }, [activeScale])

  const handleTrailData = useCallback((trailPoints, routeData) => {
    globeRef.current?.drawTrail?.(trailPoints, routeData)
  }, [])

  const handleCameraScale = useCallback((scale) => {
    setActiveScale(scale)
    setScaleReady(null)  // panels wait until tween completes
    globeRef.current?.setCameraScale?.(scale)
    // Clear galaxy-scale selections when leaving
    if (scale !== 'galaxy') {
      setSelectedSkyObject(null)
      setSelectedGalaxy(null)
      setGuideHidden(false)
      setConeExpanded(false)
      if (arActive) {
        globeRef.current?.disableAR?.()
        setArActive(false)
      }
    }
  }, [arActive])

  const handleScaleReady = useCallback((scale) => setScaleReady(scale), [])

  const handlePlanetClick = useCallback((name) => setSelectedPlanet(name), [])
  const handlePlanetClose = useCallback(() => setSelectedPlanet(null), [])
  const handleAirportClick = useCallback((iata) => setSelectedAirport(iata), [])
  const handleAirportClose = useCallback(() => setSelectedAirport(null), [])

  // Geolocate → smoothly fly the globe to ~100 km above the user's location.
  const handleLocate = useCallback(() => {
    if (locating) return
    setLocating(true)
    setLocateMsg('Finding your location…')

    // Smooth-zoom the globe to ~100 km above the given coordinates.
    const flyToCoords = (latitude, longitude) => {
      setLocating(false)
      setLocateMsg(null)
      const toEarth = activeScale !== 'earth'
      if (toEarth) {
        setActiveScale('earth')
        globeRef.current?.setCameraScale?.('earth')
      }
      // Let the scale switch settle, then smooth-zoom from the world view to ~100 km up.
      setTimeout(() => globeRef.current?.flyTo?.(latitude, longitude, 100), toEarth ? 850 : 60)
    }

    // Fallback: approximate location from IP — works when GPS is denied,
    // unavailable, or times out (common on desktop).
    const ipFallback = (blocked) => {
      fetch('https://get.geojs.io/v1/ip/geo.json')
        .then(r => r.json())
        .then(d => {
          const lat = parseFloat(d.latitude), lon = parseFloat(d.longitude)
          if (Number.isFinite(lat) && Number.isFinite(lon)) flyToCoords(lat, lon)
          else throw new Error('no coords')
        })
        .catch(() => {
          setLocating(false)
          setLocateMsg(blocked
            ? 'Location is blocked. Allow location for this site, then tap again.'
            : 'Couldn’t find your location — try again.')
        })
    }

    if (!navigator.geolocation) { ipFallback(false); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => flyToCoords(pos.coords.latitude, pos.coords.longitude),
      (err) => {
        console.warn('[locate] geolocation error', err?.code, err?.message, '→ IP fallback')
        ipFallback(err?.code === 1)
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    )
  }, [locating, activeScale])

  // Auto-dismiss the locate feedback message.
  useEffect(() => {
    if (!locateMsg || locateMsg === 'Finding your location…') return
    const t = setTimeout(() => setLocateMsg(null), 5000)
    return () => clearTimeout(t)
  }, [locateMsg])
  const galaxySetAtRef = useRef(0)
  const handleSkyObjectClick = useCallback((obj) => {
    if (!obj) {
      // Ignore null within 300ms of a galaxy selection (prevents flash from
      // rapid pointer-event double-fire or OrbitControls re-dispatch)
      if (Date.now() - galaxySetAtRef.current < 300) return
      setSelectedGalaxy(null)
      setSelectedSkyObject(null)
      return
    }
    if (obj.type === 'desi_galaxy') {
      galaxySetAtRef.current = Date.now()
      setSelectedGalaxy(obj)
      setSelectedSkyObject(null)
    } else {
      setSelectedSkyObject(obj)
      setSelectedGalaxy(null)
    }
  }, [])
  const handleSkyObjectClose = useCallback(() => setSelectedSkyObject(null), [])
  const handleGalaxyClose = useCallback(() => setSelectedGalaxy(null), [])
  const handleMoonSiteClick = useCallback((site) => setSelectedMoonSite(site), [])
  // Smart close: if a site is open, go back to Moon overview; otherwise exit
  // Moon scale entirely and return to Earth.
  const handleMoonSiteClose = useCallback(() => {
    if (selectedMoonSite) {
      setSelectedMoonSite(null)
    } else {
      handleCameraScale('earth')
    }
  }, [selectedMoonSite, handleCameraScale])
  const handleMoonReturnHome = useCallback(() => {
    setSelectedMoonSite(null)
    handleCameraScale('earth')
  }, [handleCameraScale])
  const handleMoonFilterChange = useCallback((filter) => {
    globeRef.current?.setMoonFilter?.(filter)
  }, [])
  const handleMoonFlyTo = useCallback((siteId) => {
    globeRef.current?.flyToMoonSite?.(siteId)
  }, [])

  const startSkyCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      skyStreamRef.current = stream
      if (skyVideoRef.current) { skyVideoRef.current.srcObject = stream; await skyVideoRef.current.play().catch(() => {}) }
      globeRef.current?.enableSkyCamera?.(skyVideoRef.current)
      setSkyCamOn(true)
      return true
    } catch (e) {
      console.warn('[sky camera] unavailable:', e?.message || e)
      return false   // fall back to the starfield background
    }
  }, [])

  const stopSkyCamera = useCallback(() => {
    globeRef.current?.disableSkyCamera?.()
    if (skyStreamRef.current) { skyStreamRef.current.getTracks().forEach(t => t.stop()); skyStreamRef.current = null }
    if (skyVideoRef.current) skyVideoRef.current.srcObject = null
    setSkyCamOn(false)
  }, [])

  const handleARToggle = useCallback(async () => {
    if (arActive) {
      globeRef.current?.disableAR?.()
      globeRef.current?.disableSkyAlign?.()
      stopSkyCamera()
      setArActive(false)
      setSkyHeading(null)
      setSkyLocated(false)
      setArMsg(null)
      setSkyFlat(false)
      return
    }
    const res = await globeRef.current?.enableAR?.()
    if (res !== 'ok') {
      const m = (typeof res === 'string' && res.startsWith('err:')) ? res.slice(4).trim() : 'unknown'
      setArMsg(/denied|permission|notallowed/i.test(m)
        ? 'Motion access is blocked. iOS: Settings → Safari → Motion & Orientation Access (on), then tap again.'
        : 'Sky view couldn’t start: ' + m)
      return
    }
    setArActive(true)
    const deviceMode = !!globeRef.current?.isMobileAR?.()
    if (deviceMode) {
      setArMsg('Move your phone to look around the sky')
      // Location → lock the on-screen sky to your real sky (best-effort).
      const loc = await globeRef.current?.requestLocation?.()
      if (loc) globeRef.current?.enableSkyAlign?.()
      setSkyLocated(!!loc)
      // Live camera passthrough behind the overlay (best-effort).
      await startSkyCamera()
      // If no orientation events arrive, the browser is blocking the sensor.
      setTimeout(() => {
        if (globeRef.current?.hadMotionEvents?.() === false) {
          setArMsg('No motion detected — open the site in Safari/Chrome directly (in-app browsers block motion sensors).')
        }
      }, 1800)
    } else {
      setArMsg('Drag to look around the sky')
    }
  }, [arActive, startSkyCamera, stopSkyCamera])

  // Auto-dismiss the sky-view status message.
  useEffect(() => {
    if (!arMsg) return
    const t = setTimeout(() => setArMsg(null), 5200)
    return () => clearTimeout(t)
  }, [arMsg])

  // Poll the live RA/Dec the camera points at while exploring deep space.
  useEffect(() => {
    if (activeScale !== 'galaxy') return   // poll in galaxy mode (AR and free-look zoom)
    const fmtRA = (deg) => {
      const h = deg / 15, hh = Math.floor(h), mm = Math.floor((h - hh) * 60)
      return `${String(hh).padStart(2, '0')}h ${String(mm).padStart(2, '0')}m`
    }
    const fmtDec = (deg) => {
      const s = deg < 0 ? '-' : '+', a = Math.abs(deg), dd = Math.floor(a), mm = Math.floor((a - dd) * 60)
      return `${s}${String(dd).padStart(2, '0')}° ${String(mm).padStart(2, '0')}'`
    }
    const id = setInterval(() => {
      const hd = globeRef.current?.getGalaxyHeading?.()
      if (hd && typeof hd.ra === 'number') setSkyHeading({ raHms: fmtRA(hd.ra), decDms: fmtDec(hd.dec), target: hd.target || null })
      const tilt = globeRef.current?.getSkyTilt?.()      // null on desktop (mouse mode)
      setSkyFlat(typeof tilt === 'number' && tilt < 30)  // ~flat = on a desk / pointing down
      setSkyImgLoading(!!globeRef.current?.getSkyImgLoading?.())
    }, 250)
    return () => clearInterval(id)
  }, [arActive, activeScale])

  // Central reset: clears filter + returns camera to earth (used by DeepSpacePanel close)
  const handleClearFilter = useCallback(() => {
    setActiveFilter(null)
    setActiveScale('earth')
    globeRef.current?.setCameraScale?.('earth')
  }, [])

  const handleLocatePad = useCallback((launch) => {
    // From solar/moon/deep-space, return the camera to Earth first — flying
    // straight to the pad from another scale glitches the scene.
    const toEarth = activeScale !== 'earth'
    if (toEarth) {
      setActiveScale('earth')
      globeRef.current?.setCameraScale?.('earth')
    }
    if (launch?.pad_lat && launch?.pad_lon) {
      const fly = () => globeRef.current?.flyTo?.(launch.pad_lat, launch.pad_lon)
      if (toEarth) setTimeout(fly, 800)   // let the scale flight land, then swoop to the pad
      else fly()
    }
    setFocusedPad(launch)
    setReturnMission(launch)
    setLaunchPanelOpen(false)
    setSelectedIcao24(null)
    setTrackingId(null)
  }, [activeScale])

  const handleExitPadFocus = useCallback(() => {
    setFocusedPad(null)
    setReturnMission(prev => {
      if (prev) setLaunchPanelOpen(true)
      return prev
    })
  }, [])

  // Hide CommandCenter while launch panel is open or pad is focused
  const showCommandCenter = !selectedIcao24 && !launchPanelOpen && !focusedPad && activeFilter !== 'asteroids' && activeScale !== 'moon'

  return (
    <ErrorBoundary>
      {/* Keyframe for ping dot */}
      <style>{`
        @keyframes padPing {
          0%   { transform: scale(1);   opacity: 0.9; }
          70%  { transform: scale(3.5); opacity: 0; }
          100% { transform: scale(1);   opacity: 0; }
        }
      `}</style>

      {showLoading && <LoadingScreen duration={2500} onDone={() => setShowLoading(false)} />}

      {/* Camera passthrough source for Point-at-the-Sky AR. Rendered tiny/hidden —
          the frames are drawn by the WebGL renderer as the scene background
          (VideoTexture), so there's no DOM layering to break. */}
      <video
        ref={skyVideoRef}
        playsInline
        muted
        autoPlay
        style={{ position: 'fixed', bottom: 0, left: 0, width: 2, height: 2, opacity: 0.01, pointerEvents: 'none', zIndex: -1 }}
      />

      {showFlightLanding && init.selectedIcao24 && (
        <FlightLanding
          icao24={init.selectedIcao24}
          onEnable={() => {
            setShowFlightLanding(false)
            setLiveEnabled(true)
            setTrackingId(init.selectedIcao24)
          }}
        />
      )}

      {landing && (
        <ContextBanner
          icon={landing.kind === 'region' ? '🌍' : landing.kind === 'city' ? '🛫' : landing.kind === 'satellite' ? '🛰' : '✈'}
          label={
            landing.kind === 'airline' ? `${landing.name} — Live Flights`
            : landing.kind === 'route' ? `${landing.origin} → ${landing.dest}`
            : landing.kind === 'city'  ? `${landing.name} — Live Air Traffic`
            : landing.kind === 'satellite' ? `${landing.label} — Live Satellites`
            : `Flights over ${landing.name}`
          }
          sublabel={
            landing.kind === 'airline' ? `Filtering ${landing.prefix}··· callsigns`
            : landing.kind === 'route' ? 'Flight corridor on the 3D globe'
            : landing.kind === 'city'  ? 'Live arrivals & departures'
            : landing.kind === 'satellite' ? 'Pulsing markers · pinch to zoom out to see orbits'
            : 'Real-time ADS-B tracking'
          }
          count={landing.kind === 'airline' || landing.kind === 'satellite' ? aircraftWithShips.size : undefined}
          onClear={() => {
            setLanding(null)
            setFilters(prev => ({ ...prev, airline: null, satName: null, type: 'all' }))
            globeRef.current?.drawTrail?.([])
            setSelectedAirport(null)
          }}
        />
      )}
      <BetaWelcome />

      {/* Nudge first-time visitors to turn Live on so the Earth view fills with data */}
      <LiveNudge
        visible={activeScale === 'earth' && !liveEnabled && !showLoading && !showFlightLanding && !selectedIcao24 && !focusedPad && !landing}
        onGoLive={() => setLiveEnabled(true)}
      />

      {init.notFound && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(5,10,15,0.95)', backdropFilter: 'blur(20px)',
          fontFamily: 'var(--font-body)', color: '#fff', textAlign: 'center', padding: 32,
        }}>
          <p style={{ fontSize: 64, fontWeight: 700, fontFamily: 'var(--font-display)', color: '#b2ff1a', margin: 0 }}>404</p>
          <p style={{ fontSize: 18, color: 'rgba(200,210,225,0.7)', marginTop: 8 }}>Page not found</p>
          <p style={{ fontSize: 13, color: 'rgba(200,210,225,0.4)', maxWidth: 400, marginTop: 12 }}>
            The page <code style={{ color: '#b2ff1a' }}>{window.location.pathname}</code> doesn't exist.
          </p>
          <button
            onClick={() => { window.location.href = '/' }}
            style={{
              marginTop: 24, padding: '10px 28px', border: '1px solid rgba(178,255,26,0.3)',
              borderRadius: 8, background: 'rgba(178,255,26,0.08)', color: '#b2ff1a',
              fontFamily: 'var(--font-mono)', fontSize: 13, cursor: 'pointer',
            }}
          >
            Go Home
          </button>
        </div>
      )}

      {authModalOpen && (
        <AuthModal
          onClose={() => setAuthModalOpen(false)}
          onLogin={login}
          onRegister={register}
          onGoogleLogin={googleLogin}
        />
      )}

      {sessionError && !errorDismissed && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: 'rgba(180, 40, 40, 0.92)', backdropFilter: 'blur(12px)',
          color: '#fff', fontFamily: 'var(--font-mono, monospace)', fontSize: 12,
          padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
          borderBottom: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}>
          <span style={{ flex: 1, lineHeight: 1.4 }}>
            {sessionError === 'network'
              ? "Can't reach ObjectTracer server. Your DNS, ad-blocker, or network may be blocking it. Try a different network, switch DNS to 1.1.1.1 or 8.8.8.8, or disable blockers for this site."
              : "Server error creating session. Retrying automatically…"}
          </span>
          <button
            onClick={() => setErrorDismissed(true)}
            style={{
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
              color: '#fff', padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 11,
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Bottom navigation bar ── */}
      <BottomBar
        activeFilter={activeFilter}
        onActiveFilterChange={setActiveFilter}
        onFiltersChange={setFilters}
        activeScale={activeScale}
        onScaleChange={handleCameraScale}
        onSearchOpen={() => setSearchOpen(true)}
        onLaunchPanelToggle={() => setLaunchPanelOpen(o => !o)}
        liveEnabled={liveEnabled}
        onLiveToggle={() => setLiveEnabled(v => !v)}
        connectionStatus={connectionStatus}
        audioMuted={audio.muted}
        onAudioToggle={audio.toggle}
        trackedFlights={pins.trackedFlights}
        showWeather={showWeather}
        onWeatherToggle={() => setShowWeather(v => !v)}
        hidden={focusedPad}
      />

      {/* ── Top-left pages pill ── */}
      <PagesPill
        activeScale={activeScale}
        activeFilter={activeFilter}
        activePage={activePage}
        onScaleChange={(s) => { setActivePage(null); handleCameraScale(s) }}
        onActiveFilterChange={(f) => { setActivePage(null); setActiveFilter(f) }}
        onFiltersChange={setFilters}
        onLaunchPanelToggle={() => { setActivePage(null); setLaunchPanelOpen(o => !o) }}
        onPageOpen={setActivePage}
        overPage={!!activePage}
        hidden={focusedPad}
      />

      {/* ── Top-right profile + menu pill ── */}
      <TopRightPill
        isAuthenticated={isAuthenticated}
        user={user}
        onSignIn={() => setAuthModalOpen(true)}
        onSignOut={logout}
        onProfileOpen={() => setProfilePanelOpen(true)}
        onPageOpen={setActivePage}
        hidden={focusedPad}
      />

      <Globe
        ref={globeRef}
        aircraft={globeAircraft}
        selectedId={selectedIcao24}
        onAircraftClick={focusedPad ? null : handleAircraftClick}
        onViewportChange={setBounds}
        trackingId={trackingId}
        solarData={solarData}
        padMarker={focusedPad?.pad_lat && focusedPad?.pad_lon ? { lat: focusedPad.pad_lat, lon: focusedPad.pad_lon } : null}
        onInteract={handleGlobeInteract}
        onPlanetClick={handlePlanetClick}
        onAirportClick={handleAirportClick}
        onSkyObjectClick={handleSkyObjectClick}
        onMoonSiteClick={handleMoonSiteClick}
        neoData={asteroids}
        onZoomChange={setZoomedIn}
        onScaleReady={handleScaleReady}
        mobilePanel={!!selectedIcao24}
        showWeather={showWeather}
      />

      <CommandCenterOverlay
        trackedCount={aircraftWithShips.size}
        connectionStatus={connectionStatus}
        issData={aircraft.get('ISS') ?? null}
        pinnedLaunch={pinnedLaunch}
        onUnpinLaunch={() => pinnedLaunch && pins.unpinLaunch(pinnedLaunch.id)}
        forceCollapsed={streamCollapsed}
        onISSLink={{
          flyTo:     (lat, lon) => globeRef.current?.flyTo?.(lat, lon),
          selectISS: ()         => setSelectedIcao24('ISS'),
          trackISS:  ()         => setTrackingId('ISS'),
        }}
        activeFilter={activeFilter}
        onFiltersChange={setFilters}
        onCameraScale={handleCameraScale}
        onActiveFilterChange={setActiveFilter}
        onLaunchPanelToggle={() => setLaunchPanelOpen(o => !o)}
        zoomedIn={zoomedIn}
        hidden={!showCommandCenter}
        activeScale={activeScale}
        onDistanceChange={(minZ, maxZ) => globeRef.current?.setDistanceRange?.(minZ, maxZ)}
        liveEnabled={liveEnabled}
        onLiveToggle={() => setLiveEnabled(v => !v)}
        onSearchOpen={() => setSearchOpen(true)}
        audioMuted={audio.muted}
        onAudioToggle={audio.toggle}
        trackedFlights={pins.trackedFlights}
      />

      {/* OrbitalMapBar removed — filters in BottomBar + CommandCenterOverlay */}

      <DeepSpacePanel open={!focusedPad && activeFilter === 'asteroids'} onClose={handleClearFilter} />

      {!focusedPad && (
        <SearchBar
          open={searchOpen}
          onOpen={() => setSearchOpen(true)}
          onClose={() => setSearchOpen(false)}
          onSelect={handleSearchSelect}
          activeScale={activeScale}
        />
      )}

      <LaunchPanel
        open={launchPanelOpen}
        onClose={() => { setLaunchPanelOpen(false); setReturnMission(null) }}
        onLocatePad={handleLocatePad}
        pinnedLaunchId={pinnedLaunch?.id ?? null}
        onPinLaunch={handlePinLaunch}
        openToMission={returnMission}
        viewerCounts={viewerCounts}
        watchObject={watchObject}
      />

      <ProfilePanel
        open={profilePanelOpen}
        onClose={() => setProfilePanelOpen(false)}
        user={user}
        trackedFlights={pins.trackedFlights}
        pinnedLaunches={pins.pinnedLaunches}
        onSelectFlight={(icao24) => {
          openedFromProfileRef.current = true
          setSelectedIcao24(icao24)
          setTrackingId(icao24)
          setProfilePanelOpen(false)
          // Auto-enable live so telemetry appears in the detail panel
          setLiveEnabled(prev => {
            if (!prev) { setLiveToast(true); setTimeout(() => setLiveToast(false), 3000) }
            return true
          })
        }}
        onUntrackFlight={(icao24) => pins.untrackFlight(icao24)}
        onUnpinLaunch={(id) => pins.unpinLaunch(id)}
        onSelectLaunch={(launch) => {
          setReturnMission(launch.id || launch.launch_id || launch)
          setLaunchPanelOpen(true)
          setProfilePanelOpen(false)
        }}
        liveAircraft={aircraftWithShips}
        onSignOut={logout}
      />

      {focusedPad && (
        <PadFocusBadge launch={focusedPad} onExit={handleExitPadFocus} />
      )}

      {selectedIcao24 && !focusedPad && (
        <DetailPanel
          icao24={selectedIcao24}
          liveData={aircraftWithShips.get(selectedIcao24)}
          onClose={handlePanelClose}
          onTrailData={handleTrailData}
          isAuthenticated={isAuthenticated}
          sessionToken={sessionToken}
          isTracking={trackingId === selectedIcao24}
          onTrack={setTrackingId}
          onFitRoute={(routeData) => globeRef.current?.fitRoute?.(routeData)}
          isSaved={pins.isFlightTracked(selectedIcao24)}
          onSignIn={() => setAuthModalOpen(true)}
          onToggleSave={(f) => {
            if (pins.isFlightTracked(f.icao24)) pins.untrackFlight(f.icao24)
            else pins.trackFlight(f)
          }}
          viewerCount={viewerCounts[selectedIcao24] || 0}
          watchObject={watchObject}
        />
      )}

      {selectedAirport && !selectedIcao24 && (
        <AirportPanel
          iata={selectedAirport}
          onClose={handleAirportClose}
          onFlightClick={handleAircraftClick}
        />
      )}

      {selectedPlanet && activeScale === 'solar' && (
        <PlanetPanel
          planet={selectedPlanet}
          onClose={handlePlanetClose}
          onFocus={() => globeRef.current?.flyToPlanet?.(selectedPlanet)}
        />
      )}

      {selectedSkyObject && activeScale === 'galaxy' && (
        <SkyObjectPanel
          skyObject={selectedSkyObject}
          onClose={handleSkyObjectClose}
        />
      )}

      {activeScale === 'galaxy' && selectedGalaxy && (
        <GalaxyPanel
          galaxy={selectedGalaxy}
          onClose={handleGalaxyClose}
        />
      )}

      {activeScale === 'galaxy' && (
        <GalaxyConeView
          expanded={coneExpanded}
          onToggle={() => setConeExpanded(v => !v)}
        />
      )}

      {/* Distance filter now integrated into CommandCenterOverlay bottom bar */}

      {scaleReady === 'galaxy' && !selectedGalaxy && !selectedSkyObject && !guideHidden && (
        <DeepSpaceGuide onClose={() => setGuideHidden(true)} />
      )}

      {activeScale === 'moon' && (
        <MoonPanel
          site={selectedMoonSite}
          onClose={handleMoonSiteClose}
          onReturnHome={handleMoonReturnHome}
          onFlyTo={handleMoonFlyTo}
          onFilterChange={handleMoonFilterChange}
        />
      )}

      {activeScale === 'galaxy' && (
        <button
          onClick={handleARToggle}
          style={{
            position: 'fixed', bottom: 88, left: '50%', transform: 'translateX(-50%)',
            zIndex: 200, display: 'flex', alignItems: 'center', gap: 8,
            background: arActive ? 'rgba(178,255,26,0.18)' : 'rgba(6,12,18,0.85)',
            backdropFilter: 'blur(16px)',
            border: `1px solid ${arActive ? 'rgba(178,255,26,0.5)' : 'rgba(178,255,26,0.2)'}`,
            borderRadius: 12, padding: '10px 20px', cursor: 'pointer',
            color: arActive ? '#b2ff1a' : 'rgba(195,245,255,0.7)',
            fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            boxShadow: arActive ? '0 0 30px rgba(178,255,26,0.15)' : 'none',
            transition: 'all 0.2s ease',
          }}
        >
          {(() => {
            const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0
            if (isMobile) return arActive ? 'Exit Sky View' : 'Point at the Sky'
            return arActive ? 'Exit Free Look' : 'Free Look'
          })()}
        </button>
      )}

      {activeScale === 'galaxy' && (
        <SkyReticle active={arActive && !skyFlat} heading={skyHeading} located={skyLocated} />
      )}

      {activeScale === 'galaxy' && skyImgLoading && (
        <div style={{
          position: 'fixed', top: 'calc(50% + 44px)', left: '50%', transform: 'translateX(-50%)',
          zIndex: 201, fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.1em',
          color: 'rgba(178,255,26,0.85)', background: 'rgba(6,12,18,0.7)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(178,255,26,0.2)', borderRadius: 999, padding: '5px 12px', pointerEvents: 'none',
        }}>
          ◌ loading sky imagery…
        </div>
      )}

      {activeScale === 'galaxy' && arActive && skyFlat && (
        <div style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          zIndex: 201, maxWidth: 'min(80vw, 320px)', textAlign: 'center',
          background: 'rgba(6,12,18,0.9)', backdropFilter: 'blur(14px)',
          border: '1px solid rgba(178,255,26,0.3)', borderRadius: 14,
          padding: '16px 20px', color: 'rgba(220,230,245,0.95)',
          fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.5,
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontSize: 26, marginBottom: 6 }}>📱↑</div>
          Lift your phone toward the sky to look around
        </div>
      )}

      {activeScale === 'galaxy' && arActive && skyLocated && (
        <button
          onClick={() => {
            const ok = globeRef.current?.calibrateOnMoon?.()
            setArMsg(ok ? 'Aligned to the Moon ✓' : 'Point the centre at the Moon (it must be up), then tap Align')
          }}
          style={{
            position: 'fixed', bottom: 90, right: 14, zIndex: 201,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(6,12,18,0.85)', backdropFilter: 'blur(14px)',
            border: '1px solid rgba(178,255,26,0.3)', borderRadius: 11,
            padding: '9px 13px', cursor: 'pointer', color: '#b2ff1a',
            fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.06em', textTransform: 'uppercase',
          }}
        >
          ◐ Align on Moon
        </button>
      )}

      {activeScale === 'galaxy' && arMsg && (
        <div style={{
          position: 'fixed', bottom: 140, left: '50%', transform: 'translateX(-50%)',
          zIndex: 201, maxWidth: 'min(86vw, 420px)', textAlign: 'center',
          background: 'rgba(6,12,18,0.92)', backdropFilter: 'blur(14px)',
          border: '1px solid rgba(178,255,26,0.25)', borderRadius: 12,
          padding: '10px 16px', color: 'rgba(215,225,240,0.92)',
          fontFamily: 'var(--font-body)', fontSize: 12.5, lineHeight: 1.5,
          boxShadow: '0 10px 36px rgba(0,0,0,0.5)',
        }}>
          {arMsg}
        </div>
      )}

      {/* ── Static pages ── */}
      {activePage === 'about' && <AboutPage onClose={() => setActivePage(null)} />}
      {activePage === 'contact' && <ContactPage onClose={() => setActivePage(null)} />}
      {activePage === 'faq' && <FAQPage onClose={() => setActivePage(null)} />}
      {activePage === 'donate' && <DonatePage onClose={() => setActivePage(null)} />}
      {activePage === 'waitlist' && <WaitlistPage onClose={() => setActivePage(null)} />}
      {activePage === 'blog' && <BlogPage onClose={() => setActivePage(null)} initialSlug={init.blogSlug} />}
      {activePage === 'flight' && (
        <FlightPage
          initialAirport={init.flightAirport}
          onAirportChange={setFlightApt}
          onClose={() => { setActivePage(null); setFlightApt(null) }}
          onFlightClick={handleTrackFromFlightPage}
          onOpenAirport={(iata) => { setActivePage(null); setFlightApt(null); setSelectedAirport(iata) }}
        />
      )}
      {activePage === 'planes' && (
        <PlanesPage
          onClose={() => setActivePage(null)}
          onFlightClick={handleTrackFromFlightPage}
        />
      )}
      {activePage === 'admin' && (
        <AdminPage
          onClose={() => setActivePage(null)}
          isAuthenticated={isAuthenticated}
          sessionToken={sessionToken}
          onSignIn={() => setAuthModalOpen(true)}
        />
      )}

      {/* Audio now integrated into BottomBar */}
      <WaitlistPopup />
      <TourGuide />
      {pwa.showPrompt && <PWABanner onInstall={pwa.install} onDismiss={pwa.dismiss} />}

      <SiteFooter active={!activePage && !selectedIcao24 && !selectedAirport && !launchPanelOpen && !profilePanelOpen && !focusedPad && !searchOpen} />

      {/* ── Locate me: geolocate + smooth-zoom to ~100 km above your location ── */}
      {!activePage && !focusedPad && (
        <button
          onClick={handleLocate}
          title="Zoom to my location"
          aria-label="Zoom to my location"
          style={{
            position: 'fixed', left: 16, bottom: 118, zIndex: 690,
            width: 40, height: 40, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(8,12,18,0.92)', backdropFilter: 'blur(14px)',
            border: `1px solid ${locating ? 'rgba(178,255,26,0.6)' : 'rgba(178,255,26,0.22)'}`,
            color: locating ? '#b2ff1a' : 'rgba(195,245,255,0.75)',
            cursor: 'pointer', boxShadow: '0 4px 18px rgba(0,0,0,0.4)',
            transition: 'border-color 0.2s, color 0.2s',
            animation: locating ? 'padPing 1.2s ease-in-out infinite' : 'none',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
        </button>
      )}

      {!activePage && !focusedPad && locateMsg && (
        <div style={{
          position: 'fixed', left: 64, bottom: 72, zIndex: 690, maxWidth: 'min(70vw, 280px)',
          background: 'rgba(8,12,18,0.94)', backdropFilter: 'blur(14px)',
          border: '1px solid rgba(178,255,26,0.25)', borderRadius: 10,
          padding: '8px 12px', color: 'rgba(215,235,245,0.92)',
          fontFamily: 'var(--font-body)', fontSize: 12, lineHeight: 1.4,
          boxShadow: '0 6px 22px rgba(0,0,0,0.5)',
        }}>
          {locateMsg}
        </div>
      )}

      {showWeather && activeScale === 'earth' && <WindLegend />}

      {liveToast && (
        <>
          <style>{`
            @keyframes liveToastIn {
              0%   { opacity: 0; transform: translateX(-50%) translateY(16px) scale(0.9); }
              60%  { opacity: 1; transform: translateX(-50%) translateY(-4px) scale(1.02); }
              100% { opacity: 1; transform: translateX(-50%) translateY(0)    scale(1); }
            }
            @keyframes liveSpin {
              to { transform: rotate(360deg); }
            }
            @keyframes livePulse {
              0%, 100% { box-shadow: 0 0 6px #b2ff1a, 0 0 0 0 rgba(178,255,26,0.4); }
              50%       { box-shadow: 0 0 10px #b2ff1a, 0 0 12px 4px rgba(178,255,26,0.15); }
            }
          `}</style>
          <div style={{
            position: 'fixed', bottom: 96, left: '50%',
            zIndex: 9000, display: 'flex', alignItems: 'center', gap: 12,
            background: 'rgba(6,12,18,0.88)', backdropFilter: 'blur(20px)',
            border: '1px solid rgba(178,255,26,0.35)', borderRadius: 100,
            padding: '10px 20px 10px 12px',
            boxShadow: '0 4px 32px rgba(0,0,0,0.5), 0 0 20px rgba(178,255,26,0.1)',
            animation: 'liveToastIn 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards',
          }}>
            {/* Spinner ring */}
            <div style={{ position: 'relative', width: 22, height: 22, flexShrink: 0 }}>
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                border: '2px solid rgba(178,255,26,0.12)',
              }} />
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                border: '2px solid transparent',
                borderTopColor: '#b2ff1a',
                animation: 'liveSpin 0.8s linear infinite',
              }} />
              {/* Center dot */}
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%,-50%)',
                width: 6, height: 6, borderRadius: '50%', background: '#b2ff1a',
                animation: 'livePulse 1.2s ease infinite',
              }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 11,
                color: '#b2ff1a', letterSpacing: '0.12em', textTransform: 'uppercase',
              }}>Live Tracking</span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 10,
                color: 'rgba(200,220,240,0.45)', letterSpacing: '0.06em',
              }}>Connecting to ADS-B feed…</span>
            </div>
          </div>
        </>
      )}
    </ErrorBoundary>
  )
}