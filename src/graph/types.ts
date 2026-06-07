/**
 * Graph Types for Axon Code Intelligence
 *
 * These types mirror the Prisma schema and provide
 * convenient interfaces for graph operations.
 *
 * Axon-specific: No OOP concepts (class, mixin, enum, interface).
 * Only functions, defcomps, and variables.
 */

// ============================================
// Node Types
// ============================================

export type NodeType =
  | 'function'    // top-level Axon function (define_var with lambda body)
  | 'defcomp'     // defcomp component definition
  | 'variable';   // top-level variable binding

// ============================================
// Edge Types
// ============================================

export type EdgeType =
  | 'calls'       // Function A calls function B
  | 'contains';   // Defcomp contains a cell/member

// ============================================
// Node Create/Data Types
// ============================================

export interface CodeNodeCreate {
  projectId: number;
  nodeType: NodeType;
  name: string;
  qualifiedName: string;
  filePath: string;
  lineStart: number;
  lineEnd?: number;
  signature?: string;
  documentation?: string;
  returnType?: string;
  source?: string;
  parentType?: string;
  isPublic?: boolean;
}

export interface CodeNodeData extends CodeNodeCreate {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Edge Create/Data Types
// ============================================

export interface CodeEdgeCreate {
  sourceId: string;
  targetId: string;
  edgeType: EdgeType;
  lineNumber?: number;
  colNumber?: number;
  isResolved?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CodeEdgeData extends Omit<CodeEdgeCreate, 'metadata'> {
  id: string;
  metadata?: string;  // JSON string
  createdAt: Date;
}

// ============================================
// Unresolved Reference Types
// ============================================

export interface UnresolvedRefCreate {
  projectId: number;
  fromNodeId: string;
  referenceName: string;
  refType: EdgeType;
  lineNumber: number;
  colNumber?: number;
  candidates?: string[];
}

export interface UnresolvedRefData extends Omit<UnresolvedRefCreate, 'candidates'> {
  id: string;
  candidates?: string;  // JSON string
  createdAt: Date;
}

// ============================================
// Graph Build Stats
// ============================================

export interface GraphBuildStatsData {
  id: string;
  projectId: number;
  nodeCount: number;
  edgeCount: number;
  unresolvedCount: number;
  vectorCount: number;
  lastBuildAt?: Date;
  lastVectorAt?: Date;
  buildDurationMs?: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Query Result Types
// ============================================

export interface CallerResult {
  id: string;
  name: string;
  qualifiedName: string;
  depth: number;
  filePath: string;
  lineNumber?: number;
  edgeType: EdgeType;
}

export interface CalleeResult {
  id: string;
  name: string;
  qualifiedName: string;
  depth: number;
  filePath: string;
  lineNumber?: number;
}

export interface ImpactResult {
  focalNode: {
    id: string;
    name: string;
    qualifiedName: string;
  };
  affectedNodes: Array<{
    id: string;
    name: string;
    qualifiedName: string;
    edgeTypes: EdgeType[];
    minDepth: number;
    filePath: string;
  }>;
  totalAffected: number;
  maxDepthReached: number;
  breakdown: Record<EdgeType, number>;
}

export interface PathResult {
  found: boolean;
  path: Array<{
    id: string;
    name: string;
    qualifiedName: string;
  }>;
  edges: EdgeType[];
  depth: number;
}

export interface CycleResult {
  path: string[];
  nodeNames: string[];
  length: number;
}

export interface GraphMetrics {
  nodeId: string;
  incomingEdgeCount: number;
  outgoingEdgeCount: number;
  callerCount: number;
  calleeCount: number;
  containsCount: number;
  depth: number;
}

// ============================================
// Build Result Types
// ============================================

export interface GraphBuildResult {
  projectId: number;
  success: boolean;
  nodeCount: number;
  edgeCount: number;
  unresolvedCount: number;
  durationMs: number;
  errors: string[];
}

export interface VectorBuildResult {
  projectId: number;
  success: boolean;
  vectorCount: number;
  skipped: number;
  durationMs: number;
  errors: string[];
}
