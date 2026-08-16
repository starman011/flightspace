import { test, expect } from '@playwright/test'

/* The mobile space feed opened already docked.
 *
 * Both auto-dock effects in CommandCenterOverlay are guarded by `mobileOpen`,
 * but that guard only holds while the feed is open. With it closed the effects
 * still run, so touching the globe set streamCollapsed -> forceCollapsed ->
 * sheetState 'peek', behind a sheet nobody could see. Tapping the top-bar icon
 * then mounted it at translateY(100% - 80px): a sliver of sheet and the close
 * button, which reads as the feed opening and instantly collapsing.
 *
 * The globe interaction is what makes this reproduce, and it is why it went
 * unnoticed — open the feed on a freshly loaded page and it behaves. */

test.describe('mobile space feed', () => {
  test.skip(({ isMobile }) => !isMobile, 'the sheet only exists on the mobile viewport')

  const sheetState = (page) => page.evaluate(() => {
    const el = document.querySelector('[class*="stream"]')
    if (!el) return '(not mounted)'
    return /streamClosed/.test(el.className) ? 'peek'
         : /streamHalf/.test(el.className)   ? 'half' : 'full'
  })

  // Drives the globe's own pointerdown hook, which is what sets streamCollapsed.
  const touchGlobe = (page) => page.evaluate(() => {
    const c = document.querySelector('canvas')
    if (!c) throw new Error('globe canvas never mounted')
    const r = c.getBoundingClientRect()
    c.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2,
    }))
  })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('objecttracer_sessions', '5')
      localStorage.setItem('fs_tour_done_v2', '1')
      localStorage.setItem('fs_waitlist_dismissed', String(Date.now()))
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('canvas', { timeout: 25000 })
    await page.waitForTimeout(2500)
  })

  test('opens full after the globe has been touched', async ({ page }) => {
    await touchGlobe(page)
    await page.waitForTimeout(1000)

    await page.getByLabel('Open space feed').tap({ force: true })
    await page.waitForSelector('[class*="stream"]', { timeout: 15000 })
    await page.waitForTimeout(1200)

    expect(await sheetState(page), 'feed opened docked instead of full').toBe('full')
  })

  test('still opens full on a second open after another globe touch', async ({ page }) => {
    await page.getByLabel('Open space feed').tap({ force: true })
    await page.waitForSelector('[class*="stream"]', { timeout: 15000 })
    // dispatchEvent rather than tap: the close button sits inside a
    // continuously animating overlay and is overlapped, so a coordinate tap
    // lands on the wrong element even with force. This drives its handler.
    await page.getByLabel('Close space feed').dispatchEvent('click')
    await page.waitForTimeout(900)

    await touchGlobe(page)
    await page.waitForTimeout(800)
    await page.getByLabel('Open space feed').tap({ force: true })
    await page.waitForTimeout(1200)

    expect(await sheetState(page), 'reopen came back docked').toBe('full')
  })

  test('opens full on a clean page too (the case that always worked)', async ({ page }) => {
    await page.getByLabel('Open space feed').tap({ force: true })
    await page.waitForSelector('[class*="stream"]', { timeout: 15000 })
    await page.waitForTimeout(1200)

    expect(await sheetState(page)).toBe('full')
  })
})
