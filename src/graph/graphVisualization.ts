/**
 * Graph Visualization Export - Generate DOT/GraphViz and JSON for Axon code visualization
 *
 * Provides export formats for:
 * - DOT (GraphViz) - for command-line rendering with dot/neato
 * - JSON - for web-based graph visualization
 * - D3.js compatible format
 * - Cytoscape.js compatible format
 */

import type { PrismaClient } from '../generated/prisma/index.js';

// ============================================
// Types
// ============================================

export interface VisualizationNode {
  id: string;
  name: string;
  qualifiedName: string;
  nodeType: string;
  filePath: string;
  lineStart: number;
  group?: string;
  weight?: number;
  color?: string;
}

export interface VisualizationEdge {
  source: string;
  target: string;
  edgeType: string;
  lineNumber?: number;
  weight?: number;
}

export interface SubgraphData {
  nodes: VisualizationNode[];
  edges: VisualizationEdge[];
  metadata: {
    title?: string;
    description?: string;
    generatedAt: string;
    nodeCount: number;
    edgeCount: number;
    focalNodeId?: string;
  };
}

export interface ExportOptions {
  format: 'dot' | 'json' | 'd3' | 'cytoscape';
  includeMetadata?: boolean;
  colorScheme?: 'type' | 'file' | 'depth' | 'custom';
  layout?: 'hierarchical' | 'force' | 'radial' | 'circular';
  maxNodes?: number;
  title?: string;
}

// ============================================
// Color Schemes (Axon-specific)
// ============================================

const NODE_TYPE_COLORS: Record<string, string> = {
  function: '#2ECC71',   // Green for functions
  defcomp: '#4B8BBE',    // Blue for defcomps
  variable: '#9B59B6',   // Purple for variables
  default: '#95A5A6'     // Gray for unknown
};

const EDGE_TYPE_COLORS: Record<string, string> = {
  calls: '#2C3E50',      // Dark blue for calls
  contains: '#95A5A6'    // Gray for containment
};

// ============================================
// Graph Visualization Service
// ============================================

