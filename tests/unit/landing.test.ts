import { beforeEach, describe, expect, it } from 'vitest';

import { assign } from '../../src/lib/experiments/registry';
import { ServerEvents } from '../../src/server/analytics/emitter';
import { MemorySink } from '../../src/server/analytics/sink';
import { VISITOR_COOKIE } from '../../src/server/http/visitor';
import { serveLanding, type Assets } from '../../src/server/landing';

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

async function visit(headers: Record<string, string> = {}) {
  const response = await serveLanding(
    new Request(`${ORIGIN}/?utm_source=instagram`, { headers }),
    { assets, events },
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

  it('records the exposure on the server, with the arm, before any HTML is read', async () => {
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

  it('answers a revalidation with 304 and still counts the exposure', async () => {
    const cookie = { Cookie: `${VISITOR_COOKIE}=visitor-a` };
    const first = await visit(cookie);
    const again = await visit({ ...cookie, 'If-None-Match': first.headers.get('ETag') ?? '' });
    expect(again.status).toBe(304);
    expect(sink.events).toHaveLength(2);
  });

  it('does not count a prefetch as an exposure, and flags automated agents', async () => {
    await visit({ 'Sec-Purpose': 'prefetch;prerender' });
    expect(sink.events).toHaveLength(0);
    await visit({ 'User-Agent': 'Mozilla/5.0 (compatible; bingbot/2.0)' });
    expect(sink.events[0]?.context.is_bot).toBe(true);
  });

  it('still serves the page when the analytics destination fails', async () => {
    sink.send = () => Promise.reject(new Error('destination down'));
    expect((await visit()).status).toBe(200);
  });
});
