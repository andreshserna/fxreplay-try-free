#!/usr/bin/env node
/**
 * Generates public/og.png, the image a link to the site shows when it is shared.
 *
 * It is drawn as a small HTML page with the project's own tokens, the two brand
 * families and the kit's wordmark as shipped, then photographed at 1200 x 630 with
 * the browser Playwright already uses for the end-to-end tests. The result is
 * committed, so a build needs no browser.
 *
 *   npm run gen:og
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const font = (path) => pathToFileURL(join(ROOT, 'node_modules/@fontsource', path)).href;

/** The same fixed walk as the page's illustration, drawn as the wordmark's rounded bars. */
function bars(count, seed) {
  let state = seed;
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  let level = 34;
  return Array.from({ length: count }, (_, index) => {
    const from = level;
    level = Math.min(Math.max(level + Math.sin(index / 4) * 9 + (random() - 0.47) * 34, 6), 84);
    return {
      bottom: Math.round(Math.min(from, level)),
      height: Math.max(Math.round(Math.abs(level - from)), 12),
      rising: level >= from,
      played: index < Math.round(count * 0.62),
    };
  });
}

export function renderCard() {
  const wordmark = read('src/assets/brand/FXReplayLogo.svg');
  const strip = bars(26, 11)
    .map(
      (bar) =>
        `<span class="bar ${bar.rising ? 'rising' : 'falling'} ${bar.played ? 'played' : ''}" style="--bottom:${bar.bottom}%;--height:${bar.height}%"></span>`,
    )
    .join('');
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<style>
${read('tokens/tokens.css')}
${read('tokens/extensions.css')}
@font-face { font-family: Lato; font-weight: 900; src: url('${font('lato/files/lato-latin-900-normal.woff2')}') format('woff2'); }
@font-face { font-family: 'Nunito Sans'; font-weight: 400; src: url('${font('nunito-sans/files/nunito-sans-latin-400-normal.woff2')}') format('woff2'); }
@font-face { font-family: 'Nunito Sans'; font-weight: 700; src: url('${font('nunito-sans/files/nunito-sans-latin-700-normal.woff2')}') format('woff2'); }
* { box-sizing: border-box; margin: 0; }
body {
  width: 1200px; height: 630px; overflow: hidden; position: relative;
  padding: 64px 72px;
  display: grid; grid-template-rows: auto 1fr auto;
  background:
    radial-gradient(120% 140% at 15% 0%, color-mix(in srgb, var(--chart-up) 18%, transparent), transparent 55%),
    var(--bg-primary);
  color: var(--text-primary);
  font-family: 'Nunito Sans', sans-serif;
}
.wordmark svg { display: block; height: 34px; width: auto; }
.pitch { align-self: center; max-width: 690px; display: grid; gap: 22px; }
.kicker { color: var(--text-link); font-size: 20px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
h1 { font-family: Lato, sans-serif; font-weight: 900; font-size: 80px; line-height: 1.02; letter-spacing: -0.03em; }
.foot { display: flex; justify-content: space-between; align-items: baseline; gap: 32px; color: var(--text-secondary); font-size: 22px; }
.foot small { font-size: 18px; }
.strip {
  position: absolute; right: 72px; top: 150px; width: 380px; height: 330px;
  display: flex; gap: 6px;
}
.bar { position: relative; flex: 1; }
.bar::before {
  content: ''; position: absolute; left: 0; right: 0; bottom: var(--bottom); height: var(--height);
  border-radius: 16px; background: var(--chart-future);
}
.bar.played.rising::before { background: var(--chart-up); }
.bar.played.falling::before { background: var(--chart-down); }
</style>
<body>
  <div class="wordmark">${wordmark}</div>
  <div class="pitch">
    <p class="kicker">Try FX Replay free</p>
    <h1>Test your strategy before you trust it.</h1>
  </div>
  <div class="foot">
    <span>Free plan. No credit card. No time limit.</span>
    <small>Candidate challenge demo. Not the official FX Replay site.</small>
  </div>
  <div class="strip" aria-hidden="true">${strip}</div>
</body>
</html>`;
}

async function main() {
  const { chromium } = await import('@playwright/test');
  const directory = mkdtempSync(join(tmpdir(), 'og-'));
  try {
    const page = join(directory, 'card.html');
    writeFileSync(page, renderCard());
    const browser = await chromium.launch(process.env.CI ? {} : { channel: 'chrome' });
    const tab = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await tab.goto(pathToFileURL(page).href);
    await tab.evaluate('document.fonts.ready');
    await tab.screenshot({ path: join(ROOT, 'public/og.png'), type: 'png' });
    await browser.close();
    console.log('og-image: wrote public/og.png (1200 x 630)');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`og-image: ${error.message}`);
    process.exit(2);
  });
}
