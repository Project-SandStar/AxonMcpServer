# Axon VSCode Extension

Companion extension for the Axon MCP Server - provides project selection and quick access to the dashboard.

## What This Extension Does

- **Project Selection** - Switch between SkySpark projects from the sidebar
- **Dashboard Access** - Quick link to open the MCP server dashboard
- **Status Bar** - Shows current project and connection status

## How It Works

This extension connects to a running [Axon MCP Server](https://github.com/yourusername/axon-mcp-server). The MCP server provides 25+ tools for searching Axon examples, documentation, and executing code on SkySpark.

AI assistants like **Claude Code** and **Cline** use the MCP server directly for intelligent code generation. This extension simply provides a convenient UI for project management.

## Quick Start

1. Start the Axon MCP Server: `npm start` (from the main project)
2. Install this extension
3. Select your project from the Axon sidebar
4. Use Claude Code or Cline with the MCP server for AI-powered Axon development

## Commands

| Command | Description |
|---------|-------------|
| `Axon: Switch Project` | Select active SkySpark project |
| `Axon: Open Dashboard` | Open MCP server dashboard in browser |
| `Axon: Check Connection Status` | Show server connection info |
| `Axon: Search Code Examples` | Search indexed Axon examples |
| `Axon: Search Documentation` | Search Axon documentation |
| `Axon: Sync Functions` | Sync functions from SkySpark |
| `Axon: View MCP Server Logs` | View server startup logs |
| `Axon: Clear Server Caches` | Clear MCP server caches |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `axon.server.url` | `http://localhost:3847` | MCP server URL |
| `axon.server.username` | `admin` | Server auth username |
| `axon.server.password` | `admin` | Server auth password |

## Requirements

- VSCode 1.84.0+
- Running Axon MCP Server

## Using with AI Assistants

### Claude Code
Add to your MCP settings:
```json
{
  "mcpServers": {
    "axon": {
      "type": "streamableHttp",
      "url": "http://localhost:3847/mcp"
    }
  }
}
```

### Cline
Add to Cline MCP settings with the same configuration.

Once configured, AI assistants can use tools like:
- `searchAxonExamples` - Find relevant code examples
- `searchAxonDocs` - Search documentation
- `executeAxonCode` - Run Axon on SkySpark
- `generateAxonCode` - AI-powered code generation
- And 20+ more tools

## Links

- [MCP Server Dashboard](http://localhost:3847/dashboard) - Full management UI
- [Axon MCP Server Repository](https://github.com/yourusername/axon-mcp-server)
