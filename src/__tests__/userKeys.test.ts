/**
 * User access keys: the key store, the shared bearer check, the access record
 * and the cleanup. No network and no database: a fake stands in for Prisma.
 * All names and keys here are made up.
 */
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import {
  UserKeyStore, hashesEqual, keyStatus, looksLikeUserKey, makeKeyText, KEY_CLIENT_ID, TOUCH_INTERVAL_MS, type StoredKey,
} from '../auth/userKeys.js';
import {
  createBearerVerifier, verifyCaller, callerFromAuthInfo, scopesForRole, REFUSED_TEXT, NO_EXPIRY_SECONDS,
} from '../auth/bearerVerifier.js';
import { AccessAudit, type AccessAuditRow } from '../auth/accessAudit.js';
import { TokenCleanupJob, KEY_KEEP_DAYS, AUDIT_KEEP_DAYS } from '../auth/tokenCleanup.js';
import { hashToken } from '../auth/tokenUtils.js';
import type { UserPublic, UserRole } from '../admin/userStore.js';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 5, 1);
const KEY_RE = /^axk_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/;

/** In-memory stand-in for the slice of PrismaClient that the key store uses. */
function fakeDb() {
  const rows: StoredKey[] = [];
  let n = 0;
  const lt = (value: Date | null, cond: any) => value !== null && cond && value.getTime() < cond.lt.getTime();
  const db = {
    rows,
    /** The next `failCreates` create calls fail with this error. */
    failCreates: 0,
    createError: Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }) as any,
    updateError: null as Error | null,
    updates: [] as Array<{ id: string; data: any }>,
    userApiKey: {
      create: async ({ data }: any) => {
        if (db.failCreates > 0) { db.failCreates--; throw db.createError; }
        if (rows.some(r => r.prefix === data.prefix || r.tokenHash === data.tokenHash)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        const row: StoredKey = {
          id: `key-${++n}`, createdAt: new Date(T0 + n * 1000), lastUsedAt: null, lastUsedFrom: null,
          revokedAt: null, revokedBy: null, ...data,
        };
        rows.push(row);
        return { ...row };
      },
      findUnique: async ({ where }: any) => {
        const row = 'id' in where ? rows.find(r => r.id === where.id) : rows.find(r => r.tokenHash === where.tokenHash);
        return row ? { ...row } : null;
      },
      findMany: async ({ where }: any) =>
        rows.filter(r => !where?.userId || r.userId === where.userId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map(r => ({ ...r })),
      update: async ({ where, data }: any) => {
        if (db.updateError) throw db.updateError;
        const row = rows.find(r => r.id === where.id);
        if (!row) throw new Error('no such row');
        db.updates.push({ id: where.id, data });
        Object.assign(row, data);
        return { ...row };
      },
      updateMany: async ({ where, data }: any) => {
        const hit = rows.filter(r => r.userId === where.userId && r.revokedAt === null);
        hit.forEach(r => Object.assign(r, data));
        return { count: hit.length };
      },
      deleteMany: async ({ where }: any) => {
        const gone = rows.filter(r => where.OR.some((c: any) => lt(r.revokedAt, c.revokedAt) || lt(r.expiresAt, c.expiresAt)));
        gone.forEach(r => rows.splice(rows.indexOf(r), 1));
        return { count: gone.length };
      },
    },
  };
  return db;
}

const user = (id: string, username: string, role: UserRole = 'user', disabled = false): UserPublic =>
  ({ id, username, role, createdAt: new Date(T0).toISOString(), disabled, dashboardLogin: true });

/** Lets the fire-and-forget writes run. */
const settle = () => new Promise<void>(ok => setTimeout(ok, 10));

let db: ReturnType<typeof fakeDb>;
let nowMs: number;
let logs: string[];
let store: UserKeyStore;
let users: Map<string, UserPublic>;

beforeEach(() => {
  db = fakeDb();
  nowMs = T0;
  logs = [];
  store = new UserKeyStore(db, { now: () => nowMs, log: line => { logs.push(line); } });
  users = new Map([
    ['u-alice', user('u-alice', 'alice')],
    ['u-bob', user('u-bob', 'bob', 'admin')],
    ['u-rita', user('u-rita', 'rita', 'readonly')],
  ]);
});

