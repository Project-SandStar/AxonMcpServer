/**
 * Admin routes for user access keys, the disabled switch, the access record
 * and the read-only guard. A real UserStore in a temp folder, the real key
 * store on an in-memory fake, no network past 127.0.0.1. All names are made up.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { UserStore } from '../admin/userStore.js';
import { basicAuthWithUserStore, requireAdmin } from '../admin/adminAuth.js';
import { createUserKeysRouter, createAccessRouter, readonlyGuard } from '../admin/userKeys.js';
import { UserKeyStore, type StoredKey } from '../auth/userKeys.js';
import { hashToken } from '../auth/tokenUtils.js';
import type { AccessAuditRow } from '../auth/accessAudit.js';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 5, 1);
const KEY_RE = /^axk_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/;
const PW = { admin: 'admin', bob: 'bob-password', alice: 'alice-password', rita: 'rita-password', carl: 'carl-password' };

function fakeDb() {
  const rows: StoredKey[] = [];
  let n = 0;
  return {
    rows,
    userApiKey: {
      create: async ({ data }: any) => {
        const row: StoredKey = { id: `key-${++n}`, createdAt: new Date(T0 + n * 1000), lastUsedAt: null, lastUsedFrom: null, revokedAt: null, revokedBy: null, ...data };
        rows.push(row);
        return { ...row };
      },
      findUnique: async ({ where }: any) => {
        const row = 'id' in where ? rows.find(r => r.id === where.id) : rows.find(r => r.tokenHash === where.tokenHash);
        return row ? { ...row } : null;
      },
      findMany: async ({ where }: any) =>
        rows.filter(r => !where?.userId || r.userId === where.userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map(r => ({ ...r })),
      update: async ({ where, data }: any) => Object.assign(rows.find(r => r.id === where.id)!, data),
      updateMany: async () => ({ count: 0 }),
      deleteMany: async () => ({ count: 0 }),
    },
  };
}

let tmp: string;
let users: UserStore;
let db: ReturnType<typeof fakeDb>;
let keys: UserKeyStore | undefined;
let auditRows: AccessAuditRow[];
let auditLimit: number | undefined;
let server: Server;
let base: string;
let logSpy: jest.SpyInstance;
let passwordCalls: string[];

type Who = keyof typeof PW;

async function call(method: string, url: string, body?: unknown, who: Who | null = 'admin', header?: string) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (header) headers.Authorization = header;
  else if (who) headers.Authorization = 'Basic ' + Buffer.from(`${who}:${PW[who]}`).toString('base64');
  const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, cache: res.headers.get('cache-control') };
}

beforeEach(async () => {
  logSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'axon-keys-'));
  users = new UserStore(tmp); // makes the default admin/admin
  users.createUser('bob', PW.bob, 'admin');
  users.createUser('alice', PW.alice, 'user');
  users.createUser('rita', PW.rita, 'readonly');
  users.createUser('carl', PW.carl, 'user');
  db = fakeDb();
  keys = new UserKeyStore(db, { now: () => T0, log: () => undefined });
  auditRows = [];
  auditLimit = undefined;
  passwordCalls = [];

  const opts = {
    userStore: users,
    requireAdmin,
    getKeys: () => keys,
    getAudit: () => ({ list: async (limit?: number) => { auditLimit = limit; return auditRows; } }),
    now: () => T0,
  };
  const app = express();
  app.use(express.json());
  const admin = express.Router();
  // The same order as src/admin/routes.ts
  admin.use(basicAuthWithUserStore(users));
  admin.use(readonlyGuard);
  admin.use('/users', createUserKeysRouter(opts));
  admin.use('/access', createAccessRouter(opts));
  // Stand-ins for the other admin routes
  admin.put('/users/:username/password', (req, res) => { passwordCalls.push(req.params.username); res.json({ success: true }); });
  admin.all('/other', (_req, res) => { res.json({ ok: true }); });
  app.use('/admin', admin);
  await new Promise<void>(ok => { server = app.listen(0, '127.0.0.1', () => ok()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/admin`;
});

afterEach(async () => {
  await new Promise<void>(ok => server.close(() => ok()));
  fs.rmSync(tmp, { recursive: true, force: true });
  logSpy.mockRestore();
});

const make = async (username: string, name = 'laptop IntelliJ', expiresInDays?: number | null) =>
  (await call('POST', `/users/${username}/keys`, expiresInDays === undefined ? { name } : { name, expiresInDays })).json;

describe('create a key', () => {
  test('201 with the key, once; the row has no key and no hash', async () => {
    const res = await call('POST', '/users/alice/keys', { name: '  laptop IntelliJ ', expiresInDays: 30 });
    expect(res.status).toBe(201);
    expect(res.cache).toBe('no-store');
    expect(res.json.key).toMatch(KEY_RE);
    const { key, ...row } = res.json;
    expect(row).toEqual({
      id: 'key-1', username: 'alice', name: 'laptop IntelliJ', prefix: key.slice(0, 12), createdAt: new Date(T0 + 1000).toISOString(),
      createdBy: 'admin', expiresAt: new Date(T0 + 30 * DAY).toISOString(), lastUsedAt: null, lastUsedFrom: null, revokedAt: null, status: 'active',
    });
    expect(res.text).not.toContain(hashToken(key));
    expect(db.rows[0].tokenHash).toBe(hashToken(key));

    // No later reply and no log line holds the key or the hash.
    const later = [
      await call('GET', '/users/alice/keys'),
      await call('GET', '/access/keys'),
      await call('DELETE', '/users/alice/keys/key-1'),
      await call('GET', '/users/alice/keys', undefined, 'alice'),
    ];
    const seen = later.map(r => r.text).join('\n') + JSON.stringify(logSpy.mock.calls);
    expect(later.map(r => r.status)).toEqual([200, 200, 200, 200]);
    expect(seen).toContain(key.slice(0, 12));
    expect(seen).not.toContain(key.slice(13));
    expect(seen).not.toContain(hashToken(key));
    expect(seen).not.toContain('tokenHash');
  });

  test('no expiry when expiresInDays is absent or null; the name in the path is not case sensitive', async () => {
    expect((await make('alice')).expiresAt).toBeNull();
    expect((await make('ALICE', 'two', null)).expiresAt).toBeNull();
    expect((await make('Alice', 'three', 3650)).expiresAt).toBe(new Date(T0 + 3650 * DAY).toISOString());
    expect(db.rows.map(r => r.userId)).toEqual(Array(3).fill(users.getUser('alice')!.id));
  });

  test('400 for a bad name or a bad expiry', async () => {
    for (const name of ['', '   ', 'x'.repeat(65), 5, null, undefined]) {
      const res = await call('POST', '/users/alice/keys', { name });
      expect(res.status).toBe(400);
      expect(res.json).toEqual({ error: 'name must be 1 to 64 characters' });
    }
    for (const expiresInDays of [0, -1, 3651, 1.5, '30', true]) {
      const res = await call('POST', '/users/alice/keys', { name: 'one', expiresInDays });
      expect(res.status).toBe(400);
      expect(res.json).toEqual({ error: 'expiresInDays must be a whole number from 1 to 3650, or null' });
    }
    expect((await call('POST', '/users/alice/keys', { name: 'x'.repeat(64), expiresInDays: 1 })).status).toBe(201);
    expect(db.rows).toHaveLength(1);
  });

  test('only an admin makes a key: 403 for a user, also for their own name', async () => {
    for (const who of ['alice', 'rita'] as const) {
      const res = await call('POST', `/users/${who}/keys`, { name: 'mine' }, who);
      expect(res.status).toBe(403);
    }
    expect((await call('POST', '/users/alice/keys', { name: 'mine' }, 'alice')).json).toEqual({ error: 'Admin access required' });
    expect((await call('POST', '/users/alice/keys', { name: 'by bob' }, 'bob')).json.createdBy).toBe('bob');
    expect(db.rows).toHaveLength(1);
  });

  test('404 for no such user, 409 for a disabled user, 503 when the store is not ready', async () => {
    expect(await call('POST', '/users/nobody/keys', { name: 'one' })).toMatchObject({ status: 404, json: { error: 'User not found' } });
    users.setDisabled('carl', true);
    expect(await call('POST', '/users/carl/keys', { name: 'one' })).toMatchObject({ status: 409, json: { error: 'User is disabled' } });
    keys = undefined;
    for (const [method, url] of [['POST', '/users/alice/keys'], ['GET', '/users/alice/keys'], ['DELETE', '/users/alice/keys/key-1'], ['GET', '/access/keys']]) {
      expect(await call(method, url, method === 'POST' ? { name: 'one' } : undefined)).toMatchObject({ status: 503, json: { error: 'Key store is not ready' } });
    }
  });
});

describe('list and revoke', () => {
  test('an admin lists any user; a user lists only their own; newest first with old keys', async () => {
    await make('alice', 'first');
    await make('alice', 'second');
    await make('carl', 'of carl');
    await call('DELETE', '/users/alice/keys/key-1');

    const mine = await call('GET', '/users/alice/keys', undefined, 'alice');
    expect(mine.status).toBe(200);
    expect(mine.cache).toBe('no-store');
    expect(mine.json.keys.map((k: any) => [k.name, k.status, k.username])).toEqual([['second', 'active', 'alice'], ['first', 'revoked', 'alice']]);
    expect((await call('GET', '/users/alice/keys', undefined, 'bob')).json.keys).toHaveLength(2);

    expect(await call('GET', '/users/carl/keys', undefined, 'alice')).toMatchObject({ status: 403, json: { error: 'Cannot list keys of other users' } });
    expect(await call('GET', '/users/nobody/keys', undefined, 'alice')).toMatchObject({ status: 403 });
    expect(await call('GET', '/users/nobody/keys')).toMatchObject({ status: 404, json: { error: 'User not found' } });
  });

  test('revoke: 200 also the second time; 404 for an id of another user; 403 for another user', async () => {
    await make('alice', 'of alice');
    await make('carl', 'of carl');

    expect(await call('DELETE', '/users/carl/keys/key-2', undefined, 'alice')).toMatchObject({ status: 403, json: { error: 'Cannot revoke keys of other users' } });
    expect(await call('DELETE', '/users/alice/keys/key-2', undefined, 'alice')).toMatchObject({ status: 404, json: { error: 'Key not found' } });
    expect(await call('DELETE', '/users/alice/keys/nope')).toMatchObject({ status: 404, json: { error: 'Key not found' } });
    expect(await call('DELETE', '/users/nobody/keys/key-1')).toMatchObject({ status: 404, json: { error: 'Key not found' } });
    expect(db.rows.every(r => r.revokedAt === null)).toBe(true);

    const own = await call('DELETE', '/users/alice/keys/key-1', undefined, 'alice');
    expect(own).toMatchObject({ status: 200, json: { success: true, key: { id: 'key-1', status: 'revoked', revokedAt: new Date(T0).toISOString() } } });
    expect(db.rows[0].revokedBy).toBe('alice');
    const again = await call('DELETE', '/users/alice/keys/key-1');
    expect(again).toMatchObject({ status: 200, json: { success: true, key: { status: 'revoked' } } });
    expect(db.rows[0].revokedBy).toBe('alice');
    expect(db.rows[1].revokedAt).toBeNull();
  });
});

describe('disable and enable a user', () => {
  test('a disabled user loses the dashboard at once and comes back when enabled', async () => {
    expect((await call('GET', '/users/alice/keys', undefined, 'alice')).status).toBe(200);
    const off = await call('PUT', '/users/Alice/disabled', { disabled: true });
    expect(off.status).toBe(200);
    expect(off.json.user).toMatchObject({ username: 'alice', disabled: true });
    expect(off.text).not.toContain('passwordHash');
    expect((await call('GET', '/users/alice/keys', undefined, 'alice')).status).toBe(401);
    expect(users.getUserById(users.getUser('alice')!.id)?.disabled).toBe(true);

    const on = await call('PUT', '/users/alice/disabled', { disabled: false });
    expect(on.json.user.disabled).toBe(false);
    expect((await call('GET', '/users/alice/keys', undefined, 'alice')).status).toBe(200);
  });

  test('400 for a bad body and for yourself; 404 for no such user; 403 for a user', async () => {
    for (const body of [{}, { disabled: 'true' }, { disabled: 1 }, { disabled: null }]) {
      expect(await call('PUT', '/users/alice/disabled', body)).toMatchObject({ status: 400, json: { error: 'disabled must be true or false' } });
    }
    expect(await call('PUT', '/users/admin/disabled', { disabled: true })).toMatchObject({ status: 400, json: { error: 'Cannot disable yourself' } });
    expect(await call('PUT', '/users/nobody/disabled', { disabled: true })).toMatchObject({ status: 404, json: { error: 'User not found' } });
    expect(await call('PUT', '/users/carl/disabled', { disabled: true }, 'alice')).toMatchObject({ status: 403, json: { error: 'Admin access required' } });
    expect(users.getUser('carl')?.disabled).toBe(false);
    // One admin can disable another admin while one working admin stays.
    expect((await call('PUT', '/users/bob/disabled', { disabled: true })).status).toBe(200);
  });
});

describe('all keys and the access record', () => {
  test('GET /access/keys: admin only; a key of a deleted user has no user name', async () => {
    await make('alice', 'of alice');
    await make('carl', 'of carl');
    users.deleteUser('carl');
    const res = await call('GET', '/access/keys');
    expect(res.status).toBe(200);
    expect(res.cache).toBe('no-store');
    expect(res.json.keys.map((k: any) => [k.name, k.username])).toEqual([['of carl', null], ['of alice', 'alice']]);
    expect(await call('GET', '/access/keys', undefined, 'alice')).toMatchObject({ status: 403, json: { error: 'Admin access required' } });
    expect((await call('GET', '/access/keys', undefined, 'rita')).status).toBe(403);
  });

  test('GET /access/audit: admin only; rows carry the user and the prefix, not the ids', async () => {
    auditRows = [{
      id: 7, at: new Date(T0), source: 'ide', action: 'function.commit', status: 'ok', userId: 'u-1', username: 'alice',
      keyId: 'key-1', keyPrefix: 'axk_0a1b2c3d', instance: 'demo', project: 'site', name: 'roundTo',
    }];
    const res = await call('GET', '/access/audit?limit=25');
    expect(res.status).toBe(200);
    expect(auditLimit).toBe(25);
    expect(res.json).toEqual({ events: [{
      id: 7, at: new Date(T0).toISOString(), source: 'ide', action: 'function.commit', status: 'ok', username: 'alice',
      keyPrefix: 'axk_0a1b2c3d', instance: 'demo', project: 'site', name: 'roundTo',
    }] });
    await call('GET', '/access/audit?limit=abc');
    expect(auditLimit).toBe(100);
    expect((await call('GET', '/access/audit', undefined, 'alice')).status).toBe(403);
  });
});

describe('the admin API and keys', () => {
  test('a user key never works on /admin: a Bearer header is a 401', async () => {
    const { key } = await make('bob', 'of an admin');
    for (const url of ['/users/bob/keys', '/access/keys', '/other']) {
      const res = await call('GET', url, undefined, null, `Bearer ${key}`);
      expect(res.status).toBe(401);
      expect(res.json).toEqual({ error: 'Authentication required' });
    }
    expect((await call('GET', '/other', undefined, null)).status).toBe(401);
    const asPassword = 'Basic ' + Buffer.from(`bob:${key}`).toString('base64');
    expect((await call('GET', '/other', undefined, null, asPassword)).status).toBe(401);
  });
});

describe('a read-only user on the admin API', () => {
  test('can read, cannot change', async () => {
    expect((await call('GET', '/other', undefined, 'rita')).status).toBe(200);
    expect((await call('GET', '/users/rita/keys', undefined, 'rita')).status).toBe(200);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await call(method, '/other', {}, 'rita');
      expect(res.status).toBe(403);
      expect(res.json).toEqual({ error: 'Your user is read-only' });
    }
    // The other roles are not touched by the guard.
    expect((await call('POST', '/other', {}, 'alice')).status).toBe(200);
    expect((await call('POST', '/other', {}, 'admin')).status).toBe(200);
  });

  test('own password and own key revoke stay open; those of another user do not', async () => {
    await make('rita', 'of rita');
    await make('alice', 'of alice');

    expect((await call('PUT', '/users/rita/password', { password: 'new-password' }, 'rita')).status).toBe(200);
    expect((await call('PUT', '/users/RITA/password/', { password: 'new-password' }, 'rita')).status).toBe(200);
    expect((await call('PUT', '/users/alice/password', { password: 'new-password' }, 'rita')).status).toBe(403);
    expect(passwordCalls.map(u => u.toLowerCase())).toEqual(['rita', 'rita']);

    expect((await call('DELETE', '/users/alice/keys/key-2', undefined, 'rita')).status).toBe(403);
    expect((await call('DELETE', '/users/rita/keys/key-1/more', undefined, 'rita')).status).toBe(403);
    expect((await call('PUT', '/users/rita/disabled', { disabled: false }, 'rita')).status).toBe(403);
    expect((await call('PUT', '/users/rita/role', { role: 'admin' }, 'rita')).status).toBe(403);
    expect((await call('POST', '/users/rita/keys', { name: 'mine' }, 'rita')).json).toEqual({ error: 'Your user is read-only' });
    expect(db.rows.every(r => r.revokedAt === null)).toBe(true);

    expect((await call('DELETE', '/users/rita/keys/key-1', undefined, 'rita')).status).toBe(200);
    expect(db.rows.map(r => r.revokedAt !== null)).toEqual([true, false]);
  });
});
