/**
 * The landing page at "/": experiment assignment at the edge (ADR 0008).
 *
 * Each arm is a complete prerendered document. This handler picks the visitor's arm
 * before any HTML is sent and streams that document from the asset store, so there is
 * no flicker, no layout shift and no rendering work per request. The exposure is
 * recorded here too, which means it is logged before the variant can render.
 */
import { readTouch, toContext } from '../lib/analytics/attribution';
import { assign, EXPERIMENTS, formatAssignments } from '../lib/experiments/registry';
import type { Defer, ServerEvents } from './analytics/emitter';
import { clientKey } from './http/respond';
import {
  isPageView,
  looksAutomated,
  readVisitor,
  requestCountry,
  visitorCookie,
} from './http/visitor';
import type { RateLimiter } from './users/api';

/** The part of the static-assets binding this code uses. */
export interface Assets {
  fetch(request: Request): Promise<Response>;
}

interface LandingOptions {
  assets: Assets;
  events?: ServerEvents;
  /** A ceiling on exposures from one address. The page is served either way. */
  limiter?: RateLimiter;
  now?: () => Date;
}

const EXPERIMENT = 'hero_signup';

export async function serveLanding(
  request: Request,
  { assets, events, limiter, now }: LandingOptions,
  defer: Defer,
): Promise<Response> {
  const visitor = readVisitor(request);
  const variant = assign(EXPERIMENT, visitor.id);

  // Conditional headers pass through, so the asset store can answer 304. (On the
  // deployment the edge sends HTML without a validator, so a browser has none to send.)
  const document = await assets.fetch(
    new Request(new URL(`/variants/${variant}/`, request.url), {
      method: request.method,
      headers: request.headers,
    }),
  );

  const headers = new Headers(document.headers);
  // The document depends on the visitor, so no shared cache may keep it. The browser
  // may, and revalidates: that is the cost of assigning at the edge, and it is small
  // because the asset store answers from the same location.
  headers.set('Cache-Control', 'private, no-cache');
  headers.append('Vary', 'Cookie');
  if (visitor.isNew) headers.append('Set-Cookie', visitorCookie(visitor.id));

  // An exposure is a document on its way to a person: not a prefetch, a HEAD, an image
  // tag on another site, or an error page.
  if (events && EXPERIMENTS[EXPERIMENT].enabled && document.status < 400 && isPageView(request)) {
    const country = requestCountry(request);
    // The campaign is in the address the server was asked for, so the exposure carries it
    // without waiting for the browser: internal traffic can be excluded on this event alone.
    const touch = readTouch(
      new URL(request.url),
      request.headers.get('Referer') ?? '',
      now?.() ?? new Date(),
    );
    const exposure = {
      anonymous_id: visitor.id,
      page_path: '/',
      experiments: formatAssignments({ [EXPERIMENT]: variant }),
      is_bot: looksAutomated(request),
      ...(country ? { country } : {}),
      ...(touch ? toContext({ last_touch: touch }) : {}),
    };
    defer(
      (async () => {
        // One address in a loop must not spend the destination's quota. The check runs
        // after the response is on its way, so it costs the visitor nothing.
        if (limiter) {
          const { success } = await limiter.limit({ key: `exposure:${clientKey(request)}` });
          if (!success) return;
        }
        await events.emit('experiment_exposed', { experiment: EXPERIMENT, variant }, exposure);
      })().catch(() => undefined),
    );
  }
  return new Response(document.body, { status: document.status, headers });
}

/**
 * The development server renders pages on demand and has no asset store, so there is no
 * prerendered document to stream. There, "/" sends the visitor to their arm's page.
 * Assignment and the cookie work the same. No exposure is recorded.
 */
export function redirectToArm(request: Request): Response {
  const visitor = readVisitor(request);
  const headers = new Headers({
    Location: `/variants/${assign(EXPERIMENT, visitor.id)}/`,
    'Cache-Control': 'no-store',
  });
  if (visitor.isNew) headers.append('Set-Cookie', visitorCookie(visitor.id));
  return new Response(null, { status: 302, headers });
}
