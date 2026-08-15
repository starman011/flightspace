import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    // Vitest's default glob is repo-wide, so it swept up e2e/*.spec.js — those
    // are Playwright tests, and importing @playwright/test outside the
    // Playwright runner throws "Playwright Test did not expect test() to be
    // called here". `npm test` failed on that alone, with every unit test
    // passing. Playwright owns e2e/ (npm run test:e2e); vitest owns src/.
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
})
