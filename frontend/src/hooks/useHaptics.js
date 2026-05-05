import { useEffect } from 'react'

// Global haptic feedback for mobile taps.
// Attaches once at app root — fires light vibration on any
// button, [role=button], or clickable element tap.

const can = typeof navigator !== 'undefined' && 'vibrate' in navigator
const isTouch = typeof window !== 'undefined' && 'ontouchstart' in window

export function useHaptics() {
  useEffect(() => {
    if (!can || !isTouch) return

    function handler(e) {
      const el = e.target.closest('button, [role="button"], a, [data-haptic]')
      if (!el) return

      // Heavier feedback for primary actions
      if (el.hasAttribute('data-haptic-heavy')) {
        navigator.vibrate([15, 25, 15])
      } else {
        navigator.vibrate(8)
      }
    }

    document.addEventListener('pointerdown', handler, { passive: true })
    return () => document.removeEventListener('pointerdown', handler)
  }, [])
}
