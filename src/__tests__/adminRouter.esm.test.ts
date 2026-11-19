/**
 * The real admin router (createAdminRouter in src/admin/routes.ts), mounted
 * as src/index.ts mounts it: the guard order, the delete of a user (its keys
 * and OAuth logins stop), the admin-only routes for a user and a read-only
 * user, and the connection files and settings (they hold passwords). Fakes stand in for Prisma; no network past 127.0.0.1.
 * Needs ESM (routes.ts loads config.ts, which reads import.meta): run with
 * `npm run test:esm`. All names, keys and tokens here are made up.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { jest } from '@jest/globals';
import { createAdminRouter, maskSecrets } from '../admin/routes.js';
import { getUserStore } from '../admin/userStore.js';
import { getUsageStore } from '../usage/usageStore.js';
import { AxonOAuthProvider } from '../auth/oauthProvider.js';
import { UserKeyStore, type StoredKey } from '../auth/userKeys.js';
import { createBearerVerifier, verifyCaller } from '../auth/bearerVerifier.js';

const PW: Record<string, string> = {
  admin: 'admin', alice: 'alice-password', rita: 'rita-password', carl: 'carl-password',
};
const CLIENT = { client_id: 'client-test-1', redirect_uris: ['http://127.0.0.1/callback'] } as any;

/** Rows whose fields equal every entry of `where`. */
const matching = (rows: any[], where: Record<string, unknown> = {}) =>
  rows.filter(x => Object.entries(where).every(([k, v]) => x[k] === v));

/** The slice of PrismaClient that AxonOAuthProvider and UserKeyStore use. */
function fakePrisma() {
  const t = { codes: [] as any[], sessions: [] as any[], access: [] as any[], refresh: [] as any[], keys: [] as StoredKey[] };
  const table = (rows: any[], field: string) => ({
    findUnique: async ({ where }: any) => { const r = rows.find(x => x[field] === where[field]); return r ? { ...r } : null; },
    create: async ({ data }: any) => { const r = { revokedAt: null, used: false, ...data }; rows.push(r); return { ...r }; },
    update: async ({ where, data }: any) => Object.assign(rows.find(x => x[field] === where[field]), data),
    delete: async ({ where }: any) => { rows.splice(rows.findIndex(x => x[field] === where[field]), 1); },
    updateMany: async ({ where, data }: any) => { const hit = matching(rows, where); hit.forEach(x => Object.assign(x, data)); return { count: hit.length }; },
    deleteMany: async ({ where }: any) => { const hit = matching(rows, where); hit.forEach(x => rows.splice(rows.indexOf(x), 1)); return { count: hit.length }; },
  });
  let n = 0;
  return {
    t,
    oAuthClient: { findUnique: async () => null },
    authorizationCode: table(t.codes, 'code'),
    oAuthSession: table(t.sessions, 'sessionId'),
    accessToken: table(t.access, 'token'),
    refreshToken: table(t.refresh, 'token'),
    userApiKey: {
      create: async ({ data }: any) => {
        const row: StoredKey = { id: `key-${++n}`, createdAt: new Date(), lastUsedAt: null, lastUsedFrom: null, revokedAt: null, revokedBy: null, ...data };
        t.keys.push(row);
        return { ...row };
      },
      findUnique: async ({ where }: any) => {
        const row = 'id' in where ? t.keys.find(r => r.id === where.id) : t.keys.find(r => r.tokenHash === where.tokenHash);
        return row ? { ...row } : null;
      },
      findMany: async ({ where }: any = {}) => matching(t.keys, where).map(r => ({ ...r })),
      update: async ({ where, data }: any) => Object.assign(t.keys.find(r => r.id === where.id)!, data),
      updateMany: async ({ where, data }: any) => { const hit = matching(t.keys, where); hit.forEach(x => Object.assign(x, data)); return { count: hit.length }; },
      deleteMany: async () => ({ count: 0 }),
    },
  };
}

const ENV = ['SIDECAR_RECEIVER_URL', 'SIDECAR_RECEIVER_TOKEN', 'AXON_CHANGES_TOKEN'];
const oldEnv: Record<string, string | undefined> = {};
let tmp: string;
let server: Server;
let base: string;
let db: ReturnType<typeof fakePrisma>;
let provider: AxonOAuthProvider;
let keys: UserKeyStore;
let logSpy: ReturnType<typeof jest.spyOn>;
/** Calls of the context reloadConfig (PUT /config, DELETE /config, POST /config/reload, PUT /settings). */
let reloads = 0;

