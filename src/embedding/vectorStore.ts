/**
 * Vector Store - ANN search for code embeddings via LanceDB
 *
 * Stores embeddings in LanceDB (.cache/axonvector.db) and provides
 * approximate nearest neighbor search using cosine distance.
 */

import type { PrismaClient } from '../generated/prisma/index.js';
import { EmbeddingService, getEmbeddingService } from './embeddingService.js';
import { getLanceTable } from './lanceConnection.js';

// ============================================
// Types
// ============================================

export interface VectorSearchResult {
  nodeId: string;
  score: number;
  distance: number;
}

export interface VectorSearchOptions {
  projectId?: number;
  nodeType?: string;
  limit?: number;
  minScore?: number;
}

// ============================================
// Vector Store Class
// ============================================

export class VectorStore {
  private prisma: PrismaClient;
  private embeddingService: EmbeddingService;

  constructor(prisma: PrismaClient, embeddingService?: EmbeddingService) {
    this.prisma = prisma;
    this.embeddingService = embeddingService || getEmbeddingService();
  }

  async storeEmbedding(nodeId: string, embedding: Float32Array): Promise<void> {
    const table = await getLanceTable();

    const node = await this.prisma.codeNode.findUnique({
      where: { id: nodeId },
      select: { projectId: true, nodeType: true }
    });

    if (!node) return;

    try {
      await table.delete(`node_id = '${escSql(nodeId)}'`);
    } catch { /* ignore */ }

    await table.add([{
      node_id: nodeId,
      vector: Array.from(embedding),
      project_id: node.projectId,
      node_type: node.nodeType,
      model: this.embeddingService.getModelName(),
      dimensions: this.embeddingService.getDimensions(),
      created_at: new Date().toISOString(),
    }]);
  }

  async storeEmbeddings(
    items: Array<{ nodeId: string; embedding: Float32Array }>
  ): Promise<number> {
    const table = await getLanceTable();
    let stored = 0;

    const nodeIds = items.map(i => i.nodeId);
    const nodes = await this.prisma.codeNode.findMany({
      where: { id: { in: nodeIds } },
      select: { id: true, projectId: true, nodeType: true }
    });
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    const batchSize = 100;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const records: Array<Record<string, unknown>> = [];
      const deleteIds: string[] = [];

      for (const item of batch) {
        const node = nodeMap.get(item.nodeId);
        if (!node) continue;
        deleteIds.push(item.nodeId);
        records.push({
          node_id: item.nodeId,
          vector: Array.from(item.embedding),
          project_id: node.projectId,
          node_type: node.nodeType,
          model: this.embeddingService.getModelName(),
          dimensions: this.embeddingService.getDimensions(),
          created_at: new Date().toISOString(),
        });
      }

      if (records.length === 0) continue;

      if (deleteIds.length > 0) {
        const idList = deleteIds.map(id => `'${escSql(id)}'`).join(', ');
        try { await table.delete(`node_id IN (${idList})`); } catch { /* ignore */ }
      }

      await table.add(records);
      stored += records.length;
    }

    return stored;
  }

  async search(
    queryEmbedding: Float32Array,
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    const { projectId, nodeType, limit = 10, minScore = 0.5 } = options;

    const table = await getLanceTable();
    const rowCount = await table.countRows();
    if (rowCount === 0) return [];

    let query = table.vectorSearch(Array.from(queryEmbedding))
      .distanceType('cosine')
      .select(['node_id'])
      .limit(limit * 2);

    const filters: string[] = [];
    if (projectId) filters.push(`project_id = ${projectId}`);
    if (nodeType) filters.push(`node_type = '${escSql(nodeType)}'`);
    if (filters.length > 0) query = query.where(filters.join(' AND '));

    const rawResults = await query.toArray();

    const results: VectorSearchResult[] = [];
    for (const row of rawResults) {
      const distance: number = row._distance ?? 0;
      const score = 1 - distance;
      if (score >= minScore) {
        results.push({ nodeId: row.node_id, score, distance });
      }
    }

    return results.slice(0, limit);
  }

  async searchByText(query: string, options: VectorSearchOptions = {}): Promise<VectorSearchResult[]> {
    await this.embeddingService.initialize();
    const queryEmbedding = await this.embeddingService.embed(query);
    return this.search(queryEmbedding, options);
  }

  async count(projectId?: number): Promise<number> {
    const table = await getLanceTable();
    if (projectId) return table.countRows(`project_id = ${projectId}`);
    return table.countRows();
  }

  async deleteProjectVectors(projectId: number): Promise<number> {
    const table = await getLanceTable();
    const countBefore = await table.countRows(`project_id = ${projectId}`);
    if (countBefore > 0) await table.delete(`project_id = ${projectId}`);
    return countBefore;
  }

  async getNodeIdsForProject(projectId: number): Promise<Set<string>> {
    const table = await getLanceTable();
    const rows = await table.query()
      .where(`project_id = ${projectId}`)
      .select(['node_id'])
      .toArray();
    return new Set(rows.map((r: { node_id: string }) => r.node_id));
  }
}

function escSql(value: string): string {
  return value.replace(/'/g, "''");
}

// ============================================
// Factory
// ============================================

let storeInstance: VectorStore | null = null;

export function getVectorStore(prisma: PrismaClient): VectorStore {
  if (!storeInstance) storeInstance = new VectorStore(prisma);
  return storeInstance;
}

export function resetVectorStore(): void {
  storeInstance = null;
}
