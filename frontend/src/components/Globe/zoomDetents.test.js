import { describe, it, expect } from 'vitest'
import {
  DETENTS_KM,
  altitudeAfterZoom,
  distForKm,
  kmForDist,
  nearestDetent,
} from './zoomDetents.js'

describe('altitudeAfterZoom', () => {
  const H_MIN = 1.00002 - 1   // ~127 m
  const H_MAX = 8 - 1         // ~44,600 km
  const step = (h, f) => altitudeAfterZoom(h, f, H_MIN, H_MAX)

  it('applies the SAME proportional step at every altitude', () => {
    // The bug was that a notch meant different things at different heights.
    // Uniformity is the fix, so assert it directly. H_MIN is excluded on
    // purpose: it is the clamp boundary, where a further step inward
    // correctly does nothing (covered by its own test below).
    for (const h of [1e-4, 1e-3, 0.0157, 0.5, 3, H_MAX / 2]) {
      expect(step(h, 0.9) / h).toBeCloseTo(0.9, 9)
    }
  })

  it('zoom in then out returns you where you started', () => {
    for (const h of [1e-4, 1e-3, 0.0157, 0.5, 3]) {
      expect(step(step(h, 0.85), 1 / 0.85)).toBeCloseTo(h, 12)
    }
  })

  it('a single notch near the ground is a small step, not a 336 km jump', () => {
    // Scaling distance-from-centre made one notch out at 127 m land at
    // ~336 km. Altitude scaling keeps it proportional.
    const out = step(H_MIN, 1 / 0.9)
    expect(kmForDist(1 + out)).toBeLessThan(0.2)   // still ~140 m, not 336 km
  })

  it('zoom in at minimum altitude cannot go below the surface', () => {
    // Distance scaling drove d below 1.0 here — inside the planet — so the
    // clamp fired and zoom-in stalled entirely.
    const inward = step(H_MIN, 0.5)
    expect(inward).toBe(H_MIN)
    expect(1 + inward).toBeGreaterThanOrEqual(1)
  })

  it('clamps at both ends without overshooting', () => {
    expect(step(H_MAX, 2)).toBe(H_MAX)
    expect(step(H_MIN, 0.001)).toBe(H_MIN)
    expect(step(H_MAX / 2, 100)).toBe(H_MAX)
  })

  it('repeated notches traverse the whole range in a sane number of steps', () => {
    // Ground to orbit should take tens of notches, not thousands (unusable)
    // or three (uncontrollable).
    let h = H_MIN
    let n = 0
    while (h < H_MAX && n < 10_000) { h = step(h, 1 / 0.9); n++ }
    expect(n).toBeGreaterThan(20)
    expect(n).toBeLessThan(200)
  })
})

describe('nearestDetent', () => {
  it('snaps to the rung you are sitting on', () => {
    DETENTS_KM.forEach((km, i) => {
      expect(nearestDetent(km)).toBe(i)
    })
  })

  it('reaches every low rung — the reason comparison is in log space', () => {
    // Under linear comparison these all collapse upward and 5/10/20 become
    // unreachable, which is exactly the bug this replaced.
    expect(DETENTS_KM[nearestDetent(6)]).toBe(5)
    expect(DETENTS_KM[nearestDetent(9)]).toBe(10)
    expect(DETENTS_KM[nearestDetent(17)]).toBe(20)
    expect(DETENTS_KM[nearestDetent(1.1)]).toBe(1.2)
    expect(DETENTS_KM[nearestDetent(0.14)]).toBe(0.13)
  })

  it('clamps below the floor and above the ceiling', () => {
    expect(nearestDetent(0)).toBe(0)
    expect(nearestDetent(-5)).toBe(0)
    expect(nearestDetent(1e9)).toBe(DETENTS_KM.length - 1)
  })

  it('picks the geometric midpoint consistently', () => {
    // Midpoint of 5 and 10 in log space is sqrt(50) ≈ 7.07.
    expect(DETENTS_KM[nearestDetent(7.0)]).toBe(5)
    expect(DETENTS_KM[nearestDetent(7.2)]).toBe(10)
  })

  it('ladder is sorted ascending and free of duplicates', () => {
    for (let i = 1; i < DETENTS_KM.length; i++) {
      expect(DETENTS_KM[i]).toBeGreaterThan(DETENTS_KM[i - 1])
    }
  })

  it('has no cliff between rungs — the cause of "zoom gets really fast"', () => {
    // The old ladder dropped 5 km -> 0.13 km, so one step down near the ground
    // was a 38x fall. Bound the worst gap so a future edit cannot reintroduce
    // that without failing here.
    let worst = 0, where = ''
    for (let i = 1; i < DETENTS_KM.length; i++) {
      const r = DETENTS_KM[i] / DETENTS_KM[i - 1]
      if (r > worst) { worst = r; where = `${DETENTS_KM[i - 1]} -> ${DETENTS_KM[i]}` }
    }
    expect(worst, `worst gap ${where} = ${worst.toFixed(1)}x`).toBeLessThan(4)
  })

  it('keeps the rungs the product asked for', () => {
    for (const km of [5, 10, 20, 100]) expect(DETENTS_KM).toContain(km)
  })
})

describe('distForKm / kmForDist', () => {
  it('round-trips', () => {
    for (const km of DETENTS_KM) {
      expect(kmForDist(distForKm(km))).toBeCloseTo(km, 6)
    }
  })

  it('keeps every rung inside the OrbitControls distance clamp', () => {
    // Outside [minDistance, maxDistance] a rung is unreachable: the controls
    // clamp the camera and the snap tween would fight them forever.
    const MIN_DISTANCE = 1.00002
    const MAX_DISTANCE = 8
    for (const km of DETENTS_KM) {
      const d = distForKm(km)
      expect(d).toBeGreaterThanOrEqual(MIN_DISTANCE)
      expect(d).toBeLessThanOrEqual(MAX_DISTANCE)
    }
  })
})
