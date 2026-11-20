/**
 * The Users API as plain functions from Request to Response. Nothing here knows about
 * Astro or Cloudflare, so the whole contract (docs/api.md) is testable with a fake clock,
 * an in-memory repository and no network.
 */
import { readTouch, toContext, type Touch } from '../../lib/analytics/attribution';
import type { FieldError, ProblemCode } from '../../lib/api/problems';
import {
  parseCreateUser,
  parseProfilePatch,
  type CreateUserInput,
  type Profile,
  type User,
} from '../../lib/api/schemas';
import { assignAll, formatAssignments } from '../../lib/experiments/registry';
import type { Defer, ServerEvents, VisitorContext } from '../analytics/emitter';
import { readBodyText } from '../http/body';
import {
  clientKey,
  jsonResponse,
  problemResponse,
  requestContext,
  type RequestContext,
} from '../http/respond';
import {
  looksAutomated,
  readVisitor,
  requestCountry,
  visitorCookie,
  type Visitor,
} from '../http/visitor';
import { newUserId } from '../ids';
import {
  readCookie,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  sessionCookie,
  sign,
  signSession,
  verifySession,
} from '../http/session';
import { StorageUnavailableError, type UserRecord } from './repository';
import { decodeCursor, LIST_DEFAULT_LIMIT, LIST_MAX_LIMIT, type UsersService } from './service';

const MAX_BODY_BYTES = 8 * 1024;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,64}$/;
const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';
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
  /** Absent or empty: the list is closed to everyone. */
  adminToken: string | undefined;
  /** Where the conversion and the profile event go. Absent: nothing is emitted. */
  events?: ServerEvents;
  now?: () => Date;
  log?: (message: string, detail: Record<string, unknown>) => void;
}

type Context = RequestContext;

/** The pages a form signup can end on: src/pages/signup/[outcome].astro. */
export const FORM_OUTCOMES = ['done', 'email-taken', 'invalid', 'try-again'] as const;
type FormOutcome = (typeof FORM_OUTCOMES)[number];

/** Without a runtime to hand work to, it simply runs: its own errors are already caught. */
const runNow: Defer = (work) => void work;

type BodyResult = { ok: true; value: unknown } | { ok: false; code: ProblemCode };

const encoder = new TextEncoder();

