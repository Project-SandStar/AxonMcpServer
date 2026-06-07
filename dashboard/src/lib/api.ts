/**
 * API client for the Axon MCP Server admin endpoints
 */

// Determine API base URL:
// 1. Use NEXT_PUBLIC_API_URL if set (for external/custom deployments)
// 2. Otherwise, use current window location (when dashboard is served by MCP server)
// 3. Fallback to localhost:3847 for SSR/build time
export function getApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.host}`;
  }
  return 'http://localhost:3847';
}

const API_BASE = getApiBase();

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
}

async function apiRequest<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body } = options;

  // Get credentials from localStorage or use defaults
  const username = typeof window !== 'undefined' ? localStorage.getItem('admin_user') || 'admin' : 'admin';
  const password = typeof window !== 'undefined' ? localStorage.getItem('admin_pass') || 'admin' : 'admin';
  const authHeader = 'Basic ' + btoa(`${username}:${password}`);

  const response = await fetch(`${API_BASE}/admin${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Authentication required');
    }
    throw new Error(`API error: ${response.statusText}`);
  }

  return response.json();
}

// Types
export interface ServerStatus {
  status: 'running' | 'starting' | 'error';
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  initialized: boolean;
  version: string;
  serverPath: string;
  port: number;
  activeInstance?: string;
  activeProject?: string;
  stats: {
    instances: number;
    projects: number;
    functions: number;
    docsIndexed: number;
    docsLibraries?: number;
    docsSections?: number;
  };
}

export interface InstanceInfo {
  name: string;
  host: string;
  port: number;
  protocol: 'http' | 'https';
  projectCount: number;
  isActive: boolean;
  projects: ProjectInfo[];
}

export interface ProjectInfo {
  project: string;
  instance: string;
  description?: string;
  functionCount?: number;
  lastSync?: string;
  isActive: boolean;
  isSyncing?: boolean;
}

export interface CacheInfo {
  name: string;
  path: string;
  size: number;
  lastModified: string;
  age: number;
}

export interface UsageStats {
  totalToolCalls: number;
  totalSearches: number;
  totalSessions: number;
  activeSessions: number;
  toolUsage: Record<string, number>;
  topSearches: Array<{ query: string; count: number }>;
  recentActivity: Array<{
    tool: string;
    timestamp: string;
    success: boolean;
    duration?: number;
  }>;
  periodStart: string;
  periodEnd: string;
}

export interface DailyStats {
  date: string;
  toolCalls: number;
  searches: number;
  sessions: number;
}

export interface DatabaseInfo {
  path: string;
  sizeBytes: number;
  recordCounts: {
    toolEvents: number;
    searchEvents: number;
    sessionEvents: number;
    dailyStats: number;
  };
}

export interface PrimaryProject {
  instance: string;
  project: string;
  url?: string;
  setBy: 'vscode' | 'dashboard' | 'api' | 'startup';
  timestamp: string | null;
}

