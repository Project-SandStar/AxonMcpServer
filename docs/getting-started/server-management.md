# Server Management

Scripts for starting and stopping the Axon MCP Server.

## Quick Commands

```bash
# Start the server
npm run start:http

# Stop the server
npm run stop

# Check server status
npm run status
```

## Scripts

### Start Server

```bash
./scripts/start-server.sh
```

Starts the MCP server with HTTP transport on port 3847 (default).

**Options:**
- `MCP_PORT` - Override default port (e.g., `MCP_PORT=4000 ./scripts/start-server.sh`)

**Features:**
- Prevents duplicate instances
- Logs to `/tmp/axon-mcp-server.log`
- Increases Node.js memory limit to 8GB

### Stop Server

```bash
./scripts/stop-server.sh
```

Stops the running MCP server.

**Features:**
- Handles both pm2-managed and direct processes
- Graceful shutdown with force-kill fallback
- Works with custom ports via `MCP_PORT` env var

### Check Status

```bash
./scripts/status-server.sh
```

Shows if the server is running and connection details.

## PM2 Daemon Mode

For production, use pm2 for process management:

```bash
# Start as daemon
npm run daemon:start

# Stop daemon
npm run daemon:stop

# View logs
npm run daemon:logs

# Restart
npm run daemon:restart
```

## Ports

| Port | Description |
|------|-------------|
| 3847 | Default MCP HTTP endpoint |

## Logs

- **Runtime logs:** `/tmp/axon-mcp-server.log`
- **PM2 logs:** `pm2 logs axon-mcp`

## Troubleshooting

### Port already in use

```bash
# Find what's using the port
lsof -i :3847

# Kill specific process
kill <PID>

# Or use the stop script
npm run stop
```

### Server won't start

1. Check if port is in use: `lsof -i :3847`
2. Verify build is up to date: `npm run build`
3. Check logs: `cat /tmp/axon-mcp-server.log`
