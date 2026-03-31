import { useState, useCallback, useRef, useMemo, lazy, Suspense, Component, useEffect, useTransition } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

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
const Globe = lazy(() =>
  import('./components/Globe/Globe').then(m => ({ default: m.Globe }))
)
import DetailPanel from './components/DetailPanel/DetailPanel'
import SearchBar from './components/SearchBar/SearchBar'
import FilterRail from './components/FilterRail/FilterRail'
import LaunchPanel from './components/LaunchPanel/LaunchPanel'
import HUD from './components/HUD/HUD'
import StatusBar from './components/StatusBar/StatusBar'
import CommandCenterOverlay from './components/CommandCenterOverlay/CommandCenterOverlay'
import DeepSpacePanel from './components/DeepSpacePanel/DeepSpacePanel'
import OrbitalMapBar from './components/OrbitalMapBar/OrbitalMapBar'
import PlanetPanel from './components/PlanetPanel/PlanetPanel'
import AirportPanel from './components/AirportPanel/AirportPanel'
import WaitlistPopup from './components/WaitlistPopup/WaitlistPopup'
import TourGuide from './components/TourGuide/TourGuide'
import { useSession } from './hooks/useSession'
import { useAircraft } from './hooks/useAircraft'
import { useAsteroids } from './hooks/useAsteroids'

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
    return { selectedIcao24: pathname.replace('/flight/', ''), activeScale: 'earth', launchPanelOpen: false, activeFilter: null }
  }
  if (pathname === '/solar-system') return { selectedIcao24: null, activeScale: 'solar',   launchPanelOpen: false, activeFilter: null }
  if (pathname === '/deep-space')   return { selectedIcao24: null, activeScale: 'galaxy',  launchPanelOpen: false, activeFilter: null }
  if (pathname === '/launches')     return { selectedIcao24: null, activeScale: 'earth',  launchPanelOpen: true,  activeFilter: null }
  if (pathname === '/asteroids')    return { selectedIcao24: null, activeScale: 'earth',  launchPanelOpen: false, activeFilter: 'asteroids' }
  return                                   { selectedIcao24: null, activeScale: 'earth',  launchPanelOpen: false, activeFilter: null }
}

function stateToPath(selectedIcao24, activeScale, launchPanelOpen, activeFilter) {
  if (selectedIcao24)             return `/flight/${selectedIcao24}`
  if (activeFilter === 'asteroids') return '/asteroids'
  if (launchPanelOpen)            return '/launches'
  if (activeScale === 'solar')    return '/solar-system'
  if (activeScale === 'galaxy')   return '/deep-space'
  return '/'
}

export default function App() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const [, startTransition] = useTransition()

  const { sessionToken, isAuthenticated } = useSession()
  const [liveEnabled, setLiveEnabled] = useState(false)
  const { filteredAircraft, setFilters, connectionStatus, setBounds, solarData } = useAircraft(sessionToken, liveEnabled)

  // Initialise from URL on first render
  const init = parseInitialState(location.pathname)

  const [selectedIcao24, setSelectedIcao24] = useState(init.selectedIcao24)
  const [searchOpen, setSearchOpen]         = useState(false)
  const [trackingId, setTrackingId]         = useState(null)
  const [launchPanelOpen, setLaunchPanelOpen] = useState(init.launchPanelOpen)
  const [cameraInfo]                        = useState({ altM: null, lat: null, lon: null, scaleLabel: '' })
  const [activeScale, setActiveScale]       = useState(init.activeScale)

  const { asteroids } = useAsteroids(activeScale === 'solar')
  const [activeFilter, setActiveFilter]     = useState(init.activeFilter)
  const [sidebarOpen, setSidebarOpen]       = useState(false)
  const [selectedPlanet, setSelectedPlanet] = useState(null)
  const [selectedAirport, setSelectedAirport] = useState(null)
  const [focusedPad, setFocusedPad]         = useState(null)
  const [pinnedLaunch, setPinnedLaunch]     = useState(null)
  const [returnMission, setReturnMission]   = useState(null)
  const [streamCollapsed, setStreamCollapsed] = useState(false)
  const collapseTimerRef = useRef(null)
  const globeRef = useRef(null)

  const handleGlobeInteract = useCallback(() => {
    setStreamCollapsed(true)
    clearTimeout(collapseTimerRef.current)
    collapseTimerRef.current = setTimeout(() => setStreamCollapsed(false), 3000)
  }, [])

  // Sync state → URL whenever relevant state changes
  useEffect(() => {
    const path = stateToPath(selectedIcao24, activeScale, launchPanelOpen, activeFilter)
    if (location.pathname !== path) startTransition(() => navigate(path, { replace: true }))
  }, [selectedIcao24, activeScale, launchPanelOpen, activeFilter]) // eslint-disable-line react-hooks/exhaustive-deps

