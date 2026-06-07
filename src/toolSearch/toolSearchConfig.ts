/**
 * Tool Search Configuration for Axon MCP Server
 *
 * This module provides metadata and categorization for all MCP tools
 * to support Anthropic's Tool Search Tool feature (defer_loading).
 *
 * When Claude connects via the MCP connector (mcp_servers parameter),
 * clients can use this configuration to determine which tools to
 * defer and which to keep immediately available.
 *
 * @see https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool
 */

export interface ToolMetadata {
  name: string;
  category: ToolCategory;
  description: string;
  keywords: string[];
  /** If true, this tool should NOT be deferred - always available */
  core: boolean;
  /** Estimated token cost of the tool definition */
  tokenCost: number;
  /** Usage frequency based on analytics: high, medium, low */
  usageFrequency: 'high' | 'medium' | 'low';
  /** Whether this tool requires SkySpark connection */
  requiresSkySpark: boolean;
}

export type ToolCategory =
  | 'search'
  | 'retrieval'
  | 'execution'
  | 'generation'
  | 'validation'
  | 'skyspark'
  | 'project'
  | 'utility';

/**
 * Complete metadata for all 27 MCP tools.
 *
 * Core tools (should NOT be deferred):
 * - searchAxonExamples: Primary search tool (18.9% of usage)
 * - searchAxonDocs: Documentation discovery
 * - getAxonExample: Direct code retrieval
 * - getPrimaryProject: Project context (required for most operations)
 * - executeAxonCode: Most used tool (64.9% of usage)
 */
