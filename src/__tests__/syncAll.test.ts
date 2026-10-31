/**
 * "Sync all" queue and routes.
 */
import express, { Request, Response, NextFunction } from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { SyncAllRunner, createSyncAllRouter, SyncTarget } from '../admin/syncAll.js';

const PROJECTS: SyncTarget[] = [
  { instance: 'a', project: 'p1' },
  { instance: 'a', project: 'p2' },
  { instance: 'b', project: 'p3' },
];

function deferred() {
  let resolve!: () => void;
  const p = new Promise<void>(r => { resolve = r; });
  return { p, resolve };
}

describe('SyncAllRunner', () => {
  test('runs one project at a time, in order, and keeps going after a failure', async () => {
    let active = 0;
    let maxActive = 0;
    const order: string[] = [];
    const runner = new SyncAllRunner(async (instance, project) => {
      active++; maxActive = Math.max(maxActive, active);
      order.push(`${instance}/${project}`);
      await new Promise(r => setTimeout(r, 5));
      active--;
      if (project === 'p2') throw new Error('server down');
      return { downloaded: 1, updated: 0, deleted: 0 };
    });
    expect(runner.start(PROJECTS, 'admin')).toBe(true);
    expect(runner.start(PROJECTS)).toBe(false); // already running
    await runner.whenDone();

    const s = runner.get();
    expect(maxActive).toBe(1);
    expect(order).toEqual(['a/p1', 'a/p2', 'b/p3']);
    expect(s).toMatchObject({ state: 'done', total: 3, completed: 3, failed: 1, current: null, startedBy: 'admin' });
    expect(s.items.map(i => i.state)).toEqual(['done', 'failed', 'done']);
    expect(s.items[1].error).toBe('server down');
    expect(s.finishedAt).toBeTruthy();
  });

  test('shows the current project and stops after it on cancel', async () => {
    const gate = deferred();
    const runner = new SyncAllRunner(async () => { await gate.p; return { downloaded: 0, updated: 0, deleted: 0 }; });
    runner.start(PROJECTS);
    await new Promise(r => setTimeout(r, 0));
    expect(runner.get().current).toEqual({ instance: 'a', project: 'p1' });
    expect(runner.get().items[0].state).toBe('running');

    expect(runner.cancel()).toBe(true);
    gate.resolve();
    await runner.whenDone();
    const s = runner.get();
    expect(s.state).toBe('cancelled');
    expect(s.completed).toBe(1);
    expect(s.items.map(i => i.state)).toEqual(['done', 'skipped', 'skipped']);
    expect(runner.cancel()).toBe(false);
  });

  test('drops duplicate projects', () => {
    const runner = new SyncAllRunner(async () => ({ downloaded: 0, updated: 0, deleted: 0 }));
    runner.start([...PROJECTS, PROJECTS[0]]);
    expect(runner.get().total).toBe(3);
  });
});

describe('sync-all routes', () => {
  let server: Server;
  let base: string;
  let gate = deferred();
  let list: SyncTarget[] = PROJECTS;
  const runner = new SyncAllRunner(async () => { await gate.p; return { downloaded: 2, updated: 1, deleted: 0 }; });

  beforeAll(async () => {
    const a = express();
    a.use((req: Request, _res: Response, next: NextFunction) => {
      (req as any).user = { username: String(req.headers['x-user'] || 'admin'), role: req.headers['x-role'] || 'admin' };
      next();
    });
    a.use('/admin/projects/sync-all', createSyncAllRouter({
      runner,
      listProjects: () => list,
      requireAdmin: (req, res, next) => ((req as any).user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin access required' })),
    }));
    await new Promise<void>(ok => { server = a.listen(0, () => ok()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/admin/projects/sync-all`;
  });
  afterAll(() => { server?.close(); });

  const call = async (method: string, url = '', role = 'admin') => {
    const res = await fetch(base + url, { method, headers: { 'X-Role': role } });
    return { status: res.status, json: await res.json() as any };
  };

  test('idle status before any run', async () => {
    const r = await call('GET');
    expect(r.status).toBe(200);
    expect(r.json.state).toBe('idle');
  });

  test('non-admin cannot start or cancel', async () => {
    expect((await call('POST', '', 'user')).status).toBe(403);
    expect((await call('POST', '/cancel', 'user')).status).toBe(403);
  });

  test('start -> 202, second start -> 409, status shows progress, cancel works', async () => {
    const start = await call('POST');
    expect(start.status).toBe(202);
    expect(start.json).toMatchObject({ state: 'running', total: 3, startedBy: 'admin' });
    expect((await call('POST')).status).toBe(409);

    const st = await call('GET');
    expect(st.json.current).toEqual({ instance: 'a', project: 'p1' });

    expect((await call('POST', '/cancel')).json.cancelRequested).toBe(true);
    gate.resolve();
    await runner.whenDone();
    const end = await call('GET');
    expect(end.json).toMatchObject({ state: 'cancelled', completed: 1 });
    expect(end.json.items[0].result).toEqual({ downloaded: 2, updated: 1, deleted: 0 });
    expect((await call('POST', '/cancel')).status).toBe(409);
  });

  test('a new run after the last one ended; empty list -> 400', async () => {
    gate = deferred(); gate.resolve();
    const again = await call('POST');
    expect(again.status).toBe(202);
    await runner.whenDone();
    expect((await call('GET')).json).toMatchObject({ state: 'done', completed: 3, failed: 0 });

    list = [];
    expect((await call('POST')).status).toBe(400);
  });
});
