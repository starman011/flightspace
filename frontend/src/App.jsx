import { useState, useCallback, useRef, useEffect, useMemo, lazy, Suspense } from 'react'
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

// ── Demo ships along major shipping lanes ────────────────────────────────────
// These stand in until a real AIS backend source is connected.
// Each entry: { id, lat, lon, hdg (degrees), spd (knots) }
const SEED_SHIPS = [
  // English Channel / North Sea
  { id: 'sdemo_001', lat: 50.82, lon:  1.42, hdg: 282, spd: 18 },
  { id: 'sdemo_002', lat: 51.15, lon:  2.08, hdg:  98, spd: 16 },
  // Mediterranean
  { id: 'sdemo_003', lat: 37.52, lon: 12.30, hdg: 112, spd: 19 },
  { id: 'sdemo_004', lat: 35.82, lon: 22.14, hdg: 284, spd: 17 },
  // Suez / Red Sea
  { id: 'sdemo_005', lat: 30.48, lon: 32.35, hdg: 345, spd: 14 },
  { id: 'sdemo_006', lat: 19.95, lon: 38.52, hdg: 162, spd: 15 },
  // Gulf of Aden
  { id: 'sdemo_007', lat: 11.52, lon: 47.98, hdg: 248, spd: 20 },
  // Persian Gulf
  { id: 'sdemo_008', lat: 25.48, lon: 55.02, hdg: 318, spd: 13 },
  // Strait of Malacca
  { id: 'sdemo_009', lat:  2.52, lon: 102.48, hdg: 316, spd: 17 },
  { id: 'sdemo_010', lat:  4.08, lon: 100.82, hdg: 134, spd: 18 },
  // South China Sea
  { id: 'sdemo_011', lat: 15.48, lon: 114.18, hdg:  52, spd: 19 },
  // East China Sea
  { id: 'sdemo_012', lat: 29.98, lon: 124.52, hdg:  44, spd: 16 },
  // North Pacific (transpacific route)
  { id: 'sdemo_013', lat: 40.52, lon:-164.98, hdg: 272, spd: 21 },
  { id: 'sdemo_014', lat: 38.05, lon:-140.02, hdg:  88, spd: 20 },
  // Panama Canal area
  { id: 'sdemo_015', lat:  8.92, lon: -79.52, hdg: 318, spd: 12 },
  // Caribbean
  { id: 'sdemo_016', lat: 17.98, lon: -71.98, hdg:  62, spd: 16 },
  // North Atlantic (shipping lane ~50°N)
  { id: 'sdemo_017', lat: 48.52, lon: -28.48, hdg: 268, spd: 22 },
  { id: 'sdemo_018', lat: 42.02, lon: -40.02, hdg:  91, spd: 20 },
  // Indian Ocean
  { id: 'sdemo_019', lat:-10.52, lon:  65.02, hdg:  76, spd: 18 },
  // Cape of Good Hope
  { id: 'sdemo_020', lat:-35.52, lon:  19.82, hdg: 202, spd: 17 },
]

// ── Demo aircraft (planes + helicopters) ─────────────────────────────────────
// Shown when the live backend is unreachable. Speeds in knots.
const SEED_AIRCRAFT = [
  // Transatlantic / Europe
  { id: 'ademo_001', cat: 'plane',      lat: 51.48, lon: -0.46, hdg: 280, spd: 480, alt: 35000 },
  { id: 'ademo_002', cat: 'plane',      lat: 48.86, lon:  2.35, hdg:  95, spd: 460, alt: 37000 },
  { id: 'ademo_003', cat: 'plane',      lat: 52.37, lon:  4.90, hdg: 190, spd: 440, alt: 33000 },
  { id: 'ademo_004', cat: 'plane',      lat: 40.64, lon: -73.78, hdg:  65, spd: 500, alt: 39000 },
  { id: 'ademo_005', cat: 'plane',      lat: 33.94, lon:-118.41, hdg: 275, spd: 490, alt: 36000 },
  // Asia / Pacific
  { id: 'ademo_006', cat: 'plane',      lat: 35.55, lon: 139.78, hdg: 350, spd: 510, alt: 38000 },
  { id: 'ademo_007', cat: 'plane',      lat:  1.36, lon: 103.99, hdg: 230, spd: 470, alt: 35000 },
  { id: 'ademo_008', cat: 'plane',      lat: 25.25, lon:  55.36, hdg: 120, spd: 450, alt: 34000 },
  // Mid-flight over oceans
  { id: 'ademo_009', cat: 'plane',      lat: 50.00, lon: -30.00, hdg: 260, spd: 495, alt: 37000 },
  { id: 'ademo_010', cat: 'plane',      lat: 10.00, lon: -20.00, hdg:  80, spd: 465, alt: 36000 },
  // Helicopters (low altitude)
  { id: 'ademo_011', cat: 'helicopter', lat: 51.50, lon: -0.12, hdg:  45, spd:  90, alt:  1200 },
  { id: 'ademo_012', cat: 'helicopter', lat: 40.71, lon: -74.01, hdg: 180, spd: 110, alt:   800 },
  { id: 'ademo_013', cat: 'helicopter', lat: 48.85, lon:  2.35, hdg: 270, spd:  85, alt:  1500 },
]

