/**
 * Solar System Constants
 * Pure data — no Three.js imports.
 *
 * Scale: 1 World Unit (WU) = 1 Earth radius = 6,371 km
 * All distances in WU unless noted.
 */

// ── Scale factors ──────────────────────────────────────────────────────────
export const EARTH_RADIUS_KM = 6371
export const SOLAR_SCALE     = 1          // 1 WU = 1 Earth radius
export const KM_TO_WU        = 1 / EARTH_RADIUS_KM
export const AU_KM           = 149_597_870.7
export const AU_TO_WU        = AU_KM * KM_TO_WU  // ~23_480

// ── Sun ────────────────────────────────────────────────────────────────────
export const SUN_RADIUS_WU = 109  // Sun radius ≈ 109 Earth radii

// ── Planet physical radii (WU = Earth radii) ──────────────────────────────
export const PLANET_RADIUS_WU = {
  mercury: 0.383,
  venus:   0.949,
  earth:   1.000,
  mars:    0.532,
  jupiter: 11.21,
  saturn:  9.449,
  uranus:  4.007,
  neptune: 3.883,
}

// ── Planet mean orbital radii (AU) ────────────────────────────────────────
export const PLANET_ORBIT_AU = {
  mercury: 0.387,
  venus:   0.723,
  earth:   1.000,
  mars:    1.524,
  jupiter: 5.203,
  saturn:  9.537,
  uranus:  19.19,
  neptune: 30.07,
}

// ── Planet display order ───────────────────────────────────────────────────
export const PLANET_NAMES = [
  'mercury', 'venus', 'earth', 'mars',
  'jupiter', 'saturn', 'uranus', 'neptune',
]

// ── Fallback colours (used until textures load) ────────────────────────────
export const PLANET_COLOR = {
  mercury: 0x8c8c8c,
  venus:   0xe8cda0,
  earth:   0x2a6bc9,
  mars:    0xc1440e,
  jupiter: 0xc88b3a,
  saturn:  0xe4d191,
  uranus:  0x7de8e8,
  neptune: 0x3f54ba,
}

// ── Texture paths — served from /public/textures/planets/ ─────────────────
// Files must be present; fallback colour used while loading.
export const PLANET_TEXTURE = {
  sun:          '/textures/planets/sun.jpg',
  mercury:      '/textures/planets/mercury.jpg',
  venus:        '/textures/planets/venus.jpg',
  earth_day:    '/textures/planets/earth_day.jpg',
  earth_night:  '/textures/planets/earth_night.jpg',
  earth_clouds: '/textures/planets/earth_clouds.jpg',
  moon:         '/textures/planets/moon.jpg',
  mars:         '/textures/planets/mars.jpg',
  jupiter:      '/textures/planets/jupiter.jpg',
  saturn:       '/textures/planets/saturn.jpg',
  saturn_ring:  '/textures/planets/saturn_ring.png',
  uranus:       '/textures/planets/uranus.jpg',
  neptune:      '/textures/planets/neptune.jpg',
}

// ── Saturn ring geometry ───────────────────────────────────────────────────
export const SATURN_RING_INNER = 1.2  // × Saturn radius
export const SATURN_RING_OUTER = 2.3  // × Saturn radius

// ── Camera presets (WU) ───────────────────────────────────────────────────
// Used by the camera scale controller when switching filters.
export const CAM_SOLAR = {
  position: [0, AU_TO_WU * 14, AU_TO_WU * 8],  // higher angle, see all 8 planets
  minDist:  AU_TO_WU * 0.3,
  maxDist:  AU_TO_WU * 220,  // zoom out past Voyager (~160 AU)
}

// Far clip for solar camera — must cover camera-at-maxDist + object-at-maxDist
export const SOLAR_FAR = AU_TO_WU * 480   // ~11.3M WU, 480 AU

// Galaxy / night sky view — camera at origin, inside 480 WU celestial sphere
export const CAM_GALAXY = {
  position: [0, 0, 0.01],
  minDist:  0.01,
  maxDist:  400,
  // Deep space opens "zoomed in" (telephoto) so the DESI cloud reads as
  // structure instead of a dense blob. The camera's normal FOV is 40; 28 is a
  // clear (but not extreme) zoom-in. Pinch/wheel still adjusts within range.
  fov:      28,   // default field of view in degrees
  fovMin:   12,   // most zoomed-in
  fovMax:   60,   // most zoomed-out
}

export const CAM_EARTH = {
  position: [0, 0, 3.5],   // ~2,200 km altitude — shows full globe
  minDist:  1.001,          // just above surface
  maxDist:  60,             // ~380,000 km (Moon distance)
}

export const CAM_MOON = {
  position: [0, 0, 0.8],   // ~550 km above Moon surface (Moon radius = 0.2727 WU)
  minDist:  0.28,           // just above surface
  maxDist:  3,              // far enough to see full Moon
}

// ── Tween duration matches design.md motion spec ──────────────────────────
export const CAM_TWEEN_MS = 1400
// Moon transition is cinematic — longer + curved flight path
export const CAM_MOON_TWEEN_MS = 2400
