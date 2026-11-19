import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import jsxA11y from 'eslint-plugin-jsx-a11y-x';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Lints without type information, so one file takes about a second inside the edit hook.
 * Types are checked separately by `astro check` (npm run typecheck).
 */
export default defineConfig(
  globalIgnores([
    'dist/',
    '.astro/',
    '.wrangler/',
    '.artifacts/',
    'brief/',
    'notes/',
    'worker-configuration.d.ts',
  ]),
  js.configs.recommended,
  tseslint.configs.strict,
  astro.configs['flat/recommended'],
  astro.configs['flat/jsx-a11y-strict'],
  { files: ['src/**/*.{tsx,jsx}'], extends: [jsxA11y.configs.strict] },
  {
    files: ['scripts/**', '.claude/hooks/**', '*.config.{js,mjs,ts}'],
    languageOptions: { globals: globals.node },
  },
);
