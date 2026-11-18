/**
 * User access keys: one key belongs to one dashboard user and works for the
 * IDE API (/api/ide) and for /mcp.
 *
 * Key text:  axk_<8 hex>_<43 random characters>
 * Prefix:    axk_<8 hex>  (kept in clear, to tell keys apart)
 *
 * Only the sha256 hash of the key is stored. The key text leaves this module
 * once, in the result of create(). Nothing here logs the key or the hash.
 * The random part is base64url and can hold "_", so no code splits a key on "_".
 */
import * as crypto from 'crypto';
import { generateToken, hashToken } from './tokenUtils.js';

export const KEY_MARK = 'axk_';
/** AuthInfo.clientId of every call made with a user key. */
export const KEY_CLIENT_ID = 'axon-user-key';
/** lastUsedAt is written at most once in this time per key. */
export const TOUCH_INTERVAL_MS = 60_000;

export type KeyUse = 'ide' | 'mcp';
export type KeyStatus = 'active' | 'expired' | 'revoked';

/** A row of user_api_keys. */
export interface StoredKey {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  tokenHash: string;
  createdAt: Date;
  createdBy: string | null;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  lastUsedFrom: string | null;
  revokedAt: Date | null;
  revokedBy: string | null;
}

/** A key as the rest of the server sees it: no key text and no hash. */
export interface KeyInfo {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  createdAt: Date;
  createdBy: string | null;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  lastUsedFrom: KeyUse | null;
  revokedAt: Date | null;
  revokedBy: string | null;
  status: KeyStatus;
}

/** The slice of PrismaClient this store uses (a test passes a fake). */
export interface UserKeyDb {
  userApiKey: {
    create(args: { data: Omit<StoredKey, 'id' | 'createdAt' | 'lastUsedAt' | 'lastUsedFrom' | 'revokedAt' | 'revokedBy'> }): Promise<StoredKey>;
    findUnique(args: { where: { tokenHash: string } | { id: string } }): Promise<StoredKey | null>;
    findMany(args: { where?: { userId?: string }; orderBy?: { createdAt: 'asc' | 'desc' } }): Promise<StoredKey[]>;
    update(args: { where: { id: string }; data: Partial<StoredKey> }): Promise<StoredKey>;
    updateMany(args: { where: { userId: string; revokedAt: null }; data: Partial<StoredKey> }): Promise<{ count: number }>;
    deleteMany(args: { where: any }): Promise<{ count: number }>;
  };
}

export interface UserKeyStoreOptions {
  now?: () => number;
  log?: (line: string) => void;
}

export function looksLikeUserKey(token: string): boolean {
  return typeof token === 'string' && token.startsWith(KEY_MARK);
}

