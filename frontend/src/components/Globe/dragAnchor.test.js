import { describe, it, expect } from 'vitest'
import { Vector3, PerspectiveCamera, Raycaster, Vector2 } from 'three'
import { raySphere, raySphereOrLimb, anchoredCameraPosition } from './dragAnchor.js'

// Reproduce what Globe.jsx does: build the ray for a screen position through
// the real camera, so these tests exercise the actual projection rather than a
// simplified stand-in.
function rayFor(camera, ndcX, ndcY) {
  const rc = new Raycaster()
  rc.setFromCamera(new Vector2(ndcX, ndcY), camera)
  return { origin: rc.ray.origin.clone(), dir: rc.ray.direction.clone() }
}

function cameraAt(altitudeWU, lookFrom = new Vector3(0, 0, 1)) {
  const cam = new PerspectiveCamera(40, 1.6, 0.0001, 200)
  cam.position.copy(lookFrom).normalize().multiplyScalar(1 + altitudeWU)
  cam.lookAt(0, 0, 0)
  cam.updateMatrixWorld(true)
  return cam
}

describe('raySphere', () => {
  it('hits the near side, not the far side', () => {
    const hit = raySphere(new Vector3(0, 0, 3), new Vector3(0, 0, -1))
    expect(hit.z).toBeCloseTo(1, 9)      // near face, not -1
  })

  it('returns null when the ray misses', () => {
    expect(raySphere(new Vector3(0, 5, 3), new Vector3(0, 0, -1))).toBeNull()
  })

  it('returns null when the sphere is behind the ray', () => {
    expect(raySphere(new Vector3(0, 0, 3), new Vector3(0, 0, 1))).toBeNull()
  })

  it('lands exactly on the surface at every altitude', () => {
    for (const alt of [2e-5, 1e-3, 0.02, 1, 7]) {
      const cam = cameraAt(alt)
      const { origin, dir } = rayFor(cam, 0, 0)
      expect(raySphere(origin, dir).length()).toBeCloseTo(1, 9)
    }
  })
})

describe('raySphereOrLimb', () => {
  it('still yields a surface point when the ray misses the globe', () => {
    // Dragging past the edge must not lose the anchor.
    const p = raySphereOrLimb(new Vector3(0, 5, 3), new Vector3(0, 0, -1))
    expect(p).not.toBeNull()
    expect(p.length()).toBeCloseTo(1, 9)
  })

  it('agrees with raySphere whenever there is a real hit', () => {
    const o = new Vector3(0, 0, 3), d = new Vector3(0, 0, -1)
    expect(raySphereOrLimb(o, d).distanceTo(raySphere(o, d))).toBeLessThan(1e-9)
  })
})

