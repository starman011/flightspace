// Haptic feedback via Vibration API (Android Chrome, etc.)
// Silent no-op on unsupported browsers (iOS Safari)

const can = typeof navigator !== 'undefined' && 'vibrate' in navigator

export function tapHaptic()    { can && navigator.vibrate(8)  }
export function selectHaptic() { can && navigator.vibrate(15) }
export function heavyHaptic()  { can && navigator.vibrate([20, 30, 20]) }
