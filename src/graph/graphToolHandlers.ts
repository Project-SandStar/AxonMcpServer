/**
 * Graph Tool Handlers - Implementation of Axon graph analysis MCP tools
 *
 * Processes tool calls for:
 * - Call graph navigation (callers, callees)
 * - Impact analysis
 * - Graph algorithms (PageRank, centrality, SCCs)
 * - Graph management (build, stats)
 * - DSL queries
 * - Visualization export
 */

import type { PrismaClient } from '../generated/prisma/index.js';
import { GraphQueryManager, getGraphQueryManager } from './graphQueryManager.js';
import { isGraphTool } from './graphTools.js';
import {
  GraphDSLParser,
  GraphQueryExecutor,
  createDSLParser,
  createQueryExecutor
} from './graphQueryDSL.js';
import {
  GraphVisualizationService,
  getGraphVisualizationService
} from './graphVisualization.js';

// ============================================
// Types
// ============================================

export interface ToolCallResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface GraphToolHandlerContext {
  prisma: PrismaClient;
}

// ============================================
// Graph Tool Handler
// ============================================

export class GraphToolHandler {
  private prisma: PrismaClient;
  private queryManager: GraphQueryManager;
  private dslParser: GraphDSLParser;
  private queryExecutor: GraphQueryExecutor;
  private visualization: GraphVisualizationService;

  constructor(context: GraphToolHandlerContext) {
    this.prisma = context.prisma;
    this.queryManager = getGraphQueryManager(context.prisma);
    this.dslParser = createDSLParser();
    this.queryExecutor = createQueryExecutor(context.prisma);
    this.visualization = getGraphVisualizationService(context.prisma);
  }

  canHandle(toolName: string): boolean {
    return isGraphTool(toolName);
  }