export const TOOL_METADATA: ToolMetadata[] = [
  // === SEARCH TOOLS ===
  {
    name: 'searchAxonExamples',
    category: 'search',
    description: 'Search for Axon code examples by keyword, category, or tags',
    keywords: ['search', 'find', 'code', 'examples', 'functions', 'keyword', 'filter'],
    core: true,
    tokenCost: 400,
    usageFrequency: 'high',
    requiresSkySpark: false,
  },
  {
    name: 'searchAxonDocs',
    category: 'search',
    description: 'Search Axon documentation with AI-powered relevance ranking via FlexSearch',
    keywords: ['search', 'documentation', 'docs', 'help', 'reference', 'library', 'API'],
    core: true,
    tokenCost: 480,
    usageFrequency: 'high',
    requiresSkySpark: false,
  },
  {
    name: 'searchAxonOperatorExamples',
    category: 'search',
    description: 'Search for Axon code examples using specific operators (>=, ==, +, etc.)',
    keywords: ['operator', 'comparison', 'arithmetic', 'equals', 'greater', 'less', 'plus', 'minus'],
    core: false,
    tokenCost: 280,
    usageFrequency: 'low',
    requiresSkySpark: false,
  },
  {
    name: 'searchAxonRegex',
    category: 'search',
    description: 'Search Axon code using regular expressions with context',
    keywords: ['regex', 'pattern', 'regular expression', 'advanced search', 'grep'],
    core: false,
    tokenCost: 160,
    usageFrequency: 'low',
    requiresSkySpark: false,
  },
  {
    name: 'findFunctionUsage',
    category: 'search',
    description: 'Find all places where a specific function is called in the codebase',
    keywords: ['usage', 'calls', 'references', 'dependencies', 'where used'],
    core: false,
    tokenCost: 220,
    usageFrequency: 'medium',
    requiresSkySpark: false,
  },
  {
    name: 'getFunctionExamples',
    category: 'search',
    description: 'Get real-world examples of how a function is used',
    keywords: ['examples', 'usage', 'how to use', 'sample code', 'function'],
    core: false,
    tokenCost: 120,
    usageFrequency: 'medium',
    requiresSkySpark: false,
  },
  {
    name: 'getFunctionCallGraph',
    category: 'search',
    description: 'Show what functions call this function and what it calls',
    keywords: ['call graph', 'dependencies', 'callers', 'callees', 'relationships'],
    core: false,
    tokenCost: 100,
    usageFrequency: 'low',
    requiresSkySpark: false,
  },
  {
    name: 'getFunctionUsageStats',
    category: 'search',
    description: 'Get statistics about function usage in the codebase',
    keywords: ['statistics', 'stats', 'analytics', 'usage count', 'popularity'],
    core: false,
    tokenCost: 80,
    usageFrequency: 'low',
    requiresSkySpark: false,
  },

  // === RETRIEVAL TOOLS ===
  {
    name: 'getAxonExample',
    category: 'retrieval',
    description: 'Get a specific Axon example by function ID or name',
    keywords: ['get', 'fetch', 'retrieve', 'function', 'code', 'by name', 'by id'],
    core: true,
    tokenCost: 200,
    usageFrequency: 'medium',
    requiresSkySpark: false,
  },
  {
    name: 'getAxonPattern',
    category: 'retrieval',
    description: 'Get a common Axon pattern by ID or search keyword',
    keywords: ['pattern', 'template', 'common', 'idiom', 'best practice'],
    core: false,
    tokenCost: 180,
    usageFrequency: 'medium',
    requiresSkySpark: false,
  },
  {
    name: 'listAxonPatterns',
    category: 'retrieval',
    description: 'List all available Axon patterns or filter by category',
    keywords: ['patterns', 'list', 'browse', 'catalog', 'templates'],
    core: false,
    tokenCost: 520,
    usageFrequency: 'medium',
    requiresSkySpark: false,
  },
  {
    name: 'listAxonCategories',
    category: 'retrieval',
    description: 'List all available Axon code categories with counts',
    keywords: ['categories', 'list', 'browse', 'organize', 'classification'],
    core: false,
    tokenCost: 80,
    usageFrequency: 'low',
    requiresSkySpark: false,
  },
  {
    name: 'listAxonTemplates',
    category: 'retrieval',
    description: 'List available Axon code templates',
    keywords: ['templates', 'list', 'starters', 'boilerplate', 'scaffolding'],
    core: false,
    tokenCost: 180,
    usageFrequency: 'medium',
    requiresSkySpark: false,
  },

  // === EXECUTION TOOLS ===
  {
    name: 'executeAxonCode',
    category: 'execution',
    description: 'Execute Axon code in SkySpark (requires connection)',
    keywords: ['execute', 'run', 'eval', 'test', 'skyspark', 'live'],
    core: true,
    tokenCost: 240,
    usageFrequency: 'high',
    requiresSkySpark: true,
  },
  {
    name: 'queryHaystack',
    category: 'execution',
    description: 'Query Haystack data using filters (requires SkySpark)',
    keywords: ['query', 'haystack', 'filter', 'data', 'read', 'database'],
    core: false,
    tokenCost: 300,
    usageFrequency: 'medium',
    requiresSkySpark: true,
  },

  // === GENERATION TOOLS ===
  {
    name: 'generateAxonCode',
    category: 'generation',
    description: 'Generate Axon code from templates using natural language intent',
    keywords: ['generate', 'create', 'write', 'AI', 'code generation', 'intent'],
    core: false,
    tokenCost: 320,
    usageFrequency: 'high',
    requiresSkySpark: false,
  },
  {
    name: 'commitAxonFunction',
    category: 'generation',
    description: 'Commit an Axon function to the primary project with backup management',
    keywords: ['commit', 'save', 'deploy', 'push', 'backup', 'version'],
    core: false,
    tokenCost: 800,
    usageFrequency: 'high',
    requiresSkySpark: true,
  },

  // === VALIDATION TOOLS ===
  {
    name: 'validateAxonCode',
    category: 'validation',
    description: 'Validate Axon code with comprehensive analysis (semantic, best practices, performance)',
    keywords: ['validate', 'check', 'lint', 'analyze', 'errors', 'best practices'],
    core: false,
    tokenCost: 280,
    usageFrequency: 'high',
    requiresSkySpark: false,
  },
  {
    name: 'parseAxonAst',
    category: 'validation',
    description: 'Parse Axon code into Abstract Syntax Tree (AST) using SkySpark parseAst function',
    keywords: ['parse', 'AST', 'syntax tree', 'analyze', 'structure'],
    core: false,
    tokenCost: 240,
    usageFrequency: 'medium',
    requiresSkySpark: true,
  },

  // === SKYSPARK PROJECT TOOLS ===
  {
    name: 'listSkySparkProjects',
    category: 'skyspark',
    description: 'List all available SkySpark instances and projects',
    keywords: ['list', 'projects', 'instances', 'skyspark', 'browse', 'available'],
    core: false,
    tokenCost: 200,
    usageFrequency: 'high',
    requiresSkySpark: false,
  },
  {
    name: 'switchSkySparkProject',
    category: 'skyspark',
    description: 'Switch the active SkySpark project context for subsequent operations',
    keywords: ['switch', 'change', 'project', 'context', 'select', 'active'],
    core: false,
    tokenCost: 180,
    usageFrequency: 'high',
    requiresSkySpark: false,
  },
  {
    name: 'discoverInstanceProjects',
    category: 'skyspark',
    description: 'Discover all projects from a SkySpark instance and update config',
    keywords: ['discover', 'scan', 'find', 'projects', 'instance', 'auto'],
    core: false,
    tokenCost: 520,
    usageFrequency: 'low',
    requiresSkySpark: true,
  },
  {
    name: 'discoverProjectFunctions',
    category: 'skyspark',
    description: 'Discover all custom Axon functions in the current project',
    keywords: ['discover', 'functions', 'project', 'custom', 'scan', 'index'],
    core: false,
    tokenCost: 240,
    usageFrequency: 'medium',
    requiresSkySpark: true,
  },
  {
    name: 'getProjectSchema',
    category: 'skyspark',
    description: 'Browse project data with pagination (sites, equips, points, etc.)',
    keywords: ['schema', 'browse', 'data', 'sites', 'equips', 'points', 'entities'],
    core: false,
    tokenCost: 320,
    usageFrequency: 'high',
    requiresSkySpark: true,
  },

  // === PROJECT MANAGEMENT TOOLS ===
  {
    name: 'getPrimaryProject',
    category: 'project',
    description: 'Get the current primary project',
    keywords: ['get', 'current', 'active', 'primary', 'project', 'context'],
    core: true,
    tokenCost: 100,
    usageFrequency: 'high',
    requiresSkySpark: false,
  },
  {
    name: 'setPrimaryProject',
    category: 'project',
    description: 'Set the primary active project for execution and commits',
    keywords: ['set', 'primary', 'active', 'project', 'select', 'default'],
    core: false,
    tokenCost: 200,
    usageFrequency: 'high',
    requiresSkySpark: false,
  },

  // === UTILITY TOOLS ===
  {
    name: 'clearProjectCache',
    category: 'utility',
    description: 'Clear the project function cache files to force a rebuild',
    keywords: ['clear', 'cache', 'reset', 'rebuild', 'refresh', 'invalidate'],
    core: false,
    tokenCost: 200,
    usageFrequency: 'low',
    requiresSkySpark: false,
  },
];

