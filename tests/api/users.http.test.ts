import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { Problem } from '../../src/lib/api/problems';
import type { User } from '../../src/lib/api/schemas';

/**
 * What only a real database and a real runtime can prove: uniqueness under concurrent
 * requests, idempotency across them, and the rate limit at the edge.
 */
const BASE_URL = process.env['API_BASE_URL'] ?? 'http://127.0.0.1:4321';

function localSecret(name: string): string {
  if (!existsSync('.dev.vars')) return '';
  const line = readFileSync('.dev.vars', 'utf8')
    .split('\n')
    .find((entry) => entry.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : '';
}

const ADMIN_TOKEN = process.env['ADMIN_TOKEN'] ?? localSecret('ADMIN_TOKEN');
if (!ADMIN_TOKEN) {
  // Skipping would report green without testing the list. Fail instead.
  throw new Error('ADMIN_TOKEN is not set and .dev.vars has none: run `npm run setup` first.');
}

/**
 * A distinct client address per call, so one test never spends another's rate limit.
 * From a counter seeded by the clock: two runs within the limiter's minute do not collide.
 */
let addressCounter = Math.floor(Date.now() / 1000) % 60000;
const address = () => {
  addressCounter += 1;
  return `10.${200 + (addressCounter >> 16)}.${(addressCounter >> 8) & 255}.${addressCounter & 255}`;
};
const uniqueEmail = () => `contract-${randomUUID()}@example.com`;
const key = () => randomUUID();

function create(email: string, idempotencyKey: string, clientAddress = address()) {
  return fetch(`${BASE_URL}/api/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
      'CF-Connecting-IP': clientAddress,
    },
    body: JSON.stringify({ email }),
  });
}

const sessionOf = (response: Response) =>
  (response.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';

describe('Users API over HTTP', () => {
  it('lets exactly one of several concurrent signups for the same email win', async () => {
    const email = uniqueEmail();
    const responses = await Promise.all(Array.from({ length: 8 }, () => create(email, key())));
    const statuses = responses.map((response) => response.status).sort();

    expect(statuses).toEqual([201, 409, 409, 409, 409, 409, 409, 409]);
    const loser = responses.find((response) => response.status === 409);
    expect(((await loser?.json()) as Problem).code).toBe('email_taken');
  });

  it('gives a double submit one user and the same answer every time', async () => {
    const email = uniqueEmail();
    const idempotencyKey = key();
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => create(email, idempotencyKey)),
    );

    expect(responses.map((response) => response.status)).toEqual([201, 201, 201, 201, 201]);
    const users = (await Promise.all(responses.map((response) => response.json()))) as User[];
    expect(new Set(users.map((user) => user.id)).size).toBe(1);

    const later = await create(email, idempotencyKey);
    expect(later.status).toBe(201);
    expect(later.headers.get('Idempotency-Replayed')).toBe('true');
  });

  it('updates the profile with the session issued at creation, and only that user', async () => {
    const [first, second] = await Promise.all([
      create(uniqueEmail(), key()),
      create(uniqueEmail(), key()),
    ]);
    const user = (await first.json()) as User;
    const other = (await second.json()) as User;
    const patch = (id: string, cookie: string) =>
      fetch(`${BASE_URL}/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: BASE_URL, Cookie: cookie },
        body: JSON.stringify({ markets: ['forex'], goal: 'prop_firm' }),
      });

    const updated = await patch(user.id, sessionOf(first));
    expect(updated.status).toBe(200);
    expect(((await updated.json()) as User).profile).toEqual({
      markets: ['forex'],
      goal: 'prop_firm',
    });
    expect((await patch(other.id, sessionOf(first))).status).toBe(403);
  });

  it('pages through users newest first without repeats', async () => {
    const emails = [uniqueEmail(), uniqueEmail(), uniqueEmail()];
    for (const email of emails) expect((await create(email, key())).status).toBe(201);

    const page = async (query: string) => {
      const response = await fetch(`${BASE_URL}/api/users${query}`, {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, 'CF-Connecting-IP': address() },
      });
      expect(response.status).toBe(200);
      return (await response.json()) as { data: User[]; next_cursor: string | null };
    };

    const first = await page('?limit=2');
    expect(first.data.map((user) => user.email)).toEqual([emails[2], emails[1]]);
    expect(first.next_cursor).toBeTruthy();
    const second = await page(`?limit=2&cursor=${first.next_cursor}`);
    expect(second.data[0]?.email).toBe(emails[0]);
    const ids = [...first.data, ...second.data].map((user) => user.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort().reverse()).toEqual(ids);
  });

  it('stores the visitor from the cookie the collector set', async () => {
    const batch = {
      context: { release: 'contract-test', page_path: '/', device_class: 'desktop' },
      events: [
        { name: 'landing_viewed', event_id: randomUUID(), occurred_at: new Date().toISOString() },
        { name: 'signup_completed', event_id: randomUUID(), properties: { user_id: 'forged' } },
      ],
    };
    const collected = await fetch(`${BASE_URL}/api/events`, {
      method: 'POST',
      headers: { Origin: BASE_URL, 'CF-Connecting-IP': address() },
      body: JSON.stringify(batch),
    });
    expect(collected.status).toBe(202);
    expect(await collected.json()).toEqual({ accepted: 1, rejected: 1 });
    const visitor = (collected.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';
    expect(visitor).toMatch(/^fxr_aid=[0-9a-f-]{36}$/);

    const email = uniqueEmail();
    const created = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': key(),
        'CF-Connecting-IP': address(),
        Cookie: visitor,
      },
      body: JSON.stringify({ email }),
    });
    expect(created.status).toBe(201);

    const listed = await fetch(`${BASE_URL}/api/users?limit=5`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, 'CF-Connecting-IP': address() },
    });
    const page = (await listed.json()) as { data: (User & { anonymous_id: string })[] };
    const stored = page.data.find((user) => user.email === email);
    expect(stored?.anonymous_id).toBe(visitor.split('=')[1]);
  });

  it('rate limits signups from one address and leaves other addresses alone', async () => {
    const noisy = address();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 8; attempt += 1) {
      statuses.push((await create(uniqueEmail(), key(), noisy)).status);
    }
    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses).toContain(429);

    expect((await create(uniqueEmail(), key())).status).toBe(201);
  });
});
