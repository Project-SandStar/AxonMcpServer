# Quick Start - Stdio Setup

The fastest way to get Axon MCP Server running with your AI assistant.

---

## One-Line Setup

### Claude Code CLI

```bash
claude mcp add axon-mcp -- node {{SERVER_DIR}}/dist/index.js
```

That's it! Claude Code will now have access to all 25 Axon MCP tools.

### Verify It Works

```bash
claude mcp list
```

You should see `axon-mcp` in the list of configured servers.

### Remove

To unregister the server:

```bash
claude mcp remove axon-mcp
```

---

## Other Clients

### Claude Desktop

Add to your config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "axon-mcp": {
      "command": "node",
      "args": ["{{SERVER_PATH}}"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "axon-mcp": {
      "command": "node",
      "args": ["{{SERVER_PATH}}"]
    }
  }
}
```

### Windsurf

Add to Windsurf MCP settings:

```json
{
  "mcpServers": {
    "axon-mcp": {
      "command": "node",
      "args": ["{{SERVER_PATH}}"]
    }
  }
}
```

### Cline (VS Code)

Add to `.cline/mcp_settings.json`:

```json
{
  "mcpServers": {
    "axon-mcp": {
      "command": "node",
      "args": ["{{SERVER_PATH}}"]
    }
  }
}
```

---

## What You Get

Once connected, your AI assistant has access to:

| Category | Tools | What They Do |
|----------|-------|-------------|
| **Search** | 8 | Search Axon code examples, docs, operators, functions |
| **Retrieve** | 5 | Get patterns, templates, categories |
| **SkySpark** | 5 | Connect to SkySpark instances, browse projects |
| **Execute** | 4 | Generate, validate, and run Axon code |
| **Project** | 3 | Manage primary project, browse schema, commit functions |

---

## Next Steps

- See the full [Installation Guide](?doc=installation) for HTTP transport, PM2, and environment variables
- Read the [Overview](?doc=index) for detailed tool descriptions and architecture
