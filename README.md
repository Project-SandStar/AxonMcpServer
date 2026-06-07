# Axon MCP Server

An MCP (Model Context Protocol) server that provides access to a comprehensive library of Axon code examples for building automation, HVAC control, and energy management systems.

## Overview

This MCP server indexes and serves Axon code examples from the axon-library repository, making it easy for AI assistants and other tools to discover and use Axon patterns for:

- HVAC control sequences
- Energy monitoring and analysis
- Meter data processing
- Fault detection (Sparks)
- Building automation reports
- Data visualization
- Administrative tasks

The project has three parts:

1. **MCP Server** (this repo root) — indexes Axon code/docs and exposes 25+ search, execution, SkySpark, and **workflow-discovery** tools (see [Workflows](#workflows)).
2. **VSCode Extension** ([`vscode-extension/`](./vscode-extension)) — an IDE companion UI for project selection, search, and dashboard access (see [VSCode Extension](#vscode-extension)).
3. **Dashboard** ([`dashboard/`](./dashboard)) — a Next.js admin UI served at `/dashboard` in HTTP mode.

## Installation

```bash
# Clone this repository
git clone [repository-url]
cd axon-mcp-server

# Install dependencies
npm install

# Build the TypeScript code
npm run build
```

## Configuration

The server can be configured to specify where your Axon code and documentation are located.

### Configuration Options

1. **Using a configuration file:**
   ```bash
   cp axon-config.example.json axon-config.json
   # Edit axon-config.json with your paths
   ```

2. **Configuration file format:**
   ```json
   {
     "codePath": "/path/to/axon/code",
     "docsPath": "/path/to/axon/docs",
     "filePatterns": {
       "code": ["**/*.axon", "**/*.trio"],
       "docs": ["**/*.html", "**/*.md"]
     },
     "excludeDirs": ["node_modules", ".git"],
     "cache": {
       "enabled": true,
       "maxAge": 86400000,
       "directory": ".cache"
     }
   }
   ```

### Path Configuration

- **`codePath`**: Directory containing your Axon source files (`.axon`, `.trio`)
- **`docsPath`**: Directory containing documentation (HTML, Markdown) with Axon examples
- **`filePatterns`**: Glob patterns for finding files
  - `code`: Patterns for Axon source files
  - `docs`: Patterns for documentation files
- **`excludeDirs`**: Directories to skip during scanning

## Usage

### Running the Server

```bash
# Development mode (with TypeScript)
npm run dev

# Production mode (compiled JavaScript)
npm start
```

### Available Tools

The MCP server provides eleven main tools:

#### 1. `searchAxonExamples`

Search for Axon code from actual .axon source files (excludes documentation examples).

**Parameters:**
- `keyword` (string, optional): Search term to find in function names, descriptions, and code
- `category` (string, optional): Filter by category (hvac, energy, meter, reporting, etc.)
- `tags` (array, optional): Filter by tags
- `limit` (number, optional): Maximum results to return (default: 10)

**Example:**
```json
{
  "keyword": "meter",
  "category": "energy",
  "limit": 5
}
```

**Searching for Operators:**
This tool now supports searching for operators (like `>=`, `==`, `+`). When searching for a recognized operator, it performs a direct text search:
```json
{
  "keyword": ">=",
  "limit": 10
}
```
See [OPERATORS.md](OPERATORS.md) for detailed operator search guidance.

#### 2. `searchAxonOperatorExamples`

Search specifically for operator usage in Axon code with proper tokenization and indexing.

**Parameters:**
- `operator` (string, optional): Single operator to search for (e.g., ">=" , "==", "+")
- `operators` (array, optional): Multiple operators (finds functions using ALL specified operators)
- `category` (string, optional): Filter by category (hvac, energy, meter, etc.)
- `limit` (number, optional): Maximum results to return (default: 10)

**Example (single operator):**
```json
{
  "operator": ">=",
  "category": "hvac",
  "limit": 5
}
```

**Example (multiple operators):**
```json
{
  "operators": [">=", "<="],
  "limit": 10
}
```

#### 3. `searchAxonDocs` ⭐ **Enhanced with FlexSearch**

Search Axon documentation with **AI-powered relevance ranking**. Uses FlexSearch to provide Algolia-quality search across 4,000+ HTML documentation files with intelligent scoring, section matching, and context highlighting.

**Features:**
- 🎯 **Relevance Scoring** - Results ranked 0-100 based on match quality
- 📚 **Library Filtering** - Search within specific libraries (lib-task, lib-energy, etc.)
- 📝 **Section Matching** - Returns relevant sections with surrounding context
- 💡 **Code Examples** - Includes code snippets from matched sections
- ⚡ **Lightning Fast** - Cached index loads in <1 second
- 🔍 **Smart Highlighting** - Shows matching text excerpts

**Parameters:**
- `keyword` (string, required): Search query (e.g., "task", "hisRead", "energy calculation")
- `library` (string, optional): Filter by library name (e.g., "lib-task", "lib-energy", "lib-his")
- `includeContent` (boolean, optional): Include full section content or summaries (default: true)
- `maxSections` (number, optional): Maximum sections per document (default: 3)
- `limit` (number, optional): Maximum documents to return (default: 10)

**Example 1 - Basic search:**
```json
{
  "keyword": "task"
}
```

**Example 2 - Library-specific search:**
```json
{
  "keyword": "hisRead",
  "library": "lib-his",
  "limit": 5
}
```

**Example 3 - Detailed search:**
```json
{
  "keyword": "energy calculation",
  "library": "lib-energy",
  "includeContent": true,
  "maxSections": 3,
  "limit": 10
}
```

**Response Format:**
```json
{
  "count": 1,
  "query": "task",
  "library": "lib-task",
  "results": [
    {
      "title": "lib task",
      "library": "lib-task",
      "relevanceScore": 95,
      "url": "file:///path/to/docs/lib-task/doc.html",
      "matchedSections": [
        {
          "heading": "Overview",
          "content": "The task extension defines a framework...",
          "codeExamples": ["future: taskRun(ioReadCsv(`io/import.csv`))"]
        }
      ],
      "highlights": ["...task extension defines a framework..."]
    }
  ]
}
```

**Performance:**
- First run: ~30-60 seconds to index 4,187 HTML files
- Subsequent runs: <1 second (loads from cache)
- Search time: <50ms for most queries

#### 4. `listAxonCategories`

List all available categories with the count of functions in each.

**Parameters:** None

**Returns:** Categories with function counts

#### 5. `getAxonExample`

Retrieve a specific Axon function by ID or name.

**Parameters:**
- `identifier` (string, required): Function ID or name

**Example:**
```json
{
  "identifier": "meterOccUsage"
}
```

#### 6. `getAxonPattern`

Retrieve a curated Axon pattern by ID or search keyword.

**Parameters:**
- `patternId` (string, optional): Pattern ID (e.g., "energy-consumption-total")
- `keyword` (string, optional): Search keyword if `patternId` not provided

**Example:**
```json
{
  "patternId": "energy-consumption-total"
}
```

#### 7. `listAxonPatterns`

List all available patterns or filter by category prefix.

**Parameters:**
- `category` (string, optional): e.g., "energy", "hvac", "meter"

**Example:**
```json
{
  "category": "hvac"
}
```

#### 8. `findFunctionUsage`

Find all places where a specific function is called in the codebase.

**Note:** This tool searches for function calls only (e.g., `readAll()`, `commit()`), not operators (e.g., `>=`, `==`, `+`). To search for operator usage, use `searchAxonExamples` with the operator as a keyword.

**Parameters:**
- `functionName` (string, required): Name of the function to search for
- `includeContext` (boolean, optional): Include surrounding code context (default: true)
- `limit` (number, optional): Maximum results to return (default: 20)

**Example:**
```json
{
  "functionName": "commit",
  "limit": 10
}
```

**For operators, use searchAxonExamples instead:**
```json
{
  "tool": "searchAxonExamples",
  "arguments": {
    "keyword": ">=",
    "limit": 5
  }
}
```

#### 9. `getFunctionExamples`

Get real-world examples of how a function is used.

**Parameters:**
- `functionName` (string, required): Function name
- `maxExamples` (number, optional): Number of examples (default: 5)
- `sortBy` (string, optional): How to sort examples ("relevance", "complexity", "file")

**Example:**
```json
{
  "functionName": "hisRead",
  "maxExamples": 3
}
```

#### 10. `getFunctionCallGraph`

Show what functions call this function and what it calls.

**Parameters:**
- `functionName` (string, required): Function name
- `depth` (number, optional): How many levels deep to traverse (default: 1)

**Example:**
```json
{
  "functionName": "readAll",
  "depth": 2
}
```

#### 11. `getFunctionUsageStats`

Get statistics about function usage in the codebase.

**Parameters:** None

**Returns:** Statistics including:
- Total functions and usages
- Unused functions
- Most used functions
- Builtin vs user-defined function counts

#### 12. `searchAxonRegex`

Search Axon code using regular expressions with context lines.

**Parameters:**
- `pattern` (string, required): Regular expression pattern
- `contextLines` (number, optional): Number of context lines before/after match (default: 2)
- `format` (string, optional): Output format - "text" or "json" (default: "text")

**Example:**
```json
{
  "pattern": "if.*do",
  "contextLines": 3,
  "format": "text"
}
```

Returns matches with context in a grep-like format:
```
Found 3 results.

demo/ahuOutsideDamperStuckClosed.axon
│----
│  if (mixedTemp != null) do
│    tempPeriods: ahuTempDiff(outsideTemp, mixedTemp, dates)
│----
```

See [REGEX-SEARCH.md](REGEX-SEARCH.md) for detailed regex search examples.

### Integration with Claude Desktop

To use this MCP server with Claude Desktop, add the following to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "axon-code": {
      "command": "node",
      "args": ["/path/to/axon-mcp-server/dist/index.js"]
    }
  }
}
```

**With a custom config file:**
```json
{
  "mcpServers": {
    "axon-code": {
      "command": "node",
      "args": [
        "/path/to/axon-mcp-server/dist/index.js",
        "/path/to/axon-config.json"
      ]
    }
  }
}
```

## FlexSearch Documentation Index

The MCP server uses **FlexSearch** to provide Algolia-quality search across your HTML documentation files. This gives you:

- **⚡ Fast Search**: Sub-50ms search times for most queries
- **🎯 Relevance Ranking**: Smart scoring algorithm ranks results 0-100
- **📚 Library Filtering**: Search within specific libraries (lib-task, lib-energy, etc.)
- **💡 Context Awareness**: Returns relevant sections with code examples
- **💾 Efficient Caching**: First run indexes ~4,000 files in 30-60s, subsequent runs load in <1s

### How It Works

1. **Initial Indexing** (First Run)
   - Scans all HTML files in your `docsPath`
   - Extracts titles, sections, paragraphs, and code examples
   - Builds optimized FlexSearch index with multi-field boosting
   - Saves to `.cache/flexsearch-docs.json` for instant loading

2. **Subsequent Runs**
   - Loads pre-built index from cache in <1 second
   - Validates cache freshness (24-hour TTL by default)
   - Rebuilds automatically if documentation changes

3. **Search Process**
   - Queries across multiple fields: title (10x boost), library (5x), fullText (1x)
   - Applies contextual scoring with bidirectional analysis
   - Returns top results with matched sections and highlights

### Performance Metrics

| Metric | Value |
|--------|-------|
| Documents Indexed | 4,187 HTML files |
| Index Size | ~15-25 MB (compressed) |
| Initial Build Time | 30-60 seconds |
| Cache Load Time | <1 second |
| Search Time | <50ms (avg) |
| Memory Usage | ~50-100 MB |

### Cache Management

The FlexSearch index is automatically cached in `.cache/flexsearch-docs.json`:

```bash
# Clear documentation cache
rm -f .cache/flexsearch-docs.json .cache/flexsearch-metadata.json

# Clear all caches
npm run cache:clear:all
```

Cache is invalidated when:
- Documentation path changes
- Cache is older than 24 hours (configurable)
- Cache version mismatches

### Troubleshooting

**Slow initial indexing?**
- Normal for 4,000+ files on first run
- Subsequent runs use cache (<1s)
- Disable with `"cache": { "enabled": false }` in config

**Search returns no results?**
- Check that `docsPath` is configured correctly
- Verify HTML files exist in the docs directory
- Try broader search terms (e.g., "task" instead of "taskRun")

**Out of memory errors?**
- Reduce number of indexed files with `excludeDirs` in config
- Increase Node.js memory: `node --max-old-space-size=4096 dist/index.js`

## Function Usage Tracking

The MCP server also includes powerful function usage tracking capabilities that allow you to:

- **Find where functions are used**: Search for any function (builtin or user-defined) and see all locations where it's called
- **Get real examples**: Extract actual code examples showing how functions are used in practice
- **Analyze call relationships**: Understand which functions call others and build dependency graphs
- **Identify unused code**: Find functions that are defined but never used
- **Learn from patterns**: See the most commonly used functions and patterns

### Benefits

- **For AI Assistants**: Learn from real-world usage patterns to provide better code suggestions
- **For Developers**: Quickly find examples and understand function usage
- **For Code Quality**: Identify dead code and analyze dependencies

### Example Use Cases

1. **Finding how `commit` is used**:
   ```json
   {
     "tool": "findFunctionUsage",
     "arguments": {
       "functionName": "commit",
       "limit": 10
     }
   }
   ```

2. **Getting examples of `hisRead` usage**:
   ```json
   {
     "tool": "getFunctionExamples",
     "arguments": {
       "functionName": "hisRead",
       "maxExamples": 5
     }
   }
   ```

3. **Understanding function dependencies**:
   ```json
   {
     "tool": "getFunctionCallGraph",
     "arguments": {
       "functionName": "meterOccUsage",
       "depth": 2
     }
   }
   ```

## Categories

The server categorizes Axon functions into the following domains:

- **HVAC**: Air handling, VAV control, temperature control
- **Energy**: kWh consumption, demand monitoring, cost calculations
- **Meter**: Meter reading, validation, and analysis
- **Spark Analysis**: Fault detection and diagnostics
- **Reporting**: Email reports, summaries, dashboards
- **Admin**: System administration and monitoring
- **Sensor**: Sensor data processing and validation
- **Control**: Control sequences and setpoint management
- **Data Analysis**: Historical data analysis and trends
- **Utilities**: Helper functions and tools

## Examples

### Finding HVAC Control Examples

```javascript
// Search for VAV control examples
{
  "tool": "searchAxonExamples",
  "arguments": {
    "keyword": "vav",
    "category": "hvac"
  }
}
```

### Getting Energy Calculation Functions

```javascript
// Search for energy cost calculations
{
  "tool": "searchAxonExamples",
  "arguments": {
    "keyword": "cost",
    "category": "energy"
  }
}
```

### Retrieving a Specific Function

```javascript
// Get the siteReport function
{
  "tool": "getAxonExample",
  "arguments": {
    "identifier": "siteReport"
  }
}
```

## Workflows

Beyond code examples, the server ships a library of **workflow guides** —
battle-tested, step-by-step playbooks for common SkySpark/Axon tasks. They live
as Markdown in [`workflows/`](./workflows) and are exposed to AI assistants as
both MCP tools and `workflow://` resources.

Included guides:

| Workflow | What it covers |
| --- | --- |
| `axon-func-update` | Commit/upsert Axon functions without leaving duplicate folio records |
| `axon-lang-information` | Axon syntax gotchas reference (no `while`/ternary/elvis, unit arithmetic, `do…end`) |
| `curRule-computed-points` | Build `curRule` + `defcomp` computed `curVal` points with history |
| `spark-rule-creation` | Author FDD spark rules |
| `app-creation` | Build SkySpark apps/views |
| `recform-template-design` | Design record-form templates |
| `html-email-skyspark` | SkySpark-native HTML email notifications |
| `task-subscriber-permissions` | `obsCurVals`/`obsSchedule` tasks and the host-user permission model |
| `job-status-check` | Inspect job/task run status |
| `visualytik-mcp-authoring` | Author Visualytik dashboards (`.viz`/`.anim` artifacts, SVG, logic graphs) |

### Workflow discovery (MCP)

- **`listWorkflows`** — list every loaded workflow with a short summary (id, title, category, tags). Cheap discovery surface.
- **`searchWorkflows`** — search by keyword/category/tag **and** semantic (vector) similarity; returns a relevance score.
- **`getWorkflowSummary`** — fetch the cached summary for one workflow by id.
- **`workflow://<id>`** resources — the full Markdown content on demand.

**Enhancements:**

- **Auto-registration** — drop a new `*.md` into `workflows/` and it's loaded live (via `fs.watch`); no restart needed.
- **AI-generated summaries** — each workflow gets a concise, cached summary so discovery stays cheap on tokens.
- **Vector search** — workflows are embedded into a local vector index (LanceDB) for semantic `searchWorkflows`.
- **Editable** — workflow Markdown can be updated through the admin API / dashboard and persists back to disk.

## VSCode Extension

A companion **[VSCode extension](./vscode-extension)** (`Axon VSCode`) provides an
IDE surface for the MCP server: a sidebar for project selection, quick dashboard
access, and a status bar showing the active SkySpark project and connection
state. AI assistants (Claude Code, Cline, etc.) talk to the MCP server directly;
the extension is the convenience UI around it.

**Commands** (Command Palette → "Axon: …"):

| Command | Description |
| --- | --- |
| `Axon: Switch Project` | Select the active SkySpark project |
| `Axon: Search Code Examples` | Search Axon `.axon` examples |
| `Axon: Search Documentation` | Search the FlexSearch docs index |
| `Axon: Open MCP Explorer` | Browse server tools/resources |
| `Axon: Open Dashboard` | Open the admin dashboard in a browser |
| `Axon: Connect to MCP Server` / `Check Connection Status` | Manage/inspect the connection |
| `Axon: Sync Functions from SkySpark` | Pull functions for offline search |
| `Axon: Clear Server Caches` · `View MCP Server Logs` | Maintenance |

**Build & install (`.vsix`):**

```bash
cd vscode-extension
npm install
npm run compile        # webpack production build
npm run package        # produces axon-vscode-<version>.vsix (vsce)
# then in VSCode: Extensions ▸ … ▸ "Install from VSIX…"
# or from the CLI:
code --install-extension axon-vscode-*.vsix
```

Requires VSCode `^1.84.0` and a running Axon MCP Server (`npm start` from the
project root). See [`vscode-extension/README.md`](./vscode-extension/README.md)
for details.

## Development

### Project Structure

```
axon-mcp-server/
├── src/
│   ├── index.ts                 # Main server implementation
│   ├── scanner/                 # File scanning utilities
│   │   ├── fileScanner.ts       # HTML & Axon file scanner
│   │   └── axonUsageScanner.ts  # AxonUsage.html parser
│   ├── parser/                  # Code & documentation parsing
│   │   ├── axonParser.ts        # Axon code parser
│   │   ├── htmlDocParser.ts     # HTML documentation parser (FlexSearch)
│   │   └── enhancedAxonParser.ts
│   ├── search/                  # Search implementations
│   │   ├── searchIndex.ts       # Token-based code search
│   │   ├── flexSearchIndex.ts   # FlexSearch documentation index
│   │   ├── operatorIndex.ts     # Operator usage index
│   │   └── functionUsageIndex.ts # Function call tracking
│   ├── types/                   # TypeScript type definitions
│   │   ├── index.ts             # Core types
│   │   └── documentation.ts     # FlexSearch types
│   ├── cache/                   # Caching system
│   │   └── cacheManager.ts      # Index caching & persistence
│   └── patterns/                # Curated Axon patterns
├── .cache/                      # Cached indexes
│   ├── axon-index.json          # Code function index
│   ├── flexsearch-docs.json     # FlexSearch documentation index
│   └── function-usage.json      # Function usage index
├── dist/                        # Compiled JavaScript
├── package.json
├── tsconfig.json
└── README.md
```

### Adding New Features

1. **New Categories**: Add to `AxonCategory` enum in `src/types/index.ts`
2. **Better Parsing**: Enhance `src/parser/axonParser.ts`
3. **New Tools**: Add tool definitions in `src/index.ts`

### Testing

```bash
# Run tests
npm test
```

## Releases & Versioning

Releases are automated with [release-please](https://github.com/googleapis/release-please-action) using [Conventional Commits](https://www.conventionalcommits.org/):

- `fix: …` → patch release (x.y.**z**)
- `feat: …` → minor release (x.**y**.0)
- `feat!: …` / `BREAKING CHANGE:` → major release (**x**.0.0)

**How it works:** on every push to `main`, release-please opens/updates a *release PR* that bumps `package.json` and updates `CHANGELOG.md`. Merging that PR tags the version and publishes a **GitHub Release**; CI then builds the project, zips a runnable bundle (`dist/`, `prisma/`, `scripts/`, `package.json`, templates, docs), and attaches it as `axon-mcp-server-vX.Y.Z.zip`. See `.github/workflows/`.

### Install from a release zip

```bash
# Download axon-mcp-server-vX.Y.Z.zip from the GitHub Releases page, then:
unzip axon-mcp-server-vX.Y.Z.zip && cd axon-mcp-server-vX.Y.Z
npm ci --omit=dev
npx prisma migrate deploy        # initialize the SQLite database
cp config/skyspark.example.json config/local-skyspark.json   # then edit credentials
node dist/index.js               # stdio mode (or: MCP_TRANSPORT=http node dist/index.js)
```

## License

This project is **source-available**, licensed under the **Project Sandstar
Source-Available License (PSSL) v1.1** — see [`LICENSE`](./LICENSE).

> Copyright (c) 2026 Anka Labs, Inc. Licensed under the Project Sandstar
> Source-Available License (PSSL v1.1).
>
> Project Sandstar integrates the Sedona Framework and Project Haystack, which
> are independent open-source projects.

**This is not an OSI open-source license.** You may study, modify, and deploy the
software free of charge for **Qualifying Use** (where it exclusively consumes
Sandstar-Origin Data). Any use that consumes non-Sandstar data — directly or via
a gateway/Haystack server — requires a **commercial license**. See the LICENSE
file for the full terms and the "Packet Test", or contact
[licensing@ankalabs.com](mailto:licensing@ankalabs.com).

## Contributing

Contributions are welcome! Please submit pull requests with:
- New Axon examples
- Improved categorization
- Better parsing algorithms
- Additional tools