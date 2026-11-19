import { defineMiddleware } from 'astro:middleware';

import { withSecurityHeaders } from './server/http/security-headers';

/**
 * Every response the Worker produces ("/", /signup, /api/*, a 404) leaves with the
 * security headers. What the asset store serves gets them from public/_headers.
 */
export const onRequest = defineMiddleware(async (_context, next) =>
  withSecurityHeaders(await next()),
);