export class GraphVisualizationService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async exportSubgraph(
    nodeId: string,
    depth: number = 2,
    options: ExportOptions = { format: 'dot' }
  ): Promise<string> {
    const subgraph = await this.getSubgraph(nodeId, depth, options.maxNodes);
    return this.formatExport(subgraph, options);
  }

  async exportCallerGraph(
    nodeId: string,
    depth: number = 3,
    options: ExportOptions = { format: 'dot' }
  ): Promise<string> {
    const subgraph = await this.getCallerSubgraph(nodeId, depth, options.maxNodes);
    return this.formatExport(subgraph, options);
  }

  async exportCalleeGraph(
    nodeId: string,
    depth: number = 3,
    options: ExportOptions = { format: 'dot' }
  ): Promise<string> {
    const subgraph = await this.getCalleeSubgraph(nodeId, depth, options.maxNodes);
    return this.formatExport(subgraph, options);
  }

  async exportImpactGraph(
    nodeId: string,
    depth: number = 5,
    options: ExportOptions = { format: 'dot' }
  ): Promise<string> {
    const subgraph = await this.getImpactSubgraph(nodeId, depth, options.maxNodes);
    return this.formatExport(subgraph, options);
  }

  async exportProjectGraph(
    projectId: number,
    options: ExportOptions = { format: 'dot' }
  ): Promise<string> {
    const subgraph = await this.getProjectGraph(projectId, options.maxNodes || 500);
    return this.formatExport(subgraph, options);
  }

  // ============================================
  // Subgraph Extraction Methods
  // ============================================

  private async getSubgraph(
    focalNodeId: string,
    depth: number,
    maxNodes?: number
  ): Promise<SubgraphData> {
    const nodeSet = new Set<string>();
    const edgeList: VisualizationEdge[] = [];

    const focalNode = await this.prisma.codeNode.findUnique({
      where: { id: focalNodeId }
    });

    if (!focalNode) {
      throw new Error(`Node not found: ${focalNodeId}`);
    }

    const projectId = focalNode.projectId;
    nodeSet.add(focalNodeId);

    const queue: Array<{ id: string; depth: number }> = [{ id: focalNodeId, depth: 0 }];
    const visited = new Set<string>([focalNodeId]);

    while (queue.length > 0 && (!maxNodes || nodeSet.size < maxNodes)) {
      const current = queue.shift()!;
      if (current.depth >= depth) continue;

      const outEdges = await this.prisma.codeEdge.findMany({
        where: { sourceId: current.id, target: { projectId } },
        select: { targetId: true, edgeType: true, lineNumber: true }
      });

      for (const edge of outEdges) {
        if (!maxNodes || nodeSet.size < maxNodes) {
          nodeSet.add(edge.targetId);
          edgeList.push({
            source: current.id,
            target: edge.targetId,
            edgeType: edge.edgeType,
            lineNumber: edge.lineNumber ?? undefined
          });

          if (!visited.has(edge.targetId)) {
            visited.add(edge.targetId);
            queue.push({ id: edge.targetId, depth: current.depth + 1 });
          }
        }
      }

      const inEdges = await this.prisma.codeEdge.findMany({
        where: { targetId: current.id, source: { projectId } },
        select: { sourceId: true, edgeType: true, lineNumber: true }
      });

      for (const edge of inEdges) {
        if (!maxNodes || nodeSet.size < maxNodes) {
          nodeSet.add(edge.sourceId);
          edgeList.push({
            source: edge.sourceId,
            target: current.id,
            edgeType: edge.edgeType,
            lineNumber: edge.lineNumber ?? undefined
          });

          if (!visited.has(edge.sourceId)) {
            visited.add(edge.sourceId);
            queue.push({ id: edge.sourceId, depth: current.depth + 1 });
          }
        }
      }
    }

    const nodes = await this.getNodeDetails(Array.from(nodeSet));

    return {
      nodes,
      edges: this.deduplicateEdges(edgeList),
      metadata: {
        title: `Subgraph around ${focalNode.name}`,
        generatedAt: new Date().toISOString(),
        nodeCount: nodes.length,
        edgeCount: edgeList.length,
        focalNodeId
      }
    };
  }

  private async getCallerSubgraph(
    nodeId: string,
    depth: number,
    maxNodes?: number
  ): Promise<SubgraphData> {
    const limit = maxNodes || 100;
    const seedNode = await this.prisma.codeNode.findUnique({
      where: { id: nodeId },
      select: { projectId: true }
    });
    const projectId = seedNode?.projectId ?? -1;

    const results = await this.prisma.$queryRaw<Array<{
      id: string;
      source_id: string;
      edge_type: string;
      line_number: number | null;
      depth: number;
    }>>`
      WITH RECURSIVE callers AS (
        SELECT
          n.id,
          e.source_id,
          e.edge_type,
          e.line_number,
          1 as depth
        FROM code_nodes n
        INNER JOIN code_edges e ON e.target_id = n.id
        INNER JOIN code_nodes src ON src.id = e.source_id
        WHERE n.id = ${nodeId}
          AND e.edge_type = 'calls'
          AND src.project_id = ${projectId}

        UNION ALL

        SELECT
          n.id,
          e.source_id,
          e.edge_type,
          e.line_number,
          c.depth + 1
        FROM callers c
        INNER JOIN code_edges e ON e.target_id = c.source_id
        INNER JOIN code_nodes n ON n.id = e.target_id
        INNER JOIN code_nodes src ON src.id = e.source_id
        WHERE c.depth < ${depth}
          AND e.edge_type = 'calls'
          AND src.project_id = ${projectId}
      )
      SELECT DISTINCT id, source_id, edge_type, line_number, MIN(depth) as depth
      FROM callers
      GROUP BY id, source_id
      ORDER BY depth
      LIMIT ${limit}
    `;

    const nodeSet = new Set<string>([nodeId]);
    const edgeList: VisualizationEdge[] = [];

    for (const row of results) {
      nodeSet.add(row.source_id);
      edgeList.push({
        source: row.source_id,
        target: row.id,
        edgeType: row.edge_type,
        lineNumber: row.line_number ?? undefined
      });
    }

    const nodes = await this.getNodeDetails(Array.from(nodeSet));
    const focalNode = nodes.find(n => n.id === nodeId);

    return {
      nodes,
      edges: edgeList,
      metadata: {
        title: `Callers of ${focalNode?.name || nodeId}`,
        generatedAt: new Date().toISOString(),
        nodeCount: nodes.length,
        edgeCount: edgeList.length,
        focalNodeId: nodeId
      }
    };
  }

  private async getCalleeSubgraph(
    nodeId: string,
    depth: number,
    maxNodes?: number
  ): Promise<SubgraphData> {
    const limit = maxNodes || 100;
    const seedNode = await this.prisma.codeNode.findUnique({
      where: { id: nodeId },
      select: { projectId: true }
    });
    const projectId = seedNode?.projectId ?? -1;

    const results = await this.prisma.$queryRaw<Array<{
      id: string;
      target_id: string;
      edge_type: string;
      line_number: number | null;
      depth: number;
    }>>`
      WITH RECURSIVE callees AS (
        SELECT
          n.id,
          e.target_id,
          e.edge_type,
          e.line_number,
          1 as depth
        FROM code_nodes n
        INNER JOIN code_edges e ON e.source_id = n.id
        INNER JOIN code_nodes tgt ON tgt.id = e.target_id
        WHERE n.id = ${nodeId}
          AND e.edge_type = 'calls'
          AND tgt.project_id = ${projectId}

        UNION ALL

        SELECT
          n.id,
          e.target_id,
          e.edge_type,
          e.line_number,
          c.depth + 1
        FROM callees c
        INNER JOIN code_edges e ON e.source_id = c.target_id
        INNER JOIN code_nodes n ON n.id = e.source_id
        INNER JOIN code_nodes tgt ON tgt.id = e.target_id
        WHERE c.depth < ${depth}
          AND e.edge_type = 'calls'
          AND tgt.project_id = ${projectId}
      )
      SELECT DISTINCT id, target_id, edge_type, line_number, MIN(depth) as depth
      FROM callees
      GROUP BY id, target_id
      ORDER BY depth
      LIMIT ${limit}
    `;

    const nodeSet = new Set<string>([nodeId]);
    const edgeList: VisualizationEdge[] = [];

    for (const row of results) {
      nodeSet.add(row.target_id);
      edgeList.push({
        source: row.id,
        target: row.target_id,
        edgeType: row.edge_type,
        lineNumber: row.line_number ?? undefined
      });
    }

    const nodes = await this.getNodeDetails(Array.from(nodeSet));
    const focalNode = nodes.find(n => n.id === nodeId);

    return {
      nodes,
      edges: edgeList,
      metadata: {
        title: `Callees of ${focalNode?.name || nodeId}`,
        generatedAt: new Date().toISOString(),
        nodeCount: nodes.length,
        edgeCount: edgeList.length,
        focalNodeId: nodeId
      }
    };
  }

  private async getImpactSubgraph(
    nodeId: string,
    depth: number,
    maxNodes?: number
  ): Promise<SubgraphData> {
    const limit = maxNodes || 100;
    const seedNode = await this.prisma.codeNode.findUnique({
      where: { id: nodeId },
      select: { projectId: true }
    });
    const projectId = seedNode?.projectId ?? -1;

    const results = await this.prisma.$queryRaw<Array<{
      id: string;
      source_id: string;
      edge_type: string;
      depth: number;
    }>>`
      WITH RECURSIVE affected AS (
        SELECT
          e.target_id as id,
          e.source_id,
          e.edge_type,
          1 as depth
        FROM code_edges e
        INNER JOIN code_nodes src ON src.id = e.source_id
        WHERE e.target_id = ${nodeId}
          AND e.edge_type = 'calls'
          AND src.project_id = ${projectId}

        UNION ALL

        SELECT
          e.target_id,
          e.source_id,
          e.edge_type,
          a.depth + 1
        FROM affected a
        INNER JOIN code_edges e ON e.target_id = a.source_id
        INNER JOIN code_nodes src ON src.id = e.source_id
        WHERE a.depth < ${depth}
          AND e.edge_type = 'calls'
          AND src.project_id = ${projectId}
      )
      SELECT DISTINCT id, source_id, edge_type, MIN(depth) as depth
      FROM affected
      GROUP BY id, source_id
      ORDER BY depth
      LIMIT ${limit}
    `;

    const nodeSet = new Set<string>([nodeId]);
    const edgeList: VisualizationEdge[] = [];

    for (const row of results) {
      nodeSet.add(row.source_id);
      edgeList.push({
        source: row.source_id,
        target: row.id,
        edgeType: row.edge_type
      });
    }

    const nodes = await this.getNodeDetails(Array.from(nodeSet));
    const focalNode = nodes.find(n => n.id === nodeId);

    return {
      nodes,
      edges: edgeList,
      metadata: {
        title: `Impact of ${focalNode?.name || nodeId}`,
        description: 'Code that would be affected by changes to this node',
        generatedAt: new Date().toISOString(),
        nodeCount: nodes.length,
        edgeCount: edgeList.length,
        focalNodeId: nodeId
      }
    };
  }

  private async getProjectGraph(
    projectId: number,
    maxNodes: number
  ): Promise<SubgraphData> {
    const nodes = await this.prisma.codeNode.findMany({
      where: { projectId },
      take: maxNodes,
      select: {
        id: true,
        name: true,
        qualifiedName: true,
        nodeType: true,
        filePath: true,
        lineStart: true
      }
    });

    const nodeIds = nodes.map(n => n.id);

    const edges = await this.prisma.codeEdge.findMany({
      where: {
        sourceId: { in: nodeIds },
        targetId: { in: nodeIds }
      },
      select: {
        sourceId: true,
        targetId: true,
        edgeType: true,
        lineNumber: true
      }
    });

    return {
      nodes: nodes.map(n => ({
        id: n.id,
        name: n.name,
        qualifiedName: n.qualifiedName,
        nodeType: n.nodeType,
        filePath: n.filePath,
        lineStart: n.lineStart
      })),
      edges: edges.map(e => ({
        source: e.sourceId,
        target: e.targetId,
        edgeType: e.edgeType,
        lineNumber: e.lineNumber ?? undefined
      })),
      metadata: {
        title: `Project ${projectId} Graph`,
        generatedAt: new Date().toISOString(),
        nodeCount: nodes.length,
        edgeCount: edges.length
      }
    };
  }

  // ============================================
  // Export Formatters
  // ============================================

  private formatExport(subgraph: SubgraphData, options: ExportOptions): string {
    switch (options.format) {
      case 'dot':
        return this.formatDot(subgraph, options);
      case 'json':
        return this.formatJson(subgraph);
      case 'd3':
        return this.formatD3(subgraph);
      case 'cytoscape':
        return this.formatCytoscape(subgraph);
      default:
        return this.formatDot(subgraph, options);
    }
  }

  private formatDot(subgraph: SubgraphData, options: ExportOptions): string {
    const lines: string[] = [];
    const layout = options.layout || 'hierarchical';

    lines.push(`digraph AxonCodeGraph {`);
    lines.push(`  // Generated: ${subgraph.metadata.generatedAt}`);
    lines.push(`  // Nodes: ${subgraph.metadata.nodeCount}, Edges: ${subgraph.metadata.edgeCount}`);
    lines.push('');

    if (layout === 'hierarchical') {
      lines.push('  rankdir=TB;');
      lines.push('  splines=ortho;');
    } else if (layout === 'radial') {
      lines.push('  layout=twopi;');
      lines.push('  ranksep=3;');
    } else if (layout === 'circular') {
      lines.push('  layout=circo;');
    }

    lines.push('  node [shape=box, style=rounded, fontname="Helvetica"];');
    lines.push('  edge [fontname="Helvetica", fontsize=10];');
    lines.push('');

    if (options.title || subgraph.metadata.title) {
      lines.push(`  label="${this.escapeLabel(options.title || subgraph.metadata.title || '')}";`);
      lines.push('  labelloc=t;');
      lines.push('  fontsize=16;');
      lines.push('');
    }

    // Nodes
    lines.push('  // Nodes');
    for (const node of subgraph.nodes) {
      const color = this.getNodeColor(node, options.colorScheme);
      const label = this.escapeLabel(node.name);
      const tooltip = this.escapeLabel(node.qualifiedName);

      const isFocal = node.id === subgraph.metadata.focalNodeId;
      const style = isFocal ? 'filled,bold' : 'filled';
      const penwidth = isFocal ? 3 : 1;

      lines.push(`  "${node.id}" [label="${label}", tooltip="${tooltip}", fillcolor="${color}", style="${style}", penwidth=${penwidth}];`);
    }
    lines.push('');

    // Edges
    lines.push('  // Edges');
    for (const edge of subgraph.edges) {
      const color = EDGE_TYPE_COLORS[edge.edgeType] || EDGE_TYPE_COLORS.calls;
      const label = edge.edgeType !== 'calls' ? edge.edgeType : '';
      const style = edge.edgeType === 'contains' ? 'dashed' : 'solid';

      lines.push(`  "${edge.source}" -> "${edge.target}" [color="${color}", label="${label}", style="${style}"];`);
    }

    lines.push('}');

    return lines.join('\n');
  }

  private formatJson(subgraph: SubgraphData): string {
    return JSON.stringify(subgraph, null, 2);
  }

  private formatD3(subgraph: SubgraphData): string {
    const d3Data = {
      nodes: subgraph.nodes.map(n => ({
        id: n.id,
        name: n.name,
        group: n.nodeType,
        qualifiedName: n.qualifiedName,
        filePath: n.filePath,
        lineStart: n.lineStart,
        color: NODE_TYPE_COLORS[n.nodeType] || NODE_TYPE_COLORS.default,
        isFocal: n.id === subgraph.metadata.focalNodeId
      })),
      links: subgraph.edges.map(e => ({
        source: e.source,
        target: e.target,
        type: e.edgeType,
        color: EDGE_TYPE_COLORS[e.edgeType] || EDGE_TYPE_COLORS.calls
      })),
      metadata: subgraph.metadata
    };

    return JSON.stringify(d3Data, null, 2);
  }

  private formatCytoscape(subgraph: SubgraphData): string {
    const elements = {
      nodes: subgraph.nodes.map(n => ({
        data: {
          id: n.id,
          label: n.name,
          qualifiedName: n.qualifiedName,
          nodeType: n.nodeType,
          filePath: n.filePath,
          lineStart: n.lineStart,
          color: NODE_TYPE_COLORS[n.nodeType] || NODE_TYPE_COLORS.default,
          isFocal: n.id === subgraph.metadata.focalNodeId
        }
      })),
      edges: subgraph.edges.map((e, i) => ({
        data: {
          id: `e${i}`,
          source: e.source,
          target: e.target,
          edgeType: e.edgeType,
          color: EDGE_TYPE_COLORS[e.edgeType] || EDGE_TYPE_COLORS.calls
        }
      }))
    };

    return JSON.stringify({ elements, metadata: subgraph.metadata }, null, 2);
  }

  // ============================================
  // Helper Methods
  // ============================================

  private async getNodeDetails(nodeIds: string[]): Promise<VisualizationNode[]> {
    if (nodeIds.length === 0) return [];

    const nodes = await this.prisma.codeNode.findMany({
      where: { id: { in: nodeIds } },
      select: {
        id: true,
        name: true,
        qualifiedName: true,
        nodeType: true,
        filePath: true,
        lineStart: true
      }
    });

    return nodes.map(n => ({
      id: n.id,
      name: n.name,
      qualifiedName: n.qualifiedName,
      nodeType: n.nodeType,
      filePath: n.filePath,
      lineStart: n.lineStart
    }));
  }

  private deduplicateEdges(edges: VisualizationEdge[]): VisualizationEdge[] {
    const seen = new Set<string>();
    return edges.filter(e => {
      const key = `${e.source}->${e.target}:${e.edgeType}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private getNodeColor(node: VisualizationNode, scheme?: string): string {
    if (scheme === 'file') {
      let hash = 0;
      for (let i = 0; i < node.filePath.length; i++) {
        hash = ((hash << 5) - hash) + node.filePath.charCodeAt(i);
        hash = hash & hash;
      }
      const hue = Math.abs(hash % 360);
      return `hsl(${hue}, 70%, 85%)`;
    }

    return NODE_TYPE_COLORS[node.nodeType] || NODE_TYPE_COLORS.default;
  }

  private escapeLabel(str: string): string {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');
  }
}

// ============================================
// Factory Function
// ============================================

let serviceInstance: GraphVisualizationService | null = null;

export function getGraphVisualizationService(prisma: PrismaClient): GraphVisualizationService {
  if (!serviceInstance) {
    serviceInstance = new GraphVisualizationService(prisma);
  }
  return serviceInstance;
}

export function resetGraphVisualizationService(): void {
  serviceInstance = null;
}
