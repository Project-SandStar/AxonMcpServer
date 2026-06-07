import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { generateLocalSummary, generateClaudeSummary, type WorkflowSummary } from './summaryGenerator.js';
import { SummaryCache } from './summaryCache.js';

/**
 * Metadata extracted from workflow frontmatter
 */
export interface WorkflowMetadata {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  version: string;
}

/**
 * Complete workflow with metadata and content
 */
export interface Workflow {
  metadata: WorkflowMetadata;
  content: string;
  fullContent: string; // Content including frontmatter
  uri: string;
  filePath: string;
  mtimeMs: number;
}

export interface WorkflowSearchHit extends WorkflowSummary {
  category: string;
  tags: string[];
  description: string;
  uri: string;
  score?: number;
}

export interface SearchOptions {
  query?: string;
  category?: string;
  tags?: string[];
  semantic?: boolean;
  limit?: number;
}

/**
 * Manages workflow documentation files for MCP resources
 */
export class WorkflowManager {
  private workflows: Map<string, Workflow> = new Map();
  private workflowsByCategory: Map<string, Workflow[]> = new Map();
  private watcher?: fs.FSWatcher;
  private watchDebounce?: NodeJS.Timeout;
  private reloadListeners: Array<() => void> = [];
  private summaryCache: SummaryCache;

  constructor(private workflowsDir: string, cacheDir: string = '.cache') {
    this.summaryCache = new SummaryCache(cacheDir);
    this.summaryCache.loadFromDisk();
  }

  /**
   * Subscribe to reload events fired after the directory watcher (or an
   * explicit reload) refreshes the in-memory workflow map. Returns an
   * unsubscribe fn.
   */
  onReload(fn: () => void): () => void {
    this.reloadListeners.push(fn);
    return () => {
      this.reloadListeners = this.reloadListeners.filter(l => l !== fn);
    };
  }

  /**
   * Start watching the workflows directory for new/changed/removed .md files
   * so newly generated workflows show up without restarting the server.
   * Debounces rapid bursts (editors emit multiple events per save).
   */
  startWatching(): void {
    if (this.watcher) return;
    if (!fs.existsSync(this.workflowsDir)) {
      // Create the directory so the watcher has something to attach to.
      try {
        fs.mkdirSync(this.workflowsDir, { recursive: true });
      } catch {
        return;
      }
    }

    try {
      this.watcher = fs.watch(this.workflowsDir, { persistent: false }, (_eventType, filename) => {
        if (!filename || !filename.endsWith('.md')) return;
        if (this.watchDebounce) clearTimeout(this.watchDebounce);
        this.watchDebounce = setTimeout(async () => {
          console.error(`👀 Workflow change detected (${filename}) — reloading…`);
          try {
            await this.loadWorkflows();
            for (const fn of this.reloadListeners) {
              try { fn(); } catch (err: any) {
                console.error(`⚠️  Workflow reload listener failed: ${err?.message || err}`);
              }
            }
          } catch (err: any) {
            console.error(`⚠️  Workflow auto-reload failed: ${err?.message || err}`);
          }
        }, 200);
      });
      this.watcher.on('error', (err) => {
        console.error(`⚠️  Workflow watcher error: ${err.message}`);
      });
      console.error(`👀 Watching ${this.workflowsDir} for workflow changes`);
    } catch (err: any) {
      console.error(`⚠️  Failed to start workflow watcher: ${err?.message || err}`);
    }
  }

  stopWatching(): void {
    if (this.watchDebounce) clearTimeout(this.watchDebounce);
    this.watcher?.close();
    this.watcher = undefined;
  }

  /**
   * Load all workflow markdown files from the workflows directory
   */
  async loadWorkflows(): Promise<void> {
    this.workflows.clear();
    this.workflowsByCategory.clear();

    // Check if workflows directory exists
    if (!fs.existsSync(this.workflowsDir)) {
      console.warn(`Workflows directory does not exist: ${this.workflowsDir}`);
      return;
    }

    const files = await fs.promises.readdir(this.workflowsDir);

    for (const file of files) {
      if (file.endsWith('.md')) {
        const filePath = path.join(this.workflowsDir, file);
        await this.loadWorkflow(filePath);
      }
    }

    console.error(`Loaded ${this.workflows.size} workflows`);
  }

