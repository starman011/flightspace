import { useState, useEffect, useCallback, useRef } from 'react'

const API = import.meta.env.VITE_API_URL || ''

/* Register service worker once on mount */
function useServiceWorker() {
  const regRef = useRef(null)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').then(reg => { regRef.current = reg })
  }, [])
  return regRef
}

/* usePushNotifications — subscribe/unsubscribe for launch alerts */
export function usePushNotifications() {
  const swReg = useServiceWorker()
  const [vapidKey, setVapidKey] = useState(null)
  const [supported, setSupported] = useState(false)
  const [permission, setPermission] = useState('default')

  useEffect(() => {
    const isSupported = typeof window !== 'undefined' && 'PushManager' in window && 'serviceWorker' in navigator && 'Notification' in window
    setSupported(isSupported)
    if (isSupported) {
      setPermission(window.Notification.permission)
    }
  }, [])

  // Fetch VAPID public key from backend
  useEffect(() => {
    fetch(`${API}/api/v1/push/vapid-key`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.public_key) setVapidKey(d.public_key) })
      .catch(() => {})
  }, [])

  // Convert base64url VAPID key to Uint8Array
  const getApplicationServerKey = useCallback(() => {
    if (!vapidKey) return null
    const padding = '='.repeat((4 - vapidKey.length % 4) % 4)
    const base64 = (vapidKey + padding).replace(/-/g, '+').replace(/_/g, '/')
    const raw = atob(base64)
    return Uint8Array.from(raw, c => c.charCodeAt(0))
  }, [vapidKey])

  // Subscribe to push for a specific launch
  const subscribe = useCallback(async (launchId) => {
    if (!supported || !vapidKey || !swReg.current || !('Notification' in window)) return false

    // Request permission if needed
    if (window.Notification.permission === 'default') {
      const result = await window.Notification.requestPermission()
      setPermission(result)
      if (result !== 'granted') return false
    }
    if (window.Notification.permission !== 'granted') return false

    try {
      const sub = await swReg.current.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: getApplicationServerKey(),
      })
      const keys = sub.toJSON()

      await fetch(`${API}/api/v1/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          key_p256dh: keys.keys.p256dh,
          key_auth: keys.keys.auth,
          launch_id: launchId,
        }),
      })
      return true
    } catch {
      return false
    }
  }, [supported, vapidKey, swReg, getApplicationServerKey])

  // Unsubscribe from a specific launch
  const unsubscribe = useCallback(async (launchId) => {
    if (!swReg.current) return
    try {
      const sub = await swReg.current.pushManager.getSubscription()
      if (!sub) return

      await fetch(`${API}/api/v1/push/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          launch_id: launchId,
        }),
      })
    } catch {}
  }, [swReg])

  // Check if subscribed to a specific launch
  const checkSubscription = useCallback(async (launchId) => {
    if (!swReg.current) return false
    try {
      const sub = await swReg.current.pushManager.getSubscription()
      if (!sub) return false

      const res = await fetch(`${API}/api/v1/push/check?endpoint=${encodeURIComponent(sub.endpoint)}&launch_id=${encodeURIComponent(launchId)}`)
      const data = await res.json()
      return data.subscribed === true
    } catch {
      return false
    }
  }, [swReg])

  return { supported, permission, subscribe, unsubscribe, checkSubscription }
}
