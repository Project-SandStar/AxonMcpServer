/**
 * IDE API: project copy and safe function commit for editor plugins.
 *
 *   GET  /api/ide/projects
 *   GET  /api/ide/projects/{instance}/{project}/functions?sync=true|false
 *   POST /api/ide/projects/{instance}/{project}/functions/{name}
 *
 * Auth: `Authorization: Bearer <user access key>` on every route. The key
 * belongs to one dashboard user (an admin makes it on the Users page). A key
 * is always required, also when /mcp runs without auth. There is no shared
 * token.
 *
 * A user with the 'readonly' role can list and export, but cannot commit.
 * Every call that passes the key check gives one access record with the user.
 *
 * A project is known when it is in the SkySpark config or has a local copy
 * under proj/<instance>/<project>. Names must match exactly. An unknown
 * project is a 404; there is no default and no fallback project.
 */
import express, { NextFunction, Request, Response, Router } from 'express';
import { CommitArgError, CommitBackupError, type CommitArgs, type CommitResult } from './commitFunction.js';
import { isFunctionName, isSafeSegment } from './names.js';
import type { StoredFunction, StoredProject } from '../sync/functionSyncManagerEnhanced.js';

export interface ProjectRef { instance: string; project: string }

/** The user who makes a call. */
export interface IdeCaller {
  userId: string;
  username: string;
  role: 'admin' | 'user' | 'readonly';
  keyId?: string;
  keyPrefix?: string;
}

/** One access record. It never holds a key or Axon source. */
export interface IdeAuditEvent {
  /** 'projects.list', 'functions.export', 'function.commit', 'write.denied', 'other' */
  action: string;
  /** 'ok', 'conflict', 'denied', 'error' */
  status: string;
  caller: IdeCaller;
  instance?: string;
  project?: string;
  name?: string;
}

export interface IdeStore {
  listStoredProjects(): Promise<StoredProject[]>;
  readStoredFunctions(
    instance: string, project: string
  ): Promise<{ syncedAt: string | null; functions: StoredFunction[] } | null>;
}

export interface IdeRouterOptions {
  /**
   * Checks the bearer text. Returns the user, or null when the key is wrong,
   * revoked or expired, or the user is disabled or deleted (401). A throw
   * means the check could not run (503).
   */
  verify: (bearer: string) => Promise<IdeCaller | null>;
  /** Gets one event per call that passed the key check. Must not throw. */
  audit?: (event: IdeAuditEvent) => void;
  store: IdeStore;
  /** The projects of the SkySpark config (sync and commit work for these only). */
  configuredProjects: () => ProjectRef[];
  /** Runs the project sync. Called for ?sync=true. */
  sync: (instance: string, project: string, caller: IdeCaller) => Promise<unknown>;
  /** Commits one function; the same function the commitAxonFunction tool calls. */
  commit: (instance: string, project: string, args: CommitArgs, caller: IdeCaller) => Promise<CommitResult>;
  /** Largest request body (default "2mb"). */
  bodyLimit?: string;
  log?: (line: string) => void;
}

/** An error text for the client: no URLs, so no host names leave the server. */
function publicMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/\(URL:[^)]*\)/g, '').replace(/https?:\/\/\S+/g, '[url]').trim().slice(0, 300);
}

const sameProject = (a: ProjectRef, b: ProjectRef) => a.instance === b.instance && a.project === b.project;

/** The bearer text of an Authorization header, or null. */
function bearerOf(header: string | undefined): string | null {
  if (!header || !header.startsWith('Bearer ')) return null;
  const text = header.slice(7).trim();
  return text.length > 0 ? text : null;
}

/** What the access record of the current call will say. Routes fill it in. */
interface AuditDraft { action: string; status?: string; instance?: string; project?: string; name?: string }

const whoText = (caller: IdeCaller) => `${caller.username} (${caller.keyPrefix ?? 'login token'})`;

/**
 * Project and function name of a path below /api/ide, for the access record of a
 * call that is refused before its route runs. Only plain, decodable segments.
 */
function targetOfPath(path: string): { instance?: string; project?: string; name?: string } {
  const m = /^\/projects\/([^/]+)\/([^/]+)\/functions(?:\/([^/]+))?\/?$/.exec(path);
  if (!m) return {};
  const dec = (s: string | undefined) => {
    if (s === undefined) return undefined;
    try { return decodeURIComponent(s).slice(0, 200); } catch { return undefined; }
  };
  return { instance: dec(m[1]), project: dec(m[2]), name: dec(m[3]) };
}

