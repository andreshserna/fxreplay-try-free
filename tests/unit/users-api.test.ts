import { beforeEach, describe, expect, it } from 'vitest';

import type { Problem } from '../../src/lib/api/problems';
import type { User } from '../../src/lib/api/schemas';
import { ServerEvents } from '../../src/server/analytics/emitter';
import { MemorySink } from '../../src/server/analytics/sink';
import { SESSION_COOKIE, signSession } from '../../src/server/http/session';
import { VISITOR_COOKIE } from '../../src/server/http/visitor';
import { assign } from '../../src/lib/experiments/registry';
import { UsersApi, type RateLimiter } from '../../src/server/users/api';
import { MemoryUsersRepository } from '../../src/server/users/memory-repository';
import { StorageUnavailableError } from '../../src/server/users/repository';
import { UsersService, type ListResult } from '../../src/server/users/service';

const ORIGIN = 'https://demo.example';
const SECRET = 'test-session-secret';
const ADMIN = 'test-admin-token';
const KEY = 'idem-key-0000000000000001';

let clock: Date;
let repository: MemoryUsersRepository;
let api: UsersApi;
let sink: MemorySink;
const logged: Record<string, unknown>[] = [];

const tick = (milliseconds: number) => {
  clock = new Date(clock.getTime() + milliseconds);
};

function build(limiters: { create?: RateLimiter; update?: RateLimiter; list?: RateLimiter } = {}) {
  repository = new MemoryUsersRepository();
  sink = new MemorySink();
  api = new UsersApi({
    service: new UsersService(repository, () => clock),
    events: new ServerEvents({ sink, release: 'test', now: () => clock }),
    limiters,
    sessionSecret: SECRET,
    adminToken: ADMIN,
    now: () => clock,
    log: (_message, detail) => logged.push(detail),
  });
}

beforeEach(() => {
  clock = new Date('2026-11-18T23:29:22.000Z');
  logged.length = 0;
  build();
});

function post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return api.create(
    new Request(`${ORIGIN}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': KEY, ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

function patch(id: string, body: unknown, headers: Record<string, string> = {}) {
  return api.update(
    new Request(`${ORIGIN}/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers },
      body: JSON.stringify(body),
    }),
    id,
  );
}

const list = (query = '', token: string | null = ADMIN) =>
  api.list(
    new Request(`${ORIGIN}/api/users${query}`, {
      headers: token === null ? {} : { Authorization: `Bearer ${token}` },
    }),
  );

