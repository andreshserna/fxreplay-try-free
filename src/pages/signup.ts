import type { APIRoute } from 'astro';

import { deferOn, usersApi } from '../server/runtime';

export const prerender = false;

/** The signup as a plain form post, for a browser that has not run the page's script. */
export const POST: APIRoute = ({ request, locals }) =>
  usersApi().createFromForm(request, deferOn(locals));
