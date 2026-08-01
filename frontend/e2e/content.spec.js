import { test, expect } from '@playwright/test'

// Full-screen static content pages (rendered by the SPA for humans).
const PAGES = [
  ['/about',   /Everything above you/i],
  ['/faq',     /Questions, answered/i],
  ['/contact', /Get in touch/i],
  ['/donate',  /Support ObjectTracer/i],
]

for (const [path, heading] of PAGES) {
  test(`content page ${path} renders its hero`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 20_000 })
  })
}
