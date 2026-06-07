# Axon MCP Server

A Model Context Protocol (MCP) server providing AI assistants with access to Axon code examples for building automation, HVAC control, and energy management systems.

## Features

- **25 MCP Tools** - Search, retrieve, execute, and generate Axon code
- **FlexSearch Integration** - Fast full-text search across 6000+ functions
- **SkySpark Integration** - Connect to multiple SkySpark instances and projects
- **Auto-Discovery** - Automatically discover projects and sync functions
- **Code Generation** - AI-powered Axon code generation from templates
- **OAuth 2.1 Authentication** - Secure MCP client authentication with PKCE
- **Admin Dashboard** - Web UI for managing sessions, users, and configuration

## Quick Links

- [Quick Start](getting-started/QUICK_START.md) - Get up and running in minutes
- [Configuration](getting-started/configuration.md) - Configure the server
- [Daemon Mode](getting-started/daemon-mode.md) - Run as persistent HTTP server
- [SkySpark Setup](skyspark/SKYSPARK_SETUP.md) - Connect to SkySpark instances
- [OAuth 2.1 Authentication](implementation/OAUTH.md) - Secure MCP client authentication

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              MCP Client (Claude Code, Cline, etc.)          │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP + OAuth 2.1 Bearer Token
┌─────────────────────────▼───────────────────────────────────┐
│                   Axon MCP Server                           │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  OAuth 2.1   │  │    Admin     │  │   Prisma     │       │
│  │   Provider   │  │  Dashboard   │  │  (SQLite)    │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  FlexSearch  │  │   Parsers    │  │  Validators  │       │
│  │    Index     │  │  (Axon/Trio) │  │              │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Haystack   │  │   Function   │  │    Code      │       │
│  │    Client    │  │    Sync      │  │  Generator   │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

## MCP Tools Overview

| Category | Tools |
|----------|-------|
| **Search** | `searchAxonExamples`, `searchAxonDocs`, `searchAxonRegex`, `findFunctionUsage` |
| **Retrieve** | `getAxonExample`, `getAxonPattern`, `listAxonPatterns`, `listAxonCategories` |
| **SkySpark** | `listSkySparkProjects`, `switchSkySparkProject`, `discoverProjectFunctions` |
| **Execute** | `executeAxonCode`, `validateAxonCode`, `generateAxonCode` |

## Installation

```bash
# Clone and install
git clone <repo-url>
cd axon-mcp-server
npm install
npm run build

# Initialize database (first time only)
npx prisma migrate deploy

# Run in HTTP mode with dashboard and OAuth
MCP_TRANSPORT=http node dist/index.js
```

The server starts on port 3847 by default:
- **MCP Endpoint**: http://localhost:3847/mcp
- **Admin Dashboard**: http://localhost:3847/dashboard
- **OAuth Authorize**: http://localhost:3847/authorize

Default admin credentials: `admin` / `admin`

## Documentation

Use `mkdocs serve` to browse documentation locally:

```bash
pip install mkdocs mkdocs-material
mkdocs serve
```

Then open [http://localhost:8000](http://localhost:8000)
