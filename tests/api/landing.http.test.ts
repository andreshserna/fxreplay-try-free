import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { assign } from '../../src/lib/experiments/registry';

/** Edge assignment on the real runtime: the Worker, its asset store and its cookies. */
const BASE_URL = process.env['API_BASE_URL'] ?? 'http://127.0.0.1:4321';

const armOf = (html: string) => /data-experiments="hero_signup:([a-z_]+)"/.exec(html)?.[1];

describe('the landing page over HTTP', () => {
  it('serves each visitor the arm their id hashes to, on every visit', async () => {
    const seen = new Set<string>();
    for (let visitor = 0; visitor < 12; visitor += 1) {
      const id = randomUUID();
      for (let visit = 0; visit < 2; visit += 1) {
        const response = await fetch(`${BASE_URL}/`, { headers: { Cookie: `fxr_aid=${id}` } });
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('private, no-cache');
        const arm = armOf(await response.text());
        expect(arm).toBe(assign('hero_signup', id));
        seen.add(arm ?? '');
      }
    }
    // Twelve random visitors all landing in one arm has a probability of 1 in 2,048.
    expect(seen.size).toBe(2);
  });

  it('sets the visitor cookie on a first visit and serves complete HTML', async () => {
    const response = await fetch(`${BASE_URL}/`);
    const cookie = response.headers.get('Set-Cookie') ?? '';
    expect(cookie).toMatch(/^fxr_aid=[0-9a-f-]{36}; /);
    expect(cookie).toContain('HttpOnly');
    const html = await response.text();
    expect(html).toContain('</html>');
    expect(html).toContain('<link rel="canonical"');
  });

  it('answers a repeat view with 304 and no body, for the same arm only', async () => {
    const id = randomUUID();
    const headers = { Cookie: `fxr_aid=${id}` };
    const first = await fetch(`${BASE_URL}/`, { headers });
    const etag = first.headers.get('ETag') ?? '';
    expect(etag).toContain(assign('hero_signup', id));

    const again = await fetch(`${BASE_URL}/`, { headers: { ...headers, 'If-None-Match': etag } });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe('');
  });

  it('answers an unknown address with a page that leads back to the offer', async () => {
    const response = await fetch(`${BASE_URL}/no-such-page`);
    expect(response.status).toBe(404);
    const html = await response.text();
    expect(html).toContain('href="/#signup"');
    expect(html).toContain('noindex');
    expect(html).not.toContain('rel="canonical"');
  });
});