const verifierFor = (from: 'ide' | 'mcp' = 'ide', oauth?: { verifyAccessToken(token: string): Promise<any> }) =>
  createBearerVerifier({
    keys: store,
    users: { getUserById: id => users.get(id) ?? null },
    oauth: () => oauth,
    from,
    log: line => { logs.push(line); },
    now: () => nowMs,
  });

describe('key store', () => {
  test('the key text is axk_<8 hex>_<43 characters>; the prefix is its readable start', async () => {
    const { key, row } = await store.create({ userId: 'u-alice', name: 'laptop IntelliJ', createdBy: 'bob' });
    expect(key).toMatch(KEY_RE);
    expect(row.prefix).toBe(key.slice(0, 12));
    expect(row.prefix).toMatch(/^axk_[0-9a-f]{8}$/);
    expect(row).toMatchObject({ userId: 'u-alice', name: 'laptop IntelliJ', createdBy: 'bob', expiresAt: null, lastUsedAt: null, status: 'active' });
    const other = makeKeyText();
    expect(other.key).toMatch(KEY_RE);
    expect(other.key).not.toBe(key);
    expect(looksLikeUserKey(key)).toBe(true);
    expect(looksLikeUserKey('some-oauth-token')).toBe(false);
  });

  test('only the sha256 hash is stored; no result holds the key or the hash', async () => {
    const { key, row } = await store.create({ userId: 'u-alice', name: 'one' });
    const hash = hashToken(key);
    expect(db.rows[0].tokenHash).toBe(hash);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(db.rows)).not.toContain(key);
    expect(JSON.stringify(db.rows)).not.toContain(key.slice(13)); // the secret part

    const seen = JSON.stringify([row, await store.listForUser('u-alice'), await store.listAll(), await store.findByKey(key)]);
    expect(seen).not.toContain(key.slice(13));
    expect(seen).not.toContain(hash);
    expect(seen).not.toContain('tokenHash');
  });

  test('findByKey: the right key only', async () => {
    const { key, row } = await store.create({ userId: 'u-alice', name: 'one' });
    expect((await store.findByKey(key))?.id).toBe(row.id);
    expect(await store.findByKey(key.slice(0, -1) + (key.endsWith('A') ? 'B' : 'A'))).toBeNull();
    expect(await store.findByKey(row.prefix)).toBeNull();
    expect(await store.findByKey(row.prefix + '_')).toBeNull();
    expect(await store.findByKey('not-a-key')).toBeNull();
    expect(await store.findByKey('')).toBeNull();
  });

  test('the hash compare is constant time', async () => {
    const { key } = await store.create({ userId: 'u-alice', name: 'one' });
    const spy = jest.spyOn(require('crypto'), 'timingSafeEqual');
    try {
      expect(await store.findByKey(key)).not.toBeNull();
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
    const a = hashToken('a');
    expect(hashesEqual(a, a)).toBe(true);
    expect(hashesEqual(a, hashToken('b'))).toBe(false);
    expect(hashesEqual(a, a.slice(0, 32))).toBe(false);
    expect(hashesEqual('', '')).toBe(false);
    expect(hashesEqual('zz', 'zz')).toBe(false);
  });

  test('a row whose stored hash is not the hash of the key is refused', async () => {
    const { key } = await store.create({ userId: 'u-alice', name: 'one' });
    const loose = { userApiKey: { ...db.userApiKey, findUnique: async () => ({ ...db.rows[0], tokenHash: hashToken('other') }) } };
    expect(await new UserKeyStore(loose).findByKey(key)).toBeNull();
  });

  test('revoke: own key only; a second revoke keeps the first time', async () => {
    const a = await store.create({ userId: 'u-alice', name: 'one' });
    const b = await store.create({ userId: 'u-bob', name: 'two' });
    expect(await store.revoke(b.row.id, 'u-alice', 'alice')).toBeNull();
    expect(await store.revoke('no-such-id', 'u-alice', 'alice')).toBeNull();
    expect(db.rows.every(r => r.revokedAt === null)).toBe(true);

    const first = await store.revoke(a.row.id, 'u-alice', 'bob');
    expect(first).toMatchObject({ status: 'revoked', revokedBy: 'bob', revokedAt: new Date(T0) });
    nowMs += DAY;
    const second = await store.revoke(a.row.id, 'u-alice', 'alice');
    expect(second).toMatchObject({ status: 'revoked', revokedBy: 'bob', revokedAt: new Date(T0) });
    expect((await store.findByKey(a.key))?.status).toBe('revoked');
    expect((await store.findByKey(b.key))?.status).toBe('active');
  });

  test('revokeAllForUser revokes the live keys of that user only', async () => {
    const a1 = await store.create({ userId: 'u-alice', name: 'one' });
    await store.create({ userId: 'u-alice', name: 'two' });
    const b = await store.create({ userId: 'u-bob', name: 'three' });
    await store.revoke(a1.row.id, 'u-alice', 'bob');
    expect(await store.revokeAllForUser('u-alice', 'bob')).toBe(1);
    expect((await store.listForUser('u-alice')).map(k => k.status)).toEqual(['revoked', 'revoked']);
    expect((await store.findByKey(b.key))?.status).toBe('active');
  });

  test('status: active, then expired at the expiry time; revoked wins', async () => {
    const { key, row } = await store.create({ userId: 'u-alice', name: 'short', expiresAt: new Date(T0 + DAY) });
    expect((await store.findByKey(key))?.status).toBe('active');
    nowMs = T0 + DAY;
    expect((await store.findByKey(key))?.status).toBe('expired');
    await store.revoke(row.id, 'u-alice', 'bob');
    expect((await store.findByKey(key))?.status).toBe('revoked');
    expect(keyStatus({ revokedAt: null, expiresAt: null }, T0)).toBe('active');
  });

  test('lists are newest first and hold revoked and expired keys', async () => {
    const a = await store.create({ userId: 'u-alice', name: 'first' });
    await store.create({ userId: 'u-alice', name: 'second', expiresAt: new Date(T0 - DAY) });
    await store.create({ userId: 'u-bob', name: 'third' });
    await store.revoke(a.row.id, 'u-alice', 'bob');
    expect((await store.listForUser('u-alice')).map(k => [k.name, k.status])).toEqual([['second', 'expired'], ['first', 'revoked']]);
    expect((await store.listAll()).map(k => k.name)).toEqual(['third', 'second', 'first']);
  });

  test('touch writes last used at most once per minute per key', async () => {
    const a = await store.create({ userId: 'u-alice', name: 'one' });
    const b = await store.create({ userId: 'u-bob', name: 'two' });
    store.touch(a.row.id, 'ide');
    store.touch(a.row.id, 'mcp');
    store.touch(b.row.id, 'mcp');
    await settle();
    expect(db.updates).toEqual([
      { id: a.row.id, data: { lastUsedAt: new Date(T0), lastUsedFrom: 'ide' } },
      { id: b.row.id, data: { lastUsedAt: new Date(T0), lastUsedFrom: 'mcp' } },
    ]);
    nowMs += TOUCH_INTERVAL_MS - 1;
    store.touch(a.row.id, 'mcp');
    await settle();
    expect(db.updates).toHaveLength(2);
    nowMs += 1;
    store.touch(a.row.id, 'mcp');
    await settle();
    expect(db.updates).toHaveLength(3);
    expect((await store.listForUser('u-alice'))[0]).toMatchObject({ lastUsedAt: new Date(nowMs), lastUsedFrom: 'mcp' });
  });

  test('a failed last-used write is logged and does not throw', async () => {
    const a = await store.create({ userId: 'u-alice', name: 'one' });
    db.updateError = new Error('disk is full');
    expect(() => store.touch(a.row.id, 'ide')).not.toThrow();
    await settle();
    expect(logs.join('\n')).toContain('disk is full');
    expect(logs.join('\n')).not.toContain(a.key);
  });

  test('purge deletes keys revoked or expired before the date, and no other', async () => {
    const old = await store.create({ userId: 'u-alice', name: 'revoked long ago' });
    await store.revoke(old.row.id, 'u-alice', 'bob'); // at T0
    await store.create({ userId: 'u-alice', name: 'expired long ago', expiresAt: new Date(T0 - DAY) });
    await store.create({ userId: 'u-alice', name: 'live, no expiry' });
    await store.create({ userId: 'u-alice', name: 'live, expires later', expiresAt: new Date(T0 + 400 * DAY) });
    nowMs = T0 + 100 * DAY;
    const fresh = await store.create({ userId: 'u-alice', name: 'revoked yesterday' });
    await store.revoke(fresh.row.id, 'u-alice', 'bob');

    expect(await store.purge(new Date(nowMs - 90 * DAY))).toBe(2);
    expect(db.rows.map(r => r.name).sort()).toEqual(['live, expires later', 'live, no expiry', 'revoked yesterday']);
  });

  test('a prefix clash is tried again; another database error is thrown', async () => {
    db.failCreates = 2;
    const made = await store.create({ userId: 'u-alice', name: 'one' });
    expect(made.key).toMatch(KEY_RE);
    db.failCreates = 1;
    db.createError = new Error('database is locked');
    await expect(store.create({ userId: 'u-alice', name: 'two' })).rejects.toThrow('database is locked');
    expect(db.rows).toHaveLength(1);
  });
});

