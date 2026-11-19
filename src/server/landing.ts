/**
 * The landing page at "/": experiment assignment at the edge (ADR 0008).
 *
 * Each arm is a complete prerendered document. This handler picks the visitor's arm
 * before any HTML is sent and streams that document from the asset store, so there is
 * no flicker, no layout shift and no rendering work per request. The exposure is
 * recorded here too, which means it is logged before the variant can render.
 */
import { assign, EXPERIMENTS, formatAssignments } from '../lib/experiments/registry';
import { RELEASE } from '../lib/release';
import type { Defer, ServerEvents } from './analytics/emitter';
import { looksAutomated, readVisitor, requestCountry, visitorCookie } from './http/visitor';

/** The part of the static-assets binding this code uses. */
export interface Assets {
  fetch(request: Request): Promise<Response>;
}

interface LandingOptions {
  assets: Assets;
  events?: ServerEvents;
}

const EXPERIMENT = 'hero_signup';

export async function serveLanding(
  request: Request,
  { assets, events }: LandingOptions,
  defer: Defer,
): Promise<Response> {
  const visitor = readVisitor(request);
  const variant = assign(EXPERIMENT, visitor.id);

  // The document's own validator: the build and the arm. The asset store's validators do
  // not survive every host's compression, and without one a repeat view downloads the
  // whole page again. With it, an unchanged page answers 304 and no body. It is only as
  // fresh as the release id, so a deploy is always built from a commit.
  const etag = `W/"${RELEASE}-${variant}"`;
  const unchanged = request.headers.get('If-None-Match') === etag;

  const document = unchanged
    ? new Response(null, { status: 304 })
    : await assets.fetch(new Request(new URL(`/variants/${variant}/`, request.url)));

  const headers = new Headers(document.headers);
  // The document depends on the visitor, so no shared cache may keep it. The browser
  // may, and revalidates: that is the cost of assigning at the edge.
  headers.set('Cache-Control', 'private, no-cache');
  headers.set('ETag', etag);
  headers.delete('Last-Modified');
  headers.append('Vary', 'Cookie');
  if (visitor.isNew) headers.append('Set-Cookie', visitorCookie(visitor.id));

  // A browser that only prefetches has shown the page to no one.
  const prefetch = /prefetch|prerender/i.test(request.headers.get('Sec-Purpose') ?? '');
  if (events && EXPERIMENTS[EXPERIMENT].enabled && document.status < 400 && !prefetch) {
    const country = requestCountry(request);
    defer(
      events.emit(
        'experiment_exposed',
        { experiment: EXPERIMENT, variant },
        {
          anonymous_id: visitor.id,
          page_path: '/',
          experiments: formatAssignments({ [EXPERIMENT]: variant }),
          is_bot: looksAutomated(request),
          ...(country ? { country } : {}),
        },
      ),
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
