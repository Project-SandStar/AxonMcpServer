/**
 * Semantic Search Service - Combined vector + graph search with re-ranking
 */

import type { PrismaClient } from '../generated/prisma/index.js';
import { VectorStore, getVectorStore, type VectorSearchResult, type VectorSearchOptions } from './vectorStore.js';
import { DocsVectorStore, getDocsVectorStore, type DocsVectorSearchResult, type DocsVectorSearchOptions } from './docsVectorStore.js';

export interface SemanticSearchResult {
  nodeId: string;
  name: string;
  qualifiedName: string;
  nodeType: string;
  filePath: string;
  lineStart: number;
  signature?: string | null;
  documentation?: string | null;
  score: number;
  source?: string | null;
  graphContext?: {
    callerCount: number;
    calleeCount: number;
  };
}

export interface SemanticSearchOptions {
  projectId?: number;
  nodeType?: string;
  limit?: number;
  minScore?: number;
  includeGraphContext?: boolean;
  graphWeight?: number;
}

export class SemanticSearchService {
  private prisma: PrismaClient;
  private vectorStore: VectorStore;
  private docsVectorStore: DocsVectorStore;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.vectorStore = getVectorStore(prisma);
    this.docsVectorStore = getDocsVectorStore();
  }

  async searchCode(
    query: string,
    options: SemanticSearchOptions = {}
  ): Promise<SemanticSearchResult[]> {
    const {
      projectId,
      nodeType,
      limit = 10,
      minScore = 0.3,
      includeGraphContext = true,
      graphWeight = 0.3,
    } = options;

    // Get vector search results
    const vectorResults = await this.vectorStore.searchByText(query, {
      projectId,
      nodeType,
      limit: limit * 2,
      minScore,
    });

    if (vectorResults.length === 0) return [];

    // Fetch node details
    const nodeIds = vectorResults.map(r => r.nodeId);
    const nodes = await this.prisma.codeNode.findMany({
      where: { id: { in: nodeIds } },
      select: {
        id: true,
        name: true,
        qualifiedName: true,
        nodeType: true,
        filePath: true,
        lineStart: true,
        signature: true,
        documentation: true,
        source: true,
      }
    });

    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Optionally get graph context (caller/callee counts)
    let graphContextMap = new Map<string, { callerCount: number; calleeCount: number }>();
    if (includeGraphContext) {
      const [callerCounts, calleeCounts] = await Promise.all([
        this.prisma.codeEdge.groupBy({
          by: ['targetId'],
          where: { targetId: { in: nodeIds }, edgeType: 'calls' },
          _count: true,
        }),
        this.prisma.codeEdge.groupBy({
          by: ['sourceId'],
          where: { sourceId: { in: nodeIds }, edgeType: 'calls' },
          _count: true,
        }),
      ]);

      for (const nodeId of nodeIds) {
        graphContextMap.set(nodeId, {
          callerCount: callerCounts.find(c => c.targetId === nodeId)?._count ?? 0,
          calleeCount: calleeCounts.find(c => c.sourceId === nodeId)?._count ?? 0,
        });
      }
    }

    // Build results with combined scoring
    const results: SemanticSearchResult[] = [];
    for (const vr of vectorResults) {
      const node = nodeMap.get(vr.nodeId);
      if (!node) continue;

      let finalScore = vr.score;

      // Boost by graph centrality
      if (includeGraphContext && graphWeight > 0) {
        const gc = graphContextMap.get(vr.nodeId);
        if (gc) {
          const graphScore = Math.min(1, (gc.callerCount + gc.calleeCount) / 20);
          finalScore = (1 - graphWeight) * vr.score + graphWeight * graphScore;
        }
      }

      results.push({
        nodeId: node.id,
        name: node.name,
        qualifiedName: node.qualifiedName,
        nodeType: node.nodeType,
        filePath: node.filePath,
        lineStart: node.lineStart,
        signature: node.signature,
        documentation: node.documentation,
        score: finalScore,
        source: node.source,
        graphContext: includeGraphContext ? graphContextMap.get(vr.nodeId) : undefined,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  async searchDocs(
    query: string,
    options: DocsVectorSearchOptions = {}
  ): Promise<DocsVectorSearchResult[]> {
    return this.docsVectorStore.searchByText(query, options);
  }

  async findSimilar(
    nodeId: string,
    options: { projectId?: number; limit?: number } = {}
  ): Promise<SemanticSearchResult[]> {
    const { limit = 5 } = options;

    // Get the node's embedding
    const node = await this.prisma.codeNode.findUnique({
      where: { id: nodeId },
      select: { source: true, signature: true, documentation: true, projectId: true }
    });

    if (!node?.source) return [];

    // Search by the node's text
    const searchText = [node.signature, node.documentation, node.source]
      .filter(Boolean)
      .join(' ');

    return this.searchCode(searchText, {
      projectId: options.projectId || node.projectId,
      limit: limit + 1, // +1 to exclude self
      minScore: 0.3,
      includeGraphContext: false,
    }).then(results => results.filter(r => r.nodeId !== nodeId).slice(0, limit));
  }
}

let serviceInstance: SemanticSearchService | null = null;

export function getSemanticSearchService(prisma: PrismaClient): SemanticSearchService {
  if (!serviceInstance) serviceInstance = new SemanticSearchService(prisma);
  return serviceInstance;
}

export function resetSemanticSearchService(): void {
  serviceInstance = null;
}
