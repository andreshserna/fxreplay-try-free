import type { APIRoute } from 'astro';

import { usersApi } from '../../../server/users/runtime';

export const prerender = false;

export const POST: APIRoute = ({ request }) => usersApi().create(request);
export const GET: APIRoute = ({ request }) => usersApi().list(request);
export const ALL: APIRoute = ({ request }) => usersApi().methodNotAllowed(request, ['GET', 'POST']);
