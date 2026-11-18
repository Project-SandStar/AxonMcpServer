/**
 * IDE API: project copy and safe function commit for editor plugins.
 *
 *   GET  /api/ide/projects
 *   GET  /api/ide/projects/{instance}/{project}/functions?sync=true|false
 *   POST /api/ide/projects/{instance}/{project}/functions/{name}
 *
 * Auth: `Authorization: Bearer <AXON_IDE_TOKEN>` on every route. The token is
 * always required, also when /mcp runs without auth. The server does not
 * mount these routes when no token is set (see ideToken()).
 *
 * A project is known when it is in the SkySpark config or has a local copy
 * under proj/<instance>/<project>. Names must match exactly. An unknown
 * project is a 404; there is no default and no fallback project.
 */
import * as crypto from 'crypto';
import express, { NextFunction, Request, Response, Router } from 'express';
import { CommitArgError, type CommitArgs, type CommitResult } from './commitFunction.js';
import { isFunctionName, isSafeSegment } from './names.js';
import type { StoredFunction, StoredProject } from '../sync/functionSyncManagerEnhanced.js';

export const IDE_TOKEN_ENV = 'AXON_IDE_TOKEN';
export const IDE_TOKEN_MIN_LENGTH = 16;

/**
 * The IDE token from the environment, or null with the reason why the
 * routes stay off.
 */
export function ideToken(env: NodeJS.ProcessEnv = process.env): { token: string | null; reason?: string } {
  const token = (env[IDE_TOKEN_ENV] ?? '').trim();
  if (!token) return { token: null, reason: `${IDE_TOKEN_ENV} is not set` };
  if (token.length < IDE_TOKEN_MIN_LENGTH) {
    return { token: null, reason: `${IDE_TOKEN_ENV} is shorter than ${IDE_TOKEN_MIN_LENGTH} characters` };
  }
  return { token };
}

export interface ProjectRef { instance: string; project: string }

export interface IdeStore {
  listStoredProjects(): Promise<StoredProject[]>;
  readStoredFunctions(
    instance: string, project: string
  ): Promise<{ syncedAt: string | null; functions: StoredFunction[] } | null>;
}

export interface IdeRouterOptions {
  /** The expected token. Empty or undefined: every request gets a 503. */
  token: () => string | undefined | null;
  store: IdeStore;
  /** The projects of the SkySpark config (sync and commit work for these only). */
  configuredProjects: () => ProjectRef[];
  /** Runs the project sync. Called for ?sync=true. */
  sync: (instance: string, project: string) => Promise<unknown>;
  /** Commits one function; the same function the commitAxonFunction tool calls. */
  commit: (instance: string, project: string, args: CommitArgs) => Promise<CommitResult>;
  /** Largest request body (default "2mb"). */
  bodyLimit?: string;
  log?: (line: string) => void;
}

function tokenOk(header: string | undefined, expected: string): boolean {
  if (!header || !header.startsWith('Bearer ')) return false;
  const a = crypto.createHash('sha256').update(header.slice(7).trim()).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/** An error text for the client: no URLs, so no host names leave the server. */
function publicMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/\(URL:[^)]*\)/g, '').replace(/https?:\/\/\S+/g, '[url]').trim().slice(0, 300);
}

const sameProject = (a: ProjectRef, b: ProjectRef) => a.instance === b.instance && a.project === b.project;

