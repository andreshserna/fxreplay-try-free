import type { APIRoute } from 'astro';

import { usersApi } from '../../../server/users/runtime';

export const prerender = false;

export const PATCH: APIRoute = ({ request, params }) => usersApi().update(request, params.id ?? '');
export const ALL: APIRoute = ({ request }) => usersApi().methodNotAllowed(request, ['PATCH']);
