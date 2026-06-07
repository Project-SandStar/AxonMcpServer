# Axon MCP Server

The Axon MCP Server is a [Model Context Protocol](https://modelcontextprotocol.io/) server that provides AI assistants with access to Axon code examples, documentation, and live SkySpark connectivity for building automation, HVAC control, and energy management systems.

It indexes your Axon code library and HTML documentation, then exposes powerful search, retrieval, code generation, and execution tools that any MCP-compatible AI client can use.

---

## Tools Overview

The server exposes **25 MCP tools** organized into the following categories:

| Category | Count | Tools | Description |
|----------|-------|-------|-------------|
| **Search** | 8 | `searchAxonExamples`, `searchAxonOperatorExamples`, `searchAxonDocs`, `searchAxonRegex`, `findFunctionUsage`, `getFunctionExamples`, `getFunctionCallGraph`, `getFunctionUsageStats` | Full-text search across Axon code, documentation, operators, regex patterns, and function call relationships |
| **Retrieve** | 5 | `getAxonExample`, `getAxonPattern`, `listAxonPatterns`, `listAxonCategories`, `listAxonTemplates` | Retrieve specific examples, patterns, templates, and browse available categories |
| **SkySpark** | 5 | `listSkySparkProjects`, `switchSkySparkProject`, `discoverInstanceProjects`, `discoverProjectFunctions`, `queryHaystack` | Connect to SkySpark instances, discover projects, browse functions, and query Haystack data |
| **Execute** | 4 | `generateAxonCode`, `validateAxonCode`, `executeAxonCode`, `clearProjectCache` | Generate Axon from natural language, validate syntax and best practices, execute code on SkySpark, and manage caches |
| **Project** | 3 | `setPrimaryProject`, `getPrimaryProject`, `getProjectSchema`, `commitAxonFunction` | Set the active project context, browse project schema, and commit functions to SkySpark |

---

## Quick Start Examples

### Searching for Axon Code

Find functions related to energy calculation:

```
Tool: searchAxonExamples
Parameters: { "keyword": "energy consumption", "category": "energy" }
```

Search documentation with AI-ranked relevance:

```
Tool: searchAxonDocs
Parameters: { "keyword": "hisRead date range", "limit": 5 }
```

Find all places where `readAll` is called:

```
Tool: findFunctionUsage
Parameters: { "functionName": "readAll", "limit": 10 }
```

### Working with Patterns and Templates

List available energy patterns:

```
Tool: listAxonPatterns
Parameters: { "category": "energy" }
```

Get a specific pattern with full code:

```
Tool: getAxonPattern
Parameters: { "patternId": "energy-consumption-total" }
```

### Connecting to SkySpark

List all configured SkySpark instances and projects:

```
Tool: listSkySparkProjects
```

Set the active project for subsequent operations:

```
Tool: setPrimaryProject
Parameters: { "instanceName": "local", "projectName": "demo" }
```

Query Haystack data from the active project:

```
Tool: queryHaystack
Parameters: { "filter": "site", "limit": 10 }
```

Browse project points with pagination:

```
Tool: getProjectSchema
Parameters: { "entityType": "point", "filter": "sensor", "limit": 50 }
```

### Code Generation and Execution

Generate Axon code from a natural language description:

```
Tool: generateAxonCode
Parameters: { "intent": "Calculate total energy consumption for all AHUs this month" }
```

Validate code for syntax errors and best practices:

```
Tool: validateAxonCode
Parameters: { "code": "readAll(ahu).each(ahu => ...)" }
```

Execute Axon code against a live SkySpark instance:

```
Tool: executeAxonCode
Parameters: { "code": "readAll(site).size" }
```

Commit a function to the active SkySpark project:

```
Tool: commitAxonFunction
Parameters: {
  "name": "myCustomFunc",
  "src": "(site) => readAll(equip and siteRef==site->id)",
  "doc": "Get all equipment for a given site"
}
```

---

## Architecture

```
AI Client (Claude, Cursor, etc.)
    |
    |  MCP Protocol (stdio or HTTP)
    v
+----------------------------+
|     Axon MCP Server        |
|                            |
|  +--------+  +---------+  |
|  | Search  |  | Parser  |  |
|  | Engine  |  | Engine  |  |
|  +--------+  +---------+  |
|                            |
|  +--------+  +---------+  |
|  | Code   |  | SkySpark |  |
|  | Gen    |  | Client   |  |
|  +--------+  +---------+  |
+----------------------------+
    |               |
    v               v
 Axon Files     SkySpark
 & HTML Docs    Instances
```

### Data Flow

1. On startup, the server scans and indexes your `codePath` (Axon/Trio files) and `docsPath` (HTML documentation)
2. A FlexSearch index is built for documentation with Algolia-like relevance scoring (cached for fast subsequent loads)
3. Function usage relationships are tracked across the entire codebase
4. When an AI client calls a tool, the server searches its indexes or forwards requests to connected SkySpark instances
5. Results are returned in structured formats optimized for AI consumption

### Transport Modes

- **stdio** (default) -- The AI client spawns the server as a child process. Best for single-client setups like Claude Desktop or VS Code extensions.
- **HTTP** -- The server runs as a standalone HTTP service on a configurable port with OAuth 2.1 authentication. Supports multiple concurrent clients and provides a web dashboard.

---

## Configuration

The server is configured through `config/axonMcpServer-config.json` with the following key settings:

| Setting | Description |
|---------|-------------|
| `codePath` | Directory containing `.axon` and `.trio` files |
| `docsPath` | Directory containing HTML documentation |
| `server.port` | HTTP server port (default: 3847) |
| `skyspark.configDir` | Directory with SkySpark connection configs |
| `cache.enabled` | Enable/disable caching (default: true) |
| `search.maxResults` | Maximum search results returned (default: 10) |

See the [Installation Guide](installation.md) for full setup instructions.

---

## Supported Clients

The Axon MCP Server works with any MCP-compatible client, including:

- **Claude Code** (CLI) -- via stdio or HTTP transport
- **Claude Desktop** -- via stdio transport
- **VS Code** -- via the bundled Axon VS Code Extension, Cline, or Continue
- **Cursor** -- via stdio transport
- **Windsurf** -- via stdio transport
- **Any MCP-compatible client** -- via stdio or HTTP transport
