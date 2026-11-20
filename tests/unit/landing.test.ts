import { beforeEach, describe, expect, it } from 'vitest';

import { assign } from '../../src/lib/experiments/registry';
import { ServerEvents } from '../../src/server/analytics/emitter';
import { MemorySink } from '../../src/server/analytics/sink';
import { VISITOR_COOKIE } from '../../src/server/http/visitor';
import { redirectToArm, serveLanding, type Assets } from '../../src/server/landing';

const ORIGIN = 'https://demo.example';

let sink: MemorySink;
let events: ServerEvents;
let requested: Request[];
let deferred: Promise<unknown>[];

/** An asset store that answers each arm with its own document. */
const assets: Assets = {
  fetch(request) {
    requested.push(request);
    const etag = `"${new URL(request.url).pathname}"`;
    if (request.headers.get('If-None-Match') === etag) {
      return Promise.resolve(new Response(null, { status: 304, headers: { ETag: etag } }));
    }
    return Promise.resolve(
      new Response(`<html data-path="${new URL(request.url).pathname}">`, {
        headers: { 'Content-Type': 'text/html', ETag: etag, 'Cache-Control': 'public, max-age=0' },
      }),
    );
  },
};

beforeEach(() => {
  sink = new MemorySink();
  events = new ServerEvents({ sink, release: 'test' });
  requested = [];
  deferred = [];
});

const BROWSER =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36';

async function visit(
  headers: Record<string, string> = {},
  { method = 'GET', query = '', options = {} as Partial<Parameters<typeof serveLanding>[1]> } = {},
) {
  const response = await serveLanding(
    new Request(`${ORIGIN}/${query}`, { method, headers: { 'User-Agent': BROWSER, ...headers } }),
    { assets, events, ...options },
    (work) => deferred.push(work),
  );
  await Promise.all(deferred);
  return response;
}

