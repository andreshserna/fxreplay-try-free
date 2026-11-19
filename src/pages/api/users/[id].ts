import type { APIRoute } from 'astro';

import { deferOn, usersApi } from '../../../server/runtime';

export const prerender = false;

export const PATCH: APIRoute = ({ request, params, locals }) =>
  usersApi().update(request, params.id ?? '', deferOn(locals));
export const ALL: APIRoute = ({ request }) => usersApi().methodNotAllowed(request, ['PATCH']);
