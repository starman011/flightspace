// Screen-space picking on the globe projects every entity to 2D and picks the
// nearest to the cursor. That has no notion of depth, so an entity on the FAR
// hemisphere (behind the Earth) can project near the cursor and steal a click
// from a visible entity on the near side. This helper answers "is P hidden
// behind the globe from the camera?" so the picker can skip occluded entities.
//
// Geometry: the Earth is a sphere of radius R centered at the origin. P is
// occluded if the segment camera(O) -> P enters the sphere before reaching P,
// i.e. the quadratic |O + t*(P-O)|^2 = R^2 has a near root t in (0, 1).

export function segmentOccludedBySphere(ox, oy, oz, px, py, pz, R) {
  const dx = px - ox, dy = py - oy, dz = pz - oz
  const a = dx * dx + dy * dy + dz * dz
  if (a === 0) return false
  const b = 2 * (ox * dx + oy * dy + oz * dz)
  const c = ox * ox + oy * oy + oz * oz - R * R
  const disc = b * b - 4 * a * c
  if (disc <= 0) return false                     // ray misses the globe
  const t = (-b - Math.sqrt(disc)) / (2 * a)      // near intersection
  return t > 1e-4 && t < 1 - 1e-4                 // globe is hit strictly before P
}
