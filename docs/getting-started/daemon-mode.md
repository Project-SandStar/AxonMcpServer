# Axon MCP Server - HTTP Daemon Mode (StreamableHTTP)

This document explains how to run the Axon MCP Server as a persistent daemon using StreamableHTTP transport, allowing multiple clients to share a single server instance.

## Problem Solved

**Before (stdio mode):**
- Each Cline thread spawns a new MCP server process
- Each process takes ~38 seconds to initialize (FlexSearch indexing)
- 9 threads = 9 processes = ~3.6GB RAM
- New threads fail MCP tool calls during initialization

**After (HTTP daemon mode):**
- One persistent server process
- Initialization happens once at startup
- All clients connect via HTTP to the same server
- Instant tool availability for new connections
- ~400MB RAM total

## Quick Start

### 1. Start the HTTP Server

```bash
cd /Users/<user>/Code/axon-mcp-server

# Option A: Foreground (see logs)
MCP_TRANSPORT=http MCP_PORT=3847 node dist/index.js

# Option B: Background with nohup
nohup MCP_TRANSPORT=http MCP_PORT=3847 node dist/index.js > /tmp/axon-mcp.log 2>&1 &

# Option C: With PM2 (recommended - auto-restart on crash)
npm run daemon:start
```

### 2. Verify Server is Running

```bash
curl http://localhost:3847/health
```

Expected response:
```json
{
  "status": "ok",
  "initialized": true,
  "uptime": 123.45,
  "functionsIndexed": 6423,
  "activeSessions": 0
}
```

### 3. Configure Cline

Edit `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "axon": {
      "type": "streamableHttp",
      "url": "http://localhost:3847/mcp",
      "autoApprove": [
        "searchAxonExamples",
        "searchAxonOperatorExamples",
        "searchAxonDocs",
        "listAxonCategories",
        "getAxonExample",
        "getAxonPattern",
        "listAxonPatterns",
        "findFunctionUsage",
        "getFunctionExamples",
        "getFunctionCallGraph",
        "getFunctionUsageStats",
        "searchAxonRegex",
        "generateAxonCode",
        "validateAxonCode",
        "queryHaystack",
        "listAxonTemplates",
        "executeAxonCode",
        "listSkySparkProjects",
        "switchSkySparkProject",
        "discoverProjectFunctions",
        "getProjectSchema",
        "discoverInstanceProjects",
        "clearProjectCache"
      ]
    }
  }
}
```

**Note:** Cline may have compatibility issues with StreamableHTTP (see Known Issues). If you experience problems, try the SSE fallback config below.

### 4. Reload VS Code

After changing the config, reload VS Code (Cmd+Shift+P -> "Developer: Reload Window").

## Architecture

```
+-----------------+     +-----------------+     +-----------------+
|  Cline Thread 1 |     |  Cline Thread 2 |     |  Cline Thread 3 |
+--------+--------+     +--------+--------+     +--------+--------+
         |                       |                       |
         |  POST /mcp (init)     |  POST /mcp (init)     |
         |  POST /mcp (tools)    |  POST /mcp (tools)    |
         |  GET  /mcp (stream)   |  GET  /mcp (stream)   |
         +-----------------------+-----------------------+
                                 |
                    +------------v------------+
                    |   Express HTTP Server   |
                    |     (port 3847)         |
                    +-------------------------+
                    |  POST /mcp   -> messages|
                    |  GET  /mcp   -> stream  |
                    |  DELETE /mcp -> close   |
                    |  GET  /health-> status  |
                    +------------+------------+
                                 |
                    +------------v------------+
                    |   Axon MCP Server       |
                    +-------------------------+
                    |  * 6423 functions       |
                    |  * 25 MCP tools         |
                    |  * Shared indexes       |
                    |  * SkySpark clients     |
                    +-------------------------+
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_TRANSPORT` | `stdio` | Transport mode: `stdio`, `sse`, or `http` |
| `MCP_PORT` | `3847` | HTTP port for server |
| `SKYSPARK_AUTO_DISCOVER` | `true` | Auto-discover projects on startup |
| `SKYSPARK_AUTO_SYNC_FUNCTIONS` | `true` | Sync function source files |

## PM2 Daemon Commands

```bash
npm run daemon:start    # Start the HTTP server with PM2
npm run daemon:stop     # Stop the server
npm run daemon:restart  # Restart the server
npm run daemon:status   # Check if running
npm run daemon:logs     # View live logs
npm run daemon:delete   # Remove from PM2
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | POST | Send JSON-RPC messages (requires `Mcp-Session-Id` header for existing sessions) |
| `/mcp` | GET | SSE stream for server notifications (requires `Mcp-Session-Id` header) |
| `/mcp` | DELETE | Terminate a session (requires `Mcp-Session-Id` header) |
| `/health` | GET | Server health check |

## Protocol Details

StreamableHTTP uses the `Mcp-Session-Id` header for session management:

1. **Initialize**: POST to `/mcp` without session ID, with initialize request body
2. **Response**: Server returns `Mcp-Session-Id` header with new session UUID
3. **Subsequent requests**: Include `Mcp-Session-Id` header with all requests

Required headers for POST:
- `Content-Type: application/json`
- `Accept: application/json, text/event-stream`

## Troubleshooting

### "Connection refused" error
The server isn't running. Start it with:
```bash
MCP_TRANSPORT=http MCP_PORT=3847 node dist/index.js
```

### Client doesn't see tools
1. Check server is initialized: `curl http://localhost:3847/health` should show `"initialized": true`
2. Reload VS Code after changing config
3. Check config has `"type": "streamableHttp"` and URL points to `/mcp`

### Port already in use
```bash
# Find what's using port 3847
lsof -i :3847

# Kill existing server
pkill -f "MCP_PORT=3847"
```

### View server logs
```bash
# If using PM2
npm run daemon:logs

# If using nohup
tail -f /tmp/axon-mcp.log
```

## Known Issues

### Cline Compatibility
Cline may have issues with StreamableHTTP transport:
- [Issue #3315](https://github.com/cline/cline/issues/3315) - StreamableHTTP not working
- [Issue #6767](https://github.com/cline/cline/issues/6767) - Remote MCP server issues

If you experience problems, use the SSE fallback configuration (though the server now uses StreamableHTTP internally, the SSE type in Cline config may still work as Cline handles the transport negotiation).

## Reverting to STDIO Mode

To switch back to the original per-thread mode:

```json
{
  "mcpServers": {
    "axon": {
      "type": "stdio",
      "command": "/Users/<user>/Code/axon-mcp-server/mcp-server-with-logs.sh",
      "args": [
        "/Users/<user>/Code/axon-mcp-server/dist/index.js",
        "/Users/<user>/Code/axon_library_2025/axon-library/.warp/axon-config.json"
      ],
      "env": {
        "SKYSPARK_AUTO_DISCOVER": "true",
        "SKYSPARK_AUTO_SYNC_FUNCTIONS": "true"
      }
    }
  }
}
```

## Testing the Server

Test with curl:

```bash
# Initialize session
curl -X POST http://localhost:3847/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'

# Response includes Mcp-Session-Id header - use it for subsequent requests
```
