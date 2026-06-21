/**
 * DeviceOrientationAR
 * ─────────────────────────────────────────────────────────────────────────────
 * Two modes:
 *   Mobile:  DeviceOrientation-driven camera — "point at the sky" AR
 *   Desktop: Mouse drag free-look — click-drag to look around the celestial sphere
 *
 * Both modes disable OrbitControls and directly control camera rotation.
 */

const DEG = Math.PI / 180

// ── Permission request (iOS 13+) ────────────────────────────────────────────
async function requestPermission() {
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    const perm = await DeviceOrientationEvent.requestPermission()
    if (perm !== 'granted') throw new Error('Device orientation permission denied')
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────
export function createDeviceOrientationAR(camera, controls) {
  let active = false
  let mode = null // 'device' or 'mouse'

  // Device orientation state
  let compassHeading = 0
  let beta = 90
  let gamma = 0

  let gotEvent = false   // did any deviceorientation event actually fire?

  // Smoothed orientation (low-pass) to kill sensor jitter.
  let sAlpha = 0, sBeta = 90, sGamma = 0, primed = false
  const SMOOTH = 0.18   // 0..1, higher = snappier
  const lerpAngle = (a, b, t) => {
    const d = ((b - a + 540) % 360) - 180
    return a + d * t
  }
  function screenAngle() {
    const o = (screen.orientation && screen.orientation.angle)
    return (o != null ? o : (window.orientation || 0)) * DEG
  }

  // Mouse free-look state
  let yaw = 0
  let pitch = 0
  let dragging = false
  let lastX = 0, lastY = 0

  // Saved state for restore
  let savedControlsEnabled = true

  const _mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

  // ── Device orientation handler ─────────────────────────────────────────────
  function onDeviceOrientation(e) {
    if (!active || mode !== 'device') return
    gotEvent = true
    const rawHeading = e.webkitCompassHeading ?? ((360 - (e.alpha || 0)) % 360)
    if (!primed) { sAlpha = rawHeading; sBeta = e.beta || 90; sGamma = e.gamma || 0; primed = true }
    sAlpha = lerpAngle(sAlpha, rawHeading, SMOOTH)
    sBeta  = sBeta  + ((e.beta  || 0) - sBeta)  * SMOOTH
    sGamma = sGamma + ((e.gamma || 0) - sGamma) * SMOOTH
    compassHeading = sAlpha; beta = sBeta; gamma = sGamma
  }

  // ── Mouse handlers for desktop free-look ───────────────────────────────────
  function onMouseDown(e) {
    if (!active || mode !== 'mouse') return
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
  }

  function onMouseMove(e) {
    if (!active || mode !== 'mouse' || !dragging) return
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    yaw -= dx * 0.003
    pitch -= dy * 0.003
    // Clamp pitch to avoid flipping
    pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch))
  }

  function onMouseUp() { dragging = false }

  // ── Enable ─────────────────────────────────────────────────────────────────
  async function enable() {
    savedControlsEnabled = controls.enabled
    controls.enabled = false

    if (_mobile) {
      gotEvent = false
      await requestPermission()
      window.addEventListener('deviceorientation', onDeviceOrientation, true)
      mode = 'device'
    } else {
      // Desktop: free-look via mouse drag
      const el = controls.domElement
      el.addEventListener('mousedown', onMouseDown)
      el.addEventListener('mousemove', onMouseMove)
      el.addEventListener('mouseup', onMouseUp)
      el.addEventListener('mouseleave', onMouseUp)
      // Initialize yaw/pitch from current camera rotation
      yaw = camera.rotation.y
      pitch = camera.rotation.x
      mode = 'mouse'
    }
    active = true
  }

  function disable() {
    active = false
    primed = false

    if (mode === 'device') {
      window.removeEventListener('deviceorientation', onDeviceOrientation, true)
    } else if (mode === 'mouse') {
      const el = controls.domElement
      el.removeEventListener('mousedown', onMouseDown)
      el.removeEventListener('mousemove', onMouseMove)
      el.removeEventListener('mouseup', onMouseUp)
      el.removeEventListener('mouseleave', onMouseUp)
    }

    mode = null
    controls.enabled = savedControlsEnabled
  }

  function update() {
    if (!active) return

    if (mode === 'device') {
      const az = compassHeading * DEG
      const alt = (beta - 90) * DEG
      const roll = gamma * DEG + screenAngle()   // compensate portrait/landscape
      camera.rotation.order = 'ZXY'
      camera.rotation.x = -alt                    // tilt up → look up (was inverted)
      camera.rotation.y = -az
      camera.rotation.z = -roll
    } else if (mode === 'mouse') {
      camera.rotation.order = 'YXZ'
      camera.rotation.x = pitch
      camera.rotation.y = yaw
      camera.rotation.z = 0
    }
  }

  function isActive() { return active }
  function isMobile() { return _mobile }

  function hadMotion() { return gotEvent }

  return { enable, disable, update, isActive, isMobile, hadMotion }
}
