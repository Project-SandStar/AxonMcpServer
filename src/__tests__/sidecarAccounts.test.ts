/**
 * "Sidecar sync login" per user, with a fake receiver admin API.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import type { AddressInfo } from 'net';
import { UserStore } from '../admin/userStore.js';
import {
  createSidecarAccountsRouter, createUserSyncRouter, ReceiverAdminClient, linkReceiverAccounts, cleanRoots,
} from '../admin/sidecarAccounts.js';

const TOKEN = 'status-token-test';
const SYNC_PW = 'sync-password-123';

interface FakeAcc { username: string; roots: string[]; allowed_roots?: string[]; password: string; connected: boolean; last_login_ms: number | null }

let tmp: string;
let store: UserStore;
let fake: http.Server;
let app: http.Server;
let base: string;
let accounts: FakeAcc[];
let calls: string[];

function startFake(): Promise<string> {
  const f = express();
  f.use(express.json());
  f.use((req, res, next) => {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return res.status(401).send('bad token');
    calls.push(`${req.method} ${req.path}`);
    return next();
  });
  // Replies never carry passwords or hashes
  const pub = (a: FakeAcc) => ({ username: a.username, roots: a.roots, allowed_roots: a.allowed_roots ?? [], connected: a.connected, last_login_ms: a.last_login_ms });
  const known = () => [...new Set(['shared-root', ...accounts.flatMap(a => a.roots)])];
  f.get('/v1/accounts', (_req, res) => res.json({ accounts: accounts.map(pub), roots: known() }));
  f.post('/v1/accounts', (req, res) => {
    if (accounts.some(a => a.username === req.body.username)) return res.status(409).json({ error: 'exists' });
    if (req.body.roots !== undefined && (!Array.isArray(req.body.roots) || req.body.roots.length === 0)) return res.status(400).json({ error: 'bad roots' });
    accounts.push({ username: req.body.username, roots: [], allowed_roots: req.body.roots ?? [], password: req.body.password, connected: false, last_login_ms: null });
    return res.status(201).json({ ok: true });
  });
  f.put('/v1/accounts/:u/roots', (req, res) => {
    const a = accounts.find(x => x.username === req.params.u);
    if (!a) return res.status(404).json({ error: 'no such account' });
    if (!Array.isArray(req.body.roots)) return res.status(400).json({ error: 'bad root name' });
    a.allowed_roots = req.body.roots;
    return res.json({ accounts: accounts.map(pub), roots: known() });
  });
  f.put('/v1/accounts/:u/password', (req, res) => {
    const a = accounts.find(x => x.username === req.params.u);
    if (!a) return res.status(404).json({ error: 'no such account' });
    a.password = req.body.password;
    return res.json({ ok: true });
  });
  f.delete('/v1/accounts/:u', (req, res) => {
    if (accounts.length === 1 && accounts[0].username === req.params.u) return res.status(409).json({ error: 'cannot remove the last account' });
    const n = accounts.length;
    accounts = accounts.filter(x => x.username !== req.params.u);
    return n === accounts.length ? res.status(404).json({ error: 'no such account' }) : res.json({ ok: true });
  });
  return new Promise(resolve => {
    fake = f.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(fake.address() as AddressInfo).port}`));
  });
}

async function call(method: string, p: string, body?: unknown, role: 'admin' | 'user' = 'admin') {
  const res = await fetch(`${base}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Role': role },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text, data: text ? JSON.parse(text) : undefined };
}

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'axon-sync-'));
  store = new UserStore(tmp);
  const url = await startFake();
  const receiver = new ReceiverAdminClient({ url: () => url, token: () => TOKEN });
  const requireAdmin = (req: Request, res: Response, next: NextFunction) =>
    req.headers['x-role'] === 'admin' ? next() : res.status(403).json({ error: 'Admin access required' });
  const a = express();
  a.use(express.json());
  a.use('/admin/sidecar/accounts', createSidecarAccountsRouter({ userStore: store, requireAdmin, receiver }));
  a.use('/admin/users', createUserSyncRouter({ userStore: store, requireAdmin, receiver }));
  await new Promise<void>(resolve => { app = a.listen(0, '127.0.0.1', () => resolve()); });
  base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise(r => app.close(r));
  await new Promise(r => fake.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  calls = [];
  accounts = [{ username: 'mac-alper-axon', roots: ['proj', 'axon-docs'], allowed_roots: ['proj', 'axon-docs'], password: 'old-secret', connected: true, last_login_ms: 1761700000000 }];
});

test('cleanRoots accepts names and rejects paths', () => {
  expect(cleanRoots(['proj', ' proj ', 'docs'])).toEqual(['proj', 'docs']);
  expect(cleanRoots('a, b')).toEqual(['a', 'b']);
  expect(typeof cleanRoots(['a/b'])).toBe('string');
  expect(typeof cleanRoots(['..'])).toBe('string');
});

test('link makes a viewer user with dashboard login off and keeps the password', async () => {
  const r = await linkReceiverAccounts(store, new ReceiverAdminClient({ url: () => `http://127.0.0.1:${(fake.address() as AddressInfo).port}`, token: () => TOKEN }));
  expect(r.created).toEqual(['mac-alper-axon']);
  const u = store.getUser('mac-alper-axon')!;
  expect(u.role).toBe('user');
  expect(u.dashboardLogin).toBe(false);
  expect(u.sidecarSync).toMatchObject({ enabled: true, roots: ['proj', 'axon-docs'] });
  expect(accounts[0].password).toBe('old-secret');
  expect(calls.every(c => c.startsWith('GET'))).toBe(true);
  // A sync-only user can not log in to the dashboard
  expect(store.authenticate('mac-alper-axon', 'anything')).toBeNull();
  // Second run: already linked
  const again = await linkReceiverAccounts(store, new ReceiverAdminClient({ url: () => `http://127.0.0.1:${(fake.address() as AddressInfo).port}`, token: () => TOKEN }));
  expect(again.alreadyLinked).toEqual(['mac-alper-axon']);
});

test('link marks an existing user with the same name', async () => {
  store.createUser('bob', 'dash-pw', 'user');
  accounts.push({ username: 'bob', roots: [], password: 'bob-secret', connected: false, last_login_ms: null });
  const r = await linkReceiverAccounts(store, new ReceiverAdminClient({ url: () => `http://127.0.0.1:${(fake.address() as AddressInfo).port}`, token: () => TOKEN }));
  expect(r.linked).toContain('bob');
  expect(store.getUser('bob')!.dashboardLogin).toBe(true);
  expect(store.authenticate('bob', 'dash-pw')).not.toBeNull();
});

test('account list is read-only, shows linked users, has no secrets', async () => {
  const r = await call('GET', '/admin/sidecar/accounts', undefined, 'user');
  expect(r.status).toBe(200);
  expect(r.data.configured).toBe(true);
  expect(r.data.accounts[0]).toMatchObject({ username: 'mac-alper-axon', user: 'mac-alper-axon', connected: true });
  expect(r.text).not.toContain('old-secret');
  expect(r.text).not.toContain('argon2');
  expect((await call('POST', '/admin/sidecar/accounts/link', undefined, 'user')).status).toBe(403);
});

test('turn on a sync login: adds the receiver account; password never returned or stored', async () => {
  store.createUser('carol', 'dash-pw', 'user');
  expect((await call('PUT', '/admin/users/carol/sidecar-sync', { enabled: true })).status).toBe(400); // no password
  expect((await call('PUT', '/admin/users/carol/sidecar-sync', { enabled: true, password: 'short' })).status).toBe(400);
  expect((await call('PUT', '/admin/users/carol/sidecar-sync', { enabled: true, password: SYNC_PW }, 'user')).status).toBe(403);

  const r = await call('PUT', '/admin/users/carol/sidecar-sync', { enabled: true, password: SYNC_PW, roots: ['proj'] });
  expect(r.status).toBe(200);
  expect(r.text).not.toContain(SYNC_PW);
  expect(r.data.user.sidecarSync).toMatchObject({ enabled: true, roots: ['proj'] });
  expect(accounts.find(a => a.username === 'carol')).toMatchObject({ password: SYNC_PW });
  expect(fs.readFileSync(path.join(tmp, 'users.json'), 'utf-8')).not.toContain(SYNC_PW);
});

test('change roots only keeps the password (app-side roots); new password sets it', async () => {
  store.createUser('dave', 'dash-pw', 'user');
  await call('PUT', '/admin/users/dave/sidecar-sync', { enabled: true, password: SYNC_PW });
  calls = [];
  await call('PUT', '/admin/users/dave/sidecar-sync', { enabled: true, roots: ['a', 'b'] });
  expect(calls).not.toContain('PUT /v1/accounts/dave/password');
  expect(store.getUser('dave')!.sidecarSync!.roots).toEqual(['a', 'b']);
  expect(accounts.find(a => a.username === 'dave')).toMatchObject({ password: SYNC_PW });
  await call('PUT', '/admin/users/dave/sidecar-sync', { enabled: true, password: 'another-pass-9' });
  expect(accounts.find(a => a.username === 'dave')!.password).toBe('another-pass-9');
});

test('allowed roots go to the receiver: POST with roots, PUT roots on change, no call when unchanged', async () => {
  store.createUser('frank', 'dash-pw', 'user');
  // Add with roots: the POST carries them
  await call('PUT', '/admin/users/frank/sidecar-sync', { enabled: true, password: SYNC_PW, roots: ['proj'] });
  expect(calls).toEqual(['GET /v1/accounts', 'POST /v1/accounts']);
  expect(accounts.find(a => a.username === 'frank')!.allowed_roots).toEqual(['proj']);

  // Same roots, other order: no roots call, no password call
  store.setSidecarSync('frank', { enabled: true, roots: ['proj', 'docs'] });
  accounts.find(a => a.username === 'frank')!.allowed_roots = ['docs', 'proj'];
  calls = [];
  await call('PUT', '/admin/users/frank/sidecar-sync', { enabled: true, roots: ['proj', 'docs'] });
  expect(calls).toEqual(['GET /v1/accounts']);

  // Changed roots: PUT roots only, password kept
  calls = [];
  const r = await call('PUT', '/admin/users/frank/sidecar-sync', { enabled: true, roots: ['docs'] });
  expect(r.status).toBe(200);
  expect(calls).toEqual(['GET /v1/accounts', 'PUT /v1/accounts/frank/roots']);
  expect(accounts.find(a => a.username === 'frank')).toMatchObject({ allowed_roots: ['docs'], password: SYNC_PW });

  // Empty = all roots
  calls = [];
  await call('PUT', '/admin/users/frank/sidecar-sync', { enabled: true, roots: [] });
  expect(calls).toContain('PUT /v1/accounts/frank/roots');
  expect(accounts.find(a => a.username === 'frank')!.allowed_roots).toEqual([]);

  // Add without roots: POST has no roots field (= all)
  store.createUser('gina', 'dash-pw', 'user');
  await call('PUT', '/admin/users/gina/sidecar-sync', { enabled: true, password: SYNC_PW });
  expect(accounts.find(a => a.username === 'gina')!.allowed_roots).toEqual([]);

  // Other accounts are not touched
  expect(calls.filter(c => c.includes('mac-alper-axon'))).toEqual([]);

  // The page gets the receiver's root names
  const list = await call('GET', '/admin/sidecar/accounts');
  expect(list.data.roots).toEqual(expect.arrayContaining(['shared-root', 'proj', 'axon-docs']));
});

test('turn off and remove take the receiver account away', async () => {
  store.createUser('erin', 'dash-pw', 'user');
  await call('PUT', '/admin/users/erin/sidecar-sync', { enabled: true, password: SYNC_PW });
  const off = await call('PUT', '/admin/users/erin/sidecar-sync', { enabled: false });
  expect(off.data.user.sidecarSync.enabled).toBe(false);
  expect(accounts.some(a => a.username === 'erin')).toBe(false);

  await call('PUT', '/admin/users/erin/sidecar-sync', { enabled: true, password: SYNC_PW });
  const del = await call('DELETE', '/admin/users/erin/sidecar-sync');
  expect(del.status).toBe(200);
  expect(del.data.user.sidecarSync).toBeUndefined();
  expect(accounts.some(a => a.username === 'erin')).toBe(false);
});

test('receiver not set up and receiver down give clear replies', async () => {
  const off = new ReceiverAdminClient({ url: () => undefined, token: () => undefined });
  expect(off.configured()).toBe(false);
  await expect(off.list()).rejects.toThrow('Receiver not set up');
  const down = new ReceiverAdminClient({ url: () => 'http://127.0.0.1:1', token: () => TOKEN, timeoutMs: 1000 });
  await expect(down.list()).rejects.toThrow(/not reachable|did not reply/);
});

test('receiver refusal (last account) comes back as an error and keeps the user', async () => {
  accounts = [{ username: 'solo', roots: [], password: 'x-secret-1', connected: false, last_login_ms: null }];
  store.createUser('solo', 'dash-pw', 'user');
  store.setSidecarSync('solo', { enabled: true, roots: [] });
  const r = await call('DELETE', '/admin/users/solo/sidecar-sync');
  expect(r.status).toBe(409);
  expect(r.data.error).toContain('last account');
  expect(store.getUser('solo')!.sidecarSync!.enabled).toBe(true);
});

test('last admin who can log in can not lose dashboard login', () => {
  expect(store.setDashboardLogin('admin', false)).toBe(false);
  expect(store.getUser('admin')!.dashboardLogin).toBe(true);
});
