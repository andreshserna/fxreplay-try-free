import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiClient, HANDLED_PROBLEMS, newIdempotencyKey } from '../../src/lib/api/client';
import { PROBLEMS } from '../../src/lib/api/problems';
import { UsersApi } from '../../src/server/users/api';
import { MemoryUsersRepository } from '../../src/server/users/memory-repository';
import { UsersService } from '../../src/server/users/service';

const KEY = 'idem-key-0000000000000001';
const USER = {
  id: 'usr_01JD3K8Q9ZC4N7V2M5XW6T8RBE',
  email: 'ada@example.com',
  profile: {},
  created_at: '2026-11-18T23:29:22.000Z',
  updated_at: '2026-11-18T23:29:22.000Z',
};

/** One scripted answer per call: a response, a rejection, or a request that never ends. */
type Step = (() => Response) | Error | 'hang';

interface Call {
  url: string;
  init: RequestInit;
}

function scripted(...steps: Step[]) {
  const calls: Call[] = [];
  const fetch = (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const step = steps[calls.length - 1];
    if (step === undefined) throw new Error(`Unexpected call ${calls.length}`);
    if (step === 'hang') return new Promise<Response>(() => {});
    if (step instanceof Error) return Promise.reject(step);
    return Promise.resolve(step());
  };
  return { calls, client: createApiClient({ fetch }) };
}

const json =
  (status: number, body: unknown, headers: Record<string, string> = {}) =>
  () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
    });

const problem =
  (status: number, code: string, extra: Record<string, unknown> = {}, headers = {}) =>
  () =>
    new Response(
      JSON.stringify({
        type: `https://x.example/problems/${code}`,
        title: 't',
        status,
        code,
        ...extra,
      }),
      {
        status,
        headers: { 'Content-Type': 'application/problem+json; charset=utf-8', ...headers },
      },
    );

const header = (call: Call | undefined, name: string) => new Headers(call?.init.headers).get(name);

const signUp = (client: ReturnType<typeof createApiClient>) =>
  client.createUser({ email: 'ada@example.com', website: '' }, { idempotencyKey: KEY });

