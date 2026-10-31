/**
 * "Sidecar sync" admin API with a fake receiver.
 * Needs ESM (web-tree-sitter): run with `npm run test:esm`.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { createChangesRouter, loadChangesConfig } from '../admin/changesRouter.js';
import { createSidecarSyncRouter, ReceiverStatusClient, RECEIVER_NOT_SET_UP, rootRole } from '../admin/sidecarSync.js';
import type { ChangeQueue } from '../graph/changeQueue.js';
import type { Embedder, VectorSink } from '../graph/incrementalUpdater.js';

const HOOK_TOKEN = 'hook-secret-123';
const RECV_TOKEN = 'recv-secret-456';

let tmp: string;
let cfgFile: string;
let projDir: string;
let prisma: any;
let app: Server;
let base: string;
let fake: Server;
let fakeUrl: string;
let queue: ChangeQueue;
let docsDir: string;
let libDir: string;
let reindexCalls = 0;
const vectors = new Map<string, Float32Array>();
const oldEnv = process.env.AXON_CHANGES_CONFIG;

// Fake receiver state
let fakeMode: 'ok' | 'fail' | 'slow' = 'ok';
let fakeAuth: string | undefined;

const FEED = {
  version: '0.1.0',
  uptime_s: 3600,
  sidecars: [
    {
      id: 'mac-test', connected: true, last_seen_ms: 1761700000000,
      roots: [
        { name: 'BAS', target: 'axon', company: null, files: 3, bytes: 300, last_path: 'alpha.axon', last_change_ms: 1761700000000, hook: { ok: true, last_ms: 1761700000000, error: null } },
        { name: 'mcpfantom', target: 'fantom', company: null, files: 10, bytes: 999, last_path: 'x.fan', last_change_ms: 1, hook: null },
        { name: 'proj', target: '/mirror/proj', company: null, files: 1, bytes: 5, last_path: 'p.axon', last_change_ms: 1, hook: null },
      ],
    },
    { id: 'win-qb', connected: false, last_seen_ms: 1, roots: [{ name: 'pdfs', target: 'quickbooks', company: 'ACME' }] },
  ],
  recent: [
    { ts_ms: 3, sidecar: 'mac-test', root: 'BAS', path: 'alpha.axon', op: 'write', size: 10 },
    { ts_ms: 2, sidecar: 'mac-test', root: 'mcpfantom', path: 'x.fan', op: 'write', size: 10 },
    { ts_ms: 1, sidecar: 'win-qb', root: 'pdfs', path: 'a.pdf', op: 'write', size: 10 },
  ],
  errors: [
    { ts_ms: 2, sidecar: 'mac-test', root: 'BAS', message: 'hash mismatch' },
    { ts_ms: 1, sidecar: 'win-qb', root: 'pdfs', message: 'other' },
  ],
};

const embedder: Embedder = { async embed(texts) { return texts.map(t => new Float32Array([t.length])); } };
const sink: VectorSink = {
  async deleteNodes(ids) { ids.forEach(id => vectors.delete(id)); },
  async upsert(items) { items.forEach(i => vectors.set(i.nodeId, i.embedding)); return items.length; },
};

function listen(a: express.Express): Promise<[Server, string]> {
  return new Promise(resolve => {
    const s = a.listen(0, () => resolve([s, `http://127.0.0.1:${(s.address() as AddressInfo).port}`]));
  });
}

async function call(method: string, url: string, body?: unknown, role: 'admin' | 'user' = 'admin') {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Role': role },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text, json: text ? JSON.parse(text) : null };
}

async function hook(body: unknown) {
  return fetch(base + '/admin/changes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${HOOK_TOKEN}` },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'axon-sidecar-'));
  cfgFile = path.join(tmp, 'config', 'axon-changes.json');
  process.env.AXON_CHANGES_CONFIG = cfgFile;
  projDir = path.join(tmp, 'mirror', 'mac-test', 'BAS');
  fs.mkdirSync(projDir, { recursive: true });
  fs.writeFileSync(path.join(projDir, 'alpha.axon'), 'alpha: (x) => do\n  beta(x)\nend\n');
  fs.writeFileSync(path.join(projDir, 'beta.axon'), 'beta: (x) => do\n  x + 1\nend\n');
  docsDir = path.join(tmp, 'mirror', 'lib', 'docs');
  libDir = path.join(tmp, 'mirror', 'lib', 'axon-library');
  fs.mkdirSync(path.join(docsDir, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(docsDir, 'a.html'), '<html></html>');
  fs.writeFileSync(path.join(docsDir, 'sub', 'b.html'), '<html></html>');
  fs.mkdirSync(libDir, { recursive: true });
  fs.writeFileSync(path.join(libDir, 'lib.axon'), 'x: () => 1\n');

  const Database = (await import('better-sqlite3')).default;
  const dbPath = path.join(tmp, 'usage.db');
  const db = new Database(dbPath);
  const migDir = path.resolve('prisma/migrations');
  for (const dir of fs.readdirSync(migDir).filter(d => /^\d/.test(d)).sort()) {
    db.exec(fs.readFileSync(path.join(migDir, dir, 'migration.sql'), 'utf-8'));
  }
  db.close();
  const { PrismaClient } = await import('../generated/prisma/index.js');
  const { PrismaBetterSqlite3 } = await import('@prisma/adapter-better-sqlite3');
  prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${dbPath}` }) });
  await prisma.$connect();

  // Fake receiver
  const r = express();
  r.get('/v1/status', async (req: Request, res: Response) => {
    fakeAuth = req.headers.authorization;
    if (req.headers.authorization !== `Bearer ${RECV_TOKEN}`) return res.status(401).json({ error: 'no' });
    if (fakeMode === 'fail') return res.status(500).json({ error: 'boom' });
    if (fakeMode === 'slow') await new Promise(ok => setTimeout(ok, 500));
    return res.json(FEED);
  });
  [fake, fakeUrl] = await listen(r);

  // App: same wiring as createAdminRouter, with a header-based role check.
  const created = createChangesRouter({
    getPrisma: async () => prisma,
    token: () => HOOK_TOKEN,
    config: () => loadChangesConfig(path.join(tmp, 'config')),
    update: { embedder, vectors: sink },
  });
  queue = created.queue;
  const a = express();
  a.use(express.json());
  a.use('/admin/changes', created.router);
  a.use('/admin/sidecar', createSidecarSyncRouter({
    configDir: path.join(tmp, 'config'),
    getPrisma: async () => prisma,
    queue,
    requireAdmin: (req: Request, res: Response, next: NextFunction) =>
      req.headers['x-role'] === 'admin' ? next() : res.status(403).json({ error: 'Admin access required' }),
    changesToken: () => HOOK_TOKEN,
    receiver: new ReceiverStatusClient({ url: () => fakeUrl, token: () => RECV_TOKEN, timeoutMs: 200 }),
    axon: () => ({ docsPath: docsDir, codePath: libDir, projDir: path.join(tmp, 'proj'), docsStats: () => ({ totalDocuments: 7, totalSections: 20 }) }),
    reindexDocs: async () => { reindexCalls++; },
  }));
  [app, base] = await listen(a);
});

afterAll(async () => {
  app?.close();
  fake?.close();
  await prisma?.$disconnect();
  if (oldEnv === undefined) delete process.env.AXON_CHANGES_CONFIG;
  else process.env.AXON_CHANGES_CONFIG = oldEnv;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('links', () => {
  test('empty list, settings show set / not set and no tokens', async () => {
    const r = await call('GET', '/admin/sidecar/links');
    expect(r.status).toBe(200);
    expect(r.json.links).toEqual([]);
    expect(r.json.settings).toEqual({ changesToken: 'set', receiverUrl: fakeUrl, receiverToken: 'set' });
    expect(r.text).not.toContain(HOOK_TOKEN);
    expect(r.text).not.toContain(RECV_TOKEN);
  });

  test('bad body -> 400, non-admin -> 403', async () => {
    expect((await call('POST', '/admin/sidecar/links', { root: '../x', project: 'p' })).status).toBe(400);
    expect((await call('POST', '/admin/sidecar/links', { root: 'BAS' })).status).toBe(400);
    expect((await call('POST', '/admin/sidecar/links', { root: 'BAS', project: 'p', path: 'rel/x' })).status).toBe(400);
    expect((await call('POST', '/admin/sidecar/links', { root: 'BAS', project: 'p' }, 'user')).status).toBe(403);
  });

  test('a new link is saved and the hook uses it without a restart', async () => {
    // Not mapped yet
    expect((await hook({ sidecar: 'mac-test', root: 'BAS', paths: ['alpha.axon'] })).status).toBe(404);

    const add = await call('POST', '/admin/sidecar/links', { sidecar: 'mac-test', root: 'BAS', project: 'mirror/BAS', path: projDir });
    expect(add.status).toBe(201);
    expect(JSON.parse(fs.readFileSync(cfgFile, 'utf-8')).roots).toEqual([
      { sidecar: 'mac-test', root: 'BAS', project: 'mirror/BAS', path: projDir },
    ]);
    expect((await call('POST', '/admin/sidecar/links', { sidecar: 'mac-test', root: 'BAS', project: 'other' })).status).toBe(409);

    const res = await hook({ sidecar: 'mac-test', root: 'BAS', paths: ['alpha.axon'] });
    expect(res.status).toBe(202);
    const { projectId } = (await res.json()) as any;
    await queue.whenIdle(projectId);

    const list = await call('GET', '/admin/sidecar/links');
    const link = list.json.links[0];
    expect(link.projectId).toBe(projectId);
    expect(link.projectName).toBe('mirror/BAS');
    expect(link.nodeCount).toBe(2);
    expect(link.lastIndexed).toBeTruthy();
    expect(link.queue).toMatchObject({ running: false, pending: 0, fullPending: false });
    expect(link.queue.lastFinishedAt).toBeTruthy();
    expect(link.lastResult.mode).toBe('full');
  });

  test('edit and remove a link', async () => {
    const edit = await call('PUT', '/admin/sidecar/links/0', { root: 'BAS', project: 'mirror/BAS', path: projDir });
    expect(edit.status).toBe(200);
    expect(JSON.parse(fs.readFileSync(cfgFile, 'utf-8')).roots[0].sidecar).toBeUndefined();
    expect((await call('PUT', '/admin/sidecar/links/5', { root: 'BAS', project: 'p' })).status).toBe(404);

    expect((await call('POST', '/admin/sidecar/links', { root: 'TMP', project: 'tmp' })).status).toBe(201);
    expect((await call('DELETE', '/admin/sidecar/links/1', undefined, 'user')).status).toBe(403);
    const del = await call('DELETE', '/admin/sidecar/links/1');
    expect(del.status).toBe(200);
    expect(del.json.removed.root).toBe('TMP');
    expect(JSON.parse(fs.readFileSync(cfgFile, 'utf-8')).roots).toHaveLength(1);
  });
});

describe('root roles', () => {
  test('docs and library roots show their role, file count and use; no project fields', async () => {
    expect((await call('POST', '/admin/sidecar/links', { sidecar: 'mac-test', root: 'axon-docs', kind: 'docs', path: docsDir })).status).toBe(201);
    expect((await call('POST', '/admin/sidecar/links', { sidecar: 'mac-test', root: 'axon-library', kind: 'library', path: libDir })).status).toBe(201);
    const r = await call('GET', '/admin/sidecar/links');
    expect(r.text).not.toContain('undefined');
    const docs = r.json.links.find((l: any) => l.root === 'axon-docs');
    const lib = r.json.links.find((l: any) => l.root === 'axon-library');
    const proj = r.json.links.find((l: any) => l.root === 'BAS');
    expect(docs).toMatchObject({ role: 'docs', roleLabel: 'Docs', configKey: 'docsPath', localFiles: 2, canRebuild: true, kindMismatch: false, projectId: null, queue: null });
    expect(docs.project).toBeUndefined();
    expect(docs.usedFor).toContain('7 pages');
    expect(lib).toMatchObject({ role: 'library', roleLabel: 'Library', configKey: 'codePath', localFiles: 1, canRebuild: false });
    expect(proj).toMatchObject({ role: 'project', roleLabel: 'Projects', kind: 'project', localFiles: null, canRebuild: true });

    // Re-index: docs only
    const di = r.json.links.indexOf(docs);
    expect((await call('POST', `/admin/sidecar/links/${di}/reindex`, {}, 'user')).status).toBe(403);
    expect((await call('POST', `/admin/sidecar/links/${di}/reindex`, {})).status).toBe(202);
    expect(reindexCalls).toBe(1);
    expect((await call('POST', `/admin/sidecar/links/${r.json.links.indexOf(lib)}/reindex`, {})).status).toBe(400);
    expect((await call('POST', '/admin/sidecar/links/99/reindex', {})).status).toBe(404);

    // Clean up so later tests see one link
    await call('DELETE', `/admin/sidecar/links/${r.json.links.indexOf(lib)}`);
    await call('DELETE', `/admin/sidecar/links/${di}`);
    expect(JSON.parse(fs.readFileSync(cfgFile, 'utf-8')).roots).toHaveLength(1);
  });

  test('Axon config wins over the kind in the root map', () => {
    const axon = { docsPath: '/m/lib/docs', codePath: '/m/lib/axon-library', projDir: '/app/proj' };
    expect(rootRole({ root: 'x', project: 'p', path: '/m/lib/docs' }, '/m/lib/docs', axon)).toEqual({ role: 'docs', configKey: 'docsPath' });
    expect(rootRole({ root: 'x', kind: 'library', path: '/m/lib/axon-library' }, '/m/lib/axon-library', axon)).toEqual({ role: 'library', configKey: 'codePath' });
    expect(rootRole({ root: 'proj', project: 'mirror/proj', path: '/app/proj' }, '/app/proj', axon)).toEqual({ role: 'project', configKey: 'proj' });
    expect(rootRole({ root: 'BAS', project: 'p' }, '/m/x/BAS', axon)).toEqual({ role: 'project', configKey: null });
  });
});

describe('rebuild', () => {
  test('runs a full build for one project', async () => {
    const project = await prisma.axonProject.findUnique({ where: { name: 'mirror/BAS' } });
    // Incremental first, so the last result is "incremental".
    await hook({ root: 'BAS', paths: ['beta.axon'] });
    await queue.whenIdle(project.id);
    expect((queue.result(project.id) as any).mode).toBe('incremental');

    fs.writeFileSync(path.join(projDir, 'gamma.axon'), 'gamma: (x) => do\n  x\nend\n');
    expect((await call('POST', `/admin/sidecar/projects/${project.id}/rebuild`, {}, 'user')).status).toBe(403);
    expect((await call('POST', '/admin/sidecar/projects/9999/rebuild', {})).status).toBe(404);
    const r = await call('POST', `/admin/sidecar/projects/${project.id}/rebuild`, {});
    expect(r.status).toBe(202);
    await queue.whenIdle(project.id);
    expect((queue.result(project.id) as any).mode).toBe('full');
    expect(await prisma.codeNode.count({ where: { projectId: project.id } })).toBe(3);
    expect(vectors.size).toBe(3);
  });
});

describe('receiver status', () => {
  test('filters to target "axon"', async () => {
    fakeMode = 'ok';
    const r = await call('GET', '/admin/sidecar/status');
    expect(fakeAuth).toBe(`Bearer ${RECV_TOKEN}`);
    expect(r.json.ok).toBe(true);
    expect(r.json.stale).toBe(false);
    expect(r.json.data.sidecars).toHaveLength(1);
    expect(r.json.data.sidecars[0].roots.map((x: any) => x.name)).toEqual(['BAS', 'proj']);
    expect(r.json.data.recent.map((e: any) => e.path)).toEqual(['alpha.axon']);
    expect(r.json.data.errors.map((e: any) => e.message)).toEqual(['hash mismatch']);
    expect(r.text).not.toContain(RECV_TOKEN);
  });

  test('on failure keeps the last good result and shows the error', async () => {
    fakeMode = 'fail';
    const r = await call('GET', '/admin/sidecar/status');
    expect(r.json.ok).toBe(false);
    expect(r.json.error).toContain('500');
    expect(r.json.stale).toBe(true);
    expect(r.json.data.sidecars[0].id).toBe('mac-test');
  });

  test('time limit', async () => {
    fakeMode = 'slow';
    const r = await call('GET', '/admin/sidecar/status');
    expect(r.json.ok).toBe(false);
    expect(r.json.error).toMatch(/did not reply/);
    expect(r.json.stale).toBe(true);
    fakeMode = 'ok';
  });

  test('no settings -> "Receiver not set up"', async () => {
    const c = new ReceiverStatusClient({ url: () => undefined, token: () => RECV_TOKEN });
    expect(await c.get()).toEqual({ configured: false, ok: false, message: RECEIVER_NOT_SET_UP });
    const d = new ReceiverStatusClient({ url: () => fakeUrl, token: () => undefined });
    expect((await d.get()).message).toBe(RECEIVER_NOT_SET_UP);
    expect(d.settings()).toEqual({ receiverUrl: fakeUrl, receiverToken: 'not set' });
  });
});
