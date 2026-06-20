import { describe, it, expect } from 'vitest'
import { pickVisibleLabels } from './skyLabelLayout.js'

// Fake projected candidates: {name, x, y, depth, priority, onScreen}
const cand = (name, x, y, priority, onScreen = true, depth = 0.5) =>
  ({ name, x, y, priority, onScreen, depth })

describe('pickVisibleLabels', () => {
  it('drops off-screen and behind-camera candidates', () => {
    const out = pickVisibleLabels([
      cand('A', 100, 100, 1, true, 0.5),
      cand('B', 100, 100, 1, false, 0.5),    // off-screen
      cand('C', 100, 100, 1, true, 1.2),     // depth > 1 = behind camera
    ], { maxLabels: 10, minGapPx: 40 })
    expect(out.map(o => o.name)).toEqual(['A'])
  })
  it('declutters overlapping labels keeping the higher priority (lower number)', () => {
    const out = pickVisibleLabels([
      cand('low', 200, 200, 9),
      cand('high', 210, 205, 1),   // within 40px of "low"
    ], { maxLabels: 10, minGapPx: 40 })
    expect(out.map(o => o.name)).toEqual(['high'])
  })
  it('respects maxLabels', () => {
    const many = Array.from({ length: 30 }, (_, i) => cand('s' + i, i * 100, 0, i))
    const out = pickVisibleLabels(many, { maxLabels: 8, minGapPx: 10 })
    expect(out.length).toBe(8)
  })
})
