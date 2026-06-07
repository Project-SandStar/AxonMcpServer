/**
 * Graph Query Manager - Provides graph traversal and analysis queries for Axon code
 *
 * Uses SQLite recursive CTEs for efficient graph traversal:
 * - getCallers: Find all functions that call a given function
 * - getCallees: Find all functions that a given function calls
 * - getImpact: Calculate blast radius of changes to a function
 * - findPath: Find call path between two functions
 * - detectCycles: Find cyclic dependencies
 * - getMetrics: Get graph metrics for a node
 * - getPageRank: Compute PageRank importance scores
 * - getBetweennessCentrality: Find bottleneck/bridge functions
 * - getStronglyConnectedComponents: Find mutually recursive groups
 */

import type { PrismaClient } from '../generated/prisma/index.js';
import type {
  EdgeType,
  CallerResult,
  CalleeResult,
  ImpactResult,
  PathResult,
  CycleResult,
  GraphMetrics
} from './types.js';

// ============================================
// Graph Query Manager
// ============================================

export class GraphQueryManager {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Resolve the projectId for a given node
   */
  private async getNodeProjectId(nodeId: string): Promise<number | null> {
    const node = await this.prisma.codeNode.findUnique({
      where: { id: nodeId },
      select: { projectId: true }
    });
    return node?.projectId ?? null;
  }

  /**
   * Get all callers of a function (who calls this?)
   */
  async getCallers(
    nodeId: string,
    maxDepth: number = 5
  ): Promise<CallerResult[]> {
    const projectId = await this.getNodeProjectId(nodeId);
    if (projectId === null) return [];

    const results = await this.prisma.$queryRaw<Array<{
      id: string;
      name: string;
      qualified_name: string;
      depth: number;
      file_path: string;
      line_number: number | null;
      edge_type: string;
    }>>`
      WITH RECURSIVE callers AS (
        SELECT
          n.id,
          n.name,
          n.qualified_name,
          1 as depth,
          n.file_path,
          e.line_number,
          e.edge_type
        FROM code_nodes n
        INNER JOIN code_edges e ON e.source_id = n.id
        WHERE e.target_id = ${nodeId}
          AND e.edge_type = 'calls'
          AND n.project_id = ${projectId}

        UNION ALL

        SELECT
          n.id,
          n.name,
          n.qualified_name,
          c.depth + 1,
          n.file_path,
          e.line_number,
          e.edge_type
        FROM code_nodes n
        INNER JOIN code_edges e ON e.source_id = n.id
        INNER JOIN callers c ON e.target_id = c.id
        WHERE c.depth < ${maxDepth}
          AND e.edge_type = 'calls'
          AND n.project_id = ${projectId}
      )
      SELECT DISTINCT
        id,
        name,
        qualified_name,
        MIN(depth) as depth,
        file_path,
        line_number,
        edge_type
      FROM callers
      GROUP BY id
      ORDER BY depth ASC, name ASC
    `;

    return results.map(r => ({
      id: r.id,
      name: r.name,
      qualifiedName: r.qualified_name,
      depth: Number(r.depth),
      filePath: r.file_path,
      lineNumber: r.line_number != null ? Number(r.line_number) : undefined,
      edgeType: r.edge_type as EdgeType
    }));
  }