  async handle(toolName: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    try {
      switch (toolName) {
        case 'getCallers':
          return await this.handleGetCallers(args);
        case 'getCallees':
          return await this.handleGetCallees(args);
        case 'getCodeImpact':
          return await this.handleGetCodeImpact(args);
        case 'findCodePath':
          return await this.handleFindCodePath(args);
        case 'getGraphMetrics':
          return await this.handleGetMetrics(args);
        case 'getMostCalledFunctions':
          return await this.handleGetMostCalled(args);
        case 'getMostComplexFunctions':
          return await this.handleGetMostComplex(args);
        case 'buildProjectGraph':
          return await this.handleBuildGraph(args);
        case 'getGraphStats':
          return await this.handleGetStats(args);
        case 'detectCycles':
          return await this.handleDetectCycles(args);
        case 'queryGraph':
          return await this.handleQueryGraph(args);
        case 'findConstrainedPath':
          return await this.handleFindConstrainedPath(args);
        case 'getStronglyConnectedComponents':
          return await this.handleGetSCC(args);
        case 'getPageRank':
          return await this.handleGetPageRank(args);
        case 'getBetweennessCentrality':
          return await this.handleGetCentrality(args);
        case 'exportGraphVisualization':
          return await this.handleExportVisualization(args);
        case 'semanticCodeSearch':
          return this.textResult('Semantic search requires embedding support. Use searchAxonDocs or searchAxonExamples for now.');
        case 'findSimilarCode':
          return this.textResult('Similar code search requires embedding support. Use searchAxonExamples for now.');
        case 'buildProjectEmbeddings':
          return this.textResult('Embedding generation requires vector store support.');
        default:
          return this.errorResult(`Unknown graph tool: ${toolName}`);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[graph-tools] Error (${toolName}): ${errMsg}`);
      return this.errorResult(errMsg);
    }
  }

  // ============================================
  // Tool Handlers
  // ============================================

  private async handleGetCallers(args: Record<string, unknown>): Promise<ToolCallResult> {
    const nodeId = await this.resolveNodeId(args);
    if (!nodeId) {
      return this.errorResult('Either nodeId or qualifiedName is required');
    }

    const maxDepth = (args.maxDepth as number) || 5;
    const callers = await this.queryManager.getCallers(nodeId, maxDepth);

    if (callers.length === 0) {
      return this.textResult('No callers found for this function.');
    }

    const lines = [`Found ${callers.length} callers:\n`];
    for (const caller of callers) {
      lines.push(`- [depth ${caller.depth}] ${caller.qualifiedName}`);
      lines.push(`  File: ${caller.filePath}${caller.lineNumber ? `:${caller.lineNumber}` : ''}`);
    }

    return this.textResult(lines.join('\n'));
  }

  private async handleGetCallees(args: Record<string, unknown>): Promise<ToolCallResult> {
    const nodeId = await this.resolveNodeId(args);
    if (!nodeId) {
      return this.errorResult('Either nodeId or qualifiedName is required');
    }

    const maxDepth = (args.maxDepth as number) || 5;
    const callees = await this.queryManager.getCallees(nodeId, maxDepth);

    if (callees.length === 0) {
      return this.textResult('No callees found for this function.');
    }

    const lines = [`Found ${callees.length} callees:\n`];
    for (const callee of callees) {
      lines.push(`- [depth ${callee.depth}] ${callee.qualifiedName}`);
      lines.push(`  File: ${callee.filePath}${callee.lineNumber ? `:${callee.lineNumber}` : ''}`);
    }

    return this.textResult(lines.join('\n'));
  }

  private async handleGetCodeImpact(args: Record<string, unknown>): Promise<ToolCallResult> {
    const nodeId = await this.resolveNodeId(args);
    if (!nodeId) {
      return this.errorResult('Either nodeId or qualifiedName is required');
    }

    const maxDepth = (args.maxDepth as number) || 10;
    const impact = await this.queryManager.getImpact(nodeId, maxDepth);

    const lines = [
      `Impact Analysis for: ${impact.focalNode.qualifiedName}\n`,
      `Total affected nodes: ${impact.totalAffected}`,
      `Max depth reached: ${impact.maxDepthReached}`,
      '\nBreakdown by relationship:'
    ];

    for (const [edgeType, count] of Object.entries(impact.breakdown)) {
      if (count > 0) {
        lines.push(`  - ${edgeType}: ${count}`);
      }
    }

    if (impact.affectedNodes.length > 0) {
      lines.push('\nAffected nodes:');
      for (const node of impact.affectedNodes.slice(0, 20)) {
        lines.push(`  - [depth ${node.minDepth}] ${node.qualifiedName}`);
        lines.push(`    Relationships: ${node.edgeTypes.join(', ')}`);
      }
      if (impact.affectedNodes.length > 20) {
        lines.push(`  ... and ${impact.affectedNodes.length - 20} more`);
      }
    }

    return this.textResult(lines.join('\n'));
  }

  private async handleFindCodePath(args: Record<string, unknown>): Promise<ToolCallResult> {
    const fromId = await this.resolveNodeId({
      nodeId: args.fromNodeId,
      qualifiedName: args.fromQualifiedName
    });
    const toId = await this.resolveNodeId({
      nodeId: args.toNodeId,
      qualifiedName: args.toQualifiedName
    });

    if (!fromId || !toId) {
      return this.errorResult('Both source and target nodes are required');
    }

    const maxDepth = (args.maxDepth as number) || 10;
    const path = await this.queryManager.findPath(fromId, toId, maxDepth);

    if (!path.found) {
      return this.textResult('No path found between the specified nodes.');
    }

    const lines = [`Path found (${path.depth} hops):\n`];
    for (let i = 0; i < path.path.length; i++) {
      const node = path.path[i];
      lines.push(`${i + 1}. ${node.qualifiedName}`);
      if (i < path.edges.length) {
        lines.push(`   --> [${path.edges[i]}]`);
      }
    }

    return this.textResult(lines.join('\n'));
  }

  private async handleGetMetrics(args: Record<string, unknown>): Promise<ToolCallResult> {
    const nodeId = await this.resolveNodeId(args);
    if (!nodeId) {
      return this.errorResult('Either nodeId or qualifiedName is required');
    }

    const metrics = await this.queryManager.getMetrics(nodeId);

    const lines = [
      `Graph Metrics for node: ${nodeId}\n`,
      `Incoming edges: ${metrics.incomingEdgeCount}`,
      `Outgoing edges: ${metrics.outgoingEdgeCount}`,
      `Caller count: ${metrics.callerCount}`,
      `Callee count: ${metrics.calleeCount}`,
      `Contains count: ${metrics.containsCount}`,
      `Hierarchy depth: ${metrics.depth}`
    ];

    return this.textResult(lines.join('\n'));
  }

  private async handleGetMostCalled(args: Record<string, unknown>): Promise<ToolCallResult> {
    const projectId = args.projectId as number;
    if (!projectId) {
      return this.errorResult('projectId is required');
    }

    const limit = (args.limit as number) || 10;
    const results = await this.queryManager.getMostCalledFunctions(projectId, limit);

    if (results.length === 0) {
      return this.textResult('No functions found in the project graph.');
    }

    const lines = [`Top ${results.length} most-called functions:\n`];
    for (let i = 0; i < results.length; i++) {
      const func = results[i];
      lines.push(`${i + 1}. ${func.qualifiedName} (${func.callerCount} callers)`);
    }

    return this.textResult(lines.join('\n'));
  }

  private async handleGetMostComplex(args: Record<string, unknown>): Promise<ToolCallResult> {
    const projectId = args.projectId as number;
    if (!projectId) {
      return this.errorResult('projectId is required');
    }

    const limit = (args.limit as number) || 10;
    const results = await this.queryManager.getMostComplexFunctions(projectId, limit);

    if (results.length === 0) {
      return this.textResult('No functions found in the project graph.');
    }

    const lines = [`Top ${results.length} functions with most outgoing calls:\n`];
    for (let i = 0; i < results.length; i++) {
      const func = results[i];
      lines.push(`${i + 1}. ${func.qualifiedName} (${func.calleeCount} callees)`);
    }

    return this.textResult(lines.join('\n'));
  }

  private async handleBuildGraph(args: Record<string, unknown>): Promise<ToolCallResult> {
    const projectId = args.projectId as number;
    if (!projectId) {
      return this.errorResult('projectId is required');
    }

    // Get project info
    const project = await this.prisma.axonProject.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      return this.errorResult(`Project not found: ${projectId}`);
    }

    // Build graph from project directory
    const { GraphBuilder } = await import('./graphBuilder.js');
    const builder = new GraphBuilder(this.prisma, projectId);
    const result = await builder.buildFromDirectory(project.path);

    const lines = [
      `Graph build complete for project ${projectId} (${project.name})`,
      `Nodes created: ${result.nodeCount}`,
      `Edges created: ${result.edgeCount}`,
      `Unresolved refs: ${result.unresolvedCount}`,
      `Duration: ${result.durationMs}ms`
    ];

    if (result.errors.length > 0) {
      lines.push('\nErrors:');
      for (const err of result.errors) {
        lines.push(`  - ${err}`);
      }
    }

    return this.textResult(lines.join('\n'));
  }

  private async handleGetStats(args: Record<string, unknown>): Promise<ToolCallResult> {
    const projectId = args.projectId as number | undefined;

    if (projectId) {
      const stats = await this.prisma.graphBuildStats.findUnique({
        where: { projectId }
      });

      if (!stats) {
        return this.textResult(`No graph data found for project ${projectId}`);
      }

      return this.textResult(
        `Graph Stats for Project ${projectId}\n` +
        `Nodes: ${stats.nodeCount}\n` +
        `Edges: ${stats.edgeCount}\n` +
        `Unresolved: ${stats.unresolvedCount}\n` +
        `Vectors: ${stats.vectorCount}\n` +
        `Last build: ${stats.lastBuildAt?.toISOString() || 'never'}\n` +
        `Last vectors: ${stats.lastVectorAt?.toISOString() || 'never'}`
      );
    } else {
      const stats = await this.prisma.graphBuildStats.findMany();

      if (stats.length === 0) {
        return this.textResult('No graph data found');
      }

      const lines = ['Graph Stats (all projects):\n'];
      let totalNodes = 0, totalEdges = 0, totalVectors = 0;

      for (const s of stats) {
        lines.push(`Project ${s.projectId}: ${s.nodeCount} nodes, ${s.edgeCount} edges, ${s.vectorCount} vectors`);
        totalNodes += s.nodeCount;
        totalEdges += s.edgeCount;
        totalVectors += s.vectorCount;
      }

      lines.push(`\nTotals: ${totalNodes} nodes, ${totalEdges} edges, ${totalVectors} vectors`);

      return this.textResult(lines.join('\n'));
    }
  }

  private async handleDetectCycles(args: Record<string, unknown>): Promise<ToolCallResult> {
    const projectId = args.projectId as number;
    if (!projectId) {
      return this.errorResult('projectId is required');
    }

    const maxCycles = (args.maxCycles as number) || 10;
    const cycles = await this.queryManager.detectCycles(projectId, maxCycles);

    if (cycles.length === 0) {
      return this.textResult('No circular dependencies detected in this project.');
    }

    const lines = [`Found ${cycles.length} circular dependencies:\n`];
    for (let i = 0; i < cycles.length; i++) {
      const cycle = cycles[i];
      lines.push(`Cycle ${i + 1} (${cycle.length} nodes):`);
      for (let j = 0; j < cycle.nodeNames.length; j++) {
        const nodeName = cycle.nodeNames[j];
        const arrow = j < cycle.nodeNames.length - 1 ? ' ->' : ' -> [back to start]';
        lines.push(`  ${j + 1}. ${nodeName}${arrow}`);
      }
      lines.push('');
    }

    lines.push('Recommendation: Review these cycles for potential refactoring to reduce coupling.');
    return this.textResult(lines.join('\n'));
  }

  private async handleQueryGraph(args: Record<string, unknown>): Promise<ToolCallResult> {
    const queryText = args.query as string;
    if (!queryText) {
      return this.errorResult('query is required');
    }

    try {
      const query = this.dslParser.parse(queryText);

      if (args.projectId && !query.projectId) {
        query.projectId = args.projectId as number;
      }

      const result = await this.queryExecutor.execute(query);

      if (!result.success) {
        return this.errorResult(result.error || 'Query execution failed');
      }

      if (result.results.length === 0) {
        return this.textResult(`No results found for query: ${queryText}`);
      }

      const lines = [
        `Query: ${queryText}`,
        `Results: ${result.totalCount} (showing ${result.results.length})`,
        `Execution time: ${result.executionTimeMs}ms\n`
      ];

      for (const node of result.results) {
        lines.push(`- ${node.qualifiedName || node.name}`);
        lines.push(`  Type: ${node.nodeType}, File: ${node.filePath}:${node.lineStart}`);
        if (node.depth !== undefined) {
          lines.push(`  Depth: ${node.depth}${node.edgeType ? `, Edge: ${node.edgeType}` : ''}`);
        }
      }

      return this.textResult(lines.join('\n'));
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return this.errorResult(`Query parse error: ${errMsg}`);
    }
  }

  private async handleFindConstrainedPath(args: Record<string, unknown>): Promise<ToolCallResult> {
    const from = args.from as string;
    const to = args.to as string;

    if (!from || !to) {
      return this.errorResult('Both from and to are required');
    }

    const maxDepth = (args.maxDepth as number) || 15;
    const mustPass = (args.mustPass as string[]) || [];
    const mustAvoid = (args.mustAvoid as string[]) || [];

    const fromNode = await this.queryManager.getNodeByQualifiedName(from);
    const toNode = await this.queryManager.getNodeByQualifiedName(to);

    if (!fromNode) {
      return this.errorResult(`Source node not found: ${from}`);
    }
    if (!toNode) {
      return this.errorResult(`Target node not found: ${to}`);
    }

    const results = await this.prisma.$queryRaw<Array<{
      path: string;
      edges: string;
      depth: number;
    }>>`
      WITH RECURSIVE paths AS (
        SELECT
          ${fromNode.id} as current_id,
          ${fromNode.id} as path,
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
        WHERE p.depth < ${maxDepth}
          AND INSTR(p.path, e.target_id) = 0
      )
      SELECT path, edges, depth
      FROM paths
      WHERE current_id = ${toNode.id}
      ORDER BY depth ASC
      LIMIT 10
    `;

    if (results.length === 0) {
      return this.textResult(`No path found from ${from} to ${to}`);
    }

    let validPaths = results;

    if (mustPass.length > 0 || mustAvoid.length > 0) {
      const constraintNodes = await this.prisma.codeNode.findMany({
        where: {
          OR: [
            { qualifiedName: { in: [...mustPass, ...mustAvoid] } },
            { name: { in: [...mustPass, ...mustAvoid] } }
          ]
        },
        select: { id: true, name: true, qualifiedName: true }
      });

      const mustPassIds = new Set(
        constraintNodes
          .filter(n => mustPass.includes(n.qualifiedName) || mustPass.includes(n.name))
          .map(n => n.id)
      );
      const mustAvoidIds = new Set(
        constraintNodes
          .filter(n => mustAvoid.includes(n.qualifiedName) || mustAvoid.includes(n.name))
          .map(n => n.id)
      );

      validPaths = results.filter(result => {
        const pathIds = result.path.split(',');
        for (const id of mustPassIds) {
          if (!pathIds.includes(id)) return false;
        }
        for (const id of mustAvoidIds) {
          if (pathIds.includes(id)) return false;
        }
        return true;
      });
    }

    if (validPaths.length === 0) {
      return this.textResult(`No path found that satisfies all constraints`);
    }

    const bestPath = validPaths[0];
    const pathIds = bestPath.path.split(',');

    const nodes = await this.prisma.codeNode.findMany({
      where: { id: { in: pathIds } },
      select: { id: true, name: true, qualifiedName: true, filePath: true, lineStart: true }
    });

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const edges = bestPath.edges ? bestPath.edges.split(',') : [];

    const lines = [
      `Path found from ${from} to ${to}`,
      `Length: ${bestPath.depth} hops`,
      `Paths found: ${validPaths.length}\n`
    ];

    for (let i = 0; i < pathIds.length; i++) {
      const node = nodeMap.get(pathIds[i]);
      if (node) {
        lines.push(`${i + 1}. ${node.qualifiedName}`);
        lines.push(`   ${node.filePath}:${node.lineStart}`);
        if (i < edges.length) {
          lines.push(`   --> [${edges[i]}]`);
        }
      }
    }

    return this.textResult(lines.join('\n'));
  }

  private async handleGetSCC(args: Record<string, unknown>): Promise<ToolCallResult> {
    const projectId = args.projectId as number;
    if (!projectId) {
      return this.errorResult('projectId is required');
    }

    const minSize = (args.minSize as number) || 2;
    const sccs = await this.queryManager.getStronglyConnectedComponents(projectId, minSize);

    if (sccs.length === 0) {
      return this.textResult('No strongly connected components found (no circular dependencies detected).');
    }

    const lines = [`Found ${sccs.length} strongly connected components:\n`];
    for (const scc of sccs) {
      lines.push(`Component #${scc.id} (${scc.size} nodes):`);
      for (const node of scc.nodes.slice(0, 10)) {
        lines.push(`  - ${node.qualifiedName}`);
      }
      if (scc.nodes.length > 10) {
        lines.push(`  ... and ${scc.nodes.length - 10} more`);
      }
      lines.push('');
    }

    lines.push('These components contain mutually recursive or cyclically dependent code.');
    return this.textResult(lines.join('\n'));
  }

  private async handleGetPageRank(args: Record<string, unknown>): Promise<ToolCallResult> {
    const projectId = args.projectId as number;
    if (!projectId) {
      return this.errorResult('projectId is required');
    }

    const iterations = (args.iterations as number) || 20;
    const limit = (args.limit as number) || 20;

    const results = await this.queryManager.getPageRank(projectId, iterations, 0.85, limit);

    if (results.length === 0) {
      return this.textResult('No nodes found in the project graph.');
    }

    const lines = [`Top ${results.length} functions by PageRank:\n`];
    const maxRank = results[0].pageRank;

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const normalizedScore = ((r.pageRank / maxRank) * 100).toFixed(1);
      lines.push(`${i + 1}. ${r.qualifiedName}`);
      lines.push(`   Score: ${normalizedScore}% (raw: ${r.pageRank.toFixed(6)})`);
    }

    lines.push('\nHigher PageRank indicates more "important" functions - called by other important functions.');
    return this.textResult(lines.join('\n'));
  }

