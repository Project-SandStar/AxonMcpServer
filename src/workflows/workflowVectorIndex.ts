/**
 * WorkflowVectorIndex — orchestrates embedding workflows into the dedicated
 * `workflow_vectors` LanceDB table. Reads workflow text from WorkflowManager,
 * runs it through the docs embedding model, and stores results via
 * WorkflowVectorStore.
 */

import type { Workflow, WorkflowManager } from './workflowManager.js';
import { getDocsEmbeddingService } from '../embedding/embeddingService.js';
import { getWorkflowVectorStore } from '../embedding/workflowVectorStore.js';

const MAX_BODY_FOR_EMBED = 1500;

export class WorkflowVectorIndex {
  private inFlight: Promise<void> | null = null;

  constructor(private manager: WorkflowManager) {}

  private buildEmbedText(workflow: Workflow, summary: string): string {
    const parts: string[] = [
      workflow.metadata.title,
      workflow.metadata.description,
      summary,
      `category: ${workflow.metadata.category}`,
      workflow.metadata.tags.length ? `tags: ${workflow.metadata.tags.join(', ')}` : '',
      workflow.content.slice(0, MAX_BODY_FOR_EMBED),
    ];
    return parts.filter(Boolean).join('\n');
  }

  /**
   * Re-embed every loaded workflow. Idempotent: existing rows are deleted
   * before insert so the table reflects the current set on disk.
   * Coalesces concurrent calls.
   */
  async reindexAll(): Promise<{ embedded: number; durationMs: number }> {
    if (this.inFlight) {
      await this.inFlight;
    }
    let resolveFn: () => void = () => {};
    this.inFlight = new Promise<void>((res) => { resolveFn = res; });

    const t0 = Date.now();
    try {
      const workflows = this.manager.getWorkflowList();
      if (workflows.length === 0) {
        return { embedded: 0, durationMs: Date.now() - t0 };
      }

      const summaries = this.manager.getAllSummaries();
      const summaryById = new Map(summaries.map(s => [s.id, s.summary] as const));

      const service = getDocsEmbeddingService();
      await service.initialize();

      const texts = workflows.map(w => this.buildEmbedText(w, summaryById.get(w.metadata.id) || ''));
      const vectors = await service.embedBatch(texts);

      const store = getWorkflowVectorStore();

      // Drop rows for workflows that no longer exist on disk.
      const currentIds = new Set(workflows.map(w => w.metadata.id));
      const stale = await this.findStaleIds(store, currentIds);
      if (stale.length > 0) await store.deleteByIds(stale);

      const items = workflows.map((w, i) => ({
        workflowId: w.metadata.id,
        embedding: vectors[i],
        category: w.metadata.category,
        title: w.metadata.title,
        tags: (w.metadata.tags ?? []).join(','),
      }));

      const stored = await store.storeEmbeddings(items);
      const durationMs = Date.now() - t0;
      console.error(`[workflow-vectors] Reindexed ${stored} workflow(s) in ${durationMs}ms`);
      return { embedded: stored, durationMs };
    } finally {
      resolveFn();
      this.inFlight = null;
    }
  }

  async reindexOne(workflowId: string): Promise<boolean> {
    const workflow = this.manager.getWorkflowList().find(w => w.metadata.id === workflowId);
    if (!workflow) return false;

    const summary = this.manager.getSummary(workflowId)?.summary ?? '';
    const service = getDocsEmbeddingService();
    await service.initialize();
    const [vector] = await service.embedBatch([this.buildEmbedText(workflow, summary)]);
    await getWorkflowVectorStore().storeEmbedding(workflowId, vector, {
      category: workflow.metadata.category,
      title: workflow.metadata.title,
      tags: (workflow.metadata.tags ?? []).join(','),
    });
    return true;
  }

  async removeFromIndex(workflowId: string): Promise<void> {
    await getWorkflowVectorStore().deleteByIds([workflowId]);
  }

  async semanticSearch(query: string, opts: { limit?: number; category?: string; tag?: string } = {}): Promise<Array<{ id: string; score: number }>> {
    try {
      const results = await getWorkflowVectorStore().searchByText(query, opts);
      return results.map(r => ({ id: r.workflowId, score: r.score }));
    } catch (err: any) {
      console.error(`[workflow-vectors] Semantic search failed: ${err?.message || err}`);
      return [];
    }
  }

  private async findStaleIds(store: ReturnType<typeof getWorkflowVectorStore>, currentIds: Set<string>): Promise<string[]> {
    try {
      const { getWorkflowLanceTable } = await import('../embedding/lanceConnection.js');
      const table = await getWorkflowLanceTable();
      const rows = await table.query().select(['workflow_id']).limit(10_000).toArray();
      const stale: string[] = [];
      for (const row of rows) {
        const id = row.workflow_id as string;
        if (id && !currentIds.has(id)) stale.push(id);
      }
      return stale;
    } catch {
      return [];
    }
  }
}
