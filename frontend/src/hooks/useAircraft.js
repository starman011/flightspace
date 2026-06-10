import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useWebSocket } from './useWebSocket'

const ALT_LOW  = 10_000  // ft
const ALT_MID  = 30_000  // ft

/**
 * useAircraft manages the full aircraft state map, applies filters,
 * and exposes the WebSocket connection controls.
 */
export function useAircraft(sessionToken, enabled = true) {
  // aircraft: Map<id, LiveAircraftWithMeta>
  const [aircraft, setAircraft] = useState(new Map())
  const [filters, setFilters] = useState({ type: 'all', altitude: 'all' })
  const staleTimerRef = useRef(null)

  // Clear map immediately when tracking is disabled
  useEffect(() => {
    if (!enabled) setAircraft(new Map())
  }, [enabled])

  const handleSnapshot = useCallback((list) => {
    const map = new Map()
    for (const a of list) {
      map.set(a.id, { ...a, receivedAt: Date.now() })
    }
    setAircraft(map)
  }, [])

  const handleDelta = useCallback(({ updated, removed }) => {
    setAircraft((prev) => {
      const next = new Map(prev)
      for (const a of updated) {
        next.set(a.id, { ...a, receivedAt: Date.now() })
      }
      for (const id of removed) {
        next.delete(id)
      }
      return next
    })
  }, [])

  const [solarData, setSolarData] = useState(null)
  const handleSolarSystem = useCallback((data) => {
    if (data?.planets) setSolarData(data)
  }, [])

  const [viewerCounts, setViewerCounts] = useState({})
  const handleViewerCount = useCallback((data) => {
    if (data?.object_id) {
      setViewerCounts(prev => ({ ...prev, [data.object_id]: data.count }))
    }
  }, [])

  const { connectionStatus, setBounds, watchObject } = useWebSocket(sessionToken, handleSnapshot, handleDelta, handleSolarSystem, handleViewerCount, enabled)

  // Remove stale aircraft (no update > 120s) on a 10s tick
  const pruneStalePeriodically = useCallback(() => {
    if (staleTimerRef.current) return
    staleTimerRef.current = setInterval(() => {
      const cutoff = Date.now() - 120_000
      setAircraft((prev) => {
        let changed = false
        const next = new Map(prev)
        for (const [id, a] of next) {
          if ((a.receivedAt || 0) < cutoff) {
            next.delete(id)
            changed = true
          }
        }
        return changed ? next : prev
      })
    }, 10_000)
  }, [])

  // Start pruning once we have aircraft
  useMemo(() => {
    if (aircraft.size > 0) pruneStalePeriodically()
  }, [aircraft.size]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredAircraft = useMemo(() => {
    if (filters.type === 'all' && filters.altitude === 'all' && !filters.airline && !filters.satName) return aircraft

    const airlinePrefix = filters.airline ? filters.airline.toUpperCase() : null
    const satPrefix = filters.satName ? filters.satName.toUpperCase() : null
    const result = new Map()
    for (const [id, a] of aircraft) {
      const cat = a.cat || 'plane'

      // --- Airline filter (callsign ICAO prefix, e.g. IGO for IndiGo) ---
      if (airlinePrefix) {
        const cs = (a.cs || '').toUpperCase()
        if (!cs.startsWith(airlinePrefix)) continue
      }

      // --- Satellite-name filter (e.g. STARLINK) — match name or callsign ---
      if (satPrefix) {
        const nm = (a.name || a.cs || id || '').toUpperCase()
        if (cat !== 'satellite' || !nm.includes(satPrefix)) continue
      }

      // --- Type filter ---
      if (filters.type !== 'all') {
        if (filters.type === 'planes'      && cat !== 'plane')      continue
        if (filters.type === 'helicopters' && cat !== 'helicopter') continue
        if (filters.type === 'satellites'  && cat !== 'satellite')  continue
        if (filters.type === 'ships'       && cat !== 'ship')       continue
        // Solar / space object types — show only those categories (globe is empty while in solar view)
        if (filters.type === 'asteroids'   && cat !== 'asteroid')   continue
        if (filters.type === 'planets'     && cat !== 'planet')     continue
        if (filters.type === 'rockets'     && cat !== 'rocket')     continue
      }

      // --- Altitude filter ---
      // Only applies to planes and helicopters (satellites use alt_km, ships are sea-level)
      if (filters.altitude !== 'all' && (cat === 'plane' || cat === 'helicopter') && !a.grnd) {
        const alt = a.alt ?? 0
        if (filters.altitude === 'low'  && alt >= ALT_LOW)                    continue
        if (filters.altitude === 'mid'  && (alt < ALT_LOW || alt >= ALT_MID)) continue
        if (filters.altitude === 'high' && alt < ALT_MID)                     continue
      }

      result.set(id, a)
    }
    return result
  }, [aircraft, filters])

  return { aircraft, filteredAircraft, filters, setFilters, connectionStatus, setBounds, solarData, viewerCounts, watchObject }
}
