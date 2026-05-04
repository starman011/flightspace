import { useState, useEffect, useCallback, useRef } from 'react'

const LS_DISMISSED = 'fs.pwa_dismissed.v1'
const LS_INSTALLED = 'fs.pwa_installed.v1'
const SHOW_DELAY = 30_000 // 30s engagement before showing

export function usePWAInstall() {
  const [canInstall, setCanInstall] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const deferredRef = useRef(null)

  useEffect(() => {
    // Already installed or dismissed within 30 days
    if (localStorage.getItem(LS_INSTALLED)) return
    const dismissed = localStorage.getItem(LS_DISMISSED)
    if (dismissed && Date.now() - Number(dismissed) < 30 * 86400_000) return

    // Already in standalone mode = already installed
    if (window.matchMedia('(display-mode: standalone)').matches) return

    const handler = (e) => {
      e.preventDefault()
      deferredRef.current = e
      setCanInstall(true)
    }
    window.addEventListener('beforeinstallprompt', handler)

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Show after engagement delay
  useEffect(() => {
    if (!canInstall) return
    const timer = setTimeout(() => setShowPrompt(true), SHOW_DELAY)
    return () => clearTimeout(timer)
  }, [canInstall])

  const install = useCallback(async () => {
    const prompt = deferredRef.current
    if (!prompt) return false
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    deferredRef.current = null
    setCanInstall(false)
    setShowPrompt(false)
    if (outcome === 'accepted') {
      localStorage.setItem(LS_INSTALLED, '1')
      return true
    }
    return false
  }, [])

  const dismiss = useCallback(() => {
    setShowPrompt(false)
    localStorage.setItem(LS_DISMISSED, String(Date.now()))
  }, [])

  return { showPrompt, install, dismiss }
}
