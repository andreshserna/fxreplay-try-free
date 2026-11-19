/**
 * First-touch and last-touch attribution, captured in the browser (ADR 0013).
 *
 * A touch is the visit that brought someone in: UTM values, the affiliate parameters
 * `via` and `aff`, or what the referrer says when there are none. Every value passes
 * `toLabel`, so an email pasted into a UTM never reaches storage, the API or analytics.
 * Click ids are read only to infer the source. Their values are never kept.
 *
 * The first touch is set once. The last touch moves with every new touch. A direct
 * visit changes nothing, so a campaign is not erased by the visitor coming back later.
 */
import type { Attribution } from '../api/schemas';
import type { EventContext } from './registry';
import { PATH_PATTERN } from './registry';
import { toLabel } from './validate';

export type Touch = NonNullable<Attribution['first_touch']>;
type Resolved = { first_touch: Touch | null; last_touch: Touch | null };
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
type AttributionContext = Pick<
  EventContext,
  | 'first_source'
  | 'first_medium'
  | 'first_campaign'
  | 'last_source'
  | 'last_medium'
  | 'last_campaign'
  | 'via'
  | 'aff'
>;

export const STORAGE_KEY = 'fxr_attribution';

const LABEL_FIELDS = ['source', 'medium', 'campaign', 'content', 'term', 'via', 'aff'] as const;
type LabelField = (typeof LABEL_FIELDS)[number];

const QUERY_PARAMETERS: Record<LabelField, string> = {
  source: 'utm_source',
  medium: 'utm_medium',
  campaign: 'utm_campaign',
  content: 'utm_content',
  term: 'utm_term',
  via: 'via',
  aff: 'aff',
};

/** Click id, then the source and medium it implies. */
const CLICK_IDS = [
  ['gclid', 'google', 'cpc'],
  ['gbraid', 'google', 'cpc'],
  ['wbraid', 'google', 'cpc'],
  ['fbclid', 'facebook', 'paid_social'],
  ['ttclid', 'tiktok', 'paid_social'],
  ['msclkid', 'bing', 'cpc'],
] as const;

/** Hostname pattern, then the engine's name as a source. */
const SEARCH_ENGINES = [
  [/(^|\.)google\.[a-z.]+$/, 'google'],
  [/(^|\.)bing\.com$/, 'bing'],
  [/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
  [/(^|\.)yahoo\.[a-z.]+$/, 'yahoo'],
  [/(^|\.)yandex\.[a-z.]+$/, 'yandex'],
  [/(^|\.)baidu\.com$/, 'baidu'],
] as const;

const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

/** The source and medium a referrer implies, or null when it is missing or internal. */
function fromReferrer(referrer: string, ownHost: string): Partial<Touch> | null {
  let parsed: URL;
  try {
    parsed = new URL(referrer);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.host === ownHost) return null;
  const engine = SEARCH_ENGINES.find(([pattern]) => pattern.test(parsed.hostname));
  if (engine) return { source: engine[1], medium: 'organic' };
  const source = toLabel(parsed.hostname.replace(/^www\./, ''));
  return source ? { source, medium: 'referral' } : { medium: 'referral' };
}

/** The touch this page load represents, or null for a direct visit or internal navigation. */
export function readTouch(url: URL, referrer: string, now: Date): Touch | null {
  const found: Partial<Touch> = {};
  for (const field of LABEL_FIELDS) {
    const value = toLabel(url.searchParams.get(QUERY_PARAMETERS[field]));
    if (value) found[field] = value;
  }
  const hasCampaign = Object.keys(found).length > 0;
  const click = CLICK_IDS.find(([parameter]) => url.searchParams.get(parameter));

  if (!found.source && click) {
    found.source = click[1];
    found.medium ??= click[2];
  }
  if (!hasCampaign && !click) {
    const referred = fromReferrer(referrer, url.host);
    if (!referred) return null;
    Object.assign(found, referred);
  }

  const touch: Touch = {};
  for (const field of LABEL_FIELDS) {
    const value = found[field];
    if (value) touch[field] = value;
  }
  if (PATH_PATTERN.test(url.pathname)) touch.landing_path = url.pathname;
  touch.at = now.toISOString();
  return touch;
}

/** The attribution after this touch: first touch kept, last touch moved, direct ignored. */
export function nextAttribution(stored: Attribution | null, touch: Touch | null): Attribution {
  const first = stored?.first_touch ?? null;
  const last = stored?.last_touch ?? null;
  if (!touch) return { first_touch: first, last_touch: last };
  return { first_touch: first ?? touch, last_touch: touch };
}

const isLabel = (value: unknown): boolean => typeof value === 'string' && toLabel(value) === value;

function isTouch(value: unknown): value is Touch {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, field]) => {
    if (key === 'landing_path') return typeof field === 'string' && PATH_PATTERN.test(field);
    if (key === 'at') return typeof field === 'string' && TIMESTAMP_PATTERN.test(field);
    return (LABEL_FIELDS as readonly string[]).includes(key) && isLabel(field);
  });
}

const isTouchOrNothing = (value: unknown): boolean =>
  value === undefined || value === null || isTouch(value);

/** What was stored, or null when storage is blocked, empty, or holds anything else. */
export function loadAttribution(storage: StorageLike): Resolved | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const keys = Object.keys(parsed);
    if (keys.some((key) => key !== 'first_touch' && key !== 'last_touch')) return null;
    const { first_touch, last_touch } = parsed as Record<string, unknown>;
    if (!isTouchOrNothing(first_touch) || !isTouchOrNothing(last_touch)) return null;
    return {
      first_touch: (first_touch as Touch | null | undefined) ?? null,
      last_touch: (last_touch as Touch | null | undefined) ?? null,
    };
  } catch {
    return null;
  }
}

/** Stores the attribution. A blocked or full storage is ignored. */
export function saveAttribution(storage: StorageLike, attribution: Attribution): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // Attribution is lost for the next visit. The page and the signup carry on.
  }
}

/** Reads this page load's touch, merges it with what was stored, stores and returns the result. */
export function captureAttribution(options: {
  url: URL;
  referrer: string;
  now: Date;
  storage: StorageLike;
}): Attribution {
  const { url, referrer, now, storage } = options;
  const attribution = nextAttribution(loadAttribution(storage), readTouch(url, referrer, now));
  saveAttribution(storage, attribution);
  return attribution;
}

/** The flat attribution fields every analytics event carries. Keys without a value are left out. */
export function toContext(attribution: Attribution): AttributionContext {
  const first = attribution.first_touch ?? undefined;
  const last = attribution.last_touch ?? undefined;
  const entries: [keyof AttributionContext, string | undefined][] = [
    ['first_source', first?.source],
    ['first_medium', first?.medium],
    ['first_campaign', first?.campaign],
    ['last_source', last?.source],
    ['last_medium', last?.medium],
    ['last_campaign', last?.campaign],
    ['via', last?.via ?? first?.via],
    ['aff', last?.aff ?? first?.aff],
  ];
  const context: AttributionContext = {};
  for (const [key, value] of entries) if (value) context[key] = value;
  return context;
}