// API functions
export const api = {
  // Status
  getStatus: () => apiRequest<ServerStatus>('/status'),

  // Instances
  getInstances: () => apiRequest<InstanceInfo[]>('/instances'),
  getInstance: (name: string) => apiRequest<InstanceInfo>(`/instances/${name}`),

  // Primary Project
  getPrimaryProject: () => apiRequest<PrimaryProject>('/primary-project'),
  setPrimaryProject: (instance: string, project: string) =>
    apiRequest<PrimaryProject>('/primary-project', {
      method: 'POST',
      body: { instance, project, setBy: 'dashboard' },
    }),

  // Projects
  getProjects: () => apiRequest<ProjectInfo[]>('/projects'),
  syncProject: (instance: string, project: string) =>
    apiRequest<{ downloaded: number; updated: number; deleted: number }>(
      `/projects/${instance}/${project}/sync`,
      { method: 'POST' }
    ),
  discoverProjects: (instance: string) =>
    apiRequest<{ projects: string[] }>(`/projects/${instance}/discover`, { method: 'POST' }),

  // Streamed discovery: invokes onLine for every NDJSON line emitted by the server.
  // Lines are either { type: 'log', level, step, message, ts } or
  // { type: 'done', success, projects?, error?, ts }.
  discoverProjectsStream: async (
    instance: string,
    onLine: (entry: any) => void
  ): Promise<{ success: boolean; projects?: string[]; error?: string }> => {
    const username = typeof window !== 'undefined' ? localStorage.getItem('admin_user') || 'admin' : 'admin';
    const password = typeof window !== 'undefined' ? localStorage.getItem('admin_pass') || 'admin' : 'admin';
    const authHeader = 'Basic ' + btoa(`${username}:${password}`);

    const response = await fetch(`${API_BASE}/admin/projects/${instance}/discover-stream`, {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Accept': 'application/x-ndjson' },
    });

    if (!response.ok || !response.body) {
      throw new Error(`Stream failed: ${response.status} ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let final: { success: boolean; projects?: string[]; error?: string } = { success: false };

    while (true) {
      const { value, done } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          try {
            const entry = JSON.parse(line);
            onLine(entry);
            if (entry.type === 'done') {
              final = { success: !!entry.success, projects: entry.projects, error: entry.error };
            }
          } catch {
            onLine({ type: 'log', level: 'error', step: 'parse', message: `Unparseable line: ${line}` });
          }
        }
      }
      if (done) break;
    }
    return final;
  },

  // Cache
  getCaches: () => apiRequest<CacheInfo[]>('/cache'),
  clearCache: (name?: string) =>
    apiRequest<{ success: boolean; cleared: string }>('/cache/clear', {
      method: 'POST',
      body: name ? { name } : {},
    }),

  // Usage
  getUsage: (days?: number) => apiRequest<UsageStats>(`/usage${days ? `?days=${days}` : ''}`),
  getToolUsage: (days?: number) =>
    apiRequest<Record<string, number>>(`/usage/tools${days ? `?days=${days}` : ''}`),
  getDailyStats: (days?: number) =>
    apiRequest<DailyStats[]>(`/usage/daily${days ? `?days=${days}` : ''}`),
  getSearchAnalytics: (days?: number) =>
    apiRequest<{ popular: Array<{ query: string; count: number }>; zeroResults: string[] }>(
      `/usage/searches${days ? `?days=${days}` : ''}`
    ),
  getDatabaseInfo: () => apiRequest<DatabaseInfo>('/usage/database'),
  clearUsageData: () => apiRequest<{ success: boolean; message: string }>('/usage/clear', { method: 'POST' }),
  resetDatabase: () => apiRequest<{ success: boolean; message: string }>('/usage/reset', { method: 'POST' }),

  // Config
  getConfigs: () => apiRequest<Array<{ name: string; path: string }>>('/config'),
  getConfig: (name: string) => apiRequest<{ name: string; content: unknown }>(`/config/${name}`),
  updateConfig: (name: string, content: unknown) =>
    apiRequest<{ success: boolean; name: string; reloaded?: boolean }>(`/config/${name}`, {
      method: 'PUT',
      body: { content },
    }),
  reloadConfig: () =>
    apiRequest<{ success: boolean }>('/config/reload', { method: 'POST' }),

  // Logs
  getStartupLog: async () => {
    const response = await fetch(`${API_BASE}/admin/logs/startup`, {
      headers: {
        'Authorization': 'Basic ' + btoa('admin:admin'),
      },
    });
    return response.text();
  },

  // OAuth Sessions
  getOAuthSessions: () => apiRequest<Array<{
    id: string;
    sessionId: string;
    clientId: string;
    clientName: string | null;
    userId: string | null;
    scope: string | null;
    createdAt: string;
    lastActivity: string;
    userAgent: string | null;
    ipAddress: string | null;
  }>>('/oauth/sessions'),

  revokeOAuthSession: (sessionId: string) =>
    apiRequest<{ success: boolean; message: string }>(`/oauth/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    }),

  getOAuthClients: () => apiRequest<Array<{
    client_id: string;
    client_name?: string;
    redirect_uris: string[];
    scope?: string;
    client_id_issued_at?: number;
  }>>('/oauth/clients'),

  deleteOAuthClient: (clientId: string) =>
    apiRequest<{ success: boolean; message: string }>(`/oauth/clients/${encodeURIComponent(clientId)}`, {
      method: 'DELETE',
    }),

  // Tool Search
  getToolSearchMetadata: () => apiRequest<{
    tools: ToolMetadata[];
    totalTools: number;
    categories: string[];
  }>('/tool-search'),

  getToolSearchStats: () => apiRequest<ToolSearchStats>('/tool-search/stats'),

  getToolSearchConfig: (serverName?: string) =>
    apiRequest<ToolSearchConfig>(`/tool-search/config${serverName ? `?serverName=${serverName}` : ''}`),

  getCoreTools: () => apiRequest<{
    description: string;
    count: number;
    tools: string[];
    details: ToolMetadata[];
  }>('/tool-search/core'),

  getDeferredTools: () => apiRequest<{
    description: string;
    count: number;
    tools: string[];
    details: ToolMetadata[];
  }>('/tool-search/deferred'),

  getToolsByCategory: (category: string) => apiRequest<{
    category: string;
    count: number;
    tools: ToolMetadata[];
  }>(`/tool-search/category/${category}`),

  searchTools: (query: string, limit?: number) =>
    apiRequest<ToolSearchResult>(`/tool-search/search?q=${encodeURIComponent(query)}${limit ? `&limit=${limit}` : ''}`),

  searchToolsByRegex: (pattern: string, limit?: number) =>
    apiRequest<ToolSearchResult>(`/tool-search/search?regex=${encodeURIComponent(pattern)}${limit ? `&limit=${limit}` : ''}`),

  // Graph
  getGraphStats: () => apiRequest<GraphStats>('/graph/stats'),
  getGraphProjects: () => apiRequest<GraphProject[]>('/graph/projects'),
  registerProjects: () =>
    apiRequest<{ registered: Array<{ name: string; instance: string; path: string; functionCount: number }>; totalProjects: number; totalFunctions: number }>(
      '/graph/projects/register', { method: 'POST' }
    ),
  getGraphProjectStats: (id: number) => apiRequest<GraphProjectStats>(`/graph/projects/${id}/stats`),
  buildGraph: (id: number) =>
    apiRequest<BuildGraphResult>(`/graph/projects/${id}/build-graph`, { method: 'POST' }),
  buildEmbeddings: (id: number) =>
    apiRequest<BuildEmbeddingsResult>(`/graph/projects/${id}/build-embeddings`, { method: 'POST' }),

  // Graph Visualization
  searchGraphNodes: (query: string, limit?: number, projectId?: number) =>
    apiRequest<GraphNode[]>(`/graph/nodes/search?q=${encodeURIComponent(query)}${limit ? `&limit=${limit}` : ''}${projectId ? `&projectId=${projectId}` : ''}`),
  getGraphNodeDetails: (id: string) => apiRequest<GraphNodeDetails>(`/graph/nodes/${id}`),
  getGraphVisualization: (id: string, depth?: number, maxNodes?: number, graphType?: string) =>
    apiRequest<GraphVisualizationData>(`/graph/visualize/${id}?format=json${depth ? `&depth=${depth}` : ''}${maxNodes ? `&maxNodes=${maxNodes}` : ''}${graphType ? `&graphType=${graphType}` : ''}`),
  getGraphImpact: (id: string, maxDepth?: number) =>
    apiRequest<GraphImpactData>(`/graph/impact/${id}${maxDepth ? `?maxDepth=${maxDepth}` : ''}`),
  exportProjectGraph: (projectId: number, format?: string) =>
    apiRequest<GraphVisualizationData>(`/graph/export/${projectId}?format=${format || 'json'}`),

  // Documentation Search (combined FlexSearch + Vector)
  searchDocs: (query: string, limit?: number, library?: string) =>
    apiRequest<DocsSearchResponse>('/docs/search', {
      method: 'POST',
      body: { query, limit: limit || 20, library },
    }),
  buildDocsEmbeddings: () =>
    apiRequest<DocsEmbeddingResult>('/docs/build-embeddings', { method: 'POST' }),
  getDocsStats: () => apiRequest<DocsStatsResponse>('/docs/stats'),

  // Vector / Semantic Search
  vectorSearch: (query: string, projectId?: number, limit?: number) =>
    apiRequest<VectorSearchResponse>('/vectors/search', {
      method: 'POST',
      body: { query, projectId, limit: limit || 20 },
    }),
  getVectorStats: () => apiRequest<VectorStatsResponse>('/vectors/stats'),

  // Embedding Models
  getModels: () => apiRequest<ModelListResponse>('/models'),
  downloadModel: (modelId: string) =>
    apiRequest<{ success: boolean; message: string; status: ModelStatus }>('/models/download', {
      method: 'POST',
      body: { modelId },
    }),
  deleteModel: (modelId: string) =>
    apiRequest<{ success: boolean; message: string }>(`/models/${modelId}`, {
      method: 'DELETE',
    }),

  // Settings (unified)
  getSettings: () => apiRequest<ConfigSettings>('/settings'),
  updateSettings: (settings: ConfigSettings) =>
    apiRequest<{ success: boolean }>('/settings', { method: 'PUT', body: settings }),
  getSemanticSearchConfig: () => apiRequest<SemanticSearchConfig>('/settings/semantic-search'),
  updateSemanticSearchConfig: (config: Partial<SemanticSearchConfig>) =>
    apiRequest<{ success: boolean; semanticSearch: SemanticSearchConfig }>('/settings/semantic-search', {
      method: 'PUT',
      body: config,
    }),

  // Workflows
  listWorkflows: () =>
    apiRequest<{
      count: number;
      claudeAvailable: boolean;
      workflows: Array<{
        id: string;
        title: string;
        description: string;
        category: string;
        tags: string[];
        uri: string;
        summary: string;
        mode: 'local' | 'claude';
        generatedAt: string;
        sourceMtime: number;
        model?: string;
      }>;
    }>('/workflows'),
  getWorkflow: (id: string) =>
    apiRequest<{
      workflow: {
        id: string;
        title: string;
        description: string;
        category: string;
        tags: string[];
        version: string;
        uri: string;
        mtimeMs: number;
      };
      summary: any;
      fullContent: string;
    }>(`/workflows/${id}`),
  summarizeWorkflow: (id: string, provider: 'local' | 'claude') =>
    apiRequest<any>(`/workflows/${id}/summarize`, { method: 'POST', body: { provider } }),
  saveWorkflow: (id: string, content: string) =>
    apiRequest<{ workflow: any; summary: any }>(`/workflows/${id}`, { method: 'PUT', body: { content } }),
  regenerateAllWorkflows: () =>
    apiRequest<{ regenerated: number }>('/workflows/regenerate-all', { method: 'POST' }),
  reindexWorkflows: () =>
    apiRequest<{ embedded: number; durationMs: number }>('/workflows/reindex', { method: 'POST' }),

  // API Keys
  listKeys: () =>
    apiRequest<Array<{
      name: string;
      present: boolean;
      source: 'db' | 'env' | null;
      last4: string | null;
      updatedAt: string | null;
    }>>('/keys'),
  setKey: (name: string, value: string) =>
    apiRequest<any>(`/keys/${name}`, { method: 'PUT', body: { value } }),
  deleteKey: (name: string) =>
    apiRequest<any>(`/keys/${name}`, { method: 'DELETE' }),
  testKey: (name: string) =>
    apiRequest<{ ok: boolean; latencyMs?: number; model?: string; error?: string }>(`/keys/${name}/test`, { method: 'POST' }),
};

// Tool Search Types
export interface ToolMetadata {
  name: string;
  category: string;
  description: string;
  keywords: string[];
  core: boolean;
  tokenCost: number;
  usageFrequency: 'high' | 'medium' | 'low';
  requiresSkySpark: boolean;
}

export interface ToolSearchStats {
  totalTools: number;
  coreTools: number;
  deferredTools: number;
  totalTokenCost: number;
  coreTokenCost: number;
  tokenSavings: number;
  savingsPercent: number;
  byCategory: Record<string, number>;
  byUsageFrequency: Record<string, number>;
  description: string;
  recommendation: string;
}

export interface ToolSearchConfig {
  description: string;
  requiredBetaHeaders: string[];
  combinedHeader: string;
  toolSearchTool: {
    type: string;
    name: string;
    description: string;
  };
  toolSearchToolRegex: {
    type: string;
    name: string;
    description: string;
  };
  mcp_toolset: object;
  exampleUsage: object;
}

export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  projectCount: number;
  vectorCount: number;
  codeVectors: number;
  docsVectors: number;
  buildStats: Array<{
    id: number;
    project: string;
    instance: string;
    nodesCreated: number;
    edgesCreated: number;
    buildTimeMs: number;
    builtAt: string;
  }>;
}

