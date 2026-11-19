import { defineConfig } from 'vitest/config';

/**
 * Contract tests over HTTP against a running build: the real Worker and a real D1.
 * Start one with `npm run preview`, or point API_BASE_URL and ADMIN_TOKEN at a deployment.
 */
export default defineConfig({
  test: {
    include: ['tests/api/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
  },
});
