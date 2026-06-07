# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Context-Mode Tooling

This repo has the [context-mode](https://github.com/anthropic-experimental/context-mode) plugin installed for Claude Code. **Use it instead of raw Bash/Read whenever a command will print more than ~20 lines** — context-mode runs in a sandbox and only summaries enter the conversation, which keeps the window usable on large outputs (build logs, git diffs, FlexSearch dumps, MCP responses).

| Task | Tool |
| --- | --- |
| Run a shell command + grep its output | `mcp__plugin_context-mode_context-mode__ctx_batch_execute` |
| Search prior session memory / indexed content | `mcp__plugin_context-mode_context-mode__ctx_search` |
| Process / analyze data with code (Node, Python) | `mcp__plugin_context-mode_context-mode__ctx_execute` or `ctx_execute_file` |
| Fetch + index a URL | `mcp__plugin_context-mode_context-mode__ctx_fetch_and_index` |
| Show / wipe stats | `/context-mode:ctx-stats` · `/context-mode:ctx-purge` |

**When to reach for it in this repo specifically:**
- Reading `src/index.ts` (~4000 lines) for analysis (not editing) — use `ctx_execute_file` to grep/extract.
- Inspecting FlexSearch dump (`.cache/flexsearch-docs.json`), `proj/<instance>/<project>/func/*.axon`, or any tool output expected to spill past a few screens.
- Parsing JSON responses from `executeAxonCode` / `queryHaystack` when investigating grid shape.
- Running `git log` over large branches, or `npm run build` whose output you only need a summary of.

**Hard rules:**
- Never use `ctx_execute*` to write files — those tools are for analysis only. Use native `Write`/`Edit` for any file modification.
- `Read` is still correct when you intend to `Edit` the same file (Edit needs the content in context).

## Project Overview

Axon MCP Server is a Model Context Protocol (MCP) server providing AI assistants with access to Axon code examples for building automation, HVAC control, and energy management systems. It has two components:

1. **MCP Server** (root) - Indexes Axon code/docs and exposes 25 search/execution tools
2. **VSCode Extension** (vscode-extension/) - AI-powered IDE with sidebar UI, chat panel, and code generation

## Build Commands

### Root MCP Server
```bash
npm run build        # Compile TypeScript to dist/
npm run dev          # Run with tsx (development)
npm start            # Run compiled dist/index.js
npm test             # Run Jest tests
npm run cache:clear:all  # Remove all caches
npm run sync         # Build + sync functions from SkySpark
```

### VSCode Extension
```bash
cd vscode-extension
npm run compile      # Webpack build
npm run watch        # Watch mode
npm run bundle-mcp   # Bundle MCP server into extension
npm run vscode:prepublish  # Full build (bundle + compile)
npm run test:unit    # Unit tests only
npm run test:integration  # Integration tests
npm run lint         # ESLint
npm run package      # Create .vsix package

# Shell scripts (preferred)
./scripts/compile.sh  # Bump version + compile
./scripts/package.sh  # Create .vsix package (bumps version, compiles, packages)
```

## Architecture

### MCP Server (`src/`)
- `index.ts` - Main server (~4000 lines), all 25 MCP tools defined here
- `auth/` - OAuth 2.1 authentication:
  - `oauthProvider.ts` - Implements `OAuthServerProvider` from MCP SDK
  - `prismaClientsStore.ts` - OAuth client storage using Prisma
  - `authorizePage.ts` - Login/consent HTML page rendering
  - `tokenUtils.ts` - Token generation, PKCE validation
  - `tokenCleanup.ts` - Background job for expired token cleanup
- `admin/` - Admin API and user management:
  - `routes.ts` - Express router with all admin endpoints
  - `userStore.ts` - User authentication with PBKDF2 password hashing
- `scanner/` - File discovery (`fileScanner.ts` for HTML/Axon, `axonUsageScanner.ts` for AxonUsage.html)
- `parser/` - Code parsing (`axonParser.ts`, `enhancedAxonParser.ts` with defcomp support, `htmlDocParser.ts`)
- `search/` - Search engines:
  - `flexSearchIndex.ts` - FlexSearch for 4000+ HTML docs (Algolia-like relevance scoring)
  - `searchIndex.ts` - Token-based code search
  - `operatorIndex.ts` - Operator usage (>=, ==, etc.)
  - `functionUsageIndex.ts` - Function call tracking
- `skyspark/haystackClient.ts` - SkySpark API integration using haystack-nclient
- `sync/functionSyncManagerEnhanced.ts` - Downloads functions from SkySpark for offline search
- `validation/` - Code validation (semantic, best practices, performance)
- `generation/typedAxonGenerator.ts` - AI-powered code generation

### VSCode Extension (`vscode-extension/src/`)
- `extension.ts` - Extension entry point, activates on startup
- `ai/WorkflowOrchestrator.ts` - Plan-act workflow (Haiku planning → Sonnet generation)
- `ai/ContextGatherer.ts` - Fetches context from MCP server for AI prompts
- `mcp/McpServerManager.ts` - Spawns and manages bundled MCP server process
- `mcp/McpClient.ts` - JSON-RPC communication with MCP server
- `sidebar/SidebarProvider.ts` - Webview sidebar UI
- `commands/` - ~17 command handlers for all VS Code commands

### Key Data Flow
1. Extension starts → McpServerManager spawns bundled MCP server
2. User asks question → ContextGatherer queries MCP tools → AI generates code
3. MCP server indexes `codePath` (Axon files) and `docsPath` (HTML docs) on startup
4. FlexSearch index cached in `.cache/flexsearch-docs.json` (first build: 30-60s, subsequent: <1s)

## Configuration

Priority: `axon-config.json` > Environment variables > Defaults in `src/config/config.ts`

Key paths to configure:
- `codePath` - Directory with `.axon`, `.trio` files
- `docsPath` - Directory with HTML documentation
- `config/` - SkySpark connection configs (JSON files with host/project/credentials)

For VSCode extension, settings are in VS Code preferences under `axon.*` namespace.

## MCP Tools

The server exposes 25 tools organized by function:

**Search**: `searchAxonExamples`, `searchAxonOperatorExamples`, `searchAxonDocs` (FlexSearch), `searchAxonRegex`, `findFunctionUsage`, `getFunctionExamples`, `getFunctionCallGraph`, `getFunctionUsageStats`

**Retrieve**: `getAxonExample`, `getAxonPattern`, `listAxonPatterns`, `listAxonCategories`, `listAxonTemplates`

**SkySpark**: `listSkySparkProjects`, `switchSkySparkProject`, `discoverInstanceProjects`, `discoverProjectFunctions`, `getProjectSchema`, `queryHaystack`

**Execute**: `generateAxonCode`, `validateAxonCode`, `executeAxonCode`, `clearProjectCache`

## Testing

Root uses Jest with ts-jest. Extension has separate unit/integration test paths.

```bash
# Root
npm test

# Extension
cd vscode-extension
npm run test:unit
npm run test:integration
```

## HTTP Mode and Dashboard

Run in HTTP mode to enable the dashboard and OAuth:

```bash
MCP_TRANSPORT=http node dist/index.js
```

Endpoints:
- `http://localhost:3847/mcp` - MCP endpoint (protected by OAuth)
- `http://localhost:3847/dashboard` - Admin dashboard (Next.js, Basic Auth)
- `http://localhost:3847/admin` - Admin API (Basic Auth)
- `http://localhost:3847/authorize` - OAuth authorization page
- `http://localhost:3847/.well-known/oauth-authorization-server` - OAuth metadata

Default admin credentials: `admin` / `admin`

### Dashboard (`dashboard/`)
- Next.js app served at `/dashboard`
- `src/app/` - Pages (status, connections, explorer, sessions, users, config)
- `src/components/` - Shared components (Sidebar, LoginScreen)
- `src/contexts/AuthContext.tsx` - Authentication state management
- `src/lib/api.ts` - API client for admin endpoints

## Key Dependencies

- `@modelcontextprotocol/sdk` - MCP server framework
- `@prisma/client` - Database ORM for OAuth and usage tracking
- `flexsearch` - Fast full-text search for documentation
- `haystack-core`, `haystack-nclient` - SkySpark API client
- `@anthropic-ai/sdk` - Claude API (VSCode extension)

## Cache Files

- `.cache/axon-index.json` - Parsed Axon functions
- `.cache/flexsearch-docs.json` - FlexSearch documentation index
- `.cache/function-usage.json` - Function call relationships
- `proj/` - Synced SkySpark project functions (organized by instance/project)

## Database

SQLite database managed by Prisma:
- `prisma/schema.prisma` - Database schema
- `prisma/dev.db` - SQLite database file
- `src/generated/prisma/` - Generated Prisma client

Tables:
- `Usage` - Tool usage tracking
- `OAuthClient` - Registered OAuth clients
- `AuthorizationCode` - OAuth authorization codes
- `AccessToken` - OAuth access tokens
- `RefreshToken` - OAuth refresh tokens
- `OAuthSession` - Active OAuth sessions

Run migrations:
```bash
npx prisma migrate dev    # Development (creates migration)
npx prisma migrate deploy # Production (applies migrations)
```
