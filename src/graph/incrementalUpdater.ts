/**
 * Incremental graph + embedding update for a set of changed files.
 *
 * For each changed path (relative to the project base path):
 *   1. Remove the old CodeNodes of that file, their edges, their unresolved
 *      refs and their LanceDB vectors.
 *   2. Calls from OTHER files into the removed nodes become UnresolvedRefs, so
 *      they can bind again to the new nodes (step 4).
 *   3. If the file still exists: parse it with tree-sitter-axon and add its
 *      nodes, its "contains" edges and its outgoing "calls" edges (resolved
 *      against the whole project in SQLite).
 *   4. Re-resolve project UnresolvedRefs whose name matches a new node.
 *   5. Embed only the new nodes.
 *
 * Nodes, edges and vectors of unchanged files are not touched.
 *
 * Known drift against a full build: a full build resolves a bare call name by
 * a unique simple-name match over the whole project. If a new node makes such
 * a name ambiguous, edges already stored in unchanged files are kept. Run a
 * full build (POST /admin/graph/projects/:id/build-graph) now and then to clear it.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { PrismaClient } from '../generated/prisma/index.js';
import { getTreeSitterParser, type ParsedFile } from '../parser/treeSitter/index.js';
import { generateNodeId } from './graphBuilder.js';

// ============================================
// Pluggable embedding / vector sinks
// ============================================

export interface Embedder {
  embed(texts: string[]): Promise<Float32Array[]>;
}

export interface VectorSink {
  deleteNodes(nodeIds: string[]): Promise<void>;
  upsert(items: Array<{ nodeId: string; embedding: Float32Array }>): Promise<number>;
}

export interface UpdateOptions {
  embedder?: Embedder | null; // null = skip embeddings
  vectors?: VectorSink | null;
}

export interface IncrementalResult {
  projectId: number;
  mode: 'incremental' | 'full';
  changedFiles: number;
  deletedFiles: number;
  ignoredPaths: string[];
  nodesRemoved: number;
  nodesAdded: number;
  edgesAdded: number;
  refsResolved: number;
  unresolvedAdded: number;
  embedded: number;
  durationMs: number;
  errors: string[];
}

const CHUNK = 500;

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function escSql(value: string): string {
  return value.replace(/'/g, "''");
}

export function defaultEmbedder(): Embedder {
  return {
    async embed(texts) {
      const { getEmbeddingService } = await import('../embedding/embeddingService.js');
      const svc = getEmbeddingService();
      await svc.initialize();
      return svc.embedBatch(texts);
    },
  };
}

export function defaultVectorSink(prisma: PrismaClient): VectorSink {
  return {
    async deleteNodes(nodeIds) {
      if (nodeIds.length === 0) return;
      const { getLanceTable } = await import('../embedding/lanceConnection.js');
      const table = await getLanceTable();
      for (const part of chunks(nodeIds)) {
        await table.delete(`node_id IN (${part.map(id => `'${escSql(id)}'`).join(', ')})`);
      }
    },
    async upsert(items) {
      if (items.length === 0) return 0;
      const { getEmbeddingService } = await import('../embedding/embeddingService.js');
      const { VectorStore } = await import('../embedding/vectorStore.js');
      return new VectorStore(prisma, getEmbeddingService()).storeEmbeddings(items);
    },
  };
}

export function embeddingText(n: { name: string; signature?: string | null; documentation?: string | null }): string {
  const parts = [n.name];
  if (n.signature) parts.push(n.signature);
  if (n.documentation) parts.push(n.documentation);
  return parts.join(' ');
}

// ============================================
// Path checks
// ============================================

/** Returns the absolute path, or null when the path is not safe. */
export function safeJoin(base: string, rel: string): string | null {
  if (typeof rel !== 'string' || rel.length === 0 || rel.includes('\0')) return null;
  if (path.isAbsolute(rel) || /^[A-Za-z]:/.test(rel)) return null;
  const parts = rel.split(/[\\/]+/);
  if (parts.some(p => p === '..')) return null;
  const root = path.resolve(base);
  const abs = path.resolve(root, ...parts);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

function walkAxon(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkAxon(full, out);
    else if (entry.isFile() && entry.name.endsWith('.axon')) out.push(full);
  }
}

// ============================================
// Updater
// ============================================

interface PendingEdge {
  sourceId: string;
  targetId: string;
  edgeType: string;
  lineNumber?: number | null;
  colNumber?: number | null;
  metadata?: string | null;
}

