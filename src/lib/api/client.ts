/**
 * The typed client for the Users API: the only code in the browser that calls it.
 * Contract: docs/api.md, "How the page uses it".
 *
 * - Each attempt gives up after 8 seconds.
 * - One retry, after a short pause, with the same body and the same Idempotency-Key, and only
 *   when the request may not have reached the server or the server failed: a network
 *   failure, a timeout, or 500, 502, 503 or 504. A 4xx is an answer, never retried.
 * - One mapping from what happened to what the form shows. It switches on the problem's
 *   `code`, never on its text, and reads `code` only from application/problem+json.
 *
 * It imports only types from schemas.ts, so zod stays out of the island's bundle.
 */
import type { FieldError, ProblemCode } from './problems';
import type { CreateUserInput, ProfilePatch, User } from './schemas';

type Invalid = { kind: 'invalid'; errors: FieldError[] };
type RateLimited = { kind: 'rate_limited'; retryAfterSeconds: number };
type Unavailable = {
  kind: 'unavailable';
  reason: 'offline' | 'timeout' | 'network' | 'server';
};
/** An answer the contract does not list. Shown like `unavailable`, logged as a violation. */
type Unexpected = { kind: 'unexpected'; status: number; code: string | null };

export type CreateUserResult =
  | { kind: 'created'; user: User; replayed: boolean }
  | Invalid
  | { kind: 'email_taken' }
  | RateLimited
  | Unavailable
  | Unexpected;

export type UpdateProfileResult =
  | { kind: 'updated'; user: User }
  | Invalid
  | { kind: 'session_expired' }
  | { kind: 'not_found' }
  | RateLimited
  | Unavailable
  | Unexpected;

interface CreateUserOptions {
  /** One key per signup attempt, reused when the person retries it by hand. */
  idempotencyKey: string;
  /** Cancels the request, the pause and the retry. The call then rejects with its reason. */
  signal?: AbortSignal;
}

interface UpdateProfileOptions {
  signal?: AbortSignal;
}

interface ApiClientOptions {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  baseUrl?: string;
  timeoutMs?: number;
  retryDelayMs?: number;
}

interface ApiClient {
  createUser(input: CreateUserInput, options: CreateUserOptions): Promise<CreateUserResult>;
  updateProfile(
    id: string,
    patch: ProfilePatch,
    options?: UpdateProfileOptions,
  ): Promise<UpdateProfileResult>;
}

const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);

/**
 * The answers this client acts on, each with the status the contract pairs it with.
 * Its own short table: importing the problem registry would ship every title and
 * description to the browser. A test holds the two in step.
 */
export const HANDLED_PROBLEMS = {
  email_taken: 409,
  validation_failed: 422,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
} as const satisfies Partial<Record<ProblemCode, number>>;

/** Every code in the contract, to tell a known code from a stray string. */
const CODE_SHAPE = /^[a-z]+(?:_[a-z]+)*$/;
const DEFAULT_RETRY_AFTER_SECONDS = 60;

/** What one attempt produced: an answer from the server, or no answer at all. */
type Received =
  | { kind: 'answer'; status: number; headers: Headers; text: string }
  | { kind: 'no_answer'; reason: 'offline' | 'timeout' | 'network' };

/** A problem body that parsed. `code` is null when it is not one the registry knows. */
type ProblemBody = { code: string | null; errors: unknown };

export const newIdempotencyKey = (): string => crypto.randomUUID();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function readUser(text: string): User | null {
  const body = parseJson(text);
  if (!isRecord(body) || !isRecord(body.profile)) return null;
  const { id, email, created_at, updated_at } = body;
  return [id, email, created_at, updated_at].every((field) => typeof field === 'string')
    ? (body as unknown as User)
    : null;
}

function readProblem(answer: Extract<Received, { kind: 'answer' }>): ProblemBody | null {
  const mediaType = (answer.headers.get('Content-Type') ?? '').split(';')[0]?.trim();
  if (mediaType?.toLowerCase() !== 'application/problem+json') return null;
  const body = parseJson(answer.text);
  if (!isRecord(body)) return null;
  const code = typeof body.code === 'string' && CODE_SHAPE.test(body.code) ? body.code : null;
  return { code, errors: body.errors };
}

/** True when the answer is the contract's pairing of this code with its status. */
const isAnswer = (
  status: number,
  problem: ProblemBody | null,
  code: keyof typeof HANDLED_PROBLEMS,
): boolean => problem?.code === code && status === HANDLED_PROBLEMS[code];

function readFieldErrors(value: unknown): FieldError[] | null {
  if (!Array.isArray(value)) return null;
  const errors: FieldError[] = [];
  for (const item of value as unknown[]) {
    if (!isRecord(item)) return null;
    const { field, code, message } = item;
    if (typeof field !== 'string' || typeof code !== 'string' || typeof message !== 'string') {
      return null;
    }
    errors.push({ field, code, message });
  }
  return errors;
}

