import type { Attribution, Profile, ProfilePatch } from '../../lib/api/schemas';
import {
  StorageUnavailableError,
  type CreateOutcome,
  type IdempotencyRecord,
  type ProfileUpdate,
  type UserRecord,
  type UsersRepository,
} from './repository';

interface UserRow {
  id: string;
  email: string;
  markets: string | null;
  experience: string | null;
  goal: string | null;
  anonymous_id: string | null;
  attribution: string | null;
  experiments: string;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  'id, email, markets, experience, goal, anonymous_id, attribution, experiments, created_at, updated_at';

function toRecord(row: UserRow): UserRecord {
  const profile: Profile = {};
  if (row.markets) profile.markets = JSON.parse(row.markets) as NonNullable<Profile['markets']>;
  if (row.experience) profile.experience = row.experience as NonNullable<Profile['experience']>;
  if (row.goal) profile.goal = row.goal as NonNullable<Profile['goal']>;
  return {
    id: row.id,
    email: row.email,
    profile,
    anonymous_id: row.anonymous_id,
    attribution: row.attribution ? (JSON.parse(row.attribution) as Attribution) : null,
    experiments: JSON.parse(row.experiments) as Record<string, string>,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Users in Cloudflare D1: the deployed Worker and local development both use it. */
export class D1UsersRepository implements UsersRepository {
  readonly #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  async create(
    user: UserRecord,
    idempotencyKey: string,
    requestHash: string,
    expiredBefore: string,
  ): Promise<CreateOutcome> {
    try {
      // A batch is one transaction: the user and its key are written together or not at all.
      // It first removes the key only if it has expired, so a fresh key is never erased.
      await this.#db.batch([
        this.#db
          .prepare('DELETE FROM idempotency_keys WHERE key = ?1 AND created_at < ?2')
          .bind(idempotencyKey, expiredBefore),
        this.#db
          .prepare(
            `INSERT INTO users (${COLUMNS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
          )
          .bind(
            user.id,
            user.email,
            user.profile.markets ? JSON.stringify(user.profile.markets) : null,
            user.profile.experience ?? null,
            user.profile.goal ?? null,
            user.anonymous_id,
            user.attribution ? JSON.stringify(user.attribution) : null,
            JSON.stringify(user.experiments),
            user.created_at,
            user.updated_at,
          ),
        this.#db
          .prepare(
            'INSERT INTO idempotency_keys (key, request_hash, user_id, created_at) VALUES (?1, ?2, ?3, ?4)',
          )
          .bind(idempotencyKey, requestHash, user.id, user.created_at),
      ]);
      return { ok: true };
    } catch (error) {
      const message = messageOf(error);
      if (message.includes('UNIQUE constraint failed: users.email')) {
        return { ok: false, reason: 'email_taken' };
      }
      if (message.includes('UNIQUE constraint failed: idempotency_keys.key')) {
        return { ok: false, reason: 'key_exists' };
      }
      throw new StorageUnavailableError(message);
    }
  }

  findById(id: string): Promise<UserRecord | null> {
    return this.#run(async () => {
      const row = await this.#db
        .prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?1`)
        .bind(id)
        .first<UserRow>();
      return row ? toRecord(row) : null;
    });
  }

  findIdempotencyKey(key: string): Promise<IdempotencyRecord | null> {
    return this.#run(async () => {
      const row = await this.#db
        .prepare('SELECT request_hash, user_id, created_at FROM idempotency_keys WHERE key = ?1')
        .bind(key)
        .first<{ request_hash: string; user_id: string; created_at: string }>();
      return row
        ? { requestHash: row.request_hash, userId: row.user_id, createdAt: row.created_at }
        : null;
    });
  }

  patchProfile(id: string, patch: ProfilePatch, updatedAt: string): Promise<ProfileUpdate | null> {
    // One UPDATE, so concurrent patches of different fields cannot overwrite each other.
    // For each field: a flag says whether the patch has it, the value sets it (null clears).
    const field = <T>(value: T | null | undefined, encode: (present: T) => string) =>
      value === undefined ? [0, null] : [1, value === null ? null : encode(value)];
    return this.#run(async () => {
      // A batch is one transaction: the row as it was and the update cannot be split by
      // another patch, so only one of two concurrent patches can see the profile empty.
      const [previous, updated] = await this.#db.batch<UserRow>([
        this.#db.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?1`).bind(id),
        this.#db
          .prepare(
            `UPDATE users SET
               markets = CASE WHEN ?3 THEN ?4 ELSE markets END,
               experience = CASE WHEN ?5 THEN ?6 ELSE experience END,
               goal = CASE WHEN ?7 THEN ?8 ELSE goal END,
               updated_at = ?2
             WHERE id = ?1
             RETURNING ${COLUMNS}`,
          )
          .bind(
            id,
            updatedAt,
            ...field(patch.markets, (markets) => JSON.stringify(markets)),
            ...field(patch.experience, String),
            ...field(patch.goal, String),
          ),
      ]);
      const before = previous?.results[0];
      const after = updated?.results[0];
      return before && after ? { user: toRecord(after), before: toRecord(before).profile } : null;
    });
  }

  list(limit: number, before?: string): Promise<UserRecord[]> {
    return this.#run(async () => {
      const statement =
        before === undefined
          ? this.#db.prepare(`SELECT ${COLUMNS} FROM users ORDER BY id DESC LIMIT ?1`).bind(limit)
          : this.#db
              .prepare(`SELECT ${COLUMNS} FROM users WHERE id < ?2 ORDER BY id DESC LIMIT ?1`)
              .bind(limit, before);
      const { results } = await statement.all<UserRow>();
      return results.map(toRecord);
    });
  }

  async #run<T>(query: () => Promise<T>): Promise<T> {
    try {
      return await query();
    } catch (error) {
      throw new StorageUnavailableError(messageOf(error));
    }
  }
}
