/**
 * The Users API as plain functions from Request to Response. Nothing here knows about
 * Astro or Cloudflare, so the whole contract (docs/api.md) is testable with a fake clock,
 * an in-memory repository and no network.
 */
import { toContext } from '../../lib/analytics/attribution';
import type { FieldError, Problem, ProblemCode } from '../../lib/api/problems';
import { parseCreateUser, parseProfilePatch, type User } from '../../lib/api/schemas';
import { assignAll, formatAssignments } from '../../lib/experiments/registry';
import type { Defer, ServerEvents, VisitorContext } from '../analytics/emitter';
import {
  clientKey,
  jsonResponse,
  problemResponse,
  requestContext,
  type RequestContext,
} from '../http/respond';
import { looksAutomated, readVisitor, requestCountry, visitorCookie } from '../http/visitor';
import { newUserId } from '../ids';
import {
  readCookie,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  sessionCookie,
  signSession,
  verifySession,
} from '../http/session';
import { StorageUnavailableError, type UserRecord } from './repository';
import { decodeCursor, LIST_DEFAULT_LIMIT, LIST_MAX_LIMIT, type UsersService } from './service';

const MAX_BODY_BYTES = 8 * 1024;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,64}$/;
const RETRY_AFTER_RATE_LIMIT = '60';
const RETRY_AFTER_UNAVAILABLE = '5';

/** The part of Cloudflare's rate limiting binding this code uses. */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface UsersApiOptions {
  service: UsersService;
  /** Absent limiters are skipped, so the API still works where the binding is missing. */
  limiters?: { create?: RateLimiter; update?: RateLimiter; list?: RateLimiter };
  sessionSecret: string;
  adminToken: string;
  /** Where the conversion and the profile event go. Absent: nothing is emitted. */
  events?: ServerEvents;
  now?: () => Date;
  log?: (message: string, detail: Record<string, unknown>) => void;
}

type Context = RequestContext;

/** Without a runtime to hand work to, it simply runs: its own errors are already caught. */
const runNow: Defer = (work) => void work;

type BodyResult = { ok: true; value: unknown } | { ok: false; code: ProblemCode };

const encoder = new TextEncoder();

