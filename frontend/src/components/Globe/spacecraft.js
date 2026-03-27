/**
 * spacecraft.js
 * ─────────────────────────────────────────────────────────────────────────────
 * State vectors and visual config for notable spacecraft.
 * Positions are heliocentric ecliptic J2000 (AU), matching the Three.js
 * solar scene coordinate system (Y = ecliptic north, X/Z = ecliptic plane).
 *
 * Reference epoch: 2024-01-01 00:00 UTC
 * Sources: NASA JPL Horizons, Eyes on the Solar System
 */

export const SC_REF_MS = Date.UTC(2024, 0, 1)  // 2024-01-01 UTC

// ── Catalog ──────────────────────────────────────────────────────────────────
// pos: [eclX, eclY, eclZ] AU at SC_REF_MS
// vel: [vx, vy, vz] AU/day at SC_REF_MS (linear propagation, fine for outer probes)
// orbital: use Keplerian propagation instead (for inner-system probes)

export const SPACECRAFT_CATALOG = [
  {
    id:      'voyager1',
    name:    'Voyager 1',
    label:   'VOYAGER 1',
    desc:    'Interstellar · 161 AU',
    color:   0x00ff99,
    dotSize: 1400,
    // ~161 AU, ecliptic lon 258.8°, lat +35.6°
    pos: [-25.3,  93.4, -127.9],
    vel: [-0.001553, 0.005729, -0.007848],
    trail: true,
  },
  {
    id:      'voyager2',
    name:    'Voyager 2',
    label:   'VOYAGER 2',
    desc:    'Interstellar · 135 AU',
    color:   0x4499ff,
    dotSize: 1400,
    // ~135 AU, ecliptic lon 218°, lat −32°
    pos: [-89.9, -71.3, -70.3],
    vel: [-0.005925, -0.004699, -0.004633],
    trail: true,
  },
  {
    id:      'newhorizons',
    name:    'New Horizons',
    label:   'NEW HORIZONS',
    desc:    'Kuiper Belt · 57 AU',
    color:   0xffaa00,
    dotSize: 1200,
    // ~57 AU, ecliptic lon 314°, lat +2.5°
    pos: [38.2,  2.5, -42.4],
    vel: [ 0.005325,  0.000347, -0.005905],
    trail: true,
  },
  {
    id:      'parker',
    name:    'Parker Solar Probe',
    label:   'PARKER',
    desc:    'Solar orbit · 0.046–1.0 AU',
    color:   0xff5500,
    dotSize: 900,
    // High-eccentricity orbit — simplified Keplerian
    orbital: { a: 0.543, e: 0.846, i: 3.4, om: 165, w: 130, refMeanAnomaly: 45, period: 146.2 },
    trail: false,
  },
  {
    id:      'juno',
    name:    'Juno',
    label:   'JUNO',
    desc:    'Jupiter orbit',
    color:   0xff44dd,
    dotSize: 900,
    // Juno orbits Jupiter — place it close to Jupiter with a small offset
    orbitsBody: 'jupiter',
    offsetAU: 0.007,   // ~1M km offset from Jupiter centre
    trail: false,
  },
  {
    id:      'jwst',
    name:    'James Webb ST',
    label:   'WEBB',
    desc:    'Sun–Earth L2 · 1.5M km',
    color:   0x88ccff,
    dotSize: 900,
    // L2 is 1.5M km (0.01 AU) from Earth in anti-Sun direction
    orbitsBody: 'earth_l2',
    trail: false,
  },
]

// ── Position computation ──────────────────────────────────────────────────────

// Linear propagation from state vector (valid for outer-system probes for decades)
export function propagateLinear(craft) {
  const days = (Date.now() - SC_REF_MS) / 86400000
  return [
    (craft.pos[0] + craft.vel[0] * days),
    (craft.pos[1] + craft.vel[1] * days),
    (craft.pos[2] + craft.vel[2] * days),
  ]
}

// Simplified Keplerian position for inner-system probes
export function propagateKeplerian(orb) {
  const { a, e, i: iDeg, om: omDeg, w: wDeg, refMeanAnomaly, period } = orb
  const days = (Date.now() - SC_REF_MS) / 86400000
  const M = ((refMeanAnomaly + (days / period) * 360) % 360) * Math.PI / 180

  // Solve Kepler's equation
  let E = M
  for (let k = 0; k < 10; k++) E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))

  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2))
  const r  = a * (1 - e * Math.cos(E))

  const iR  = iDeg  * Math.PI / 180
  const omR = omDeg * Math.PI / 180
  const wR  = wDeg  * Math.PI / 180
  const wNu = wR + nu
  const cosOm = Math.cos(omR), sinOm = Math.sin(omR)
  const cosI  = Math.cos(iR)
  const sinI  = Math.sin(iR)

  return [
    r * (cosOm * Math.cos(wNu) - sinOm * Math.sin(wNu) * cosI),
    r * sinI * Math.sin(wNu),
    r * (sinOm * Math.cos(wNu) + cosOm * Math.sin(wNu) * cosI),
  ]
}
