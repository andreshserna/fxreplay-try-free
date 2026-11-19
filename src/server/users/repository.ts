import type { Attribution, Profile } from '../../lib/api/schemas';

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
   */
  create(user: UserRecord, idempotencyKey: string, requestHash: string): Promise<CreateOutcome>;
  findById(id: string): Promise<UserRecord | null>;
  findIdempotencyKey(key: string): Promise<IdempotencyRecord | null>;
  deleteIdempotencyKey(key: string): Promise<void>;
  /** Replaces the profile. Returns the updated user, or null when there is no such user. */
  saveProfile(id: string, profile: Profile, updatedAt: string): Promise<UserRecord | null>;
  /** Newest first. `before` is the id the previous page ended on. */
  list(limit: number, before?: string): Promise<UserRecord[]>;
}
