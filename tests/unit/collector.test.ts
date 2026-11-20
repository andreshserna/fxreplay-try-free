import { beforeEach, describe, expect, it } from 'vitest';

import type { Problem } from '../../src/lib/api/problems';
import { Collector } from '../../src/server/analytics/collector';
import { ServerEvents } from '../../src/server/analytics/emitter';
import { MemorySink, PostHogSink, toPostHog } from '../../src/server/analytics/sink';
import { VISITOR_COOKIE } from '../../src/server/http/visitor';

const ORIGIN = 'https://demo.example';
const NOW = new Date('2026-11-18T23:29:22.000Z');

const shared = {
  session_id: 'b6c1f1de-2f0e-4f0e-8a54-1e2d3c4b5a69',
  page_path: '/',
  device_class: 'mobile',
  release: 'a1b2c3d',
  experiments: 'hero_signup:inline_email',
  first_source: 'instagram',
};

const event = (
  name: string,
  properties: Record<string, unknown> = {},
  id = crypto.randomUUID(),
) => ({
  name,
  properties,
  event_id: id,
  occurred_at: '2026-11-18T23:29:20.500Z',
});

let sink: MemorySink;
let collector: Collector;
let deferred: Promise<unknown>[];

beforeEach(() => {
  sink = new MemorySink();
  deferred = [];
  collector = new Collector({ sink, now: () => NOW });
});

const BROWSER =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36';

