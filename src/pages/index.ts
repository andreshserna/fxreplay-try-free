import type { APIRoute } from 'astro';

import { redirectToArm } from '../server/landing';
import { deferOn, landingPage } from '../server/runtime';

export const prerender = false;

/** "/" is decided per visitor at the edge. The documents themselves are static. */
export const GET: APIRoute = ({ request, locals }) =>
  import.meta.env.DEV ? redirectToArm(request) : landingPage(request, deferOn(locals));
