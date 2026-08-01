import { test, expect } from '@playwright/test'

test('/blog shows the Space Journal', async ({ page }) => {
  await page.goto('/blog', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /Space Journal/i }).first()).toBeVisible({ timeout: 20_000 })
})

test('/engineering shows the Engineering Blog', async ({ page }) => {
  await page.goto('/engineering', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /Engineering Blog/i }).first()).toBeVisible({ timeout: 20_000 })
})
