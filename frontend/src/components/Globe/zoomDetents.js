// Camera feel helpers for the globe: how fast a drag rotates, and where zoom
// comes to rest. Both are pure so they can be tested without a WebGL context.

const EARTH_R_KM = 6371

/**
 * Altitude rungs the camera settles onto, in km above the surface.
 *
 * Spacing is roughly geometric (~2x, widening to ~3.7x in deep space) rather
 * than a few round numbers. The original ladder jumped straight from 5 km to
 * 0.13 km — a 38x drop — so zooming in below 5 km teleported you to the
 * ground, which read as "zoom gets really fast under 20 km". Every rung is
 * now within ~3.7x of its neighbour, so a step down is always a step rather
 * than a fall.
 *
 * 5 / 10 / 20 / 100 are kept as named rungs; the additions sit between them.
 */
export const DETENTS_KM = [
  0.13, 0.3, 0.6, 1.2, 2.5,      // ground work: runway to circuit height
  5, 10, 20, 50, 100,            // approach and low cruise
  250, 600, 1500, 4000,          // high cruise to near space
  12000, 44597,                  // orbital and full-globe
]

/** Camera distance in world units for an altitude in km (Earth radius = 1). */
export const distForKm = (km) => 1 + km / EARTH_R_KM

/** Altitude in km for a camera distance in world units. */
export const kmForDist = (d) => (d - 1) * EARTH_R_KM

/**
 * Altitude after one zoom step, clamped to the reachable range.
 *
 * The step multiplies ALTITUDE, not distance-from-centre. OrbitControls does
 * the latter, and near the surface distance-from-centre is ~1.0 whatever your
 * altitude, so one notch meant wildly different things at different heights:
 * at 127 m a notch in scaled 1.00002 to ~0.95 — inside the planet, so it
 * clamped and zoom-in simply stalled — while a notch out jumped straight from
 * 127 m to 336 km. Scaling altitude makes a notch the same proportional step
 * everywhere, which is what "zoom feels consistent" actually means.
 */
export function altitudeAfterZoom(h, factor, hMin, hMax) {
  return Math.min(hMax, Math.max(hMin, Math.max(h, hMin) * factor))
}

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
