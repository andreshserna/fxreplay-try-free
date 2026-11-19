import { describe, expect, it } from 'vitest';

import {
  STORAGE_KEY,
  captureAttribution,
  loadAttribution,
  nextAttribution,
  readTouch,
  saveAttribution,
  toContext,
  type Touch,
} from '../../src/lib/analytics/attribution';
import { checkContext } from '../../src/lib/analytics/validate';
import { attributionSchema } from '../../src/lib/api/schemas';

const NOW = new Date('2026-11-18T23:29:22.120Z');
const LATER = new Date('2026-11-20T10:00:00.000Z');
const SITE = 'https://try.example.com';

const page = (query = '', path = '/') => new URL(`${SITE}${path}${query}`);
const touchOf = (query: string, referrer = '') => readTouch(page(query), referrer, NOW);

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

describe('readTouch', () => {
  it('reads every campaign parameter, the landing path and the time', () => {
    const touch = touchOf(
      '?utm_source=youtube&utm_medium=video&utm_campaign=bf_2026&utm_content=hero&utm_term=backtesting&via=trader_joe&aff=partner1',
      '',
    );
    expect(touch).toEqual({
      source: 'youtube',
      medium: 'video',
      campaign: 'bf_2026',
      content: 'hero',
      term: 'backtesting',
      via: 'trader_joe',
      aff: 'partner1',
      landing_path: '/',
      at: '2026-11-18T23:29:22.120Z',
    });
    expect(attributionSchema.safeParse({ first_touch: touch, last_touch: touch }).success).toBe(
      true,
    );
  });

  it('drops an email typed into a UTM and keeps the rest', () => {
    const touch = touchOf('?utm_source=newsletter&utm_campaign=ada%40example.com');
    expect(touch).toEqual({
      source: 'newsletter',
      landing_path: '/',
      at: NOW.toISOString(),
    });
    expect(JSON.stringify(touch)).not.toContain('@');
  });

  it('normalizes uppercase and spaces', () => {
    const touch = touchOf('?utm_source=YouTube&utm_campaign=Black+Friday%202026');
    expect(touch?.source).toBe('youtube');
    expect(touch?.campaign).toBe('black_friday_2026');
  });

  it.each([
    ['gclid', 'google', 'cpc'],
    ['gbraid', 'google', 'cpc'],
    ['wbraid', 'google', 'cpc'],
    ['fbclid', 'facebook', 'paid_social'],
    ['ttclid', 'tiktok', 'paid_social'],
    ['msclkid', 'bing', 'cpc'],
  ])('infers the source from %s and never stores its value', (parameter, source, medium) => {
    const touch = touchOf(`?${parameter}=Cj0KCQiA_secret_click_value`);
    expect(touch).toMatchObject({ source, medium });
    expect(JSON.stringify(touch)).not.toContain('secret_click_value');
  });

  it('lets an explicit utm_source win over a click id', () => {
    expect(touchOf('?utm_source=newsletter&gclid=abc')?.source).toBe('newsletter');
  });

  it('keeps the campaign when the source comes from a click id', () => {
    expect(touchOf('?gclid=abc&utm_campaign=brand')).toMatchObject({
      source: 'google',
      medium: 'cpc',
      campaign: 'brand',
    });
  });

  it.each([
    ['https://www.google.com/', 'google'],
    ['https://www.google.co.uk/search?q=fx', 'google'],
    ['https://www.bing.com/search?q=fx', 'bing'],
    ['https://duckduckgo.com/', 'duckduckgo'],
    ['https://search.yahoo.com/', 'yahoo'],
    ['https://yandex.ru/', 'yandex'],
    ['https://www.baidu.com/', 'baidu'],
  ])('classifies %s as organic search', (referrer, source) => {
    expect(touchOf('', referrer)).toMatchObject({ source, medium: 'organic' });
  });

  it('classifies any other external host as a referral, without www', () => {
    expect(touchOf('', 'https://www.Reddit.com/r/Forex/comments/1')).toMatchObject({
      source: 'reddit.com',
      medium: 'referral',
    });
  });

  it('prefers campaign parameters over the referrer', () => {
    expect(touchOf('?utm_source=newsletter', 'https://www.google.com/')).toMatchObject({
      source: 'newsletter',
    });
    expect(touchOf('?utm_source=newsletter', 'https://www.google.com/')?.medium).toBeUndefined();
  });

  it('treats a visit with no parameters and no referrer as direct', () => {
    expect(touchOf('', '')).toBeNull();
  });

  it('treats an internal referrer as direct', () => {
    expect(touchOf('', `${SITE}/problems/email-taken`)).toBeNull();
  });

  it('treats an unparsable referrer as direct', () => {
    expect(touchOf('', 'not a url')).toBeNull();
  });

  it('leaves out a landing path that is not a plain site path', () => {
    const touch = readTouch(page('?utm_source=x', '/caf%C3%A9'), '', NOW);
    expect(touch).not.toHaveProperty('landing_path');
  });
});

