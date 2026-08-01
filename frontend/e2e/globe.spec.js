import { test, expect } from '@playwright/test'

// Every route that renders the live 3D globe for humans (scale/filter views +
// entity pages). All should mount the WebGL canvas and the left nav pill.
const GLOBE_ROUTES = [
  '/iss', '/launches', '/asteroids', '/solar-system', '/moon', '/deep-space',
  '/airport/JFK', '/airline/delta',
]

for (const route of GLOBE_ROUTES) {
  test(`${route} mounts the globe + nav`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 25_000 })
    await expect(page.locator('nav[data-pagespill]')).toBeVisible({ timeout: 25_000 })
  })
}
