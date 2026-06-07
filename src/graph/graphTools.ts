/**
 * Graph Analysis MCP Tools - Schema definitions for Axon code graph intelligence
 *
 * These tools provide:
 * - Call graph navigation (callers, callees)
 * - Impact analysis (blast radius of changes)
 * - Path finding between code elements
 * - Graph algorithms (PageRank, centrality, SCCs)
 * - Visualization export (DOT, JSON, D3, Cytoscape)
 * - DSL-based graph queries
 */

// ============================================
// Tool Schema Types
// ============================================

export interface McpToolSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description?: string;
    enum?: string[];
    items?: { type: string; enum?: string[] };
    default?: unknown;
  }>;
  required?: string[];
}

export interface GraphTool {
  name: string;
  description: string;
  category: string;
  inputSchema: McpToolSchema;
}

// ============================================
// Graph Analysis Tool Definitions
// ============================================

export const GRAPH_TOOLS: GraphTool[] = [
  {
    name: 'getCallers',
    description: 'Find all Axon functions that call a given function - "who calls this?". ' +
      'Use this to trace upstream dependencies, find usages before refactoring, ' +
      'or understand how a function is being used across the codebase. ' +
      'Returns caller names, file locations, and call depths.',
    category: 'graph-analysis',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: 'Code node ID (UUID) of the function to find callers for'
        },
        qualifiedName: {
          type: 'string',
          description: 'Function name like "myFunc" or qualified name like "file::myFunc"'
        },
        maxDepth: {
          type: 'number',
          description: 'How many levels of indirect callers to include (1=direct only, 5=default)',
          default: 5
        },
        projectId: {
          type: 'number',
          description: 'Restrict results to a specific project ID'
        }
      },
      required: []
    }
  },
  {
    name: 'getCallees',
    description: 'Find all functions called by a given Axon function - "what does this call?". ' +
      'Use this to understand dependencies, trace execution flow downstream, ' +
      'or analyze what a function relies on. Returns called function names, locations, and depths.',
    category: 'graph-analysis',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: 'Code node ID (UUID) of the function to find callees for'
        },
        qualifiedName: {
          type: 'string',
          description: 'Function name or qualified name'
        },
        maxDepth: {
          type: 'number',
          description: 'How many levels of indirect callees to include (1=direct only, 5=default)',
          default: 5
        }
      },
      required: []
    }
  },
  {
    name: 'getCodeImpact',
    description: 'Analyze the blast radius / impact of changing an Axon function. ' +
      'Shows all code that could be affected by changes - essential for refactoring risk assessment. ' +
      'Use before making changes to critical code to understand consequences. ' +
      'Returns affected nodes grouped by relationship type.',
    category: 'graph-analysis',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: 'Code node ID (UUID) of the function to analyze impact for'
        },
        qualifiedName: {
          type: 'string',
          description: 'Function name to analyze'
        },
        maxDepth: {
          type: 'number',
          description: 'How far to trace impact (10=default, higher finds more indirect effects)',
          default: 10
        }
      },
      required: []
    }
  },
  {
    name: 'findCodePath',
    description: 'Find how two Axon functions are connected - the call chain between them. ' +
      'Use to trace execution paths, debug call flows, or understand code relationships. ' +
      'Returns the shortest path showing each function and edge type along the way.',
    category: 'graph-analysis',
    inputSchema: {
      type: 'object',
      properties: {
        fromNodeId: {
          type: 'string',
          description: 'Starting function node ID (UUID)'
        },
        fromQualifiedName: {
          type: 'string',
          description: 'Starting function name'
        },
        toNodeId: {
          type: 'string',
          description: 'Target function node ID (UUID)'
        },
        toQualifiedName: {
          type: 'string',
          description: 'Target function name'
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum path length to search (10=default)',
          default: 10
        }
      },
      required: []
    }
  },
  {
    name: 'getGraphMetrics',
    description: 'Get code metrics for an Axon function: incoming/outgoing call counts, complexity indicators. ' +
      'Use to identify important or problematic code. High caller count = critical code. High callee count = complex code.',
    category: 'graph-analysis',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: 'Code node ID (UUID) to get metrics for'
        },
        qualifiedName: {
          type: 'string',
          description: 'Function name to get metrics for'
        }
      },
      required: []
    }
  },
  {
    name: 'getMostCalledFunctions',
    description: 'Find the most frequently called Axon functions in a project - identify critical/central code paths. ' +
      'These are the functions most likely to cause widespread issues if broken.',
    category: 'graph-analysis',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'number',
          description: 'Project ID to analyze for most-called functions'
        },
        limit: {
          type: 'number',
          description: 'How many top functions to return (10=default)',
          default: 10
        }
      },
      required: ['projectId']
    }
  },
  {
    name: 'getMostComplexFunctions',
    description: 'Find Axon functions with the most dependencies (outgoing calls) - identify high-complexity/high-coupling code. ' +
      'These are refactoring candidates or functions that need careful testing.',
    category: 'graph-analysis',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'number',
          description: 'Project ID to analyze for complex functions'
        },
        limit: {
          type: 'number',
          description: 'How many top functions to return (10=default)',
          default: 10
        }
      },
      required: ['projectId']
    }
  },
  {
    name: 'buildProjectGraph',
    description: 'Build or rebuild the code graph index for an Axon project. ' +
      'Parses source code to extract functions, defcomps, calls, and relationships. ' +
      'Run this after code changes or for initial setup. ' +
      'Must be run before using graph analysis tools like getCallers, getCallees, getCodeImpact.',
    category: 'graph-management',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'number',
          description: 'Project ID to build/rebuild graph for'
        }
      },
      required: ['projectId']
    }
  },
  {
    name: 'getGraphStats',
    description: 'Get code graph statistics: node count (functions/defcomps), edge count (calls/contains). ' +
      'Use to check indexing status or understand project size.',
    category: 'graph-management',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'number',
          description: 'Specific project ID, or omit for all projects'
        }
      },
      required: []
    }
  },
  {
    name: 'detectCycles',
    description: 'Detect circular dependencies in the Axon codebase - find cyclic call chains where A calls B calls C calls A. ' +
      'Use this to identify architectural issues, tightly coupled code, or potential infinite loops.',
    category: 'graph-analysis',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'number',
          description: 'Project ID to analyze for circular dependencies'
        },
        maxCycles: {
          type: 'number',
          description: 'Maximum number of cycles to detect (10=default)',
          default: 10
        }
      },
      required: ['projectId']
    }
  },
  {
    name: 'queryGraph',
    description: 'Execute a graph query using the DSL (Domain-Specific Language). ' +
      'Examples: ' +
      '"MATCH function WHERE name LIKE handle* CALLERS depth=3" - find callers of functions starting with handle. ' +
      '"PATH FROM myFunc TO cleanup" - find call path between two functions. ' +
      '"COUNT function WHERE filePath CONTAINS /lib/" - count functions in lib directory.',
    category: 'graph-query',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'DSL query string. Syntax: MATCH [type] WHERE <conditions> [TRAVERSAL]. ' +
            'Conditions: field = "value", field LIKE "pattern*", field CONTAINS "text". ' +
            'Traversals: CALLERS, CALLEES with optional depth=N.'
        },
        projectId: {
          type: 'number',
          description: 'Optional project ID to restrict query scope'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'findConstrainedPath',
    description: 'Find paths between Axon functions with constraints - filter by edge types, avoid certain nodes, or require passing through specific nodes.',
    category: 'graph-query',
    inputSchema: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          description: 'Starting node qualified name or ID'
        },
        to: {
          type: 'string',
          description: 'Target node qualified name or ID'
        },
        edgeTypes: {
          type: 'array',
          description: 'Edge types to follow',
          items: { type: 'string', enum: ['calls', 'contains'] }
        },
        mustPass: {
          type: 'array',
          description: 'Node names that the path must pass through',
          items: { type: 'string' }
        },
        mustAvoid: {
          type: 'array',
          description: 'Node names that the path must avoid',
          items: { type: 'string' }
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum path length (15=default)',
          default: 15
        }
      },
      required: ['from', 'to']
    }
  },
  {
    name: 'getStronglyConnectedComponents',
    description: 'Find strongly connected components (SCCs) in the Axon call graph - groups of mutually recursive functions.',
    category: 'graph-algorithms',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'number',
          description: 'Project ID to analyze'
        },
        minSize: {
          type: 'number',
          description: 'Minimum component size to return (2=default)',
          default: 2
        }
      },
      required: ['projectId']
    }
  },
  {
    name: 'getPageRank',
    description: 'Compute PageRank scores for Axon functions - identifies the most "important" functions based on call patterns.',
    category: 'graph-algorithms',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'number',
          description: 'Project ID to analyze'
        },
        iterations: {
          type: 'number',
          description: 'Number of PageRank iterations (20=default)',
          default: 20
        },
        limit: {
          type: 'number',
          description: 'Number of top results to return (20=default)',
          default: 20
        }
      },
      required: ['projectId']
    }
  },
  {
    name: 'getBetweennessCentrality',
    description: 'Find Axon functions with high betweenness centrality - bottleneck or bridge functions that connect different parts of the codebase.',
    category: 'graph-algorithms',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'number',
          description: 'Project ID to analyze'
        },
        limit: {
          type: 'number',
          description: 'Number of top results to return (20=default)',
          default: 20
        }
      },
      required: ['projectId']
    }
  },
  {
    name: 'exportGraphVisualization',
    description: 'Export a subgraph as DOT (GraphViz), JSON, D3.js, or Cytoscape format for visualization. ' +
      'Generate visual representations of call graphs, impact graphs, or project structure.',
    category: 'graph-visualization',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: 'Code node ID (UUID) as focal point for the subgraph'
        },
        qualifiedName: {
          type: 'string',
          description: 'Function name as focal point (alternative to nodeId)'
        },
        projectId: {
          type: 'number',
          description: 'Project ID to export full project graph (if nodeId not specified)'
        },
        graphType: {
          type: 'string',
          description: 'Type of subgraph to export',
          enum: ['subgraph', 'callers', 'callees', 'impact', 'project']
        },
        format: {
          type: 'string',
          description: 'Export format',
          enum: ['dot', 'json', 'd3', 'cytoscape']
        },
        depth: {
          type: 'number',
          description: 'Traversal depth from focal node (3=default)',
          default: 3
        },
        maxNodes: {
          type: 'number',
          description: 'Maximum nodes to include (100=default)',
          default: 100
        },
        layout: {
          type: 'string',
          description: 'Layout hint for DOT format',
          enum: ['hierarchical', 'force', 'radial', 'circular']
        },
        title: {
          type: 'string',
          description: 'Custom title for the graph'
        }
      },
      required: []
    }
  },
  {
    name: 'semanticCodeSearch',
    description: 'Search Axon code using natural language - find functions by describing what they do. ' +
      'Uses AI embeddings for semantic similarity, not just keyword matching. ' +
      'Example queries: "energy calculation", "temperature setpoint", "schedule override".',
    category: 'semantic-search',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Describe what you\'re looking for in plain English'
        },
        projectId: {
          type: 'number',
          description: 'Restrict search to a specific project ID'
        },
        nodeType: {
          type: 'string',
          description: 'Filter results by code element type',
          enum: ['function', 'defcomp', 'variable']
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (10=default)',
          default: 10
        },
        includeGraphContext: {
          type: 'boolean',
          description: 'Include caller/callee counts in results for context',
          default: true
        }
      },
      required: ['query']
    }
  },
  {
    name: 'findSimilarCode',
    description: 'Find Axon functions similar to a given one - detect duplicates, related implementations, or code patterns.',
    category: 'semantic-search',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: 'Code node ID (UUID) of the reference function'
        },
        qualifiedName: {
          type: 'string',
          description: 'Function name to find similar code for'
        },
        projectId: {
          type: 'number',
          description: 'Restrict to a specific project ID'
        },
        limit: {
          type: 'number',
          description: 'Number of similar functions to return (5=default)',
          default: 5
        }
      },
      required: []
    }
  },
  {
    name: 'buildProjectEmbeddings',
    description: 'Generate AI embeddings for semantic Axon code search. ' +
      'Creates vector representations of all functions for natural language search and similarity detection.',
    category: 'graph-management',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'number',
          description: 'Project ID to generate embeddings for'
        }
      },
      required: ['projectId']
    }
  }
];

/**
 * Get all graph tool definitions for MCP registration
 */
export function getGraphToolDefinitions(): GraphTool[] {
  return GRAPH_TOOLS;
}

/**
 * Check if a tool name is a graph tool
 */
export function isGraphTool(toolName: string): boolean {
  return GRAPH_TOOLS.some(t => t.name === toolName);
}

/**
 * Get a specific graph tool by name
 */
export function getGraphTool(toolName: string): GraphTool | undefined {
  return GRAPH_TOOLS.find(t => t.name === toolName);
}