const aircraftWithShips = useMemo(() => new Map(filteredAircraft), [filteredAircraft])

  // In pad-focus mode pass an empty map so the globe is clean
  const globeAircraft = useMemo(
    () => focusedPad ? new Map() : aircraftWithShips,
    [focusedPad, aircraftWithShips]
  )

  const handleAircraftClick = useCallback((icao24) => {
    setSelectedIcao24(icao24)
  }, [])

  const handlePanelClose = useCallback(() => {
    setSelectedIcao24(null)
    setTrackingId(null)
    globeRef.current?.drawTrail?.([])
  }, [])

  const handleSearchSelect = useCallback((result) => {
    setSelectedIcao24(result.icao24)
    setSearchOpen(false)
  }, [])

  const handleTrailData = useCallback((trailPoints) => {
    globeRef.current?.drawTrail?.(trailPoints)
  }, [])

  const handleCameraScale = useCallback((scale) => {
    setActiveScale(scale)
    globeRef.current?.setCameraScale?.(scale)
  }, [])

  const handlePlanetClick = useCallback((name) => setSelectedPlanet(name), [])
  const handlePlanetClose = useCallback(() => setSelectedPlanet(null), [])
  const handleAirportClick = useCallback((iata) => setSelectedAirport(iata), [])
  const handleAirportClose = useCallback(() => setSelectedAirport(null), [])

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
  const showCommandCenter = !selectedIcao24 && !launchPanelOpen && !focusedPad && activeFilter !== 'asteroids'

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

      {!focusedPad && (
        <StatusBar
          connectionStatus={connectionStatus}
          activeScale={activeScale}
          onScaleChange={handleCameraScale}
          onSearchOpen={() => setSearchOpen(true)}
          liveEnabled={liveEnabled}
          onLiveToggle={() => setLiveEnabled(v => !v)}
          trackedCount={aircraftWithShips.size}
        />
      )}

      {!focusedPad && (
        <HUD
          trackedCount={aircraftWithShips.size}
          connectionStatus={connectionStatus}
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

      <Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: '#0f1419' }} />}>
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
          neoData={asteroids}
        />
      </Suspense>

      {showCommandCenter && (
        <CommandCenterOverlay
          trackedCount={aircraftWithShips.size}
          connectionStatus={connectionStatus}
          issData={aircraftWithShips.get('ISS') ?? null}
          pinnedLaunch={pinnedLaunch}
          onUnpinLaunch={() => setPinnedLaunch(null)}
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
        />
      )}

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
        onPinLaunch={setPinnedLaunch}
        openToMission={returnMission}
      />

      {focusedPad && (
        <PadFocusBadge launch={focusedPad} onExit={handleExitPadFocus} />
      )}

      {selectedIcao24 && !focusedPad && (
        <DetailPanel
          icao24={selectedIcao24}
          onClose={handlePanelClose}
          onTrailData={handleTrailData}
          isAuthenticated={isAuthenticated}
          sessionToken={sessionToken}
          isTracking={trackingId === selectedIcao24}
          onTrack={setTrackingId}
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

      <WaitlistPopup />
      <TourGuide />
    </ErrorBoundary>
  )
}