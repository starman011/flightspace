import { describe, it, expect } from 'vitest'
import { rotatePick } from '../../middleware.js'

// rotatePick walks (start + i*step) % len collecting distinct indices. It used
// to spin until it had min(n, len) of them, but that walk only reaches
// len / gcd(step, len) distinct indices — so any pool where the walk was too
// short made it loop forever. Synchronously, in Edge middleware, which meant
// every request to the affected page burned the whole invocation and returned
// MIDDLEWARE_INVOCATION_TIMEOUT (a 504) with no failing upstream call to blame.
//
// /airport/AUH was the reported case: an 8-item pool, n=6, step 22, gcd 2 →
// only 4 indices reachable, waiting for 6, forever.

describe('rotatePick termination', () => {
  it('returns from the exact case that took down /airport/AUH', () => {
    const pool = Array.from({ length: 8 }, (_, i) => i)
    const seed = 'AUH'.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0)
    expect(rotatePick(pool, seed, 6)).toHaveLength(6)
  })

  it('terminates and fills for every pool size, seed and n we could hit', () => {
    // Exhaustive over the shapes that actually occur: small link pools up to
    // the full 930-airport catalogue. If any combination hung, this test would
    // hang rather than fail — which is precisely the production symptom.
    for (let len = 1; len <= 64; len++) {
      const pool = Array.from({ length: len }, (_, i) => i)
      for (let seed = 0; seed < 120; seed++) {
        for (const n of [1, 3, 4, 6, 10]) {
          const out = rotatePick(pool, seed, n)
          expect(out).toHaveLength(Math.min(n, len))
          expect(new Set(out).size).toBe(out.length)  // no repeats
        }
      }
    }
  })

  it('never returns duplicates or out-of-pool values', () => {
    const pool = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    for (let seed = 0; seed < 500; seed++) {
      const out = rotatePick(pool, seed, 6)
      expect(new Set(out).size).toBe(6)
      out.forEach(v => expect(pool).toContain(v))
    }
  })

  it('still varies its selection by seed — the point of the function', () => {
    // The whole reason for the seeded walk is that different pages link
    // different slices. A fix that always returned the first n would pass the
    // termination tests above and silently destroy the internal link graph.
    const pool = Array.from({ length: 40 }, (_, i) => i)
    const seen = new Set()
    for (let seed = 0; seed < 60; seed++) seen.add(rotatePick(pool, seed, 6).join(','))
    expect(seen.size).toBeGreaterThan(20)
  })

  it('handles empty and single-item pools', () => {
    expect(rotatePick([], 123, 5)).toEqual([])
    expect(rotatePick(['only'], 123, 5)).toEqual(['only'])
  })
})
