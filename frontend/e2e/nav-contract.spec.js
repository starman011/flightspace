import { test, expect } from '@playwright/test'

/* Geometry contract for the nav chrome.
 *
 * BottomBar.module.css has accumulated 13 media queries and ~47 !important
 * declarations, with some classes redefined a dozen times. Before it can be
 * consolidated safely, the behaviour it currently produces has to be pinned
 * down — this suite asserts the RENDERED result rather than the CSS, so a
 * rewrite is verified by outcome, not by reading rules. */

const RANGES = {
  desktop: {
    searchH: [42, 52], chipW: [42, 52], radarH: [50, 58],
    barGap: [8, 60],             // bar bottom edge to viewport bottom (measured 16)
  },
  mobile: {
    searchH: [34, 42], chipW: [34, 42], radarH: [30, 38],
    barGap: [8, 40],
  },
}

test('nav chrome geometry contract', async ({ page }, testInfo) => {
  const key = testInfo.project.name === 'mobile' ? 'mobile' : 'desktop'
  const R = RANGES[key]

  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)
  await page.evaluate(() => document.body.removeAttribute('data-modal-open'))
  // wait for the chrome to finish transitioning in, else we measure mid-slide
  await page.waitForFunction(() => {
    const bar = document.querySelector('nav[aria-label="Primary navigation"]')
    return bar && getComputedStyle(bar).opacity === '1' &&
           bar.getBoundingClientRect().bottom <= innerHeight + 1
  }, null, { timeout: 15000 })

  const m = await page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
    }
    const bar = document.querySelector('nav[aria-label="Primary navigation"]')
    const barR = bar.getBoundingClientRect()
    return {
      search: box('[class*="topSearch"]'),
      chip: box('[aria-label="Filter options"]'),
      radar: box('[class*="countStrip"]'),
      barGap: Math.round(innerHeight - barR.bottom),
      topX: box('[class*="topArea"]').x,
    }
  })

  // Controls are present and sized within their intended band
  expect(m.search.h, 'search height').toBeGreaterThanOrEqual(R.searchH[0])
  expect(m.search.h, 'search height').toBeLessThanOrEqual(R.searchH[1])
  expect(m.chip.w, 'filter chip width').toBeGreaterThanOrEqual(R.chipW[0])
  expect(m.chip.w, 'filter chip width').toBeLessThanOrEqual(R.chipW[1])
  expect(m.radar.h, 'radar height').toBeGreaterThanOrEqual(R.radarH[0])
  expect(m.radar.h, 'radar height').toBeLessThanOrEqual(R.radarH[1])

  // Layout relationships that kept breaking during the redesign
  expect(m.chip.y, 'chip shares the search row').toBe(m.search.y)
  expect(m.chip.x, 'chip sits right of the search field').toBeGreaterThan(m.search.x + m.search.w - 2)
  expect(m.radar.y, 'radar sits below the search row').toBeGreaterThan(m.search.y + m.search.h - 2)
  expect(m.topX, 'top row is left-anchored').toBeLessThan(40)
  expect(m.barGap, 'bar rests near the bottom edge').toBeGreaterThanOrEqual(R.barGap[0])
  expect(m.barGap, 'bar rests near the bottom edge').toBeLessThanOrEqual(R.barGap[1])
})

test('nav chrome retreats when a flight card opens', async ({ page }) => {
  await page.goto('/flight/a07228', { waitUntil: 'domcontentloaded' })
  // wait for the card itself to mount — the chrome only retreats once the
  // selection lands, and that depends on a network round-trip
  await page.waitForSelector('[class*="panel"], [class*="scroller"]', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(2500)
  // both retreat on a transition — poll until they've settled rather than
  // sampling mid-animation
  await expect.poll(async () => page.evaluate(() => {
    const o = (sel) => {
      const el = document.querySelector(sel)
      return el ? parseFloat(getComputedStyle(el).opacity) : 1
    }
    return Math.max(o('[class*="topArea"]'), o('nav[aria-label="Primary navigation"]'))
  }), { timeout: 12000, message: 'nav chrome retreats behind the card' }).toBeLessThan(0.05)
})