  /**
   * Load a single workflow file
   */
  private async loadWorkflow(filePath: string): Promise<void> {
    try {
      const [fullContent, stat] = await Promise.all([
        fs.promises.readFile(filePath, 'utf8'),
        fs.promises.stat(filePath),
      ]);
      const workflow = this.parseWorkflow(filePath, fullContent, stat.mtimeMs);

      // Store workflow
      this.workflows.set(workflow.metadata.id, workflow);

      // Index by category
      if (!this.workflowsByCategory.has(workflow.metadata.category)) {
        this.workflowsByCategory.set(workflow.metadata.category, []);
      }
      this.workflowsByCategory.get(workflow.metadata.category)!.push(workflow);

      console.error(`Loaded workflow: ${workflow.metadata.id} (${workflow.metadata.title})`);
    } catch (error) {
      console.error(`Failed to load workflow from ${filePath}:`, error);
    }
  }

  /**
   * Parse workflow file, extracting frontmatter and content
   */
  private parseWorkflow(filePath: string, fullContent: string, mtimeMs: number): Workflow {
    const filename = path.basename(filePath, '.md');

    // Extract frontmatter (YAML between --- delimiters)
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = fullContent.match(frontmatterRegex);

    let metadata: WorkflowMetadata;
    let content: string;

    if (match) {
      // Parse frontmatter
      const frontmatterStr = match[1];
      const parsedMeta = yaml.parse(frontmatterStr);

      metadata = {
        id: filename,
        title: parsedMeta.title || filename,
        description: parsedMeta.description || '',
        category: parsedMeta.category || 'general',
        tags: parsedMeta.tags || [],
        version: parsedMeta.version || '1.0',
      };

      content = match[2].trim();
    } else {
      // No frontmatter found
      metadata = {
        id: filename,
        title: filename,
        description: '',
        category: 'general',
        tags: [],
        version: '1.0',
      };

      content = fullContent.trim();
    }

    const uri = `workflow://${metadata.id}`;

    return {
      metadata,
      content,
      fullContent,
      uri,
      filePath,
      mtimeMs,
    };
  }

