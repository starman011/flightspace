import { test, expect } from '@playwright/test'

test('/waitlist shows a signup form with an email field', async ({ page }) => {
  await page.goto('/waitlist', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('input').first()).toBeVisible()
})
