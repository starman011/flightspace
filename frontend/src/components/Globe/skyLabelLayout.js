// Pure screen-space declutter. Input candidates already projected to pixels:
//   { name, x, y, depth, priority, onScreen }  (depth: NDC z, <1 = in front)
// Output: the subset to actually render, sorted by priority.
export function pickVisibleLabels(candidates, { maxLabels = 12, minGapPx = 44 } = {}) {
  const visible = candidates
    .filter(c => c.onScreen && c.depth < 1)
    .sort((a, b) => a.priority - b.priority)

  const kept = []
  for (const c of visible) {
    if (kept.length >= maxLabels) break
    const clash = kept.some(k => Math.hypot(k.x - c.x, k.y - c.y) < minGapPx)
    if (!clash) kept.push(c)
  }
  return kept
}