/**
 * Get tools that should NOT be deferred (core tools).
 * These are loaded immediately when Claude connects.
 */
export function getCoreTools(): string[] {
  return TOOL_METADATA
    .filter(t => t.core)
    .map(t => t.name);
}

/**
 * Get tools that should be deferred (loaded on-demand via tool search).
 */
export function getDeferredTools(): string[] {
  return TOOL_METADATA
    .filter(t => !t.core)
    .map(t => t.name);
}

/**
 * Get tools by category.
 */
export function getToolsByCategory(category: ToolCategory): ToolMetadata[] {
  return TOOL_METADATA.filter(t => t.category === category);
}

/**
 * Get the total token cost of all tool definitions.
 */
export function getTotalTokenCost(): number {
  return TOOL_METADATA.reduce((sum, t) => sum + t.tokenCost, 0);
}

/**
 * Get token cost savings from using defer_loading.
 * Returns the cost of deferred tools that won't be loaded initially.
 */
export function getDeferredTokenSavings(): number {
  const coreTokens = TOOL_METADATA
    .filter(t => t.core)
    .reduce((sum, t) => sum + t.tokenCost, 0);
  const totalTokens = getTotalTokenCost();
  return totalTokens - coreTokens;
}

/**
 * Search tools by keyword (for custom tool search implementations).
 * Uses simple BM25-style scoring.
 */
