import type { CreateUserInput, Profile, ProfilePatch } from '../../lib/api/schemas';
import { newUserId, USER_ID_PATTERN } from '../ids';
import type { UserRecord, UsersRepository } from './repository';

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
export const LIST_DEFAULT_LIMIT = 20;
export const LIST_MAX_LIMIT = 100;

export type CreateResult =
  | { kind: 'created' | 'replayed'; user: UserRecord }
  | { kind: 'email_taken' }
  | { kind: 'key_reused' };

export interface ListResult {
  data: UserRecord[];
  next_cursor: string | null;
}

const encoder = new TextEncoder();

/** Stable JSON: keys sorted at every level, so equal inputs hash equally. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function requestHash(input: CreateUserInput): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(canonical(input)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const encodeCursor = (id: string): string =>
  btoa(id).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function decodeCursor(cursor: string): string | null {
  try {
    const id = atob(cursor.replace(/-/g, '+').replace(/_/g, '/'));
    return USER_ID_PATTERN.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** Applies a patch to a profile. A null clears the field, an absent key leaves it alone. */
export function applyProfilePatch(profile: Profile, patch: ProfilePatch): Profile {
  const next: Profile = { ...profile };
  if (patch.markets === null) delete next.markets;
  else if (patch.markets !== undefined) next.markets = [...new Set(patch.markets)];
  if (patch.experience === null) delete next.experience;
  else if (patch.experience !== undefined) next.experience = patch.experience;
  if (patch.goal === null) delete next.goal;
  else if (patch.goal !== undefined) next.goal = patch.goal;
  return next;
}

/** The rules of the Users API, free of HTTP and of any particular store. */
export class UsersService {
  readonly #repository: UsersRepository;
  readonly #now: () => Date;

  constructor(repository: UsersRepository, now: () => Date = () => new Date()) {
    this.#repository = repository;
    this.#now = now;
  }

  /**
   * Creates a user once per idempotency key. The same key with the same body returns the
   * user it created, so a retry after a timeout never reports "already registered".
   */
  async create(input: CreateUserInput, idempotencyKey: string): Promise<CreateResult> {
    const hash = await requestHash(input);
    const now = this.#now();

    const replay = await this.#replay(idempotencyKey, hash, now);
    if (replay) return replay;

    const timestamp = now.toISOString();
    const user: UserRecord = {
      id: newUserId(now.getTime()),
      email: input.email,
      profile: {},
      anonymous_id: input.anonymous_id ?? null,
      attribution: input.attribution ?? null,
      experiments: input.experiments ?? {},
      created_at: timestamp,
      updated_at: timestamp,
    };

    const outcome = await this.#repository.create(user, idempotencyKey, hash);
    if (outcome.ok) return { kind: 'created', user };

    // A concurrent duplicate of this same request may have won between the lookup and the
    // insert. It must get the same answer, not "already registered".
    const concurrent = await this.#replay(idempotencyKey, hash, now);
    if (concurrent) return concurrent;
    return outcome.reason === 'email_taken' ? { kind: 'email_taken' } : { kind: 'key_reused' };
  }

  async #replay(key: string, hash: string, now: Date): Promise<CreateResult | null> {
    const record = await this.#repository.findIdempotencyKey(key);
    if (!record) return null;
    if (now.getTime() - Date.parse(record.createdAt) > IDEMPOTENCY_TTL_MS) {
      await this.#repository.deleteIdempotencyKey(key);
      return null;
    }
    if (record.requestHash !== hash) return { kind: 'key_reused' };
    const user = await this.#repository.findById(record.userId);
    return user ? { kind: 'replayed', user } : null;
  }

  async updateProfile(id: string, patch: ProfilePatch): Promise<UserRecord | null> {
    const user = await this.#repository.findById(id);
    if (!user) return null;
    const profile = applyProfilePatch(user.profile, patch);
    return this.#repository.saveProfile(id, profile, this.#now().toISOString());
  }

  /** One page, newest first. `before` is a decoded cursor. */
  async list(limit: number, before?: string): Promise<ListResult> {
    const rows = await this.#repository.list(limit + 1, before);
    const data = rows.slice(0, limit);
    const last = data.at(-1);
    return { data, next_cursor: rows.length > limit && last ? encodeCursor(last.id) : null };
  }
}