async function send(body: unknown, headers: Record<string, string> = {}) {
  const response = await collector.collect(
    new Request(`${ORIGIN}/api/events`, {
      method: 'POST',
      headers: {
        Origin: ORIGIN,
        Cookie: `${VISITOR_COOKIE}=visitor-1`,
        'User-Agent': BROWSER,
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    (work) => deferred.push(work),
  );
  await Promise.all(deferred);
  return response;
}

describe('the event collector', () => {
  it('accepts registered browser events and adds what only the server knows', async () => {
    const response = await send({
      context: shared,
      events: [event('landing_viewed'), event('signup_started', { form_location: 'hero' })],
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: 2, rejected: 0 });
    expect(sink.events.map((item) => item.name)).toEqual(['landing_viewed', 'signup_started']);
    expect(sink.events[1]).toMatchObject({
      properties: { form_location: 'hero' },
      context: {
        ...shared,
        anonymous_id: 'visitor-1',
        source: 'client',
        is_bot: false,
        occurred_at: '2026-11-18T23:29:20.500Z',
      },
    });
  });

  it('takes the visitor from the cookie, never from the payload', async () => {
    await send({
      context: { ...shared, anonymous_id: 'someone-else', source: 'server' },
      events: [event('landing_viewed')],
    });
    expect(sink.events[0]?.context).toMatchObject({ anonymous_id: 'visitor-1', source: 'client' });
  });

  it('gives a visitor without a cookie an id and sets it', async () => {
    const response = await send(
      { context: shared, events: [event('landing_viewed')] },
      { Cookie: '' },
    );
    const cookie = response.headers.get('Set-Cookie') ?? '';
    expect(cookie).toContain(`${VISITOR_COOKIE}=${sink.events[0]?.context.anonymous_id}`);
    expect(cookie).toContain('HttpOnly');
  });

  it('refuses the conversion and the exposure from a browser: they are server events', async () => {
    const response = await send({
      context: shared,
      events: [
        event('signup_completed', { user_id: 'usr_01JD3K8Q9ZC4N7V2M5XW6T8RBE' }),
        event('experiment_exposed', { experiment: 'hero_signup', variant: 'inline_email' }),
        event('landing_viewed'),
      ],
    });
    expect(await response.json()).toEqual({ accepted: 1, rejected: 2 });
    expect(sink.events.map((item) => item.name)).toEqual(['landing_viewed']);
  });

  it('drops what the registry does not define, so an email cannot leave by accident', async () => {
    await send({
      context: { ...shared, email: 'ada@example.com', first_campaign: 'ada@example.com' },
      events: [
        event('signup_failed', {
          form_location: 'hero',
          attempt: 1,
          reason: 'invalid_email',
          value: 'ada@example',
        }),
        event('made_up_event', { email: 'ada@example.com' }),
        event('signup_submitted', { form_location: 'hero' }),
      ],
    });
    expect(sink.events).toHaveLength(1);
    expect(JSON.stringify(sink.events)).not.toContain('ada@');
  });

  it("uses the server's clock when the browser's is implausible", async () => {
    await send({
      context: shared,
      events: [
        { ...event('landing_viewed'), occurred_at: '2019-01-01T00:00:00.000Z' },
        { ...event('landing_viewed'), occurred_at: 'yesterday' },
      ],
    });
    expect(sink.events.map((item) => item.context.occurred_at)).toEqual([
      NOW.toISOString(),
      NOW.toISOString(),
    ]);
  });

  it('flags automated agents instead of dropping them', async () => {
    await send(
      { context: shared, events: [event('landing_viewed')] },
      { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
    );
    expect(sink.events[0]?.context.is_bot).toBe(true);
  });

  it('refuses another origin, a malformed body, an oversized batch and too much data', async () => {
    const batch = { context: shared, events: [event('landing_viewed')] };
    const cases: [Response, number, string][] = [
      [await send(batch, { Origin: 'https://evil.example' }), 403, 'forbidden'],
      [await send('{not json'), 400, 'invalid_json'],
      [await send({ context: shared }), 422, 'validation_failed'],
      [
        await send({
          context: shared,
          events: Array.from({ length: 26 }, () => event('landing_viewed')),
        }),
        422,
        'validation_failed',
      ],
      [
        await send({ context: shared, events: [], padding: 'x'.repeat(17000) }),
        413,
        'payload_too_large',
      ],
    ];
    for (const [response, status, code] of cases) {
      expect(response.status).toBe(status);
      expect(((await response.json()) as Problem).code).toBe(code);
    }
    expect(sink.events).toHaveLength(0);
  });

  it('rate limits by client address', async () => {
    let calls = 0;
    collector = new Collector({
      sink,
      limiter: { limit: () => Promise.resolve({ success: (calls += 1) <= 1 }) },
    });
    const batch = { context: shared, events: [event('landing_viewed')] };
    expect((await send(batch)).status).toBe(202);
    const limited = await send(batch);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('60');
  });

  it('answers 202 even when the destination fails, and logs it without the payload', async () => {
    const logged: Record<string, unknown>[] = [];
    sink.send = () => Promise.reject(new Error('destination down'));
    collector = new Collector({ sink, log: (_message, detail) => logged.push(detail) });
    const response = await send({ context: shared, events: [event('landing_viewed')] });
    expect(response.status).toBe(202);
    expect(logged).toEqual([expect.objectContaining({ count: 1, error: 'destination down' })]);
  });
});

describe('the PostHog sink', () => {
  const analyticsEvent = {
    name: 'signup_started' as const,
    properties: { form_location: 'hero' },
    context: {
      event_id: 'e1',
      occurred_at: '2026-11-18T23:29:20.500Z',
      anonymous_id: 'visitor-1',
      release: 'a1b2c3d',
      experiments: 'hero_signup:inline_email',
      first_source: 'instagram',
    },
  };

  it('maps an event to the capture API: the visitor as distinct id, one property per experiment', () => {
    expect(toPostHog(analyticsEvent)).toEqual({
      event: 'signup_started',
      distinct_id: 'visitor-1',
      timestamp: '2026-11-18T23:29:20.500Z',
      properties: {
        event_id: 'e1',
        release: 'a1b2c3d',
        first_source: 'instagram',
        experiment_hero_signup: 'inline_email',
        form_location: 'hero',
        $process_person_profile: false,
      },
    });
  });

  it("sends a UUID event id as PostHog's own uuid too, the same on a resend", () => {
    const id = '0b5c1b0e-6a54-4d0f-9d43-2f6f0e7a9c11';
    const mapped = toPostHog({
      ...analyticsEvent,
      context: { ...analyticsEvent.context, event_id: id },
    });
    expect(mapped).toMatchObject({ uuid: id, properties: { event_id: id } });
    // The same event resent maps to the same uuid.
    expect(
      toPostHog({ ...analyticsEvent, context: { ...analyticsEvent.context, event_id: id } }).uuid,
    ).toBe(id);
  });

  it('sends no uuid for an event id that is not a UUID, rather than a malformed one', () => {
    for (const eventId of ['e1', 'a'.repeat(32), '0b5c1b0e6a544d0f9d432f6f0e7a9c11']) {
      const mapped = toPostHog({
        ...analyticsEvent,
        context: { ...analyticsEvent.context, event_id: eventId },
      });
      expect(mapped).not.toHaveProperty('uuid');
      expect(mapped.properties.event_id).toBe(eventId);
    }
  });

  it('gives every server event an id PostHog takes as its uuid', async () => {
    const memory = new MemorySink();
    const emitter = new ServerEvents({ sink: memory, release: 'test' });
    await emitter.emit('signup_completed', { user_id: 'usr_1' }, { anonymous_id: 'visitor-1' });
    const [emitted] = memory.events;
    expect(emitted && toPostHog(emitted).uuid).toBe(emitted?.context.event_id);
  });

  it('posts one batch with the project key, and fails loudly on a bad answer', async () => {
    const requests: { url: string; body: unknown }[] = [];
    let status = 200;
    const sinkToPostHog = new PostHogSink({
      key: 'phc_test',
      host: 'https://us.i.posthog.com/',
      fetch: (url, init) => {
        requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return Promise.resolve(new Response('{}', { status }));
      },
    });

    await sinkToPostHog.send([analyticsEvent, analyticsEvent]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://us.i.posthog.com/batch/');
    expect(requests[0]?.body).toMatchObject({ api_key: 'phc_test', batch: [{}, {}] });

    status = 503;
    await expect(sinkToPostHog.send([analyticsEvent])).rejects.toThrow('503');
    await sinkToPostHog.send([]);
    expect(requests).toHaveLength(2);
  });

  it('takes the country from the edge, never from the body, and flags a request with no agent', async () => {
    await send({ context: { ...shared, country: 'zz' }, events: [event('landing_viewed')] });
    expect(sink.events[0]?.context.country).toBeUndefined();
    await send({ context: shared, events: [event('landing_viewed')] }, { 'User-Agent': '' });
    expect(sink.events[1]?.context.is_bot).toBe(true);
  });

  it('refuses a timestamp from the future, beyond a clock that is a little fast', async () => {
    const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
    const response = await send({
      context: shared,
      events: [
        { ...event('landing_viewed'), occurred_at: at(4 * 60 * 1000) },
        { ...event('landing_viewed'), occurred_at: at(6 * 60 * 1000) },
      ],
    });
    expect(await response.json()).toEqual({ accepted: 2, rejected: 0 });
    // The first keeps its time. The second gets the server's.
    expect(sink.events.map((item) => item.context.occurred_at)).toEqual([
      at(4 * 60 * 1000),
      NOW.toISOString(),
    ]);
  });
});
