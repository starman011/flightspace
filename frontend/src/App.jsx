import { useState, useCallback, useRef, useMemo, lazy, Suspense } from 'react'
// Lazy-load Globe (pulls in Three.js ~500 KB) so it doesn't block first paint.
// React.lazy requires a default export; Globe uses a named export, so we re-wrap it.
const Globe = lazy(() =>
  import('./components/Globe/Globe').then(m => ({ default: m.Globe }))
)
import DetailPanel from './components/DetailPanel/DetailPanel'
import SearchBar from './components/SearchBar/SearchBar'
import Filters from './components/Filters/Filters'
import StatusBar from './components/StatusBar/StatusBar'
import { useSession } from './hooks/useSession'
import { useAircraft } from './hooks/useAircraft'

export default function App() {
  const { sessionToken, isAuthenticated } = useSession()
  const { filteredAircraft, filters, setFilters, connectionStatus, setBounds } = useAircraft(sessionToken)

  const [selectedIcao24, setSelectedIcao24] = useState(null)
  const [searchOpen, setSearchOpen]         = useState(false)
  const [trackingId, setTrackingId]         = useState(null)
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

  // Called by DetailPanel once it has trail data
  const handleTrailData = useCallback((trailPoints) => {
    globeRef.current?.drawTrail?.(trailPoints)
  }, [])

  return (
    <>
      <StatusBar connectionStatus={connectionStatus} />
      {/* Dark background visible while Globe chunk loads — prevents white flash */}
      <Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: '#000008' }} />}>
        <Globe
          ref={globeRef}
          aircraft={aircraftWithShips}
          selectedId={selectedIcao24}
          onAircraftClick={handleAircraftClick}
          onViewportChange={setBounds}
          trackingId={trackingId}
        />
      </Suspense>
      <Filters filters={filters} onFiltersChange={setFilters} />
      <SearchBar
        open={searchOpen}
        onOpen={() => setSearchOpen(true)}
        onClose={() => setSearchOpen(false)}
        onSelect={handleSearchSelect}
        sessionToken={sessionToken}
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