export interface SemanticSearchConfig {
  enabled: boolean;
  codeModel: string;
  codeDimensions: number;
  docsModel: string;
  docsDimensions: number;
  embeddingThreads: number;
  embeddingBatchSize: number;
  graphWeight: number;
  minScore: number;
}

export interface ModelStatus {
  modelId: string;
  name: string;
  category: 'code' | 'docs';
  dimensions: number;
  estimatedSize: string;
  downloaded: boolean;
  sizeOnDisk: number;
}

export interface KnownModel {
  id: string;
  name: string;
  dimensions: number;
  size: string;
  category: 'code' | 'docs';
}

export interface ModelListResponse {
  models: ModelStatus[];
  knownModels: KnownModel[];
}

export interface GraphProject {
  id: number;
  name: string;
  path: string;
  description: string | null;
  functionCount: number;
  lastIndexed: string | null;
  autoIndex: boolean;
  nodeCount: number;
  edgeCount: number;
  vectorCount: number;
  hasGraph: boolean;
  hasVectors: boolean;
}

export interface GraphProjectStats {
  project: {
    id: number;
    name: string;
    path: string;
    functionCount: number;
    lastIndexed: string | null;
  };
  graph: {
    nodeCount: number;
    edgeCount: number;
    unresolvedCount: number;
    nodesByType: Record<string, number>;
    edgesByType: Record<string, number>;
  };
  vectors: {
    count: number;
    coverage: number;
  };
  buildHistory: Array<{
    id: number;
    project: string;
    instance: string;
    nodesCreated: number;
    edgesCreated: number;
    buildTimeMs: number;
    builtAt: string;
  }>;
}

