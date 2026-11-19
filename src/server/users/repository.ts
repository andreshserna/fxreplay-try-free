import type { Attribution, Profile, ProfilePatch } from '../../lib/api/schemas';

/** A user as stored: what the API returns, plus what only the list operation shows. */
export interface UserRecord {
  id: string;
  email: string;
  profile: Profile;
  anonymous_id: string | null;
  attribution: Attribution | null;
  experiments: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface IdempotencyRecord {
  requestHash: string;
  userId: string;
  createdAt: string;
}

export type CreateOutcome = { ok: true } | { ok: false; reason: 'email_taken' | 'key_exists' };

/** Thrown when the store cannot be reached. The API answers 503 and the client may retry. */
export class StorageUnavailableError extends Error {
  override name = 'StorageUnavailableError';
}

/**
 * Where users live. Two implementations: D1 in the deployed Worker and in local
 * development, and an in-memory one for tests. Neither leaks into the handlers.
 */
export interface UsersRepository {
  /**
   * Stores the user and its idempotency key together or not at all. Uniqueness of the
   * email and of the key is the store's job, so two concurrent requests cannot both win.
   * A key created before `expiredBefore` no longer counts: it is replaced in the same
   * transaction, so a request can only ever remove an expired key, never a fresh one.
   */
  create(
    user: UserRecord,
    idempotencyKey: string,
    requestHash: string,
    expiredBefore: string,
  ): Promise<CreateOutcome>;
  findById(id: string): Promise<UserRecord | null>;
  findIdempotencyKey(key: string): Promise<IdempotencyRecord | null>;
  /**
   * Applies the patch in one step, so concurrent patches of different fields all land.
   * An absent key leaves the field alone, null clears it, a value sets it. Returns the
   * updated user, or null when there is no such user.
   */
  patchProfile(id: string, patch: ProfilePatch, updatedAt: string): Promise<UserRecord | null>;
  /** Newest first. `before` is the id the previous page ended on. */
  list(limit: number, before?: string): Promise<UserRecord[]>;
}
