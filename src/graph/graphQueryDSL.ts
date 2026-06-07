/**
 * Graph Query DSL - Domain-Specific Language for Axon code graph queries
 *
 * Provides a structured way to express complex graph queries:
 * - Pattern matching on nodes (name, type, file path)
 * - Relationship traversal (callers, callees)
 * - Filtering by depth, edge type, and properties
 * - Aggregations and grouping
 *
 * Example queries:
 *   MATCH function WHERE name LIKE "handle*" CALLERS depth=3
 *   PATH FROM "myFunc" TO "cleanup" maxDepth=10
 *   COUNT function WHERE filePath CONTAINS "/lib/"
 */

import type { PrismaClient } from '../generated/prisma/index.js';
import type { EdgeType, NodeType } from './types.js';

// ============================================
// DSL Types
// ============================================

export type QueryOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'in'
  | 'notIn';

export type TraversalDirection = 'callers' | 'callees';

export interface PropertyFilter {
  field: string;
  operator: QueryOperator;
  value: string | string[];
}

export interface TraversalOptions {
  direction: TraversalDirection;
  maxDepth: number;
  edgeTypes?: EdgeType[];
  includeStart?: boolean;
}

export interface GraphQuery {
  type: 'match' | 'path' | 'aggregate';
  nodeType?: NodeType;
  filters: PropertyFilter[];
  traversal?: TraversalOptions;
  pathOptions?: {
    from: string;
    to: string;
    maxDepth: number;
    edgeTypes?: EdgeType[];
  };
  aggregation?: {
    groupBy?: string;
    count?: boolean;
  };
  projectId?: number;
  limit: number;
  offset: number;
}

export interface QueryResult {
  success: boolean;
  query: GraphQuery;
  results: Array<{
    id: string;
    name: string;
    qualifiedName: string;
    nodeType: string;
    filePath: string;
    lineStart: number;
    depth?: number;
    edgeType?: string;
    matchedFilter?: string;
  }>;
  totalCount: number;
  executionTimeMs: number;
  error?: string;
}

// ============================================
// Query Builder Class
// ============================================

export class GraphQueryBuilder {
  private query: GraphQuery;

  constructor() {
    this.query = {
      type: 'match',
      filters: [],
      limit: 50,
      offset: 0
    };
  }

  type(queryType: 'match' | 'path' | 'aggregate'): this {
    this.query.type = queryType;
    return this;
  }

  nodeType(nodeType: NodeType): this {
    this.query.nodeType = nodeType;
    return this;
  }

  where(field: string, operator: QueryOperator, value: string | string[]): this {
    this.query.filters.push({ field, operator, value });
    return this;
  }

  whereEquals(field: string, value: string): this {
    return this.where(field, 'equals', value);
  }

  whereContains(field: string, value: string): this {
    return this.where(field, 'contains', value);
  }

  whereStartsWith(field: string, value: string): this {
    return this.where(field, 'startsWith', value);
  }

  traverse(direction: TraversalDirection, maxDepth: number = 5, edgeTypes?: EdgeType[]): this {
    this.query.traversal = {
      direction,
      maxDepth,
      edgeTypes,
      includeStart: false
    };
    return this;
  }

  callers(maxDepth: number = 5): this {
    return this.traverse('callers', maxDepth, ['calls']);
  }

  callees(maxDepth: number = 5): this {
    return this.traverse('callees', maxDepth, ['calls']);
  }

  pathBetween(from: string, to: string, maxDepth: number = 10): this {
    this.query.type = 'path';
    this.query.pathOptions = { from, to, maxDepth };
    return this;
  }

  groupBy(field: string): this {
    this.query.type = 'aggregate';
    this.query.aggregation = { ...this.query.aggregation, groupBy: field };
    return this;
  }

  count(): this {
    this.query.type = 'aggregate';
    this.query.aggregation = { ...this.query.aggregation, count: true };
    return this;
  }

  inProject(projectId: number): this {
    this.query.projectId = projectId;
    return this;
  }

  limit(limit: number): this {
    this.query.limit = limit;
    return this;
  }

  offset(offset: number): this {
    this.query.offset = offset;
    return this;
  }

  build(): GraphQuery {
    return { ...this.query };
  }
}

// ============================================
// Query Executor
// ============================================

