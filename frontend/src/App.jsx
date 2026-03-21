import { useState, useCallback, useRef, useMemo, lazy, Suspense } from 'react'
// Lazy-load Globe (pulls in Three.js ~500 KB) so it doesn't block first paint.
const Globe = lazy(() =>
  import('./components/Globe/Globe').then(m => ({ default: m.Globe }))
)
import DetailPanel from './components/DetailPanel/DetailPanel'
import SearchBar from './components/SearchBar/SearchBar'
import FilterRail from './components/FilterRail/FilterRail'
import LaunchPanel from './components/LaunchPanel/LaunchPanel'
import HUD from './components/HUD/HUD'
import StatusBar from './components/StatusBar/StatusBar'
import { useSession } from './hooks/useSession'
import { useAircraft } from './hooks/useAircraft'

export default function App() {
  const { sessionToken, isAuthenticated } = useSession()
  const { filteredAircraft, filters, setFilters, connectionStatus, setBounds, solarData } = useAircraft(sessionToken)

  const [selectedIcao24, setSelectedIcao24] = useState(null)
  const [searchOpen, setSearchOpen]         = useState(false)
  const [trackingId, setTrackingId]         = useState(null)
  const [launchPanelOpen, setLaunchPanelOpen] = useState(false)
  const [cameraInfo]                        = useState({ altM: null, lat: null, lon: null, scaleLabel: '' })
  const globeRef = useRef(null)

  const aircraftWithShips = useMemo(() => new Map(filteredAircraft), [filteredAircraft])

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
    globeRef.current?.setCameraScale?.(scale)
  }, [])

  const handleLocatePad = useCallback((_launch) => {
    // TODO T062: globeRef.current?.flyTo?.(_launch.pad_lat, _launch.pad_lon)
  }, [])

  return (
    <>
      <StatusBar connectionStatus={connectionStatus} />

      <HUD
        trackedCount={aircraftWithShips.size}
        connectionStatus={connectionStatus}
        cameraAltM={cameraInfo.altM}
        cameraLat={cameraInfo.lat}
        cameraLon={cameraInfo.lon}
        scaleLabel={cameraInfo.scaleLabel}
      />

      <FilterRail
        filters={filters}
        onFiltersChange={setFilters}
        onCameraScale={handleCameraScale}
        onLaunchPanelToggle={() => setLaunchPanelOpen(o => !o)}
        launchPanelOpen={launchPanelOpen}
      />

      {/* Dark background visible while Globe chunk loads — prevents white flash */}
      <Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: '#000008' }} />}>
        <Globe
          ref={globeRef}
          aircraft={aircraftWithShips}
          selectedId={selectedIcao24}
          onAircraftClick={handleAircraftClick}
          onViewportChange={setBounds}
          trackingId={trackingId}
          solarData={solarData}
        />
      </Suspense>

      <SearchBar
        open={searchOpen}
        onOpen={() => setSearchOpen(true)}
        onClose={() => setSearchOpen(false)}
        onSelect={handleSearchSelect}
        sessionToken={sessionToken}
      />

      <LaunchPanel
        open={launchPanelOpen}
        onClose={() => setLaunchPanelOpen(false)}
        onLocatePad={handleLocatePad}
      />

      {selectedIcao24 && (
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
    </>
  )
}
