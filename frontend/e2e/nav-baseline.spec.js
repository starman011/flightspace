import { test, expect } from '@playwright/test'
import baseline from './nav-baseline.json' assert { type: 'json' }

/* Computed-style baseline for the nav chrome.
 *
 * BottomBar.module.css carries ~950 lines, 13 media queries and ~70 !important
 * declarations, with .topSearch alone defined 16 times. Consolidating it safely
 * needs a definition of "unchanged" that does not depend on reading the rules —
 * so this pins the values the browser actually computes today.
 *
 * Refactor workflow: rewrite the stylesheet, run this, and every property that
 * drifts is reported by name. Regenerate the JSON only when a change is intended.
 */

const SEL = {
  topArea: '[class*="topArea"]',
  topRow: '[class*="topRow"]',
  topSearch: '[class*="topSearch"]',
  topInput: '[class*="topInput"]',
  topChip: '[aria-label="Filter options"]',
  countStrip: '[class*="countStrip"]',
  radar: '[class*="radar"]',
  bar: 'nav[aria-label="Primary navigation"]',
  tab: '[aria-label="Home — Earth globe"]',
  live: '[class*="live"]',
}

test('nav computed styles match the recorded baseline', async ({ page }, testInfo) => {
  const key = testInfo.project.name === 'mobile' ? 'mobile' : 'desktop'
  const expected = baseline[key]

  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4500)
  await page.evaluate(() => document.body.removeAttribute('data-modal-open'))
  await page.waitForTimeout(700)

  const actual = await page.evaluate((sel) => {
    const props = ['display','position','width','height','minWidth','minHeight','padding','margin',
      'borderRadius','backgroundColor','color','fontSize','fontFamily','gap','flex','alignItems',
      'top','left','right','bottom','zIndex']
    const out = {}
    for (const [k, s] of Object.entries(sel)) {
      const el = document.querySelector(s)
      if (!el) { out[k] = null; continue }
      const c = getComputedStyle(el)
      out[k] = {}
      for (const p of props) out[k][p] = c[p]
    }
    return out
  }, SEL)

  const drift = []
  for (const [el, props] of Object.entries(expected)) {
    if (!props) continue
    if (!actual[el]) { drift.push(`${el}: element missing`); continue }
    for (const [prop, want] of Object.entries(props)) {
      const got = actual[el][prop]
      if (got !== want) drift.push(`${el}.${prop}: expected ${want}, got ${got}`)
    }
  }
  expect(drift, `nav style drift on ${key}:\n${drift.join('\n')}`).toEqual([])
})
