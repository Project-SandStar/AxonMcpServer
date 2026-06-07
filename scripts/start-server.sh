#!/bin/bash
# Start the Axon MCP Server with Dashboard

SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="/tmp/axon-mcp-server.log"
MCP_PORT=${MCP_PORT:-3847}
DASHBOARD_DIR="$SERVER_DIR/dashboard/out"

cd "$SERVER_DIR" || exit 1

# Check if already LISTENING on the port. Without -sTCP:LISTEN, lsof also
# matches outbound connections to this port (e.g. mcp-proxy at :9191
# holding an SSE stream to us), which would falsely report "already
# running" and block legitimate startup.
if lsof -i :$MCP_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "MCP server already running on port $MCP_PORT"
    echo "Use: npm run stop (or scripts/stop-server.sh) to stop it first"
    exit 1
fi

# Check if built
if [ ! -f "$SERVER_DIR/dist/index.js" ]; then
    echo "Server not built. Running: npm run build"
    npm run build || exit 1
fi

# Check if dashboard is built
DASHBOARD_AVAILABLE=false
if [ -d "$DASHBOARD_DIR" ] && [ -f "$DASHBOARD_DIR/index.html" ]; then
    DASHBOARD_AVAILABLE=true
else
    echo "Dashboard not built. Run: npm run dashboard:build"
    echo "Continuing without dashboard..."
fi

echo ""
echo "Starting Axon MCP Server..."
echo "============================"

# Clear old log
> "$LOG_FILE"

# Export environment for HTTP transport
export MCP_TRANSPORT=http
export MCP_PORT

# Enable auto-discovery and sync
export SKYSPARK_AUTO_DISCOVER=true
export SKYSPARK_AUTO_SYNC_FUNCTIONS=true

# Start server in background with logging
nohup node --max-old-space-size=8192 "$SERVER_DIR/dist/index.js" >> "$LOG_FILE" 2>&1 &
SERVER_PID=$!

# Wait for server to start
echo "Waiting for server to initialize..."
for i in {1..10}; do
    sleep 1
    if curl -s "http://localhost:$MCP_PORT/health" >/dev/null 2>&1; then
        break
    fi
    echo -n "."
done
echo ""

# Verify server is running
if curl -s "http://localhost:$MCP_PORT/health" >/dev/null 2>&1; then
    echo ""
    echo "Server started successfully!"
    echo ""
    echo "  MCP Endpoint:  http://localhost:$MCP_PORT/mcp"
    echo "  Health Check:  http://localhost:$MCP_PORT/health"
    echo "  Admin API:     http://localhost:$MCP_PORT/admin"
    if [ "$DASHBOARD_AVAILABLE" = true ]; then
        echo "  Dashboard:     http://localhost:$MCP_PORT/dashboard"
    fi
    echo ""
    echo "  PID: $SERVER_PID"
    echo "  Logs: $LOG_FILE"
    echo ""
    echo "Default admin credentials: admin / admin"
    echo "Configure in config/admin.json or via ADMIN_USER/ADMIN_PASS env vars"
else
    echo "Failed to start server. Check logs: $LOG_FILE"
    echo ""
    echo "Last 20 lines of log:"
    tail -20 "$LOG_FILE"
    exit 1
fi
