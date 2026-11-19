import { defineConfig } from 'vitest/config';

/** Unit and contract tests. They run in Node against the in-memory repository. */
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
