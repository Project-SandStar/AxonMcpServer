/**
 * Docs index maintenance: fingerprint for startup staleness checks, and
 * incremental (per-file) updates of the FlexSearch doc index after a sidecar sync.
 */

import * as fs from 'fs';
import * as path from 'path';
import { HtmlDocParser } from '../parser/htmlDocParser.js';
import { FlexSearchDocIndex } from './flexSearchIndex.js';
import type { DocumentSection, HtmlDocument } from '../types/documentation.js';

/**
 * Pick one section by anchor id, exact heading, or heading substring (case-insensitive),
 * plus the deeper-level sub-sections that follow it. Null if no match.
 */
export function pickDocSections(doc: HtmlDocument, section: string): DocumentSection[] | null {
  const want = section.replace(/^#/, '').trim().toLowerCase();
  if (!want) return null;
  const hit = doc.sections.find(s => s.id.toLowerCase() === want)
    || doc.sections.find(s => s.heading.toLowerCase() === want)
    || doc.sections.find(s => s.heading.toLowerCase().includes(want));
  if (!hit) return null;
  const i = doc.sections.indexOf(hit);
  const out = [hit];
  for (let j = i + 1; j < doc.sections.length && doc.sections[j].level > hit.level; j++) out.push(doc.sections[j]);
  return out;
}

export interface DocsFingerprint {
  fileCount: number;
  newestMtimeMs: number;
}

export interface DocUpdateResult {
  added: number;
  updated: number;
  removed: number;
  skipped: number;
  errors: string[];
  durationMs: number;
}

/** Files that the doc index never holds. */
export function isIndexableDoc(file: string): boolean {
  return /\.html?$/i.test(file) && path.basename(file) !== 'AxonUsage.html';
}

/** Recursive list of indexable HTML files under docsPath. */
export function listDocFiles(docsPath: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && isIndexableDoc(e.name)) out.push(full);
    }
  };
  walk(docsPath);
  return out;
}

/** File count + newest mtime of all indexable HTML files. */
export function docsFingerprint(docsPath: string): DocsFingerprint {
  let newest = 0;
  const files = listDocFiles(docsPath);
  for (const f of files) {
    try {
      const m = fs.statSync(f).mtimeMs;
      if (m > newest) newest = m;
    } catch { /* deleted during scan */ }
  }
  return { fileCount: files.length, newestMtimeMs: Math.floor(newest) };
}

/** Resolve a root-relative path inside base; null if unsafe. */
function safeJoin(base: string, rel: string): string | null {
  if (typeof rel !== 'string' || !rel || rel.includes('\0')) return null;
  if (path.isAbsolute(rel) || /^[A-Za-z]:/.test(rel)) return null;
  const parts = rel.split(/[\\/]+/);
  if (parts.some(p => p === '..')) return null;
  const root = path.resolve(base);
  const abs = path.resolve(root, ...parts);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

/**
 * Apply changed/deleted paths (relative to docsPath) to the index.
 * Existing file = re-parse and upsert; missing file = remove.
 * A changed directory path re-scans that directory.
 */
export async function applyDocChanges(
  index: FlexSearchDocIndex,
  parser: HtmlDocParser,
  docsPath: string,
  relPaths: string[],
): Promise<DocUpdateResult> {
  const start = Date.now();
  const res: DocUpdateResult = { added: 0, updated: 0, removed: 0, skipped: 0, errors: [], durationMs: 0 };
  const files = new Set<string>();

  for (const rel of relPaths) {
    const abs = safeJoin(docsPath, rel);
    if (!abs) { res.skipped++; res.errors.push(`Unsafe path: ${rel}`); continue; }
    let stat: fs.Stats | null = null;
    try { stat = fs.statSync(abs); } catch { stat = null; }
    if (stat?.isDirectory()) {
      for (const f of listDocFiles(abs)) files.add(f);
      // Docs under a deleted-and-recreated dir that no longer exist:
      for (const doc of index.listDocuments()) {
        if (doc.filePath.startsWith(abs + path.sep) && !fs.existsSync(doc.filePath)) files.add(doc.filePath);
      }
    } else if (!stat) {
      // Deleted file or deleted directory.
      if (isIndexableDoc(abs)) files.add(abs);
      for (const doc of index.listDocuments()) {
        if (doc.filePath.startsWith(abs + path.sep)) files.add(doc.filePath);
      }
    } else if (isIndexableDoc(abs)) {
      files.add(abs);
    } else {
      res.skipped++;
    }
  }

  for (const file of files) {
    try {
      if (!fs.existsSync(file)) {
        const old = index.getByFilePath(file);
        if (old && await index.removeDocument(old.id)) res.removed++;
        else res.skipped++;
        continue;
      }
      const html = fs.readFileSync(file, 'utf-8');
      const doc = parser.parseDocument(html, file, docsPath);
      if (!doc) {
        // Now filtered out (e.g. Fantom-only): drop any old copy.
        const old = index.getByFilePath(file);
        if (old && await index.removeDocument(old.id)) res.removed++;
        else res.skipped++;
        continue;
      }
      const r = await index.upsertDocument(doc);
      if (r === 'added') res.added++; else res.updated++;
    } catch (err) {
      res.errors.push(`${path.relative(docsPath, file)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  res.durationMs = Date.now() - start;
  return res;
}

/**
 * Debounced, serial queue of doc paths. Bursts of hooks merge into one run.
 */
export class DocChangeQueue {
  private pending = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private rerun = false;
  lastResult: DocUpdateResult | null = null;

  constructor(
    private readonly job: (paths: string[]) => Promise<DocUpdateResult>,
    private readonly debounceMs = 2000,
  ) {}

  enqueue(paths: string[]): { pending: number; running: boolean } {
    for (const p of paths) this.pending.add(p);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.run(); }, this.debounceMs);
    return this.status();
  }

  status(): { pending: number; running: boolean } {
    return { pending: this.pending.size, running: this.running };
  }

  /** Run now (also used by tests). Resolves when the queue is empty. */
  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    await this.run();
    while (this.running) await new Promise(r => setTimeout(r, 10));
  }

  private async run(): Promise<void> {
    if (this.running) { this.rerun = true; return; }
    this.running = true;
    try {
      do {
        this.rerun = false;
        const batch = [...this.pending];
        this.pending.clear();
        if (batch.length === 0) break;
        try {
          this.lastResult = await this.job(batch);
        } catch (err) {
          console.error('[docs] update failed:', err);
        }
      } while (this.rerun || this.pending.size > 0);
    } finally {
      this.running = false;
    }
  }
}
