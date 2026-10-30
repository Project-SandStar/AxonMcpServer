/**
 * Server-side folder picker API for the dashboard "Browse…" buttons.
 *
 * Mounted under /admin/fs, behind the admin Basic Auth, admin role only.
 *
 *   GET /admin/fs/dirs?path=<abs>
 *     → { path, parent, roots, entries: [{ name, path, isDir, hint? }], truncated }
 *
 * Lists sub-folders (never files) of one folder inside an allowlist of roots.
 * Roots: AXON_BROWSE_ROOTS (comma or colon list) or the defaults the caller gives
 * (mirror dir, proj dir, codePath/docsPath parents). Every path is resolved with
 * fs.realpath, so a symlink that points out of the roots is refused. Dot folders
 * and denied folders (config dir, cache dir) are never listed.
 *
 * Hints (badges in the picker):
 *   skysparkDocRoot   holds doc* / lib-* folders with .html files (a SkySpark version doc dir)
 *   docLibrary        a doc* / lib-* folder with .html files
 *   axonProject       holds func/*.axon or *.trio files
 *   skysparkInstance  holds Axon project folders (proj/<instance>)
 */

import { Router, Request, Response, RequestHandler } from 'express';
import * as fs from 'fs';
import * as path from 'path';

export const MAX_ENTRIES = 500;
const HINT_SCAN_LIMIT = 60;

export type DirHint = 'skysparkDocRoot' | 'docLibrary' | 'axonProject' | 'skysparkInstance';

export interface DirEntry {
  name: string;
  path: string;
  isDir: true;
  hint?: DirHint;
}

export interface DirListing {
  path: string;
  parent: string | null;
  roots: string[];
  entries: DirEntry[];
  truncated: boolean;
}

export class FsBrowseError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Splits AXON_BROWSE_ROOTS ("a,b" or "a:b"). Returns undefined when not set. */
export function parseRootsEnv(value: string | undefined): string[] | undefined {
  if (!value || !value.trim()) return undefined;
  return value.split(/[,:]/).map(s => s.trim()).filter(Boolean);
}

