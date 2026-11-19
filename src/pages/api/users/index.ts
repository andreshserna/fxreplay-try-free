import type { APIRoute } from 'astro';

import { deferOn, usersApi } from '../../../server/runtime';

export const prerender = false;

export const POST: APIRoute = ({ request, locals }) => usersApi().create(request, deferOn(locals));
export const GET: APIRoute = ({ request }) => usersApi().list(request);
export const ALL: APIRoute = ({ request }) => usersApi().methodNotAllowed(request, ['GET', 'POST']);
