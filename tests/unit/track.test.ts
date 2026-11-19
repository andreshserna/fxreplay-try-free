import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STORAGE_KEY } from '../../src/lib/analytics/attribution';
import {
  SESSION_KEY,
  createTracker,
  track as defaultTrack,
  type TrackerDeps,
} from '../../src/lib/analytics/track';
import { toVitalsEvent } from '../../src/lib/analytics/vitals';
import { RELEASE } from '../../src/lib/release';
import { Collector } from '../../src/server/analytics/collector';
import { MemorySink } from '../../src/server/analytics/sink';
import { VISITOR_COOKIE } from '../../src/server/http/visitor';

const SITE = 'https://try.example.com';
const NOW = new Date('2026-11-18T23:29:22.000Z');
const MINUTE = 60 * 1000;

interface Batch {
  context: Record<string, unknown>;
  events: {
    name: string;
    properties: Record<string, unknown>;
    event_id: string;
    occurred_at: string;
  }[];
}

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

const throwingStorage = {
  getItem: (): string | null => {
    throw new Error('SecurityError: storage is blocked');
  },
  setItem: (): void => {
    throw new Error('QuotaExceededError');
  },
};

let ids = 0;

/** A tracker on fake deps. Timers and the clock are Vitest's fake ones. */
function setup(
  options: {
    query?: string;
    width?: number;
    experiments?: string;
    deps?: Partial<TrackerDeps>;
  } = {},
) {
  const raw: { body: string; urgent: boolean }[] = [];
  const sessionStorage = memoryStorage();
  const localStorage = memoryStorage();
  const deps: TrackerDeps = {
    page: {
      url: new URL(`${SITE}/${options.query ?? ''}`),
      referrer: '',
      viewportWidth: options.width ?? 390,
      experiments: options.experiments,
    },
    sessionStorage,
    localStorage,
    send: (body, urgent) => void raw.push({ body, urgent }),
    now: () => new Date(),
    randomId: () => `id-${(ids += 1)}`,
    setTimer: (callback, ms) => setTimeout(callback, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    ...options.deps,
  };
  const tracker = createTracker(deps);
  const batches = () => raw.map(({ body }) => JSON.parse(body) as Batch);
  return { tracker, deps, raw, batches, sessionStorage, localStorage };
}

beforeEach(() => {
  ids = 0;
  vi.useFakeTimers({ now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the tracker', () => {
  it('sends one batch two seconds after the first event, with every event and one context', () => {
    const { tracker, batches } = setup({ experiments: 'hero_signup:inline_email' });
    tracker.track('landing_viewed');
    vi.advanceTimersByTime(500);
    tracker.track('cta_clicked', { cta_name: 'start_free', cta_location: 'hero' });
    vi.advanceTimersByTime(1499);
    expect(batches()).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(batches()).toEqual([
      {
        context: {
          page_path: '/',
          device_class: 'mobile',
          release: RELEASE,
          experiments: 'hero_signup:inline_email',
          session_id: 'id-1',
        },
        events: [
          {
            name: 'landing_viewed',
            properties: {},
            event_id: 'id-2',
            occurred_at: '2026-11-18T23:29:22.000Z',
          },
          {
            name: 'cta_clicked',
            properties: { cta_name: 'start_free', cta_location: 'hero' },
            event_id: 'id-3',
            occurred_at: '2026-11-18T23:29:22.500Z',
          },
        ],
      },
    ]);

    vi.advanceTimersByTime(10_000);
    expect(batches()).toHaveLength(1);
  });

  it('flushes at once when ten events are queued', () => {
    const { tracker, batches } = setup();
    for (let index = 0; index < 9; index += 1) tracker.track('landing_viewed');
    expect(batches()).toHaveLength(0);
    tracker.track('landing_viewed');
    expect(batches()).toHaveLength(1);
    expect(batches()[0]?.events).toHaveLength(10);

    // The timer of the flushed batch is gone: nothing more goes out.
    vi.advanceTimersByTime(5000);
    expect(batches()).toHaveLength(1);
  });

  it('sends nothing when flushed with an empty queue, and passes urgency to the transport', () => {
    const { tracker, raw } = setup();
    tracker.flush();
    tracker.flush(true);
    expect(raw).toHaveLength(0);

    tracker.track('landing_viewed');
    tracker.flush(true);
    tracker.flush(true);
    expect(raw.map(({ urgent }) => urgent)).toEqual([true]);
  });

  it.each([
    [390, 'mobile'],
    [767, 'mobile'],
    [768, 'tablet'],
    [1023, 'tablet'],
    [1024, 'desktop'],
    [1440, 'desktop'],
  ])('sends a viewport %i px wide as %s', (width, expected) => {
    const { tracker, batches } = setup({ width });
    tracker.track('landing_viewed');
    tracker.flush();
    expect(batches()[0]?.context.device_class).toBe(expected);
  });

  it('leaves out experiments when the page has none, and never sends the visitor id', () => {
    const { tracker, raw, batches } = setup({ experiments: '' });
    tracker.track('landing_viewed');
    tracker.flush();
    expect(Object.keys(batches()[0]?.context ?? {}).sort()).toEqual([
      'device_class',
      'page_path',
      'release',
      'session_id',
    ]);
    expect(raw[0]?.body).not.toContain('anonymous_id');
  });

  it('carries attribution from the URL flat in the context and whole from attribution()', () => {
    const { tracker, batches, localStorage } = setup({
      query: '?utm_source=Instagram&utm_medium=social&utm_campaign=Launch+Week&via=ana',
    });
    tracker.track('landing_viewed');
    tracker.flush();

    expect(batches()[0]?.context).toMatchObject({
      first_source: 'instagram',
      first_medium: 'social',
      first_campaign: 'launch_week',
      last_source: 'instagram',
      last_medium: 'social',
      last_campaign: 'launch_week',
      via: 'ana',
    });
    const touch = {
      source: 'instagram',
      medium: 'social',
      campaign: 'launch_week',
      via: 'ana',
      landing_path: '/',
      at: NOW.toISOString(),
    };
    expect(tracker.attribution()).toEqual({ first_touch: touch, last_touch: touch });
    expect(localStorage.items.has(STORAGE_KEY)).toBe(true);
  });

  it('keeps the session within 30 minutes of the last event and starts a new one after', () => {
    const first = setup();
    first.tracker.track('landing_viewed');
    first.tracker.flush();
    const id = first.batches()[0]?.context.session_id;

    // A later page load in the same tab, 29 minutes on.
    vi.advanceTimersByTime(29 * MINUTE);
    const second = setup({ deps: { sessionStorage: first.sessionStorage } });
    second.tracker.track('landing_viewed');
    second.tracker.flush();
    expect(second.batches()[0]?.context.session_id).toBe(id);

    // 29 more minutes: still within 30 of the last event, because each event refreshes it.
    vi.advanceTimersByTime(29 * MINUTE);
    second.tracker.track('cta_clicked', { cta_name: 'start_free', cta_location: 'hero' });
    second.tracker.flush();
    expect(second.batches()[1]?.context.session_id).toBe(id);

    // 31 minutes idle on the same page: a new session, in a batch of its own.
    vi.advanceTimersByTime(31 * MINUTE);
    second.tracker.track('signup_started', { form_location: 'hero' });
    second.tracker.flush();
    const renewed = second.batches()[2]?.context.session_id;
    expect(renewed).not.toBe(id);
    expect(JSON.parse(first.sessionStorage.getItem(SESSION_KEY) ?? '')).toEqual({
      id: renewed,
      seen: NOW.getTime() + 89 * MINUTE,
    });
  });

  it('ends the batch of the old session before queueing the first event of the new one', () => {
    const { tracker, batches } = setup();
    tracker.track('landing_viewed');
    vi.setSystemTime(NOW.getTime() + 31 * MINUTE);
    tracker.track('cta_clicked', { cta_name: 'start_free', cta_location: 'hero' });
    tracker.flush();
    expect(batches().map((batch) => batch.events.map((event) => event.name))).toEqual([
      ['landing_viewed'],
      ['cta_clicked'],
    ]);
    expect(batches()[0]?.context.session_id).not.toBe(batches()[1]?.context.session_id);
  });

  it('still tracks with blocked storage, on a stable session kept in memory', () => {
    const { tracker, batches } = setup({
      query: '?utm_source=newsletter',
      deps: { sessionStorage: throwingStorage, localStorage: throwingStorage },
    });
    tracker.track('landing_viewed');
    tracker.flush();
    vi.advanceTimersByTime(5 * MINUTE);
    tracker.track('cta_clicked', { cta_name: 'start_free', cta_location: 'hero' });
    tracker.flush();

    expect(batches()).toHaveLength(2);
    expect(batches()[0]?.context.session_id).toEqual(expect.any(String));
    expect(batches()[1]?.context.session_id).toBe(batches()[0]?.context.session_id);
    expect(batches()[0]?.context.first_source).toBe('newsletter');
    expect(tracker.attribution().first_touch?.source).toBe('newsletter');
  });

  it('replaces a session in storage that it cannot read', () => {
    const { tracker, batches, sessionStorage } = setup();
    sessionStorage.setItem(SESSION_KEY, '{"id":"ada@example.com","seen":1}');
    tracker.track('landing_viewed');
    tracker.flush();
    expect(batches()[0]?.context.session_id).toBe('id-1');
  });

  it('survives a transport that throws, and the next events still go out', () => {
    let failing = true;
    const delivered: string[] = [];
    const { tracker } = setup({
      deps: {
        send: (body) => {
          if (failing) throw new TypeError('Failed to fetch');
          delivered.push(body);
        },
      },
    });
    tracker.track('landing_viewed');
    expect(() => tracker.flush()).not.toThrow();
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();

    failing = false;
    tracker.track('cta_clicked', { cta_name: 'start_free', cta_location: 'plan' });
    vi.advanceTimersByTime(2000);
    expect(delivered.map((body) => (JSON.parse(body) as Batch).events[0]?.name)).toEqual([
      'cta_clicked',
    ]);
  });

  it('never throws when its own dependencies do', () => {
    const { tracker } = setup({
      deps: {
        randomId: () => {
          throw new Error('no entropy');
        },
        now: () => {
          throw new Error('no clock');
        },
      },
    });
    expect(() => tracker.track('landing_viewed')).not.toThrow();
    expect(() => tracker.flush(true)).not.toThrow();
    expect(tracker.attribution()).toEqual({});
  });

  it('pushes the event name and properties to the dataLayer, without ids', () => {
    const dataLayer: unknown[] = [];
    const { tracker } = setup({ deps: { dataLayer } });
    tracker.track('landing_viewed');
    tracker.track('cta_clicked', { cta_name: 'start_free', cta_location: 'plan' });
    expect(dataLayer).toEqual([
      { event: 'landing_viewed' },
      { event: 'cta_clicked', cta_name: 'start_free', cta_location: 'plan' },
    ]);
  });

  it('reports an invalid event in debug mode and still queues it for the collector to judge', () => {
    const debug = vi.fn();
    const { tracker, batches } = setup({ deps: { debug } });
    tracker.track('signup_submitted', { form_location: 'hero', attempt: 0 });
    tracker.track('signup_submitted', { form_location: 'hero', attempt: 1 });
    tracker.flush();
    expect(debug).toHaveBeenCalledTimes(1);
    expect(debug).toHaveBeenCalledWith(expect.stringContaining('signup_submitted'), [
      'attempt: not a valid integer',
    ]);
    expect(batches()[0]?.events).toHaveLength(2);
  });

  it('accepts only browser events from the registry, with exactly their properties', () => {
    const { tracker } = setup();
    // @ts-expect-error: the conversion is a server event
    tracker.track('signup_completed', { user_id: 'usr_1' });
    // @ts-expect-error: the exposure is a server event
    tracker.track('experiment_exposed', { experiment: 'hero_signup', variant: 'control' });
    // @ts-expect-error: not a registered event
    tracker.track('button_clicked');
    // @ts-expect-error: cta_location must be a registered section
    tracker.track('cta_clicked', { cta_name: 'start_free', cta_location: 'footer' });
    // @ts-expect-error: cta_location is required
    tracker.track('cta_clicked', { cta_name: 'start_free' });
    // @ts-expect-error: cta_clicked has properties to pass
    tracker.track('cta_clicked');
    // @ts-expect-error: no unregistered property, such as what the visitor typed
    tracker.track('signup_started', { form_location: 'hero', email: 'ada@example.com' });
    // @ts-expect-error: landing_viewed has no properties
    tracker.track('landing_viewed', { form_location: 'hero' });
  });

  it('is a no-op on the server, where there is no window', () => {
    expect(() => defaultTrack('landing_viewed')).not.toThrow();
  });
});

describe('the tracker and the collector', () => {
  it('sends a body the real collector accepts, with every property and the context', async () => {
    const { tracker, raw } = setup({
      query: '?utm_source=instagram&aff=partner_1',
      experiments: 'hero_signup:inline_email',
    });
    tracker.track('landing_viewed');
    tracker.track('signup_failed', { form_location: 'closing', attempt: 2, reason: 'timeout' });
    tracker.track('web_vitals', { metric: 'CLS', value: 0.0123, rating: 'good' });
    tracker.flush();

    const sink = new MemorySink();
    const deferred: Promise<unknown>[] = [];
    const collector = new Collector({ sink, now: () => NOW });
    const response = await collector.collect(
      new Request(`${SITE}/api/events`, {
        method: 'POST',
        headers: { Origin: SITE, Cookie: `${VISITOR_COOKIE}=visitor-1` },
        body: raw[0]?.body ?? '',
      }),
      (work) => deferred.push(work),
    );
    await Promise.all(deferred);

    expect(await response.json()).toEqual({ accepted: 3, rejected: 0 });
    expect(sink.events.map(({ name, properties }) => ({ name, properties }))).toEqual([
      { name: 'landing_viewed', properties: {} },
      {
        name: 'signup_failed',
        properties: { form_location: 'closing', attempt: 2, reason: 'timeout' },
      },
      { name: 'web_vitals', properties: { metric: 'CLS', value: 0.0123, rating: 'good' } },
    ]);
    expect(sink.events[1]?.context).toEqual({
      event_id: 'id-3',
      occurred_at: NOW.toISOString(),
      anonymous_id: 'visitor-1',
      session_id: 'id-1',
      page_path: '/',
      device_class: 'mobile',
      release: RELEASE,
      experiments: 'hero_signup:inline_email',
      first_source: 'instagram',
      last_source: 'instagram',
      aff: 'partner_1',
      source: 'client',
      is_bot: false,
    });
  });
});

describe('toVitalsEvent', () => {
  it('rounds LCP and INP to whole milliseconds and CLS to four decimals', () => {
    expect(toVitalsEvent({ name: 'LCP', value: 1834.56, rating: 'good' })).toEqual({
      metric: 'LCP',
      value: 1835,
      rating: 'good',
    });
    expect(toVitalsEvent({ name: 'INP', value: 216.4, rating: 'needs-improvement' })).toEqual({
      metric: 'INP',
      value: 216,
      rating: 'needs-improvement',
    });
    expect(toVitalsEvent({ name: 'CLS', value: 0.123456789, rating: 'poor' })).toEqual({
      metric: 'CLS',
      value: 0.1235,
      rating: 'poor',
    });
    expect(toVitalsEvent({ name: 'CLS', value: 0, rating: 'good' }).value).toBe(0);
  });
});