export function createIdeRouter(opts: IdeRouterOptions): Router {
  const router = Router();
  const log = opts.log ?? ((line: string) => console.error(line));

  // 1. Auth comes first: no route below tells an anonymous caller anything.
  router.use((req: Request, res: Response, next: NextFunction) => {
    const expected = opts.token();
    if (!expected) {
      res.status(503).json({ error: `IDE API is off: ${IDE_TOKEN_ENV} is not set` });
      return;
    }
    if (!tokenOk(req.headers.authorization, expected)) {
      res.setHeader('WWW-Authenticate', 'Bearer');
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    next();
  });

  router.use(express.json({ limit: opts.bodyLimit ?? '2mb' }));

  /**
   * Resolves the two path segments to a known project. Sends 400 or 404 and
   * returns null when there is none.
   */
  async function knownProject(
    req: Request, res: Response
  ): Promise<(ProjectRef & { configured: boolean }) | null> {
    const ref = { instance: String(req.params.instance), project: String(req.params.project) };
    if (!isSafeSegment(ref.instance) || !isSafeSegment(ref.project)) {
      res.status(400).json({ error: 'invalid project name' });
      return null;
    }
    const configured = opts.configuredProjects().some(p => sameProject(p, ref));
    // The store reads the metadata of every project, so ask it only when needed.
    if (!configured && !(await opts.store.listStoredProjects()).some(p => sameProject(p, ref))) {
      res.status(404).json({ error: 'unknown project' });
      return null;
    }
    return { ...ref, configured };
  }

  router.get('/projects', async (_req: Request, res: Response) => {
    const stored = await opts.store.listStoredProjects();
    const rows = stored.map(p => ({
      key: `${p.instance}/${p.project}`,
      instance: p.instance,
      project: p.project,
      functionCount: p.functionCount,
      lastSync: p.lastSync,
    }));
    // Projects of the config that have no local copy yet: listed with 0 functions.
    for (const p of opts.configuredProjects()) {
      if (!isSafeSegment(p.instance) || !isSafeSegment(p.project)) continue;
      if (stored.some(s => sameProject(s, p))) continue;
      rows.push({ key: `${p.instance}/${p.project}`, instance: p.instance, project: p.project, functionCount: 0, lastSync: null });
    }
    rows.sort((a, b) => a.key.localeCompare(b.key));
    res.json({ projects: rows });
  });

  router.get('/projects/:instance/:project/functions', async (req: Request, res: Response) => {
    const ref = await knownProject(req, res);
    if (!ref) return;

    if (req.query.sync === 'true') {
      if (!ref.configured) {
        res.status(503).json({ error: 'project is not in the SkySpark config of this server; it cannot sync' });
        return;
      }
      try {
        await opts.sync(ref.instance, ref.project);
      } catch (error) {
        log(`[ide] sync failed for ${ref.instance}/${ref.project}: ${error instanceof Error ? error.message : error}`);
        res.status(502).json({ error: `sync failed: ${publicMessage(error)}` });
        return;
      }
    }

    const copy = await opts.store.readStoredFunctions(ref.instance, ref.project);
    res.json({
      key: `${ref.instance}/${ref.project}`,
      syncedAt: copy?.syncedAt ?? null,
      functions: (copy?.functions ?? []).map(f => ({ name: f.name, src: f.src, doc: f.doc, mod: f.mod, hash: f.hash })),
    });
  });

  router.post('/projects/:instance/:project/functions/:name', async (req: Request, res: Response) => {
    const ref = await knownProject(req, res);
    if (!ref) return;
    const name = String(req.params.name);
    if (!isFunctionName(name)) {
      res.status(400).json({ error: 'invalid function name' });
      return;
    }
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ error: 'the body must be a JSON object' });
      return;
    }
    if (typeof body.src !== 'string' || body.src.length === 0) {
      res.status(400).json({ error: 'src must be a string that is not empty' });
      return;
    }
    if (body.doc !== undefined && body.doc !== null && typeof body.doc !== 'string') {
      res.status(400).json({ error: 'doc must be a string' });
      return;
    }
    // The HTTP route always does the stale-write check, so the key must be there.
    if (!('expectedMod' in body) || (body.expectedMod !== null && typeof body.expectedMod !== 'string')) {
      res.status(400).json({ error: 'expectedMod must be an ISO 8601 date-time or null' });
      return;
    }
    if (!ref.configured) {
      res.status(503).json({ error: 'project is not in the SkySpark config of this server; it cannot commit' });
      return;
    }

    const args: CommitArgs = { name, src: body.src, expectedMod: body.expectedMod };
    if (typeof body.doc === 'string') args.doc = body.doc; // absent or null: keep the stored doc

    try {
      const result = await opts.commit(ref.instance, ref.project, args);
      if (result.status === 'conflict') {
        res.status(409).json({ status: 'conflict', mod: result.mod, hash: result.hash });
        return;
      }
      if (result.warning) log(`[ide] commit ${ref.instance}/${ref.project}/${name}: ${result.warning}`);
      res.json({ status: 'ok', mod: result.mod, hash: result.hash });
    } catch (error) {
      if (error instanceof CommitArgError) {
        res.status(400).json({ error: error.message });
        return;
      }
      log(`[ide] commit failed for ${ref.instance}/${ref.project}/${name}: ${error instanceof Error ? error.message : error}`);
      res.status(502).json({ error: `commit failed: ${publicMessage(error)}` });
    }
  });

  router.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'not found' });
  });

  // Body parser and handler errors as JSON (a bad body, a body over the limit).
  router.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
    if (status === 500) log(`[ide] ${error instanceof Error ? error.message : error}`);
    const text = status === 413 ? 'the body is too large' : status === 500 ? 'server error' : 'bad request';
    res.status(status).json({ error: text });
  });

  return router;
}
