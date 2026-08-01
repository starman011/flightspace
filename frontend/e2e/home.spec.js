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
    for (const label of ['Search', 'Flights', 'Ships', 'Orbit', 'Space', 'More']) {
      await expect(bar.getByText(label, { exact: true })).toBeVisible()
    }
  })

})