export interface BuildGraphResult {
  success: boolean;
  projectId: number;
  projectName: string;
  nodesCreated: number;
  edgesCreated: number;
  unresolvedCount: number;
  durationMs: number;
  errors: string[];
}

export interface BuildEmbeddingsResult {
  success: boolean;
  projectId: number;
  projectName: string;
  totalNodes?: number;
  embedded: number;
  message?: string;
}

export interface GraphNode {
  id: string;
  name: string;
  qualifiedName: string;
  nodeType: string;
  filePath: string;
  lineStart: number;
  signature: string | null;
  projectId: number;
}

export interface GraphNodeDetails {
  node: GraphNode & {
    lineEnd: number | null;
    documentation: string | null;
    complexity: number | null;
    paramCount: number | null;
  };
  callers: Array<{
    id: string;
    name: string;
    qualifiedName: string;
    depth: number;
    filePath: string;
    lineNumber?: number;
    edgeType: string;
  }>;
  callees: Array<{
    id: string;
    name: string;
    qualifiedName: string;
    depth: number;
    filePath: string;
    lineNumber?: number;
  }>;
}

export interface GraphVisualizationData {
  nodes: Array<{
    id: string;
    name: string;
    qualifiedName: string;
    nodeType: string;
    filePath: string;
    lineStart: number;
    group?: string;
    weight?: number;
    color?: string;
  }>;
  edges: Array<{
    source: string;
    target: string;
    edgeType: string;
    lineNumber?: number;
    weight?: number;
  }>;
  metadata: {
    title?: string;
    description?: string;
    generatedAt: string;
    nodeCount: number;
    edgeCount: number;
    focalNodeId?: string;
  };
}

