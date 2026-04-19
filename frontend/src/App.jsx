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
import FilterRail from './components/FilterRail/FilterRail'
import LaunchPanel from './components/LaunchPanel/LaunchPanel'
import ProfilePanel from './components/ProfilePanel/ProfilePanel'
import HUD from './components/HUD/HUD'
import StatusBar from './components/StatusBar/StatusBar'
import CommandCenterOverlay from './components/CommandCenterOverlay/CommandCenterOverlay'
import DeepSpacePanel from './components/DeepSpacePanel/DeepSpacePanel'
import OrbitalMapBar from './components/OrbitalMapBar/OrbitalMapBar'
import PlanetPanel from './components/PlanetPanel/PlanetPanel'
import AirportPanel from './components/AirportPanel/AirportPanel'
import SkyObjectPanel from './components/SkyObjectPanel/SkyObjectPanel'
import MoonPanel from './components/MoonPanel/MoonPanel'
import WaitlistPopup from './components/WaitlistPopup/WaitlistPopup'
import TourGuide from './components/TourGuide/TourGuide'
import BetaWelcome from './components/BetaWelcome/BetaWelcome'
import AuthModal from './components/Auth/AuthModal'
import { useSession } from './hooks/useSession'
import { useAircraft } from './hooks/useAircraft'
import { useAsteroids } from './hooks/useAsteroids'
import { usePins } from './hooks/usePins'

