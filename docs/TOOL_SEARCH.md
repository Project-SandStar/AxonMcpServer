# Tool Search Integration for Axon MCP Server

This document explains how to use Anthropic's **Tool Search Tool** feature with the Axon MCP Server to improve context efficiency and tool selection accuracy.

## Overview

The Axon MCP Server exposes **27 MCP tools** for searching Axon code, documentation, executing code, and managing SkySpark projects. At this scale, Claude's tool selection accuracy begins to degrade (typically after 20-30 tools), and tool definitions consume significant context tokens (~3,200 tokens).

Anthropic's Tool Search Tool solves this by:
- **Deferring tool loading**: Only load tools when Claude needs them
- **Dynamic discovery**: Claude searches for relevant tools on-demand
- **Token savings**: ~56% reduction in tool definition overhead

## Quick Start

### Using Claude's MCP Connector

When connecting Claude directly to your Axon MCP Server via the API's `mcp_servers` parameter:

```python
import anthropic

client = anthropic.Anthropic()

response = client.beta.messages.create(
    model="claude-sonnet-4-5",
    betas=["advanced-tool-use-2025-11-20", "mcp-client-2025-11-20"],
    max_tokens=2048,
    mcp_servers=[
        {
            "type": "url",
            "url": "https://your-axon-server.com/mcp",
            "name": "axon-mcp",
            "authorization_token": "YOUR_OAUTH_TOKEN"
        }
    ],
    tools=[
        # Tool search tool - enables dynamic tool discovery
        {
            "type": "tool_search_tool_bm25_20251119",
            "name": "tool_search_tool_bm25"
        },
        # Configure which Axon tools to defer
        {
            "type": "mcp_toolset",
            "mcp_server_name": "axon-mcp",
            "default_config": {
                "defer_loading": True
            },
            "configs": {
                # Core tools - always available (NOT deferred)
                "searchAxonExamples": {"defer_loading": False},
                "searchAxonDocs": {"defer_loading": False},
                "getAxonExample": {"defer_loading": False},
                "getPrimaryProject": {"defer_loading": False},
                "executeAxonCode": {"defer_loading": False}
            }
        }
    ],
    messages=[
        {
            "role": "user",
            "content": "Find examples of HVAC control using dateTime functions"
        }
    ]
)
```

### Required Beta Headers

| Header | Value |
|--------|-------|
| `anthropic-beta` | `advanced-tool-use-2025-11-20,mcp-client-2025-11-20` |

## Tool Categories

The 27 Axon MCP tools are organized into categories:

| Category | Tools | Description |
|----------|-------|-------------|
| **Search** | 8 | Code and documentation search |
| **Retrieval** | 5 | Direct lookups by ID/name |
| **Execution** | 2 | Run code in SkySpark |
| **Generation** | 2 | AI code generation |
| **Validation** | 2 | Code validation and AST parsing |
| **SkySpark** | 5 | Instance/project management |
| **Project** | 2 | Primary project context |
| **Utility** | 1 | Cache management |

## Core vs. Deferred Tools

### Core Tools (Always Available)

These tools should **NOT** be deferred - they are used most frequently:

| Tool | Usage | Why Core |
|------|-------|----------|
| `searchAxonExamples` | 18.9% | Primary search operation |
| `searchAxonDocs` | High | Documentation discovery |
| `getAxonExample` | Medium | Direct code retrieval |
| `getPrimaryProject` | High | Required for context |
| `executeAxonCode` | 64.9% | Most used tool |

### Deferred Tools (Loaded On-Demand)

All other tools should be deferred - they are specialized:

- `searchAxonOperatorExamples` - Operator-specific search
- `searchAxonRegex` - Advanced regex search
- `findFunctionUsage` - Dependency analysis
- `getFunctionCallGraph` - Call graph visualization
- `listSkySparkProjects` - Project browsing
- `validateAxonCode` - Code validation
- `generateAxonCode` - AI generation
- `commitAxonFunction` - Deploy code
- ... and 14 more

## API Endpoints

The Axon MCP Server exposes admin endpoints for tool search configuration:

