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
 *    {add}). Older records with the same name are removed, but each one is
 *    backed up first: a first eval reads them, the whole record (id, mod, src,
 *    doc and every other tag) goes to a file in the function backups, and only
 *    then the commit eval removes them. When a backup cannot be written,
 *    nothing is committed and no record is removed (CommitBackupError).
 *    The commit eval removes only the records it got a backup for, and only
 *    when their `mod` is still the same.
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
  /**
   * Older records with the same name that the commit removed (empty in the
   * normal case). Each one was backed up before it was removed.
   */
  removedDuplicates: RemovedDuplicate[];
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

/** An older func record that a commit backed up and then removed. */
export interface RemovedDuplicate {
  /** The record id, without "@". */
  id: string;
  /** The record's mod (ISO) when it was backed up. */
  mod: string | null;
  /** The backup file that holds the whole record. */
  backup: string;
}

/** A bad argument. Callers answer 400 or InvalidParams. */
export class CommitArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommitArgError';
  }
}

/**
 * The backup of an older record with the same name was not written. Nothing
 * was committed and no record was removed. Callers answer 500 or an error reply.
 */
export class CommitBackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommitBackupError';
  }
}

/** A record that the commit eval may remove: it has a backup with this mod. */
export interface BackedUpRecord {
  id: string;
  /** The record's mod in milliseconds when it was backed up. */
  ms: number;
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
 * The Axon of the first eval: every func record with this name, with all
 * their tags. It writes nothing.
 */
export function buildReadRecordsAxon(name: string): string {
  if (!isFunctionName(name)) throw new CommitArgError('Invalid function name.');
  return `readAll(func and name==${axonStr(name)})`;
}

/**
 * The Axon that does the check and the commit in one eval.
 *
 * Folio has a unique id but no unique name on func, so the record is looked
 * up by name and updated in place. When older records with the same name are
 * there (left by an old commit that always added), the newest one is updated.
 * Of the others, the eval removes only those in `backedUp` (they have a
 * backup) whose mod is still the one that was backed up; the rest stay and
 * are counted in ideLeft. A new function is the only case that adds a record.
 * Axon `if` is an expression; each branch here is a `do ... end` block.
 */
export function buildCommitAxon(args: CommitArgs, backedUp: BackedUpRecord[] = []): string {
  checkArgs(args);
  for (const b of backedUp) {
    if (typeof b.id !== 'string' || b.id.length === 0 || !Number.isSafeInteger(b.ms)) {
      throw new Error('A backed-up record has no id or no mod.');
    }
  }

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
    // Only the records with a backup, and only when they did not change since.
    `  ideBacked: [${backedUp.map(b => `{id: parseRef(${axonStr(b.id)}), ms: ${b.ms}ms}`).join(', ')}]`,
    '  gone: extras.findAll(x => ideBacked.any(b => b->id == x->id and b->ms == toJavaMillis(x->mod)))',
    '  curMs: if (existing == null) null else toJavaMillis(existing->mod)',
    `  stale: ${stale}`,
    `  changes: {${changes.join(', ')}}`,
    `  keep: [${KEEP_TAGS.map(t => `"${t}"`).join(', ')}]`,
    '  if (stale) do',
    '    if (existing == null) {ideStatus: "conflict"} else {ideStatus: "conflict", mod: existing->mod, ideCurSrc: existing["src"]}',
    '  end else do',
    '    rec: if (existing == null) commit(diff(null, merge({func, name: ideName}, changes), {add})) else commit(diff(existing, changes))',
    '    gone.each(x => commit(diff(x, null, {remove})))',
    '    merge(rec.findAll((v, n) => keep.contains(n)), {ideStatus: "ok", ideOp: if (existing == null) "added" else "updated", idePrevSrc: if (existing == null) null else existing["src"], ideRemoved: gone.map(x => x->id), ideLeft: extras.size - gone.size})',
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

/** A ref or a ref string as an id without "@", or null. */
function refId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const any = value as any;
  const text = typeof any === 'string' ? any : typeof any.value === 'string' ? any.value : null;
  if (!text) return null;
  return text.startsWith('@') ? text.slice(1) : text;
}

/** The ids in a list of refs in the dict (an HList of HRef, or a plain array). */
function refList(dict: FuncRecord, tag: string): string[] {
  if (!present(dict, tag)) return [];
  const value = dict.get(tag) as any;
  const items: unknown[] = Array.isArray(value) ? value
    : typeof value?.toArray === 'function' ? value.toArray() : [];
  return items.map(refId).filter((id): id is string => id !== null);
}

function num(dict: FuncRecord, tag: string): number {
  if (!present(dict, tag)) return 0;
  const value = dict.get(tag) as any;
  const n = typeof value === 'number' ? value : Number(value?.value);
  return Number.isFinite(n) ? n : 0;
}

/** The rows of a grid reply, or null when the reply is not a grid. */
function gridRows(result: unknown): FuncRecord[] | null {
  const any = result as any;
  if (!(result instanceof HGrid) && !(any && typeof any.get === 'function' && typeof any.length === 'number')) {
    return null;
  }
  const rows: FuncRecord[] = [];
  for (let i = 0; i < any.length; i++) {
    const row = any.get(i);
    if (!row || typeof row.has !== 'function' || typeof row.get !== 'function') return null;
    rows.push(row as FuncRecord);
  }
  return rows;
}

/** One func record from the first eval. */
interface ReadRecord {
  id: string;
  modIso: string | null;
  ms: number | null;
  row: FuncRecord;
}

/** The whole record as Hayson (JSON), with every tag. */
function recordJson(row: FuncRecord): unknown {
  const any = row as any;
  if (typeof any.toJSON === 'function') return any.toJSON();
  if (typeof any.keys === 'object' && Array.isArray(any.keys)) {
    const out: Record<string, unknown> = {};
    for (const k of any.keys) {
      const v = row.get(k) as any;
      out[k] = v && typeof v.toJSON === 'function' ? v.toJSON() : v;
    }
    return out;
  }
  throw new Error('a func record from SkySpark cannot be written as JSON');
}

/** Writes a file and flushes it to disk. Fails when the file is there. */
async function writeSynced(file: string, text: string): Promise<void> {
  const handle = await fs.open(file, 'wx');
  try {
    await handle.writeFile(text, 'utf8');
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await fs.unlink(file).catch(() => undefined);
    throw error;
  }
  await handle.close();
}

/**
 * Writes the whole record of each older duplicate, before the commit removes
 * it. The files start with "removed-", so the trim of old "backup-" files
 * never deletes them: a file may be the only copy of a removed record.
 * All or nothing: when one write fails, the files written so far are deleted
 * again and CommitBackupError is thrown.
 */
async function writeDuplicateBackups(
  baseDir: string, target: CommitTarget, name: string, dups: ReadRecord[]
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const dir = path.join(baseDir, target.instance, target.project, '.backups', name);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    await fs.mkdir(dir, { recursive: true });
    for (const dup of dups) {
      const body = JSON.stringify({
        backupOf: 'an older func record with the same name, backed up before a commit removes it',
        instance: target.instance,
        project: target.project,
        name,
        id: dup.id,
        mod: dup.modIso,
        backedUpAt: new Date().toISOString(),
        src: str(dup.row, 'src'),
        doc: str(dup.row, 'doc'),
        record: recordJson(dup.row),
      }, null, 2) + '\n';
      const safeId = dup.id.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 120);
      for (let n = 0; ; n++) {
        const file = path.join(dir, `removed-${stamp}-${safeId}${n === 0 ? '' : `-${n}`}.json`);
        try {
          await writeSynced(file, body);
          files.set(dup.id, file);
          break;
        } catch (error: any) {
          if (error?.code !== 'EEXIST') throw error;
        }
      }
    }
  } catch (error: any) {
    for (const file of files.values()) await fs.unlink(file).catch(() => undefined);
    throw new CommitBackupError(
      `Function ${name} has ${dups.length} older func record(s) with the same name. ` +
      `Their backup was not written (${error?.message ?? error}), so nothing was committed and no record was removed. ` +
      'Fix the backup folder of the server and retry.'
    );
  }
  return files;
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
 * Writes one backup per src (the src that a commit replaced). files[i] is the
 * file of srcs[i], or null when it was not written. Old "backup-" files are
 * trimmed to `keep`; the files of this commit are never trimmed. The
 * "removed-" files of removed duplicates are never trimmed.
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

