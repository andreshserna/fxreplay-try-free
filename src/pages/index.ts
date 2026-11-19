import type { APIRoute } from 'astro';

import { deferOn, landingPage } from '../server/runtime';

export const prerender = false;

/** "/" is decided per visitor at the edge. The documents themselves are static. */
export const GET: APIRoute = ({ request, locals }) => landingPage(request, deferOn(locals));
