import { useState, useEffect, useCallback } from 'react'

export function useSession() {
  const [sessionToken, setSessionToken] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const createAnonymousSession = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) throw new Error(`session create failed: ${res.status}`)
      const data = await res.json()
      // Store token in memory only (not localStorage)
      setSessionToken(data.token)
      return data.token
    } catch (err) {
      console.error('Failed to create anonymous session:', err)
      return null
    }
  }, [])

  useEffect(() => {
    let mounted = true

    async function initSession() {
      // Create an anonymous session; cookie is HttpOnly so we can't read it directly
      const token = await createAnonymousSession()
      if (mounted && token) setSessionToken(token)
      if (mounted) setIsLoading(false)
    }

    initSession()
    return () => { mounted = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (email, password) => {
    const res = await fetch('/api/v1/auth/login', {
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
    return data
  }, [])

  const logout = useCallback(async () => {
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' })
    setIsAuthenticated(false)
    await createAnonymousSession()
  }, [createAnonymousSession])

  return { sessionToken, isAuthenticated, isLoading, login, logout }
}