/** The func records with this name, newest first. Nothing is written. */
async function readRecords(target: CommitTarget, name: string): Promise<ReadRecord[]> {
  const rows = gridRows(await target.client.evalAxon(buildReadRecordsAxon(name)));
  const recs: ReadRecord[] = [];
  for (const row of rows ?? []) {
    const id = refId(present(row, 'id') ? row.get('id') : null);
    if (!id) { recs.length = 0; break; }
    const modIso = modToIso(present(row, 'mod') ? row.get('mod') : null);
    recs.push({ id, modIso, ms: modIso === null ? null : Date.parse(modIso), row });
  }
  if (!rows || recs.length !== rows.length) {
    throw new Error(
      `SkySpark sent a reply to the read of the func records named ${name} that is not understood. ` +
      'Nothing was committed.'
    );
  }
  return recs.sort((a, b) => (b.ms ?? -Infinity) - (a.ms ?? -Infinity));
}

/**
 * Commits one function. Throws CommitArgError for a bad argument,
 * CommitBackupError when an older duplicate cannot be backed up (nothing is
 * committed then), and a plain Error when SkySpark refuses an eval; a stale
 * write is a normal result.
 */
export async function commitFunction(
  target: CommitTarget, args: CommitArgs, deps: CommitDeps = {}
): Promise<CommitResult> {
  if (!isSafeSegment(target.instance) || !isSafeSegment(target.project)) {
    throw new CommitArgError('Invalid instance or project name.');
  }
  buildCommitAxon(args); // checks the arguments before anything is sent
  const baseDir = deps.baseDir ?? 'proj';

  // 1. Read the records with this name. 2. Back up each older one, whole.
  // A stale write gets no backups: the commit eval refuses it anyway.
  const recs = await readRecords(target, args.name);
  const newest = recs[0];
  const staleHere = args.expectedMod === undefined ? false
    : args.expectedMod === null ? newest !== undefined
    : !newest || newest.ms !== modToMillis(args.expectedMod);
  // A record with no mod cannot be checked again in the commit eval; it stays.
  const dups = staleHere ? [] : recs.slice(1).filter(r => r.ms !== null);
  const dupFiles = dups.length ? await writeDuplicateBackups(baseDir, target, args.name, dups) : new Map<string, string>();
  const backedUp: BackedUpRecord[] = dups.map(d => ({ id: d.id, ms: d.ms! }));
  const dropBackups = async (ids: string[]) => {
    for (const id of ids) {
      const file = dupFiles.get(id);
      if (file) await fs.unlink(file).catch(() => undefined);
    }
  };

  // 3. The commit eval. It removes only the records backed up above.
  const dict = resultDict(await target.client.evalAxon(buildCommitAxon(args, backedUp)));
  const status = dict ? str(dict, 'ideStatus') : null;
  if (!dict || (status !== 'ok' && status !== 'conflict')) {
    throw new Error(
      'SkySpark sent a reply to the commit that is not understood. ' +
      'The commit may be stored already: read the function again before you retry.' +
      (dupFiles.size ? ` The backups of the older records with the same name are kept in ${path.dirname([...dupFiles.values()][0])}.` : '')
    );
  }

  if (status === 'conflict') {
    await dropBackups(backedUp.map(b => b.id)); // nothing was removed
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
  const warnings: string[] = [];

  // The duplicates the eval removed. Each one was backed up before the eval;
  // a backup of a record the eval did not remove is deleted again.
  const removedIds = new Set(refList(dict, 'ideRemoved'));
  const removedDuplicates: RemovedDuplicate[] = dups
    .filter(d => removedIds.has(d.id) && dupFiles.has(d.id))
    .map(d => ({ id: d.id, mod: d.modIso, backup: dupFiles.get(d.id)! }));
  if (present(dict, 'ideRemoved')) {
    await dropBackups(dups.filter(d => !removedIds.has(d.id)).map(d => d.id));
  } else if (dupFiles.size) {
    // The reply does not say what was removed: keep every backup.
    warnings.push(
      `SkySpark did not say which older func records with the name ${args.name} it removed. ` +
      `Their backups are kept in ${path.dirname([...dupFiles.values()][0])}.`
    );
  }
  if (removedDuplicates.length) {
    warnings.push(
      `Removed ${removedDuplicates.length} older func record(s) with the name ${args.name}: ` +
      `${removedDuplicates.map(r => '@' + r.id).join(', ')}. Each whole record was backed up first (removedDuplicates).`
    );
  }
  const left = num(dict, 'ideLeft');
  if (left > 0) {
    warnings.push(
      `${left} older func record(s) with the name ${args.name} are still there: they had no backup ` +
      'or changed during the commit. Commit again to back them up and remove them.'
    );
  }

  // The backup of the source that the commit replaced. The commit is done,
  // so a failure here is a warning only.
  const prevSrc = str(dict, 'idePrevSrc');
  let backupPath: string | null = null;
  if (prevSrc) {
    const { files, errors } = await writeBackups(baseDir, target, args.name, [prevSrc], deps.maxBackups ?? 10);
    backupPath = files[0] ?? null;
    if (errors.length) warnings.push(`A backup was not written: ${errors.join('; ')}`);
  }
  if (backupPath === null && removedDuplicates.length) backupPath = removedDuplicates[0].backup;

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
    removedDuplicates,
    localCopy,
    ...(warnings.length ? { warning: warnings.join(' ') } : {}),
  };
}