/** Compares two secrets without leaking how much of them matched. */
async function secretsMatch(given: string, expected: string | undefined): Promise<boolean> {
  // A missing secret is `undefined` at runtime, and it must close the door, not open it.
  if (!given || !expected) return false;
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
        return problemResponse(context, 'rate_limited', { 'Retry-After': RETRY_AFTER_RATE_LIMIT });
      }
      const idempotencyKey = request.headers.get('Idempotency-Key') ?? '';
      if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
        return problemResponse(context, 'idempotency_key_missing');
      }
      const body = await readJson(request);
      if (!body.ok) return problemResponse(context, body.code);
      const parsed = parseCreateUser(body.value);
      if (!parsed.ok) return this.#invalid(context, parsed.errors);

      const { website, ...input } = parsed.data;
      if (website) return this.#decoy(context, input.email);

      const result = await this.#register(request, input, idempotencyKey, defer);
      if (result.kind === 'email_taken') return problemResponse(context, 'email_taken');
      if (result.kind === 'key_reused') return problemResponse(context, 'idempotency_key_reused');

      const response = jsonResponse(context, 201, publicUser(result.user), {
        Location: `/api/users/${result.user.id}`,
        ...(result.kind === 'replayed' ? { 'Idempotency-Replayed': 'true' } : {}),
      });
      for (const cookie of result.cookies) response.headers.append('Set-Cookie', cookie);
      return response;
    });
  }

  /**
   * POST /signup: the same signup from a plain HTML form, for a visitor whose browser has
   * not run the page's script (it failed to load, or they pressed Enter before it did).
   * It answers with a redirect to a page that says what happened.
   */
  createFromForm(request: Request, defer: Defer = runNow): Promise<Response> {
    const redirect = (outcome: FormOutcome, cookies: string[] = []) => {
      const headers = new Headers({ Location: `/signup/${outcome}/`, 'Cache-Control': 'no-store' });
      for (const cookie of cookies) headers.append('Set-Cookie', cookie);
      return new Response(null, { status: 303, headers });
    };
    return this.#handle(request, async (context) => {
      // A form on another site must not create an account here in the visitor's name.
      // Browsers send Origin on every cross-site POST. The framework refuses these too,
      // before this code runs: this is the rule stated where it can be read and tested.
      const origin = request.headers.get('Origin');
      if (origin !== null && origin !== context.url.origin) {
        return problemResponse(context, 'forbidden');
      }
      const contentType = request.headers.get('Content-Type') ?? '';
      if (contentType.split(';')[0]?.trim().toLowerCase() !== FORM_CONTENT_TYPE) {
        return redirect('invalid');
      }
      if (!(await this.#allowed(this.#options.limiters?.create, clientKey(request)))) {
        return redirect('try-again');
      }
      const body = await readBodyText(request, MAX_BODY_BYTES);
      if (!body.ok) return redirect('invalid');
      const fields = new URLSearchParams(body.text);
      const parsed = parseCreateUser({
        email: fields.get('email') ?? '',
        website: fields.get('website') ?? '',
      });
      if (!parsed.ok) return redirect('invalid');
      const { website, ...input } = parsed.data;
      if (website) {
        this.#options.log?.('signup discarded: honeypot', {
          request_id: requestContext(request).requestId,
        });
        return redirect('done');
      }

      // A form has no idempotency header. The key is derived from who is asking and for
      // what, so a refresh or a second press repeats the same request instead of a new one.
      // It is signed with the server's secret and carries a colon, which the header's
      // pattern does not allow: nobody can compute it, and nobody can present it to the API.
      // Without the visitor cookie there is no "who", and a repeat is a new request.
      const visitor = readVisitor(request);
      const key = `form:${await sign(this.#options.sessionSecret, `form:${visitor.id}:${input.email}`)}`;

      // The form cannot send what the page's script would. The campaign is in the address
      // of the page it was posted from, so the account still records where it came from.
      const touch = touchOf(request, context.url, this.#now());
      const attributed = touch
        ? { ...input, attribution: { first_touch: touch, last_touch: touch } }
        : input;

      const result = await this.#register(request, attributed, key, defer, visitor);
      if (result.kind === 'email_taken') return redirect('email-taken');
      if (result.kind === 'key_reused') return redirect('try-again');
      return redirect('done', result.cookies);
    }).then((response) => (response.status >= 500 ? redirect('try-again') : response));
  }

  /** Creates the user, emits the conversion, and prepares the cookies of the answer. */
  async #register(
    request: Request,
    input: CreateUserInput,
    idempotencyKey: string,
    defer: Defer,
    visitor: Visitor = readVisitor(request),
  ): Promise<
    | { kind: 'email_taken' }
    | { kind: 'key_reused' }
    | { kind: 'created' | 'replayed'; user: UserRecord; cookies: string[] }
  > {
    // The visitor and the experiment arms come from the server's own cookie, never from
    // the body, so they cannot be forged or forgotten by a client. A visitor without the
    // cookie was never served an arm under this id: recording one would credit an arm they
    // may not have seen, to an id no exposure carries. They are stored with no arm.
    const result = await this.#options.service.create(input, idempotencyKey, {
      anonymous_id: visitor.id,
      experiments: visitor.isNew ? {} : assignAll(visitor.id),
    });
    if (result.kind === 'email_taken' || result.kind === 'key_reused') return result;

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
    return {
      kind: result.kind,
      user: result.user,
      cookies: [sessionCookie(session), ...(visitor.isNew ? [visitorCookie(visitor.id)] : [])],
    };
  }

  /** PATCH /api/users/{id} */
  update(request: Request, id: string, defer: Defer = runNow): Promise<Response> {
    return this.#handle(request, async (context) => {
      const cookie = readCookie(request.headers.get('Cookie'), SESSION_COOKIE);
      const nowSeconds = Math.floor(this.#now().getTime() / 1000);
      const sessionUser = cookie
        ? await verifySession(this.#options.sessionSecret, cookie, nowSeconds)
        : null;
      if (!sessionUser) return problemResponse(context, 'unauthenticated');
      if (request.headers.get('Origin') !== context.url.origin || sessionUser !== id) {
        return problemResponse(context, 'forbidden');
      }
      if (!(await this.#allowed(this.#options.limiters?.update, sessionUser))) {
        return problemResponse(context, 'rate_limited', { 'Retry-After': RETRY_AFTER_RATE_LIMIT });
      }
      const body = await readJson(request);
      if (!body.ok) return problemResponse(context, body.code);
      const parsed = parseProfilePatch(body.value);
      if (!parsed.ok) return this.#invalid(context, parsed.errors);

      const updated = await this.#options.service.updateProfile(id, parsed.data);
      if (!updated) return problemResponse(context, 'not_found');
      const { user, before } = updated;

      // Emitted once, when the profile goes from no answer to an answer. A PATCH that is
      // retried after its answer was lost, or one that changes answers, emits nothing.
      const { markets = [], experience, goal } = user.profile;
      if (this.#options.events && !hasAnswer(before) && hasAnswer(user.profile)) {
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
      return jsonResponse(context, 200, publicUser(user));
    });
  }

  /** GET /api/users */
  list(request: Request): Promise<Response> {
    return this.#handle(request, async (context) => {
      // The limit comes before the token check, so it also bounds guessing the token.
      if (!(await this.#allowed(this.#options.limiters?.list, clientKey(request)))) {
        return problemResponse(context, 'rate_limited', { 'Retry-After': RETRY_AFTER_RATE_LIMIT });
      }
      const [scheme, token] = (request.headers.get('Authorization') ?? '').split(' ');
      const authorized =
        scheme === 'Bearer' && (await secretsMatch(token ?? '', this.#options.adminToken));
      if (!authorized) {
        return problemResponse(context, 'unauthenticated', { 'WWW-Authenticate': 'Bearer' });
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

      return jsonResponse(context, 200, await this.#options.service.list(limit, before));
    });
  }

  /** Any other method on a users path. */
  methodNotAllowed(request: Request, allow: string[]): Promise<Response> {
    return this.#handle(request, async (context) =>
      problemResponse(context, 'method_not_allowed', { Allow: allow.join(', ') }),
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
        ? problemResponse(context, 'service_unavailable', {
            'Retry-After': RETRY_AFTER_UNAVAILABLE,
          })
        : problemResponse(context, 'internal_error');
    }
  }

  async #allowed(limiter: RateLimiter | undefined, key: string): Promise<boolean> {
    if (!limiter) return true;
    return (await limiter.limit({ key })).success;
  }

  /**
   * A filled honeypot gets an answer shaped like success. Nothing is stored, and only the
   * fact is logged, so a real person caught by it can be found by request id. Never the email.
   */
  #decoy(context: Context, email: string): Response {
    this.#options.log?.('signup discarded: honeypot', { request_id: context.requestId });
    const now = this.#now();
    const timestamp = now.toISOString();
    const user: User = {
      id: newUserId(now.getTime()),
      email,
      profile: {},
      created_at: timestamp,
      updated_at: timestamp,
    };
    return jsonResponse(context, 201, user, { Location: `/api/users/${user.id}` });
  }

  #invalid(context: Context, errors: FieldError[]): Response {
    const count = errors.length;
    return problemResponse(
      context,
      'validation_failed',
      {},
      {
        detail: `${count} field${count === 1 ? '' : 's'} need${count === 1 ? 's' : ''} attention.`,
        errors,
      },
    );
  }
}

