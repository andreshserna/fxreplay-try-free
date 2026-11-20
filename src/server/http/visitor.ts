/**
 * The visitor's anonymous id: a first-party cookie set by the server.
 *
 * It is HttpOnly. The page's scripts never read it: the server attaches it to every
 * event and to the signup, so the id cannot be altered or leaked by a script, and it
 * is not subject to the short lifetimes browsers give to cookies written from script.
 */
import { CONTEXT, ID_PATTERN } from '../../lib/analytics/registry';
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

type Browser = (typeof CONTEXT.browser.values)[number];
type System = (typeof CONTEXT.os.values)[number];

// The order matters. A page opened inside an app comes first: on Android it is a WebView
// that also says "Chrome", on iOS it says neither "Safari" nor anything else, and it is
// where paid social traffic lands and where forms most often misbehave. Then Edge, Samsung
// Internet and Opera, which also say "Chrome", and every Chromium browser also says
// "Safari". Android also says "Linux".
const BROWSERS: readonly (readonly [Browser, RegExp])[] = [
  [
    'in_app',
    // Named apps, any Android WebView, and on iOS any web view: there a page that is not
    // in a browser is the one agent that does not end by calling itself Safari.
    /; wv\)|\bFBAN\b|\bFBAV\b|FB_IAB|\bInstagram\b|musical_ly|trill_|BytedanceWebview|\bSnapchat\b|LinkedInApp|\b(?:iPhone|iPad|iPod)\b.*AppleWebKit(?!.*Safari\/)/,
  ],
  ['edge', /\bEdg(?:e|A|iOS)?\//],
  ['samsung', /\bSamsungBrowser\//],
  ['opera', /\b(?:OPR|OPT|OPX)\/|Opera Mini/],
  ['firefox', /\b(?:Firefox|FxiOS)\//],
  // No word boundary: a headless Chrome says "HeadlessChrome/".
  ['chrome', /Chrome\/|\bCriOS\//],
  ['safari', /\bSafari\//],
];
const SYSTEMS: readonly (readonly [System, RegExp])[] = [
  ['android', /\bAndroid\b/],
  ['ios', /\b(?:iPhone|iPad|iPod)\b/],
  ['chromeos', /\bCrOS\b/],
  ['windows', /\bWindows\b/],
  ['macos', /\bMacintosh\b|\bMac OS X\b/],
  ['linux', /\bLinux\b|\bX11\b/],
];
/** What Chromium browsers say in `Sec-CH-UA-Platform`, which is cleaner than the agent. */
const HINTED: Readonly<Record<string, System>> = {
  android: 'android',
  ios: 'ios',
  windows: 'windows',
  macos: 'macos',
  linux: 'linux',
  'chrome os': 'chromeos',
  'chromium os': 'chromeos',
};

/**
 * The browser family and the operating system of a request: two coarse labels, no
 * version, so they say where a bug lives without telling one visitor from another. An
 * iPad that asks for the desktop site calls itself a Mac, and is counted as one.
 */
export function clientOf(request: Request): { browser: Browser; os: System } {
  const agent = request.headers.get('User-Agent') ?? '';
  const hint = (request.headers.get('Sec-CH-UA-Platform') ?? '').replaceAll('"', '').toLowerCase();
  return {
    browser: BROWSERS.find(([, pattern]) => pattern.test(agent))?.[0] ?? 'other',
    os: HINTED[hint] ?? SYSTEMS.find(([, pattern]) => pattern.test(agent))?.[0] ?? 'other',
  };
}

/** The country Cloudflare resolved for the request, as a lowercase label. */
export function requestCountry(request: Request): string | undefined {
  const country = (request as { cf?: { country?: unknown } }).cf?.country;
  return typeof country === 'string' && /^[A-Za-z]{2}$/.test(country)
    ? country.toLowerCase()
    : undefined;
}
