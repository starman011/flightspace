import { useState, useCallback, useMemo, useRef } from 'react'
import { useWebSocket } from './useWebSocket'

const ALT_LOW  = 10_000  // ft
const ALT_MID  = 30_000  // ft

/**
 * useAircraft manages the full aircraft state map, applies filters,
 * and exposes the WebSocket connection controls.
 */
export function useAircraft(sessionToken) {
  // aircraft: Map<id, LiveAircraftWithMeta>
  const [aircraft, setAircraft] = useState(new Map())
  const [filters, setFilters] = useState({ type: 'all', altitude: 'all' })
  const staleTimerRef = useRef(null)

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

  const { connectionStatus, setBounds } = useWebSocket(sessionToken, handleSnapshot, handleDelta, handleSolarSystem)

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
    if (filters.type === 'all' && filters.altitude === 'all') return aircraft

    const result = new Map()
    for (const [id, a] of aircraft) {
      const cat = a.cat || 'plane'

      // --- Type filter ---
      if (filters.type !== 'all') {
        if (filters.type === 'planes'      && cat !== 'plane')      continue
        if (filters.type === 'helicopters' && cat !== 'helicopter') continue
        if (filters.type === 'satellites'  && cat !== 'satellite')  continue
        if (filters.type === 'ships'       && cat !== 'ship')       continue
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

  return { filteredAircraft, filters, setFilters, connectionStatus, setBounds, solarData }
}