// Convert knots → degrees/second for lat movement (1 knot ≈ 1/60 deg/min ≈ 1/3600 deg/s)
const KTS_TO_DEG_PER_MS = 1 / (3600 * 1000)

export default function App() {
  const { sessionToken, isAuthenticated } = useSession()
  const { filteredAircraft, filters, setFilters, connectionStatus, setBounds } = useAircraft(sessionToken)

  const [selectedIcao24, setSelectedIcao24] = useState(null)
  const [searchOpen, setSearchOpen]         = useState(false)
  const [trackingId, setTrackingId]         = useState(null)
  const globeRef = useRef(null)

  // Demo planes + helicopters: drift along heading at realistic speed
  const [demoAircraft, setDemoAircraft] = useState(() =>
    SEED_AIRCRAFT.map(a => ({ ...a, receivedAt: Date.now() }))
  )
  useEffect(() => {
    let lastTick = Date.now()
    const id = setInterval(() => {
      const now = Date.now()
      const dt  = now - lastTick
      lastTick  = now
      setDemoAircraft(prev => prev.map(a => {
        const hdgRad = a.hdg * (Math.PI / 180)
        const dDeg   = a.spd * KTS_TO_DEG_PER_MS * dt
        return { ...a, lat: a.lat + Math.cos(hdgRad) * dDeg, lon: a.lon + Math.sin(hdgRad) * dDeg, receivedAt: now }
      }))
    }, 3000)
    return () => clearInterval(id)
  }, [])

  // Demo ships: drift along their heading at realistic speed
  const [demoShips, setDemoShips] = useState(() =>
    SEED_SHIPS.map(s => ({ ...s, cat: 'ship', receivedAt: Date.now() }))
  )
  useEffect(() => {
    let lastTick = Date.now()
    const id = setInterval(() => {
      const now = Date.now()
      const dt = now - lastTick
      lastTick = now
      setDemoShips(prev => prev.map(s => {
        const hdgRad = s.hdg * (Math.PI / 180)
        const dDeg   = s.spd * KTS_TO_DEG_PER_MS * dt
        return { ...s, lat: s.lat + Math.cos(hdgRad) * dDeg, lon: s.lon + Math.sin(hdgRad) * dDeg, receivedAt: now }
      }))
    }, 3000)
    return () => clearInterval(id)
  }, [])

  // Demo ISS: orbital simulation — 92 min period, 51.6° inclination, 408 km altitude
  const [issData, setIssData] = useState(null)
  useEffect(() => {
    const compute = () => {
      const T    = 92 * 60 * 1000   // 92-minute orbital period in ms
      const frac = (Date.now() % T) / T
      const lon  = (frac * 360 - 180)
      const lat  = Math.sin(frac * 2 * Math.PI) * 51.6
      return { id: 'demo_iss', cat: 'satellite', callsign: 'ISS', alt_km: 408, lat, lon, hdg: 90 }
    }
    setIssData(compute())
    const id = setInterval(() => setIssData(compute()), 5000)
    return () => clearInterval(id)
  }, [])

  // Merge live data + all demo entities into a single Map
  const aircraftWithShips = useMemo(() => {
    const merged = new Map(filteredAircraft)
    for (const a of demoAircraft) merged.set(a.id, a)
    for (const s of demoShips)    merged.set(s.id, s)
    if (issData) merged.set(issData.id, issData)
    return merged
  }, [filteredAircraft, demoAircraft, demoShips, issData])

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
