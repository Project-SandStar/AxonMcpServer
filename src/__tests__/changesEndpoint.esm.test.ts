/**
 * Incremental change hook (fileSystemSideCar Task 8.4).
 * Needs ESM (web-tree-sitter): run with `npm run test:esm`.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { createChangesRouter } from '../admin/changesRouter.js';
import type { ChangeQueue } from '../graph/changeQueue.js';
import type { Embedder, VectorSink } from '../graph/incrementalUpdater.js';

const TOKEN = 'test-token';
let tmp: string;
let projDir: string;
let prisma: any;
let server: Server;
let base: string;
let queue: ChangeQueue;
let projectId: number;
const vectors = new Map<string, Float32Array>();
let embedCalls: string[][] = [];

const embedder: Embedder = {
  async embed(texts) {
    embedCalls.push(texts);
    return texts.map(t => new Float32Array([t.length, 1, 2]));
  },
};
const sink: VectorSink = {
  async deleteNodes(ids) { ids.forEach(id => vectors.delete(id)); },
  async upsert(items) { items.forEach(i => vectors.set(i.nodeId, i.embedding)); return items.length; },
};

const FILES: Record<string, string> = {
  'alpha.axon': 'alpha: (x) => do\n  beta(x)\nend\n',
  'beta.axon': 'beta: (x) => do\n  gamma(x)\nend\n',
  'gamma.axon': 'gamma: (x) => do\n  x + 1\nend\n',
};

async function post(url: string, body: unknown, token: string | null = TOKEN) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(base + url, { method: 'POST', headers, body: JSON.stringify(body) });
}

async function nodesByFile() {
  const rows = await prisma.codeNode.findMany({ where: { projectId }, orderBy: { id: 'asc' } });
  const out: Record<string, any[]> = {};
  for (const r of rows) (out[path.basename(r.filePath)] ||= []).push(r);
  return out;
}

async function edgeKeys() {
  const rows = await prisma.codeEdge.findMany({ include: { source: true, target: true } });
  return rows.map((e: any) => `${e.source.name}->${e.target.name}:${e.edgeType}`).sort();
}

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'axon-changes-'));
  projDir = path.join(tmp, 'mirror', 'mac-test', 'BAS');
  fs.mkdirSync(projDir, { recursive: true });
  for (const [name, src] of Object.entries(FILES)) fs.writeFileSync(path.join(projDir, name), src);

  // Fresh SQLite with the repo migrations.
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

  const created = createChangesRouter({
    getPrisma: async () => prisma,
    token: () => TOKEN,
    config: () => ({ mirrorDir: path.join(tmp, 'mirror'), roots: [{ sidecar: 'mac-test', root: 'BAS', project: 'mirror/BAS' }] }),
    update: { embedder, vectors: sink },
  });
  queue = created.queue;
  const app = express();
  app.use(express.json());
  app.use('/admin/changes', created.router);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server?.close();
  await prisma?.$disconnect();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('POST /admin/changes', () => {
  test('bad or missing token -> 401', async () => {
    expect((await post('/admin/changes', { sidecar: 'mac-test', root: 'BAS', paths: ['a'] }, 'wrong')).status).toBe(401);
    expect((await post('/admin/changes', { sidecar: 'mac-test', root: 'BAS', paths: ['a'] }, null)).status).toBe(401);
  });

  test('unknown root -> 404, bad body -> 400', async () => {
    expect((await post('/admin/changes', { sidecar: 'mac-test', root: 'NOPE', paths: ['a'] })).status).toBe(404);
    expect((await post('/admin/changes', { sidecar: 'mac-test', root: 'BAS', paths: 'a' })).status).toBe(400);
  });

  test('first call creates the project and runs a full build', async () => {
    const res = await post('/admin/changes', { sidecar: 'mac-test', root: 'BAS', paths: ['alpha.axon'] });
    expect(res.status).toBe(202);
    const body = (await res.json()) as any;
    projectId = body.projectId;
    await queue.whenIdle(projectId);

    expect((queue.result(projectId) as any).mode).toBe('full');
    const byFile = await nodesByFile();
    expect(Object.keys(byFile).sort()).toEqual(['alpha.axon', 'beta.axon', 'gamma.axon']);
    expect(await edgeKeys()).toEqual(['alpha->beta:calls', 'beta->gamma:calls']);
    expect(vectors.size).toBe(3);
  });

  test('change one file: only that file\'s rows change', async () => {
    const before = await nodesByFile();
    const vecBefore = new Map(vectors);
    embedCalls = [];

    fs.writeFileSync(path.join(projDir, 'beta.axon'), '// Beta doc\nbeta: (x, y) => do\n  gamma(x)\n  alpha(y)\nend\n');
    const res = await post('/admin/changes', { sidecar: 'mac-test', root: 'BAS', paths: ['beta.axon', '../escape.axon'] });
    expect(res.status).toBe(202);
    await queue.whenIdle(projectId);

    const r = queue.result(projectId) as any;
    expect(r.mode).toBe('incremental');
    expect(r.ignoredPaths).toEqual(['../escape.axon']);
    expect(r.errors).toEqual([]);

    const after = await nodesByFile();
    // Unchanged files: same rows.
    expect(after['alpha.axon']).toEqual(before['alpha.axon']);
    expect(after['gamma.axon']).toEqual(before['gamma.axon']);
    // Changed file: new row.
    expect(after['beta.axon'][0].signature).toBe('beta(x, y)');
    expect(after['beta.axon'][0].id).not.toBe(before['beta.axon'][0].id);

    // Only beta was embedded; alpha/gamma vectors are the same objects.
    expect(embedCalls).toHaveLength(1);
    expect(embedCalls[0]).toHaveLength(1);
    expect(vectors.has(before['beta.axon'][0].id)).toBe(false);
    expect(vectors.has(after['beta.axon'][0].id)).toBe(true);
    expect(vectors.get(before['alpha.axon'][0].id)).toBe(vecBefore.get(before['alpha.axon'][0].id));

    // Incoming edge alpha->beta re-bound to the new node; new outgoing edge beta->alpha.
    expect(await edgeKeys()).toEqual(['alpha->beta:calls', 'beta->alpha:calls', 'beta->gamma:calls']);
  });

  test('delete a file: its rows go, nothing is added', async () => {
    const before = await nodesByFile();
    embedCalls = [];
    fs.unlinkSync(path.join(projDir, 'gamma.axon'));

    expect((await post(`/admin/changes/projects/${projectId}`, { paths: ['gamma.axon'] })).status).toBe(202);
    await queue.whenIdle(projectId);

    const r = queue.result(projectId) as any;
    expect(r.deletedFiles).toBe(1);
    expect(r.nodesAdded).toBe(0);
    const after = await nodesByFile();
    expect(after['gamma.axon']).toBeUndefined();
    expect(after['alpha.axon']).toEqual(before['alpha.axon']);
    expect(vectors.has(before['gamma.axon'][0].id)).toBe(false);
    expect(embedCalls).toHaveLength(0);
    expect(await edgeKeys()).toEqual(['alpha->beta:calls', 'beta->alpha:calls']);
    // beta's call to gamma is now unresolved; it binds again when gamma comes back.
    const refs = await prisma.unresolvedRef.findMany({ where: { projectId, referenceName: 'gamma' } });
    expect(refs).toHaveLength(1);

    fs.writeFileSync(path.join(projDir, 'gamma.axon'), FILES['gamma.axon']);
    await post('/admin/changes', { sidecar: 'mac-test', root: 'BAS', paths: ['gamma.axon'] });
    await queue.whenIdle(projectId);
    expect(await edgeKeys()).toEqual(['alpha->beta:calls', 'beta->alpha:calls', 'beta->gamma:calls']);
  });

  test('paths that arrive while a job runs are merged into one job', async () => {
    const seen: string[][] = [];
    const { ChangeQueue } = await import('../graph/changeQueue.js');
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    const q = new ChangeQueue(async (_id, paths) => { seen.push(paths.sort()); if (seen.length === 1) await gate; });
    q.enqueue(1, ['a']);
    q.enqueue(1, ['b']);
    q.enqueue(1, ['c', 'b']);
    expect(q.status(1)).toEqual({ projectId: 1, running: true, pending: 2 });
    release();
    await q.whenIdle(1);
    expect(seen).toEqual([['a'], ['b', 'c']]);
  });
});