### Get Recommended Configuration

```bash
curl -u admin:admin https://your-server.com/admin/tool-search/config
```

Returns ready-to-use `mcp_toolset` configuration.

### Get Tool Statistics

```bash
curl -u admin:admin https://your-server.com/admin/tool-search/stats
```

Returns token savings and recommendations:

```json
{
  "totalTools": 27,
  "coreTools": 5,
  "deferredTools": 22,
  "totalTokenCost": 6920,
  "coreTokenCost": 1420,
  "tokenSavings": 5500,
  "savingsPercent": 79
}
```

### Search Tools (Custom Implementation)

For custom tool search implementations, use these endpoints:

```bash
# BM25-style natural language search
curl -u admin:admin "https://your-server.com/admin/tool-search/search?q=validate code"

# Regex pattern search
curl -u admin:admin "https://your-server.com/admin/tool-search/search?regex=skyspark|project"
```

Response includes `tool_reference` blocks compatible with Claude's tool search:

```json
{
  "searchType": "bm25",
  "query": "validate code",
  "count": 2,
  "results": [...],
  "toolReferences": [
    {"type": "tool_reference", "tool_name": "validateAxonCode"},
    {"type": "tool_reference", "tool_name": "parseAxonAst"}
  ]
}
```

### List All Tools

```bash
curl -u admin:admin https://your-server.com/admin/tool-search
```

### List by Category

```bash
curl -u admin:admin https://your-server.com/admin/tool-search/category/search
```

Valid categories: `search`, `retrieval`, `execution`, `generation`, `validation`, `skyspark`, `project`, `utility`

## Tool Search Variants

Anthropic provides two tool search variants:

### BM25 (Recommended)

Uses natural language queries for semantic matching.

```json
{
  "type": "tool_search_tool_bm25_20251119",
  "name": "tool_search_tool_bm25"
}
```

Claude searches with queries like: `"find code examples"`, `"validate syntax"`, `"SkySpark project functions"`

### Regex

Uses regex patterns for precise matching.

```json
{
  "type": "tool_search_tool_regex_20251119",
  "name": "tool_search_tool_regex"
}
```

Claude searches with patterns like: `".*search.*"`, `"skyspark|project"`, `"(?i)validate"`

## How Tool Discovery Works

1. **Initial context**: Claude sees only 5 core tools + tool search tool (~1,420 tokens)

2. **User asks about SkySpark**: Claude searches for relevant tools
   ```json
   {"name": "tool_search_tool_bm25", "input": {"query": "skyspark project functions"}}
   ```

3. **API returns tool references**:
   ```json
   {
     "tool_references": [
       {"type": "tool_reference", "tool_name": "listSkySparkProjects"},
       {"type": "tool_reference", "tool_name": "discoverProjectFunctions"}
     ]
   }
   ```

4. **Automatic expansion**: The API expands references into full tool definitions

5. **Tool invocation**: Claude can now call the discovered tools

## Benefits for Axon MCP Server

| Metric | Without Tool Search | With Tool Search |
|--------|---------------------|------------------|
| Tool tokens | ~6,920 | ~1,420 |
| Savings | - | 79% |
| Tool count visible | 27 | 5 core + on-demand |
| Selection accuracy | Degraded at 27 tools | Maintained |

## Configuration Files

The tool search configuration is defined in:

```
src/toolSearch/toolSearchConfig.ts
```

This file contains:
- Tool metadata (name, category, keywords, token cost)
- Core vs. deferred classification
- Search functions (BM25 and regex)
- mcp_toolset configuration generator

## Limitations

- **HTTPS required**: MCP connector requires publicly accessible HTTPS endpoint
- **Model support**: Only Claude Sonnet 4.0+ and Opus 4.0+ (no Haiku)
- **Beta feature**: Requires beta headers
- **Not on Bedrock/Vertex**: MCP connector not yet available

## Further Reading

- [Anthropic Tool Search Documentation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)
- [MCP Connector Documentation](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)
- [Advanced Tool Use Blog Post](https://www.anthropic.com/engineering/advanced-tool-use)