describe('bearer check', () => {
  test('a good key gives the user, the role scopes and a numeric expiry', async () => {
    const { key, row } = await store.create({ userId: 'u-alice', name: 'one' });
    const info = await verifierFor('ide').verifyAccessToken(key);
    expect(info).toEqual({
      token: key,
      clientId: KEY_CLIENT_ID,
      scopes: ['mcp:read', 'mcp:write'],
      expiresAt: Math.floor(T0 / 1000) + NO_EXPIRY_SECONDS,
      extra: { userId: 'u-alice', username: 'alice', role: 'user', keyId: row.id, keyPrefix: row.prefix, kind: 'key' },
    });
    expect(callerFromAuthInfo(info)).toEqual(info.extra);

    const timed = await store.create({ userId: 'u-bob', name: 'two', expiresAt: new Date(T0 + 30 * DAY) });
    const info2 = await verifierFor('mcp').verifyAccessToken(timed.key);
    expect(info2.expiresAt).toBe(Math.floor((T0 + 30 * DAY) / 1000));
    expect(info2.scopes).toEqual(['mcp:read', 'mcp:write', 'mcp:admin']);
    expect(scopesForRole('readonly')).toEqual(['mcp:read']);
  });

  test('a use is recorded with the door it came through', async () => {
    const { key, row } = await store.create({ userId: 'u-alice', name: 'one' });
    await verifierFor('mcp').verifyAccessToken(key);
    await settle();
    expect(db.updates).toEqual([{ id: row.id, data: { lastUsedAt: new Date(T0), lastUsedFrom: 'mcp' } }]);
  });

  test('wrong, revoked and expired keys and a disabled or deleted user: one generic refusal', async () => {
    const check = verifierFor();
    const refused = async (token: string) => {
      const error = await check.verifyAccessToken(token).then(() => null, e => e);
      expect(error).toBeInstanceOf(InvalidTokenError);
      expect(error.message).toBe(REFUSED_TEXT);
    };

    await refused('axk_ffffffff_this-key-was-never-made-0123456789abcdefgh');
    await refused('');

    const revoked = await store.create({ userId: 'u-alice', name: 'revoked' });
    await store.revoke(revoked.row.id, 'u-alice', 'bob');
    await refused(revoked.key);

    const expired = await store.create({ userId: 'u-alice', name: 'expired', expiresAt: new Date(T0 + DAY) });
    expect(await verifyCaller(check, expired.key, () => nowMs)).not.toBeNull();
    nowMs = T0 + DAY;
    await refused(expired.key);

    const live = await store.create({ userId: 'u-alice', name: 'live' });
    users.set('u-alice', user('u-alice', 'alice', 'user', true));
    await refused(live.key);
    users.set('u-alice', user('u-alice', 'alice'));
    expect((await check.verifyAccessToken(live.key)).extra?.username).toBe('alice');

    users.delete('u-alice');
    await refused(live.key);
    // A user made again with the same name has a new id: the old key stays dead.
    users.set('u-alice-2', user('u-alice-2', 'alice'));
    await refused(live.key);

    // No key was recorded as used by a refused call.
    await settle();
    const used = db.updates.filter(u => 'lastUsedAt' in u.data).map(u => u.id);
    expect(used).not.toContain(revoked.row.id);
    expect(used).toEqual([expired.row.id, live.row.id]);
  });

  test('the log has the reason and the prefix, never the key', async () => {
    const check = verifierFor('ide');
    const { key, row } = await store.create({ userId: 'u-alice', name: 'one' });
    await store.revoke(row.id, 'u-alice', 'bob');
    await check.verifyAccessToken(key).catch(() => undefined);
    const never = 'axk_ffffffff_this-key-was-never-made-0123456789abcdefgh';
    await check.verifyAccessToken(never).catch(() => undefined);
    const text = logs.join('\n');
    expect(text).toContain(`key ${row.prefix} is revoked`);
    expect(text).toContain('unknown key');
    expect(text).not.toContain(key);
    expect(text).not.toContain(key.slice(13));
    expect(text).not.toContain(never);
  });

  test('the role comes from the user on every call, not from the key', async () => {
    const check = verifierFor();
    const { key } = await store.create({ userId: 'u-alice', name: 'one' });
    expect((await check.verifyAccessToken(key)).scopes).toEqual(['mcp:read', 'mcp:write']);
    users.set('u-alice', user('u-alice', 'alice', 'readonly'));
    const info = await check.verifyAccessToken(key);
    expect(info.scopes).toEqual(['mcp:read']);
    expect(info.extra?.role).toBe('readonly');
  });

  test('an OAuth login token passes through the same user check', async () => {
    const oauthInfo = (userId?: string) => ({
      token: 'login-token-1', clientId: 'client-1', scopes: ['mcp:read'], expiresAt: Math.floor(T0 / 1000) + 3600, extra: { userId, username: 'stale-name' },
    });
    let reply: any = oauthInfo('u-rita');
    const oauth = { verifyAccessToken: jest.fn(async () => { if (reply instanceof Error) throw reply; return reply; }) };
    const check = verifierFor('mcp', oauth);

    const info = await check.verifyAccessToken('login-token-1');
    expect(info).toMatchObject({ clientId: 'client-1', scopes: ['mcp:read'], extra: { userId: 'u-rita', username: 'rita', role: 'readonly', kind: 'oauth' } });
    expect(info.extra?.keyId).toBeUndefined();

    // A login token of a deleted or disabled user, or with no user, is refused.
    users.delete('u-rita');
    await expect(check.verifyAccessToken('login-token-1')).rejects.toThrow(REFUSED_TEXT);
    users.set('u-rita', user('u-rita', 'rita', 'readonly', true));
    await expect(check.verifyAccessToken('login-token-1')).rejects.toThrow(REFUSED_TEXT);
    reply = oauthInfo(undefined);
    await expect(check.verifyAccessToken('login-token-1')).rejects.toThrow(REFUSED_TEXT);

    // The provider's own reason does not reach the client.
    reply = new InvalidTokenError('Access token has expired');
    const error = await check.verifyAccessToken('login-token-1').then(() => null, e => e);
    expect(error).toBeInstanceOf(InvalidTokenError);
    expect(error.message).toBe(REFUSED_TEXT);

    // A database failure is not a refusal.
    reply = new Error('database is down');
    await expect(check.verifyAccessToken('login-token-1')).rejects.toThrow('database is down');
    await expect(verifyCaller(check, 'login-token-1')).rejects.toThrow('database is down');

    // A user key never goes to the OAuth provider.
    oauth.verifyAccessToken.mockClear();
    await check.verifyAccessToken('axk_ffffffff_this-key-was-never-made-0123456789abcdefgh').catch(() => undefined);
    expect(oauth.verifyAccessToken).not.toHaveBeenCalled();
  });

  test('with OAuth off, only user keys pass', async () => {
    const check = verifierFor('mcp', undefined);
    await expect(check.verifyAccessToken('login-token-1')).rejects.toThrow(REFUSED_TEXT);
    const { key } = await store.create({ userId: 'u-alice', name: 'one' });
    expect(await verifyCaller(check, key, () => nowMs)).toMatchObject({ username: 'alice', kind: 'key' });
    expect(await verifyCaller(check, 'login-token-1', () => nowMs)).toBeNull();
  });

  describe('behind the SDK middleware (as on /mcp)', () => {
    let server: Server;
    let base: string;

    beforeEach(async () => {
      const app = express();
      // The real clock here: the SDK compares expiresAt with Date.now().
      store = new UserKeyStore(db, { log: line => { logs.push(line); } });
      const verifier = createBearerVerifier({
        keys: store, users: { getUserById: id => users.get(id) ?? null }, oauth: () => undefined, from: 'mcp', log: line => { logs.push(line); },
      });
      app.get('/mcp', requireBearerAuth({ verifier }), (req, res) => { res.json({ user: (req as any).auth.extra.username }); });
      await new Promise<void>(ok => { server = app.listen(0, '127.0.0.1', () => ok()); });
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
    });
    afterEach(async () => { await new Promise<void>(ok => server.close(() => ok())); });

    const get = async (token: string) => {
      const res = await fetch(base, { headers: { Authorization: `Bearer ${token}` } });
      return { status: res.status, body: await res.text(), header: res.headers.get('www-authenticate') ?? '' };
    };

    test('200 for a key with no expiry; 401 for wrong, revoked and expired keys and a disabled user', async () => {
      const good = await store.create({ userId: 'u-alice', name: 'no expiry' });
      const ok = await get(good.key);
      expect(ok.status).toBe(200);
      expect(JSON.parse(ok.body)).toEqual({ user: 'alice' });

      const revoked = await store.create({ userId: 'u-alice', name: 'revoked' });
      await store.revoke(revoked.row.id, 'u-alice', 'bob');
      const expired = await store.create({ userId: 'u-alice', name: 'expired', expiresAt: new Date(Date.now() - 1000) });
      const ofRita = await store.create({ userId: 'u-rita', name: 'rita' });
      users.set('u-rita', user('u-rita', 'rita', 'readonly', true));

      for (const key of ['axk_ffffffff_this-key-was-never-made-0123456789abcdefgh', revoked.key, expired.key, ofRita.key]) {
        const res = await get(key);
        expect(res.status).toBe(401);
        expect(JSON.parse(res.body)).toEqual({ error: 'invalid_token', error_description: REFUSED_TEXT });
        expect(res.body + res.header).not.toContain(key);
      }
    });
  });
});

