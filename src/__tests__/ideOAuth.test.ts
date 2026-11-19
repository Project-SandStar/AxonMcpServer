/**
 * /api/ide with the real bearer check, as src/index.ts wires it: a user
 * access key or an OAuth login token, then the user. The OAuth token comes
 * from the real AxonOAuthProvider (login, then code exchange) on an in-memory
 * fake of the Prisma tables it uses. No network past 127.0.0.1, no database.
 * All names, keys and tokens here are made up.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { AxonOAuthProvider } from '../auth/oauthProvider.js';
import { UserStore } from '../admin/userStore.js';
import { UserKeyStore, type StoredKey } from '../auth/userKeys.js';
import { createBearerVerifier, verifyCaller } from '../auth/bearerVerifier.js';
import { createIdeRouter, type IdeAuditEvent } from '../ide/ideRouter.js';

const CLIENT = { client_id: 'client-test-1', redirect_uris: ['http://127.0.0.1/callback'] } as any;

/** The slice of PrismaClient that AxonOAuthProvider and UserKeyStore use. */
function fakePrisma() {
  const table = () => [] as any[];
  const t = { codes: table(), sessions: table(), access: table(), refresh: table(), keys: [] as StoredKey[] };
  const byKey = (rows: any[], field: string) => ({
    findUnique: async ({ where }: any) => { const r = rows.find(x => x[field] === where[field]); return r ? { ...r } : null; },
    create: async ({ data }: any) => { const r = { revokedAt: null, used: false, ...data }; rows.push(r); return { ...r }; },
    update: async ({ where, data }: any) => Object.assign(rows.find(x => x[field] === where[field]), data),
    delete: async ({ where }: any) => { rows.splice(rows.findIndex(x => x[field] === where[field]), 1); },
    updateMany: async ({ where, data }: any) => {
      const hit = rows.filter(x => Object.entries(where).every(([k, v]) => x[k] === v));
      hit.forEach(x => Object.assign(x, data));
      return { count: hit.length };
    },
    deleteMany: async ({ where }: any) => {
      const hit = rows.filter(x => Object.entries(where).every(([k, v]) => x[k] === v));
      hit.forEach(x => rows.splice(rows.indexOf(x), 1));
      return { count: hit.length };
    },
  });
  let n = 0;
  const db = {
    t,
    oAuthClient: { findUnique: async () => null },
    authorizationCode: byKey(t.codes, 'code'),
    oAuthSession: byKey(t.sessions, 'sessionId'),
    accessToken: byKey(t.access, 'token'),
    refreshToken: byKey(t.refresh, 'token'),
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
      findMany: async () => t.keys.map(r => ({ ...r })),
      update: async ({ where, data }: any) => Object.assign(t.keys.find(r => r.id === where.id)!, data),
      updateMany: async () => ({ count: 0 }),
      deleteMany: async () => ({ count: 0 }),
    },
  };
  return db;
}

let tmp: string;
let users: UserStore;
let db: ReturnType<typeof fakePrisma>;
let provider: AxonOAuthProvider;
let keys: UserKeyStore;
let oauthOn: boolean;
/** The clock that verifyCaller reads; the provider reads the real clock. */
let clockMs: number;
let audits: IdeAuditEvent[];
let logs: string[];
let server: Server;
let base: string;

async function loginToken(username: string, password: string): Promise<string> {
  const auth = await provider.processAuthorization(CLIENT.client_id, username, password, CLIENT.redirect_uris[0], 'challenge', 'mcp:read mcp:write');
  if (!auth.success) throw new Error(auth.error);
  const tokens = await provider.exchangeAuthorizationCode(CLIENT, auth.code);
  return tokens.access_token;
}