export function searchTools(query: string, limit: number = 5): ToolMetadata[] {
  const queryTerms = query.toLowerCase().split(/\s+/);

  const scored = TOOL_METADATA.map(tool => {
    let score = 0;
    const searchText = [
      tool.name,
      tool.description,
      ...tool.keywords,
      tool.category,
    ].join(' ').toLowerCase();

    for (const term of queryTerms) {
      // Exact match in name
      if (tool.name.toLowerCase().includes(term)) {
        score += 10;
      }
      // Match in keywords
      if (tool.keywords.some(k => k.toLowerCase().includes(term))) {
        score += 5;
      }
      // Match in description
      if (tool.description.toLowerCase().includes(term)) {
        score += 3;
      }
      // Match in category
      if (tool.category.toLowerCase().includes(term)) {
        score += 2;
      }
    }

    // Boost core tools slightly
    if (tool.core) {
      score += 1;
    }

    return { tool, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.tool);
}

/**
 * Search tools by regex pattern (for custom tool search implementations).
 * Compatible with Anthropic's tool_search_tool_regex variant.
 */
export function searchToolsByRegex(pattern: string, limit: number = 5): ToolMetadata[] {
  try {
    const regex = new RegExp(pattern, 'i');

    return TOOL_METADATA
      .filter(tool => {
        const searchText = [
          tool.name,
          tool.description,
          ...tool.keywords,
        ].join(' ');
        return regex.test(searchText);
      })
      .slice(0, limit);
  } catch {
    // Invalid regex pattern
    return [];
  }
}

/**
 * Generate mcp_toolset configuration for Anthropic's MCP connector.
 * This is the format used with the mcp_servers parameter in Claude API.
 */
export function generateMcpToolsetConfig(serverName: string = 'axon-mcp'): object {
  const coreTools = getCoreTools();
  const configs: Record<string, { defer_loading: boolean }> = {};

  // Set core tools to NOT be deferred
  for (const toolName of coreTools) {
    configs[toolName] = { defer_loading: false };
  }

  return {
    type: 'mcp_toolset',
    mcp_server_name: serverName,
    default_config: {
      defer_loading: true,
    },
    configs,
  };
}

/**
 * Get tool search statistics.
 */
export function getToolSearchStats(): {
  totalTools: number;
  coreTools: number;
  deferredTools: number;
  totalTokenCost: number;
  coreTokenCost: number;
  tokenSavings: number;
  savingsPercent: number;
  byCategory: Record<ToolCategory, number>;
  byUsageFrequency: Record<string, number>;
} {
  const coreTools = TOOL_METADATA.filter(t => t.core);
  const totalTokenCost = getTotalTokenCost();
  const coreTokenCost = coreTools.reduce((sum, t) => sum + t.tokenCost, 0);

  const byCategory: Record<string, number> = {};
  const byUsageFrequency: Record<string, number> = {};

  for (const tool of TOOL_METADATA) {
    byCategory[tool.category] = (byCategory[tool.category] || 0) + 1;
    byUsageFrequency[tool.usageFrequency] = (byUsageFrequency[tool.usageFrequency] || 0) + 1;
  }

  return {
    totalTools: TOOL_METADATA.length,
    coreTools: coreTools.length,
    deferredTools: TOOL_METADATA.length - coreTools.length,
    totalTokenCost,
    coreTokenCost,
    tokenSavings: totalTokenCost - coreTokenCost,
    savingsPercent: Math.round(((totalTokenCost - coreTokenCost) / totalTokenCost) * 100),
    byCategory: byCategory as Record<ToolCategory, number>,
    byUsageFrequency,
  };
}