  /**
   * Get list of all workflows (for ListResources)
   */
  getWorkflowList(): Workflow[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Get a specific workflow by ID (for ReadResource)
   */
  getWorkflow(id: string): Workflow | undefined {
    return this.workflows.get(id);
  }

  /**
   * Get workflows by category
   */
  getWorkflowsByCategory(category: string): Workflow[] {
    return this.workflowsByCategory.get(category) || [];
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    return Array.from(this.workflowsByCategory.keys()).sort();
  }

  /**
   * Get workflow statistics
   */
  getStatistics(): {
    totalWorkflows: number;
    byCategory: Record<string, number>;
  } {
    const byCategory: Record<string, number> = {};
    for (const [cat, workflows] of this.workflowsByCategory) {
      byCategory[cat] = workflows.length;
    }

    return {
      totalWorkflows: this.workflows.size,
      byCategory,
    };
  }

  // ============================================
  // Summary surface
  // ============================================

  /**
   * Return the cached summary for a workflow, generating a fresh local one if
   * the cache is missing or stale (mtime mismatch).
   */
  getSummary(id: string): WorkflowSummary | undefined {
    const workflow = this.workflows.get(id);
    if (!workflow) return undefined;

    const cached = this.summaryCache.getFresh(id, workflow.mtimeMs);
    if (cached) return cached;

    const fresh = generateLocalSummary(workflow, workflow.mtimeMs);
    this.summaryCache.set(id, fresh);
    return fresh;
  }

  /**
   * Force-regenerate a summary using the supplied provider. Updates the cache.
   */
  async regenerateSummary(id: string, provider: 'local' | 'claude'): Promise<WorkflowSummary | undefined> {
    const workflow = this.workflows.get(id);
    if (!workflow) return undefined;

    const summary = provider === 'claude'
      ? await generateClaudeSummary(workflow, workflow.mtimeMs)
      : generateLocalSummary(workflow, workflow.mtimeMs);

    this.summaryCache.set(id, summary);
    this.summaryCache.flushSync();
    return summary;
  }

  /**
   * Bulk-regenerate local summaries for every loaded workflow. Used by the
   * dashboard's header "Regenerate (local)" button.
   */
  regenerateAllLocal(): { regenerated: number } {
    let count = 0;
    for (const workflow of this.workflows.values()) {
      const fresh = generateLocalSummary(workflow, workflow.mtimeMs);
      this.summaryCache.set(workflow.metadata.id, fresh);
      count++;
    }
    this.summaryCache.flushSync();
    return { regenerated: count };
  }

  /**
   * Persist edited markdown content for a workflow back to disk. The fs.watch
   * watcher will fire and reload the in-memory entry; we also update it
   * synchronously so callers see fresh state immediately.
   */
  async saveWorkflow(id: string, content: string): Promise<Workflow | undefined> {
    const existing = this.workflows.get(id);
    if (!existing) return undefined;
    await fs.promises.writeFile(existing.filePath, content, 'utf8');
    const stat = await fs.promises.stat(existing.filePath);
    const updated = this.parseWorkflow(existing.filePath, content, stat.mtimeMs);
    this.workflows.set(id, updated);
    // Re-bucket by category in case it changed.
    for (const [cat, list] of this.workflowsByCategory) {
      const idx = list.findIndex(w => w.metadata.id === id);
      if (idx >= 0) list.splice(idx, 1);
      if (list.length === 0) this.workflowsByCategory.delete(cat);
    }
    if (!this.workflowsByCategory.has(updated.metadata.category)) {
      this.workflowsByCategory.set(updated.metadata.category, []);
    }
    this.workflowsByCategory.get(updated.metadata.category)!.push(updated);
    // Invalidate summary so the next read regenerates.
    this.summaryCache.invalidate(id);
    return updated;
  }

  /**
   * Return summaries for every loaded workflow (cached or freshly generated).
   */
  getAllSummaries(): WorkflowSearchHit[] {
    const out: WorkflowSearchHit[] = [];
    for (const workflow of this.workflows.values()) {
      const summary = this.getSummary(workflow.metadata.id)!;
      out.push(this.toHit(workflow, summary));
    }
    return out;
  }

  /**
   * Search workflows by category/tag/keyword. Semantic results are merged in
   * by `searchSummariesAsync` (kept here as an injectable callback so the
   * vector store stays a soft dependency).
   */
  searchSummaries(opts: SearchOptions, semanticHits?: Array<{ id: string; score: number }>): WorkflowSearchHit[] {
    const limit = opts.limit ?? 10;
    const queryLc = opts.query?.toLowerCase().trim() || '';

    const tagFilter = (opts.tags ?? []).map(t => t.toLowerCase());
    const candidates: WorkflowSearchHit[] = [];

    for (const workflow of this.workflows.values()) {
      const meta = workflow.metadata;
      if (opts.category && meta.category !== opts.category) continue;
      if (tagFilter.length > 0) {
        const lower = meta.tags.map(t => t.toLowerCase());
        if (!tagFilter.every(t => lower.includes(t))) continue;
      }

      let score = 0;
      if (queryLc) {
        const haystack = [meta.title, meta.description, meta.category, ...(meta.tags ?? [])]
          .filter(Boolean).join(' ').toLowerCase();
        if (haystack.includes(queryLc)) score += 1;
        if (meta.title.toLowerCase().includes(queryLc)) score += 0.5;
      } else {
        score = 1; // unranked filter-only browse
      }

      if (score > 0 || !queryLc) {
        const summary = this.getSummary(meta.id)!;
        candidates.push({ ...this.toHit(workflow, summary), score });
      }
    }

    if (semanticHits && semanticHits.length > 0) {
      const semScores = new Map(semanticHits.map(h => [h.id, h.score]));
      for (const hit of candidates) {
        const sem = semScores.get(hit.id);
        if (sem !== undefined) hit.score = (hit.score ?? 0) + sem;
      }
      // Add semantic-only hits not already present
      for (const sh of semanticHits) {
        if (candidates.some(c => c.id === sh.id)) continue;
        const workflow = this.workflows.get(sh.id);
        if (!workflow) continue;
        if (opts.category && workflow.metadata.category !== opts.category) continue;
        const summary = this.getSummary(sh.id)!;
        candidates.push({ ...this.toHit(workflow, summary), score: sh.score });
      }
    }

    candidates.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return candidates.slice(0, limit);
  }

  private toHit(workflow: Workflow, summary: WorkflowSummary): WorkflowSearchHit {
    return {
      ...summary,
      category: workflow.metadata.category,
      tags: workflow.metadata.tags,
      description: workflow.metadata.description,
      uri: workflow.uri,
    };
  }

  /**
   * Drop cached summaries for workflows that no longer exist.
   */
  pruneSummaryCache(): void {
    const validIds = new Set(this.workflows.keys());
    this.summaryCache.prune(validIds);
  }
}
