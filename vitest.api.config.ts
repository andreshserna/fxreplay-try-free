import { defineConfig } from 'vitest/config';

/**
 * Contract tests over HTTP against a running local build: the real Worker and a real D1.
 * Start one with `npm run preview`. They are local only: they choose their own client
 * address and deliberately exceed the rate limit, which a deployment would not allow.
 */
export default defineConfig({
  test: {
    include: ['tests/api/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
  },
});
