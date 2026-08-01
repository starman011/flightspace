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

  test('the left navigation pill is present', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('nav[data-pagespill]')).toBeVisible({ timeout: 20_000 })
  })

})
