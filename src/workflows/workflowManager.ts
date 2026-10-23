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
  /** 'generic' for workflows/*.md, 'project' for workflows/proj/<instance>/<project>/*.md */
  scope: 'generic' | 'project';
  instance?: string;
  project?: string;
  customer?: string;
  funcs?: string[];
  lastVerified?: string;
}

/**
 * Which workflows a list/search may return.
 * - undefined: generic workflows only
 * - { instance, project }: generic + that project's workflows (project first)
 * - '*': every workflow
 */
export type ProjectFilter = { instance: string; project: string } | '*' | undefined;

/** Files in project folders that are not workflows. */
const NON_WORKFLOW_FILES = new Set(['README.md', 'RULES.md']);

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
  scope: 'generic' | 'project';
  instance?: string;
  project?: string;
  lastVerified?: string;
  score?: number;
}

export interface SearchOptions {
  query?: string;
  category?: string;
  tags?: string[];
  semantic?: boolean;
  limit?: number;
  project?: ProjectFilter;
}

/** Score bonus so the active project's workflows rank above generic ones. */
const PROJECT_BOOST = 1;

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
      // recursive: also watch workflows/proj/<instance>/<project>/ (macOS + Windows; Linux on Node 20+)
      this.watcher = fs.watch(this.workflowsDir, { persistent: false, recursive: true }, (_eventType, filename) => {
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

    for (const filePath of await this.findWorkflowFiles(this.workflowsDir, true)) {
      await this.loadWorkflow(filePath);
    }

    console.error(`Loaded ${this.workflows.size} workflows`);
  }

  /**
   * Find workflow .md files. Top level: every .md. Sub-folders: skip README.md,
   * RULES.md, and files or folders that start with '_' or '.'.
   */
  private async findWorkflowFiles(dir: string, topLevel: boolean): Promise<string[]> {
    const out: string[] = [];
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name.startsWith('_')) continue;
        out.push(...await this.findWorkflowFiles(full, false));
      } else if (e.isFile() && e.name.endsWith('.md')) {
        if (!topLevel && (NON_WORKFLOW_FILES.has(e.name) || e.name.startsWith('_'))) continue;
        out.push(full);
      }
    }
    return out.sort();
  }

  /**
   * Workflow id: file name for generic workflows (unchanged), and the path
   * relative to workflowsDir for sub-folders, e.g. proj/<instance>/<project>/<file>.
   */
  private idFor(filePath: string): string {
    const rel = path.relative(this.workflowsDir, filePath).split(path.sep).join('/');
    return rel.replace(/\.md$/, '');
  }

  /** instance/project from a proj/<instance>/<project>/<file>.md path. */
  private projectFromPath(id: string): { instance?: string; project?: string } {
    const parts = id.split('/');
    if (parts[0] === 'proj' && parts.length >= 4) {
      return { instance: parts[1], project: parts[2] };
    }
    return {};
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
    const filename = this.idFor(filePath);
    const fromPath = this.projectFromPath(filename);
    const inProjFolder = fromPath.instance !== undefined;

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
        version: String(parsedMeta.version ?? '1.0'),
        scope: inProjFolder || parsedMeta.scope === 'project' ? 'project' : 'generic',
        instance: str(parsedMeta.instance) ?? fromPath.instance,
        project: str(parsedMeta.project) ?? fromPath.project,
        customer: str(parsedMeta.customer),
        funcs: Array.isArray(parsedMeta.funcs) ? parsedMeta.funcs.map(String) : undefined,
        lastVerified: str(parsedMeta.lastVerified),
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
        scope: inProjFolder ? 'project' : 'generic',
        ...fromPath,
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
   * True if the project filter lets this workflow through.
   */
  static matchesProject(meta: WorkflowMetadata, filter: ProjectFilter): boolean {
    if (meta.scope === 'generic') return true;
    if (filter === '*') return true;
    if (!filter) return false;
    return meta.instance === filter.instance && meta.project === filter.project;
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
   * Write a project workflow to workflows/proj/<instance>/<project>/<name>.md,
   * add it to that folder's README.md index, and reload. Never commits.
   * Throws an Error with a plain message when the input is not valid.
   */
  async saveProjectWorkflow(opts: {
    instance: string;
    project: string;
    name: string;
    content: string;
    overwrite?: boolean;
  }): Promise<{ id: string; filePath: string; created: boolean; warnings: string[] }> {
    const { instance, project, content } = opts;
    const name = opts.name.replace(/\.md$/, '');
    const warnings: string[] = [];

    for (const [label, v] of [['instance', instance], ['project', project]] as const) {
      if (!v || v.includes('/') || v.includes('\\') || v.startsWith('.') || v.startsWith('_')) {
        throw new Error(`Bad ${label} name: "${v}"`);
      }
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name) || NON_WORKFLOW_FILES.has(`${name}.md`)) {
      throw new Error(`Bad workflow name "${opts.name}". Use kebab-case, e.g. "pump-reset".`);
    }

    const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    if (!match) throw new Error('Content must start with YAML frontmatter (--- ... ---).');
    let meta: any;
    try {
      meta = yaml.parse(match[1]) ?? {};
    } catch (e: any) {
      throw new Error(`Frontmatter is not valid YAML: ${e?.message || e}`);
    }
    for (const key of ['title', 'description', 'category']) {
      if (!meta[key]) throw new Error(`Frontmatter needs "${key}".`);
    }
    if (meta.instance && String(meta.instance) !== instance) {
      throw new Error(`Frontmatter instance "${meta.instance}" does not match "${instance}".`);
    }
    if (meta.project && String(meta.project) !== project) {
      throw new Error(`Frontmatter project "${meta.project}" does not match "${project}".`);
    }
    if (meta.scope && meta.scope !== 'project') warnings.push('scope is not "project"; it is saved as a project workflow anyway.');
    if (!meta.lastVerified) warnings.push('No lastVerified date.');

    const secret = findSecret(content);
    if (secret) throw new Error(`Content looks like it has a secret (${secret}). Remove it first.`);

    const dir = path.join(this.workflowsDir, 'proj', instance, project);
    const filePath = path.join(dir, `${name}.md`);
    const exists = fs.existsSync(filePath);
    if (exists && !opts.overwrite) {
      throw new Error(`Workflow exists: ${filePath}. Set overwrite: true to replace it.`);
    }

    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(filePath, content.endsWith('\n') ? content : content + '\n', 'utf8');
    await this.addToProjectIndex(dir, instance, project, name, String(meta.title), String(meta.description));

    const id = this.idFor(filePath);
    this.summaryCache.invalidate(id);
    await this.loadWorkflows();
    return { id, filePath, created: !exists, warnings };
  }

  /** Add or refresh one line in the project README.md index. */
  private async addToProjectIndex(dir: string, instance: string, project: string, name: string, title: string, description: string) {
    const readme = path.join(dir, 'README.md');
    let text = fs.existsSync(readme)
      ? await fs.promises.readFile(readme, 'utf8')
      : `# ${project} workflows\n\nInstance: \`${instance}\`\n\nRead \`RULES.md\` first.\n\n## Workflows\n\n`;
    const line = `- [${title}](${name}.md) — ${description}`;
    const lines = text.split('\n');
    const at = lines.findIndex(l => l.includes(`](${name}.md)`));
    if (at >= 0) {
      lines[at] = line;
      text = lines.join('\n');
    } else if (text.includes('_None yet._')) {
      text = text.replace('_None yet._', line);
    } else {
      text = text.replace(/\n*$/, '\n') + line + '\n';
    }
    await fs.promises.writeFile(readme, text, 'utf8');
  }

  /**
   * Titles of one project's workflows, for the project switch response.
   */
  getProjectWorkflowList(instance: string, project: string): Array<{ id: string; title: string; lastVerified?: string }> {
    return this.getWorkflowList()
      .filter(w => w.metadata.scope === 'project' && w.metadata.instance === instance && w.metadata.project === project)
      .map(w => ({ id: w.metadata.id, title: w.metadata.title, lastVerified: w.metadata.lastVerified }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Path to a project's RULES.md, if it exists. */
  getProjectRulesPath(instance: string, project: string): string | undefined {
    const p = path.join(this.workflowsDir, 'proj', instance, project, 'RULES.md');
    return fs.existsSync(p) ? p : undefined;
  }

  /**
   * Return summaries for every loaded workflow (cached or freshly generated).
   */
  getAllSummaries(project: ProjectFilter = '*'): WorkflowSearchHit[] {
    const out: WorkflowSearchHit[] = [];
    for (const workflow of this.workflows.values()) {
      if (!WorkflowManager.matchesProject(workflow.metadata, project)) continue;
      const summary = this.getSummary(workflow.metadata.id)!;
      out.push(this.toHit(workflow, summary));
    }
    // Project workflows first, then generic, then by id.
    out.sort((a, b) => (a.scope === b.scope ? a.id.localeCompare(b.id) : a.scope === 'project' ? -1 : 1));
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
      if (!WorkflowManager.matchesProject(meta, opts.project)) continue;
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
        if (!WorkflowManager.matchesProject(workflow.metadata, opts.project)) continue;
        if (opts.category && workflow.metadata.category !== opts.category) continue;
        const summary = this.getSummary(sh.id)!;
        candidates.push({ ...this.toHit(workflow, summary), score: sh.score });
      }
    }

    // Rank the active project's workflows above generic ones.
    if (opts.project && opts.project !== '*') {
      for (const hit of candidates) {
        if (hit.scope === 'project') hit.score = (hit.score ?? 0) + PROJECT_BOOST;
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
      scope: workflow.metadata.scope,
      instance: workflow.metadata.instance,
      project: workflow.metadata.project,
      lastVerified: workflow.metadata.lastVerified,
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

/** Non-empty string, or undefined. YAML can give dates or numbers. */
function str(v: unknown): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

/** Name of the first secret-looking pattern in text, or undefined. */
function findSecret(text: string): string | undefined {
  const checks: Array<[string, RegExp]> = [
    ['password value', /\b(password|passwd|pwd)\s*[:=]\s*["']?[^\s"'<>{}]{4,}/i],
    ['token or key value', /\b(api[_-]?key|secret|token|bearer)\s*[:=]\s*["']?[A-Za-z0-9_\-.]{16,}/i],
    ['GitLab token', /\bglpat-[A-Za-z0-9_\-]{16,}/],
    ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ['URL with login', /https?:\/\/[^\s:@\/]+:[^\s@\/]+@/],
  ];
  for (const [label, re] of checks) if (re.test(text)) return label;
  return undefined;
}