export class GraphQueryExecutor {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async execute(query: GraphQuery): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      switch (query.type) {
        case 'match':
          return await this.executeMatch(query, startTime);
        case 'path':
          return await this.executePath(query, startTime);
        case 'aggregate':
          return await this.executeAggregate(query, startTime);
        default:
          throw new Error(`Unknown query type: ${query.type}`);
      }
    } catch (error) {
      console.error(`[graph-dsl] Query execution failed: ${error}`);
      return {
        success: false,
        query,
        results: [],
        totalCount: 0,
        executionTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async executeMatch(query: GraphQuery, startTime: number): Promise<QueryResult> {
    const whereConditions = this.buildWhereConditions(query);

    const nodes = await this.prisma.codeNode.findMany({
      where: whereConditions,
      select: {
        id: true,
        name: true,
        qualifiedName: true,
        nodeType: true,
        filePath: true,
        lineStart: true
      },
      take: query.limit,
      skip: query.offset,
      orderBy: { name: 'asc' }
    });

    let results = nodes.map(n => ({
      id: n.id,
      name: n.name,
      qualifiedName: n.qualifiedName,
      nodeType: n.nodeType,
      filePath: n.filePath,
      lineStart: n.lineStart
    }));

    if (query.traversal && nodes.length > 0) {
      results = await this.executeTraversal(nodes[0].id, query.traversal);
    }

    const totalCount = await this.prisma.codeNode.count({ where: whereConditions });

    return {
      success: true,
      query,
      results,
      totalCount,
      executionTimeMs: Date.now() - startTime
    };
  }

  private async executePath(query: GraphQuery, startTime: number): Promise<QueryResult> {
    if (!query.pathOptions) {
      throw new Error('Path options required for path query');
    }

    const { from, to, maxDepth } = query.pathOptions;

    const [sourceNode, targetNode] = await Promise.all([
      this.prisma.codeNode.findFirst({
        where: { OR: [{ qualifiedName: from }, { name: from }] }
      }),
      this.prisma.codeNode.findFirst({
        where: { OR: [{ qualifiedName: to }, { name: to }] }
      })
    ]);

    if (!sourceNode || !targetNode) {
      return {
        success: false,
        query,
        results: [],
        totalCount: 0,
        executionTimeMs: Date.now() - startTime,
        error: `Node not found: ${!sourceNode ? from : to}`
      };
    }

    const pathResult = await this.prisma.$queryRaw<Array<{
      path: string;
      edges: string;
      depth: number;
    }>>`
      WITH RECURSIVE paths AS (
        SELECT
          ${sourceNode.id} as current_id,
          ${sourceNode.id} as path,
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
      WHERE current_id = ${targetNode.id}
      ORDER BY depth ASC
      LIMIT 1
    `;

    if (pathResult.length === 0) {
      return {
        success: true,
        query,
        results: [],
        totalCount: 0,
        executionTimeMs: Date.now() - startTime
      };
    }

    const pathIds = pathResult[0].path.split(',');
    const nodes = await this.prisma.codeNode.findMany({
      where: { id: { in: pathIds } },
      select: {
        id: true,
        name: true,
        qualifiedName: true,
        nodeType: true,
        filePath: true,
        lineStart: true
      }
    });

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const results = pathIds
      .map((id, idx) => {
        const node = nodeMap.get(id);
        if (!node) return null;
        return {
          id: node.id,
          name: node.name,
          qualifiedName: node.qualifiedName,
          nodeType: node.nodeType,
          filePath: node.filePath,
          lineStart: node.lineStart,
          depth: idx
        };
      })
      .filter((n): n is NonNullable<typeof n> => n !== null);

    return {
      success: true,
      query,
      results,
      totalCount: results.length,
      executionTimeMs: Date.now() - startTime
    };
  }

  private async executeAggregate(query: GraphQuery, startTime: number): Promise<QueryResult> {
    const whereConditions = this.buildWhereConditions(query);

    if (query.aggregation?.count) {
      const count = await this.prisma.codeNode.count({ where: whereConditions });
      return {
        success: true,
        query,
        results: [{
          id: 'count',
          name: `Total: ${count}`,
          qualifiedName: '',
          nodeType: 'aggregate',
          filePath: '',
          lineStart: 0
        }],
        totalCount: count,
        executionTimeMs: Date.now() - startTime
      };
    }

    if (query.aggregation?.groupBy) {
      const field = query.aggregation.groupBy;
      const results = await this.prisma.$queryRaw<Array<{
        group_value: string;
        count: number;
      }>>`
        SELECT ${field} as group_value, COUNT(*) as count
        FROM code_nodes
        GROUP BY ${field}
        ORDER BY count DESC
        LIMIT ${query.limit}
      `;

      return {
        success: true,
        query,
        results: results.map((r, idx) => ({
          id: `group-${idx}`,
          name: `${r.group_value}: ${r.count}`,
          qualifiedName: r.group_value,
          nodeType: 'aggregate',
          filePath: '',
          lineStart: 0,
          depth: Number(r.count)
        })),
        totalCount: results.length,
        executionTimeMs: Date.now() - startTime
      };
    }

    return {
      success: false,
      query,
      results: [],
      totalCount: 0,
      executionTimeMs: Date.now() - startTime,
      error: 'No aggregation specified'
    };
  }

  private async executeTraversal(
    nodeId: string,
    options: TraversalOptions
  ): Promise<QueryResult['results']> {
    const { direction, maxDepth, edgeTypes } = options;
    const edgeTypeList = edgeTypes?.map(t => `'${t}'`).join(',') || "'calls'";

    let query: string;
    if (direction === 'callers') {
      query = `
        WITH RECURSIVE traverse AS (
          SELECT
            n.id, n.name, n.qualified_name, n.node_type, n.file_path, n.line_start,
            1 as depth, e.edge_type
          FROM code_nodes n
          INNER JOIN code_edges e ON e.source_id = n.id
          WHERE e.target_id = '${nodeId}'
            AND e.edge_type IN (${edgeTypeList})
          UNION ALL
          SELECT
            n.id, n.name, n.qualified_name, n.node_type, n.file_path, n.line_start,
            t.depth + 1, e.edge_type
          FROM code_nodes n
          INNER JOIN code_edges e ON e.source_id = n.id
          INNER JOIN traverse t ON e.target_id = t.id
          WHERE t.depth < ${maxDepth}
            AND e.edge_type IN (${edgeTypeList})
        )
        SELECT DISTINCT id, name, qualified_name, node_type, file_path, line_start,
          MIN(depth) as depth, edge_type
        FROM traverse
        GROUP BY id
        ORDER BY depth ASC, name ASC
      `;
    } else {
      query = `
        WITH RECURSIVE traverse AS (
          SELECT
            n.id, n.name, n.qualified_name, n.node_type, n.file_path, n.line_start,
            1 as depth, e.edge_type
          FROM code_nodes n
          INNER JOIN code_edges e ON e.target_id = n.id
          WHERE e.source_id = '${nodeId}'
            AND e.edge_type IN (${edgeTypeList})
          UNION ALL
          SELECT
            n.id, n.name, n.qualified_name, n.node_type, n.file_path, n.line_start,
            t.depth + 1, e.edge_type
          FROM code_nodes n
          INNER JOIN code_edges e ON e.target_id = n.id
          INNER JOIN traverse t ON e.source_id = t.id
          WHERE t.depth < ${maxDepth}
            AND e.edge_type IN (${edgeTypeList})
        )
        SELECT DISTINCT id, name, qualified_name, node_type, file_path, line_start,
          MIN(depth) as depth, edge_type
        FROM traverse
        GROUP BY id
        ORDER BY depth ASC, name ASC
      `;
    }

    const results = await this.prisma.$queryRawUnsafe<Array<{
      id: string;
      name: string;
      qualified_name: string;
      node_type: string;
      file_path: string;
      line_start: number;
      depth: number;
      edge_type: string;
    }>>(query);

    return results.map(r => ({
      id: r.id,
      name: r.name,
      qualifiedName: r.qualified_name,
      nodeType: r.node_type,
      filePath: r.file_path,
      lineStart: r.line_start,
      depth: r.depth,
      edgeType: r.edge_type
    }));
  }

  private buildWhereConditions(query: GraphQuery): Record<string, unknown> {
    const conditions: Record<string, unknown> = {};

    if (query.projectId) {
      conditions.projectId = query.projectId;
    }

    if (query.nodeType) {
      conditions.nodeType = query.nodeType;
    }

    for (const filter of query.filters) {
      const { field, operator, value } = filter;

      switch (operator) {
        case 'equals':
          conditions[field] = value;
          break;
        case 'notEquals':
          conditions[field] = { not: value };
          break;
        case 'contains':
          conditions[field] = { contains: value as string };
          break;
        case 'startsWith':
          conditions[field] = { startsWith: value as string };
          break;
        case 'endsWith':
          conditions[field] = { endsWith: value as string };
          break;
        case 'in':
          conditions[field] = { in: value as string[] };
          break;
        case 'notIn':
          conditions[field] = { notIn: value as string[] };
          break;
      }
    }

    return conditions;
  }
}

// ============================================
// DSL Parser (Text to Query)
// ============================================

export class GraphDSLParser {
  /**
   * Parse a text query into a GraphQuery object
   *
   * Syntax:
   *   MATCH [nodeType] WHERE <conditions> [TRAVERSAL] [OPTIONS]
   *   PATH FROM "start" TO "end" [maxDepth=N]
   *   COUNT [nodeType] WHERE <conditions>
   *
   * Conditions:
   *   field = "value"
   *   field LIKE "pattern*"
   *   field CONTAINS "text"
   *
   * Traversals:
   *   CALLERS [depth=N]
   *   CALLEES [depth=N]
   */
  parse(queryText: string): GraphQuery {
    const builder = new GraphQueryBuilder();
    const tokens = this.tokenize(queryText);
    let i = 0;

    const consume = () => tokens[i++];
    const peek = () => tokens[i];
    const expect = (expected: string) => {
      const token = consume();
      if (token?.toUpperCase() !== expected.toUpperCase()) {
        throw new Error(`Expected ${expected}, got ${token}`);
      }
      return token;
    };

    const command = consume()?.toUpperCase();

    switch (command) {
      case 'MATCH':
        builder.type('match');
        break;
      case 'PATH': {
        builder.type('path');
        expect('FROM');
        const from = this.parseQuotedString(consume() || '');
        expect('TO');
        const to = this.parseQuotedString(consume() || '');
        let maxDepth = 10;
        if (peek()?.toLowerCase().startsWith('maxdepth')) {
          const [, depth] = consume()!.split('=');
          maxDepth = parseInt(depth, 10);
        }
        builder.pathBetween(from, to, maxDepth);
        break;
      }
      case 'COUNT':
        builder.type('aggregate').count();
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }

    // Parse optional node type
    if (peek() && !['WHERE', 'CALLERS', 'CALLEES', 'LIMIT'].includes(peek()!.toUpperCase())) {
      const nodeType = consume()!.toLowerCase() as NodeType;
      builder.nodeType(nodeType);
    }

    // Parse WHERE conditions
    if (peek()?.toUpperCase() === 'WHERE') {
      consume(); // consume WHERE

      while (i < tokens.length && !['CALLERS', 'CALLEES', 'LIMIT', 'PROJECT'].includes(peek()?.toUpperCase() || '')) {
        const field = consume();
        const op = consume()?.toUpperCase();
        const value = this.parseQuotedString(consume() || '');

        if (!field || !op) break;

        switch (op) {
          case '=':
          case '==':
            builder.whereEquals(field, value);
            break;
          case 'LIKE':
            if (value.endsWith('*')) {
              builder.whereStartsWith(field, value.slice(0, -1));
            } else if (value.startsWith('*')) {
              builder.where(field, 'endsWith', value.slice(1));
            } else {
              builder.whereContains(field, value);
            }
            break;
          case 'CONTAINS':
            builder.whereContains(field, value);
            break;
          case 'IN':
            builder.where(field, 'in', value.split(',').map(v => v.trim()));
            break;
        }

        if (peek()?.toUpperCase() === 'AND' || peek()?.toUpperCase() === 'OR') {
          consume();
        }
      }
    }

    // Parse traversal
    const traversalKeywords = ['CALLERS', 'CALLEES'];
    if (traversalKeywords.includes(peek()?.toUpperCase() || '')) {
      const direction = consume()!.toLowerCase() as TraversalDirection;
      let depth = 5;

      if (peek()?.toLowerCase().startsWith('depth')) {
        const [, d] = consume()!.split('=');
        depth = parseInt(d, 10);
      }

      builder.traverse(direction, depth);
    }

    // Parse PROJECT filter
    if (peek()?.toUpperCase() === 'PROJECT') {
      consume();
      const projectId = parseInt(consume() || '0', 10);
      builder.inProject(projectId);
    }

    // Parse LIMIT
    if (peek()?.toUpperCase() === 'LIMIT') {
      consume();
      const limit = parseInt(consume() || '50', 10);
      builder.limit(limit);
    }

    return builder.build();
  }

  private tokenize(text: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of text) {
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
        current += char;
      } else if (!inQuotes && /\s/.test(char)) {
        if (current) {
          tokens.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current) {
      tokens.push(current);
    }

    return tokens;
  }

  private parseQuotedString(token: string): string {
    if ((token.startsWith('"') && token.endsWith('"')) ||
        (token.startsWith("'") && token.endsWith("'"))) {
      return token.slice(1, -1);
    }
    return token;
  }
}

// ============================================
// Factory Functions
// ============================================

export function createQueryBuilder(): GraphQueryBuilder {
  return new GraphQueryBuilder();
}

export function createQueryExecutor(prisma: PrismaClient): GraphQueryExecutor {
  return new GraphQueryExecutor(prisma);
}

export function createDSLParser(): GraphDSLParser {
  return new GraphDSLParser();
}
