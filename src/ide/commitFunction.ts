/**
 * Commit one Axon function to a SkySpark project.
 *
 * This is the only code path that writes a func record. The commitAxonFunction
 * MCP tool and POST /api/ide/projects/{instance}/{project}/functions/{name}
 * both call commitFunction().
 *
 * Rules:
 *  - The name must be a plain tag name. It goes into Axon text and file paths.
 *  - `doc` not given: the stored doc is kept. `doc: ""` clears it.
 *  - `expectedMod` not given: no stale-write check (old callers).
 *    `expectedMod: null`: the function must not exist yet.
 *    `expectedMod: "<ISO>"`: the record's `mod` must be that time.
 *    The check and the commit run in one eval on the server.
 *  - One func record per name. An existing record is updated in place (no
 *    {add}). Older records with the same name are removed in the same eval
 *    and their src goes to the backups.
 *  - After a good commit the local copy (func/<name>.axon, .trio and the
 *    sync metadata) is updated, so an export shows the new source and `mod`.
 */
import { promises as fs } from 'fs';
import * as path from 'path';
import { HDict, HGrid } from 'haystack-core';
import { axonStr, isFunctionName, isSafeSegment, isTagName } from './names.js';
import { modToIso, modToMillis, sha256Hex } from './mod.js';

/** The part of the SkySpark client that the commit needs. */
export interface AxonEvalClient {
  evalAxon(code: string): Promise<unknown>;
}

/** Where the commit goes. The client must already be on this project. */
export interface CommitTarget {
  client: AxonEvalClient;
  instance: string;
  project: string;
}

export interface CommitArgs {
  name: string;
  src: string;
  /** Not given: keep the stored doc. */
  doc?: string;
  /** Not given: no check. null: the function must not exist. ISO: must match the record's mod. */
  expectedMod?: string | null;
  /** More tags for the record. true is a marker; null and undefined are skipped. */
  extraTags?: Record<string, unknown>;
}

/** A record as the commit returns it (a Haystack dict). */
export interface FuncRecord {
  has(name: string): boolean;
  get(name: string): unknown;
}

/** The local copy of the synced functions (FunctionSyncManagerEnhanced). */
export interface LocalFunctionStore {
  recordCommittedFunction(
    instance: string,
    project: string,
    fn: { name: string; src: string; doc: string | null; modIso: string | null; record?: FuncRecord | null }
  ): Promise<{ files: boolean; metadata: boolean }>;
}

export interface CommitDeps {
  /** Folder of the synced projects (default "proj"). Backups go below it. */
  baseDir?: string;
  /** Updated after a good commit. Left out: no local copy is written. */
  store?: LocalFunctionStore;
  /** How many backups to keep for one function (default 10). */
  maxBackups?: number;
}

export interface CommitOk {
  status: 'ok';
  operation: 'added' | 'updated';
  /** The record's new mod (ISO), or null when the server sent none. */
  mod: string | null;
  /** sha256 of the committed src. */
  hash: string;
  /** The doc now stored on the record. */
  doc: string | null;
  backedUp: boolean;
  backupPath: string | null;
  /** Older records with the same name that the commit removed (0 in the normal case). */
  removedDuplicates: number;
  /** files + metadata written, files only (project never synced), none, or failed. */
  localCopy: 'updated' | 'files-only' | 'none' | 'failed';
  warning?: string;
}

export interface CommitConflict {
  status: 'conflict';
  /** The record's mod on the server (ISO), or null when the function is gone. */
  mod: string | null;
  /** sha256 of the src on the server, or null when the function is gone. */
  hash: string | null;
  /** True when the function is on the server. */
  exists: boolean;
}

export type CommitResult = CommitOk | CommitConflict;

/** A bad argument. Callers answer 400 or InvalidParams. */
export class CommitArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommitArgError';
  }
}

/** Tags copied back from the committed record for the local .trio file. */
const KEEP_TAGS = [
  'dis', 'help', 'name', 'doc',
  'ruleOn', 'sparkRule', 'kpiRule', 'curRule',
  'ruleType', 'mod', 'lib', 'version', 'author',
];

/** Tags the caller cannot set through extraTags. */
const RESERVED_TAGS = new Set(['id', 'mod', 'name', 'src', 'doc', 'func']);

function checkArgs(args: CommitArgs): void {
  if (!isFunctionName(args.name)) {
    throw new CommitArgError(
      'Invalid function name. Use a letter, then letters, digits or "_" (128 characters at most).'
    );
  }
  if (typeof args.src !== 'string' || args.src.length === 0) {
    throw new CommitArgError('src must be a string that is not empty.');
  }
  if (args.doc !== undefined && typeof args.doc !== 'string') {
    throw new CommitArgError('doc must be a string.');
  }
  if (args.expectedMod !== undefined && args.expectedMod !== null && modToMillis(args.expectedMod) === null) {
    throw new CommitArgError('expectedMod must be an ISO 8601 date-time or null.');
  }
}

