import { useState, useEffect, useRef, useCallback } from 'react'
import { API_ORIGIN } from '../lib/apiBase.js'

const _api = API_ORIGIN
const WS_URL = import.meta.env.VITE_WS_URL || (_api.replace(/^http/, 'ws') + '/ws')
const PING_INTERVAL = 30_000
const MAX_BACKOFF   = 30_000

export function useWebSocket(sessionToken, onSnapshot, onDelta, onSolarSystem, onViewerCount, enabled = true) {
  const [connectionStatus, setConnectionStatus] = useState('disconnected')
  const wsRef             = useRef(null)
  const backoffRef        = useRef(1000)
  const reconnectTimerRef = useRef(null)
  const pingTimerRef      = useRef(null)
  const boundsRef         = useRef(null)
  const mountedRef        = useRef(false)

  // ── Stable close helper ─────────────────────────────────────────────────
  const closeSocket = useCallback(() => {
    const ws = wsRef.current
    if (!ws) return
    ws.onopen    = null
    ws.onmessage = null
    ws.onerror   = null
    ws.onclose   = null
    ws.close()
    wsRef.current = null
  }, [])

  // ── Connect ─────────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (!mountedRef.current || !sessionToken) return
    const rs = wsRef.current?.readyState
    if (rs === WebSocket.OPEN || rs === WebSocket.CONNECTING) return

    setConnectionStatus('connecting')
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(sessionToken)}`)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) { closeSocket(); return }
      setConnectionStatus('connected')
      backoffRef.current = 1000

      if (boundsRef.current) {
        ws.send(JSON.stringify({ type: 'set_bounds', data: boundsRef.current }))
      }
      clearInterval(pingTimerRef.current)
      pingTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
      }, PING_INTERVAL)
    }

    ws.onmessage = (event) => {
      if (!mountedRef.current) return
      try {
        const msg = JSON.parse(event.data)
        if      (msg.type === 'snapshot'      && onSnapshot)     onSnapshot(msg.data?.aircraft ?? [])
        else if (msg.type === 'delta'         && onDelta)        onDelta({ updated: msg.data?.updated ?? [], removed: msg.data?.removed ?? [] })
        else if (msg.type === 'solar_system'  && onSolarSystem)  onSolarSystem(msg.data)
        else if (msg.type === 'viewer_count'  && onViewerCount)  onViewerCount(msg.data)
      } catch { /* ignore parse errors */ }
    }

    ws.onerror = () => ws.close()   // let onclose handle reconnect

    ws.onclose = () => {
      if (wsRef.current !== ws) return   // stale socket �� a newer one took over
      if (!mountedRef.current) return
      setConnectionStatus('disconnected')
      clearInterval(pingTimerRef.current)
      const delay = backoffRef.current
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF)
      reconnectTimerRef.current = setTimeout(connect, delay)
    }
  }, [sessionToken, onSnapshot, onDelta, onSolarSystem, onViewerCount, closeSocket])

  // ── Mount / sessionToken effect ─────────────────────────────────────────
  // Uses setTimeout(0) so React StrictMode's synchronous double-invocation
  // (mount → immediate cleanup → remount) cancels the timer before the
  // socket is ever created, preventing "closed before established" warnings.
  useEffect(() => {
    if (!sessionToken || !enabled) {
      clearTimeout(reconnectTimerRef.current)
      clearInterval(pingTimerRef.current)
      closeSocket()
      setConnectionStatus('disconnected')
      return
    }
    mountedRef.current = true

    const timerId = setTimeout(connect, 0)

    return () => {
      mountedRef.current = false
      clearTimeout(timerId)
      clearTimeout(reconnectTimerRef.current)
      clearInterval(pingTimerRef.current)
      closeSocket()
    }
  }, [sessionToken, enabled, connect, closeSocket])

  // ── BFCache ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const onHide = () => {
      clearTimeout(reconnectTimerRef.current)
      closeSocket()
    }
    const onShow = (e) => { if (e.persisted && mountedRef.current) connect() }
    window.addEventListener('pagehide', onHide)
    window.addEventListener('pageshow', onShow)
    return () => {
      window.removeEventListener('pagehide', onHide)
      window.removeEventListener('pageshow', onShow)
    }
  }, [connect, closeSocket])

  const setBounds = useCallback((bounds) => {
    boundsRef.current = bounds
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'set_bounds', data: bounds }))
    }
  }, [])

  const watchObject = useCallback((objectId) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'watch_object', data: objectId || '' }))
    }
  }, [])

  return { connectionStatus, setBounds, watchObject }
}
