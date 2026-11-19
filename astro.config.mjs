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
  fonts: [
    family('Lato', '--font-display', 'lato', [400, 700, 900]),
    family('Nunito Sans', '--font-body', 'nunito-sans', [400, 600, 700]),
  ],
});
