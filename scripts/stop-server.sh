#!/bin/bash
# Stop the Axon MCP Server

MCP_PORT=${MCP_PORT:-3847}

echo ""
echo "Stopping Axon MCP Server..."
echo ""

# Check if managed by pm2
if pm2 list 2>/dev/null | grep -q "axon-mcp"; then
    echo "Stopping pm2 managed server..."
    pm2 stop axon-mcp
    echo "Server stopped."
    exit 0
fi

# Find process by port. -sTCP:LISTEN excludes outbound connections (e.g.
# from mcp-proxy at :9191) that share this port number — without the
# filter we would kill the proxy too.
PID=$(lsof -i :$MCP_PORT -sTCP:LISTEN -t 2>/dev/null)

if [ -n "$PID" ]; then
    echo "Found server on port $MCP_PORT (PID: $PID)"

    # Graceful shutdown
    echo "Sending SIGTERM..."
    kill $PID 2>/dev/null

    # Wait for graceful shutdown (up to 5 seconds)
    for i in {1..5}; do
        sleep 1
        if ! kill -0 $PID 2>/dev/null; then
            echo "Server stopped gracefully."
            exit 0
        fi
        echo -n "."
    done
    echo ""

    # Force kill if still running
    if kill -0 $PID 2>/dev/null; then
        echo "Force killing (SIGKILL)..."
        kill -9 $PID 2>/dev/null
        sleep 1
    fi

    if ! kill -0 $PID 2>/dev/null; then
        echo "Server stopped."
    else
        echo "Failed to stop server!"
        exit 1
    fi
else
    # Try finding by process name as fallback
    PID=$(pgrep -f "dist/index.js" 2>/dev/null | head -1)

    if [ -n "$PID" ]; then
        echo "Found MCP server process (PID: $PID)"
        kill $PID 2>/dev/null
        sleep 1
        echo "Server stopped."
    else
        echo "No MCP server running."
    fi
fi
echo ""
