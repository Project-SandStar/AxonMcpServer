#!/bin/bash
# Restart the Axon MCP Server

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MCP_PORT=${MCP_PORT:-3847}
LOG_FILE="/tmp/axon-mcp-server.log"

echo ""
echo "Restarting Axon MCP Server..."
echo "============================="
echo ""

# Check pm2 first
if pm2 list 2>/dev/null | grep -q "axon-mcp"; then
    echo "Mode: pm2 daemon"
    pm2 restart axon-mcp
    echo ""
    echo "Server restarted via pm2."
    pm2 show axon-mcp 2>/dev/null | grep -E "status|uptime|memory"
    echo ""
    exit 0
fi

# Stop existing server
"$SCRIPT_DIR/stop-server.sh"

# Optional: rebuild if --build flag passed
if [ "$1" = "--build" ] || [ "$1" = "-b" ]; then
    echo "Rebuilding server..."
    cd "$SERVER_DIR" || exit 1
    npm run build || { echo "Build failed!"; exit 1; }
    echo ""
fi

# Start server
"$SCRIPT_DIR/start-server.sh"
