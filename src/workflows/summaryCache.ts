/**
 * Disk-backed cache for workflow summaries. JSON file at .cache/workflow-summaries.json.
 * Keyed by workflow id; entries are invalidated when sourceMtime no longer
 * matches the underlying file's mtime.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { WorkflowSummary } from './summaryGenerator.js';

const FLUSH_DEBOUNCE_MS = 500;

export class SummaryCache {
  private store: Map<string, WorkflowSummary> = new Map();
  private flushTimer?: NodeJS.Timeout;
  private filePath: string;
  private loaded = false;

  constructor(cacheDir: string) {
    this.filePath = path.join(cacheDir, 'workflow-summaries.json');
  }

  loadFromDisk(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, WorkflowSummary>;
      for (const [id, entry] of Object.entries(parsed)) {
        this.store.set(id, entry);
      }
    } catch (err: any) {
      console.error(`[summary-cache] Failed to load ${this.filePath}: ${err?.message || err}`);
    }
  }

  get(id: string): WorkflowSummary | undefined {
    return this.store.get(id);
  }

  /** Returns the cached entry only if its sourceMtime matches the supplied value. */
  getFresh(id: string, sourceMtime: number): WorkflowSummary | undefined {
    const hit = this.store.get(id);
    if (!hit) return undefined;
    if (hit.sourceMtime !== sourceMtime) return undefined;
    return hit;
  }

  set(id: string, summary: WorkflowSummary): void {
    this.store.set(id, summary);
    this.scheduleFlush();
  }

  invalidate(id: string): void {
    if (this.store.delete(id)) this.scheduleFlush();
  }

  prune(validIds: Set<string>): void {
    let changed = false;
    for (const id of [...this.store.keys()]) {
      if (!validIds.has(id)) {
        this.store.delete(id);
        changed = true;
      }
    }
    if (changed) this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flushSync(), FLUSH_DEBOUNCE_MS);
  }

  flushSync(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const obj: Record<string, WorkflowSummary> = {};
      for (const [id, entry] of this.store) obj[id] = entry;
      fs.writeFileSync(this.filePath, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err: any) {
      console.error(`[summary-cache] Failed to flush ${this.filePath}: ${err?.message || err}`);
    }
  }
}