function tagPairs(extraTags: Record<string, unknown> | undefined): string[] {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(extraTags ?? {})) {
    if (value === null || value === undefined) continue;
    if (!isTagName(key) || RESERVED_TAGS.has(key)) {
      throw new CommitArgError(`Invalid tag name in extraTags: ${JSON.stringify(key)}.`);
    }
    if (value === true) { pairs.push(key); continue; } // marker
    if (typeof value === 'boolean') { pairs.push(`${key}:false`); continue; }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new CommitArgError(`Tag ${key} is not a finite number.`);
      pairs.push(`${key}:${value}`);
      continue;
    }
    if (typeof value === 'string') { pairs.push(`${key}:${axonStr(value)}`); continue; }
    pairs.push(`${key}:${axonStr(JSON.stringify(value))}`);
  }
  return pairs;
}

/**
 * The Axon that does the check and the commit in one eval.
 *
 * Folio has a unique id but no unique name on func, so the record is looked
 * up by name and updated in place. When older records with the same name are
 * there (left by an old commit that always added), the newest one is updated
 * and the others are removed in the same eval; their src comes back for a
 * backup. A new function is the only case that adds a record. Axon `if` is an expression; each branch
 * here is a `do ... end` block.
 */
export function buildCommitAxon(args: CommitArgs): string {
  checkArgs(args);

  let stale: string;
  if (args.expectedMod === undefined) stale = 'false';
  else if (args.expectedMod === null) stale = 'existing != null';
  else stale = `curMs != ${modToMillis(args.expectedMod)}ms`;

  const changes = ['src: ideSrc'];
  if (args.doc !== undefined) changes.push('doc: ideDoc');
  changes.push(...tagPairs(args.extraTags));

  const lines = [
    'do',
    `  ideName: ${axonStr(args.name)}`,
    `  ideSrc: ${axonStr(args.src)}`,
  ];
  if (args.doc !== undefined) lines.push(`  ideDoc: ${axonStr(args.doc)}`);
  lines.push(
    // Newest first. Folio does not stop two func records with one name; the
    // newest one is updated and the others are removed in the same eval.
    '  recs: readAll(func and name==ideName).toRecList.sortr((a, b) => a->mod <=> b->mod)',
    '  existing: recs.first',
    '  extras: if (recs.size > 1) recs[1..-1] else []',
    '  curMs: if (existing == null) null else toJavaMillis(existing->mod)',
    `  stale: ${stale}`,
    `  changes: {${changes.join(', ')}}`,
    `  keep: [${KEEP_TAGS.map(t => `"${t}"`).join(', ')}]`,
    '  if (stale) do',
    '    if (existing == null) {ideStatus: "conflict"} else {ideStatus: "conflict", mod: existing->mod, ideCurSrc: existing["src"]}',
    '  end else do',
    '    rec: if (existing == null) commit(diff(null, merge({func, name: ideName}, changes), {add})) else commit(diff(existing, changes))',
    '    extras.each(x => commit(diff(x, null, {remove})))',
    '    merge(rec.findAll((v, n) => keep.contains(n)), {ideStatus: "ok", ideOp: if (existing == null) "added" else "updated", idePrevSrc: if (existing == null) null else existing["src"], ideDupSrcs: extras.map(x => x["src"])})',
    '  end',
    'end',
  );
  return lines.join('\n');
}

/** The dict in an eval result. SkySpark sends a dict as a grid with one row. */
function resultDict(result: unknown): FuncRecord | null {
  if (result instanceof HGrid) {
    const row = result.length === 1 ? result.get(0) : undefined;
    return row ? (row as unknown as FuncRecord) : null;
  }
  if (result instanceof HDict) return result as unknown as FuncRecord;
  // A dict or a grid from a second copy of haystack-core fails instanceof.
  const any = result as any;
  if (any && typeof any.has === 'function' && typeof any.get === 'function') {
    if (typeof any.length === 'number') {
      const row = any.length === 1 ? any.get(0) : undefined;
      return row && typeof row.has === 'function' ? (row as FuncRecord) : null;
    }
    return any as FuncRecord;
  }
  return null;
}

/** True when the dict holds a value for `tag`. A null grid cell is not a value. */
function present(dict: FuncRecord, tag: string): boolean {
  if (!dict.has(tag)) return false;
  const value = dict.get(tag);
  return value !== null && value !== undefined;
}

/** A list of strings in the dict (an HList of HStr, or a plain array). */
function strList(dict: FuncRecord, tag: string): string[] {
  if (!present(dict, tag)) return [];
  const value = dict.get(tag) as any;
  const items: unknown[] = Array.isArray(value) ? value
    : typeof value?.toArray === 'function' ? value.toArray() : [];
  return items
    .filter(v => v !== null && v !== undefined)
    .map((v: any) => (typeof v.value === 'string' ? v.value : String(v)));
}

function str(dict: FuncRecord, tag: string): string | null {
  if (!present(dict, tag)) return null;
  const value = dict.get(tag) as any;
  return typeof value.value === 'string' ? value.value : String(value);
}