export function createIdeRouter(opts: IdeRouterOptions): Router {
  const router = Router();
  const log = opts.log ?? ((line: string) => console.error(line));

  const audit = (event: IdeAuditEvent) => {
    try {
      opts.audit?.(event);
    } catch (error) {
      log(`[ide] access record failed: ${error instanceof Error ? error.message : error}`);
    }
  };
  const callerOf = (res: Response): IdeCaller => res.locals.ideCaller as IdeCaller;
  const draftOf = (res: Response): AuditDraft => res.locals.ideAudit as AuditDraft;

  // 1. Auth comes first: no route below tells an anonymous caller anything.
  router.use(async (req: Request, res: Response, next: NextFunction) => {
    const unauthorized = () => {
      res.setHeader('WWW-Authenticate', 'Bearer');
      res.status(401).json({ error: 'unauthorized' });
    };
    const bearer = bearerOf(req.headers.authorization);
    if (!bearer) return unauthorized();

    let caller: IdeCaller | null;
    try {
      caller = await opts.verify(bearer);
    } catch (error) {
      log(`[ide] the key check could not run: ${error instanceof Error ? error.message : error}`);
      res.status(503).json({ error: 'the key check is not ready; try again' });
      return;
    }
    if (!caller) return unauthorized();

    // A read-only user can list and export only.
    if (caller.role === 'readonly' && req.method !== 'GET' && req.method !== 'HEAD') {
      log(`[ide] refused ${req.method} for the read-only user ${whoText(caller)}`);
      audit({ action: 'write.denied', status: 'denied', caller, ...targetOfPath(req.path) });
      res.status(403).json({ error: 'your user is read-only and cannot commit' });
      return;
    }

    res.locals.ideCaller = caller;
    const draft: AuditDraft = { action: 'other' };
    res.locals.ideAudit = draft;
    // One record per call. 'finish' comes when the reply is sent; when the client
    // drops the connection first, only 'close' comes. Write on the first of the two.
    let recorded = false;
    const record = () => {
      if (recorded) return;
      recorded = true;
      const code = res.writableFinished ? res.statusCode : 499;
      const status = draft.status ?? (!res.writableFinished ? 'aborted' : code < 400 ? 'ok' : code === 409 ? 'conflict' : 'error');
      audit({ action: draft.action, status, caller: caller!, instance: draft.instance, project: draft.project, name: draft.name });
    };
    res.on('finish', record);
    res.on('close', record);
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
    const draft = draftOf(res);
    draft.instance = ref.instance;
    draft.project = ref.project;
    return { ...ref, configured };
  }

  router.get('/projects', async (_req: Request, res: Response) => {
    draftOf(res).action = 'projects.list';
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
    draftOf(res).action = 'functions.export';
    const ref = await knownProject(req, res);
    if (!ref) return;

    // A read-only user may sync too: it reads SkySpark and writes only the server's local copy.
    if (req.query.sync === 'true') {
      if (!ref.configured) {
        res.status(503).json({ error: 'project is not in the SkySpark config of this server; it cannot sync' });
        return;
      }
      try {
        await opts.sync(ref.instance, ref.project, callerOf(res));
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
    const draft = draftOf(res);
    draft.action = 'function.commit';
    const ref = await knownProject(req, res);
    if (!ref) return;
    const name = String(req.params.name);
    if (!isFunctionName(name)) {
      res.status(400).json({ error: 'invalid function name' });
      return;
    }
    draft.name = name;
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

    const caller = callerOf(res);
    try {
      const result = await opts.commit(ref.instance, ref.project, args, caller);
      if (result.status === 'conflict') {
        res.status(409).json({ status: 'conflict', mod: result.mod, hash: result.hash });
        return;
      }
      if (result.warning) log(`[ide] commit ${ref.instance}/${ref.project}/${name}: ${result.warning}`);
      log(`[ide] commit ${ref.instance}/${ref.project}/${name} by ${whoText(caller)}`);
      res.json({ status: 'ok', mod: result.mod, hash: result.hash, removedDuplicates: result.removedDuplicates });
    } catch (error) {
      if (error instanceof CommitArgError) {
        res.status(400).json({ error: error.message });
        return;
      }
      if (error instanceof CommitBackupError) {
        // A disk problem on this server, not SkySpark: nothing was committed.
        log(`[ide] commit refused for ${ref.instance}/${ref.project}/${name} by ${whoText(caller)}: ${error.message}`);
        res.status(500).json({ error: error.message });
        return;
      }
      log(`[ide] commit failed for ${ref.instance}/${ref.project}/${name} by ${whoText(caller)}: ${error instanceof Error ? error.message : error}`);
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
