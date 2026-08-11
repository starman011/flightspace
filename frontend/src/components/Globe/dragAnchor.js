import { Vector3, Quaternion } from 'three'

/**
 * Ground-anchored drag ("grab the Earth").
 *
 * The previous model scaled OrbitControls' rotation ANGLE by altitude. That
 * can never feel right at more than one altitude at a time: an angle is a
 * property of the globe, but what the user is judging is how far the ground
 * moved under their finger, which also depends on how much ground is on
 * screen. Every recalibration fixed one altitude and broke another.
 *
 * Anchoring inverts the problem. Instead of asking "how fast should this
 * drag rotate?", it asks "what rotation puts the point I grabbed back under
 * the cursor?" — which has exactly one answer at every altitude, with no
 * tuning constant. Predictability is not tuned in; it is what the model IS.
 */

/**
 * Nearest intersection of a ray with a sphere of radius `R` at the origin.
 * Returns null if the ray misses or the sphere is entirely behind it.
 */
export function raySphere(origin, dir, R = 1) {
  const d = dir.clone().normalize()
  const b = origin.dot(d)
  const c = origin.dot(origin) - R * R
  const disc = b * b - c
  if (disc < 0) return null            // misses entirely
  const sq = Math.sqrt(disc)
  // Near root first; fall back to the far one when the camera is inside.
  const t = -b - sq >= 0 ? -b - sq : -b + sq
  if (t < 0) return null               // sphere is behind the camera
  return origin.clone().addScaledVector(d, t)
}

/**
 * Like `raySphere`, but never fails while the ray still points somewhere
 * meaningful: if it misses, return the point on the sphere closest to it (the
 * limb).
 *
 * A drag that slips past the edge of the globe — easy to do at high altitude,
 * and unavoidable at grazing angles near the horizon where the true
 * intersection is numerically unstable — would otherwise lose its anchor and
 * either freeze or jump.
 */
export function raySphereOrLimb(origin, dir, R = 1) {
  const hit = raySphere(origin, dir, R)
  if (hit) return hit
  const d = dir.clone().normalize()
  // Closest approach of the ray to the centre, pushed out onto the sphere.
  const t = Math.max(0, -origin.dot(d))
  const near = origin.clone().addScaledVector(d, t)
  const len = near.length()
  if (len < 1e-9) return null          // ray passes through the centre
  return near.multiplyScalar(R / len)
}

/**
 * Rotation that carries `from` onto `to` (both treated as directions).
 *
 * Applied to the camera, this is what re-anchors the grab: the ray through the
 * unchanged screen position currently strikes `from`, so rotating the camera
 * by this makes it strike `to` instead.
 */
export function anchorQuaternion(from, to) {
  return new Quaternion().setFromUnitVectors(
    from.clone().normalize(),
    to.clone().normalize(),
  )
}

/**
 * Angle in radians of a quaternion — the per-frame drag speed, used to seed
 * momentum on release.
 */
export function quatAngle(q) {
  return 2 * Math.acos(Math.min(1, Math.abs(q.w)))
}

/**
 * Camera position after re-anchoring a drag.
 *
 * `grabbed` is the world-space point picked at pointerdown; `underCursor` is
 * what the ray through the CURRENT pointer position hits right now. Returns
 * the rotated position, preserving distance exactly (a rotation cannot change
 * length), so this composes with zoom without fighting it.
 */
export function anchoredCameraPosition(camPos, underCursor, grabbed) {
  const q = anchorQuaternion(underCursor, grabbed)
  return camPos.clone().applyQuaternion(q)
}

export { Vector3, Quaternion }
