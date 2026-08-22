import { useState, useEffect, useCallback, useRef } from 'react'
import { API_BASE } from '../lib/apiBase.js'

const API = API_BASE
const LS_LAUNCHES = 'fs.pinned_launches.v1'
const LS_FLIGHTS  = 'fs.tracked_flights.v1'

function loadLS(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}
function saveLS(key, items) {
  try { localStorage.setItem(key, JSON.stringify(items)) } catch {}
}

/**
 * usePins — pinned launches + tracked flights for anonymous and signed-in users.
 *
 * Anonymous: stored in localStorage, persists across reloads on the same browser.
 * Signed-in: synced to the backend so pins follow the user across devices. On
 * sign-in we replay any anonymous local pins to the server (idempotent), then
 * load the canonical list from the server.
 */
export function usePins(isAuthenticated, sessionToken) {
  const [pinnedLaunches, setPinnedLaunches] = useState(() => loadLS(LS_LAUNCHES))
  const [trackedFlights, setTrackedFlights] = useState(() => loadLS(LS_FLIGHTS))
  const syncedRef = useRef(false)

  // Persist anon pins to localStorage on every change
  useEffect(() => { saveLS(LS_LAUNCHES, pinnedLaunches) }, [pinnedLaunches])
  useEffect(() => { saveLS(LS_FLIGHTS, trackedFlights) }, [trackedFlights])

  // On sign-out: clear local state and localStorage
  useEffect(() => {
    if (!isAuthenticated) {
      setPinnedLaunches([])
      setTrackedFlights([])
      saveLS(LS_LAUNCHES, [])
      saveLS(LS_FLIGHTS, [])
      syncedRef.current = false
      return
    }
    if (!sessionToken || syncedRef.current) return
    syncedRef.current = true

    // Signed in — fetch user's canonical list from server (don't replay localStorage)
    const opts = {
      credentials: 'include',
      headers: { 'Authorization': `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
    }

    fetch(`${API}/api/v1/user/pinned-launches`, opts)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.items) return
        const seen = new Set()
        const unique = d.items.filter(l => {
          const key = l.launch_id || l.id
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        setPinnedLaunches(unique)
      })
      .catch(() => {})
    fetch(`${API}/api/v1/user/watchlist`, opts)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.items) return
        const seen = new Set()
        const unique = d.items.filter(f => {
          if (seen.has(f.icao24)) return false
          seen.add(f.icao24)
          return true
        })
        setTrackedFlights(unique)
      })
      .catch(() => {})
  }, [isAuthenticated, sessionToken]) // eslint-disable-line react-hooks/exhaustive-deps

  const pinLaunch = useCallback((launch) => {
    if (!launch) return
    // Local copy keeps display fields (provider, rocket, status_abbr).
    // Server copy only persists what's needed to reconstitute the pin.
    const item = {
      id: launch.id, // optimistic local id, replaced by server uuid after sync
      launch_id: launch.id,
      name: launch.mission_name || launch.name || null,
      net_time: launch.net || null,
      _full: launch,
    }
    setPinnedLaunches(prev =>
      prev.some(p => p.launch_id === item.launch_id) ? prev : [...prev, item]
    )
    if (isAuthenticated && sessionToken) {
      fetch(`${API}/api/v1/user/pinned-launches`, {
        method: 'POST', credentials: 'include',
        headers: { 'Authorization': `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ launch_id: item.launch_id, name: item.name, net_time: item.net_time }),
      })
        .then(r => r.ok ? r.json() : null)
        .then(saved => {
          if (saved?.id) {
            setPinnedLaunches(prev => prev.map(p =>
              p.launch_id === item.launch_id ? saved : p
            ))
          }
        })
        .catch(() => {})
    }
  }, [isAuthenticated, sessionToken])

  const unpinLaunch = useCallback((launchId) => {
    const target = pinnedLaunches.find(p => p.launch_id === launchId || p.id === launchId)
    setPinnedLaunches(prev => prev.filter(p => p.launch_id !== launchId && p.id !== launchId))
    if (isAuthenticated && sessionToken && target?.id) {
      fetch(`${API}/api/v1/user/pinned-launches/${target.id}`, {
        method: 'DELETE', credentials: 'include',
        headers: { 'Authorization': `Bearer ${sessionToken}` },
      }).catch(() => {})
    }
  }, [pinnedLaunches, isAuthenticated, sessionToken])

  const trackFlight = useCallback((flight) => {
    if (!flight?.icao24) return
    const item = {
      id: flight.icao24,
      icao24: flight.icao24,
      callsign: flight.callsign || null,
      label: flight.label || null,
    }
    setTrackedFlights(prev =>
      prev.some(f => f.icao24 === item.icao24) ? prev : [...prev, item]
    )
    if (isAuthenticated && sessionToken) {
      fetch(`${API}/api/v1/user/watchlist`, {
        method: 'POST', credentials: 'include',
        headers: { 'Authorization': `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ icao24: item.icao24, callsign: item.callsign, label: item.label }),
      })
        .then(r => r.ok ? r.json() : null)
        .then(saved => {
          if (saved?.id) {
            setTrackedFlights(prev => prev.map(f =>
              f.icao24 === item.icao24 ? saved : f
            ))
          }
        })
        .catch(() => {})
    }
  }, [isAuthenticated, sessionToken])

  const untrackFlight = useCallback((icao24) => {
    const target = trackedFlights.find(f => f.icao24 === icao24)
    setTrackedFlights(prev => prev.filter(f => f.icao24 !== icao24))
    if (isAuthenticated && sessionToken && target?.id) {
      fetch(`${API}/api/v1/user/watchlist/${target.id}`, {
        method: 'DELETE', credentials: 'include',
        headers: { 'Authorization': `Bearer ${sessionToken}` },
      }).catch(() => {})
    }
  }, [trackedFlights, isAuthenticated, sessionToken])

  const isLaunchPinned = useCallback((launchId) =>
    pinnedLaunches.some(p => p.launch_id === launchId || p.id === launchId)
  , [pinnedLaunches])

  const isFlightTracked = useCallback((icao24) =>
    trackedFlights.some(f => f.icao24 === icao24)
  , [trackedFlights])

  return {
    pinnedLaunches, trackedFlights,
    pinLaunch, unpinLaunch,
    trackFlight, untrackFlight,
    isLaunchPinned, isFlightTracked,
  }
}
