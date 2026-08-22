import { useState, useEffect } from 'react'
import { API_ORIGIN } from '../lib/apiBase.js'

const API = API_ORIGIN

/**
 * useAsteroids — fetches live near-earth object data from /api/v1/asteroids.
 * Refreshes every 5 minutes while mounted.
 */
export function useAsteroids(enabled = true) {
  const [asteroids, setAsteroids] = useState([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    async function fetch_() {
      setLoading(true)
      try {
        const res = await fetch(`${API}/api/v1/asteroids`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (!cancelled) {
          setAsteroids(json.asteroids ?? [])
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetch_()
    const id = setInterval(fetch_, 5 * 60 * 1000)
    return () => { cancelled = true; clearInterval(id) }
  }, [enabled])

  return { asteroids, loading, error }
}
