import { test, expect } from '@playwright/test'

test.describe('Flight /flight', () => {
  test('shows the "flying overhead" cover heading', async ({ page }) => {
    await page.goto('/flight', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /flying/i })).toBeVisible({ timeout: 20_000 })
  })

  test('search input is labelled and has a submit button (a11y)', async ({ page }, testInfo) => {
    // NOTE (mobile UX): the city/airport search only renders in the desktop
    // layout — on mobile, /flight offers "locate" but no search. Worth revisiting
    // for the mobile conversion gap. Scoped to desktop until then.
    test.skip(testInfo.project.name === 'mobile', 'search cover is desktop-only layout')
    await page.goto('/flight', { waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Search a city or airport')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Search' })).toBeVisible()
  })

  test('offers a way to find the nearest airport', async ({ page }) => {
    await page.goto('/flight', { waitUntil: 'domcontentloaded' })
    // "Find your nearest airport" locate section renders without geolocation
    await expect(page.getByText(/nearest airport/i).first()).toBeVisible({ timeout: 20_000 })
  })
})
