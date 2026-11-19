import { randomInt, randomUUID } from 'node:crypto';

import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type Request } from '@playwright/test';

import { assign, type VariantOf } from '../../src/lib/experiments/registry';

export type Arm = VariantOf<'hero_signup'>;

/** A visitor id that the edge will assign to this arm. */
export function visitorFor(arm: Arm): string {
  for (;;) {
    const id = randomUUID();
    if (assign('hero_signup', id) === arm) return id;
  }
}

/**
 * The rate limit counts signups per client address, and every test runs from this
 * machine. Each test therefore presents its own address, as the HTTP tests do. The
 * local runtime accepts the header from a client. Cloudflare's edge sets it itself.
 */
export const clientAddress = () =>
  `10.${randomInt(1, 255)}.${randomInt(0, 256)}.${randomInt(1, 255)}`;

/** Opens the landing page as a visitor in the given arm. */
export async function openAs(
  page: Page,
  baseURL: string | undefined,
  arm: Arm,
  { scripted = true } = {},
): Promise<void> {
  const url = baseURL ?? 'http://127.0.0.1:4321';
  await page
    .context()
    .addCookies([{ name: 'fxr_aid', value: visitorFor(arm), url, httpOnly: true }]);
  await page.setExtraHTTPHeaders({ 'CF-Connecting-IP': clientAddress() });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-experiments', `hero_signup:${arm}`);
  // These tests are about the hydrated form. The plain form has its own, without JavaScript.
  if (scripted) await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
}

export const uniqueEmail = () => `e2e-${randomUUID()}@example.com`;

export interface SentEvent {
  name: string;
  properties: Record<string, unknown>;
  context: Record<string, unknown>;
}

/** Records every analytics event the page sends to the collector. */
export function recordEvents(page: Page): { events: SentEvent[]; bodies: string[] } {
  const events: SentEvent[] = [];
  const bodies: string[] = [];
  page.on('request', (request: Request) => {
    if (!request.url().endsWith('/api/events')) return;
    const body = request.postData() ?? '';
    bodies.push(body);
    const parsed = JSON.parse(body) as {
      context: Record<string, unknown>;
      events: { name: string; properties: Record<string, unknown> }[];
    };
    for (const event of parsed.events) events.push({ ...event, context: parsed.context });
  });
  return { events, bodies };
}

/** Makes the tracker send what it has queued, as it does when the page is hidden. */
export async function flushEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });
  await page.waitForTimeout(100);
}

/** WCAG 2.2 AA, as axe can check it. */
export async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}