  /**
   * Get all callees of a function (what does this call?)
   */
  async getCallees(
    nodeId: string,
    maxDepth: number = 5
  ): Promise<CalleeResult[]> {
    const projectId = await this.getNodeProjectId(nodeId);
    if (projectId === null) return [];

    const results = await this.prisma.$queryRaw<Array<{
      id: string;
      name: string;
      qualified_name: string;
      depth: number;
      file_path: string;
      line_number: number | null;
    }>>`
      WITH RECURSIVE callees AS (
        SELECT
          n.id,
          n.name,
          n.qualified_name,
          1 as depth,
          n.file_path,
          e.line_number
        FROM code_nodes n
        INNER JOIN code_edges e ON e.target_id = n.id
        WHERE e.source_id = ${nodeId}
          AND e.edge_type = 'calls'
          AND n.project_id = ${projectId}

        UNION ALL

        SELECT
          n.id,
          n.name,
          n.qualified_name,
          c.depth + 1,
          n.file_path,
          e.line_number
        FROM code_nodes n
        INNER JOIN code_edges e ON e.target_id = n.id
        INNER JOIN callees c ON e.source_id = c.id
        WHERE c.depth < ${maxDepth}
          AND e.edge_type = 'calls'
          AND n.project_id = ${projectId}
      )
      SELECT DISTINCT
        id,
        name,
        qualified_name,
        MIN(depth) as depth,
        file_path,
        line_number
      FROM callees
      GROUP BY id
      ORDER BY depth ASC, name ASC
    `;

    return results.map(r => ({
      id: r.id,
      name: r.name,
      qualifiedName: r.qualified_name,
      depth: Number(r.depth),
      filePath: r.file_path,
      lineNumber: r.line_number != null ? Number(r.line_number) : undefined
    }));
  }

  /**
   * Calculate impact/blast radius of changes to a node
   */
  async getImpact(
    nodeId: string,
    maxDepth: number = 10
  ): Promise<ImpactResult> {
    const focalNode = await this.prisma.codeNode.findUnique({
      where: { id: nodeId },
      select: { id: true, name: true, qualifiedName: true, projectId: true }
    });

    if (!focalNode) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    const projectId = focalNode.projectId;

    const results = await this.prisma.$queryRaw<Array<{
      id: string;
      name: string;
      qualified_name: string;
      edge_types: string;
      min_depth: number;
      file_path: string;
    }>>`
      WITH RECURSIVE affected AS (
        SELECT
          n.id,
          n.name,
          n.qualified_name,
          e.edge_type,
          1 as depth,
          n.file_path
        FROM code_nodes n
        INNER JOIN code_edges e ON e.source_id = n.id
        WHERE e.target_id = ${nodeId}
          AND e.edge_type = 'calls'
          AND n.project_id = ${projectId}

        UNION ALL

        SELECT
          n.id,
          n.name,
          n.qualified_name,
          e.edge_type,
          a.depth + 1,
          n.file_path
        FROM code_nodes n
        INNER JOIN code_edges e ON e.source_id = n.id
        INNER JOIN affected a ON e.target_id = a.id
        WHERE a.depth < ${maxDepth}
          AND e.edge_type = 'calls'
          AND n.project_id = ${projectId}
      )
      SELECT
        id,
        name,
        qualified_name,
        GROUP_CONCAT(DISTINCT edge_type) as edge_types,
        MIN(depth) as min_depth,
        file_path
      FROM affected
      GROUP BY id
      ORDER BY min_depth ASC, name ASC
    `;

    const breakdown: Record<EdgeType, number> = {
      calls: 0,
      contains: 0
    };

    const affectedNodes = results.map(r => {
      const edgeTypes = r.edge_types.split(',') as EdgeType[];
      for (const et of edgeTypes) {
        if (et in breakdown) {
          breakdown[et]++;
        }
      }
      return {
        id: r.id,
        name: r.name,
        qualifiedName: r.qualified_name,
        edgeTypes,
        minDepth: Number(r.min_depth),
        filePath: r.file_path
      };
    });

    return {
      focalNode: {
        id: focalNode.id,
        name: focalNode.name,
        qualifiedName: focalNode.qualifiedName
      },
      affectedNodes,
      totalAffected: affectedNodes.length,
      maxDepthReached: affectedNodes.length > 0 ? Math.max(...affectedNodes.map(n => n.minDepth)) : 0,
      breakdown
    };
  }

