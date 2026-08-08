// Camera feel helpers for the globe: how fast a drag rotates, and where zoom
// comes to rest. Both are pure so they can be tested without a WebGL context.

const EARTH_R_KM = 6371

/**
 * Altitude rungs the camera settles onto, in km above the surface.
 * The low end is deliberately tight (5 / 10 / 20) because that is where the
 * sense of "how high am I" actually matters — above ~500 km everything reads
 * as "space" and the rungs only need to be order-of-magnitude apart.
 */
export const DETENTS_KM = [0.13, 5, 10, 20, 100, 500, 2000, 10000, 44597]

/** Camera distance in world units for an altitude in km (Earth radius = 1). */
export const distForKm = (km) => 1 + km / EARTH_R_KM

/** Altitude in km for a camera distance in world units. */
export const kmForDist = (d) => (d - 1) * EARTH_R_KM

/**
 * Index of the rung closest to `altKm`, compared in LOG space.
 *
 * Linear distance would be wrong here: the ladder spans five decades, so
 * 0.13 km and 20 km are "equally close" to 10 km under linear comparison and
 * every rung below 500 km collapses toward the top of the ladder — the low
 * rungs would be unreachable. Log space makes closeness proportional.
 */
export function nearestDetent(altKm, ladder = DETENTS_KM) {
  const a = Math.log(Math.max(altKm, ladder[0]))
  let best = 0
  let bestErr = Infinity
  for (let i = 0; i < ladder.length; i++) {
    const err = Math.abs(a - Math.log(ladder[i]))
    if (err < bestErr) {
      bestErr = err
      best = i
    }
  }
  return best
}

/**
 * Rotate speed for a camera at height `h` above the surface (world units,
 * Earth radius = 1).
 *
 * OrbitControls rotates by a fixed ANGLE per pixel dragged. Ground travel for
 * a given angle is constant, but the ground *visible on screen* shrinks with
 * altitude — so near the surface a normal drag whipped across whole countries.
 * Screen-space travel is proportional to altitude, hence the scaling.
 *
 * The 0.8 exponent softens a strict 1:1 mapping. Pure proportionality is
 * physically "correct" but makes low-altitude travel feel stuck, since you'd
 * need dozens of drags to cross a city. At the top of the range (h = 7, the
 * maxDistance of 8) this returns 1.0, preserving the high-altitude feel that
 * users already reported as good.
 */
export function rotateSpeedForAltitude(h, { ref = 7, exponent = 0.8, min = 3e-5, max = 1 } = {}) {
  const safe = Math.max(h, 1e-7)
  return Math.min(max, Math.max(min, Math.pow(safe / ref, exponent)))
}
