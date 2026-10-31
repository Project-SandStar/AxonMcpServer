/**
 * "Sync all" for the Projects page.
 *
 *   POST /admin/projects/sync-all          start (admin). 409 when a run is going.
 *   GET  /admin/projects/sync-all          status of the current or last run
 *   POST /admin/projects/sync-all/cancel   stop after the current project (admin)
 *
 * Projects sync one after another (never in parallel), so the SkySpark servers
 * get one request stream at a time. The run lives in the server, so a page
 * reload only re-reads the status.
 */

import { Router, Request, Response, RequestHandler } from 'express';

export interface SyncTarget { instance: string; project: string }
export interface SyncCounts { downloaded: number; updated: number; deleted: number }

export interface SyncAllItem extends SyncTarget {
  state: 'waiting' | 'running' | 'done' | 'failed' | 'skipped';
  result?: SyncCounts;
  error?: string;
  durationMs?: number;
}

export interface SyncAllStatus {
  state: 'idle' | 'running' | 'done' | 'cancelled';
  total: number;
  /** Projects finished (done + failed). */
  completed: number;
  failed: number;
  current: SyncTarget | null;
  cancelRequested: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  startedBy: string | null;
  items: SyncAllItem[];
}

export class SyncAllRunner {
  private status: SyncAllStatus = SyncAllRunner.empty();
  private job: Promise<void> | null = null;

  constructor(private readonly sync: (instance: string, project: string) => Promise<SyncCounts>) {}

  private static empty(): SyncAllStatus {
    return {
      state: 'idle', total: 0, completed: 0, failed: 0, current: null, cancelRequested: false,
      startedAt: null, finishedAt: null, startedBy: null, items: [],
    };
  }

  isRunning(): boolean {
    return this.status.state === 'running';
  }

  get(): SyncAllStatus {
    return { ...this.status, current: this.status.current ? { ...this.status.current } : null, items: this.status.items.map(i => ({ ...i })) };
  }

  /** Starts a run. Returns false when one is already running. */
  start(targets: SyncTarget[], startedBy?: string): boolean {
    if (this.isRunning()) return false;
    const seen = new Set<string>();
    const items: SyncAllItem[] = [];
    for (const t of targets) {
      const key = `${t.instance}/${t.project}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ instance: t.instance, project: t.project, state: 'waiting' });
    }
    this.status = {
      ...SyncAllRunner.empty(),
      state: 'running', total: items.length, items,
      startedAt: new Date().toISOString(), startedBy: startedBy ?? null,
    };
    this.job = this.run();
    return true;
  }

  /** Asks the run to stop after the current project. */
  cancel(): boolean {
    if (!this.isRunning()) return false;
    this.status.cancelRequested = true;
    return true;
  }

  /** Resolves when the current run ends (for tests). */
  async whenDone(): Promise<void> {
    await this.job;
  }

  private async run(): Promise<void> {
    const s = this.status;
    for (const item of s.items) {
      if (s.cancelRequested) break;
      item.state = 'running';
      s.current = { instance: item.instance, project: item.project };
      const t0 = Date.now();
      try {
        item.result = await this.sync(item.instance, item.project);
        item.state = 'done';
      } catch (err) {
        item.state = 'failed';
        item.error = err instanceof Error ? err.message : String(err);
        s.failed++;
      }
      item.durationMs = Date.now() - t0;
      s.completed++;
    }
    for (const item of s.items) if (item.state === 'waiting') item.state = 'skipped';
    s.current = null;
    s.state = s.cancelRequested ? 'cancelled' : 'done';
    s.finishedAt = new Date().toISOString();
  }
}

export interface SyncAllRouterOptions {
  runner: SyncAllRunner;
  /** The projects listed on the Projects page. */
  listProjects: () => SyncTarget[];
  requireAdmin: RequestHandler;
}

export function createSyncAllRouter(opts: SyncAllRouterOptions): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    res.json(opts.runner.get());
  });

  router.post('/', opts.requireAdmin, (req: Request, res: Response) => {
    let targets: SyncTarget[];
    try {
      targets = opts.listProjects().map(p => ({ instance: p.instance, project: p.project }));
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
    if (targets.length === 0) return res.status(400).json({ error: 'No projects to sync' });
    if (!opts.runner.start(targets, req.user?.username)) {
      return res.status(409).json({ error: 'Sync all is already running', ...opts.runner.get() });
    }
    return res.status(202).json(opts.runner.get());
  });

  router.post('/cancel', opts.requireAdmin, (_req: Request, res: Response) => {
    if (!opts.runner.cancel()) return res.status(409).json({ error: 'Sync all is not running', ...opts.runner.get() });
    return res.json(opts.runner.get());
  });

  return router;
}
