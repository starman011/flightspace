/**
 * Short haptic tap for confirming a discrete UI event (landing on a zoom
 * detent, committing a toggle).
 *
 * Platform reality, so nobody re-debugs this:
 *
 * - **Android** (Chrome, Firefox, Samsung Internet) implements the Vibration
 *   API and this works. It needs prior user activation on the document, which
 *   any tap or scroll satisfies.
 * - **iOS/iPadOS** does NOT. `navigator.vibrate` is undefined in every iOS
 *   browser — they are all WebKit, and Apple has never shipped the Vibration
 *   API. There is no web-exposed haptic alternative. On iPhone this is a
 *   no-op by necessity, and visual feedback has to carry the confirmation.
 * - **Desktop** browsers expose no vibration hardware; also a no-op.
 *
 * Duration matters more than it looks. A vibration motor has to spin up, so
 * anything under ~10ms is frequently inaudible and imperceptible — it "works"
 * (returns true) while the user feels nothing. 18ms is the shortest reliably
 * perceptible tap across common Android hardware.
 */
const TAP_MS = 18

export function hapticsSupported() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

/**
 * Fire a tap. Returns true only if the platform accepted the request — a
 * false return means the device has no web-accessible haptics, not an error.
 */
export function tapHaptic(ms = TAP_MS) {
  if (!hapticsSupported()) return false
  try {
    return navigator.vibrate(ms)
  } catch {
    // Some embedded webviews expose vibrate() but throw on call.
    return false
  }
}