  private async handleGetCentrality(args: Record<string, unknown>): Promise<ToolCallResult> {
    const projectId = args.projectId as number;
    if (!projectId) {
      return this.errorResult('projectId is required');
    }

    const limit = (args.limit as number) || 20;

    const results = await this.queryManager.getBetweennessCentrality(projectId, 100, limit);

    if (results.length === 0) {
      return this.textResult('No nodes found in the project graph.');
    }

    const lines = [`Top ${results.length} functions by Betweenness Centrality:\n`];
    const maxCentrality = results[0].centrality || 1;

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const normalizedScore = ((r.centrality / maxCentrality) * 100).toFixed(1);
      lines.push(`${i + 1}. ${r.qualifiedName}`);
      lines.push(`   Centrality: ${normalizedScore}% (raw: ${r.centrality.toFixed(2)})`);
    }

    lines.push('\nHigh centrality = bottleneck/bridge function connecting different code areas.');
    return this.textResult(lines.join('\n'));
  }

  private async handleExportVisualization(args: Record<string, unknown>): Promise<ToolCallResult> {
    const graphType = (args.graphType as string) || 'subgraph';
    const format = (args.format as string) || 'dot';
    const depth = (args.depth as number) || 3;
    const maxNodes = (args.maxNodes as number) || 100;
    const layout = (args.layout as string) || 'hierarchical';
    const title = args.title as string | undefined;

    const exportOptions = {
      format: format as 'dot' | 'json' | 'd3' | 'cytoscape',
      maxNodes,
      layout: layout as 'hierarchical' | 'force' | 'radial' | 'circular',
      title
    };

    let result: string;

    if (graphType === 'project') {
      const projectId = args.projectId as number;
      if (!projectId) {
        return this.errorResult('projectId is required for project graph export');
      }
      result = await this.visualization.exportProjectGraph(projectId, exportOptions);
    } else {
      const nodeId = await this.resolveNodeId(args);
      if (!nodeId) {
        return this.errorResult('Either nodeId or qualifiedName is required');
      }

      switch (graphType) {
        case 'callers':
          result = await this.visualization.exportCallerGraph(nodeId, depth, exportOptions);
          break;
        case 'callees':
          result = await this.visualization.exportCalleeGraph(nodeId, depth, exportOptions);
          break;
        case 'impact':
          result = await this.visualization.exportImpactGraph(nodeId, depth, exportOptions);
          break;
        case 'subgraph':
        default:
          result = await this.visualization.exportSubgraph(nodeId, depth, exportOptions);
          break;
      }
    }

    if (format === 'dot') {
      const header = [
        `// Graph exported in DOT format`,
        `// To render: dot -Tsvg graph.dot -o graph.svg`,
        `// Or: dot -Tpng graph.dot -o graph.png`,
        ``
      ].join('\n');
      result = header + result;
    }

    return this.textResult(result);
  }

  // ============================================
  // Helper Methods
  // ============================================

  private async resolveNodeId(args: Record<string, unknown>): Promise<string | null> {
    if (args.nodeId) {
      return args.nodeId as string;
    }

    if (args.qualifiedName) {
      const node = await this.queryManager.getNodeByQualifiedName(
        args.qualifiedName as string,
        args.projectId as number | undefined
      );
      return node?.id || null;
    }

    return null;
  }

  private textResult(text: string): ToolCallResult {
    return {
      content: [{ type: 'text', text }]
    };
  }

  private errorResult(message: string): ToolCallResult {
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true
    };
  }
}

// ============================================
// Factory Function
// ============================================

let handlerInstance: GraphToolHandler | null = null;

export function getGraphToolHandler(context: GraphToolHandlerContext): GraphToolHandler {
  if (!handlerInstance) {
    handlerInstance = new GraphToolHandler(context);
  }
  return handlerInstance;
}

export function resetGraphToolHandler(): void {
  handlerInstance = null;
}

/**
 * Simple function-based entry point for graph tool calls.
 * Used by index.ts to delegate graph tool handling.
 */
export async function handleGraphToolCall(
  toolName: string,
  args: Record<string, unknown>,
  prisma: PrismaClient
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const handler = getGraphToolHandler({ prisma });
  return handler.handle(toolName, args);
}
