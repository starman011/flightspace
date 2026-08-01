import { test, expect } from '@playwright/test'

test.describe('Planes /planes', () => {
  test('loads the live fleet tracker', async ({ page }) => {
    await page.goto('/planes', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /fleet/i }).first()).toBeVisible({ timeout: 20_000 })
  })

  test('lists popular airlines to track', async ({ page }) => {
    await page.goto('/planes', { waitUntil: 'domcontentloaded' })
    // static airline list renders without the backend
    await expect(page.getByText(/Emirates|United|Delta|Qatar/i).first()).toBeVisible({ timeout: 20_000 })
  })

})
