'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ProjectInfo } from '@/lib/api';
import { Play, RefreshCw, Copy, Check, ChevronDown, Bot, Monitor } from 'lucide-react';

// Tool definitions matching the MCP server
interface ToolParam {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  description: string;
  default?: string | number | boolean;
  examples?: string[];  // Example values for the parameter
  dynamicOptions?: 'patterns' | 'projectFunctions' | 'indexedFunctions';  // Load options dynamically from MCP
}

interface ToolDef {
  name: string;
  description: string;
  category: 'search' | 'retrieve' | 'skyspark' | 'execute' | 'graph';
  params: ToolParam[];
  mcpExposed: boolean; // true = available to LLMs via MCP, false = dashboard/backend only
}

const MCP_TOOLS: ToolDef[] = [
  // Search tools — LLM-facing
  {
    name: 'searchAxonExamples', description: 'Search Axon code examples by keyword',
    category: 'search', mcpExposed: true,
    params: [
      { name: 'keyword', type: 'string', required: true, description: 'Search keyword', examples: ['point', 'ahu', 'defcomp', 'spark rule', 'energy'] },
      { name: 'limit', type: 'number', required: false, description: 'Max results', default: 10 }
    ]
  },
  {
    name: 'searchAxonDocs', description: 'Search Axon documentation',
    category: 'search', mcpExposed: true,
    params: [
      { name: 'query', type: 'string', required: true, description: 'Search query', examples: ['read', 'filter', 'fold', 'grid', 'haystack'] },
      { name: 'limit', type: 'number', required: false, description: 'Max results', default: 10 }
    ]
  },
  {
    name: 'searchAxonOperatorExamples', description: 'Find examples using specific operators',
    category: 'search', mcpExposed: true,
    params: [
      { name: 'operator', type: 'string', required: true, description: 'Operator (e.g., >=, ==, ->)', examples: ['->', '=>', '>=', '==', '<>'] },
      { name: 'limit', type: 'number', required: false, description: 'Max results', default: 10 }
    ]
  },
  {
    name: 'searchAxonRegex', description: 'Search code with regex patterns',
    category: 'search', mcpExposed: true,
    params: [
      { name: 'pattern', type: 'string', required: true, description: 'Regex pattern', examples: ['def\\s+\\w+', 'readAll\\(.*point', 'if\\s*\\(.*\\)'] },
      { name: 'limit', type: 'number', required: false, description: 'Max results', default: 10 }
    ]
  },
  {
    name: 'findFunctionUsage', description: 'Find where a function is used',
    category: 'search', mcpExposed: true,
    params: [
      { name: 'functionName', type: 'string', required: true, description: 'Function name', examples: ['readAll', 'toGrid', 'parseNumber', 'foldCol'] }
    ]
  },
  {
    name: 'getFunctionExamples', description: 'Get usage examples for a function',
    category: 'search', mcpExposed: true,
    params: [
      { name: 'functionName', type: 'string', required: true, description: 'Function name', examples: ['read', 'commit', 'hisRead', 'eval'] },
      { name: 'limit', type: 'number', required: false, description: 'Max results', default: 5 }
    ]
  },
  {
    name: 'getFunctionCallGraph', description: 'Get call graph for a function',
    category: 'search', mcpExposed: true,
    params: [
      { name: 'functionName', type: 'string', required: true, description: 'Function name', examples: ['readAll', 'hisRead', 'pointWrite'] },
      { name: 'depth', type: 'number', required: false, description: 'Max depth', default: 2 }
    ]
  },
  {
    name: 'getFunctionUsageStats', description: 'Get usage statistics for functions',
    category: 'search', mcpExposed: true,
    params: [
      { name: 'limit', type: 'number', required: false, description: 'Top N functions', default: 20 }
    ]
  },
  {
    name: 'semanticCodeSearch', description: 'Search code using natural language (AI-powered)',
    category: 'search', mcpExposed: true,
    params: [
      { name: 'query', type: 'string', required: true, description: 'Natural language query', examples: ['energy calculation', 'HVAC schedule', 'meter rollup'] },
      { name: 'limit', type: 'number', required: false, description: 'Max results', default: 10 }
    ]
  },
  {
    name: 'findSimilarCode', description: 'Find functions similar to a given one',
    category: 'search', mcpExposed: true,
    params: [
      { name: 'qualifiedName', type: 'string', required: false, description: 'Function name' },
      { name: 'nodeId', type: 'string', required: false, description: 'Code node ID' },
      { name: 'limit', type: 'number', required: false, description: 'Max results', default: 5 }
    ]
  },
  // Retrieve tools — LLM-facing
  {
    name: 'getAxonExample', description: 'Get a specific Axon example by function ID or name from the indexed library',
    category: 'retrieve', mcpExposed: true,
    params: [
      { name: 'identifier', type: 'string', required: true, description: 'Type to search indexed functions', dynamicOptions: 'indexedFunctions' }
    ]
  },
  {
    name: 'getAxonPattern', description: 'Get a common Axon pattern by ID. Select a pattern from the dropdown.',
    category: 'retrieve', mcpExposed: true,
    params: [
      { name: 'patternId', type: 'string', required: false, description: 'Pattern ID (select from dropdown)', dynamicOptions: 'patterns' }
    ]
  },
  {
    name: 'listAxonPatterns', description: 'List all available code patterns',
    category: 'retrieve', mcpExposed: true, params: []
  },
  {
    name: 'listAxonCategories', description: 'List all example categories',
    category: 'retrieve', mcpExposed: true, params: []
  },
  {
    name: 'listAxonTemplates', description: 'List available code templates',
    category: 'retrieve', mcpExposed: true, params: []
  },
  // SkySpark tools — LLM-facing
  {
    name: 'listSkySparkProjects', description: 'List all SkySpark projects',
    category: 'skyspark', mcpExposed: true, params: []
  },
  {
    name: 'discoverProjectFunctions', description: 'Discover functions in current project',
    category: 'skyspark', mcpExposed: true,
    params: [
      { name: 'filter', type: 'string', required: false, description: 'Select a function or type a filter pattern', dynamicOptions: 'projectFunctions' }
    ]
  },
  {
    name: 'getProjectSchema', description: 'Browse project data with pagination',
    category: 'skyspark', mcpExposed: true,
    params: [
      { name: 'entityType', type: 'string', required: false, description: 'Entity type to browse', examples: ['site', 'equip', 'point', 'func'] },
      { name: 'filter', type: 'string', required: false, description: 'Additional filter', examples: ['ahu', 'sensor', 'temp'] },
      { name: 'offset', type: 'number', required: false, description: 'Start index', default: 0 },
      { name: 'limit', type: 'number', required: false, description: 'Max records (max 1000)', default: 100 }
    ]
  },
  {
    name: 'queryHaystack', description: 'Execute Haystack query',
    category: 'skyspark', mcpExposed: true,
    params: [
      { name: 'filter', type: 'string', required: true, description: 'Axon filter expression', examples: ['point', 'site', 'equip and ahu', 'point and sensor', 'site->dis'] },
      { name: 'limit', type: 'number', required: false, description: 'Max results', default: 100 }
    ]
  },
  {
    name: 'getPrimaryProject', description: 'Get the current active SkySpark project',
    category: 'skyspark', mcpExposed: true, params: []
  },
  {
    name: 'switchSkySparkProject', description: 'Switch active SkySpark project',
    category: 'skyspark', mcpExposed: true,
    params: [
      { name: 'instance', type: 'string', required: true, description: 'Instance name' },
      { name: 'project', type: 'string', required: true, description: 'Project name' }
    ]
  },
  {
    name: 'discoverInstanceProjects', description: 'Discover all projects in a SkySpark instance',
    category: 'skyspark', mcpExposed: true,
    params: [
      { name: 'instance', type: 'string', required: true, description: 'Instance name' }
    ]
  },
  // Execute tools — LLM-facing
  {
    name: 'executeAxonCode', description: 'Execute Axon code on SkySpark (uses active project)',
    category: 'execute', mcpExposed: true,
    params: [
      { name: 'code', type: 'string', required: true, description: 'Axon code to execute', examples: ['read(point)', 'readAll(site).size', 'now()', 'readAll(point).first'] }
    ]
  },
  {
    name: 'validateAxonCode', description: 'Validate Axon code syntax and best practices',
    category: 'execute', mcpExposed: true,
    params: [
      { name: 'code', type: 'string', required: true, description: 'Axon code to validate', examples: ['readAll(point)', 'do\n  x: 1\n  x + 2\nend'] }
    ]
  },
  {
    name: 'generateAxonCode', description: 'Generate Axon code from a natural language prompt',
    category: 'execute', mcpExposed: true,
    params: [
      { name: 'prompt', type: 'string', required: true, description: 'Describe what the code should do', examples: ['read all AHU points', 'calculate energy usage for last 7 days'] }
    ]
  },
  {
    name: 'commitAxonFunction', description: 'Commit an Axon function to SkySpark',
    category: 'execute', mcpExposed: true,
    params: [
      { name: 'name', type: 'string', required: true, description: 'Function name' },
      { name: 'code', type: 'string', required: true, description: 'Function source code' }
    ]
  },
  // Graph analysis tools — LLM-facing
  {
    name: 'getCallers', description: 'Find all functions that call a given function',
    category: 'graph', mcpExposed: true,
    params: [
      { name: 'qualifiedName', type: 'string', required: false, description: 'Function name', examples: ['myFunc', 'calcEnergy'] },
      { name: 'nodeId', type: 'string', required: false, description: 'Code node ID' },
      { name: 'maxDepth', type: 'number', required: false, description: 'Max depth', default: 5 }
    ]
  },
  {
    name: 'getCallees', description: 'Find all functions called by a given function',
    category: 'graph', mcpExposed: true,
    params: [
      { name: 'qualifiedName', type: 'string', required: false, description: 'Function name', examples: ['myFunc', 'calcEnergy'] },
      { name: 'nodeId', type: 'string', required: false, description: 'Code node ID' },
      { name: 'maxDepth', type: 'number', required: false, description: 'Max depth', default: 5 }
    ]
  },
  {
    name: 'getCodeImpact', description: 'Analyze blast radius of changing a function',
    category: 'graph', mcpExposed: true,
    params: [
      { name: 'qualifiedName', type: 'string', required: false, description: 'Function name' },
      { name: 'nodeId', type: 'string', required: false, description: 'Code node ID' },
      { name: 'maxDepth', type: 'number', required: false, description: 'Max depth', default: 10 }
    ]
  },
  {
    name: 'findCodePath', description: 'Find call chain between two functions',
    category: 'graph', mcpExposed: true,
    params: [
      { name: 'fromQualifiedName', type: 'string', required: false, description: 'Start function' },
      { name: 'toQualifiedName', type: 'string', required: false, description: 'Target function' },
      { name: 'maxDepth', type: 'number', required: false, description: 'Max path length', default: 10 }
    ]
  },
  {
    name: 'getGraphMetrics', description: 'Get code metrics for a function',
    category: 'graph', mcpExposed: true,
    params: [
      { name: 'qualifiedName', type: 'string', required: false, description: 'Function name' },
      { name: 'nodeId', type: 'string', required: false, description: 'Code node ID' }
    ]
  },
  {
    name: 'getMostCalledFunctions', description: 'Find most frequently called functions',
    category: 'graph', mcpExposed: true,
    params: [
      { name: 'projectId', type: 'number', required: true, description: 'Project ID' },
      { name: 'limit', type: 'number', required: false, description: 'Top N', default: 10 }
    ]
  },
  {
    name: 'getMostComplexFunctions', description: 'Find functions with most dependencies',
    category: 'graph', mcpExposed: true,
    params: [
      { name: 'projectId', type: 'number', required: true, description: 'Project ID' },
      { name: 'limit', type: 'number', required: false, description: 'Top N', default: 10 }
    ]
  },
  {
    name: 'detectCycles', description: 'Detect circular dependencies',
    category: 'graph', mcpExposed: true,
    params: [
      { name: 'projectId', type: 'number', required: true, description: 'Project ID' },
      { name: 'maxCycles', type: 'number', required: false, description: 'Max cycles', default: 10 }
    ]
  },
  {
    name: 'queryGraph', description: 'Execute a graph DSL query',
    category: 'graph', mcpExposed: true,
    params: [
      { name: 'query', type: 'string', required: true, description: 'DSL query', examples: ['MATCH function WHERE name LIKE handle*', 'PATH FROM init TO cleanup'] },
      { name: 'projectId', type: 'number', required: false, description: 'Project ID' }
    ]
  },
  {
    name: 'getPageRank', description: 'Compute PageRank importance scores',
    category: 'graph', mcpExposed: true,
    params: [
      { name: 'projectId', type: 'number', required: true, description: 'Project ID' },
      { name: 'limit', type: 'number', required: false, description: 'Top N', default: 20 }
    ]
  },
  {
    name: 'getBetweennessCentrality', description: 'Find bottleneck/bridge functions',
    category: 'graph', mcpExposed: true,
    params: [
      { name: 'projectId', type: 'number', required: true, description: 'Project ID' },
      { name: 'limit', type: 'number', required: false, description: 'Top N', default: 20 }
    ]
  },
  {
    name: 'getStronglyConnectedComponents', description: 'Find mutually recursive function groups',
    category: 'graph', mcpExposed: true,
    params: [
      { name: 'projectId', type: 'number', required: true, description: 'Project ID' },
      { name: 'minSize', type: 'number', required: false, description: 'Min component size', default: 2 }
    ]
  },
  {
    name: 'findConstrainedPath', description: 'Find paths with constraints',
    category: 'graph', mcpExposed: true,
    params: [
      { name: 'from', type: 'string', required: true, description: 'Start function name' },
      { name: 'to', type: 'string', required: true, description: 'Target function name' },
      { name: 'maxDepth', type: 'number', required: false, description: 'Max path length', default: 15 }
    ]
  },
  // Management tools — Dashboard/Backend only
  {
    name: 'buildProjectGraph', description: 'Build/rebuild code graph index for a project',
    category: 'graph', mcpExposed: false,
    params: [
      { name: 'projectId', type: 'number', required: true, description: 'Project ID' },
      { name: 'rebuildEmbeddings', type: 'boolean', required: false, description: 'Also rebuild embeddings', default: false }
    ]
  },
  {
    name: 'buildProjectEmbeddings', description: 'Generate AI embeddings for semantic search',
    category: 'graph', mcpExposed: false,
    params: [
      { name: 'projectId', type: 'number', required: true, description: 'Project ID' }
    ]
  },
  {
    name: 'getGraphStats', description: 'Get graph index statistics',
    category: 'graph', mcpExposed: false,
    params: [
      { name: 'projectId', type: 'number', required: false, description: 'Project ID (omit for all)' }
    ]
  },
  {
    name: 'exportGraphVisualization', description: 'Export graph as DOT/JSON/D3/Cytoscape',
    category: 'graph', mcpExposed: false,
    params: [
      { name: 'qualifiedName', type: 'string', required: false, description: 'Focal function name' },
      { name: 'projectId', type: 'number', required: false, description: 'Project ID (for full graph)' },
      { name: 'graphType', type: 'string', required: false, description: 'Graph type', examples: ['subgraph', 'callers', 'callees', 'impact', 'project'] },
      { name: 'format', type: 'string', required: false, description: 'Export format', examples: ['dot', 'json', 'd3', 'cytoscape'] },
      { name: 'depth', type: 'number', required: false, description: 'Traversal depth', default: 3 }
    ]
  },
  {
    name: 'clearProjectCache', description: 'Clear project cache',
    category: 'execute', mcpExposed: false, params: []
  },
  {
    name: 'setPrimaryProject', description: 'Set the active SkySpark project',
    category: 'skyspark', mcpExposed: false,
    params: [
      { name: 'instance', type: 'string', required: true, description: 'Instance name' },
      { name: 'project', type: 'string', required: true, description: 'Project name' }
    ]
  },
];