/** Creates a user and returns it with the session cookie the response set. */
async function signUp(email: string, key = KEY) {
  const response = await post({ email }, { 'Idempotency-Key': key });
  expect(response.status).toBe(201);
  const cookie = (response.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';
  return { user: (await response.json()) as User, cookie, response };
}

async function expectProblem(response: Response, status: number, code: string): Promise<Problem> {
  expect(response.status).toBe(status);
  expect(response.headers.get('Content-Type')).toContain('application/problem+json');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  const problem = (await response.json()) as Problem;
  expect(problem).toMatchObject({ status, code, type: expect.stringContaining('/problems/') });
  return problem;
}

describe('POST /api/users', () => {
  it('creates a user, normalizes the email and issues a session for that user only', async () => {
    const { user, response } = await signUp('  Ada@Example.COM ');

    expect(user).toEqual({
      id: expect.stringMatching(/^usr_[0-9A-Z]{26}$/),
      email: 'ada@example.com',
      profile: {},
      created_at: '2026-11-18T23:29:22.000Z',
      updated_at: '2026-11-18T23:29:22.000Z',
    });
    expect(response.headers.get('Location')).toBe(`/api/users/${user.id}`);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Request-Id')).toBeTruthy();
    const cookie = response.headers.get('Set-Cookie') ?? '';
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=${user.id}\\.`));
    for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=3600']) {
      expect(cookie).toContain(attribute);
    }
  });

  it('stores attribution with the user, and the visitor and experiment arm from the cookie', async () => {
    const attribution = {
      first_touch: { source: 'instagram', medium: 'paid_social', via: 'partner42' },
      last_touch: null,
    };
    const created = await post(
      { email: 'ada@example.com', attribution },
      { Cookie: `${VISITOR_COOKIE}=visitor-1` },
    );
    expect(await created.json()).not.toHaveProperty('attribution');
    expect(created.headers.getSetCookie().join()).not.toContain(VISITOR_COOKIE);

    const page = (await (await list()).json()) as ListResult;
    expect(page.data[0]).toMatchObject({
      anonymous_id: 'visitor-1',
      attribution,
      experiments: { hero_signup: assign('hero_signup', 'visitor-1') },
    });
  });

  it('refuses a visitor id or an experiment arm sent in the body', async () => {
    const response = await post({
      email: 'ada@example.com',
      anonymous_id: 'someone-else',
      experiments: { hero_signup: 'inline_email' },
    });
    expect(response.status).toBe(422);
    expect(((await response.json()) as Problem).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'anonymous_id', code: 'unknown_field' }),
        expect.objectContaining({ field: 'experiments', code: 'unknown_field' }),
      ]),
    );
  });

  it('gives a visitor without a cookie an id, and sets it as an HttpOnly cookie', async () => {
    const created = await post({ email: 'ada@example.com' });
    const cookie = created.headers.getSetCookie().find((value) => value.startsWith(VISITOR_COOKIE));
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
  });

  it('emits the conversion once, after the user exists, and never for a replay or a refusal', async () => {
    const cookie = { Cookie: `${VISITOR_COOKIE}=visitor-1` };
    const attribution = { first_touch: { source: 'instagram', medium: 'paid_social' } };
    const created = await post({ email: 'ada@example.com', attribution }, cookie);
    const user = (await created.json()) as User;

    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]).toMatchObject({
      name: 'signup_completed',
      properties: { user_id: user.id },
      context: {
        anonymous_id: 'visitor-1',
        source: 'server',
        release: 'test',
        first_source: 'instagram',
        first_medium: 'paid_social',
        experiments: `hero_signup:${assign('hero_signup', 'visitor-1')}`,
      },
    });
    expect(JSON.stringify(sink.events)).not.toContain('ada@example.com');

    await post({ email: 'ada@example.com', attribution }, cookie); // a replay
    await post({ email: 'ada@example.com' }, { 'Idempotency-Key': 'idem-key-0000000000000002' });
    await post({ email: 'not-an-email' }, { 'Idempotency-Key': 'idem-key-0000000000000003' });
    await post(
      { email: 'bot@example.com', website: 'https://spam.example' },
      { 'Idempotency-Key': 'idem-key-0000000000000004' },
    );
    expect(sink.events).toHaveLength(1);
  });

  it('emits the profile event for the same visitor as the conversion, when there is an answer', async () => {
    const created = await post(
      { email: 'ada@example.com' },
      { Cookie: `${VISITOR_COOKIE}=visitor-1` },
    );
    const user = (await created.json()) as User;
    const session = { Cookie: (created.headers.getSetCookie()[0] ?? '').split(';')[0] ?? '' };

    await patch(user.id, { markets: null }, session);
    expect(sink.events.map((event) => event.name)).toEqual(['signup_completed']);

    await patch(user.id, { markets: ['forex', 'indices'], goal: 'prop_firm' }, session);
    expect(sink.events[1]).toMatchObject({
      name: 'profile_completed',
      properties: { user_id: user.id, markets_count: 2, goal: 'prop_firm' },
      context: { anonymous_id: 'visitor-1', source: 'server' },
    });
  });

  it('still creates the user when the analytics destination fails', async () => {
    sink.send = () => Promise.reject(new Error('destination down'));
    expect((await post({ email: 'ada@example.com' })).status).toBe(201);
  });

  it('replays the first answer when the same key repeats the same body', async () => {
    const first = await signUp('ada@example.com');
    tick(5_000);
    const retry = await post({ email: 'ada@example.com' });

    expect(retry.status).toBe(201);
    expect(retry.headers.get('Idempotency-Replayed')).toBe('true');
    expect(await retry.json()).toEqual(first.user);
    expect(retry.headers.get('Set-Cookie')).toContain(first.user.id);
    expect((await repository.list(10)).length).toBe(1);
  });

  it('refuses a key that was used with a different body', async () => {
    await signUp('ada@example.com');
    await expectProblem(await post({ email: 'grace@example.com' }), 422, 'idempotency_key_reused');
  });

  it('forgets a key after 24 hours', async () => {
    await signUp('ada@example.com');
    tick(24 * 60 * 60 * 1000 + 1);
    await expectProblem(await post({ email: 'ada@example.com' }), 409, 'email_taken');
  });

  it('reports an email that already has an account, whatever its case', async () => {
    await signUp('ada@example.com');
    const response = await post({ email: 'ADA@example.com' }, { 'Idempotency-Key': `${KEY}b` });
    await expectProblem(response, 409, 'email_taken');
  });

  it('answers a filled honeypot like a success and stores nothing', async () => {
    const response = await post({ email: 'bot@example.com', website: 'https://spam.example' });
    expect(response.status).toBe(201);
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(await repository.list(10)).toEqual([]);
  });

  it('lists every invalid field once, with a stable code', async () => {
    const problem = await expectProblem(
      await post({ email: 'ada@', role: 'admin', attribution: { first_touch: { at: 'soon' } } }),
      422,
      'validation_failed',
    );
    expect(problem.detail).toBe('3 fields need attention.');
    expect(problem.errors).toEqual([
      { field: 'email', code: 'invalid_format', message: 'Enter an email like name@example.com.' },
      expect.objectContaining({ field: 'attribution.first_touch.at', code: 'invalid_format' }),
      { field: 'role', code: 'unknown_field', message: 'This field is not accepted.' },
    ]);
  });

  it.each([
    [{}, 'required', 'Enter your email.'],
    [{ email: '   ' }, 'required', 'Enter your email.'],
    [{ email: 42 }, 'invalid_type', 'Enter your email.'],
    [{ email: `${'a'.repeat(250)}@example.com` }, 'too_long', 'That email is too long.'],
  ])('rejects the email in %j as %s', async (body, code, message) => {
    const problem = await expectProblem(await post(body), 422, 'validation_failed');
    expect(problem.errors).toEqual([{ field: 'email', code, message }]);
  });

  it('refuses requests that break the protocol before reading them as a signup', async () => {
    await expectProblem(await post('{not json'), 400, 'invalid_json');
    await expectProblem(
      await post({ email: 'a@b.co' }, { 'Idempotency-Key': 'short' }),
      400,
      'idempotency_key_missing',
    );
    await expectProblem(
      await post({ email: 'a@b.co' }, { 'Content-Type': 'text/plain' }),
      415,
      'unsupported_media_type',
    );
    await expectProblem(
      await post({ email: 'a@b.co', website: 'x'.repeat(9000) }),
      413,
      'payload_too_large',
    );
    expect(await repository.list(10)).toEqual([]);
  });

  it('stops at the rate limit before touching the store, per client address', async () => {
    const seen: string[] = [];
    build({
      create: {
        limit: async ({ key }) => {
          seen.push(key);
          return { success: seen.length <= 1 };
        },
      },
    });
    expect((await post({ email: 'a@b.co' }, { 'CF-Connecting-IP': '203.0.113.7' })).status).toBe(
      201,
    );
    const limited = await post({ email: 'c@d.co' }, { 'CF-Connecting-IP': '203.0.113.7' });
    await expectProblem(limited, 429, 'rate_limited');
    expect(limited.headers.get('Retry-After')).toBe('60');
    expect(seen).toEqual(['203.0.113.7', '203.0.113.7']);
    expect((await repository.list(10)).length).toBe(1);
  });

  it('answers 503 when the store is unreachable and 500 for anything unexpected, without leaking', async () => {
    repository.create = async () => {
      throw new StorageUnavailableError('D1 is down');
    };
    const unavailable = await post({ email: 'ada@example.com' });
    await expectProblem(unavailable, 503, 'service_unavailable');
    expect(unavailable.headers.get('Retry-After')).toBe('5');

    repository.create = async () => {
      throw new Error('boom');
    };
    const failed = await expectProblem(
      await post({ email: 'ada@example.com' }),
      500,
      'internal_error',
    );
    expect(JSON.stringify(failed)).not.toContain('boom');
    expect(JSON.stringify(logged)).not.toContain('ada@example.com');
    expect(logged).toHaveLength(2);
  });
});

describe('PATCH /api/users/{id}', () => {
  it('updates the profile of the session user, merging and clearing fields', async () => {
    const { user, cookie } = await signUp('ada@example.com');
    tick(60_000);

    const first = await patch(
      user.id,
      { markets: ['forex', 'indices', 'forex'], experience: 'intermediate', goal: 'prop_firm' },
      { Cookie: cookie },
    );
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      id: user.id,
      profile: { markets: ['forex', 'indices'], experience: 'intermediate', goal: 'prop_firm' },
      created_at: user.created_at,
      updated_at: '2026-11-18T23:30:22.000Z',
    });

    const second = await patch(user.id, { goal: null, experience: 'advanced' }, { Cookie: cookie });
    expect(((await second.json()) as User).profile).toEqual({
      markets: ['forex', 'indices'],
      experience: 'advanced',
    });
  });

  it('requires a valid, unexpired, untampered session', async () => {
    const { user, cookie } = await signUp('ada@example.com');
    const body = { goal: 'practice' };

    await expectProblem(await patch(user.id, body), 401, 'unauthenticated');
    await expectProblem(
      await patch(user.id, body, { Cookie: `${cookie}x` }),
      401,
      'unauthenticated',
    );
    const forged = await signSession('another-secret', user.id, 9_999_999_999);
    await expectProblem(
      await patch(user.id, body, { Cookie: `${SESSION_COOKIE}=${forged}` }),
      401,
      'unauthenticated',
    );
    tick(60 * 60 * 1000 + 1000);
    await expectProblem(await patch(user.id, body, { Cookie: cookie }), 401, 'unauthenticated');
  });

  it('refuses another user, and a request from another origin', async () => {
    const ada = await signUp('ada@example.com');
    const grace = await signUp('grace@example.com', `${KEY}b`);
    const body = { goal: 'practice' };

    await expectProblem(await patch(grace.user.id, body, { Cookie: ada.cookie }), 403, 'forbidden');
    await expectProblem(
      await patch(ada.user.id, body, { Cookie: ada.cookie, Origin: 'https://evil.example' }),
      403,
      'forbidden',
    );
    expect((await repository.findById(ada.user.id))?.profile).toEqual({});
  });

  it('validates the patch and reports a user that no longer exists', async () => {
    const { user, cookie } = await signUp('ada@example.com');

    const problem = await expectProblem(
      await patch(user.id, { markets: ['forex', 'gold'], email: 'x@y.co' }, { Cookie: cookie }),
      422,
      'validation_failed',
    );
    expect(problem.errors).toEqual([
      { field: 'markets.1', code: 'invalid_choice', message: 'Choose one of the listed options.' },
      { field: 'email', code: 'unknown_field', message: 'This field is not accepted.' },
    ]);

    repository.findById = async () => null;
    await expectProblem(
      await patch(user.id, { goal: 'practice' }, { Cookie: cookie }),
      404,
      'not_found',
    );
  });
});

describe('GET /api/users', () => {
  it('requires the admin token', async () => {
    for (const token of [null, '', 'wrong', `${ADMIN}x`]) {
      const response = await list('', token);
      await expectProblem(response, 401, 'unauthenticated');
      expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
    }
  });

  it.each([undefined, ''])(
    'is closed to everyone when the admin token is %o',
    async (adminToken) => {
      // A secret that was never set arrives as undefined, not as an empty string.
      api = new UsersApi({
        service: new UsersService(repository),
        sessionSecret: SECRET,
        adminToken,
      });
      await signUp('ada@example.com');
      const bare = new Request(`${ORIGIN}/api/users`, { headers: { Authorization: 'Bearer' } });
      await expectProblem(await api.list(bare), 401, 'unauthenticated');
      await expectProblem(await list('', ''), 401, 'unauthenticated');
      await expectProblem(await list('', 'undefined'), 401, 'unauthenticated');
    },
  );

  it('pages newest first by key, without repeating or skipping anyone', async () => {
    for (let index = 0; index < 5; index += 1) {
      await signUp(`user${index}@example.com`, `${KEY}${index}`);
      tick(1000);
    }

    const first = (await (await list('?limit=2')).json()) as ListResult;
    expect(first.data.map((user) => user.email)).toEqual([
      'user4@example.com',
      'user3@example.com',
    ]);
    expect(first.next_cursor).toBeTruthy();

    // Someone signs up between the two page requests: the next page must not shift.
    await signUp('late@example.com', `${KEY}late`);

    const second = (await (
      await list(`?limit=2&cursor=${first.next_cursor}`)
    ).json()) as ListResult;
    expect(second.data.map((user) => user.email)).toEqual([
      'user2@example.com',
      'user1@example.com',
    ]);
    const third = (await (
      await list(`?limit=2&cursor=${second.next_cursor}`)
    ).json()) as ListResult;
    expect(third.data.map((user) => user.email)).toEqual(['user0@example.com']);
    expect(third.next_cursor).toBeNull();
  });

  it('rejects a limit or a cursor it cannot use', async () => {
    for (const query of ['?limit=0', '?limit=101', '?limit=two', '?limit=1.5']) {
      const problem = await expectProblem(await list(query), 422, 'validation_failed');
      expect(problem.errors?.[0]).toMatchObject({ field: 'limit', code: 'out_of_range' });
    }
    const problem = await expectProblem(
      await list('?cursor=not-a-cursor'),
      422,
      'validation_failed',
    );
    expect(problem.errors?.[0]).toMatchObject({ field: 'cursor', code: 'invalid_format' });
  });
});

describe('other methods', () => {
  it('answers 405 with the methods that are allowed', async () => {
    const response = await api.methodNotAllowed(
      new Request(`${ORIGIN}/api/users`, { method: 'DELETE' }),
      ['GET', 'POST'],
    );
    await expectProblem(response, 405, 'method_not_allowed');
    expect(response.headers.get('Allow')).toBe('GET, POST');
  });
});
