# Installation Guide

This guide covers how to build, configure, and connect the Axon MCP Server to various AI clients.

---

## Prerequisites

- **Node.js** >= 18.0.0
- **npm** (included with Node.js)

Verify your installation:

```bash
node --version   # Should print v18.x.x or higher
npm --version
```

---

## Building the Server

Clone the repository and build:

```bash
cd {{SERVER_DIR}}
npm install
npm run build
```

This compiles TypeScript source files to the `dist/` directory. The compiled entry point is `{{SERVER_PATH}}`.

To verify the build succeeded:

```bash
node {{SERVER_PATH}} --help
```

---

## Transport Modes

The Axon MCP Server supports two transport modes:

| Mode | Use Case | Multi-Client | Description |
|------|----------|:------------:|-------------|
| **stdio** | Single client (default) | No | Standard input/output -- the AI client spawns the server as a child process |
| **HTTP** | Multi-client server | Yes | HTTP server on port `{{PORT}}` with OAuth 2.1 session authentication |

**stdio** is the default and recommended mode for most setups. Use **HTTP** mode when you need multiple clients to connect simultaneously or want access to the web dashboard.

---

## Client Configuration

### Claude Code (CLI)

#### stdio Transport (Recommended)

Register the server with a single command:

```bash
claude mcp add axon-mcp -- node {{SERVER_DIR}}/dist/index.js
```

Or manually edit `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "axon-mcp": {
      "command": "node",
      "args": ["{{SERVER_DIR}}/dist/index.js"]
    }
  }
}
```

#### HTTP Transport

First, start the server in HTTP mode:

```bash
cd {{SERVER_DIR}}
MCP_TRANSPORT=http npm start
```

Then register it with Claude Code:

```bash
claude mcp add --transport http axon-mcp http://localhost:{{PORT}}/mcp
```

#### Remove

To unregister the Axon MCP Server from Claude Code:

```bash
claude mcp remove axon-mcp
```

---

### Claude Desktop App

Add the server to your Claude Desktop configuration file.