describe('access record', () => {
  function fakeAuditDb() {
    const rows: AccessAuditRow[] = [];
    let id = 0;
    const db = {
      rows,
      fail: null as null | 'throw' | 'reject',
      at: () => new Date(T0),
      accessAuditEvent: {
        create: ({ data }: any) => {
          if (db.fail === 'throw') throw new Error('audit table is gone');
          if (db.fail === 'reject') return Promise.reject(new Error('audit table is locked'));
          rows.push({ id: ++id, at: db.at(), ...data });
          return Promise.resolve({});
        },
        findMany: async ({ take }: any) => [...rows].sort((a, b) => b.id - a.id).slice(0, take),
        deleteMany: async ({ where }: any) => {
          const gone = rows.filter(r => r.at.getTime() < where.at.lt.getTime());
          gone.forEach(r => rows.splice(rows.indexOf(r), 1));
          return { count: gone.length };
        },
      },
    };
    return db;
  }

  test('one row with the user and the key prefix; missing parts are null', async () => {
    const adb = fakeAuditDb();
    const audit = new AccessAudit(adb);
    audit.record({ source: 'ide', action: 'function.commit', status: 'ok', userId: 'u-alice', username: 'alice', keyId: 'key-1', keyPrefix: 'axk_0a1b2c3d', instance: 'demo', project: 'site', name: 'roundTo' });
    audit.record({ source: 'mcp', action: 'function.commit', status: 'error', username: 'anonymous' });
    await settle();
    expect(adb.rows).toEqual([
      { id: 1, at: new Date(T0), source: 'ide', action: 'function.commit', status: 'ok', userId: 'u-alice', username: 'alice', keyId: 'key-1', keyPrefix: 'axk_0a1b2c3d', instance: 'demo', project: 'site', name: 'roundTo' },
      { id: 2, at: new Date(T0), source: 'mcp', action: 'function.commit', status: 'error', userId: null, username: 'anonymous', keyId: null, keyPrefix: null, instance: null, project: null, name: null },
    ]);
  });

  test('record never throws and never waits; long texts are cut', async () => {
    const adb = fakeAuditDb();
    const lines: string[] = [];
    const audit = new AccessAudit(adb, line => { lines.push(line); });
    adb.fail = 'throw';
    expect(() => audit.record({ source: 'ide', action: 'projects.list', status: 'ok' })).not.toThrow();
    adb.fail = 'reject';
    expect(() => audit.record({ source: 'ide', action: 'projects.list', status: 'ok' })).not.toThrow();
    await settle();
    expect(lines).toHaveLength(2);
    expect(adb.rows).toEqual([]);

    adb.fail = null;
    audit.record({ source: 'ide', action: 'x'.repeat(500), status: 'ok', name: 'n'.repeat(500), keyPrefix: 'axk_0a1b2c3d_and-the-rest-of-a-key' });
    await settle();
    expect(adb.rows[0].action).toHaveLength(60);
    expect(adb.rows[0].name).toHaveLength(200);
    expect(adb.rows[0].keyPrefix).toHaveLength(20);
  });

  test('list is newest first with a limit from 1 to 500; purge deletes old rows', async () => {
    const adb = fakeAuditDb();
    const audit = new AccessAudit(adb);
    for (let i = 0; i < 5; i++) {
      adb.at = () => new Date(T0 + i * DAY);
      audit.record({ source: 'ide', action: `a${i}`, status: 'ok' });
      await settle();
    }
    expect((await audit.list(2)).map(r => r.action)).toEqual(['a4', 'a3']);
    expect(await audit.list(0)).toHaveLength(5);
    expect(await audit.list(100000)).toHaveLength(5);
    expect(await audit.purge(new Date(T0 + 2 * DAY))).toBe(2);
    expect((await audit.list()).map(r => r.action)).toEqual(['a4', 'a3', 'a2']);
  });
});

