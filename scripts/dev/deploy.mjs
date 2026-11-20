/**
 * Publishes the site: builds it for its public address, then hands the build to Wrangler.
 *
 *   SITE_URL=https://example.com npm run deploy
 *
 * The build is made here, every time, because `dist/` may hold another one: `npm run
 * preview` rebuilds it for localhost, and the SEO check builds it with indexing on.
 * Wrangler publishes whatever is there.
 */
import { spawnSync } from 'node:child_process';

const site = process.env.SITE_URL;
if (!site || !/^https:\/\//.test(site)) {
  console.error('deploy: set SITE_URL to the public https address the build is for.');
  process.exit(1);
}
if (process.env.ALLOW_INDEXING === 'true') {
  console.error('deploy: ALLOW_INDEXING is on. This demo ships noindex: unset it.');
  process.exit(1);
}

for (const [command, args] of [
  ['npx', ['astro', 'build']],
  ['npx', ['wrangler', 'deploy']],
]) {
  const { status } = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (status !== 0) process.exit(status ?? 1);
}