/** Runs every pending timer, including the timeouts and the pause, and returns the result. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('createUser', () => {
  it('posts the body as JSON with the idempotency key and returns the created user', async () => {
    const { client, calls } = scripted(json(201, USER));
    const result = await settle(signUp(client));

    expect(result).toEqual({ kind: 'created', user: USER });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('/api/users');
    expect(calls[0]?.init).toMatchObject({ method: 'POST', credentials: 'same-origin' });
    expect(header(calls[0], 'Content-Type')).toBe('application/json');
    expect(header(calls[0], 'Idempotency-Key')).toBe(KEY);
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      email: 'ada@example.com',
      website: '',
    });
  });

  it('maps a replayed answer to the created user', async () => {
    const { client } = scripted(json(201, USER, { 'Idempotency-Replayed': 'true' }));
    expect(await settle(signUp(client))).toEqual({ kind: 'created', user: USER });
  });

  it('maps the listed problems to their states, without retrying any of them', async () => {
    const errors = [{ field: 'email', code: 'invalid_format', message: 'Enter an email.' }];
    const cases = [
      [problem(422, 'validation_failed', { errors }), { kind: 'invalid', errors }],
      [problem(409, 'email_taken'), { kind: 'email_taken' }],
      [
        problem(429, 'rate_limited', {}, { 'Retry-After': '30' }),
        { kind: 'rate_limited', retryAfterSeconds: 30 },
      ],
      [problem(400, 'invalid_json'), { kind: 'unexpected', status: 400, code: 'invalid_json' }],
    ] as const;
    for (const [answer, expected] of cases) {
      const { client, calls } = scripted(answer, json(201, USER));
      expect(await settle(signUp(client))).toEqual(expected);
      expect(calls).toHaveLength(1);
    }
  });

  it('treats a 429 without a problem body as rate limited: an edge rule can answer first', async () => {
    const { client, calls } = scripted(
      () => new Response('<html>', { status: 429, headers: { 'Content-Type': 'text/html' } }),
    );
    expect(await settle(signUp(client))).toEqual({ kind: 'rate_limited', retryAfterSeconds: 60 });
    expect(calls).toHaveLength(1);
  });

  it.each([
    ['absent', undefined, 60],
    ['seconds', ' 120 ', 120],
    ['an HTTP date', 'Wed, 21 Oct 2026 07:28:00 GMT', 60],
    ['a fraction', '1.5', 60],
    ['negative', '-5', 60],
  ])('reads Retry-After when it is %s', async (_label, value, seconds) => {
    const headers: Record<string, string> = value === undefined ? {} : { 'Retry-After': value };
    const { client } = scripted(problem(429, 'rate_limited', {}, headers));
    expect(await settle(signUp(client))).toEqual({
      kind: 'rate_limited',
      retryAfterSeconds: seconds,
    });
  });

  it.each([
    ['a 415', problem(415, 'unsupported_media_type'), 415, 'unsupported_media_type'],
    [
      'a 422 for a reused key',
      problem(422, 'idempotency_key_reused'),
      422,
      'idempotency_key_reused',
    ],
    ['a 422 without field errors', problem(422, 'validation_failed'), 422, 'validation_failed'],
    ['a code the client does not handle', problem(409, 'teapot'), 409, 'teapot'],
    ['a code that is not shaped like one', problem(409, 'Not A Code!'), 409, null],
    ['a code on a status it does not belong to', problem(400, 'email_taken'), 400, 'email_taken'],
    ['a code in plain JSON, which is not read', json(409, { code: 'email_taken' }), 409, null],
    [
      'a problem body that does not parse',
      () =>
        new Response('{not json', {
          status: 409,
          headers: { 'Content-Type': 'application/problem+json' },
        }),
      409,
      null,
    ],
    ['a 201 whose body is not a user', json(201, { id: 'usr_1' }), 201, null],
    ['a 201 that is not JSON', () => new Response('<html>', { status: 201 }), 201, null],
  ] as const)('treats %s as unexpected', async (_label, answer, status, code) => {
    const { client, calls } = scripted(answer);
    expect(await settle(signUp(client))).toEqual({ kind: 'unexpected', status, code });
    expect(calls).toHaveLength(1);
  });

  it('retries a 503 once, after 400 ms, with the same key and the same body', async () => {
    const { client, calls } = scripted(problem(503, 'service_unavailable'), json(201, USER));
    const pending = signUp(client);

    await vi.advanceTimersByTimeAsync(399);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);

    expect(await pending).toEqual({ kind: 'created', user: USER });
    expect(header(calls[1], 'Idempotency-Key')).toBe(KEY);
    expect(calls[1]?.init.body).toBe(calls[0]?.init.body);
  });

  it.each([500, 502, 504])('retries a %i', async (status) => {
    const { client, calls } = scripted(json(status, {}), json(201, USER));
    expect(await settle(signUp(client))).toMatchObject({ kind: 'created' });
    expect(calls).toHaveLength(2);
  });

  it('gives up as a server error after two 503s', async () => {
    const { client, calls } = scripted(
      problem(503, 'service_unavailable'),
      problem(503, 'service_unavailable'),
    );
    expect(await settle(signUp(client))).toEqual({ kind: 'unavailable', reason: 'server' });
    expect(calls).toHaveLength(2);
  });

  it('times each attempt out after 8 seconds and retries once', async () => {
    const { client, calls } = scripted('hang', 'hang');
    let result: unknown;
    void signUp(client).then((value) => (result = value));

    await vi.advanceTimersByTimeAsync(7_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1 + 400);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(7_999);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);

    expect(result).toEqual({ kind: 'unavailable', reason: 'timeout' });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.init.signal?.aborted).toBe(true);
  });

  it('recovers when the retry after a timeout succeeds', async () => {
    const { client, calls } = scripted('hang', json(201, USER, { 'Idempotency-Replayed': 'true' }));
    expect(await settle(signUp(client))).toEqual({ kind: 'created', user: USER });
    expect(header(calls[1], 'Idempotency-Key')).toBe(KEY);
  });

  it('reports a network failure after one retry', async () => {
    const { client, calls } = scripted(
      new TypeError('fetch failed'),
      new TypeError('fetch failed'),
    );
    expect(await settle(signUp(client))).toEqual({ kind: 'unavailable', reason: 'network' });
    expect(calls).toHaveLength(2);
  });

  it('reports offline when the browser says so at the time of the failure', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const { client } = scripted(new TypeError('fetch failed'), new TypeError('fetch failed'));
    expect(await settle(signUp(client))).toEqual({ kind: 'unavailable', reason: 'offline' });
  });
});

describe('updateProfile', () => {
  const update = (client: ReturnType<typeof createApiClient>) =>
    client.updateProfile(USER.id, { experience: 'beginner', goal: null });

  it('patches the profile with the session cookie and returns the user', async () => {
    const updated = { ...USER, profile: { experience: 'beginner' } };
    const { client, calls } = scripted(json(200, updated));

    expect(await settle(update(client))).toEqual({ kind: 'updated', user: updated });
    expect(calls[0]?.url).toBe(`/api/users/${USER.id}`);
    expect(calls[0]?.init).toMatchObject({ method: 'PATCH', credentials: 'same-origin' });
    expect(header(calls[0], 'Content-Type')).toBe('application/json');
    expect(header(calls[0], 'Idempotency-Key')).toBeNull();
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ experience: 'beginner', goal: null });
  });

  const errors = [{ field: 'markets.1', code: 'invalid_choice', message: 'Choose one.' }];
  it.each([
    ['422', problem(422, 'validation_failed', { errors }), { kind: 'invalid', errors }],
    ['401', problem(401, 'unauthenticated'), { kind: 'session_expired' }],
    ['403', problem(403, 'forbidden'), { kind: 'session_expired' }],
    ['404', problem(404, 'not_found'), { kind: 'not_found' }],
    [
      '429',
      problem(429, 'rate_limited', {}, { 'Retry-After': '60' }),
      { kind: 'rate_limited', retryAfterSeconds: 60 },
    ],
    [
      '400',
      problem(400, 'invalid_json'),
      { kind: 'unexpected', status: 400, code: 'invalid_json' },
    ],
    [
      '404 page that is not a problem',
      () => new Response('<html>', { status: 404, headers: { 'Content-Type': 'text/html' } }),
      { kind: 'unexpected', status: 404, code: null },
    ],
    [
      '200 whose body is not a user',
      json(200, {}),
      { kind: 'unexpected', status: 200, code: null },
    ],
  ] as const)('maps a %s without retrying it', async (_label, answer, expected) => {
    const { client, calls } = scripted(answer, json(200, USER));
    expect(await settle(update(client))).toEqual(expected);
    expect(calls).toHaveLength(1);
  });

  it('retries a server error once and then reports it', async () => {
    const { client, calls } = scripted(problem(500, 'internal_error'), json(502, {}));
    expect(await settle(update(client))).toEqual({ kind: 'unavailable', reason: 'server' });
    expect(calls).toHaveLength(2);
    expect(calls[1]?.init.body).toBe(calls[0]?.init.body);
  });

  it('reports a timeout and a network failure', async () => {
    const timedOut = scripted('hang', 'hang');
    expect(await settle(update(timedOut.client))).toEqual({
      kind: 'unavailable',
      reason: 'timeout',
    });
    const failed = scripted(new TypeError('fetch failed'), new TypeError('fetch failed'));
    expect(await settle(update(failed.client))).toEqual({ kind: 'unavailable', reason: 'network' });
  });
});

describe('newIdempotencyKey', () => {
  it('makes a fresh key in the shape the API accepts', () => {
    const key = newIdempotencyKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(newIdempotencyKey()).not.toBe(key);
  });
});

describe('against the real handlers', () => {
  it('creates, then reports a taken email and an invalid one', async () => {
    vi.useRealTimers();
    const origin = 'https://demo.example';
    const api = new UsersApi({
      service: new UsersService(new MemoryUsersRepository()),
      sessionSecret: 'test-session-secret',
      adminToken: 'test-admin-token',
    });
    const client = createApiClient({
      baseUrl: origin,
      fetch: (url, init) => api.create(new Request(url, init)),
    });

    const created = await client.createUser(
      { email: ' Ada@Example.com' },
      { idempotencyKey: newIdempotencyKey() },
    );
    expect(created).toMatchObject({
      kind: 'created',
      user: { email: 'ada@example.com', profile: {} },
    });

    const taken = await client.createUser(
      { email: 'ada@example.com' },
      { idempotencyKey: newIdempotencyKey() },
    );
    expect(taken).toEqual({ kind: 'email_taken' });

    const invalid = await client.createUser(
      { email: 'ada@' },
      { idempotencyKey: newIdempotencyKey() },
    );
    expect(invalid).toEqual({
      kind: 'invalid',
      errors: [
        {
          field: 'email',
          code: 'invalid_format',
          message: 'Enter an email like name@example.com.',
        },
      ],
    });
  });
});

describe('the client and the problem registry', () => {
  it('pair each handled code with the same status', () => {
    for (const [code, status] of Object.entries(HANDLED_PROBLEMS)) {
      expect(PROBLEMS[code as keyof typeof HANDLED_PROBLEMS].status).toBe(status);
    }
  });
});
