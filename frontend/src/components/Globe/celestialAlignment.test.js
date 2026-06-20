import { describe, it, expect } from 'vitest'
import { julianDate, gmstDeg, lstDeg, altAzToRaDec, raDecToAltAz } from './celestialAlignment.js'

describe('celestial alignment', () => {
  it('julianDate of 2000-01-01 12:00 UTC ≈ 2451545.0', () => {
    expect(julianDate(new Date(Date.UTC(2000, 0, 1, 12, 0, 0)))).toBeCloseTo(2451545.0, 3)
  })
  it('gmst is in [0,360)', () => {
    const g = gmstDeg(new Date(Date.UTC(2026, 5, 20, 3, 0, 0)))
    expect(g).toBeGreaterThanOrEqual(0); expect(g).toBeLessThan(360)
  })
  it('North Celestial Pole sits at altitude = latitude, azimuth = 0', () => {
    const lat = 28.6, lst = 123.4
    const { alt, az } = raDecToAltAz(0, 90, lat, lst)   // Dec=90 = NCP
    expect(alt).toBeCloseTo(lat, 4)
    expect(Math.min(az, 360 - az)).toBeLessThan(1e-3)
  })
  it('altAz and raDec are inverses (round trip)', () => {
    const lat = 19.8, lst = 250.0
    const { ra, dec } = altAzToRaDec(42, 137, lat, lst)
    const back = raDecToAltAz(ra, dec, lat, lst)
    expect(back.alt).toBeCloseTo(42, 4)
    expect(back.az).toBeCloseTo(137, 4)
  })
})