**macOS:**
`~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows:**
`%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "axon-mcp": {
      "command": "node",
      "args": ["{{SERVER_DIR}}/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop after saving the configuration.

#### Remove

To remove the Axon MCP Server from Claude Desktop, open the configuration file listed above and delete the `"axon-mcp"` entry from the `"mcpServers"` object. Then restart Claude Desktop.

---

### VS Code Extensions

#### Cline Extension

Create or edit `.cline/mcp_settings.json` in your workspace root:

```json
{
  "mcpServers": {
    "axon-mcp": {
      "command": "node",
      "args": ["{{SERVER_DIR}}/dist/index.js"]
    }
  }
}
```

##### Remove

To remove the Axon MCP Server from Cline, open `.cline/mcp_settings.json` in your workspace root and delete the `"axon-mcp"` entry from the `"mcpServers"` object.

#### Continue Extension

Create or edit `.continue/config.json` in your workspace root:

```json
{
  "mcpServers": [
    {
      "name": "axon-mcp",
      "command": "node",
      "args": ["{{SERVER_DIR}}/dist/index.js"]
    }
  ]
}
```

##### Remove

To remove the Axon MCP Server from Continue, open `.continue/config.json` in your workspace root and delete the `axon-mcp` entry from the `"mcpServers"` array.

---

### Cursor

Create or edit `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "axon-mcp": {
      "command": "node",
      "args": ["{{SERVER_DIR}}/dist/index.js"]
    }
  }
}
```

#### Remove

To remove the Axon MCP Server from Cursor, open `.cursor/mcp.json` in your project root and delete the `"axon-mcp"` entry from the `"mcpServers"` object.

---

### Windsurf

Add the server to your Windsurf MCP configuration:

```json
{
  "mcpServers": {
    "axon-mcp": {
      "command": "node",
      "args": ["{{SERVER_DIR}}/dist/index.js"]
    }
  }
}
```

#### Remove

To remove the Axon MCP Server from Windsurf, open the Windsurf MCP settings and delete the `"axon-mcp"` entry from the `"mcpServers"` object.

---

## HTTP Server Management

When running in HTTP mode, you can manage the server in several ways.

### Shell Script

Start and stop using the included scripts:

```bash
# Start the server
cd {{SERVER_DIR}}
MCP_TRANSPORT=http npm start

# Check server status
npm run status

# Stop the server
npm run stop
```

### PM2 Process Manager

For production deployments, use [PM2](https://pm2.io/) to keep the server running:

```bash
# Install PM2 globally (once)
npm install -g pm2

# Start as a daemon
cd {{SERVER_DIR}}
npm run daemon:start

# Management commands
npm run daemon:status    # Check status
npm run daemon:logs      # View logs
npm run daemon:restart   # Restart
npm run daemon:stop      # Stop
npm run daemon:delete    # Remove from PM2
```

### Systemd (Linux)

Create a systemd service file at `/etc/systemd/system/axon-mcp.service`:

```ini
[Unit]
Description=Axon MCP Server
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory={{SERVER_DIR}}
Environment=MCP_TRANSPORT=http
Environment=MCP_PORT={{PORT}}
ExecStart=/usr/bin/node --max-old-space-size=8192 {{SERVER_PATH}}
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then enable and start:

```bash
sudo systemctl enable axon-mcp
sudo systemctl start axon-mcp
sudo systemctl status axon-mcp
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_TRANSPORT` | `stdio` | Transport mode: `stdio` or `http` |
| `MCP_PORT` | `3847` | HTTP server port (HTTP mode only) |
| `ADMIN_USER` | `admin` | Admin username for dashboard and admin API |
| `ADMIN_PASS` | `admin` | Admin password for dashboard and admin API |
| `CACHE_ENABLED` | `true` | Enable/disable index caching |

Environment variables can be set inline, in a `.env` file, or in your system configuration:

```bash
# Inline
MCP_TRANSPORT=http MCP_PORT=3847 node {{SERVER_PATH}}

# Or export
export MCP_TRANSPORT=http
export MCP_PORT=3847
node {{SERVER_PATH}}
```

> **Security Note:** Change the default admin credentials before deploying to a network-accessible environment.

---

## Dashboard Access (HTTP Mode)

When running in HTTP mode, the following endpoints are available:

| Endpoint | Description |
|----------|-------------|
| `http://localhost:{{PORT}}/dashboard/` | Admin dashboard (Basic Auth) |
| `http://localhost:{{PORT}}/mcp` | MCP protocol endpoint (OAuth protected) |
| `http://localhost:{{PORT}}/admin` | Admin REST API (Basic Auth) |
| `http://localhost:{{PORT}}/authorize` | OAuth 2.1 authorization page |
| `http://localhost:{{PORT}}/.well-known/oauth-authorization-server` | OAuth server metadata |

The dashboard provides:

- **Status** -- Server health, uptime, and index statistics
- **Connections** -- Active OAuth sessions and connected clients
- **Explorer** -- Browse and test MCP tools interactively
- **Sessions** -- View and manage OAuth sessions
- **Users** -- Create and manage admin users
- **Config** -- View and edit server configuration

Default credentials: `admin` / `admin`

---

## Verifying Installation

### stdio Mode

Test that the server starts correctly by sending an MCP initialization request:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | node {{SERVER_PATH}}
```

You should see a JSON response containing `serverInfo` and `capabilities`.

Alternatively, use Claude Code to verify:

```bash
claude mcp list
```

The `axon-mcp` server should appear in the list of configured servers.

### HTTP Mode

Start the server and check the health endpoint:

```bash
# Start the server
cd {{SERVER_DIR}}
MCP_TRANSPORT=http npm start &

# Check if it's running
curl -s http://localhost:{{PORT}}/.well-known/oauth-authorization-server | head -20
```

You should see a JSON response with OAuth server metadata, confirming the server is running.

Open `http://localhost:{{PORT}}/dashboard/` in your browser to access the admin dashboard.

---

## Troubleshooting

### Server Does Not Start

**Symptom:** The server exits immediately or prints an error on startup.

- Verify Node.js version: `node --version` (must be >= 18.0.0)
- Verify the build completed: check that `{{SERVER_DIR}}/dist/index.js` exists
- Rebuild if needed: `cd {{SERVER_DIR}} && npm run build`
- Check for port conflicts in HTTP mode: `lsof -i :{{PORT}}`

### Tools Not Appearing in AI Client

**Symptom:** The AI client connects but no tools are listed.

- Ensure the correct path to `dist/index.js` is configured (not `src/index.ts`)
- Restart the AI client after configuration changes
- For Claude Code, verify with `claude mcp list` and check that `axon-mcp` shows the expected tools
- Check server logs for initialization errors

### Slow First Startup

**Symptom:** The server takes 30-60 seconds on first launch.

This is expected behavior. The server builds a FlexSearch index of all documentation on first startup. The index is cached in `.cache/flexsearch-docs.json` and subsequent startups will load in under a second.

To force a cache rebuild:

```bash
cd {{SERVER_DIR}}
npm run cache:clear:all
```

### Cache Issues

**Symptom:** Search results are stale or the server uses outdated data.

Clear all caches and rebuild:

```bash
cd {{SERVER_DIR}}
npm run cache:clear:all
npm run build
```

Cache files are stored in the `.cache/` directory:

| File | Description |
|------|-------------|
| `.cache/axon-index.json` | Parsed Axon function index |
| `.cache/flexsearch-docs.json` | FlexSearch documentation index |
| `.cache/function-usage.json` | Function call relationship graph |

### Permission Errors

**Symptom:** `EACCES` or permission denied errors.

- Ensure the user running the server has read access to `codePath` and `docsPath`
- Ensure the user has write access to the `.cache/` directory
- On macOS, the server may need Full Disk Access if your code files are in a protected location
- For PM2 or systemd, ensure the service user has appropriate permissions

### SkySpark Connection Failures

**Symptom:** SkySpark tools return connection errors.

- Verify SkySpark is running and accessible from the server host
- Check connection config files in the `config/` directory
- Ensure credentials are correct in the SkySpark configuration
- Test connectivity: `curl http://localhost:8080/api/demo/about`

### Database Errors

**Symptom:** OAuth or usage tracking errors mentioning Prisma or SQLite.

Run database migrations:

```bash
cd {{SERVER_DIR}}
npx prisma migrate deploy
```

If the database is corrupted, reset it:

```bash
cd {{SERVER_DIR}}
rm prisma/dev.db
npx prisma migrate deploy
```

---

## Next Steps

- Read the [Overview](index.md) for a summary of all available tools and quick start examples
- Browse tools interactively using the [Dashboard Explorer](http://localhost:{{PORT}}/dashboard/) (HTTP mode)
- Configure SkySpark connections by adding JSON config files to the `config/` directory
