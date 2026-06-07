/**
 * Graph Builder - Populates CodeNode and CodeEdge tables from parsed Axon code
 *
 * This module converts tree-sitter parsed Axon code into a graph representation
 * stored in SQLite via Prisma. It creates:
 * - CodeNode records for functions, defcomps, and variables
 * - CodeEdge records for calls and contains relationships
 * - UnresolvedRef records for call references that couldn't be resolved
 */

import type { PrismaClient } from '../generated/prisma/index.js';
import {
  getTreeSitterParser,
  type ParsedFile,
  type ExtractedFunction,
  type ExtractedDefcomp,
  type ExtractedCall
} from '../parser/treeSitter/index.js';
import type {
  NodeType,
  CodeNodeCreate,
  CodeEdgeCreate,
  UnresolvedRefCreate,
  GraphBuildResult
} from './types.js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ============================================
// ID Generation
// ============================================

function generateNodeId(filePath: string, qualifiedName: string, line: number): string {
  const hash = crypto.createHash('sha256');
  hash.update(`${filePath}:${qualifiedName}:${line}`);
  return hash.digest('hex').substring(0, 32);
}

// ============================================
// Graph Builder Class
// ============================================

export class GraphBuilder {
  private prisma: PrismaClient;
  private projectId: number;

  private nodeByQualifiedName: Map<string, string> = new Map();
  private unresolvedRefs: UnresolvedRefCreate[] = [];
  private pendingEdges: CodeEdgeCreate[] = [];

  private stats = {
    nodesCreated: 0,
    edgesCreated: 0,
    unresolvedCount: 0,
    errors: [] as string[]
  };

  constructor(prisma: PrismaClient, projectId: number) {
    this.prisma = prisma;
    this.projectId = projectId;
  }

  /**
   * Build graph from a single parsed file
   */
  async buildFromFile(parsedFile: ParsedFile): Promise<void> {
    // Create function nodes
    for (const func of parsedFile.functions) {
      await this.createFunctionNode(func, parsedFile.filePath);
    }

    // Create defcomp nodes and their containment edges
    for (const defcomp of parsedFile.defcomps) {
      await this.createDefcompNode(defcomp, parsedFile.filePath);
    }
  }

