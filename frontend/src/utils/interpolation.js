/**
 * Linear interpolation between two lat/lon positions.
 * t should be in [0, 1].
 */
export function lerpPosition(prev, next, t) {
  const f = Math.min(1, Math.max(0, t))
  return {
    lat: prev.lat + (next.lat - prev.lat) * f,
    lon: prev.lon + (next.lon - prev.lon) * f,
  }
}

/**
 * Heading interpolation over the shortest arc.
 * Correctly handles the 350° → 10° wrap-around through 0°.
 */
export function lerpHeading(prev, next, t) {
  if (prev == null || next == null) return next ?? prev
  const f = Math.min(1, Math.max(0, t))
  let diff = next - prev
  if (diff > 180)  diff -= 360
  if (diff < -180) diff += 360
  return (prev + diff * f + 360) % 360
}

/**
 * Linear altitude interpolation.
 */
export function lerpAltitude(prev, next, t) {
  if (prev == null || next == null) return next ?? prev
  const f = Math.min(1, Math.max(0, t))
  return prev + (next - prev) * f
}

/**
 * Compute interpolation factor t given:
 * - prevTs: unix timestamp (ms) of last known position
 * - updatePeriodMs: expected update interval (default 5000ms)
 * Returns t in [0, 1]
 */
export function interpolationFactor(prevTs, updatePeriodMs = 5000) {
  const elapsed = Date.now() - prevTs
  return Math.min(1, elapsed / updatePeriodMs)
}