/** Compares two sha256 hex texts in constant time. */
export function hashesEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  if (x.length === 0 || x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

export function keyStatus(row: { revokedAt: Date | null; expiresAt: Date | null }, now: number): KeyStatus {
  if (row.revokedAt) return 'revoked';
  if (row.expiresAt && row.expiresAt.getTime() <= now) return 'expired';
  return 'active';
}

/** A new key and its prefix. */
export function makeKeyText(): { key: string; prefix: string } {
  const prefix = KEY_MARK + crypto.randomBytes(4).toString('hex');
  return { key: `${prefix}_${generateToken(32)}`, prefix };
}

export class UserKeyStore {
  private readonly now: () => number;
  private readonly log: (line: string) => void;
  /** Last lastUsedAt write per key id (never per key text). */
  private readonly touchedAt = new Map<string, number>();

  constructor(private readonly db: UserKeyDb, opts: UserKeyStoreOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((line: string) => console.error(line));
  }

  private info(row: StoredKey): KeyInfo {
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      prefix: row.prefix,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      expiresAt: row.expiresAt,
      lastUsedAt: row.lastUsedAt,
      lastUsedFrom: row.lastUsedFrom === 'ide' || row.lastUsedFrom === 'mcp' ? row.lastUsedFrom : null,
      revokedAt: row.revokedAt,
      revokedBy: row.revokedBy,
      status: keyStatus(row, this.now()),
    };
  }

  /** Makes a key. `key` in the result is the only copy of the key text. */
  async create(input: { userId: string; name: string; expiresAt?: Date | null; createdBy?: string | null }): Promise<{ row: KeyInfo; key: string }> {
    let lastError: unknown;
    // The prefix is unique. Two keys with the same 8 hex characters are rare: try again.
    for (let attempt = 0; attempt < 4; attempt++) {
      const { key, prefix } = makeKeyText();
      try {
        const row = await this.db.userApiKey.create({
          data: {
            userId: input.userId,
            name: input.name,
            prefix,
            tokenHash: hashToken(key),
            createdBy: input.createdBy ?? null,
            expiresAt: input.expiresAt ?? null,
          },
        });
        return { row: this.info(row), key };
      } catch (error: any) {
        lastError = error;
        if (error?.code !== 'P2002') break; // not a unique clash
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Could not make a key');
  }

  async listForUser(userId: string): Promise<KeyInfo[]> {
    const rows = await this.db.userApiKey.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    return rows.map(r => this.info(r));
  }

  async listAll(): Promise<KeyInfo[]> {
    const rows = await this.db.userApiKey.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map(r => this.info(r));
  }

  /**
   * Revokes one key of one user. Null when there is no such key or it belongs
   * to another user. A key that was revoked before stays as it is.
   */
  async revoke(id: string, userId: string, by: string | null): Promise<KeyInfo | null> {
    const row = await this.db.userApiKey.findUnique({ where: { id } });
    if (!row || row.userId !== userId) return null;
    if (row.revokedAt) return this.info(row);
    const next = await this.db.userApiKey.update({
      where: { id },
      data: { revokedAt: new Date(this.now()), revokedBy: by },
    });
    this.touchedAt.delete(id);
    return this.info(next);
  }

  /** Revokes every live key of a user (the user was deleted). */
  async revokeAllForUser(userId: string, by: string | null): Promise<number> {
    const result = await this.db.userApiKey.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(this.now()), revokedBy: by },
    });
    return result.count;
  }

  /**
   * Finds the key row for a key text, or null. The row is found by the hash
   * of the text, and the two hashes are then compared in constant time.
   * It does not check revoke or expiry: see `status`.
   */
  async findByKey(plainKey: string): Promise<KeyInfo | null> {
    if (!looksLikeUserKey(plainKey)) return null;
    const hash = hashToken(plainKey);
    const row = await this.db.userApiKey.findUnique({ where: { tokenHash: hash } });
    if (!row || !hashesEqual(row.tokenHash, hash)) return null;
    return this.info(row);
  }

  /** Records a use of the key. Fire and forget; at most one write per minute per key. */
  touch(id: string, from: KeyUse): void {
    const now = this.now();
    const last = this.touchedAt.get(id);
    if (last !== undefined && now - last < TOUCH_INTERVAL_MS) return;
    this.touchedAt.set(id, now);
    if (this.touchedAt.size > 1000) {
      for (const [key, at] of this.touchedAt) {
        if (now - at >= TOUCH_INTERVAL_MS) this.touchedAt.delete(key);
      }
    }
    Promise.resolve()
      .then(() => this.db.userApiKey.update({ where: { id }, data: { lastUsedAt: new Date(now), lastUsedFrom: from } }))
      .catch((e: any) => this.log(`[keys] Could not record the use of a key: ${e?.message ?? e}`));
  }

  /** Deletes keys that were revoked or that expired before `before`. */
  async purge(before: Date): Promise<number> {
    const result = await this.db.userApiKey.deleteMany({
      where: { OR: [{ revokedAt: { lt: before } }, { expiresAt: { lt: before } }] },
    });
    return result.count;
  }
}