  /**
   * Build graph from multiple parsed files
   */
  async buildFromFiles(parsedFiles: ParsedFile[]): Promise<GraphBuildResult> {
    const startTime = Date.now();

    console.error(`[graph-builder] Building graph for project ${this.projectId} from ${parsedFiles.length} files`);

    try {
      // Clear existing data for this project
      await this.clearProjectGraph();

      // Build nodes from all files
      for (const file of parsedFiles) {
        if (file.success) {
          await this.buildFromFile(file);
        }
      }

      // Create edges (after all nodes exist)
      await this.createPendingEdges();

      // Store unresolved references
      await this.storeUnresolvedRefs();

      // Update build stats
      await this.updateBuildStats(Date.now() - startTime);

      return {
        projectId: this.projectId,
        success: this.stats.errors.length === 0,
        nodeCount: this.stats.nodesCreated,
        edgeCount: this.stats.edgesCreated,
        unresolvedCount: this.stats.unresolvedCount,
        durationMs: Date.now() - startTime,
        errors: this.stats.errors
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.stats.errors.push(errorMsg);
      console.error(`[graph-builder] Graph build failed: ${errorMsg}`);

      try {
        await this.updateBuildStats(Date.now() - startTime);
      } catch (statsError) {
        console.error(`[graph-builder] Failed to update build stats: ${statsError}`);
      }

      return {
        projectId: this.projectId,
        success: false,
        nodeCount: this.stats.nodesCreated,
        edgeCount: this.stats.edgesCreated,
        unresolvedCount: this.stats.unresolvedCount,
        durationMs: Date.now() - startTime,
        errors: this.stats.errors
      };
    }
  }

  /**
   * Build graph by scanning a directory for .axon files
   */
  async buildFromDirectory(dirPath: string): Promise<GraphBuildResult> {
    const axonFiles = this.findAxonFiles(dirPath);

    console.error(`[graph-builder] Found ${axonFiles.length} .axon files in ${dirPath}`);

    const parser = await getTreeSitterParser();

    const parsedFiles: ParsedFile[] = [];
    for (const filePath of axonFiles) {
      try {
        const source = fs.readFileSync(filePath, 'utf-8');
        const result = await parser.parseFile(filePath, source, {
          extractCalls: true,
          extractDocs: true,
          extractBodies: true
        });
        parsedFiles.push(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[graph-builder] Error parsing ${filePath}: ${msg}`);
        this.stats.errors.push(`Parse error in ${filePath}: ${msg}`);
      }
    }

    return this.buildFromFiles(parsedFiles);
  }

  /**
   * Clear existing graph data for this project
   */
  private async clearProjectGraph(): Promise<void> {
    console.error(`[graph-builder] Clearing existing graph for project ${this.projectId}`);

    // Delete in correct order to avoid FK violations
    await this.prisma.codeEdge.deleteMany({
      where: {
        source: { projectId: this.projectId }
      }
    });

    await this.prisma.unresolvedRef.deleteMany({
      where: { projectId: this.projectId }
    });

    await this.prisma.codeNode.deleteMany({
      where: { projectId: this.projectId }
    });
  }

  /**
   * Create a CodeNode for an Axon function
   */
  private async createFunctionNode(
    func: ExtractedFunction,
    filePath: string
  ): Promise<string> {
    const qualifiedName = func.qualifiedName || func.name;
    const deterministicId = generateNodeId(filePath, qualifiedName, func.location.startLine);

    const nodeData: CodeNodeCreate = {
      projectId: this.projectId,
      nodeType: 'function' as NodeType,
      name: func.name,
      qualifiedName,
      filePath,
      lineStart: func.location.startLine,
      lineEnd: func.location.endLine,
      signature: func.signature,
      documentation: func.documentation,
      returnType: func.returnType,
      source: func.source,
      isPublic: true
    };

    const node = await this.prisma.codeNode.upsert({
      where: {
        projectId_qualifiedName: {
          projectId: this.projectId,
          qualifiedName: nodeData.qualifiedName
        }
      },
      create: {
        id: deterministicId,
        ...nodeData,
        language: 'axon'
      },
      update: {
        ...nodeData,
        language: 'axon'
      }
    });

    this.nodeByQualifiedName.set(qualifiedName, node.id);
    this.stats.nodesCreated++;

    // Create "calls" edges from function calls
    if (func.calls && func.calls.length > 0) {
      for (const call of func.calls) {
        this.createCallEdge(node.id, call);
      }
    }

    return node.id;
  }

  /**
   * Create a CodeNode for a defcomp
   */
  private async createDefcompNode(
    defcomp: ExtractedDefcomp,
    filePath: string
  ): Promise<string> {
    const qualifiedName = defcomp.qualifiedName || defcomp.name;
    const deterministicId = generateNodeId(filePath, qualifiedName, defcomp.location.startLine);

    const nodeData: CodeNodeCreate = {
      projectId: this.projectId,
      nodeType: 'defcomp' as NodeType,
      name: defcomp.name,
      qualifiedName,
      filePath,
      lineStart: defcomp.location.startLine,
      lineEnd: defcomp.location.endLine,
      documentation: defcomp.documentation,
      source: defcomp.source,
      isPublic: true
    };

    const node = await this.prisma.codeNode.upsert({
      where: {
        projectId_qualifiedName: {
          projectId: this.projectId,
          qualifiedName: nodeData.qualifiedName
        }
      },
      create: {
        id: deterministicId,
        ...nodeData,
        language: 'axon'
      },
      update: {
        ...nodeData,
        language: 'axon'
      }
    });

    this.nodeByQualifiedName.set(qualifiedName, node.id);
    this.stats.nodesCreated++;

    // Create "contains" edges for defcomp cells
    for (const cell of defcomp.cells) {
      const cellQualifiedName = `${qualifiedName}.${cell.name}`;
      const cellId = generateNodeId(filePath, cellQualifiedName, cell.location.startLine);

      const cellNode = await this.prisma.codeNode.upsert({
        where: {
          projectId_qualifiedName: {
            projectId: this.projectId,
            qualifiedName: cellQualifiedName
          }
        },
        create: {
          id: cellId,
          projectId: this.projectId,
          nodeType: 'variable',
          name: cell.name,
          qualifiedName: cellQualifiedName,
          filePath,
          lineStart: cell.location.startLine,
          lineEnd: cell.location.endLine,
          returnType: cell.type,
          parentType: defcomp.name,
          language: 'axon'
        },
        update: {
          nodeType: 'variable',
          name: cell.name,
          filePath,
          lineStart: cell.location.startLine,
          lineEnd: cell.location.endLine,
          returnType: cell.type,
          parentType: defcomp.name,
          language: 'axon'
        }
      });

      this.nodeByQualifiedName.set(cellQualifiedName, cellNode.id);
      this.stats.nodesCreated++;

      // Add "contains" edge from defcomp to cell
      this.pendingEdges.push({
        sourceId: node.id,
        targetId: cellNode.id,
        edgeType: 'contains',
        isResolved: true
      });
    }

    return node.id;
  }

  /**
   * Create a call edge from an extracted function call
   */
  private createCallEdge(sourceId: string, call: ExtractedCall): void {
    const targetName = call.target
      ? `${call.target}.${call.name}`
      : call.name;

    this.queueEdge({
      sourceId,
      targetId: '',
      edgeType: 'calls',
      lineNumber: call.location.startLine,
      colNumber: call.location.startColumn,
      isResolved: false,
      metadata: {
        calledName: call.name,
        target: call.target,
        expression: call.expression
      }
    }, targetName);
  }

  /**
   * Queue an edge for later creation (with reference resolution)
   */
  private queueEdge(edge: CodeEdgeCreate, targetName: string): void {
    const targetId = this.resolveReference(targetName);

    if (targetId) {
      edge.targetId = targetId;
      edge.isResolved = true;
      this.pendingEdges.push(edge);
    } else {
      this.unresolvedRefs.push({
        projectId: this.projectId,
        fromNodeId: edge.sourceId,
        referenceName: targetName,
        refType: edge.edgeType,
        lineNumber: edge.lineNumber || 0,
        colNumber: edge.colNumber,
        candidates: this.findCandidates(targetName)
      });
      this.stats.unresolvedCount++;
    }
  }

  /**
   * Try to resolve a reference to a known node
   */
  private resolveReference(name: string): string | undefined {
    // Exact match
    if (this.nodeByQualifiedName.has(name)) {
      return this.nodeByQualifiedName.get(name);
    }

    // Try matching by simple name if unique
    if (!name.includes('.')) {
      const matches: string[] = [];
      this.nodeByQualifiedName.forEach((id, qn) => {
        const simpleName = qn.includes('.') ? qn.split('.').pop() : qn;
        if (simpleName === name) {
          matches.push(id);
        }
      });
      if (matches.length === 1) {
        return matches[0];
      }
    }

    return undefined;
  }

  /**
   * Find possible candidates for an unresolved reference
   */
  private findCandidates(name: string): string[] {
    const candidates: string[] = [];
    const simpleName = name.split('.').pop() || name;

    this.nodeByQualifiedName.forEach((_id, qualifiedName) => {
      if (qualifiedName.endsWith(`.${simpleName}`) || qualifiedName === simpleName) {
        candidates.push(qualifiedName);
      }
    });

    return candidates.slice(0, 5);
  }

  /**
   * Create all pending edges in batch
   */
  private async createPendingEdges(): Promise<void> {
    if (this.pendingEdges.length === 0) return;

    console.error(`[graph-builder] Creating ${this.pendingEdges.length} edges`);

    const validEdges = this.pendingEdges.filter(e => e.targetId && e.targetId !== '');

    const batchSize = 100;
    for (let i = 0; i < validEdges.length; i += batchSize) {
      const batch = validEdges.slice(i, i + batchSize);

      // Deduplicate edges within the batch
      const seen = new Set<string>();
      const dedupedBatch = batch.filter(edge => {
        const key = `${edge.sourceId}|${edge.targetId}|${edge.edgeType}|${edge.lineNumber ?? 0}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      try {
        await this.prisma.codeEdge.createMany({
          data: dedupedBatch.map(edge => ({
            sourceId: edge.sourceId,
            targetId: edge.targetId,
            edgeType: edge.edgeType,
            lineNumber: edge.lineNumber,
            colNumber: edge.colNumber,
            isResolved: edge.isResolved ?? true,
            metadata: edge.metadata ? JSON.stringify(edge.metadata) : null
          }))
        });
      } catch (err) {
        if (err instanceof Error && err.message.includes('Unique constraint')) {
          for (const edge of dedupedBatch) {
            try {
              await this.prisma.codeEdge.create({
                data: {
                  sourceId: edge.sourceId,
                  targetId: edge.targetId,
                  edgeType: edge.edgeType,
                  lineNumber: edge.lineNumber,
                  colNumber: edge.colNumber,
                  isResolved: edge.isResolved ?? true,
                  metadata: edge.metadata ? JSON.stringify(edge.metadata) : null
                }
              });
            } catch {
              // Skip duplicate edges
            }
          }
        } else {
          throw err;
        }
      }

      this.stats.edgesCreated += dedupedBatch.length;
    }
  }

  /**
   * Store unresolved references
   */
  private async storeUnresolvedRefs(): Promise<void> {
    if (this.unresolvedRefs.length === 0) return;

    console.error(`[graph-builder] Storing ${this.unresolvedRefs.length} unresolved references`);

    const batchSize = 100;
    for (let i = 0; i < this.unresolvedRefs.length; i += batchSize) {
      const batch = this.unresolvedRefs.slice(i, i + batchSize);

      await this.prisma.unresolvedRef.createMany({
        data: batch.map(ref => ({
          projectId: ref.projectId,
          fromNodeId: ref.fromNodeId,
          referenceName: ref.referenceName,
          refType: ref.refType,
          lineNumber: ref.lineNumber,
          colNumber: ref.colNumber,
          candidates: ref.candidates ? JSON.stringify(ref.candidates) : null
        }))
      });
    }
  }

  /**
   * Update graph build statistics
   */
  private async updateBuildStats(durationMs: number): Promise<void> {
    await this.prisma.graphBuildStats.upsert({
      where: { projectId: this.projectId },
      create: {
        projectId: this.projectId,
        nodeCount: this.stats.nodesCreated,
        edgeCount: this.stats.edgesCreated,
        unresolvedCount: this.stats.unresolvedCount,
        lastBuildAt: new Date(),
        buildDurationMs: durationMs
      },
      update: {
        nodeCount: this.stats.nodesCreated,
        edgeCount: this.stats.edgesCreated,
        unresolvedCount: this.stats.unresolvedCount,
        lastBuildAt: new Date(),
        buildDurationMs: durationMs
      }
    });
  }

  /**
   * Resolve previously unresolved references after loading more nodes
   */
  async resolveReferences(): Promise<number> {
    const unresolvedRefs = await this.prisma.unresolvedRef.findMany({
      where: { projectId: this.projectId }
    });

    let resolvedCount = 0;

    for (const ref of unresolvedRefs) {
      const targetNode = await this.prisma.codeNode.findFirst({
        where: {
          OR: [
            { qualifiedName: ref.referenceName },
            { name: ref.referenceName.split('.').pop() || ref.referenceName }
          ]
        }
      });

      if (targetNode) {
        try {
          await this.prisma.codeEdge.create({
            data: {
              sourceId: ref.fromNodeId,
              targetId: targetNode.id,
              edgeType: ref.refType,
              lineNumber: ref.lineNumber,
              colNumber: ref.colNumber,
              isResolved: true
            }
          });
        } catch (edgeErr) {
          if (!(edgeErr instanceof Error && edgeErr.message.includes('Unique constraint'))) {
            throw edgeErr;
          }
        }

        await this.prisma.unresolvedRef.delete({
          where: { id: ref.id }
        });

        resolvedCount++;
      }
    }

    console.error(`[graph-builder] Resolved ${resolvedCount} previously unresolved references`);
    return resolvedCount;
  }

  /**
   * Find all .axon files in a directory recursively
   */
  private findAxonFiles(dirPath: string): string[] {
    const files: string[] = [];

    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // Skip hidden dirs and node_modules
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            walk(fullPath);
          }
        } else if (entry.name.endsWith('.axon')) {
          files.push(fullPath);
        }
      }
    };

    walk(dirPath);
    return files;
  }
}

/**
 * Build graph for a project from parsed files
 */
export async function buildProjectGraph(
  prisma: PrismaClient,
  projectId: number,
  parsedFiles: ParsedFile[]
): Promise<GraphBuildResult> {
  const builder = new GraphBuilder(prisma, projectId);
  return builder.buildFromFiles(parsedFiles);
}

/**
 * Build graph for a project by scanning a directory
 */
export async function buildProjectGraphFromDirectory(
  prisma: PrismaClient,
  projectId: number,
  dirPath: string
): Promise<GraphBuildResult> {
  const builder = new GraphBuilder(prisma, projectId);
  return builder.buildFromDirectory(dirPath);
}
