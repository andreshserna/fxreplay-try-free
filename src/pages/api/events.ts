import type { APIRoute } from 'astro';

import { collector, deferOn } from '../../server/runtime';

export const prerender = false;

/** The first-party event collector (ADR 0014). */
export const POST: APIRoute = ({ request, locals }) =>
  collector().collect(request, deferOn(locals));