/**
 * The analytics context of a server event about this user: the visitor as stored with
 * the user at signup, so the profile event joins the same visitor as the conversion.
 */
/** The campaign touch in the address of the page a form was posted from, if it is ours. */
function touchOf(request: Request, own: URL, now: Date): Touch | null {
  try {
    const page = new URL(request.headers.get('Referer') ?? '');
    return page.origin === own.origin ? readTouch(page, '', now) : null;
  } catch {
    return null;
  }
}

function visitorContext(request: Request, user: UserRecord): VisitorContext {
  const country = requestCountry(request);
  const experiments = formatAssignments(user.experiments);
  return {
    anonymous_id: user.anonymous_id ?? user.id,
    ...(experiments ? { experiments } : {}),
    is_bot: looksAutomated(request),
    ...(country ? { country } : {}),
    ...(user.attribution ? toContext(user.attribution) : {}),
  };
}

const hasAnswer = ({ markets = [], experience, goal }: Profile): boolean =>
  markets.length > 0 || Boolean(experience) || Boolean(goal);

async function readJson(request: Request): Promise<BodyResult> {
  const contentType = request.headers.get('Content-Type') ?? '';
  if (contentType.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    return { ok: false, code: 'unsupported_media_type' };
  }
  const body = await readBodyText(request, MAX_BODY_BYTES);
  if (!body.ok) return { ok: false, code: 'payload_too_large' };
  try {
    return { ok: true, value: JSON.parse(body.text) };
  } catch {
    return { ok: false, code: 'invalid_json' };
  }
}
