import type { Profile } from '../../lib/api/schemas';
import type { CreateOutcome, IdempotencyRecord, UserRecord, UsersRepository } from './repository';

/** The repository for tests: same rules as the database, nothing to set up. */
export class MemoryUsersRepository implements UsersRepository {
  readonly #users = new Map<string, UserRecord>();
  readonly #keys = new Map<string, IdempotencyRecord>();

  async create(
    user: UserRecord,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<CreateOutcome> {
    // Same order as the database: the user row is written first, then the key.
    for (const existing of this.#users.values()) {
      if (existing.email === user.email) return { ok: false, reason: 'email_taken' };
    }
    if (this.#keys.has(idempotencyKey)) return { ok: false, reason: 'key_exists' };
    this.#users.set(user.id, structuredClone(user));
    this.#keys.set(idempotencyKey, { requestHash, userId: user.id, createdAt: user.created_at });
    return { ok: true };
  }

  async findById(id: string): Promise<UserRecord | null> {
    const user = this.#users.get(id);
    return user ? structuredClone(user) : null;
  }

  async findIdempotencyKey(key: string): Promise<IdempotencyRecord | null> {
    return this.#keys.get(key) ?? null;
  }

  async deleteIdempotencyKey(key: string): Promise<void> {
    this.#keys.delete(key);
  }

  async saveProfile(id: string, profile: Profile, updatedAt: string): Promise<UserRecord | null> {
    const user = this.#users.get(id);
    if (!user) return null;
    const updated = { ...user, profile: structuredClone(profile), updated_at: updatedAt };
    this.#users.set(id, updated);
    return structuredClone(updated);
  }

  async list(limit: number, before?: string): Promise<UserRecord[]> {
    return [...this.#users.values()]
      .filter((user) => before === undefined || user.id < before)
      .sort((a, b) => (a.id < b.id ? 1 : -1))
      .slice(0, limit)
      .map((user) => structuredClone(user));
  }
}