/** Writes a new file; a name that is taken gets a number (two backups in one millisecond). */
async function writeNewFile(dir: string, stamp: string, src: string): Promise<string> {
  for (let n = 0; ; n++) {
    const file = path.join(dir, n === 0 ? `backup-${stamp}.axon` : `backup-${stamp}-${n}.axon`);
    try {
      await fs.writeFile(file, src, { flag: 'wx' });
      return file;
    } catch (error: any) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
}

/**
 * Writes one backup per src. files[i] is the file of srcs[i], or null when it
 * was not written. Old backups are trimmed to `keep`, but the files of this
 * commit are never trimmed: they may hold the only copy of a removed record.
 */
async function writeBackups(
  baseDir: string, target: CommitTarget, name: string, srcs: string[], keep: number
): Promise<{ files: Array<string | null>; errors: string[] }> {
  const files: Array<string | null> = [];
  const errors: string[] = [];
  const dir = path.join(baseDir, target.instance, target.project, '.backups', name);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error: any) {
    return { files: srcs.map(() => null), errors: [error.message] };
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const src of srcs) {
    try {
      files.push(await writeNewFile(dir, stamp, src));
    } catch (error: any) {
      files.push(null);
      errors.push(error.message);
    }
  }
  try {
    const mine = new Set(files.filter((f): f is string => f !== null).map(f => path.basename(f)));
    const others = (await fs.readdir(dir)).filter(f => f.startsWith('backup-') && !mine.has(f)).sort().reverse();
    for (const f of others.slice(Math.max(0, keep - mine.size))) await fs.unlink(path.join(dir, f));
  } catch (error: any) {
    errors.push(`old backups were not trimmed: ${error.message}`);
  }
  return { files, errors };
}

/**
 * Commits one function. Throws CommitArgError for a bad argument and a plain
 * Error when SkySpark refuses the eval; a stale write is a normal result.
 */
export async function commitFunction(
  target: CommitTarget, args: CommitArgs, deps: CommitDeps = {}
): Promise<CommitResult> {
  if (!isSafeSegment(target.instance) || !isSafeSegment(target.project)) {
    throw new CommitArgError('Invalid instance or project name.');
  }
  const code = buildCommitAxon(args);
  const dict = resultDict(await target.client.evalAxon(code));
  const status = dict ? str(dict, 'ideStatus') : null;
  if (!dict || (status !== 'ok' && status !== 'conflict')) {
    throw new Error(
      'SkySpark sent a reply to the commit that is not understood. ' +
      'The commit may be stored already: read the function again before you retry.'
    );
  }

  if (status === 'conflict') {
    const exists = present(dict, 'mod') || present(dict, 'ideCurSrc');
    const curSrc = str(dict, 'ideCurSrc');
    return {
      status: 'conflict',
      mod: modToIso(present(dict, 'mod') ? dict.get('mod') : null),
      hash: exists ? sha256Hex(curSrc ?? '') : null,
      exists,
    };
  }

  const operation = str(dict, 'ideOp') === 'added' ? 'added' : 'updated';
  const mod = modToIso(present(dict, 'mod') ? dict.get('mod') : null);
  const doc = str(dict, 'doc');
  const baseDir = deps.baseDir ?? 'proj';
  const warnings: string[] = [];

  // Backups of the source that the commit replaced and of each removed
  // duplicate (oldest last). Both came back in the same eval.
  const prevSrc = str(dict, 'idePrevSrc');
  const dupSrcs = strList(dict, 'ideDupSrcs');
  const saves = [...(prevSrc ? [prevSrc] : []), ...dupSrcs];
  let backupPath: string | null = null;
  if (saves.length) {
    const { files, errors } = await writeBackups(baseDir, target, args.name, saves, deps.maxBackups ?? 10);
    backupPath = files.find(f => f !== null) ?? null;
    if (dupSrcs.length) {
      const missing = files.slice(saves.length - dupSrcs.length).filter(f => f === null).length;
      warnings.push(
        `Removed ${dupSrcs.length} older func record(s) with the name ${args.name}.` +
        (missing === 0 ? ' Their src is in the backups.' : ` ${missing} of them have no backup.`)
      );
    }
    if (errors.length) warnings.push(`A backup was not written: ${errors.join('; ')}`);
  }

  // Local copy: the commit is done, so a failure here is a warning only.
  let localCopy: CommitOk['localCopy'] = 'none';
  if (deps.store) {
    try {
      const done = await deps.store.recordCommittedFunction(target.instance, target.project, {
        name: args.name, src: args.src, doc, modIso: mod, record: dict,
      });
      localCopy = done.metadata ? 'updated' : done.files ? 'files-only' : 'none';
    } catch (error: any) {
      localCopy = 'failed';
      warnings.push(`The local copy was not updated: ${error.message}`);
    }
  }

  return {
    status: 'ok',
    operation,
    mod,
    hash: sha256Hex(args.src),
    doc,
    backedUp: backupPath !== null,
    backupPath,
    removedDuplicates: dupSrcs.length,
    localCopy,
    ...(warnings.length ? { warning: warnings.join(' ') } : {}),
  };
}