// Determine API base dynamically (supports configurable port)
function getApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.host}`;
  }
  return 'http://localhost:3847';
}

const API_BASE = getApiBase();

// MCP session management
let mcpSessionId: string | null = null;

async function ensureMcpSession(): Promise<string> {
  if (mcpSessionId) return mcpSessionId;

  const initRequest = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'axon-dashboard', version: '1.0.0' }
    }
  };

  const response = await fetch(`${API_BASE}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    },
    body: JSON.stringify(initRequest)
  });

  if (!response.ok) throw new Error(`Failed to initialize MCP session: ${response.status}`);

  const sessionId = response.headers.get('mcp-session-id');
  if (!sessionId) throw new Error('MCP server did not return a session ID');

  mcpSessionId = sessionId;

  // Send initialized notification
  await fetch(`${API_BASE}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'mcp-session-id': sessionId
    },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
  });

  return sessionId;
}

async function callMcpTool(toolName: string, args: Record<string, unknown>, retryCount = 0): Promise<unknown> {
  const sessionId = await ensureMcpSession();

  const request = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: { name: toolName, arguments: args }
  };

  const response = await fetch(`${API_BASE}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'mcp-session-id': sessionId
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    if (response.status === 400 && retryCount < 2) {
      mcpSessionId = null;
      return callMcpTool(toolName, args, retryCount + 1);
    }
    throw new Error(`HTTP ${response.status}`);
  }

  const text = await response.text();
  const result = parseSSEResponse(text);

  if (result.error) throw new Error(result.error.message);

  const content = result.result?.content?.[0]?.text;
  if (content) {
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }

  return result.result;
}

