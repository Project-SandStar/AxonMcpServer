/**
 * "Sidecar sync" admin API (fileSystemSideCar docs/admin-screens.md, Axon row).
 *
 * Mounted under /admin/sidecar, behind the admin Basic Auth.
 *
 *   GET    /admin/sidecar/links              links + queue + last update + settings ("set" / "not set")
 *   POST   /admin/sidecar/links              add a link     body {sidecar?, root, project, path?}   (admin)
 *   PUT    /admin/sidecar/links/:index       edit a link    same body                              (admin)
 *   DELETE /admin/sidecar/links/:index       remove a link                                          (admin)
 *   POST   /admin/sidecar/projects/:id/rebuild  full rebuild (graph + embeddings) in the change queue (admin)
 *   GET    /admin/sidecar/status             receiver GET /v1/status, filtered to target "axon"
 *
 * Links are saved to config/axon-changes.json (or AXON_CHANGES_CONFIG). The change
 * hook reads that file on each call, so a saved link applies without a restart.
 *
 * Receiver feed: SIDECAR_RECEIVER_URL + SIDECAR_RECEIVER_TOKEN, 5 s time limit.
 * On failure the route returns the last good result and the error.
 * Tokens are never returned; only "set" or "not set".
 */

import { Router, Request, Response, RequestHandler } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import type { PrismaClient } from '../generated/prisma/index.js';
import type { ChangeQueue } from '../graph/changeQueue.js';
import type { ChangesConfig, RootMapEntry } from './changesRouter.js';

export const RECEIVER_NOT_SET_UP = 'Receiver not set up';
const TARGET = 'axon';

// ============================================
// Root map file
// ============================================

export function changesConfigFile(configDir: string): string {
  return process.env.AXON_CHANGES_CONFIG || path.join(configDir, 'axon-changes.json');
}

export function readChangesFile(file: string): ChangesConfig {
  try {
    const cfg = JSON.parse(fs.readFileSync(file, 'utf-8')) as ChangesConfig;
    return { mirrorDir: cfg.mirrorDir, roots: Array.isArray(cfg.roots) ? cfg.roots : [] };
  } catch {
    return { roots: [] };
  }
}

export function writeChangesFile(file: string, cfg: ChangesConfig): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const out: ChangesConfig = { ...(cfg.mirrorDir ? { mirrorDir: cfg.mirrorDir } : {}), roots: cfg.roots };
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(out, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

const NAME_RE = /^[^/\\]+$/;

/** Checks a link body. Returns the clean entry or an error message. */
export function validateLink(body: unknown): RootMapEntry | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  const root = str(b.root);
  if (!root || !NAME_RE.test(root) || root === '.' || root === '..') return '"root" must be a folder name (no "/" or "\\")';

  const sidecar = str(b.sidecar);
  if (sidecar && (!NAME_RE.test(sidecar) || sidecar === '.' || sidecar === '..')) return '"sidecar" must be a sidecar id (no "/" or "\\")';

  const kind = str(b.kind) || 'project';
  if (kind !== 'project' && kind !== 'docs' && kind !== 'library') return '"kind" must be "project", "docs" or "library"';

  const p = str(b.path);
  if (p && !path.isAbsolute(p)) return '"path" must be an absolute path';

  if (kind !== 'project') {
    if (!p) return `"path" is required for "${kind}" roots`;
    return { ...(sidecar ? { sidecar } : {}), root, kind, path: p };
  }

  let project: string | number;
  if (typeof b.project === 'number' && Number.isInteger(b.project) && b.project > 0) project = b.project;
  else if (str(b.project)) project = str(b.project);
  else return '"project" must be an Axon project name or id';

  return { ...(sidecar ? { sidecar } : {}), root, project, ...(p ? { path: p } : {}) };
}

function sameKey(a: RootMapEntry, b: RootMapEntry): boolean {
  return a.root === b.root && (a.sidecar || '') === (b.sidecar || '');
}

// ============================================
// Receiver status feed
// ============================================

export interface ReceiverRoot {
  name: string;
  target: string;
  company?: string | null;
  files?: number;
  bytes?: number;
  last_path?: string | null;
  last_change_ms?: number | null;
  hook?: { ok: boolean; last_ms?: number | null; error?: string | null } | null;
}

