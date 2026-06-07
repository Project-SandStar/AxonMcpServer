/**
 * Workflow Vector Store — ANN search for workflow markdown embeddings via LanceDB.
 * Uses its own dedicated `workflow_vectors` table; same embedding model as docs (768d).
 */

import { EmbeddingService, getDocsEmbeddingService } from './embeddingService.js';
import { getWorkflowLanceTable } from './lanceConnection.js';

export interface WorkflowVectorSearchResult {
  workflowId: string;
  score: number;
  distance: number;
}

export interface WorkflowVectorSearchOptions {
  category?: string;
  tag?: string;
  limit?: number;
  minScore?: number;
}

export class WorkflowVectorStore {
  private embeddingService: EmbeddingService;

  constructor(embeddingService?: EmbeddingService) {
    this.embeddingService = embeddingService || getDocsEmbeddingService();
  }

  async storeEmbedding(
    workflowId: string,
    embedding: Float32Array,
    metadata: { category: string; title: string; tags: string },
  ): Promise<void> {
    const table = await getWorkflowLanceTable();
    try {
      await table.delete(`workflow_id = '${escSql(workflowId)}'`);
    } catch { /* ignore */ }

    await table.add([{
      workflow_id: workflowId,
      vector: Array.from(embedding),
      category: metadata.category,
      title: metadata.title,
      tags: metadata.tags,
      model: this.embeddingService.getModelName(),
      dimensions: this.embeddingService.getDimensions(),
      created_at: new Date().toISOString(),
    }]);
  }

  async storeEmbeddings(
    items: Array<{ workflowId: string; embedding: Float32Array; category: string; title: string; tags: string }>,
  ): Promise<number> {
    if (items.length === 0) return 0;
    const table = await getWorkflowLanceTable();

    const idList = items.map(i => `'${escSql(i.workflowId)}'`).join(', ');
    try { await table.delete(`workflow_id IN (${idList})`); } catch { /* ignore */ }

    const records = items.map(i => ({
      workflow_id: i.workflowId,
      vector: Array.from(i.embedding),
      category: i.category,
      title: i.title,
      tags: i.tags,
      model: this.embeddingService.getModelName(),
      dimensions: this.embeddingService.getDimensions(),
      created_at: new Date().toISOString(),
    }));

    await table.add(records);
    return records.length;
  }

  async deleteByIds(workflowIds: string[]): Promise<void> {
    if (workflowIds.length === 0) return;
    const table = await getWorkflowLanceTable();
    const idList = workflowIds.map(id => `'${escSql(id)}'`).join(', ');
    try { await table.delete(`workflow_id IN (${idList})`); } catch { /* ignore */ }
  }

  async search(
    queryEmbedding: Float32Array,
    options: WorkflowVectorSearchOptions = {},
  ): Promise<WorkflowVectorSearchResult[]> {
    const { category, tag, limit = 10, minScore = 0.3 } = options;

    const table = await getWorkflowLanceTable();
    const rowCount = await table.countRows();
    if (rowCount === 0) return [];

    let query = table.vectorSearch(Array.from(queryEmbedding))
      .distanceType('cosine')
      .select(['workflow_id'])
      .limit(limit * 2);

    const filters: string[] = [];
    if (category) filters.push(`category = '${escSql(category)}'`);
    if (tag) filters.push(`tags LIKE '%${escSql(tag)}%'`);
    if (filters.length > 0) {
      query = query.where(filters.join(' AND '));
    }

    const rawResults = await query.toArray();
    const results: WorkflowVectorSearchResult[] = [];
    for (const row of rawResults) {
      const distance: number = row._distance ?? 0;
      const score = 1 - distance;
      if (score >= minScore) {
        results.push({ workflowId: row.workflow_id, score, distance });
      }
    }
    return results.slice(0, limit);
  }

  async searchByText(query: string, options: WorkflowVectorSearchOptions = {}): Promise<WorkflowVectorSearchResult[]> {
    await this.embeddingService.initialize();
    const queryEmbedding = await this.embeddingService.embed(query);
    return this.search(queryEmbedding, options);
  }

  async count(): Promise<number> {
    const table = await getWorkflowLanceTable();
    return table.countRows();
  }

  async clear(): Promise<void> {
    const table = await getWorkflowLanceTable();
    try { await table.delete("workflow_id != ''"); } catch { /* ignore */ }
  }
}

function escSql(value: string): string {
  return value.replace(/'/g, "''");
}

let storeInstance: WorkflowVectorStore | null = null;

export function getWorkflowVectorStore(): WorkflowVectorStore {
  if (!storeInstance) storeInstance = new WorkflowVectorStore();
  return storeInstance;
}
