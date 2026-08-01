import { test, expect } from '@playwright/test'

test.describe('Flight /flight', () => {
  test('shows the "flying overhead" cover heading', async ({ page }) => {
    await page.goto('/flight', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /flying/i })).toBeVisible({ timeout: 20_000 })
  })

  test('search input is labelled and has a submit button (a11y)', async ({ page }) => {
    await page.goto('/flight', { waitUntil: 'domcontentloaded' })
    // present on desktop AND mobile (the locate card stacks vertically on mobile)
    const search = page.getByLabel('Search a city or airport')
    await expect(search).toBeVisible()
    await expect(search.locator('..').getByRole('button', { name: 'Search' })).toBeVisible()
  })

  test('offers a way to find the nearest airport', async ({ page }) => {
    await page.goto('/flight', { waitUntil: 'domcontentloaded' })
    // "Find your nearest airport" locate section renders without geolocation
    await expect(page.getByText(/nearest airport/i).first()).toBeVisible({ timeout: 20_000 })
  })
})
