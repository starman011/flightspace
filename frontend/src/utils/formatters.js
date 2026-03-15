// Stub — fully implemented in Phase 7 (US3)
export function formatAltitude(ft) {
  if (ft == null) return null
  return `${Math.round(ft).toLocaleString()} ft`
}

export function formatSpeed(knots) {
  if (knots == null) return null
  return `${Math.round(knots)} kts`
}

export function formatHeading(deg) {
  if (deg == null) return null
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const idx = Math.round(deg / 45) % 8
  return `${dirs[idx]} (${Math.round(deg)}°)`
}

export function formatCallsign(cs) {
  if (!cs) return null
  return cs.trim().toUpperCase()
}

export function formatRoute(origin, dest) {
  if (origin && dest) return `${origin} → ${dest}`
  return null
}