export interface ReceiverSidecar {
  id: string;
  connected: boolean;
  last_seen_ms?: number | null;
  roots: ReceiverRoot[];
}

export interface ReceiverStatus {
  version?: string;
  uptime_s?: number;
  sidecars: ReceiverSidecar[];
  recent: Array<{ ts_ms: number; sidecar: string; root: string; path: string; op: string; size?: number }>;
  errors: Array<{ ts_ms: number; sidecar: string; root?: string; message: string }>;
}

export interface StatusReply {
  configured: boolean;
  ok: boolean;
  message?: string;
  error?: string;
  /** When the shown data was fetched (ms). */
  fetchedAtMs?: number;
  /** True when the data is the last good result, not the current one. */
  stale?: boolean;
  data?: ReceiverStatus;
}

/** Keeps only roots with target "axon", and events for those roots. */
export function filterForAxon(raw: any): ReceiverStatus {
  const keys = new Set<string>();
  const sidecars: ReceiverSidecar[] = [];
  for (const s of Array.isArray(raw?.sidecars) ? raw.sidecars : []) {
    const roots = (Array.isArray(s?.roots) ? s.roots : []).filter((r: any) => r?.target === TARGET);
    if (roots.length === 0) continue;
    roots.forEach((r: any) => keys.add(`${s.id}/${r.name}`));
    sidecars.push({ id: String(s.id), connected: !!s.connected, last_seen_ms: s.last_seen_ms ?? null, roots });
  }
  const mine = new Set(sidecars.map(s => s.id));
  const recent = (Array.isArray(raw?.recent) ? raw.recent : []).filter((e: any) => keys.has(`${e?.sidecar}/${e?.root}`));
  const errors = (Array.isArray(raw?.errors) ? raw.errors : []).filter((e: any) =>
    e?.root ? keys.has(`${e.sidecar}/${e.root}`) : mine.has(e?.sidecar));
  return { version: raw?.version, uptime_s: raw?.uptime_s, sidecars, recent, errors };
}

export interface ReceiverClientOptions {
  url?: () => string | undefined;
  token?: () => string | undefined;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class ReceiverStatusClient {
  private last?: { data: ReceiverStatus; atMs: number };
  private url: () => string | undefined;
  private token: () => string | undefined;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;

  constructor(opts: ReceiverClientOptions = {}) {
    this.url = opts.url ?? (() => process.env.SIDECAR_RECEIVER_URL);
    this.token = opts.token ?? (() => process.env.SIDECAR_RECEIVER_TOKEN);
    this.timeoutMs = opts.timeoutMs ?? 5000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  settings(): { receiverUrl: string | null; receiverToken: 'set' | 'not set' } {
    return { receiverUrl: this.url()?.trim() || null, receiverToken: this.token() ? 'set' : 'not set' };
  }

  async get(): Promise<StatusReply> {
    const url = this.url()?.trim();
    const token = this.token();
    if (!url || !token) return { configured: false, ok: false, message: RECEIVER_NOT_SET_UP };

    try {
      const res = await this.fetchImpl(`${url.replace(/\/+$/, '')}/v1/status`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) throw new Error(`Receiver replied ${res.status}${res.statusText ? ' ' + res.statusText : ''}`);
      const data = filterForAxon(await res.json());
      this.last = { data, atMs: Date.now() };
      return { configured: true, ok: true, fetchedAtMs: this.last.atMs, stale: false, data };
    } catch (err) {
      const e = err as Error;
      const error = e?.name === 'TimeoutError' || e?.name === 'AbortError'
        ? `Receiver did not reply in ${this.timeoutMs / 1000} s`
        : e?.message || String(err);
      return {
        configured: true, ok: false, error, stale: !!this.last,
        ...(this.last ? { fetchedAtMs: this.last.atMs, data: this.last.data } : {}),
      };
    }
  }
}

// ============================================
// Router
// ============================================

export interface SidecarSyncRouterOptions {
  configDir: string;
  getPrisma: () => Promise<PrismaClient>;
  queue: ChangeQueue;
  /** Middleware for routes that change things (admin role). */
  requireAdmin: RequestHandler;
  changesToken?: () => string | undefined;
  receiver?: ReceiverStatusClient;
}

export function createSidecarSyncRouter(opts: SidecarSyncRouterOptions): Router {
  const router = Router();
  const file = () => changesConfigFile(opts.configDir);
  const changesToken = opts.changesToken ?? (() => process.env.AXON_CHANGES_TOKEN);
  const receiver = opts.receiver ?? new ReceiverStatusClient();
  const fail = (res: Response, err: unknown) =>
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });

