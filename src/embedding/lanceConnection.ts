/**
 * LanceDB Connection Singleton
 *
 * Manages a single LanceDB connection to .cache/axonvector.db
 * with three tables:
 *   - code_vectors: code embeddings (384d, small/fast model)
 *   - docs_vectors: documentation embeddings (768d, larger model)
 *   - workflow_vectors: workflow markdown embeddings (768d, same model as docs)
 */

import * as path from 'path';
import * as fs from 'fs';
import { connect, type Connection, type Table } from '@lancedb/lancedb';
import { DEFAULT_DIMENSIONS } from './embeddingService.js';

export const CODE_TABLE_NAME = 'code_vectors';
export const DOCS_TABLE_NAME = 'docs_vectors';
export const WORKFLOW_TABLE_NAME = 'workflow_vectors';
const DEFAULT_DOCS_DIMENSIONS = 768;
const DEFAULT_WORKFLOW_DIMENSIONS = 768;

let connection: Connection | null = null;
let codeTable: Table | null = null;
let docsTable: Table | null = null;
let workflowTable: Table | null = null;

function getLanceDbPath(): string {
  const cacheDir = path.join(process.cwd(), '.cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return path.join(cacheDir, 'axonvector.db');
}

export async function getLanceConnection(): Promise<Connection> {
  if (!connection) {
    const dbPath = getLanceDbPath();
    console.error(`[lance] Connecting to LanceDB at ${dbPath}`);
    connection = await connect(dbPath);
  }
  return connection;
}

export async function getLanceTable(): Promise<Table> {
  if (codeTable && codeTable.isOpen()) return codeTable;

  const conn = await getLanceConnection();
  const tableNames = await conn.tableNames();

  if (tableNames.includes(CODE_TABLE_NAME)) {
    codeTable = await conn.openTable(CODE_TABLE_NAME);
  } else {
    console.error('[lance] Creating code_vectors table');
    const dims = parseInt(process.env.EMBEDDING_DIMENSIONS || '') || DEFAULT_DIMENSIONS;
    codeTable = await conn.createTable(CODE_TABLE_NAME, [{
      node_id: '__init__',
      vector: new Array(dims).fill(0),
      project_id: 0,
      node_type: '__init__',
      model: '__init__',
      dimensions: dims,
      created_at: new Date().toISOString(),
    }]);
    await codeTable.delete("node_id = '__init__'");
  }

  return codeTable;
}

export async function getDocsLanceTable(): Promise<Table> {
  if (docsTable && docsTable.isOpen()) return docsTable;

  const conn = await getLanceConnection();
  const tableNames = await conn.tableNames();

  if (tableNames.includes(DOCS_TABLE_NAME)) {
    docsTable = await conn.openTable(DOCS_TABLE_NAME);
  } else {
    console.error('[lance] Creating docs_vectors table');
    const dims = parseInt(process.env.DOCS_EMBEDDING_DIMENSIONS || '') || DEFAULT_DOCS_DIMENSIONS;
    docsTable = await conn.createTable(DOCS_TABLE_NAME, [{
      doc_id: '__init__',
      vector: new Array(dims).fill(0),
      library: '__init__',
      title: '__init__',
      model: '__init__',
      dimensions: dims,
      created_at: new Date().toISOString(),
    }]);
    await docsTable.delete("doc_id = '__init__'");
  }

  return docsTable;
}

export async function getWorkflowLanceTable(): Promise<Table> {
  if (workflowTable && workflowTable.isOpen()) return workflowTable;

  const conn = await getLanceConnection();
  const tableNames = await conn.tableNames();

  if (tableNames.includes(WORKFLOW_TABLE_NAME)) {
    workflowTable = await conn.openTable(WORKFLOW_TABLE_NAME);
  } else {
    console.error('[lance] Creating workflow_vectors table');
    const dims = parseInt(process.env.WORKFLOW_EMBEDDING_DIMENSIONS || '') || DEFAULT_WORKFLOW_DIMENSIONS;
    workflowTable = await conn.createTable(WORKFLOW_TABLE_NAME, [{
      workflow_id: '__init__',
      vector: new Array(dims).fill(0),
      category: '__init__',
      title: '__init__',
      tags: '__init__',
      model: '__init__',
      dimensions: dims,
      created_at: new Date().toISOString(),
    }]);
    await workflowTable.delete("workflow_id = '__init__'");
  }

  return workflowTable;
}

export async function getLanceTableStats(): Promise<{
  code: { rows: number; model?: string; dimensions?: number };
  docs: { rows: number; model?: string; dimensions?: number };
  workflow: { rows: number; model?: string; dimensions?: number };
}> {
  const stats = {
    code: { rows: 0, model: undefined as string | undefined, dimensions: undefined as number | undefined },
    docs: { rows: 0, model: undefined as string | undefined, dimensions: undefined as number | undefined },
    workflow: { rows: 0, model: undefined as string | undefined, dimensions: undefined as number | undefined },
  };

  try {
    const codeT = await getLanceTable();
    stats.code.rows = await codeT.countRows();
    if (stats.code.rows > 0) {
      const sample = await codeT.query().select(['model', 'dimensions']).limit(1).toArray();
      if (sample.length > 0) {
        stats.code.model = sample[0].model as string;
        stats.code.dimensions = sample[0].dimensions as number;
      }
    }
  } catch { /* table may not exist yet */ }

  try {
    const docsT = await getDocsLanceTable();
    stats.docs.rows = await docsT.countRows();
    if (stats.docs.rows > 0) {
      const sample = await docsT.query().select(['model', 'dimensions']).limit(1).toArray();
      if (sample.length > 0) {
        stats.docs.model = sample[0].model as string;
        stats.docs.dimensions = sample[0].dimensions as number;
      }
    }
  } catch { /* table may not exist yet */ }

  try {
    const wfT = await getWorkflowLanceTable();
    stats.workflow.rows = await wfT.countRows();
    if (stats.workflow.rows > 0) {
      const sample = await wfT.query().select(['model', 'dimensions']).limit(1).toArray();
      if (sample.length > 0) {
        stats.workflow.model = sample[0].model as string;
        stats.workflow.dimensions = sample[0].dimensions as number;
      }
    }
  } catch { /* table may not exist yet */ }

  return stats;
}

export async function closeLanceConnection(): Promise<void> {
  if (codeTable) { codeTable.close(); codeTable = null; }
  if (docsTable) { docsTable.close(); docsTable = null; }
  if (workflowTable) { workflowTable.close(); workflowTable = null; }
  connection = null;
}

export function resetLanceTable(): void {
  if (codeTable) { codeTable.close(); codeTable = null; }
  if (docsTable) { docsTable.close(); docsTable = null; }
  if (workflowTable) { workflowTable.close(); workflowTable = null; }
}