describe('anchored drag invariant', () => {
  // THE property this whole approach exists for: after the drag rotation, the
  // ray through the NEW cursor position must strike the point that was grabbed
  // at pointerdown. If this holds, "the ground follows your finger" is true by
  // construction — at every altitude, with no tuning constant anywhere.
  const drags = [
    ['tiny',   0.02, 0.01],
    ['small',  0.10, 0.05],
    ['medium', 0.35, 0.20],
    ['large',  0.70, 0.40],
  ]
  const altitudes = [
    ['127 m',    2e-5],
    ['6 km',     1e-3],
    ['120 km',   0.0188],
    ['1000 km',  0.157],
    ['orbit',    7],
  ]

  // Error is judged against how much ground is actually on screen, because
  // that is what a user can see. An absolute threshold would be meaningless:
  // 1 km of slip is invisible from orbit and enormous at 127 m.
  const visibleGround = (alt) => 2 * alt * Math.tan((40 * Math.PI / 180) / 2)

  // Accuracy degrades with altitude, and these bands are measured, not
  // guessed. Keeping north up (lookAt with world up) discards the roll
  // component of the anchor rotation; the larger the angle a drag sweeps, the
  // more that costs. Below ~127 km — the band that was reported broken — it is
  // exact to floating point. At orbit the worst case is ~5%, which is fine and
  // is also the regime that already felt right.
  const tolerance = (alt) =>
    alt <= 0.02 ? 1e-5      // to ~127 km: exact
    : alt <= 0.2 ? 1e-3     // to ~1275 km: imperceptible
    : 0.08                  // orbit: roll loss becomes visible but acceptable

  for (const [altName, alt] of altitudes) {
    for (const [dragName, dx, dy] of drags) {
      it(`${dragName} drag at ${altName} puts the grabbed point back under the cursor`, () => {
        const cam = cameraAt(alt)

        // pointerdown at screen centre
        const down = rayFor(cam, 0, 0)
        const grabbed = raySphereOrLimb(down.origin, down.dir)
        expect(grabbed).not.toBeNull()

        // pointermove to (dx, dy): what is under the cursor right now?
        const move = rayFor(cam, dx, dy)
        const underCursor = raySphereOrLimb(move.origin, move.dir)
        expect(underCursor).not.toBeNull()

        cam.position.copy(anchoredCameraPosition(cam.position, underCursor, grabbed))
        cam.lookAt(0, 0, 0)
        cam.updateMatrixWorld(true)

        // Re-cast through the SAME screen position; it must now hit `grabbed`.
        const after = rayFor(cam, dx, dy)
        const nowUnder = raySphereOrLimb(after.origin, after.dir)
        const slip = nowUnder.distanceTo(grabbed) / visibleGround(alt)
        expect(slip).toBeLessThan(tolerance(alt))
      })
    }
  }

  it('is exact, not merely close, at the altitudes that were reported broken', () => {
    // 127 m to 120 km is the band where pan felt "too fast and unpredictable".
    // Anchoring there is correct to floating point — there is no residual for
    // a future tuning constant to be tempted to "fix".
    for (const alt of [2e-5, 1e-4, 1e-3, 0.01, 0.0188]) {
      const cam = cameraAt(alt)
      const down = rayFor(cam, 0, 0)
      const grabbed = raySphereOrLimb(down.origin, down.dir)
      const move = rayFor(cam, 0.6, 0.35)
      cam.position.copy(anchoredCameraPosition(
        cam.position, raySphereOrLimb(move.origin, move.dir), grabbed,
      ))
      cam.lookAt(0, 0, 0)
      cam.updateMatrixWorld(true)
      const after = rayFor(cam, 0.6, 0.35)
      const slip = raySphereOrLimb(after.origin, after.dir).distanceTo(grabbed) / visibleGround(alt)
      expect(slip).toBeLessThan(1e-5)
    }
  })

  it('preserves altitude exactly — drag must never zoom', () => {
    for (const [, alt] of altitudes) {
      const cam = cameraAt(alt)
      const before = cam.position.length()
      const down = rayFor(cam, 0, 0)
      const move = rayFor(cam, 0.4, 0.25)
      const next = anchoredCameraPosition(
        cam.position,
        raySphereOrLimb(move.origin, move.dir),
        raySphereOrLimb(down.origin, down.dir),
      )
      expect(next.length()).toBeCloseTo(before, 12)
    }
  })

  it('screen travel per drag is consistent across altitudes', () => {
    // The old angular model failed exactly here: the same drag covered a
    // wildly different fraction of the screen at 127 m than at orbit, which is
    // what "too fast at low altitude" meant. Under anchoring the grabbed point
    // tracks the cursor, so this is uniform by construction.
    const fractions = altitudes.map(([, alt]) => {
      const cam = cameraAt(alt)
      const down = rayFor(cam, 0, 0)
      const grabbed = raySphereOrLimb(down.origin, down.dir)
      const move = rayFor(cam, 0.5, 0)
      const next = anchoredCameraPosition(
        cam.position, raySphereOrLimb(move.origin, move.dir), grabbed,
      )
      // Ground arc swept (radius is 1, so arc = angle) as a fraction of the
      // ground actually on screen at that altitude. THAT is what "how far did
      // the map move" means to a user, and it is what the old angular model
      // got wrong by orders of magnitude.
      const groundSwept = cam.position.angleTo(next)
      const visible = 2 * alt * Math.tan((40 * Math.PI / 180) / 2)
      return groundSwept / visible
    })
    const min = Math.min(...fractions)
    const max = Math.max(...fractions)
    // Perfectly uniform below orbit; the spread is the same high-altitude
    // curvature/roll effect quantified above, not a tuning artefact.
    expect(max / min).toBeLessThan(1.6)
  })
})