function parseSSEResponse(text: string): any {
  const events = text.split('\n\n').filter(e => e.trim());

  for (const event of events) {
    const lines = event.split('\n');
    let eventType = '';
    let data = '';

    for (const line of lines) {
      if (line.startsWith('event:')) eventType = line.substring(6).trim();
      else if (line.startsWith('data:')) data = line.substring(5).trim();
    }

    if (eventType === 'message' && data) {
      try {
        return JSON.parse(data);
      } catch {}
    }
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Failed to parse response: ${text.substring(0, 200)}`);
  }
}

// JSON syntax highlighting
function syntaxHighlight(obj: unknown): string {
  const json = JSON.stringify(obj, null, 2);
  return json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      (match) => {
        let cls = 'text-amber-600'; // number
        if (/^"/.test(match)) {
          cls = /:$/.test(match) ? 'text-blue-600' : 'text-green-600'; // key : string
        } else if (/true|false/.test(match)) {
          cls = 'text-purple-600';
        } else if (/null/.test(match)) {
          cls = 'text-gray-500';
        }
        return `<span class="${cls}">${match}</span>`;
      }
    );
}

export default function McpExplorer() {
  const [selectedTool, setSelectedTool] = useState<string>('');
  const [params, setParams] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Record<string, unknown> | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [mcpFilter, setMcpFilter] = useState<'all' | 'mcp' | 'dashboard'>('all');

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: api.getProjects,
  });

  const { data: primaryProject } = useQuery({
    queryKey: ['primaryProject'],
    queryFn: api.getPrimaryProject,
  });

  // Fetch patterns when getAxonPattern is selected
  const { data: patterns, isLoading: patternsLoading } = useQuery({
    queryKey: ['axonPatterns'],
    queryFn: async () => {
      const result = await callMcpTool('listAxonPatterns', {});
      if (result && typeof result === 'object' && 'patterns' in result) {
        return (result as { patterns: Array<{ id: string; name: string; description: string }> }).patterns;
      }
      return [];
    },
    enabled: selectedTool === 'getAxonPattern',
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch project functions when discoverProjectFunctions is selected
  const { data: projectFunctions, isLoading: functionsLoading } = useQuery({
    queryKey: ['projectFunctions', primaryProject?.instance, primaryProject?.project],
    queryFn: async () => {
      // Call readAll(func) directly to get all functions from active project
      const result = await callMcpTool('executeAxonCode', { code: 'readAll(func).sort("name")' });
      if (result && typeof result === 'object' && 'result' in result) {
        const grid = (result as any).result;
        if (Array.isArray(grid)) {
          return grid.map((row: any) => ({
            name: row.name || row.dis || 'unknown',
            doc: row.doc || '',
            id: row.id || ''
          }));
        }
      }
      // Fallback to discoverProjectFunctions
      const fallback = await callMcpTool('discoverProjectFunctions', {});
      if (fallback && typeof fallback === 'object' && 'functions' in fallback) {
        return (fallback as { functions: Array<{ name: string; doc?: string }> }).functions;
      }
      return [];
    },
    enabled: selectedTool === 'discoverProjectFunctions',
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
  });

  // Search indexed functions as user types (for getAxonExample)
  const searchQuery = params['identifier'] || '';
  const { data: indexedFunctions, isLoading: indexedLoading } = useQuery({
    queryKey: ['indexedFunctions', searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return [];
      const result = await callMcpTool('searchAxonExamples', { keyword: searchQuery, limit: 20 });
      if (result && typeof result === 'object' && 'functions' in result) {
        return (result as { functions: Array<{ name: string; description?: string }> }).functions;
      }
      return [];
    },
    enabled: selectedTool === 'getAxonExample' && searchQuery.length >= 2,
    staleTime: 30 * 1000, // Cache for 30 seconds
  });

  const tool = MCP_TOOLS.find(t => t.name === selectedTool);

  const handleExecute = async () => {
    if (!tool || isExecuting) return;

    const args: Record<string, unknown> = {};
    tool.params.forEach(param => {
      const value = params[param.name];
      if (value) {
        if (param.type === 'number') {
          args[param.name] = parseInt(value, 10);
        } else if (param.type === 'boolean') {
          args[param.name] = value === 'true';
        } else {
          args[param.name] = value;
        }
      }
    });

    setIsExecuting(true);
    setError(null);

    try {
      let data;

      // Special handling for discoverProjectFunctions - fetch full function details with src
      if (selectedTool === 'discoverProjectFunctions' && args.filter) {
        const funcName = String(args.filter);
        // Escape quotes in function name for Axon query
        const escapedName = funcName.replace(/"/g, '\\"');
        const code = `read(func and name=="${escapedName}")`;
        data = await callMcpTool('executeAxonCode', { code });
      } else {
        data = await callMcpTool(selectedTool, args);
      }

      setResult(data as Record<string, unknown> | string | null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  // Handle any input change
  const handleInputChange = (paramName: string, value: string) => {
    setParams(prev => ({ ...prev, [paramName]: value }));
  };

  // Handle example button click - same as input change but also clears error
  const handleExampleClick = (paramName: string, value: string) => {
    setError(null);
    setParams(prev => ({ ...prev, [paramName]: value }));
  };

  const isExecuteDisabled = !tool || tool.params.some(p => p.required && !params[p.name]);

  const filteredTools = MCP_TOOLS.filter(t => {
    if (mcpFilter === 'mcp') return t.mcpExposed;
    if (mcpFilter === 'dashboard') return !t.mcpExposed;
    return true;
  });

  const toolsByCategory = {
    search: filteredTools.filter(t => t.category === 'search'),
    retrieve: filteredTools.filter(t => t.category === 'retrieve'),
    skyspark: filteredTools.filter(t => t.category === 'skyspark'),
    execute: filteredTools.filter(t => t.category === 'execute'),
    graph: filteredTools.filter(t => t.category === 'graph'),
  };

  const mcpCount = MCP_TOOLS.filter(t => t.mcpExposed).length;
  const dashboardCount = MCP_TOOLS.filter(t => !t.mcpExposed).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">MCP Explorer</h1>
          <p className="text-gray-500">
            {mcpCount} MCP tools / {MCP_TOOLS.length} total. Test and explore tools. See exactly what LLMs receive.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
          {([
            { value: 'all' as const, label: 'All', count: MCP_TOOLS.length },
            { value: 'mcp' as const, label: 'MCP', count: mcpCount, icon: <Bot className="h-3.5 w-3.5" /> },
            { value: 'dashboard' as const, label: 'Backend', count: dashboardCount, icon: <Monitor className="h-3.5 w-3.5" /> },
          ]).map(({ value, label, count, icon }) => (
            <button
              key={value}
              onClick={() => setMcpFilter(value)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                mcpFilter === value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {icon}
              {label}
              <span className="text-xs text-gray-400">({count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Current Project */}
      {primaryProject && !('error' in primaryProject) && (
        <div className="rounded-lg bg-blue-50 p-4">
          <p className="text-sm text-blue-800">
            <span className="font-medium">Active Project:</span>{' '}
            {primaryProject.instance}/{primaryProject.project}
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Panel - Tool Selection & Parameters */}
        <div className="space-y-6">
          {/* Tool Selection */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Select Tool</h2>
            <select
              value={selectedTool}
              onChange={(e) => {
                setSelectedTool(e.target.value);
                setParams({});
                setResult(null);
                setError(null);
              }}
              className="w-full rounded-lg border border-gray-300 p-3 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select a tool...</option>
              {toolsByCategory.search.length > 0 && (
                <optgroup label={`Search (${toolsByCategory.search.length})`}>
                  {toolsByCategory.search.map(t => (
                    <option key={t.name} value={t.name}>{t.mcpExposed ? '\u2713' : '\u25CB'} {t.name}</option>
                  ))}
                </optgroup>
              )}
              {toolsByCategory.retrieve.length > 0 && (
                <optgroup label={`Retrieve (${toolsByCategory.retrieve.length})`}>
                  {toolsByCategory.retrieve.map(t => (
                    <option key={t.name} value={t.name}>{t.mcpExposed ? '\u2713' : '\u25CB'} {t.name}</option>
                  ))}
                </optgroup>
              )}
              {toolsByCategory.skyspark.length > 0 && (
                <optgroup label={`SkySpark (${toolsByCategory.skyspark.length})`}>
                  {toolsByCategory.skyspark.map(t => (
                    <option key={t.name} value={t.name}>{t.mcpExposed ? '\u2713' : '\u25CB'} {t.name}</option>
                  ))}
                </optgroup>
              )}
              {toolsByCategory.execute.length > 0 && (
                <optgroup label={`Execute (${toolsByCategory.execute.length})`}>
                  {toolsByCategory.execute.map(t => (
                    <option key={t.name} value={t.name}>{t.mcpExposed ? '\u2713' : '\u25CB'} {t.name}</option>
                  ))}
                </optgroup>
              )}
              {toolsByCategory.graph.length > 0 && (
                <optgroup label={`Graph Analysis (${toolsByCategory.graph.length})`}>
                  {toolsByCategory.graph.map(t => (
                    <option key={t.name} value={t.name}>{t.mcpExposed ? '\u2713' : '\u25CB'} {t.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            {tool && (
              <div className="mt-2 flex items-center gap-2">
                <p className="text-sm text-gray-500">{tool.description}</p>
                {tool.mcpExposed ? (
                  <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    MCP
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                    Backend
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Parameters */}
          {tool && tool.params.length > 0 && (
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">Parameters</h2>
              <div className="space-y-4">
                {tool.params.map(param => (
                  <div key={param.name}>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      {param.name}
                      {param.required && <span className="ml-1 text-red-500">*</span>}
                    </label>
                    {/* Dynamic dropdown for patterns */}
                    {param.dynamicOptions === 'patterns' ? (
                      <select
                        value={params[param.name] || ''}
                        onChange={(e) => handleInputChange(param.name, e.target.value)}
                        className="w-full rounded-lg border border-gray-300 p-3 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        disabled={patternsLoading}
                      >
                        <option value="">
                          {patternsLoading ? 'Loading patterns...' : 'Select a pattern...'}
                        </option>
                        {patterns?.map((pattern) => (
                          <option key={pattern.id} value={pattern.id}>
                            {pattern.id} - {pattern.name}
                          </option>
                        ))}
                      </select>
                    ) : param.dynamicOptions === 'projectFunctions' ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={params[param.name] || ''}
                          onChange={(e) => handleInputChange(param.name, e.target.value)}
                          placeholder={functionsLoading ? 'Loading functions...' : 'Type to filter or select below...'}
                          className="w-full rounded-lg border border-gray-300 p-3 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        {projectFunctions && projectFunctions.length > 0 && (
                          <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50">
                            {projectFunctions
                              .filter(f => !params[param.name] || f.name.toLowerCase().includes((params[param.name] || '').toLowerCase()))
                              .slice(0, 50)
                              .map((func) => (
                                <button
                                  key={func.name}
                                  type="button"
                                  onClick={() => handleExampleClick(param.name, func.name)}
                                  className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 border-b border-gray-100 last:border-0"
                                >
                                  <span className="font-medium text-gray-800">{func.name}</span>
                                  {func.doc && <span className="ml-2 text-xs text-gray-500">{func.doc.slice(0, 60)}...</span>}
                                </button>
                              ))}
                          </div>
                        )}
                        {functionsLoading && (
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            Loading functions from active project...
                          </div>
                        )}
                      </div>
                    ) : param.dynamicOptions === 'indexedFunctions' ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={params[param.name] || ''}
                          onChange={(e) => handleInputChange(param.name, e.target.value)}
                          placeholder="Type at least 2 characters to search..."
                          className="w-full rounded-lg border border-gray-300 p-3 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        {indexedLoading && (
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            Searching...
                          </div>
                        )}
                        {indexedFunctions && indexedFunctions.length > 0 && (
                          <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50">
                            {indexedFunctions.map((func) => (
                              <button
                                key={func.name}
                                type="button"
                                onClick={() => handleExampleClick(param.name, func.name)}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 border-b border-gray-100 last:border-0"
                              >
                                <span className="font-medium text-gray-800">{func.name}</span>
                                {func.description && <span className="ml-2 text-xs text-gray-500">{func.description.slice(0, 60)}...</span>}
                              </button>
                            ))}
                          </div>
                        )}
                        {searchQuery.length >= 2 && !indexedLoading && (!indexedFunctions || indexedFunctions.length === 0) && (
                          <p className="text-sm text-gray-500">No functions found matching "{searchQuery}"</p>
                        )}
                      </div>
                    ) : param.name === 'code' ? (
                      <textarea
                        value={params[param.name] || ''}
                        onChange={(e) => handleInputChange(param.name, e.target.value)}
                        placeholder={param.default !== undefined ? `Default: ${param.default}` : param.description}
                        className="w-full rounded-lg border border-gray-300 p-3 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        rows={4}
                      />
                    ) : (
                      <input
                        type={param.type === 'number' ? 'number' : 'text'}
                        value={params[param.name] || ''}
                        onChange={(e) => handleInputChange(param.name, e.target.value)}
                        placeholder={param.default !== undefined ? `Default: ${param.default}` : param.description}
                        className="w-full rounded-lg border border-gray-300 p-3 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    )}
                    <p className="mt-1 text-xs text-gray-400">{param.description}</p>
                    {/* Example buttons - only show if no dynamicOptions */}
                    {!param.dynamicOptions && param.examples && param.examples.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        <span className="text-xs text-gray-400">Examples:</span>
                        {param.examples.map((example, i) => (
                          <button
                            key={i}
                            onClick={() => handleExampleClick(param.name, example)}
                            className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 hover:bg-blue-100 hover:text-blue-700 transition-colors"
                          >
                            {example}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Execute Button */}
          <button
            onClick={handleExecute}
            disabled={isExecuteDisabled || isExecuting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isExecuting ? (
              <>
                <RefreshCw className="h-5 w-5 animate-spin" />
                Executing...
              </>
            ) : (
              <>
                <Play className="h-5 w-5" />
                Execute
              </>
            )}
          </button>
        </div>

        {/* Right Panel - Results */}
        <div className="rounded-xl bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Results</h2>
            {result && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-green-600" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy
                  </>
                )}
              </button>
            )}
          </div>
          <div className="max-h-[600px] overflow-auto p-6">
            {error ? (
              <div className="rounded-lg bg-red-50 p-4 text-red-700">
                <p className="font-medium">Error</p>
                <p className="text-sm">{error}</p>
              </div>
            ) : result ? (
              <pre
                className="whitespace-pre-wrap font-mono text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: syntaxHighlight(result) }}
              />
            ) : (
              <p className="text-gray-400">Select a tool and execute to see results</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
