/**
 * Docs Vector Store - ANN search for documentation embeddings via LanceDB
 */

import { EmbeddingService, getDocsEmbeddingService } from './embeddingService.js';
import { getDocsLanceTable } from './lanceConnection.js';

export interface DocsVectorSearchResult {
  docId: string;
  score: number;
  distance: number;
}

export interface DocsVectorSearchOptions {
  library?: string;
  limit?: number;
  minScore?: number;
}

export class DocsVectorStore {
  private embeddingService: EmbeddingService;

  constructor(embeddingService?: EmbeddingService) {
    this.embeddingService = embeddingService || getDocsEmbeddingService();
  }

  async storeEmbedding(docId: string, embedding: Float32Array, metadata: {
    library: string;
    title: string;
  }): Promise<void> {
    const table = await getDocsLanceTable();

    try {
      await table.delete(`doc_id = '${escSql(docId)}'`);
    } catch { /* ignore */ }

    await table.add([{
      doc_id: docId,
      vector: Array.from(embedding),
      library: metadata.library,
      title: metadata.title,
      model: this.embeddingService.getModelName(),
      dimensions: this.embeddingService.getDimensions(),
      created_at: new Date().toISOString(),
    }]);
  }

  async storeEmbeddings(
    items: Array<{ docId: string; embedding: Float32Array; library: string; title: string }>
  ): Promise<number> {
    const table = await getDocsLanceTable();
    let stored = 0;

    const batchSize = 100;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const deleteIds = batch.map(item => item.docId);

      if (deleteIds.length > 0) {
        const idList = deleteIds.map(id => `'${escSql(id)}'`).join(', ');
        try { await table.delete(`doc_id IN (${idList})`); } catch { /* ignore */ }
      }

      const records = batch.map(item => ({
        doc_id: item.docId,
        vector: Array.from(item.embedding),
        library: item.library,
        title: item.title,
        model: this.embeddingService.getModelName(),
        dimensions: this.embeddingService.getDimensions(),
        created_at: new Date().toISOString(),
      }));

      await table.add(records);
      stored += records.length;
    }

    return stored;
  }

  async search(
    queryEmbedding: Float32Array,
    options: DocsVectorSearchOptions = {}
  ): Promise<DocsVectorSearchResult[]> {
    const { library, limit = 10, minScore = 0.5 } = options;

    const table = await getDocsLanceTable();
    const rowCount = await table.countRows();
    if (rowCount === 0) return [];

    let query = table.vectorSearch(Array.from(queryEmbedding))
      .distanceType('cosine')
      .select(['doc_id'])
      .limit(limit * 2);

    if (library) {
      query = query.where(`library = '${escSql(library)}'`);
    }

    const rawResults = await query.toArray();

    const results: DocsVectorSearchResult[] = [];
    for (const row of rawResults) {
      const distance: number = row._distance ?? 0;
      const score = 1 - distance;
      if (score >= minScore) {
        results.push({ docId: row.doc_id, score, distance });
      }
    }

    return results.slice(0, limit);
  }

  async searchByText(query: string, options: DocsVectorSearchOptions = {}): Promise<DocsVectorSearchResult[]> {
    await this.embeddingService.initialize();
    const queryEmbedding = await this.embeddingService.embed(query);
    return this.search(queryEmbedding, options);
  }

  async count(): Promise<number> {
    const table = await getDocsLanceTable();
    return table.countRows();
  }
}

function escSql(value: string): string {
  return value.replace(/'/g, "''");
}

let storeInstance: DocsVectorStore | null = null;

export function getDocsVectorStore(): DocsVectorStore {
  if (!storeInstance) storeInstance = new DocsVectorStore();
  return storeInstance;
}
