import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a running preview, like the HTTP contract tests:
 * `npm run preview`, then `npm run test:e2e`. The real Worker, a real D1, a real browser.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://127.0.0.1:4321',
    trace: 'retain-on-failure',
    // Locally the installed Chrome is used. CI downloads Playwright's Chromium.
    ...(process.env['CI'] ? {} : { channel: 'chrome' }),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