export interface GraphImpactData {
  nodeId: string;
  nodeName: string;
  directCallers: number;
  transitiveCallers: number;
  impactScore: number;
  affectedNodes: Array<{
    id: string;
    name: string;
    depth: number;
    filePath: string;
  }>;
}

export interface DocsSearchResultItem {
  document: {
    id: string;
    title: string;
    library: string;
    filePath: string;
    sections: Array<{
      id: string;
      heading: string;
      level: number;
      content: string;
      codeExamples: string[];
    }>;
    fullText: string;
  };
  flexScore: number;
  vectorScore: number;
  combinedScore: number;
  matchedSections: Array<{
    id: string;
    heading: string;
    level: number;
    content: string;
    codeExamples: string[];
  }>;
  highlights: string[];
  sources: string[];
}

export interface DocsSearchResponse {
  results: DocsSearchResultItem[];
  meta: {
    query: string;
    flexCount: number;
    vectorCount: number;
    mergedCount: number;
  };
}

export interface DocsStatsResponse {
  flexSearch: {
    documents: number;
    sections: number;
    libraries: string[];
  };
  vectors: {
    count: number;
    coverage: string;
  };
}

export interface DocsEmbeddingResult {
  success: boolean;
  total: number;
  embedded: number;
  errors: number;
  durationMs: number;
  message?: string;
}

