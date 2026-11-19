import { execSync } from 'node:child_process';

import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import { defineConfig, fontProviders } from 'astro/config';

/**
 * The kit names two families and three weights of each. Exactly those six files
 * are shipped: upright, Latin subset, taken from the installed Fontsource packages
 * (SIL Open Font License). Astro self-hosts them and generates metric-matched
 * fallbacks, so the swap does not shift layout.
 */
const family = (name, cssVariable, slug, weights) => ({
  provider: fontProviders.local(),
  name,
  cssVariable,
  fallbacks: ['sans-serif'],
  options: {
    variants: weights.map((weight) => ({
      weight,
      style: 'normal',
      src: [`@fontsource/${slug}/files/${slug}-latin-${weight}-normal.woff2`],
    })),
  },
});

/** The build's git SHA: every analytics event carries it, so a regression points at a release. */
function release() {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  // Images are optimized at build time. Nothing is transformed at request time,
  // so the deployment needs no image service.
  adapter: cloudflare({ imageService: 'compile' }),
  integrations: [react()],
  // The signup issues its own signed cookie (docs/api.md). Astro's session store,
  // which would provision a KV namespace on deploy, is not used.
  session: false,
  // One page: its CSS travels in the HTML instead of costing a render-blocking request.
  build: { inlineStylesheets: 'always' },
  // No Markdown is rendered, so the highlighter that would need inline styles is off.
  markdown: { syntaxHighlight: false },
  // Astro hashes every script and style it emits, inline ones included, and writes the
  // policy into each page's <meta>. Nothing is allowed from another origin because
  // nothing comes from one (ADR 0014). The directives a <meta> policy cannot carry,
  // such as frame-ancestors, travel as a header (src/server/http/security-headers.ts).
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "form-action 'self'",
        "base-uri 'none'",
        "object-src 'none'",
      ],
    },
  },
  vite: { define: { __RELEASE__: JSON.stringify(process.env.RELEASE ?? release()) } },
  fonts: [
    family('Lato', '--font-display', 'lato', [400, 700, 900]),
    family('Nunito Sans', '--font-body', 'nunito-sans', [400, 600, 700]),
  ],
});