export async function updateProjectFiles(
  prisma: PrismaClient,
  project: { id: number; path: string },
  relPaths: string[],
  opts: UpdateOptions & { basePath?: string } = {}
): Promise<IncrementalResult> {
  const start = Date.now();
  const projectId = project.id;
  const projectRoot = path.resolve(project.path);
  const base = path.resolve(opts.basePath ?? project.path);
  const embedder = opts.embedder === undefined ? defaultEmbedder() : opts.embedder;
  const vectors = opts.vectors === undefined ? defaultVectorSink(prisma) : opts.vectors;

  const result: IncrementalResult = {
    projectId, mode: 'incremental', changedFiles: 0, deletedFiles: 0, ignoredPaths: [],
    nodesRemoved: 0, nodesAdded: 0, edgesAdded: 0, refsResolved: 0, unresolvedAdded: 0,
    embedded: 0, durationMs: 0, errors: [],
  };

  // ---- 1. Work out which files / folders are touched ----
  const removeExact = new Set<string>();
  const removePrefixes = new Set<string>();
  const addFiles = new Set<string>();

  for (const rel of relPaths) {
    const abs = safeJoin(base, rel);
    if (!abs || (abs !== projectRoot && !abs.startsWith(projectRoot + path.sep))) {
      result.ignoredPaths.push(rel);
      continue;
    }
    let stat: fs.Stats | null = null;
    try { stat = fs.statSync(abs); } catch { stat = null; }

    if (stat?.isDirectory()) {
      removePrefixes.add(abs + path.sep);
      const found: string[] = [];
      walkAxon(abs, found);
      found.forEach(f => addFiles.add(f));
    } else if (stat?.isFile()) {
      if (abs.endsWith('.axon')) { removeExact.add(abs); addFiles.add(abs); result.changedFiles++; }
      else result.ignoredPaths.push(rel);
    } else {
      // Gone: a deleted file, or a deleted folder.
      removeExact.add(abs);
      removePrefixes.add(abs + path.sep);
      result.deletedFiles++;
    }
  }
  addFiles.forEach(f => removeExact.add(f));

  // ---- 2. Old nodes of those files ----
  const or: any[] = [];
  for (const part of chunks([...removeExact])) or.push({ filePath: { in: part } });
  for (const prefix of removePrefixes) or.push({ filePath: { startsWith: prefix } });

  const oldNodes = or.length === 0 ? [] : await prisma.codeNode.findMany({
    where: { projectId, OR: or },
    select: { id: true, qualifiedName: true },
  });
  const oldIds = oldNodes.map(n => n.id);
  const oldIdSet = new Set(oldIds);
  const oldQn = new Map(oldNodes.map(n => [n.id, n.qualifiedName]));

  // ---- 3. Incoming calls from other files -> unresolved refs ----
  const carried: Array<{ fromNodeId: string; referenceName: string; refType: string; lineNumber: number; colNumber: number | null }> = [];
  for (const part of chunks(oldIds)) {
    const incoming = await prisma.codeEdge.findMany({
      where: { targetId: { in: part } },
    });
    for (const e of incoming) {
      if (oldIdSet.has(e.sourceId)) continue;
      let ref = oldQn.get(e.targetId) || '';
      if (e.metadata) {
        try {
          const m = JSON.parse(e.metadata);
          if (m.calledName) ref = m.target ? `${m.target}.${m.calledName}` : m.calledName;
        } catch { /* keep qualified name */ }
      }
      carried.push({ fromNodeId: e.sourceId, referenceName: ref, refType: e.edgeType, lineNumber: e.lineNumber ?? 0, colNumber: e.colNumber ?? null });
    }
  }

  // ---- 4. Delete old rows ----
  for (const part of chunks(oldIds)) {
    await prisma.codeEdge.deleteMany({ where: { OR: [{ sourceId: { in: part } }, { targetId: { in: part } }] } });
    await prisma.unresolvedRef.deleteMany({ where: { fromNodeId: { in: part } } });
    await prisma.codeNode.deleteMany({ where: { id: { in: part } } });
  }
  result.nodesRemoved = oldIds.length;
  if (carried.length > 0) {
    for (const part of chunks(carried)) {
      await prisma.unresolvedRef.createMany({ data: part.map(c => ({ ...c, projectId })) });
    }
  }
  if (vectors && oldIds.length > 0) {
    try { await vectors.deleteNodes(oldIds); }
    catch (err) { result.errors.push(`vector delete: ${err instanceof Error ? err.message : String(err)}`); }
  }

  // ---- 5. Parse and add new nodes ----
  const parsed: ParsedFile[] = [];
  if (addFiles.size > 0) {
    const parser = await getTreeSitterParser();
    for (const file of addFiles) {
      try {
        const source = fs.readFileSync(file, 'utf-8');
        const pf = await parser.parseFile(file, source, { extractCalls: true, extractDocs: true, extractBodies: true });
        if (pf.success) parsed.push(pf);
        else result.errors.push(`Parse error in ${file}: ${pf.errors.map(e => e.message).join('; ')}`);
      } catch (err) {
        result.errors.push(`Parse error in ${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const newNodes: Array<{ id: string; name: string; qualifiedName: string; signature?: string | null; documentation?: string | null }> = [];
  const edges: PendingEdge[] = [];
  const calls: Array<{ sourceId: string; targetName: string; lineNumber: number; colNumber: number; metadata: string }> = [];

  const upsertNode = async (data: any): Promise<string> => {
    const { id, ...rest } = data;
    const node = await prisma.codeNode.upsert({
      where: { projectId_qualifiedName: { projectId, qualifiedName: data.qualifiedName } },
      create: { id, ...rest, language: 'axon' },
      update: { ...rest, language: 'axon' },
    });
    newNodes.push({ id: node.id, name: node.name, qualifiedName: node.qualifiedName, signature: node.signature, documentation: node.documentation });
    return node.id;
  };

  for (const pf of parsed) {
    const filePath = pf.filePath;
    for (const func of pf.functions) {
      const qn = func.qualifiedName || func.name;
      const id = await upsertNode({
        id: generateNodeId(filePath, qn, func.location.startLine),
        projectId, nodeType: 'function', name: func.name, qualifiedName: qn, filePath,
        lineStart: func.location.startLine, lineEnd: func.location.endLine,
        signature: func.signature, documentation: func.documentation, returnType: func.returnType,
        source: func.source, isPublic: true,
      });
      for (const call of func.calls || []) {
        calls.push({
          sourceId: id,
          targetName: call.target ? `${call.target}.${call.name}` : call.name,
          lineNumber: call.location.startLine,
          colNumber: call.location.startColumn,
          metadata: JSON.stringify({ calledName: call.name, target: call.target, expression: call.expression }),
        });
      }
    }
    for (const dc of pf.defcomps) {
      const qn = dc.qualifiedName || dc.name;
      const dcId = await upsertNode({
        id: generateNodeId(filePath, qn, dc.location.startLine),
        projectId, nodeType: 'defcomp', name: dc.name, qualifiedName: qn, filePath,
        lineStart: dc.location.startLine, lineEnd: dc.location.endLine,
        documentation: dc.documentation, source: dc.source, isPublic: true,
      });
      for (const cell of dc.cells) {
        const cellQn = `${qn}.${cell.name}`;
        const cellId = await upsertNode({
          id: generateNodeId(filePath, cellQn, cell.location.startLine),
          projectId, nodeType: 'variable', name: cell.name, qualifiedName: cellQn, filePath,
          lineStart: cell.location.startLine, lineEnd: cell.location.endLine,
          returnType: cell.type, parentType: dc.name,
        });
        edges.push({ sourceId: dcId, targetId: cellId, edgeType: 'contains' });
      }
    }
  }
  result.nodesAdded = newNodes.length;

  // ---- 6. Resolve outgoing calls against the whole project ----
  const cache = new Map<string, string | null>();
  const resolve = async (name: string): Promise<string | null> => {
    if (cache.has(name)) return cache.get(name)!;
    let id: string | null = null;
    const exact = await prisma.codeNode.findUnique({
      where: { projectId_qualifiedName: { projectId, qualifiedName: name } }, select: { id: true },
    });
    if (exact) id = exact.id;
    else if (!name.includes('.')) {
      const matches = await prisma.codeNode.findMany({
        where: { projectId, qualifiedName: { endsWith: `.${name}` } }, select: { id: true }, take: 2,
      });
      if (matches.length === 1) id = matches[0].id;
    }
    cache.set(name, id);
    return id;
  };
  const candidates = async (name: string): Promise<string | null> => {
    const simple = name.split('.').pop() || name;
    const rows = await prisma.codeNode.findMany({
      where: { projectId, OR: [{ qualifiedName: simple }, { qualifiedName: { endsWith: `.${simple}` } }] },
      select: { qualifiedName: true }, take: 5,
    });
    return JSON.stringify(rows.map(r => r.qualifiedName));
  };

  const unresolved: any[] = [];
  for (const c of calls) {
    const targetId = await resolve(c.targetName);
    if (targetId) {
      edges.push({ sourceId: c.sourceId, targetId, edgeType: 'calls', lineNumber: c.lineNumber, colNumber: c.colNumber, metadata: c.metadata });
    } else {
      unresolved.push({
        projectId, fromNodeId: c.sourceId, referenceName: c.targetName, refType: 'calls',
        lineNumber: c.lineNumber, colNumber: c.colNumber, candidates: await candidates(c.targetName),
      });
    }
  }

  // ---- 7. Re-resolve project refs that may now bind to a new node ----
  if (newNodes.length > 0) {
    const names = new Set<string>();
    for (const n of newNodes) {
      names.add(n.qualifiedName);
      names.add(n.qualifiedName.split('.').pop() || n.qualifiedName);
    }
    for (const part of chunks([...names])) {
      const refs = await prisma.unresolvedRef.findMany({ where: { projectId, referenceName: { in: part } } });
      for (const ref of refs) {
        const targetId = await resolve(ref.referenceName);
        if (!targetId) continue;
        edges.push({ sourceId: ref.fromNodeId, targetId, edgeType: ref.refType, lineNumber: ref.lineNumber, colNumber: ref.colNumber });
        await prisma.unresolvedRef.delete({ where: { id: ref.id } });
        result.refsResolved++;
      }
    }
  }

  // ---- 8. Write edges and new unresolved refs ----
  const seen = new Set<string>();
  const unique = edges.filter(e => {
    const key = `${e.sourceId}|${e.targetId}|${e.edgeType}|${e.lineNumber ?? 0}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  for (const part of chunks(unique, 100)) {
    const data = part.map(e => ({
      sourceId: e.sourceId, targetId: e.targetId, edgeType: e.edgeType,
      lineNumber: e.lineNumber ?? null, colNumber: e.colNumber ?? null, isResolved: true, metadata: e.metadata ?? null,
    }));
    try {
      await prisma.codeEdge.createMany({ data });
      result.edgesAdded += data.length;
    } catch {
      for (const row of data) {
        try { await prisma.codeEdge.create({ data: row }); result.edgesAdded++; } catch { /* duplicate */ }
      }
    }
  }
  for (const part of chunks(unresolved)) {
    await prisma.unresolvedRef.createMany({ data: part });
  }
  result.unresolvedAdded = unresolved.length;

  // ---- 9. Embeddings for new nodes only ----
  if (embedder && vectors && newNodes.length > 0) {
    try {
      const embs = await embedder.embed(newNodes.map(embeddingText));
      result.embedded = await vectors.upsert(newNodes.map((n, i) => ({ nodeId: n.id, embedding: embs[i] })));
    } catch (err) {
      result.errors.push(`embeddings: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ---- 10. Stats ----
  await refreshStats(prisma, projectId, Date.now() - start);

  result.durationMs = Date.now() - start;
  return result;
}

export async function refreshStats(prisma: PrismaClient, projectId: number, durationMs: number): Promise<void> {
  const [nodeCount, edgeCount, unresolvedCount] = await Promise.all([
    prisma.codeNode.count({ where: { projectId } }),
    prisma.codeEdge.count({ where: { source: { projectId } } }),
    prisma.unresolvedRef.count({ where: { projectId } }),
  ]);
  await prisma.graphBuildStats.upsert({
    where: { projectId },
    create: { projectId, nodeCount, edgeCount, unresolvedCount, lastBuildAt: new Date(), buildDurationMs: durationMs },
    update: { nodeCount, edgeCount, unresolvedCount, lastBuildAt: new Date(), buildDurationMs: durationMs },
  });
}

/**
 * Full build for a project that has no graph yet: graph from the directory,
 * then embeddings for every node.
 */
export async function fullProjectBuild(
  prisma: PrismaClient,
  project: { id: number; path: string },
  opts: UpdateOptions = {}
): Promise<IncrementalResult> {
  const start = Date.now();
  const embedder = opts.embedder === undefined ? defaultEmbedder() : opts.embedder;
  const vectors = opts.vectors === undefined ? defaultVectorSink(prisma) : opts.vectors;
  const { GraphBuilder } = await import('./graphBuilder.js');
  const r = await new GraphBuilder(prisma, project.id).buildFromDirectory(project.path);

  let embedded = 0;
  const errors = [...r.errors];
  if (embedder && vectors) {
    const nodes = await prisma.codeNode.findMany({
      where: { projectId: project.id },
      select: { id: true, name: true, signature: true, documentation: true },
    });
    try {
      for (const part of chunks(nodes)) {
        const embs = await embedder.embed(part.map(embeddingText));
        embedded += await vectors.upsert(part.map((n, i) => ({ nodeId: n.id, embedding: embs[i] })));
      }
    } catch (err) {
      errors.push(`embeddings: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return {
    projectId: project.id, mode: 'full', changedFiles: 0, deletedFiles: 0, ignoredPaths: [],
    nodesRemoved: 0, nodesAdded: r.nodeCount, edgesAdded: r.edgeCount, refsResolved: 0,
    unresolvedAdded: r.unresolvedCount, embedded, durationMs: Date.now() - start, errors,
  };
}
