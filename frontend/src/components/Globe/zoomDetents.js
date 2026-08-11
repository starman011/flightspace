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
 * The exponent is exactly 1. Anything less makes the drag progressively too
 * fast as you descend, which is the bug this is fixing: at 0.8, a drag at
 * 100 km covered 4.2x more screen than the same drag from orbit. Strict
 * proportionality is what makes response *uniform* at every altitude, which is
 * the entire goal. At h = 7 (maxDistance 8) this returns 1.0, so the
 * high-altitude feel that already worked is preserved exactly.
 *
 * `topSpeed` is the rate at the top of the range (h = ref), and 0.38 is not
 * arbitrary: it is what the previous hand-tuned curve
 * `0.06 + t^1.5 * 0.32` produced at full altitude, which is the feel users
 * reported as good. Everything below scales down linearly from it.
 *
 * That old curve is what this replaces. Its floor term of 0.06 meant the
 * *slowest* it ever got was 0.06 — at 127 m altitude the correct rate is
 * ~1.1e-6, so it was roughly 55,000x too fast at the bottom of the range,
 * which is why drag near the ground flung across continents.
 *
 * The floor here exists only to keep the value positive. It must stay below
 * the speed at minimum altitude or it silently pins low-altitude drag to a
 * fixed rate, reintroducing the same class of bug.
 */
export function rotateSpeedForAltitude(h, { ref = 7, topSpeed = 0.38, exponent = 1, min = 1e-9 } = {}) {
  const safe = Math.max(h, 0)
  return Math.max(min, Math.min(topSpeed, topSpeed * Math.pow(safe / ref, exponent)))
}
