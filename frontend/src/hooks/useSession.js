import { useState, useEffect, useCallback } from 'react'

const API = import.meta.env.VITE_API_URL || ''

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

    async function initSession(attempt = 0) {
      const token = await createAnonymousSession()
      if (!mounted) return
      if (token) {
        setIsLoading(false)
        return
      }
      // Retry with capped backoff — network blips recover, true DNS blocks don't.
      setIsLoading(false)
      const delay = Math.min(2000 * Math.pow(2, attempt), 30000)
      retryTimer = setTimeout(() => initSession(attempt + 1), delay)
    }

    initSession()
    return () => {
      mounted = false
      if (retryTimer) clearTimeout(retryTimer)
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
    setUser({ display_name: data.display_name ?? null })
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
    await fetch(`${API}/api/v1/auth/logout`, { method: 'POST', credentials: 'include' })
    setIsAuthenticated(false)
    setUser(null)
    await createAnonymousSession()
  }, [createAnonymousSession])

  return { sessionToken, isAuthenticated, user, isLoading, sessionError, login, register, logout, googleLogin, appleLogin }
}