async function getProjects(token: string) {
  const res = await fetch(base + '/projects', { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text };
}

let logSpy: jest.SpyInstance;

beforeEach(async () => {
  logSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ide-oauth-'));
  users = new UserStore(tmp);
  users.createUser('alice', 'alice-password', 'user');
  users.createUser('rita', 'rita-password', 'readonly');
  db = fakePrisma();
  provider = new AxonOAuthProvider(db as any, users);
  keys = new UserKeyStore(db as any, { log: () => undefined });
  oauthOn = true;
  clockMs = Date.now();
  audits = [];
  logs = [];

  // The same wiring as src/index.ts.
  const ideVerifier = createBearerVerifier({
    keys, users, oauth: () => (oauthOn ? provider : undefined), from: 'ide', log: line => { logs.push(line); },
  });
  const app = express();
  app.use('/api/ide', createIdeRouter({
    verify: bearer => verifyCaller(ideVerifier, bearer, () => clockMs),
    audit: event => { audits.push(event); },
    store: { listStoredProjects: async () => [], readStoredFunctions: async () => null },
    configuredProjects: () => [{ instance: 'demo', project: 'site' }],
    sync: async () => { throw new Error('no sync in this test'); },
    commit: async () => { throw new Error('no commit in this test'); },
    log: line => { logs.push(line); },
  }));
  await new Promise<void>(ok => { server = app.listen(0, '127.0.0.1', () => ok()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ide`;
});

afterEach(async () => {
  await new Promise<void>(ok => server.close(() => ok()));
  fs.rmSync(tmp, { recursive: true, force: true });
  logSpy.mockRestore();
});

describe('an OAuth login token on /api/ide', () => {
  test('a token from the OAuth provider lists the projects, as its user', async () => {
    const token = await loginToken('alice', 'alice-password');
    expect(token.startsWith('axk_')).toBe(false);
    const res = await getProjects(token);
    expect(res.status).toBe(200);
    expect(res.json.projects.map((p: any) => `${p.instance}/${p.project}`)).toEqual(['demo/site']);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: 'projects.list', status: 'ok', caller: { username: 'alice', role: 'user' } });
    // A login token has no key id or prefix.
    expect(audits[0].caller.keyId).toBeUndefined();
    expect(audits[0].caller.keyPrefix).toBeUndefined();
  });

  test('the role comes from the user: a read-only user can list, not commit', async () => {
    const token = await loginToken('rita', 'rita-password');
    expect((await getProjects(token)).status).toBe(200);
    const post = await fetch(base + '/projects/demo/site/functions/f1', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{"src":"() => 1","expectedMod":null}',
    });
    expect(post.status).toBe(403);
  });

  test('401 for a revoked token, a token of a deleted or disabled user, and with OAuth off', async () => {
    const token = await loginToken('alice', 'alice-password');
    expect((await getProjects(token)).status).toBe(200);

    oauthOn = false;
    expect((await getProjects(token)).status).toBe(401);
    oauthOn = true;

    users.setDisabled('alice', true);
    expect((await getProjects(token)).status).toBe(401);
    users.setDisabled('alice', false);
    expect((await getProjects(token)).status).toBe(200);

    const alice = users.getUser('alice')!;
    await provider.revokeAllForUser(alice.id);
    const res = await getProjects(token);
    expect(res.status).toBe(401);
    expect(res.json).toEqual({ error: 'unauthorized' });

    const token2 = await loginToken('alice', 'alice-password');
    expect((await getProjects(token2)).status).toBe(200);
    users.deleteUser('alice');
    expect((await getProjects(token2)).status).toBe(401);
    // No refusal text names the token.
    expect(logs.join('\n')).not.toContain(token2);
  });

  test('expiry: the provider refuses a stored token past its time', async () => {
    const token = await loginToken('alice', 'alice-password');
    db.t.access.find(r => r.token === token).expiresAt = new Date(Date.now() - 1000);
    expect((await getProjects(token)).status).toBe(401);
    expect(logs.join('\n')).toContain('OAuth token: Access token has expired');
  });

  test('expiry: verifyCaller refuses when its clock is past expiresAt, even when the provider still accepts', async () => {
    const token = await loginToken('alice', 'alice-password');
    const expiresAtMs = db.t.access.find(r => r.token === token).expiresAt.getTime();
    clockMs = expiresAtMs - 1000;
    expect((await getProjects(token)).status).toBe(200);
    clockMs = expiresAtMs + 1000;
    expect((await getProjects(token)).status).toBe(401);
  });
});

describe('verifyCaller: the expiry branch', () => {
  const NOW = Date.UTC(2026, 5, 1);
  const info = (expiresAt: number | undefined): AuthInfo => ({
    token: 'login-token-1', clientId: 'client-test-1', scopes: ['mcp:read'], expiresAt,
    extra: { userId: 'u-alice', username: 'alice', role: 'user', kind: 'oauth' },
  });
  const stub = (reply: AuthInfo) => ({ verifyAccessToken: async () => reply });

  test('a future expiresAt passes; a past or missing one is null', async () => {
    const sec = Math.floor(NOW / 1000);
    expect(await verifyCaller(stub(info(sec + 60)), 'login-token-1', () => NOW)).toMatchObject({ username: 'alice', kind: 'oauth' });
    expect(await verifyCaller(stub(info(sec)), 'login-token-1', () => NOW)).not.toBeNull();
    expect(await verifyCaller(stub(info(sec - 1)), 'login-token-1', () => NOW)).toBeNull();
    expect(await verifyCaller(stub(info(undefined)), 'login-token-1', () => NOW)).toBeNull();
    expect(await verifyCaller(stub({ ...info(sec + 60), expiresAt: '9999999999' as any }), 'login-token-1', () => NOW)).toBeNull();
  });
});

describe('no shared token', () => {
  test('the old AXON_IDE_TOKEN value is refused (401), with OAuth on and off', async () => {
    const SHARED = 'old-shared-token-0123456789';
    const old = process.env.AXON_IDE_TOKEN;
    process.env.AXON_IDE_TOKEN = SHARED;
    try {
      for (const on of [true, false]) {
        oauthOn = on;
        const res = await getProjects(SHARED);
        expect(res.status).toBe(401);
        expect(res.json).toEqual({ error: 'unauthorized' });
      }
      expect(audits).toEqual([]);
      expect(logs.join('\n')).not.toContain(SHARED);
    } finally {
      if (old === undefined) delete process.env.AXON_IDE_TOKEN; else process.env.AXON_IDE_TOKEN = old;
    }
  });
});