describe('nextAttribution', () => {
  const campaign: Touch = { source: 'youtube', medium: 'video', at: NOW.toISOString() };
  const later: Touch = { source: 'newsletter', medium: 'email', at: LATER.toISOString() };

  it('starts empty with nothing stored and a direct visit', () => {
    expect(nextAttribution(null, null)).toEqual({ first_touch: null, last_touch: null });
  });

  it('sets both touches on the first campaign', () => {
    expect(nextAttribution(null, campaign)).toEqual({
      first_touch: campaign,
      last_touch: campaign,
    });
  });

  it('keeps the first touch when a later campaign moves the last touch', () => {
    const stored = nextAttribution(null, campaign);
    expect(nextAttribution(stored, later)).toEqual({ first_touch: campaign, last_touch: later });
  });

  it('keeps the campaign as last touch after a direct visit', () => {
    const stored = nextAttribution(null, campaign);
    expect(nextAttribution(stored, null)).toEqual(stored);
  });
});

describe('storage', () => {
  it('round-trips what it saves', () => {
    const storage = memoryStorage();
    const attribution = nextAttribution(null, touchOf('?utm_source=youtube'));
    saveAttribution(storage, attribution);
    expect(loadAttribution(storage)).toEqual(attribution);
  });

  it.each([
    ['not JSON', '{oops'],
    ['an array', '[]'],
    ['a string', '"youtube"'],
    ['an unknown key', JSON.stringify({ first_touch: null, last_touch: null, extra: 1 })],
    ['a touch with an unknown key', JSON.stringify({ first_touch: { email: 'x' } })],
    ['a value that is not a label', JSON.stringify({ last_touch: { source: 'ada@example.com' } })],
    ['a bad timestamp', JSON.stringify({ last_touch: { source: 'x', at: 'yesterday' } })],
  ])('ignores %s in storage', (_, raw) => {
    expect(loadAttribution(memoryStorage({ [STORAGE_KEY]: raw }))).toBeNull();
  });

  it('never throws when storage is blocked', () => {
    expect(loadAttribution(throwingStorage)).toBeNull();
    expect(() => saveAttribution(throwingStorage, { first_touch: null })).not.toThrow();
  });
});

describe('captureAttribution', () => {
  it('stores the first campaign and moves only the last touch on the next one', () => {
    const storage = memoryStorage();
    captureAttribution({
      url: page('?utm_source=youtube&utm_campaign=launch'),
      referrer: '',
      now: NOW,
      storage,
    });
    const result = captureAttribution({
      url: page('?utm_source=newsletter&utm_medium=email'),
      referrer: '',
      now: LATER,
      storage,
    });
    expect(result.first_touch).toMatchObject({ source: 'youtube', campaign: 'launch' });
    expect(result.last_touch).toMatchObject({ source: 'newsletter', medium: 'email' });
    expect(JSON.parse(storage.items.get(STORAGE_KEY) ?? 'null')).toEqual(result);
  });

  it('keeps the campaign as last touch when the visitor comes back directly', () => {
    const storage = memoryStorage();
    const first = captureAttribution({
      url: page('?utm_source=youtube'),
      referrer: '',
      now: NOW,
      storage,
    });
    const again = captureAttribution({ url: page(), referrer: '', now: LATER, storage });
    expect(again).toEqual(first);
  });

  it('ignores garbage in storage and starts over', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: '{"first_touch":{"email":"a@b.co"}}' });
    const result = captureAttribution({
      url: page('?utm_source=youtube'),
      referrer: '',
      now: NOW,
      storage,
    });
    expect(result.first_touch).toMatchObject({ source: 'youtube' });
  });

  it('still returns the attribution when storage throws on both methods', () => {
    const result = captureAttribution({
      url: page('?utm_source=youtube'),
      referrer: '',
      now: NOW,
      storage: throwingStorage,
    });
    expect(result.first_touch).toMatchObject({ source: 'youtube' });
    expect(result.last_touch).toMatchObject({ source: 'youtube' });
  });
});

describe('toContext', () => {
  const minimalContext = {
    event_id: '0b5c1b0e-6a54-4d0f-9d43-2f6f0e7a9c11',
    occurred_at: '2026-11-18T23:29:22.120Z',
    anonymous_id: '7d1f3f5e-0f0a-4c7b-9a57-3b1a8c1e2d44',
    release: 'a1b2c3d',
  };

  it('flattens both touches into the context fields and passes checkContext', () => {
    const context = toContext({
      first_touch: { source: 'youtube', medium: 'video', campaign: 'launch', via: 'trader_joe' },
      last_touch: { source: 'newsletter', medium: 'email', aff: 'partner1' },
    });
    expect(context).toEqual({
      first_source: 'youtube',
      first_medium: 'video',
      first_campaign: 'launch',
      last_source: 'newsletter',
      last_medium: 'email',
      via: 'trader_joe',
      aff: 'partner1',
    });
    const checked = checkContext({ ...minimalContext, ...context });
    expect(checked).toEqual({ ok: true, value: { ...minimalContext, ...context }, dropped: [] });
  });

  it('takes via and aff from the last touch before the first', () => {
    const context = toContext({
      first_touch: { via: 'old_partner', aff: 'old_tag' },
      last_touch: { via: 'new_partner' },
    });
    expect(context).toEqual({ via: 'new_partner', aff: 'old_tag' });
  });

  it('is empty when nothing is known', () => {
    expect(toContext({ first_touch: null, last_touch: null })).toEqual({});
    expect(toContext({})).toEqual({});
  });
});
