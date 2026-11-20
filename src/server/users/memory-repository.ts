import type { ProfilePatch } from '../../lib/api/schemas';
import type {
  CreateOutcome,
  IdempotencyRecord,
  ProfileUpdate,
  UserRecord,
  UsersRepository,
} from './repository';

/** The repository for tests: same rules as the database, nothing to set up. */
export class MemoryUsersRepository implements UsersRepository {
  readonly #users = new Map<string, UserRecord>();
  readonly #keys = new Map<string, IdempotencyRecord>();

  async create(
    user: UserRecord,
    idempotencyKey: string,
    requestHash: string,
    expiredBefore: string,
  ): Promise<CreateOutcome> {
    // Same order as the database: the user row is written first, then the key. An expired
    // key does not count, and it is replaced only when the whole create succeeds.
    for (const existing of this.#users.values()) {
      if (existing.email === user.email) return { ok: false, reason: 'email_taken' };
    }
    const existingKey = this.#keys.get(idempotencyKey);
    if (existingKey && existingKey.createdAt >= expiredBefore) {
      return { ok: false, reason: 'key_exists' };
    }
    this.#users.set(user.id, structuredClone(user));
    this.#keys.set(idempotencyKey, { requestHash, userId: user.id, createdAt: user.created_at });
    return { ok: true };
  }

  async findById(id: string): Promise<UserRecord | null> {
    const user = this.#users.get(id);
    return user ? structuredClone(user) : null;
  }

  async findIdempotencyKey(key: string): Promise<IdempotencyRecord | null> {
    const record = this.#keys.get(key);
    return record ? { ...record } : null;
  }

  async patchProfile(
    id: string,
    patch: ProfilePatch,
    updatedAt: string,
  ): Promise<ProfileUpdate | null> {
    // No await between the read and the write: one step, like the database's transaction.
    const user = this.#users.get(id);
    if (!user) return null;
    const before = structuredClone(user.profile);
    const profile = structuredClone(user.profile);
    if (patch.markets === null) delete profile.markets;
    else if (patch.markets !== undefined) profile.markets = [...patch.markets];
    if (patch.experience === null) delete profile.experience;
    else if (patch.experience !== undefined) profile.experience = patch.experience;
    if (patch.goal === null) delete profile.goal;
    else if (patch.goal !== undefined) profile.goal = patch.goal;
    const updated = { ...user, profile, updated_at: updatedAt };
    this.#users.set(id, updated);
    return { user: structuredClone(updated), before };
  }

  async list(limit: number, before?: string): Promise<UserRecord[]> {
    return [...this.#users.values()]
      .filter((user) => before === undefined || user.id < before)
      .sort((a, b) => (a.id < b.id ? 1 : -1))
      .slice(0, limit)
      .map((user) => structuredClone(user));
  }
}