// ── Pad Focus Badge ───────────────────────────────────────────────────────────
function PadFocusBadge({ launch, onExit }) {
  const lat = launch.pad_lat, lon = launch.pad_lon
  const latStr = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}`
  const lonStr = `${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'W'}`

  return (
    <div style={{
      position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
      zIndex: 200, display: 'flex', alignItems: 'center', gap: 16,
      background: 'rgba(6,12,18,0.88)', backdropFilter: 'blur(18px)',
      border: '1px solid rgba(0,229,255,0.3)', borderRadius: 12,
      padding: '12px 20px', boxShadow: '0 0 40px rgba(0,229,255,0.12)',
    }}>
      {/* Pulsing ping dot */}
      <div style={{ position: 'relative', width: 12, height: 12, flexShrink: 0 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: '#00e5ff', animation: 'padPing 1.6s ease-out infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%', background: '#00e5ff',
        }} />
      </div>

      <div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase',
          letterSpacing: '0.1em', color: 'rgba(0,229,255,0.6)', marginBottom: 3 }}>
          Launch Pad · Locked
        </p>
        <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14,
          color: '#fff', marginBottom: 2 }}>
          {launch.pad || (launch.mission_name || launch.name)}
        </p>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(195,245,255,0.5)' }}>
          {latStr} · {lonStr}
        </p>
      </div>

      <button onClick={onExit} style={{
        background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.2)',
        borderRadius: 8, color: 'rgba(0,229,255,0.7)', fontFamily: 'var(--font-mono)',
        fontSize: 11, padding: '6px 14px', cursor: 'pointer', whiteSpace: 'nowrap',
        letterSpacing: '0.06em',
      }}>
        ✕ Exit
      </button>
    </div>
  )
}

// ── URL ↔ State helpers ────────────────────────────────────────────────────
function parseInitialState(pathname) {
  if (pathname.startsWith('/flight/')) {
    return { selectedIcao24: pathname.replace('/flight/', ''), activeScale: 'earth', launchPanelOpen: false, activeFilter: null, profilePanelOpen: false }
  }
  if (pathname === '/profile')      return { selectedIcao24: null, activeScale: 'earth',  launchPanelOpen: false, activeFilter: null, profilePanelOpen: true }
  if (pathname === '/solar-system') return { selectedIcao24: null, activeScale: 'solar',  launchPanelOpen: false, activeFilter: null, profilePanelOpen: false }
  if (pathname === '/deep-space')   return { selectedIcao24: null, activeScale: 'galaxy', launchPanelOpen: false, activeFilter: null, profilePanelOpen: false }
  if (pathname === '/moon')         return { selectedIcao24: null, activeScale: 'moon',   launchPanelOpen: false, activeFilter: null, profilePanelOpen: false }
  if (pathname === '/launches')     return { selectedIcao24: null, activeScale: 'earth',  launchPanelOpen: true,  activeFilter: null, profilePanelOpen: false }
  if (pathname === '/asteroids')    return { selectedIcao24: null, activeScale: 'earth',  launchPanelOpen: false, activeFilter: 'asteroids', profilePanelOpen: false }
  return                                   { selectedIcao24: null, activeScale: 'earth',  launchPanelOpen: false, activeFilter: null, profilePanelOpen: false }
}

function stateToPath(selectedIcao24, activeScale, launchPanelOpen, activeFilter, profilePanelOpen) {
  if (selectedIcao24)             return `/flight/${selectedIcao24}`
  if (profilePanelOpen)           return '/profile'
  if (activeFilter === 'asteroids') return '/asteroids'
  if (launchPanelOpen)            return '/launches'
  if (activeScale === 'solar')    return '/solar-system'
  if (activeScale === 'galaxy')   return '/deep-space'
  if (activeScale === 'moon')     return '/moon'
  return '/'
}

export default function App() {
  const { sessionToken, isAuthenticated, user, sessionError, login, register, logout } = useSession()
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [errorDismissed, setErrorDismissed] = useState(false)
  const [liveEnabled, setLiveEnabled] = useState(false)
  const { filteredAircraft, setFilters, connectionStatus, setBounds, solarData } = useAircraft(sessionToken, liveEnabled)

  // Initialise from URL on first render
  const init = parseInitialState(window.location.pathname)

  const [selectedIcao24, setSelectedIcao24] = useState(init.selectedIcao24)
  const [searchOpen, setSearchOpen]         = useState(false)
  const [trackingId, setTrackingId]         = useState(null)
  const [launchPanelOpen, setLaunchPanelOpen] = useState(init.launchPanelOpen)
  const [profilePanelOpen, setProfilePanelOpen] = useState(init.profilePanelOpen)
  const [cameraInfo]                        = useState({ altM: null, lat: null, lon: null, scaleLabel: '' })
  const [activeScale, setActiveScale]       = useState(init.activeScale)

  const { asteroids } = useAsteroids(activeScale === 'solar')
  const [activeFilter, setActiveFilter]     = useState(init.activeFilter)
  const [zoomedIn, setZoomedIn]             = useState(false)
  const [sidebarOpen, setSidebarOpen]       = useState(false)
  const [selectedPlanet, setSelectedPlanet] = useState(null)
  const [selectedAirport, setSelectedAirport] = useState(null)
  const [selectedSkyObject, setSelectedSkyObject] = useState(null)
  const [selectedMoonSite, setSelectedMoonSite] = useState(null)
  const [focusedPad, setFocusedPad]         = useState(null)
  const pins = usePins(isAuthenticated, sessionToken)
  // The CommandCenterOverlay shows ONE pinned launch. We display the most
  // recently pinned one (last in the list).
  const lastPin = pins.pinnedLaunches[pins.pinnedLaunches.length - 1] || null
  const pinnedLaunch = lastPin ? (lastPin._full || {
    id: lastPin.launch_id,
    mission_name: lastPin.name,
    name: lastPin.name,
    net: lastPin.net_time,
  }) : null
  const handlePinLaunch = useCallback((launch) => {
    if (launch) pins.pinLaunch(launch)
    else if (pinnedLaunch) pins.unpinLaunch(pinnedLaunch.id)
  }, [pins, pinnedLaunch])
  const [returnMission, setReturnMission]   = useState(null)
  const [streamCollapsed, setStreamCollapsed] = useState(false)
  const [arActive, setArActive] = useState(false)
  const collapseTimerRef = useRef(null)
  const globeRef = useRef(null)

  const handleGlobeInteract = useCallback(() => {
    setStreamCollapsed(true)
    clearTimeout(collapseTimerRef.current)
    collapseTimerRef.current = setTimeout(() => setStreamCollapsed(false), 3000)
  }, [])

  // Sync state → URL (replaceState only — no React Router re-renders)
  useEffect(() => {
    const path = stateToPath(selectedIcao24, activeScale, launchPanelOpen, activeFilter, profilePanelOpen)
    if (window.location.pathname === path) return
    window.history.replaceState(null, '', path)
  }, [selectedIcao24, activeScale, launchPanelOpen, activeFilter, profilePanelOpen])

const aircraftWithShips = useMemo(() => new Map(filteredAircraft), [filteredAircraft])

  // In pad-focus mode pass an empty map so the globe is clean
  const globeAircraft = useMemo(
    () => focusedPad ? new Map() : aircraftWithShips,
    [focusedPad, aircraftWithShips]
  )

  const handleAircraftClick = useCallback((icao24) => {
    setSelectedIcao24(icao24)
  }, [])

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
    setSelectedIcao24(result.icao24)
    setSearchOpen(false)
  }, [])

  const handleTrailData = useCallback((trailPoints, routeData) => {
    globeRef.current?.drawTrail?.(trailPoints, routeData)
  }, [])

  const handleCameraScale = useCallback((scale) => {
    setActiveScale(scale)
    globeRef.current?.setCameraScale?.(scale)
    // Disable AR when leaving galaxy scale
    if (scale !== 'galaxy' && arActive) {
      globeRef.current?.disableAR?.()
      setArActive(false)
    }
  }, [arActive])

  const handlePlanetClick = useCallback((name) => setSelectedPlanet(name), [])
  const handlePlanetClose = useCallback(() => setSelectedPlanet(null), [])
  const handleAirportClick = useCallback((iata) => setSelectedAirport(iata), [])
  const handleAirportClose = useCallback(() => setSelectedAirport(null), [])
  const handleSkyObjectClick = useCallback((obj) => setSelectedSkyObject(obj), [])
  const handleSkyObjectClose = useCallback(() => setSelectedSkyObject(null), [])
  const handleMoonSiteClick = useCallback((site) => setSelectedMoonSite(site), [])
  // Smart close: if a site is open, go back to Moon overview; otherwise exit
  // Moon scale entirely and return to Earth.
  const handleMoonSiteClose = useCallback(() => {
    if (selectedMoonSite) {
      setSelectedMoonSite(null)
    } else {
      setActiveScale('earth')
      globeRef.current?.setCameraScale?.('earth')
    }
  }, [selectedMoonSite])
  const handleMoonReturnHome = useCallback(() => {
    setSelectedMoonSite(null)
    setActiveScale('earth')
    globeRef.current?.setCameraScale?.('earth')
  }, [])
  const handleMoonFilterChange = useCallback((filter) => {
    globeRef.current?.setMoonFilter?.(filter)
  }, [])
  const handleMoonFlyTo = useCallback((siteId) => {
    globeRef.current?.flyToMoonSite?.(siteId)
  }, [])

  const handleARToggle = useCallback(async () => {
    if (arActive) {
      globeRef.current?.disableAR?.()
      setArActive(false)
    } else {
      const ok = await globeRef.current?.enableAR?.()
      if (ok) setArActive(true)
    }
  }, [arActive])

  // Central reset: clears filter + returns camera to earth (used by DeepSpacePanel close)
  const handleClearFilter = useCallback(() => {
    setActiveFilter(null)
    setActiveScale('earth')
    globeRef.current?.setCameraScale?.('earth')
  }, [])

  const handleLocatePad = useCallback((launch) => {
    if (launch?.pad_lat && launch?.pad_lon) {
      globeRef.current?.flyTo?.(launch.pad_lat, launch.pad_lon)
    }
    setFocusedPad(launch)
    setReturnMission(launch)
    setLaunchPanelOpen(false)
    setSelectedIcao24(null)
    setTrackingId(null)
  }, [])

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
        /* Profile button now embedded inside StatusBar notch */
      `}</style>

      <BetaWelcome />

      {/* ProfileButton now lives inside <StatusBar /> */}

      {authModalOpen && (
        <AuthModal
          onClose={() => setAuthModalOpen(false)}
          onLogin={login}
          onRegister={register}
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
              ? "Can't reach flightspace server. Your DNS, ad-blocker, or network may be blocking it. Try a different network, switch DNS to 1.1.1.1 or 8.8.8.8, or disable blockers for this site."
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

      {!focusedPad && (
        <StatusBar
          connectionStatus={connectionStatus}
          activeScale={activeScale}
          onScaleChange={handleCameraScale}
          onSearchOpen={() => setSearchOpen(true)}
          liveEnabled={liveEnabled}
          onLiveToggle={() => setLiveEnabled(v => !v)}
          trackedCount={aircraftWithShips.size}
          isAuthenticated={isAuthenticated}
          user={user}
          onSignIn={() => setAuthModalOpen(true)}
          onSignOut={logout}
          trackedFlights={pins.trackedFlights}
          pinnedLaunches={pins.pinnedLaunches}
          onSelectFlight={(icao24) => { setSelectedIcao24(icao24); setTrackingId(icao24); setProfilePanelOpen(false) }}
          onUntrackFlight={(icao24) => pins.untrackFlight(icao24)}
          onUnpinLaunch={(id) => pins.unpinLaunch(id)}
          onProfileOpen={() => setProfilePanelOpen(true)}
        />
      )}

      {!focusedPad && (
        <HUD
          trackedCount={aircraftWithShips.size}
          connectionStatus={connectionStatus}
          zoomedIn={zoomedIn}
          cameraAltM={cameraInfo.altM}
          cameraLat={cameraInfo.lat}
          cameraLon={cameraInfo.lon}
          scaleLabel={cameraInfo.scaleLabel}
        />
      )}

      {!focusedPad && (
        <FilterRail
          onFiltersChange={setFilters}
          onCameraScale={handleCameraScale}
          onLaunchPanelToggle={() => setLaunchPanelOpen(o => !o)}
          launchPanelOpen={launchPanelOpen}
          onActiveFilterChange={setActiveFilter}
          activeFilter={activeFilter}
          sidebarOpen={sidebarOpen}
          onSidebarToggle={() => setSidebarOpen(o => !o)}
        />
      )}

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
        mobilePanel={!!selectedIcao24}
      />

      <CommandCenterOverlay
        trackedCount={aircraftWithShips.size}
        connectionStatus={connectionStatus}
        issData={aircraftWithShips.get('ISS') ?? null}
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
      />

      {!focusedPad && (
        <OrbitalMapBar
          onFiltersChange={setFilters}
          onCameraScale={handleCameraScale}
          onActiveFilterChange={setActiveFilter}
          onLaunchPanelToggle={() => setLaunchPanelOpen(o => !o)}
          activeFilter={activeFilter}
        />
      )}

      <DeepSpacePanel open={!focusedPad && activeFilter === 'asteroids'} onClose={handleClearFilter} />

      {!focusedPad && (
        <SearchBar
          open={searchOpen}
          onOpen={() => setSearchOpen(true)}
          onClose={() => setSearchOpen(false)}
          onSelect={handleSearchSelect}
          sessionToken={sessionToken}
        />
      )}

      <LaunchPanel
        open={launchPanelOpen}
        onClose={() => { setLaunchPanelOpen(false); setReturnMission(null) }}
        onLocatePad={handleLocatePad}
        pinnedLaunchId={pinnedLaunch?.id ?? null}
        onPinLaunch={handlePinLaunch}
        openToMission={returnMission}
      />

      <ProfilePanel
        open={profilePanelOpen}
        onClose={() => setProfilePanelOpen(false)}
        user={user}
        trackedFlights={pins.trackedFlights}
        pinnedLaunches={pins.pinnedLaunches}
        onSelectFlight={(icao24) => { openedFromProfileRef.current = true; setSelectedIcao24(icao24); setTrackingId(icao24); setProfilePanelOpen(false) }}
        onUntrackFlight={(icao24) => pins.untrackFlight(icao24)}
        onUnpinLaunch={(id) => pins.unpinLaunch(id)}
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
          onToggleSave={(f) => {
            if (pins.isFlightTracked(f.icao24)) pins.untrackFlight(f.icao24)
            else pins.trackFlight(f)
          }}
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
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            zIndex: 200, display: 'flex', alignItems: 'center', gap: 8,
            background: arActive ? 'rgba(0,229,255,0.18)' : 'rgba(6,12,18,0.85)',
            backdropFilter: 'blur(16px)',
            border: `1px solid ${arActive ? 'rgba(0,229,255,0.5)' : 'rgba(0,229,255,0.2)'}`,
            borderRadius: 12, padding: '10px 20px', cursor: 'pointer',
            color: arActive ? '#00e5ff' : 'rgba(195,245,255,0.7)',
            fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            boxShadow: arActive ? '0 0 30px rgba(0,229,255,0.15)' : 'none',
            transition: 'all 0.2s ease',
          }}
        >
          {arActive ? 'Exit Free Look' : 'Free Look'}
        </button>
      )}

      <WaitlistPopup />
      <TourGuide />
    </ErrorBoundary>
  )
}