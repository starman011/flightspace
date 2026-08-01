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

  test('the primary bar shows labelled tabs', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const bar = page.getByRole('navigation', { name: 'Primary navigation' })
    await expect(bar).toBeVisible({ timeout: 20_000 })
    // Space + More are in the bar on every viewport; Flights/Ships/Orbit are
    // bar tabs on desktop and filter chips beside the search field on mobile.
    for (const label of ['Space', 'More']) {
      await expect(bar.getByText(label, { exact: true })).toBeVisible()
    }
    for (const name of ['Flights', 'Ships', 'Satellites']) {
      await expect(page.getByRole('button', { name, exact: true }).locator('visible=true').first()).toBeVisible()
    }
    // search: a labelled tab on desktop, a top glass field on mobile — one of
    // the two must be visible on every viewport
    await expect(page.getByRole('button', { name: /Search flights, airports/ }).locator('visible=true').first()).toBeVisible()
  })

})