  const parseIndex = (req: Request, cfg: ChangesConfig): number | null => {
    const i = Number(req.params.index);
    return Number.isInteger(i) && i >= 0 && i < cfg.roots.length ? i : null;
  };

  router.get('/links', async (_req: Request, res: Response) => {
    try {
      const cfg = readChangesFile(file());
      const mirrorDir = cfg.mirrorDir || process.env.AXON_MIRROR_DIR || '/mirror';
      const prisma = await opts.getPrisma();
      const links = await Promise.all(cfg.roots.map(async (entry, index) => {
        const project = entry.project === undefined || (entry.kind && entry.kind !== 'project')
          ? null
          : typeof entry.project === 'number'
            ? await prisma.axonProject.findUnique({ where: { id: entry.project } })
            : await prisma.axonProject.findUnique({ where: { name: String(entry.project) } });
        const nodeCount = project ? await prisma.codeNode.count({ where: { projectId: project.id } }) : 0;
        return {
          index,
          ...entry,
          resolvedPath: entry.path || project?.path || path.join(mirrorDir, entry.sidecar || '', entry.root),
          projectId: project?.id ?? null,
          projectName: project?.name ?? null,
          lastIndexed: project?.lastIndexed ?? null,
          nodeCount,
          queue: project ? opts.queue.info(project.id) : null,
          lastResult: project ? opts.queue.result(project.id) ?? null : null,
        };
      }));
      res.json({
        configFile: file(),
        mirrorDir,
        links,
        settings: { changesToken: changesToken() ? 'set' : 'not set', ...receiver.settings() },
      });
    } catch (err) {
      fail(res, err);
    }
  });

  router.post('/links', opts.requireAdmin, (req: Request, res: Response) => {
    try {
      const entry = validateLink(req.body);
      if (typeof entry === 'string') return res.status(400).json({ error: entry });
      const cfg = readChangesFile(file());
      if (cfg.roots.some(r => sameKey(r, entry))) return res.status(409).json({ error: `A link for "${entry.sidecar || '*'}/${entry.root}" already exists` });
      cfg.roots.push(entry);
      writeChangesFile(file(), cfg);
      return res.status(201).json({ index: cfg.roots.length - 1, link: entry });
    } catch (err) {
      return fail(res, err);
    }
  });

  router.put('/links/:index', opts.requireAdmin, (req: Request, res: Response) => {
    try {
      const cfg = readChangesFile(file());
      const index = parseIndex(req, cfg);
      if (index === null) return res.status(404).json({ error: 'Link not found' });
      const entry = validateLink(req.body);
      if (typeof entry === 'string') return res.status(400).json({ error: entry });
      if (cfg.roots.some((r, i) => i !== index && sameKey(r, entry))) return res.status(409).json({ error: `A link for "${entry.sidecar || '*'}/${entry.root}" already exists` });
      cfg.roots[index] = entry;
      writeChangesFile(file(), cfg);
      return res.json({ index, link: entry });
    } catch (err) {
      return fail(res, err);
    }
  });

  router.delete('/links/:index', opts.requireAdmin, (req: Request, res: Response) => {
    try {
      const cfg = readChangesFile(file());
      const index = parseIndex(req, cfg);
      if (index === null) return res.status(404).json({ error: 'Link not found' });
      const [removed] = cfg.roots.splice(index, 1);
      writeChangesFile(file(), cfg);
      return res.json({ removed });
    } catch (err) {
      return fail(res, err);
    }
  });

  router.post('/projects/:id/rebuild', opts.requireAdmin, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id, 10);
      if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });
      const prisma = await opts.getPrisma();
      const project = await prisma.axonProject.findUnique({ where: { id: projectId } });
      if (!project) return res.status(404).json({ error: 'Project not found' });
      opts.queue.enqueueFull(projectId);
      return res.status(202).json({ projectName: project.name, ...opts.queue.info(projectId) });
    } catch (err) {
      return fail(res, err);
    }
  });

  router.get('/status', async (_req: Request, res: Response) => {
    res.json(await receiver.get());
  });

  return router;
}