describe('cleanup job', () => {
  function fakeOAuthPrisma() {
    const none = async () => ({ count: 0 });
    return {
      authorizationCode: { deleteMany: none },
      accessToken: { deleteMany: none, findFirst: async () => null },
      refreshToken: { deleteMany: none },
      oAuthSession: { findMany: async () => [], delete: async () => ({}) },
    } as any;
  }

  test('old keys go after 90 days and old access records after 365 days', async () => {
    const keys = { purge: jest.fn(async (_before: Date) => 2) };
    const audit = { purge: jest.fn(async (_before: Date) => 3) };
    const before = Date.now();
    await new TokenCleanupJob(fakeOAuthPrisma(), { keys, audit }).cleanup();
    const after = Date.now();
    const keyCut = keys.purge.mock.calls[0][0].getTime();
    const auditCut = audit.purge.mock.calls[0][0].getTime();
    expect(KEY_KEEP_DAYS).toBe(90);
    expect(AUDIT_KEEP_DAYS).toBe(365);
    expect(keyCut).toBeGreaterThanOrEqual(before - 90 * DAY);
    expect(keyCut).toBeLessThanOrEqual(after - 90 * DAY);
    expect(auditCut).toBeGreaterThanOrEqual(before - 365 * DAY);
    expect(auditCut).toBeLessThanOrEqual(after - 365 * DAY);
  });

  test('a failed key cleanup does not stop the OAuth cleanup; the job works with no key store', async () => {
    const keys = { purge: jest.fn(async () => { throw new Error('no such table'); }) };
    const result = await new TokenCleanupJob(fakeOAuthPrisma(), { keys }).cleanup();
    expect(result).toMatchObject({ authCodesDeleted: 0, sessionsDeleted: 0 });
    await expect(new TokenCleanupJob(fakeOAuthPrisma()).cleanup()).resolves.toBeDefined();
  });
});