describe('the landing page at the edge', () => {
  it("serves the document of the visitor's arm, the same one on every visit", async () => {
    for (const id of ['visitor-a', 'visitor-c']) {
      const arm = assign('hero_signup', id);
      for (let visitNumber = 0; visitNumber < 2; visitNumber += 1) {
        const response = await visit({ Cookie: `${VISITOR_COOKIE}=${id}` });
        expect(await response.text()).toContain(`/variants/${arm}/`);
      }
    }
    expect(assign('hero_signup', 'visitor-a')).not.toBe(assign('hero_signup', 'visitor-c'));
  });

  it('gives a new visitor an id in an HttpOnly cookie and assigns from that id', async () => {
    const response = await visit();
    const cookie = response.headers.get('Set-Cookie') ?? '';
    const id = /fxr_aid=([^;]+)/.exec(cookie)?.[1] ?? '';
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
    expect(await response.text()).toContain(`/variants/${assign('hero_signup', id)}/`);
    expect((await visit({ Cookie: `${VISITOR_COOKIE}=${id}` })).headers.has('Set-Cookie')).toBe(
      false,
    );
  });

  it('keeps the document out of shared caches', async () => {
    const response = await visit();
    expect(response.headers.get('Cache-Control')).toBe('private, no-cache');
    expect(response.headers.get('Vary')).toContain('Cookie');
  });

  it('records the exposure on the server, with the arm', async () => {
    await visit({ Cookie: `${VISITOR_COOKIE}=visitor-a` });
    const arm = assign('hero_signup', 'visitor-a');
    expect(sink.events).toEqual([
      expect.objectContaining({
        name: 'experiment_exposed',
        properties: { experiment: 'hero_signup', variant: arm },
        context: expect.objectContaining({
          anonymous_id: 'visitor-a',
          source: 'server',
          page_path: '/',
          experiments: `hero_signup:${arm}`,
          is_bot: false,
        }) as unknown,
      }),
    ]);
  });

  it('times the exposure when the document is served, not when the deferred work runs', async () => {
    let clock = new Date('2026-11-19T10:00:00.000Z');
    const servedAt = clock.toISOString();
    events = new ServerEvents({ sink, release: 'test', now: () => clock });
    // The limiter answers only when the test says so: the response is already returned.
    let answer!: (result: { success: boolean }) => void;
    const limiter = {
      limit: () => new Promise<{ success: boolean }>((resolve) => (answer = resolve)),
    };

    const response = await serveLanding(
      new Request(`${ORIGIN}/`, { headers: { 'User-Agent': BROWSER } }),
      { assets, events, limiter, now: () => clock },
      (work) => deferred.push(work),
    );
    expect(response.status).toBe(200);
    expect(sink.events).toHaveLength(0);

    clock = new Date('2026-11-19T10:00:07.000Z');
    answer({ success: true });
    await Promise.all(deferred);
    expect(sink.events.map((event) => event.context.occurred_at)).toEqual([servedAt]);
  });

  it('answers a revalidation with 304 and still counts the exposure', async () => {
    const cookie = { Cookie: `${VISITOR_COOKIE}=visitor-a` };
    const first = await visit(cookie);
    const again = await visit({ ...cookie, 'If-None-Match': first.headers.get('ETag') ?? '' });
    expect(again.status).toBe(304);
    expect(sink.events).toHaveLength(2);
  });

  it('counts only a document on its way to a person', async () => {
    await visit({ 'Sec-Purpose': 'prefetch;prerender' });
    await visit({}, { method: 'HEAD' });
    // An image tag on another site, pointed at the page.
    await visit({ 'Sec-Fetch-Dest': 'image', 'Sec-Fetch-Site': 'cross-site' });
    expect(sink.events).toHaveLength(0);

    await visit({ 'Sec-Fetch-Dest': 'document' });
    expect(sink.events).toHaveLength(1);
  });

  it('counts nothing for a page the asset store could not serve', async () => {
    const missing: Assets = { fetch: () => Promise.resolve(new Response(null, { status: 404 })) };
    const response = await visit({}, { options: { assets: missing } });
    expect(response.status).toBe(404);
    expect(sink.events).toHaveLength(0);
  });

  it('flags automated agents: crawlers, link previews, and no agent at all', async () => {
    for (const agent of [
      'Mozilla/5.0 (compatible; bingbot/2.0)',
      'facebookexternalhit/1.1',
      'WhatsApp/2.23',
      'python-requests/2.32',
      '',
    ]) {
      await visit({ 'User-Agent': agent });
    }
    expect(sink.events.map((event) => event.context.is_bot)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it('puts the campaign of the address on the exposure, so it stands without the browser', async () => {
    await visit({}, { query: '?utm_source=instagram&utm_medium=paid_social&aff=internal' });
    expect(sink.events[0]?.context).toMatchObject({
      last_source: 'instagram',
      last_medium: 'paid_social',
      aff: 'internal',
    });
    expect(sink.events[0]?.context).not.toHaveProperty('first_source');

    await visit();
    expect(sink.events[1]?.context).not.toHaveProperty('last_source');
  });

  it('stops counting exposures from one address past the ceiling, and still serves the page', async () => {
    const keys: string[] = [];
    const limiter = {
      limit: ({ key }: { key: string }) => {
        keys.push(key);
        return Promise.resolve({ success: false });
      },
    };
    const response = await visit({ 'CF-Connecting-IP': '203.0.113.9' }, { options: { limiter } });
    expect(response.status).toBe(200);
    expect(keys).toEqual(['exposure:203.0.113.9']);
    expect(sink.events).toHaveLength(0);
  });

  it('still serves the page when the analytics destination fails', async () => {
    sink.send = () => Promise.reject(new Error('destination down'));
    expect((await visit()).status).toBe(200);
  });
});

describe('the landing page on the development server', () => {
  it("redirects to the visitor's arm, with the same assignment and cookie", () => {
    const known = redirectToArm(
      new Request(`${ORIGIN}/`, { headers: { Cookie: `${VISITOR_COOKIE}=visitor-a` } }),
    );
    expect(known.status).toBe(302);
    expect(known.headers.get('Location')).toBe(`/variants/${assign('hero_signup', 'visitor-a')}/`);
    expect(known.headers.has('Set-Cookie')).toBe(false);

    const fresh = redirectToArm(new Request(`${ORIGIN}/`));
    const id = /fxr_aid=([^;]+)/.exec(fresh.headers.get('Set-Cookie') ?? '')?.[1] ?? '';
    expect(fresh.headers.get('Location')).toBe(`/variants/${assign('hero_signup', id)}/`);
  });
});
