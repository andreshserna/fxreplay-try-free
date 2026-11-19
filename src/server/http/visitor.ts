/**
 * The visitor's anonymous id: a first-party cookie set by the server.
 *
 * It is HttpOnly. The page's scripts never read it: the server attaches it to every
 * event and to the signup, so the id cannot be altered or leaked by a script, and it
 * is not subject to the short lifetimes browsers give to cookies written from script.
 */
import { ID_PATTERN } from '../../lib/analytics/registry';
import { readCookie } from './session';

export const VISITOR_COOKIE = 'fxr_aid';
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export interface Visitor {
  id: string;
  /** True when the id was created for this request and still has to be set. */
  isNew: boolean;
}

export function readVisitor(request: Request): Visitor {
  const existing = readCookie(request.headers.get('Cookie'), VISITOR_COOKIE);
  return existing && ID_PATTERN.test(existing)
    ? { id: existing, isNew: false }
    : { id: crypto.randomUUID(), isNew: true };
}

export const visitorCookie = (id: string): string =>
  `${VISITOR_COOKIE}=${id}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; HttpOnly; Secure; SameSite=Lax`;

const AUTOMATED =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|monitor|curl|wget|externalhit|whatsapp|python|go-http|okhttp|axios|node-fetch|http-?client/i;

/**
 * A cheap first filter: link crawlers, monitors, scripts, and a request that names no
 * agent at all. Events from automated agents are kept and flagged, not dropped.
 */
export const looksAutomated = (request: Request): boolean => {
  const agent = request.headers.get('User-Agent') ?? '';
  return agent === '' || AUTOMATED.test(agent);
};

/**
 * Whether a request is a browser about to show the document to a person: a GET, not a
 * prefetch, and not a fetch for something else (an image tag on another site pointed at
 * the page). Browsers that send no fetch metadata are given the benefit of the doubt.
 */
export function isPageView(request: Request): boolean {
  if (request.method !== 'GET') return false;
  if (/prefetch|prerender/i.test(request.headers.get('Sec-Purpose') ?? '')) return false;
  const destination = request.headers.get('Sec-Fetch-Dest');
  return destination === null || destination === 'document';
}

/** The country Cloudflare resolved for the request, as a lowercase label. */
export function requestCountry(request: Request): string | undefined {
  const country = (request as { cf?: { country?: unknown } }).cf?.country;
  return typeof country === 'string' && /^[A-Za-z]{2}$/.test(country)
    ? country.toLowerCase()
    : undefined;
}
