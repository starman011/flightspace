import { defineConfig, devices } from '@playwright/test'

// E2E tests for the main pages. Runs on desktop AND mobile viewports so the
// mobile experience (where GA shows conversion is half of desktop) is covered.
// The VS Code "Playwright Test" extension auto-discovers this config and lists
// every test in the Testing sidebar.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: 1,   // one retry absorbs parallel-load flakes on the heavy WebGL dev server
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile',  use: { ...devices['Pixel 5'] } },  // Android Chrome (chromium — no extra browser DL)
  ],
})