  /**
   * Find shortest path between two nodes
   */
  async findPath(
    fromId: string,
    toId: string,
    maxDepth: number = 10
  ): Promise<PathResult> {
    const projectId = await this.getNodeProjectId(fromId);
    if (projectId === null) return { found: false, path: [], edges: [], depth: 0 };

    const results = await this.prisma.$queryRaw<Array<{
      path: string;
      edges: string;
      depth: number;
    }>>`
      WITH RECURSIVE paths AS (
        SELECT
          ${fromId} as current_id,
          ${fromId} as path,
          '' as edges,
          0 as depth

        UNION ALL

        SELECT
          e.target_id,
          p.path || ',' || e.target_id,
          CASE WHEN p.edges = '' THEN e.edge_type ELSE p.edges || ',' || e.edge_type END,
          p.depth + 1
        FROM paths p
        INNER JOIN code_edges e ON e.source_id = p.current_id
        INNER JOIN code_nodes n ON n.id = e.target_id
        WHERE p.depth < ${maxDepth}
          AND INSTR(p.path, e.target_id) = 0
          AND n.project_id = ${projectId}
      )
      SELECT path, edges, depth
      FROM paths
      WHERE current_id = ${toId}
      ORDER BY depth ASC
      LIMIT 1
    `;

    if (results.length === 0) {
      return { found: false, path: [], edges: [], depth: 0 };
    }

    const result = results[0];
    const pathIds = result.path.split(',');

    const nodes = await this.prisma.codeNode.findMany({
      where: { id: { in: pathIds } },
      select: { id: true, name: true, qualifiedName: true }
    });

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const orderedPath = pathIds
      .map(id => nodeMap.get(id))
      .filter((n): n is NonNullable<typeof n> => n !== undefined);

    return {
      found: true,
      path: orderedPath,
      edges: result.edges ? result.edges.split(',') as EdgeType[] : [],
      depth: result.depth
    };
  }

  /**
   * Detect cycles in the call graph for a project
   */
  async detectCycles(
    projectId: number,
    maxCycles: number = 10
  ): Promise<CycleResult[]> {
    const results = await this.prisma.$queryRaw<Array<{
      cycle_path: string;
      cycle_names: string;
      length: number;
    }>>`
      WITH RECURSIVE cycle_finder AS (
        SELECT
          n.id as start_id,
          n.id as current_id,
          n.id as path,
          n.name as names,
          0 as depth
        FROM code_nodes n
        WHERE n.project_id = ${projectId}

        UNION ALL

        SELECT
          cf.start_id,
          e.target_id,
          cf.path || ',' || e.target_id,
          cf.names || ',' || n.name,
          cf.depth + 1
        FROM cycle_finder cf
        INNER JOIN code_edges e ON e.source_id = cf.current_id
        INNER JOIN code_nodes n ON n.id = e.target_id
        WHERE cf.depth < 20
          AND e.edge_type = 'calls'
          AND (
            e.target_id = cf.start_id
            OR INSTR(cf.path, e.target_id) = 0
          )
      )
      SELECT
        path as cycle_path,
        names as cycle_names,
        depth as length
      FROM cycle_finder
      WHERE current_id = start_id AND depth > 0
      ORDER BY depth ASC
      LIMIT ${maxCycles}
    `;

    return results.map(r => ({
      path: r.cycle_path.split(','),
      nodeNames: r.cycle_names.split(','),
      length: r.length
    }));
  }

  /**
   * Get graph metrics for a specific node
   */
  async getMetrics(nodeId: string): Promise<GraphMetrics> {
    const [incomingCount, outgoingCount, callerCount, calleeCount, containsCount] = await Promise.all([
      this.prisma.codeEdge.count({ where: { targetId: nodeId } }),
      this.prisma.codeEdge.count({ where: { sourceId: nodeId } }),
      this.prisma.codeEdge.count({ where: { targetId: nodeId, edgeType: 'calls' } }),
      this.prisma.codeEdge.count({ where: { sourceId: nodeId, edgeType: 'calls' } }),
      this.prisma.codeEdge.count({ where: { sourceId: nodeId, edgeType: 'contains' } })
    ]);

    const depth = await this.getContainmentDepth(nodeId);

    return {
      nodeId,
      incomingEdgeCount: incomingCount,
      outgoingEdgeCount: outgoingCount,
      callerCount,
      calleeCount,
      containsCount,
      depth
    };
  }