function readRetryAfter(headers: Headers): number {
  const value = headers.get('Retry-After')?.trim() ?? '';
  return /^\d+$/.test(value) ? Number(value) : DEFAULT_RETRY_AFTER_SECONDS;
}

/** The answers both operations share: field errors, rate limiting, server errors, the rest. */
function sharedResult(
  answer: Extract<Received, { kind: 'answer' }>,
  problem: ProblemBody | null,
): Invalid | RateLimited | Unavailable | Unexpected {
  const { status } = answer;
  if (RETRYABLE_STATUSES.has(status)) return { kind: 'unavailable', reason: 'server' };
  if (isAnswer(status, problem, 'validation_failed')) {
    const errors = readFieldErrors(problem?.errors);
    if (errors) return { kind: 'invalid', errors };
  }
  // By status alone: a rate limit in front of the Worker (a WAF rule) answers without our body.
  if (status === 429) {
    return { kind: 'rate_limited', retryAfterSeconds: readRetryAfter(answer.headers) };
  }
  return { kind: 'unexpected', status, code: problem?.code ?? null };
}

function toCreateResult(received: Received): CreateUserResult {
  if (received.kind === 'no_answer') return { kind: 'unavailable', reason: received.reason };
  if (received.status === 201) {
    const user = readUser(received.text);
    if (user) {
      const replayed = received.headers.get('Idempotency-Replayed') === 'true';
      return { kind: 'created', user, replayed };
    }
    return { kind: 'unexpected', status: 201, code: null };
  }
  const problem = readProblem(received);
  if (isAnswer(received.status, problem, 'email_taken')) return { kind: 'email_taken' };
  return sharedResult(received, problem);
}

function toUpdateResult(received: Received): UpdateProfileResult {
  if (received.kind === 'no_answer') return { kind: 'unavailable', reason: received.reason };
  if (received.status === 200) {
    const user = readUser(received.text);
    return user ? { kind: 'updated', user } : { kind: 'unexpected', status: 200, code: null };
  }
  const problem = readProblem(received);
  if (
    isAnswer(received.status, problem, 'unauthenticated') ||
    isAnswer(received.status, problem, 'forbidden')
  ) {
    return { kind: 'session_expired' };
  }
  if (isAnswer(received.status, problem, 'not_found')) return { kind: 'not_found' };
  return sharedResult(received, problem);
}

/** Waits, unless the caller aborts first. */
function pause(milliseconds: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function createApiClient({
  fetch,
  baseUrl = '',
  timeoutMs = 8000,
  retryDelayMs = 400,
}: ApiClientOptions): ApiClient {
  /** One attempt, aborted after `timeoutMs`, including the time to read the body. */
  async function attempt(
    url: string,
    init: RequestInit,
    signal: AbortSignal | undefined,
  ): Promise<Received> {
    signal?.throwIfAborted();
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', onAbort, { once: true });
    // Settles the attempt on abort even if the fetch implementation ignores its signal.
    const aborted = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(controller.signal.reason), {
        once: true,
      });
    });
    try {
      const response = await Promise.race([
        fetch(url, { ...init, credentials: 'same-origin', signal: controller.signal }),
        aborted,
      ]);
      const text = await Promise.race([response.text(), aborted]);
      return { kind: 'answer', status: response.status, headers: response.headers, text };
    } catch {
      if (signal?.aborted) throw signal.reason;
      const reason = isOffline() ? 'offline' : timedOut ? 'timeout' : 'network';
      return { kind: 'no_answer', reason };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  /** At most two attempts, identical, the second only when the first may be retried. */
  async function send(
    path: string,
    init: RequestInit,
    signal: AbortSignal | undefined,
  ): Promise<Received> {
    const url = `${baseUrl}${path}`;
    const first = await attempt(url, init, signal);
    if (first.kind === 'answer' && !RETRYABLE_STATUSES.has(first.status)) return first;
    await pause(retryDelayMs, signal);
    return attempt(url, init, signal);
  }

  return {
    async createUser(input, { idempotencyKey, signal }) {
      const init: RequestInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(input),
      };
      return toCreateResult(await send('/api/users', init, signal));
    },

    async updateProfile(id, patch, { signal } = {}) {
      const init: RequestInit = {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      };
      return toUpdateResult(await send(`/api/users/${encodeURIComponent(id)}`, init, signal));
    },
  };
}

/** The page's client. `fetch` is looked up on each call, so it is always the current one. */
export const apiClient: ApiClient = createApiClient({
  fetch: (url, init) => fetch(url, init),
});
