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
 * up by name and updated in place. Axon `if` is an expression; each branch
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
    '  existing: read(func and name==ideName, false)',
    '  curMs: if (existing == null) null else toJavaMillis(existing->mod)',
    `  stale: ${stale}`,
    `  changes: {${changes.join(', ')}}`,
    `  keep: [${KEEP_TAGS.map(t => `"${t}"`).join(', ')}]`,
    '  if (stale) do',
    '    if (existing == null) {ideStatus: "conflict"} else {ideStatus: "conflict", mod: existing->mod, ideCurSrc: existing["src"]}',
    '  end else do',
    '    rec: if (existing == null) commit(diff(null, merge({func, name: ideName}, changes), {add})) else commit(diff(existing, changes))',
    '    merge(rec.findAll((v, n) => keep.contains(n)), {ideStatus: "ok", ideOp: if (existing == null) "added" else "updated", idePrevSrc: if (existing == null) null else existing["src"]})',
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

function str(dict: FuncRecord, tag: string): string | null {
  if (!present(dict, tag)) return null;
  const value = dict.get(tag) as any;
  return typeof value.value === 'string' ? value.value : String(value);
}

async function writeBackup(
  baseDir: string, target: CommitTarget, name: string, prevSrc: string, keep: number
): Promise<string> {
  const dir = path.join(baseDir, target.instance, target.project, '.backups', name);
  await fs.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `backup-${stamp}.axon`);
  await fs.writeFile(file, prevSrc);
  const old = (await fs.readdir(dir)).filter(f => f.startsWith('backup-')).sort().reverse().slice(keep);
  for (const f of old) await fs.unlink(path.join(dir, f));
  return file;
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

  // Backup of the source that the commit replaced (it came back in the same eval).
  let backupPath: string | null = null;
  const prevSrc = str(dict, 'idePrevSrc');
  if (prevSrc) {
    try {
      backupPath = await writeBackup(baseDir, target, args.name, prevSrc, deps.maxBackups ?? 10);
    } catch (error: any) {
      warnings.push(`The backup was not written: ${error.message}`);
    }
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
    localCopy,
    ...(warnings.length ? { warning: warnings.join(' ') } : {}),
  };
}
