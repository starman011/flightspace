import { describe, it, expect } from 'vitest'
import { segmentOccludedBySphere } from './pickOcclusion'

// Earth radius 1.0, centered at origin; camera sits out along +z at distance 2.5.
const R = 0.999
const CAM = [0, 0, 2.5]

describe('segmentOccludedBySphere', () => {
  it('does NOT occlude a point on the near (camera-facing) hemisphere', () => {
    // sub-camera surface point, slightly above the surface
    expect(segmentOccludedBySphere(...CAM, 0, 0, 1.005, R)).toBe(false)
  })

  it('does NOT occlude a near-side point offset toward the limb', () => {
    // still in front of the globe silhouette
    expect(segmentOccludedBySphere(...CAM, 0.5, 0.3, 0.85, R)).toBe(false)
  })

  it('occludes a point on the far hemisphere (behind the Earth)', () => {
    expect(segmentOccludedBySphere(...CAM, 0, 0, -1.005, R)).toBe(true)
  })

  it('occludes a far-side entity even at satellite altitude', () => {
    // a satellite well above the surface but on the back side is still hidden
    expect(segmentOccludedBySphere(...CAM, 0.1, 0.1, -1.06, R)).toBe(true)
  })

  it('does NOT occlude a high satellite in front of the globe', () => {
    expect(segmentOccludedBySphere(...CAM, 0, 0, 1.4, R)).toBe(false)
  })

  it('does NOT occlude when the ray misses the globe entirely (off to the side)', () => {
    // a point far off the limb — segment never enters the sphere
    expect(segmentOccludedBySphere(...CAM, 3, 0, 0, R)).toBe(false)
  })
})
