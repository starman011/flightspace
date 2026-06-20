import { describe, it, expect } from 'vitest'
import { SKY_OBJECTS } from './skyObjects.js'

describe('SKY_OBJECTS', () => {
  it('has familiar named objects with valid coordinates', () => {
    expect(SKY_OBJECTS.length).toBeGreaterThan(20)
    const sirius = SKY_OBJECTS.find(o => o.name === 'Sirius')
    expect(sirius).toBeTruthy()
    // Sirius J2000: RA ~101.3°, Dec ~ -16.7°
    expect(sirius.ra).toBeGreaterThan(100); expect(sirius.ra).toBeLessThan(102)
    expect(sirius.dec).toBeLessThan(-16);  expect(sirius.dec).toBeGreaterThan(-17)
  })
  it('every object has name, ra(0..360), dec(-90..90), kind, priority', () => {
    for (const o of SKY_OBJECTS) {
      expect(typeof o.name).toBe('string')
      expect(o.ra).toBeGreaterThanOrEqual(0); expect(o.ra).toBeLessThan(360)
      expect(o.dec).toBeGreaterThanOrEqual(-90); expect(o.dec).toBeLessThanOrEqual(90)
      expect(['star', 'dso', 'constellation']).toContain(o.kind)
      expect(typeof o.priority).toBe('number')
    }
  })
})
