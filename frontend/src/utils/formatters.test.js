import { describe, it, expect } from 'vitest'
import { formatAltitude, formatSpeed, formatHeading, formatCallsign, formatRoute } from './formatters'

describe('formatAltitude', () => {
  it('formats feet with comma separators', () => {
    expect(formatAltitude(35000)).toBe('35,000 ft')
  })
  it('rounds fractional values', () => {
    expect(formatAltitude(12345.7)).toBe('12,346 ft')
  })
  it('returns null for null/undefined', () => {
    expect(formatAltitude(null)).toBeNull()
    expect(formatAltitude(undefined)).toBeNull()
  })
  it('handles zero', () => {
    expect(formatAltitude(0)).toBe('0 ft')
  })
})

describe('formatSpeed', () => {
  it('formats knots', () => {
    expect(formatSpeed(450)).toBe('450 kts')
  })
  it('rounds fractional values', () => {
    expect(formatSpeed(123.8)).toBe('124 kts')
  })
  it('returns null for null/undefined', () => {
    expect(formatSpeed(null)).toBeNull()
    expect(formatSpeed(undefined)).toBeNull()
  })
})

describe('formatHeading', () => {
  it('maps 0° to N', () => {
    expect(formatHeading(0)).toBe('N (0°)')
  })
  it('maps 90° to E', () => {
    expect(formatHeading(90)).toBe('E (90°)')
  })
  it('maps 180° to S', () => {
    expect(formatHeading(180)).toBe('S (180°)')
  })
  it('maps 270° to W', () => {
    expect(formatHeading(270)).toBe('W (270°)')
  })
  it('maps 45° to NE', () => {
    expect(formatHeading(45)).toBe('NE (45°)')
  })
  it('returns null for null/undefined', () => {
    expect(formatHeading(null)).toBeNull()
    expect(formatHeading(undefined)).toBeNull()
  })
})

describe('formatCallsign', () => {
  it('trims and uppercases', () => {
    expect(formatCallsign('  ual123  ')).toBe('UAL123')
  })
  it('returns null for empty/falsy', () => {
    expect(formatCallsign('')).toBeNull()
    expect(formatCallsign(null)).toBeNull()
  })
})

describe('formatRoute', () => {
  it('formats origin → destination', () => {
    expect(formatRoute('JFK', 'LAX')).toBe('JFK → LAX')
  })
  it('returns null if either missing', () => {
    expect(formatRoute('JFK', null)).toBeNull()
    expect(formatRoute(null, 'LAX')).toBeNull()
  })
})
