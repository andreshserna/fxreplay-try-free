import { expect, test, type APIResponse, type Page } from '@playwright/test';

import { clientAddress, flushEvents, openAs, uniqueEmail, visitorFor, type Arm } from './support';

/** What every response must carry, each header exactly once. */
const REQUIRED = {
  'content-security-policy':
    "frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-frame-options': 'DENY',
  'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

const ARMS: Arm[] = ['inline_email', 'cta_button'];

function expectSecurityHeaders(response: APIResponse): void {
  const headers = response.headersArray();
  for (const [name, value] of Object.entries(REQUIRED)) {
    const copies = headers.filter((header) => header.name.toLowerCase() === name);
    expect(
      copies.map((header) => header.value),
      name,
    ).toEqual([value]);
  }
}

/** The policy Astro writes into the document, with a hash for each inline script and style. */
function pagePolicy(html: string): string {
  const meta = /<meta http-equiv="content-security-policy" content="([^"]+)"/i.exec(html);
  return (meta?.[1] ?? '').replaceAll('&#39;', "'");
}

test.describe('security headers', () => {
  for (const arm of ARMS) {
    test(`on the landing page, ${arm}`, async ({ request }) => {
      const response = await request.get('/', {
        headers: { Cookie: `fxr_aid=${visitorFor(arm)}` },
      });
      expect(response.status()).toBe(200);
      expectSecurityHeaders(response);
      expect(response.headers()['cache-control']).toBe('private, no-cache');

      const html = await response.text();
      expect(html).toContain(`data-experiments="hero_signup:${arm}"`);
      const policy = pagePolicy(html);
      expect(policy).toContain("default-src 'self'");
      expect(policy).toMatch(/script-src 'self'( 'sha256-[^']+')+;/);
      expect(policy).toMatch(/style-src 'self'( 'sha256-[^']+')+;/);
      expect(policy).not.toContain('unsafe-');
    });
  }

  for (const path of ['/signup/done/', '/problems/validation-failed/']) {
    test(`on the static page ${path}`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      expectSecurityHeaders(response);
      expect(response.headers()['cache-control']).toBe('public, max-age=0, must-revalidate');
    });
  }

  test('on a hashed asset, which stays immutable', async ({ request }) => {
    const html = await (await request.get('/')).text();
    const asset = /\/_astro\/[\w.-]+\.js/.exec(html)?.[0];
    expect(asset).toBeDefined();
    const response = await request.get(asset ?? '');
    expect(response.status()).toBe(200);
    expectSecurityHeaders(response);
    expect(response.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  test('on an API answer', async ({ request }) => {
    const response = await request.post('/api/events', {
      headers: { 'CF-Connecting-IP': clientAddress() },
      data: {},
    });
    expect(response.status()).toBeLessThan(500);
    expectSecurityHeaders(response);
  });
});

/** Every message the browser printed, every uncaught error, and every CSP violation. */
async function watch(page: Page): Promise<{ messages: string[]; collected: number[] }> {
  const messages: string[] = [];
  const collected: number[] = [];
  page.on('console', (message) => messages.push(`console.${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    if (response.url().endsWith('/api/events')) collected.push(response.status());
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(
        `Content Security Policy violation: ${event.effectiveDirective} ${event.blockedURI}`,
      );
    });
  });
  return { messages, collected };
}

test.describe('the policy breaks nothing', () => {
  for (const arm of ARMS) {
    test(`the whole signup works under it, ${arm}`, async ({ page, baseURL }) => {
      const { messages, collected } = await watch(page);
      await openAs(page, baseURL, arm);

      if (arm === 'cta_button')
        await page.getByRole('link', { name: 'Start for free' }).first().click();
      const field = page.getByLabel('Email', { exact: true }).first();
      await field.fill(uniqueEmail());
      await page.getByRole('button', { name: 'Start for free' }).first().click();
      await expect(
        page.getByRole('heading', { name: 'Your free account is ready.' }),
      ).toBeVisible();

      await page.getByLabel('Forex').check();
      await page.getByRole('button', { name: 'Save and continue' }).click();
      await expect(page.getByRole('heading', { name: 'You are all set.' })).toBeVisible();

      // The fonts loaded from 'self', and the tracker reached the collector.
      const fonts = await page.evaluate(async () => {
        await document.fonts.ready;
        return Array.from(document.fonts)
          .filter((face) => face.status === 'loaded')
          .map((face) => face.family);
      });
      expect(fonts.some((family) => family.startsWith('Lato'))).toBe(true);
      expect(fonts.some((family) => family.includes('Nunito Sans'))).toBe(true);
      await flushEvents(page);
      // The answer comes back when it comes back: wait for it instead of for a fixed time.
      await expect.poll(() => collected.length).toBeGreaterThan(0);
      expect(collected.every((status) => status >= 200 && status < 300)).toBe(true);

      expect(
        messages.filter((text) => /Content Security Policy|Permissions-Policy/i.test(text)),
      ).toEqual([]);
      expect(messages.filter((text) => text.startsWith('pageerror'))).toEqual([]);
    });
  }
});
