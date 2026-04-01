/**
 * DeviceOrientationAR
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages DeviceOrientation events and drives a Three.js camera to match
 * the user's real-world phone orientation — "point at the sky" AR mode.
 *
 * Usage:
 *   const ar = createDeviceOrientationAR(camera, controls)
 *   await ar.enable()   // requests permission, starts listening
 *   ar.disable()        // stops listening, restores camera control
 *   ar.update()         // call each frame when active
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
  let alpha = 0    // compass heading (Z axis, 0-360)
  let beta = 90    // pitch (X axis, -180 to 180)
  let gamma = 0    // roll (Y axis, -90 to 90)
  let compassHeading = 0
  let savedPosition = null
  let savedControlsEnabled = true

  function onDeviceOrientation(e) {
    if (!active) return
    // iOS provides webkitCompassHeading (true north)
    // Android: heading = (360 - alpha) % 360
    compassHeading = e.webkitCompassHeading ?? ((360 - (e.alpha || 0)) % 360)
    alpha = e.alpha || 0
    beta = e.beta || 0
    gamma = e.gamma || 0
  }

  async function enable() {
    if (!isMobile()) throw new Error('AR requires a mobile device with gyroscope')
    await requestPermission()

    // Save camera state
    savedPosition = camera.position.clone()
    savedControlsEnabled = controls.enabled

    // Disable orbit controls while AR is active
    controls.enabled = false

    // Start listening
    window.addEventListener('deviceorientation', onDeviceOrientation, true)
    active = true
  }

  function disable() {
    active = false
    window.removeEventListener('deviceorientation', onDeviceOrientation, true)

    // Restore
    if (savedPosition) camera.position.copy(savedPosition)
    controls.enabled = savedControlsEnabled
  }

  function update() {
    if (!active) return

    // Convert device orientation to camera rotation
    // When phone is held upright (portrait) and pointed at sky:
    //   beta ≈ 90° = horizon, beta > 90 = above horizon (toward zenith)
    //   alpha = compass heading (or webkitCompassHeading on iOS)
    //   gamma = left/right tilt

    // Azimuth (compass direction the phone is pointing)
    const az = compassHeading * DEG

    // Altitude (how far above horizon phone is tilted)
    // beta = 90 → horizon, beta = 0 → straight up (zenith)
    // Map: beta → altitude angle
    const alt = (beta - 90) * DEG  // 0° at horizon, +90° at zenith

    // Roll
    const roll = gamma * DEG

    // Apply rotation in ZXY order (standard for device orientation → camera)
    camera.rotation.order = 'ZXY'
    camera.rotation.x = alt          // pitch: horizon to zenith
    camera.rotation.y = -az          // yaw: compass heading (negate for Three.js)
    camera.rotation.z = -roll        // roll
  }

  function isActive() { return active }

  function isSupported() {
    return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window
  }

  function isMobile() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  }

  return { enable, disable, update, isActive, isSupported, isMobile }
}
