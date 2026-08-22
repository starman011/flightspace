import { useState, useEffect, useCallback } from 'react'
import { API_BASE } from '../lib/apiBase.js'

const API = API_BASE

export function useSession() {
  const [sessionToken, setSessionToken] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  // sessionError surfaces network failures (ERR_NAME_NOT_RESOLVED, blocked CORS,
  // offline, etc.) so the UI can show a visible "can't reach server" state
  // instead of silently leaving the app in a disconnected limbo.
  const [sessionError, setSessionError] = useState(null)

  const createAnonymousSession = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/v1/session`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) throw new Error(`session create failed: ${res.status}`)
      const data = await res.json()
      setSessionToken(data.token)
      setSessionError(null)
      return data.token
    } catch (err) {
      console.error('Failed to create anonymous session:', err)
      // TypeError: Failed to fetch → network unreachable (DNS, CORS, offline).
      // Give the UI a specific reason so we can hint at DNS/ad-blocker causes.
      const isNetwork = err instanceof TypeError
      setSessionError(isNetwork ? 'network' : 'server')
      return null
    }
  }, [])

  useEffect(() => {
    let mounted = true
    let retryTimer = null
    let attempt = 0
    let settled = false

    // A tab that cannot reach the API used to retry every 30s forever, in every
    // open tab, including ones hidden in the background. When the cause was a
    // misconfiguration rather than a blip that meant unbounded billable traffic
    // that could never succeed. The ceiling is now 5 minutes, retries pause
    // while the tab is hidden, and a real recovery signal restarts them at once
    // — so recovery is faster than the old loop while costing far less.
    const MAX_DELAY = 5 * 60_000

    const clearTimer = () => {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
    }

    const schedule = () => {
      clearTimer()
      // A hidden tab is woken by the visibilitychange handler instead.
      if (settled || document.hidden) return
      const delay = Math.min(2000 * 2 ** attempt, MAX_DELAY)
      attempt += 1
      retryTimer = setTimeout(attemptSession, delay)
    }

    async function attemptSession() {
      if (!mounted || settled) return
      const token = await createAnonymousSession()
      if (!mounted) return
      setIsLoading(false)
      if (token) {
        settled = true
        clearTimer()
        return
      }
      schedule()
    }

    // Don't sit out a five-minute backoff when the tab is focused again or the
    // browser reports the network is back: those are evidence worth acting on.
    const retryNow = () => {
      if (!mounted || settled || document.hidden) return
      attempt = 0
      clearTimer()
      attemptSession()
    }

    attemptSession()
    document.addEventListener('visibilitychange', retryNow)
    window.addEventListener('online', retryNow)

    return () => {
      mounted = false
      clearTimer()
      document.removeEventListener('visibilitychange', retryNow)
      window.removeEventListener('online', retryNow)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (email, password) => {
    const res = await fetch(`${API}/api/v1/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Login failed')
    }
    const data = await res.json()
    setSessionToken(data.token)
    setIsAuthenticated(true)
    setUser({ email, display_name: data.display_name ?? null })
    return data
  }, [])

  const register = useCallback(async (email, password, displayName) => {
    const res = await fetch(`${API}/api/v1/auth/register`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, display_name: displayName || undefined }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Registration failed')
    }
    const data = await res.json()
    setSessionToken(data.token)
    setIsAuthenticated(true)
    setUser({ email, display_name: displayName || null })
    return data
  }, [])

  const googleLogin = useCallback(async (idToken) => {
    const res = await fetch(`${API}/api/v1/auth/google`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: idToken }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Google sign-in failed')
    }
    const data = await res.json()
    setSessionToken(data.token)
    setIsAuthenticated(true)
    setUser({ display_name: data.display_name ?? null, picture: data.picture || null })
    return data
  }, [])

  const appleLogin = useCallback(async (idToken, fullName) => {
    const res = await fetch(`${API}/api/v1/auth/apple`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: idToken, full_name: fullName || undefined }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Apple sign-in failed')
    }
    const data = await res.json()
    setSessionToken(data.token)
    setIsAuthenticated(true)
    setUser({ display_name: data.display_name ?? null })
    return data
  }, [])

  const logout = useCallback(async () => {
    setSessionToken(null)
    setIsAuthenticated(false)
    setUser(null)
    await fetch(`${API}/api/v1/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {})
    await createAnonymousSession()
  }, [createAnonymousSession])

  return { sessionToken, isAuthenticated, user, isLoading, sessionError, login, register, logout, googleLogin, appleLogin }
}