export interface VectorSearchResult {
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

export interface VectorSearchResponse {
  results: VectorSearchResult[];
}

export interface VectorStatsResponse {
  totalVectors: number;
  codeVectors: number;
  docsVectors: number;
  totalNodes: number;
  coveragePercent: string;
  projects: Array<{
    id: number;
    name: string;
    nodeCount: number;
    vectorCount: number;
  }>;
}

export interface ConfigSettings {
  server?: { port: number };
  codePath: string;
  docsPath: string;
  skyspark: {
    home: string;
    configDir: string;
    format: string;
    autoDiscover: boolean;
    autoSyncFunctions: boolean;
    syncConcurrency: number;
    functionVersioning: boolean;
    maxVersions: number;
    fallback: {
      host: string;
      port: number;
      project: string;
      username: string;
      password: string;
      protocol: string;
    };
  };
  cache: {
    enabled: boolean;
    maxAge: number;
    directory: string;
  };
  search: {
    minTokenLength: number;
    maxResults: number;
  };
  semanticSearch?: SemanticSearchConfig;
  filePatterns?: { code: string[]; docs: string[] };
  excludeDirs?: string[];
}

export interface ToolSearchResult {
  searchType: string;
  query: string;
  count: number;
  results: Array<{
    name: string;
    description: string;
    category: string;
    keywords: string[];
    core: boolean;
  }>;
  toolReferences: Array<{
    type: string;
    tool_name: string;
  }>;
}
