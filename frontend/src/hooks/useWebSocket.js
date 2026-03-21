import { useState, useEffect, useRef, useCallback } from 'react'

// Derive WS URL from VITE_API_URL (http→ws, https→wss) so no separate env var needed
const _api = import.meta.env.VITE_API_URL || `${location.protocol}//${location.host}`
const WS_URL = import.meta.env.VITE_WS_URL || (_api.replace(/^http/, 'ws') + '/ws')
const PING_INTERVAL = 30_000
const MAX_BACKOFF = 30_000

/**
 * useWebSocket connects to the SkyDot backend WebSocket and manages
 * snapshot/delta aircraft state, auto-reconnect, and viewport filtering.
 *
 * @param {string|null} sessionToken - JWT token for the session
 * @param {Function} onSnapshot - called with full aircraft array on snapshot
 * @param {Function} onDelta    - called with { updated, removed } arrays on delta
 */
export function useWebSocket(sessionToken, onSnapshot, onDelta, onSolarSystem) {
  const [connectionStatus, setConnectionStatus] = useState('disconnected')
  const wsRef = useRef(null)
  const backoffRef = useRef(1000)
  const reconnectTimerRef = useRef(null)
  const pingTimerRef = useRef(null)
  const boundsRef = useRef(null)
  const mountedRef = useRef(true)

  const connect = useCallback(() => {
    if (!sessionToken || !mountedRef.current) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const url = `${WS_URL}?token=${encodeURIComponent(sessionToken)}`
    setConnectionStatus('connecting')

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) return
      setConnectionStatus('connected')
      backoffRef.current = 1000 // Reset backoff on successful connect

      // Re-send bounds if we had them
      if (boundsRef.current) {
        ws.send(JSON.stringify({ type: 'set_bounds', data: boundsRef.current }))
      }

      // Start ping loop
      clearInterval(pingTimerRef.current)
      pingTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, PING_INTERVAL)
    }

    ws.onmessage = (event) => {
      if (!mountedRef.current) return
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'snapshot' && onSnapshot) {
          onSnapshot(msg.data?.aircraft ?? [])
        } else if (msg.type === 'delta' && onDelta) {
          onDelta({
            updated: msg.data?.updated ?? [],
            removed: msg.data?.removed ?? [],
          })
        } else if (msg.type === 'solar_system' && onSolarSystem) {
          onSolarSystem(msg.data)
        }
      } catch (err) {
        console.warn('WS parse error:', err)
      }
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      setConnectionStatus('disconnected')
      clearInterval(pingTimerRef.current)
      // Exponential backoff reconnect
      const delay = backoffRef.current
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF)
      reconnectTimerRef.current = setTimeout(connect, delay)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [sessionToken, onSnapshot, onDelta, onSolarSystem])

  // Connect when token is available
  useEffect(() => {
    if (!sessionToken) return
    connect()

    return () => {
      clearInterval(pingTimerRef.current)
      clearTimeout(reconnectTimerRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null // Prevent reconnect on intentional unmount
        wsRef.current.close()
      }
    }
  }, [sessionToken]) // eslint-disable-line react-hooks/exhaustive-deps

  // BFCache: close WS on pagehide so the browser can cache the page,
  // reconnect on pageshow if the page is restored from the cache.
  useEffect(() => {
    const onHide  = ()  => { wsRef.current?.close() }
    const onShow  = (e) => { if (e.persisted) connect() }
    window.addEventListener('pagehide', onHide)
    window.addEventListener('pageshow', onShow)
    return () => {
      window.removeEventListener('pagehide', onHide)
      window.removeEventListener('pageshow', onShow)
    }
  }, [connect])

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const setBounds = useCallback((bounds) => {
    boundsRef.current = bounds
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'set_bounds', data: bounds }))
    }
  }, [])

  return { connectionStatus, setBounds }
}