const notUsed = () => { throw new Error('not used in this test'); };

beforeAll(async () => {
  logSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  for (const k of ENV) { oldEnv[k] = process.env[k]; delete process.env[k]; }
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-router-'));
  // The router takes the usage store singleton; make it here, in the temp folder.
  getUsageStore(tmp);

  db = fakePrisma();
  const configDir = path.join(tmp, 'config');
  fs.mkdirSync(configDir);
  const router = createAdminRouter({
    getServerStatus: notUsed, getInstances: () => [], getInstance: () => undefined, getProjects: () => [],
    getCacheInfo: () => [], clearCache: notUsed, triggerSync: notUsed, reauthenticateProject: notUsed,
    triggerDiscover: notUsed, triggerDiscoverWithProgress: notUsed, getLogBuffer: () => [],
    getPrimaryProject: () => null, setPrimaryProject: notUsed,
    configDir, cacheDir: path.join(tmp, 'cache'),
    getOAuthProvider: () => provider,
    getUserKeys: () => keys,
    reloadConfig: () => { reloads++; },
  });
  // The router made the user store (the default admin/admin) in configDir.
  const users = getUserStore()!;
  users.createUser('alice', PW.alice, 'user');
  users.createUser('rita', PW.rita, 'readonly');
  users.createUser('carl', PW.carl, 'user');
  provider = new AxonOAuthProvider(db as any, users);
  keys = new UserKeyStore(db as any, { log: () => undefined });

  // As in src/index.ts: the global body parser, then /admin.
  const app = express();
  app.use(express.json());
  app.use('/admin', router);
  await new Promise<void>(ok => { server = app.listen(0, '127.0.0.1', () => ok()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/admin`;
});

afterAll(async () => {
  await new Promise<void>(ok => server.close(() => ok()));
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const k of ENV) { if (oldEnv[k] === undefined) delete process.env[k]; else process.env[k] = oldEnv[k]; }
  logSpy.mockRestore();
});

async function call(method: string, url: string, who: string | null, body?: unknown, header?: string) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (header) headers.Authorization = header;
  else if (who) headers.Authorization = 'Basic ' + Buffer.from(`${who}:${PW[who]}`).toString('base64');
  const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, auth: res.headers.get('www-authenticate') };
}

async function loginToken(username: string): Promise<string> {
  const auth = await provider.processAuthorization(CLIENT.client_id, username, PW[username], CLIENT.redirect_uris[0], 'challenge', 'mcp:read mcp:write');
  if (!auth.success) throw new Error(auth.error);
  return (await provider.exchangeAuthorizationCode(CLIENT, auth.code)).access_token;
}

/** Routes that only an admin may call. ":u" is a user that exists. */
const ADMIN_ONLY: Array<[string, string, unknown?]> = [
  ['GET', '/users'],
  ['POST', '/users', { username: 'mallory', password: 'mallory-password', role: 'admin' }],
  ['PUT', '/users/:u/role', { role: 'admin' }],
  ['DELETE', '/users/:u'],
  ['POST', '/users/:u/keys', { name: 'sneaky' }],
  ['PUT', '/users/:u/disabled', { disabled: true }],
  ['GET', '/access/keys'],
  ['GET', '/access/audit'],
  ['GET', '/oauth/sessions'],
  ['DELETE', '/oauth/sessions/some-session'],
  ['GET', '/oauth/clients'],
  ['GET', '/backups'],
  ['POST', '/backups', {}],
  ['POST', '/usage/clear'],
  ['GET', '/keys'],
  ['GET', '/config/demo-conn.json'],
  ['PUT', '/config/demo-conn.json', { content: { name: 'demo-conn', password: 'x-password' } }],
  ['DELETE', '/config/demo-conn.json'],
  ['POST', '/config/reload'],
  ['PUT', '/settings', { server: { port: 1 } }],
];

describe('guard order', () => {
  test('Basic auth runs first: no or wrong credentials give 401 with the Basic challenge, before any role check', async () => {
    for (const [method, url, body] of ADMIN_ONLY) {
      const none = await call(method, url.replace(':u', 'carl'), null, body);
      expect([method, url, none.status]).toEqual([method, url, 401]);
      expect(none.auth).toBe('Basic realm="Axon MCP Admin"');
    }
    const wrong = await call('GET', '/users', null, undefined, 'Basic ' + Buffer.from('admin:wrong').toString('base64'));
    expect(wrong.status).toBe(401);
  });

  test('a user access key or an OAuth login token never works on /admin', async () => {
    const made = await call('POST', '/users/alice/keys', 'admin', { name: 'laptop IntelliJ' });
    expect(made.status).toBe(201);
    const token = await loginToken('alice');
    for (const bearer of [made.json.key, token]) {
      const res = await call('GET', '/users/me', null, undefined, `Bearer ${bearer}`);
      expect(res.status).toBe(401);
      expect(res.auth).toBe('Basic realm="Axon MCP Admin"');
    }
  });

  test('the change hook is mounted before Basic auth: it answers with its own bearer rule', async () => {
    const res = await call('POST', '/changes', null, {});
    expect(res.status).toBe(503);
    expect(res.json.error).toContain('AXON_CHANGES_TOKEN');
    expect(res.auth).toBeNull();
  });

  test('the read-only guard runs before requireAdmin; own password stays open', async () => {
    expect((await call('POST', '/users', 'rita', { username: 'x-user', password: 'x-password' })).json).toEqual({ error: 'Your user is read-only' });
    expect((await call('GET', '/users', 'rita')).json).toEqual({ error: 'Admin access required' });
    expect((await call('POST', '/users', 'alice', { username: 'x-user', password: 'x-password' })).json).toEqual({ error: 'Admin access required' });
    expect((await call('GET', '/users/me', 'rita')).status).toBe(200);
    expect((await call('PUT', '/users/rita/password', 'rita', { password: PW.rita })).status).toBe(200);
    expect((await call('PUT', '/users/alice/password', 'rita', { password: 'x-password' })).status).toBe(403);
  });
});

describe('admin-only routes', () => {
  test('a user and a read-only user are refused (403), and nothing changes', async () => {
    // A Basic login sets lastLogin; every other field must stay the same.
    const usersNow = () => getUserStore()!.getAllUsers().map(({ lastLogin: _l, ...rest }) => rest);
    const usersBefore = usersNow();
    const keysBefore = db.t.keys.length;
    for (const who of ['alice', 'rita']) {
      for (const [method, url, body] of ADMIN_ONLY) {
        const res = await call(method, url.replace(':u', 'carl'), who, body);
        const want = who === 'rita' && method !== 'GET' ? 'Your user is read-only' : 'Admin access required';
        expect([who, method, url, res.status, res.json?.error]).toEqual([who, method, url, 403, want]);
      }
    }
    expect(usersNow()).toEqual(usersBefore);
    expect(db.t.keys.length).toBe(keysBefore);
    expect(getUserStore()!.getUser('mallory')).toBeNull();
  });

  test('an admin passes the same guards', async () => {
    expect((await call('GET', '/users', 'admin')).status).toBe(200);
    expect((await call('GET', '/access/keys', 'admin')).status).toBe(200);
  });
});

describe('config files: only a plain file name in the config folder', () => {
  test('a name that leaves the folder is refused, and nothing is written outside', async () => {
    const outside = path.join(tmp, 'escape.json');
    for (const name of ['..%2Fescape.json', '..%5Cescape.json', '.hidden.json', '%2E%2E%2Fescape.json']) {
      expect([name, (await call('PUT', `/config/${name}`, 'admin', { content: { a: 1 } })).status]).toEqual([name, 400]);
      expect([name, (await call('GET', `/config/${name}`, 'admin')).status]).toEqual([name, 404]);
      expect([name, (await call('DELETE', `/config/${name}`, 'admin')).status]).toEqual([name, 400]);
    }
    expect(fs.existsSync(outside)).toBe(false);
  });

  test('users.json (password hashes) is not listed, read, written or deleted through /config', async () => {
    const usersFile = path.join(tmp, 'config', 'users.json');
    // A Basic login sets lastLogin; every other field must stay the same.
    const usersNow = () => JSON.parse(fs.readFileSync(usersFile, 'utf-8')).users.map(({ lastLogin: _l, ...rest }: any) => rest);
    const before = usersNow();
    const list = await call('GET', '/config', 'admin');
    expect(list.json.map((f: any) => f.name)).not.toContain('users.json');
    for (const name of ['users.json', 'USERS.json']) {
      expect((await call('GET', `/config/${name}`, 'admin')).status).toBe(404);
      expect((await call('PUT', `/config/${name}`, 'admin', { content: { users: [] } })).status).toBe(400);
      expect((await call('DELETE', `/config/${name}`, 'admin')).status).toBe(400);
    }
    expect(usersNow()).toEqual(before);
    expect(before.length).toBeGreaterThan(0);
  });

  test('a plain connection file still works', async () => {
    expect((await call('PUT', '/config/demo-site.json', 'admin', { content: { name: 'demo' } })).status).toBe(200);
    expect((await call('GET', '/config/demo-site.json', 'admin')).json.content).toEqual({ name: 'demo' });
    expect((await call('DELETE', '/config/demo-site.json', 'admin')).status).toBe(200);
    expect(fs.existsSync(path.join(tmp, 'config', 'demo-site.json'))).toBe(false);
  });
});

describe('connection files and settings: admin only', () => {
  // Made-up secrets: no response to a user or a read-only user may hold them.
  const CONN_PW = 'made-up-conn-secret';
  const FALLBACK_PW = 'made-up-fallback-secret';
  const connFile = () => path.join(tmp, 'config', 'demo-conn.json');
  const settingsFile = () => path.join(tmp, 'config', 'axonMcpServer-config.json');
  const settings = {
    skyspark: { autoDiscover: true, fallback: { host: '127.0.0.1', username: 'demo-user', password: FALLBACK_PW } },
    server: { port: 3999 },
    auth: { accessTokenTtl: 3600 },
  };

  beforeAll(async () => {
    const res = await call('PUT', '/config/demo-conn.json', 'admin', {
      content: { name: 'demo-conn', host: '127.0.0.1', username: 'demo-user', password: CONN_PW },
    });
    expect(res.status).toBe(200);
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
  });

  test('a user and a read-only user cannot read, write, delete or reload; nothing changes', async () => {
    const connBefore = fs.readFileSync(connFile(), 'utf-8');
    const settingsBefore = fs.readFileSync(settingsFile(), 'utf-8');
    const reloadsBefore = reloads;
    const calls: Array<[string, string, unknown?]> = [
      ['GET', '/config/demo-conn.json'],
      ['PUT', '/config/demo-conn.json', { content: { name: 'demo-conn', password: 'x-password' } }],
      ['PUT', '/config/new-conn.json', { content: { name: 'new-conn' } }],
      ['DELETE', '/config/demo-conn.json'],
      ['POST', '/config/reload'],
      ['PUT', '/settings', { server: { port: 1 } }],
    ];
    for (const who of ['alice', 'rita']) {
      for (const [method, url, body] of calls) {
        const res = await call(method, url, who, body);
        expect([who, method, url, res.status]).toEqual([who, method, url, 403]);
        expect(JSON.stringify(res.json)).not.toContain(CONN_PW);
      }
    }
    expect(fs.readFileSync(connFile(), 'utf-8')).toBe(connBefore);
    expect(fs.readFileSync(settingsFile(), 'utf-8')).toBe(settingsBefore);
    expect(fs.existsSync(path.join(tmp, 'config', 'new-conn.json'))).toBe(false);
    expect(reloads).toBe(reloadsBefore);
  });

  test('the list of connection files stays open: names only, no content', async () => {
    for (const who of ['alice', 'rita']) {
      const res = await call('GET', '/config', who);
      expect(res.status).toBe(200);
      expect(res.json.map((f: any) => f.name)).toContain('demo-conn.json');
      expect(JSON.stringify(res.json)).not.toContain(CONN_PW);
    }
  });

  test('a user and a read-only user read the settings with every secret masked', async () => {
    for (const who of ['alice', 'rita']) {
      const res = await call('GET', '/settings', who);
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.json)).not.toContain(FALLBACK_PW);
      expect(res.json.skyspark.fallback).toEqual({ host: '127.0.0.1', username: 'demo-user', password: '********' });
      expect(res.json.server).toEqual({ port: 3999 });
      expect(res.json.auth).toEqual({ accessTokenTtl: 3600 });
    }
    expect((await call('GET', '/settings', 'admin')).json).toEqual(settings);
  });

  test('an admin reads, writes, reloads and deletes', async () => {
    const reloadsBefore = reloads;
    const read = await call('GET', '/config/demo-conn.json', 'admin');
    expect(read.status).toBe(200);
    expect(read.json.content.password).toBe(CONN_PW);

    const content = { name: 'demo-conn', host: '127.0.0.1', username: 'demo-user', password: 'made-up-new-secret' };
    expect((await call('PUT', '/config/demo-conn.json', 'admin', { content })).status).toBe(200);
    expect(JSON.parse(fs.readFileSync(connFile(), 'utf-8'))).toEqual(content);

    expect((await call('POST', '/config/reload', 'admin')).status).toBe(200);

    const next = { ...settings, server: { port: 4001 } };
    expect((await call('PUT', '/settings', 'admin', next)).status).toBe(200);
    expect(JSON.parse(fs.readFileSync(settingsFile(), 'utf-8'))).toEqual(next);

    expect((await call('DELETE', '/config/demo-conn.json', 'admin')).status).toBe(200);
    expect(fs.existsSync(connFile())).toBe(false);
    expect(reloads).toBe(reloadsBefore + 4);
  });
});

describe('maskSecrets', () => {
  test('text in a list or an object below a secret key is masked; numbers and other keys stay', () => {
    const value = {
      auth: { accessTokenTtl: 3600, refreshTokenTtl: 7200 },
      search: { minTokenLength: 2 },
      apiKeys: ['made-up-key-1', 'made-up-key-2'],
      credentials: { user: 'demo-user', value: 'made-up-nested-secret' },
      fallback: { username: 'demo-user', password: 'made-up-pw', pwd: 'made-up-pwd' },
    };
    const masked = maskSecrets(value) as any;
    expect(JSON.stringify(masked)).not.toMatch(/made-up/);
    expect(masked.auth).toEqual({ accessTokenTtl: 3600, refreshTokenTtl: 7200 });
    expect(masked.search).toEqual({ minTokenLength: 2 });
    expect(masked.apiKeys).toEqual(['********', '********']);
    expect(masked.fallback).toEqual({ username: 'demo-user', password: '********', pwd: '********' });
    expect(value.fallback.password).toBe('made-up-pw');
  });
});

describe('delete a user', () => {
  test('the keys and OAuth logins of the user are revoked; other users keep theirs', async () => {
    const users = getUserStore()!;
    const carlId = users.getUser('carl')!.id;
    const aliceId = users.getUser('alice')!.id;
    const carlKey = (await call('POST', '/users/carl/keys', 'admin', { name: 'carl laptop' })).json;
    const aliceKey = (await call('POST', '/users/alice/keys', 'admin', { name: 'alice desktop' })).json;
    const carlToken = await loginToken('carl');
    const aliceToken = await loginToken('alice');

    const check = createBearerVerifier({ keys, users, oauth: () => provider, from: 'ide', log: () => undefined });
    for (const bearer of [carlKey.key, carlToken, aliceKey.key, aliceToken]) {
      expect(await verifyCaller(check, bearer)).not.toBeNull();
    }
    expect(matching(db.t.sessions, { userId: carlId })).toHaveLength(1);

    // Not by a user or a read-only user.
    expect((await call('DELETE', '/users/carl', 'alice')).status).toBe(403);
    expect((await call('DELETE', '/users/carl', 'rita')).status).toBe(403);
    expect(users.getUser('carl')).not.toBeNull();

    const res = await call('DELETE', '/users/carl', 'admin');
    expect(res.status).toBe(200);
    expect(users.getUser('carl')).toBeNull();

    // The rows: carl's key, access and refresh tokens are revoked, the session is gone.
    const carlRow = db.t.keys.find(r => r.id === carlKey.id)!;
    expect(carlRow.revokedAt).toBeInstanceOf(Date);
    expect(carlRow.revokedBy).toBe('admin');
    expect(matching(db.t.access, { userId: carlId }).every(r => r.revokedAt instanceof Date)).toBe(true);
    expect(matching(db.t.refresh, { userId: carlId }).every(r => r.revokedAt instanceof Date)).toBe(true);
    expect(matching(db.t.access, { userId: carlId })).toHaveLength(1);
    expect(matching(db.t.sessions, { userId: carlId })).toEqual([]);

    // Alice keeps her key and login.
    expect(db.t.keys.find(r => r.id === aliceKey.id)!.revokedAt).toBeNull();
    expect(matching(db.t.access, { userId: aliceId }).some(r => r.revokedAt === null)).toBe(true);
    expect(matching(db.t.sessions, { userId: aliceId }).length).toBeGreaterThan(0);

    for (const bearer of [carlKey.key, carlToken]) expect(await verifyCaller(check, bearer)).toBeNull();
    for (const bearer of [aliceKey.key, aliceToken]) expect(await verifyCaller(check, bearer)).not.toBeNull();
  });
});
