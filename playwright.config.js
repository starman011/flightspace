import { defineConfig, devices } from '@playwright/test'

/* Root-level Playwright config.
 *
 * The suite lives in frontend/e2e, but the VS Code Playwright extension only
 * discovers configs from the folder you have open. With the repo root open it
 * never saw frontend/playwright.config.js, so no tests appeared in the Testing
 * sidebar. This config points at the same suite from the root, so the tests
 * show up whichever folder is open. Keep it in sync with frontend/playwright.config.js.
 */
export default defineConfig({
  testDir: './frontend/e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  retries: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    cwd: './frontend',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
})
