import { test, expect } from '@playwright/test'

test.describe('Home /', () => {
  test('loads with the ObjectTracer title', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveTitle(/ObjectTracer/)
  })

  test('the 3D globe canvas mounts', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20_000 })
  })

  test('the primary bar shows labelled tabs', async ({ page }, testInfo) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const bar = page.getByRole('navigation', { name: 'Primary navigation' })
    await expect(bar).toBeVisible({ timeout: 20_000 })
    // Space + More are in the bar on every viewport; Flights/Ships/Orbit are
    // bar tabs on desktop and filter chips beside the search field on mobile.
    for (const label of ['Home', 'Space', 'Journal']) {
      await expect(bar.getByText(label, { exact: true })).toBeVisible()
    }
    // search + filter live in the shared top row on BOTH viewports now
    await expect(page.getByRole('button', { name: 'Filter options' })).toBeVisible()
    // search: a labelled tab on desktop, a top glass field on mobile — one of
    // the two must be visible on every viewport
    await expect(page.getByLabel('Search flights, airports, airlines').locator('visible=true').first()).toBeVisible()
  })

})