  /**
   * Get containment depth of a node
   */
  private async getContainmentDepth(nodeId: string): Promise<number> {
    const result = await this.prisma.$queryRaw<Array<{ depth: number }>>`
      WITH RECURSIVE containment AS (
        SELECT ${nodeId} as id, 0 as depth
        UNION ALL
        SELECT e.source_id, c.depth + 1
        FROM containment c
        INNER JOIN code_edges e ON e.target_id = c.id
        WHERE e.edge_type = 'contains'
      )
      SELECT MAX(depth) as depth FROM containment
    `;

    return result[0]?.depth || 0;
  }

  /**
   * Find nodes by qualified name pattern
   */
  async findNodesByPattern(
    pattern: string,
    projectId?: number,
    limit: number = 20
  ): Promise<Array<{
    id: string;
    name: string;
    qualifiedName: string;
    nodeType: string;
    filePath: string;
  }>> {
    const whereClause = projectId
      ? { qualifiedName: { contains: pattern }, projectId }
      : { qualifiedName: { contains: pattern } };

    return this.prisma.codeNode.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        qualifiedName: true,
        nodeType: true,
        filePath: true
      },
      take: limit,
      orderBy: { name: 'asc' }
    });
  }

  /**
   * Get a node by its qualified name
   */
  async getNodeByQualifiedName(
    qualifiedName: string,
    projectId?: number
  ): Promise<{
    id: string;
    name: string;
    qualifiedName: string;
    nodeType: string;
    filePath: string;
    lineStart: number;
    signature?: string | null;
    documentation?: string | null;
  } | null> {
    const whereClause = projectId
      ? { qualifiedName, projectId }
      : { qualifiedName };

    return this.prisma.codeNode.findFirst({
      where: whereClause,
      select: {
        id: true,
        name: true,
        qualifiedName: true,
        nodeType: true,
        filePath: true,
        lineStart: true,
        signature: true,
        documentation: true
      }
    });
  }

  /**
   * Get top N most-called functions in a project
   */
  async getMostCalledFunctions(
    projectId: number,
    limit: number = 10
  ): Promise<Array<{
    id: string;
    name: string;
    qualifiedName: string;
    callerCount: number;
  }>> {
    const results = await this.prisma.$queryRaw<Array<{
      id: string;
      name: string;
      qualified_name: string;
      caller_count: number;
    }>>`
      SELECT
        n.id,
        n.name,
        n.qualified_name,
        COUNT(e.id) as caller_count
      FROM code_nodes n
      INNER JOIN code_edges e ON e.target_id = n.id
      WHERE n.project_id = ${projectId}
        AND e.edge_type = 'calls'
      GROUP BY n.id
      ORDER BY caller_count DESC
      LIMIT ${limit}
    `;

    return results.map(r => ({
      id: r.id,
      name: r.name,
      qualifiedName: r.qualified_name,
      callerCount: Number(r.caller_count)
    }));
  }

  /**
   * Get top N functions with most outgoing calls
   */
  async getMostComplexFunctions(
    projectId: number,
    limit: number = 10
  ): Promise<Array<{
    id: string;
    name: string;
    qualifiedName: string;
    calleeCount: number;
  }>> {
    const results = await this.prisma.$queryRaw<Array<{
      id: string;
      name: string;
      qualified_name: string;
      callee_count: number;
    }>>`
      SELECT
        n.id,
        n.name,
        n.qualified_name,
        COUNT(e.id) as callee_count
      FROM code_nodes n
      INNER JOIN code_edges e ON e.source_id = n.id
      WHERE n.project_id = ${projectId}
        AND e.edge_type = 'calls'
      GROUP BY n.id
      ORDER BY callee_count DESC
      LIMIT ${limit}
    `;

    return results.map(r => ({
      id: r.id,
      name: r.name,
      qualifiedName: r.qualified_name,
      calleeCount: Number(r.callee_count)
    }));
  }

  /**
   * Compute strongly connected components using Tarjan's algorithm
   */
  async getStronglyConnectedComponents(
    projectId: number,
    minSize: number = 2
  ): Promise<Array<{
    id: number;
    size: number;
    nodes: Array<{ id: string; name: string; qualifiedName: string }>;
  }>> {
    const nodes = await this.prisma.codeNode.findMany({
      where: { projectId },
      select: { id: true, name: true, qualifiedName: true }
    });

    const edges = await this.prisma.codeEdge.findMany({
      where: {
        source: { projectId },
        edgeType: 'calls'
      },
      select: { sourceId: true, targetId: true }
    });

    const nodeIndex = new Map<string, number>();
    const indexNode = new Map<number, string>();
    nodes.forEach((n, i) => {
      nodeIndex.set(n.id, i);
      indexNode.set(i, n.id);
    });

    const adj: number[][] = Array(nodes.length).fill(null).map(() => []);
    for (const edge of edges) {
      const from = nodeIndex.get(edge.sourceId);
      const to = nodeIndex.get(edge.targetId);
      if (from !== undefined && to !== undefined) {
        adj[from].push(to);
      }
    }

    // Tarjan's SCC algorithm
    const n = nodes.length;
    const ids = new Array(n).fill(-1);
    const low = new Array(n).fill(0);
    const onStack = new Array(n).fill(false);
    const stack: number[] = [];
    let id = 0;
    const sccs: number[][] = [];

    function dfs(at: number) {
      ids[at] = low[at] = id++;
      stack.push(at);
      onStack[at] = true;

      for (const to of adj[at]) {
        if (ids[to] === -1) dfs(to);
        if (onStack[to]) low[at] = Math.min(low[at], low[to]);
      }

      if (ids[at] === low[at]) {
        const scc: number[] = [];
        while (true) {
          const node = stack.pop()!;
          onStack[node] = false;
          scc.push(node);
          if (node === at) break;
        }
        if (scc.length >= minSize) {
          sccs.push(scc);
        }
      }
    }

    for (let i = 0; i < n; i++) {
      if (ids[i] === -1) dfs(i);
    }

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    return sccs.map((scc, idx) => ({
      id: idx + 1,
      size: scc.length,
      nodes: scc.map(i => {
        const nodeId = indexNode.get(i)!;
        const node = nodeMap.get(nodeId)!;
        return { id: node.id, name: node.name, qualifiedName: node.qualifiedName };
      })
    }));
  }

  /**
   * Compute PageRank scores for nodes in the call graph
   */
  async getPageRank(
    projectId: number,
    iterations: number = 20,
    dampingFactor: number = 0.85,
    limit: number = 20
  ): Promise<Array<{
    id: string;
    name: string;
    qualifiedName: string;
    pageRank: number;
  }>> {
    const nodes = await this.prisma.codeNode.findMany({
      where: { projectId },
      select: { id: true, name: true, qualifiedName: true }
    });

    const edges = await this.prisma.codeEdge.findMany({
      where: {
        source: { projectId },
        edgeType: 'calls'
      },
      select: { sourceId: true, targetId: true }
    });

    const n = nodes.length;
    if (n === 0) return [];

    const nodeIndex = new Map<string, number>();
    nodes.forEach((node, i) => nodeIndex.set(node.id, i));

    const outDegree = new Array(n).fill(0);
    const incoming: number[][] = Array(n).fill(null).map(() => []);

    for (const edge of edges) {
      const from = nodeIndex.get(edge.sourceId);
      const to = nodeIndex.get(edge.targetId);
      if (from !== undefined && to !== undefined) {
        outDegree[from]++;
        incoming[to].push(from);
      }
    }

    let pr = new Array(n).fill(1 / n);
    const d = dampingFactor;

    for (let iter = 0; iter < iterations; iter++) {
      const newPr = new Array(n).fill((1 - d) / n);
      for (let i = 0; i < n; i++) {
        for (const j of incoming[i]) {
          if (outDegree[j] > 0) {
            newPr[i] += d * pr[j] / outDegree[j];
          }
        }
      }
      pr = newPr;
    }

    const results = nodes.map((node, i) => ({
      id: node.id,
      name: node.name,
      qualifiedName: node.qualifiedName,
      pageRank: pr[i]
    }));

    results.sort((a, b) => b.pageRank - a.pageRank);
    return results.slice(0, limit);
  }

  /**
   * Compute betweenness centrality for nodes
   */
  async getBetweennessCentrality(
    projectId: number,
    sampleSize: number = 100,
    limit: number = 20
  ): Promise<Array<{
    id: string;
    name: string;
    qualifiedName: string;
    centrality: number;
  }>> {
    const nodes = await this.prisma.codeNode.findMany({
      where: { projectId },
      select: { id: true, name: true, qualifiedName: true }
    });

    const edges = await this.prisma.codeEdge.findMany({
      where: {
        source: { projectId },
        edgeType: 'calls'
      },
      select: { sourceId: true, targetId: true }
    });

    const n = nodes.length;
    if (n === 0) return [];

    const nodeIndex = new Map<string, number>();
    nodes.forEach((node, i) => nodeIndex.set(node.id, i));

    const adj: number[][] = Array(n).fill(null).map(() => []);
    for (const edge of edges) {
      const from = nodeIndex.get(edge.sourceId);
      const to = nodeIndex.get(edge.targetId);
      if (from !== undefined && to !== undefined) {
        adj[from].push(to);
      }
    }

    const centrality = new Array(n).fill(0);
    const sampleNodes = nodes.length <= sampleSize
      ? nodes.map((_, i) => i)
      : Array.from({ length: sampleSize }, () => Math.floor(Math.random() * n));

    for (const source of sampleNodes) {
      const dist = new Array(n).fill(-1);
      const sigma = new Array(n).fill(0);
      const pred: number[][] = Array(n).fill(null).map(() => []);

      dist[source] = 0;
      sigma[source] = 1;
      const queue = [source];
      const stack: number[] = [];

      while (queue.length > 0) {
        const v = queue.shift()!;
        stack.push(v);

        for (const w of adj[v]) {
          if (dist[w] < 0) {
            dist[w] = dist[v] + 1;
            queue.push(w);
          }
          if (dist[w] === dist[v] + 1) {
            sigma[w] += sigma[v];
            pred[w].push(v);
          }
        }
      }

      const delta = new Array(n).fill(0);
      while (stack.length > 0) {
        const w = stack.pop()!;
        for (const v of pred[w]) {
          delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
        }
        if (w !== source) {
          centrality[w] += delta[w];
        }
      }
    }

    const scale = sampleNodes.length < n ? n / sampleNodes.length : 1;
    for (let i = 0; i < n; i++) {
      centrality[i] *= scale;
    }

    const results = nodes.map((node, i) => ({
      id: node.id,
      name: node.name,
      qualifiedName: node.qualifiedName,
      centrality: centrality[i]
    }));

    results.sort((a, b) => b.centrality - a.centrality);
    return results.slice(0, limit);
  }
}

// ============================================
// Factory Function
// ============================================

let queryManagerInstance: GraphQueryManager | null = null;

export function getGraphQueryManager(prisma: PrismaClient): GraphQueryManager {
  if (!queryManagerInstance) {
    queryManagerInstance = new GraphQueryManager(prisma);
  }
  return queryManagerInstance;
}

export function resetGraphQueryManager(): void {
  queryManagerInstance = null;
}
