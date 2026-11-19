/**
 * The security headers every response carries. Two places send them, with the same values:
 * `public/_headers` for what Cloudflare serves from the asset store without running the
 * Worker, and the middleware for what the Worker answers. A unit test keeps the two equal.
 *
 * The page's own policy, with a hash for each inline script and style, is the `<meta>`
 * Astro writes into every document (astro.config.mjs). This header carries what a
 * `<meta>` policy cannot (frame-ancestors) and repeats the directives that do not depend
 * on the page, so they also cover the part of the document before the `<meta>`. It names
 * no script or style source: a second policy only narrows the first, and a header with
 * `default-src` would block the inline scripts the `<meta>` allows by hash.
 */
export const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  // Features the page never uses. browsing-topics replaced FLoC's interest-cohort.
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
} as const satisfies Record<string, string>;

/**
 * Sets each header once, replacing any copy already there (the landing document arrives
 * from the asset store and may carry them). A response whose headers are immutable, such
 * as one passed straight through from `fetch`, is copied first.
 */
export function withSecurityHeaders(response: Response): Response {
  try {
    apply(response.headers);
    return response;
  } catch {
    const copy = new Response(response.body, response);
    apply(copy.headers);
    return copy;
  }
}

function apply(headers: Headers): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
}
