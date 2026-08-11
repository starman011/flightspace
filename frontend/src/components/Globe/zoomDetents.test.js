import { describe, it, expect } from 'vitest'
import {
  DETENTS_KM,
  altitudeAfterZoom,
  distForKm,
  kmForDist,
  nearestDetent,
  rotateSpeedForAltitude,
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
    // Geometric midpoint of 0.13 and 5 is sqrt(0.65) ≈ 0.81 km, so 1 km
    // belongs to 5 and 0.5 km belongs to the ground rung.
    expect(DETENTS_KM[nearestDetent(1)]).toBe(5)
    expect(DETENTS_KM[nearestDetent(0.5)]).toBe(0.13)
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

describe('rotateSpeedForAltitude', () => {
  it('preserves the high-altitude feel that already worked', () => {
    // h = 7 is maxDistance 8 minus the Earth radius. The previous hand-tuned
    // curve (0.06 + t^1.5 * 0.32) produced 0.38 there, and that is the feel
    // users reported as good — so the top of the range must still be 0.38.
    expect(rotateSpeedForAltitude(7)).toBeCloseTo(0.38, 9)
  })

  it('is dramatically slower near the ground — the actual bug', () => {
    const ground = rotateSpeedForAltitude(0.13 / 6371) // 130 m up
    expect(ground).toBeLessThan(0.01)
    // Previously this was a flat 1.0 at every altitude.
    expect(1 / ground).toBeGreaterThan(100)
  })

  it('increases monotonically with altitude', () => {
    const heights = [1e-5, 1e-4, 1e-3, 0.01, 0.1, 1, 3, 7]
    for (let i = 1; i < heights.length; i++) {
      expect(rotateSpeedForAltitude(heights[i]))
        .toBeGreaterThan(rotateSpeedForAltitude(heights[i - 1]))
    }
  })

  it('never returns 0, negative, or above the ceiling', () => {
    for (const h of [-1, 0, 1e-9, 7, 50, 1e6]) {
      const s = rotateSpeedForAltitude(h)
      expect(s).toBeGreaterThan(0)
      expect(s).toBeLessThanOrEqual(0.38)
      expect(Number.isFinite(s)).toBe(true)
    }
  })

  it('gives UNIFORM screen response at every altitude', () => {
    // This is the whole point. Screen-space travel per drag is
    // speed / altitude (up to constants), so that ratio must not drift —
    // if it grows as you descend, low altitude feels too fast, which was
    // the bug. An exponent below 1 fails this test.
    const ratio = (h) => rotateSpeedForAltitude(h) / h
    const atOrbit = ratio(7)
    for (const h of [2e-5, 1e-4, 1e-3, 0.0157, 0.1, 1, 7]) {
      expect(ratio(h)).toBeCloseTo(atOrbit, 9)
    }
  })

  it('floor never overrides the scaling at reachable altitudes', () => {
    // A floor above the speed at minimum altitude silently pins low-altitude
    // drag to a fixed rate. The old curve's 0.06 floor did exactly that —
    // ~55,000x too fast at 127 m, which is the bug this replaced.
    const hMin = 1.00002 - 1
    expect(rotateSpeedForAltitude(hMin)).toBeCloseTo(0.38 * hMin / 7, 12)
    expect(rotateSpeedForAltitude(hMin)).toBeLessThan(0.06 / 1000)
  })
})