/** Compares two secrets without leaking how much of them matched. */
async function secretsMatch(given: string, expected: string): Promise<boolean> {
  if (expected === '') return false;
  const [a, b] = await Promise.all(
    [given, expected].map((value) => crypto.subtle.digest('SHA-256', encoder.encode(value))),
  );
  const left = new Uint8Array(a as ArrayBuffer);
  const right = new Uint8Array(b as ArrayBuffer);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

const publicUser = ({ id, email, profile, created_at, updated_at }: UserRecord): User => ({
  id,
  email,
  profile,
  created_at,
  updated_at,
});

export class UsersApi {
  readonly #options: UsersApiOptions;
  readonly #now: () => Date;

  constructor(options: UsersApiOptions) {
    if (!options.sessionSecret) {
      // An empty HMAC key would let anyone forge a session.
      throw new Error('SESSION_SECRET is not set. Sessions cannot be signed without it.');
    }
    this.#options = options;
    this.#now = options.now ?? (() => new Date());
  }

  /** POST /api/users */
  create(request: Request, defer: Defer = runNow): Promise<Response> {
    return this.#handle(request, async (context) => {
      if (!(await this.#allowed(this.#options.limiters?.create, clientKey(request)))) {
        return this.#problem(context, 'rate_limited', { 'Retry-After': RETRY_AFTER_RATE_LIMIT });
      }
      const idempotencyKey = request.headers.get('Idempotency-Key') ?? '';
      if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
        return this.#problem(context, 'idempotency_key_missing');
      }
      const body = await readJson(request);
      if (!body.ok) return this.#problem(context, body.code);
      const parsed = parseCreateUser(body.value);
      if (!parsed.ok) return this.#invalid(context, parsed.errors);

      const { website, ...input } = parsed.data;
      if (website) return this.#decoy(context, input.email);

      // The visitor and the experiment arms come from the server's own cookie, never from
      // the body, so they cannot be forged or forgotten by a client.
      const visitor = readVisitor(request);
      const experiments = assignAll(visitor.id);
      const result = await this.#options.service.create(input, idempotencyKey, {
        anonymous_id: visitor.id,
        experiments,
      });
      if (result.kind === 'email_taken') return this.#problem(context, 'email_taken');
      if (result.kind === 'key_reused') return this.#problem(context, 'idempotency_key_reused');

      // The conversion: emitted only now, after the row is committed, and never for a replay.
      if (result.kind === 'created' && this.#options.events) {
        defer(
          this.#options.events.emit(
            'signup_completed',
            { user_id: result.user.id },
            visitorContext(request, result.user),
          ),
        );
      }

      const expiresAt = Math.floor(this.#now().getTime() / 1000) + SESSION_TTL_SECONDS;
      const session = await signSession(this.#options.sessionSecret, result.user.id, expiresAt);
      const response = this.#json(context, 201, publicUser(result.user), {
        Location: `/api/users/${result.user.id}`,
        'Set-Cookie': sessionCookie(session),
        ...(result.kind === 'replayed' ? { 'Idempotency-Replayed': 'true' } : {}),
      });
      if (visitor.isNew) response.headers.append('Set-Cookie', visitorCookie(visitor.id));
      return response;
    });
  }

  /** PATCH /api/users/{id} */
  update(request: Request, id: string, defer: Defer = runNow): Promise<Response> {
    return this.#handle(request, async (context) => {
      const cookie = readCookie(request.headers.get('Cookie'), SESSION_COOKIE);
      const nowSeconds = Math.floor(this.#now().getTime() / 1000);
      const sessionUser = cookie
        ? await verifySession(this.#options.sessionSecret, cookie, nowSeconds)
        : null;
      if (!sessionUser) return this.#problem(context, 'unauthenticated');
      if (request.headers.get('Origin') !== context.url.origin || sessionUser !== id) {
        return this.#problem(context, 'forbidden');
      }
      if (!(await this.#allowed(this.#options.limiters?.update, sessionUser))) {
        return this.#problem(context, 'rate_limited', { 'Retry-After': RETRY_AFTER_RATE_LIMIT });
      }
      const body = await readJson(request);
      if (!body.ok) return this.#problem(context, body.code);
      const parsed = parseProfilePatch(body.value);
      if (!parsed.ok) return this.#invalid(context, parsed.errors);

      const user = await this.#options.service.updateProfile(id, parsed.data);
      if (!user) return this.#problem(context, 'not_found');

      const { markets = [], experience, goal } = user.profile;
      if (this.#options.events && (markets.length > 0 || experience || goal)) {
        defer(
          this.#options.events.emit(
            'profile_completed',
            {
              user_id: user.id,
              markets_count: markets.length,
              ...(experience ? { experience } : {}),
              ...(goal ? { goal } : {}),
            },
            visitorContext(request, user),
          ),
        );
      }
      return this.#json(context, 200, publicUser(user));
    });
  }

  /** GET /api/users */
  list(request: Request): Promise<Response> {
    return this.#handle(request, async (context) => {
      const [scheme, token] = (request.headers.get('Authorization') ?? '').split(' ');
      const authorized =
        scheme === 'Bearer' && (await secretsMatch(token ?? '', this.#options.adminToken));
      if (!authorized) {
        return this.#problem(context, 'unauthenticated', { 'WWW-Authenticate': 'Bearer' });
      }
      if (!(await this.#allowed(this.#options.limiters?.list, clientKey(request)))) {
        return this.#problem(context, 'rate_limited', { 'Retry-After': RETRY_AFTER_RATE_LIMIT });
      }

      const errors: FieldError[] = [];
      const limitParameter = context.url.searchParams.get('limit');
      const limit = limitParameter === null ? LIST_DEFAULT_LIMIT : Number(limitParameter);
      if (!Number.isInteger(limit) || limit < 1 || limit > LIST_MAX_LIMIT) {
        errors.push({
          field: 'limit',
          code: 'out_of_range',
          message: `limit must be a whole number from 1 to ${LIST_MAX_LIMIT}.`,
        });
      }
      const cursorParameter = context.url.searchParams.get('cursor');
      const before = cursorParameter === null ? undefined : decodeCursor(cursorParameter);
      if (before === null) {
        errors.push({
          field: 'cursor',
          code: 'invalid_format',
          message: 'cursor must be a next_cursor value from a previous page.',
        });
      }
      if (errors.length > 0 || before === null) return this.#invalid(context, errors);

      return this.#json(context, 200, await this.#options.service.list(limit, before));
    });
  }

  /** Any other method on a users path. */
  methodNotAllowed(request: Request, allow: string[]): Promise<Response> {
    return this.#handle(request, async (context) =>
      this.#problem(context, 'method_not_allowed', { Allow: allow.join(', ') }),
    );
  }

  async #handle(
    request: Request,
    respond: (context: Context) => Promise<Response>,
  ): Promise<Response> {
    const context = requestContext(request);
    try {
      return await respond(context);
    } catch (error) {
      const unavailable = error instanceof StorageUnavailableError;
      // The request id ties this line to the response. No body and no email is logged.
      this.#options.log?.('users api error', {
        request_id: context.requestId,
        method: request.method,
        path: context.url.pathname,
        error: error instanceof Error ? error.message : String(error),
      });
      return unavailable
        ? this.#problem(context, 'service_unavailable', { 'Retry-After': RETRY_AFTER_UNAVAILABLE })
        : this.#problem(context, 'internal_error');
    }
  }

  async #allowed(limiter: RateLimiter | undefined, key: string): Promise<boolean> {
    if (!limiter) return true;
    return (await limiter.limit({ key })).success;
  }

  /** A filled honeypot gets an answer shaped like success. Nothing is stored. */
  #decoy(context: Context, email: string): Response {
    const now = this.#now();
    const timestamp = now.toISOString();
    const user: User = {
      id: newUserId(now.getTime()),
      email,
      profile: {},
      created_at: timestamp,
      updated_at: timestamp,
    };
    return this.#json(context, 201, user, { Location: `/api/users/${user.id}` });
  }

  #invalid(context: Context, errors: FieldError[]): Response {
    const count = errors.length;
    return this.#problem(
      context,
      'validation_failed',
      {},
      {
        detail: `${count} field${count === 1 ? '' : 's'} need${count === 1 ? 's' : ''} attention.`,
        errors,
      },
    );
  }

  #problem(
    context: Context,
    code: ProblemCode,
    headers: Record<string, string> = {},
    extra: Pick<Problem, 'detail' | 'errors'> = {},
  ): Response {
    return problemResponse(context, code, headers, extra);
  }

  #json(
    context: Context,
    status: number,
    body: unknown,
    headers: Record<string, string> = {},
  ): Response {
    return jsonResponse(context, status, body, headers);
  }
}

/**
 * The analytics context of a server event about this user: the visitor as stored with
 * the user at signup, so the profile event joins the same visitor as the conversion.
 */
function visitorContext(request: Request, user: UserRecord): VisitorContext {
  const country = requestCountry(request);
  return {
    anonymous_id: user.anonymous_id ?? user.id,
    experiments: formatAssignments(user.experiments),
    is_bot: looksAutomated(request),
    ...(country ? { country } : {}),
    ...(user.attribution ? toContext(user.attribution) : {}),
  };
}

async function readJson(request: Request): Promise<BodyResult> {
  const contentType = request.headers.get('Content-Type') ?? '';
  if (contentType.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    return { ok: false, code: 'unsupported_media_type' };
  }
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY_BYTES) {
    return { ok: false, code: 'payload_too_large' };
  }
  const text = await request.text();
  if (encoder.encode(text).length > MAX_BODY_BYTES) return { ok: false, code: 'payload_too_large' };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, code: 'invalid_json' };
  }
}