function realOrNull(p: string): string | null {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

/** True when child is base or inside base (both real, absolute). */
export function isInside(child: string, base: string): boolean {
  const rel = path.relative(base, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Turns candidate roots into real, existing, absolute folders without repeats.
 * Folders inside a denied folder are dropped.
 */
export function resolveRoots(candidates: Array<string | undefined | null>, deny: string[] = []): string[] {
  const realDeny = deny.map(realOrNull).filter((d): d is string => !!d);
  const out: string[] = [];
  for (const c of candidates) {
    if (!c || !path.isAbsolute(c)) continue;
    const real = realOrNull(c);
    if (!real) continue;
    try {
      if (!fs.statSync(real).isDirectory()) continue;
    } catch {
      continue;
    }
    if (realDeny.some(d => isInside(real, d))) continue;
    if (!out.includes(real)) out.push(real);
  }
  return out;
}

function listNames(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function isDirent(dir: string, d: fs.Dirent): boolean {
  if (d.isDirectory()) return true;
  if (!d.isSymbolicLink()) return false;
  try {
    return fs.statSync(path.join(dir, d.name)).isDirectory();
  } catch {
    return false;
  }
}

function hasFileWith(dir: string, test: (name: string) => boolean): boolean {
  return listNames(dir).some(d => !d.isDirectory() && test(d.name));
}

const DOC_DIR_RE = /^(doc|lib-)/i;
const isHtml = (n: string) => /\.html?$/i.test(n);
const isAxon = (n: string) => /\.(axon|trio)$/i.test(n);

export function isAxonProject(dir: string): boolean {
  const func = path.join(dir, 'func');
  if (fs.existsSync(func) && hasFileWith(func, isAxon)) return true;
  return hasFileWith(dir, n => /\.trio$/i.test(n));
}

/** Best guess of what a folder holds, or undefined. Reads at most a few levels. */
export function detectHint(dir: string): DirHint | undefined {
  const name = path.basename(dir);
  if (DOC_DIR_RE.test(name) && hasFileWith(dir, isHtml)) return 'docLibrary';
  if (isAxonProject(dir)) return 'axonProject';

  const subs = listNames(dir).filter(d => !d.name.startsWith('.') && isDirent(dir, d)).slice(0, HINT_SCAN_LIMIT);
  let docLibs = 0;
  for (const s of subs) {
    const sub = path.join(dir, s.name);
    if (DOC_DIR_RE.test(s.name) && hasFileWith(sub, isHtml)) {
      docLibs++;
      if (docLibs >= 2) return 'skysparkDocRoot';
    }
  }
  if (docLibs === 1) return 'skysparkDocRoot';
  for (const s of subs) {
    if (isAxonProject(path.join(dir, s.name))) return 'skysparkInstance';
  }
  return undefined;
}

export interface ListOptions {
  roots: string[];
  /** Real folders that are never listed or opened (config, cache). */
  deny?: string[];
  showHidden?: boolean;
  maxEntries?: number;
}

/** Lists the sub-folders of reqPath. Throws FsBrowseError (400/403/404). */
export function listDirs(reqPath: string | undefined, opts: ListOptions): DirListing {
  const roots = opts.roots;
  if (roots.length === 0) throw new FsBrowseError(404, 'No browse roots are set up on this server');
  const deny = (opts.deny ?? []).map(realOrNull).filter((d): d is string => !!d);
  const max = opts.maxEntries ?? MAX_ENTRIES;

  const raw = (reqPath ?? '').trim();
  let target: string;
  if (!raw) {
    target = roots[0];
  } else {
    if (raw.includes('\0')) throw new FsBrowseError(400, 'Bad path');
    if (!path.isAbsolute(raw)) throw new FsBrowseError(400, 'Path must be absolute');
    if (raw.split(/[\\/]+/).includes('..')) throw new FsBrowseError(400, 'Path must not contain ".."');
    const real = realOrNull(raw);
    if (!real) throw new FsBrowseError(404, 'Folder not found');
    target = real;
  }

  if (!roots.some(r => isInside(target, r))) throw new FsBrowseError(403, 'Path is outside the allowed roots');
  if (deny.some(d => isInside(target, d))) throw new FsBrowseError(403, 'Path is not allowed');
  try {
    if (!fs.statSync(target).isDirectory()) throw new FsBrowseError(400, 'Not a folder');
  } catch (e) {
    if (e instanceof FsBrowseError) throw e;
    throw new FsBrowseError(404, 'Folder not found');
  }

  const entries: DirEntry[] = [];
  let truncated = false;
  const dirents = listNames(target).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  for (const d of dirents) {
    if (!opts.showHidden && d.name.startsWith('.')) continue;
    if (!isDirent(target, d)) continue;
    const full = path.join(target, d.name);
    const real = realOrNull(full);
    // A symlink that leaves the roots, or a denied folder, is not shown.
    if (!real || !roots.some(r => isInside(real, r)) || deny.some(dn => isInside(real, dn))) continue;
    if (entries.length >= max) {
      truncated = true;
      break;
    }
    const hint = detectHint(full);
    entries.push({ name: d.name, path: full, isDir: true, ...(hint ? { hint } : {}) });
  }

  const up = path.dirname(target);
  const parent = up !== target && roots.some(r => isInside(up, r)) ? up : null;
  return { path: target, parent, roots, entries, truncated };
}

export interface FsBrowserRouterOptions {
  /** Default root candidates (used when AXON_BROWSE_ROOTS is not set). */
  defaultRoots: () => Array<string | undefined | null>;
  /** Folders never listed: config dir, cache dir. */
  deny: () => string[];
  requireAdmin: RequestHandler;
}

export function createFsBrowserRouter(opts: FsBrowserRouterOptions): Router {
  const router = Router();
  router.get('/dirs', opts.requireAdmin, (req: Request, res: Response) => {
    try {
      const deny = opts.deny();
      const roots = resolveRoots(parseRootsEnv(process.env.AXON_BROWSE_ROOTS) ?? opts.defaultRoots(), deny);
      const q = typeof req.query.path === 'string' ? req.query.path : undefined;
      res.json(listDirs(q, { roots, deny, showHidden: req.query.hidden === '1' || req.query.hidden === 'true' }));
    } catch (e) {
      if (e instanceof FsBrowseError) return res.status(e.status).json({ error: e.message });
      return res.status(500).json({ error: 'Failed to list folder' });
    }
  });
  return router;
}
