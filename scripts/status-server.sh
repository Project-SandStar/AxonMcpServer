#!/bin/bash
# Check Axon MCP Server status

SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MCP_PORT=${MCP_PORT:-3847}
DASHBOARD_DIR="$SERVER_DIR/dashboard/out"

echo ""
echo "Axon MCP Server Status"
echo "======================"
echo ""

# Check pm2 first
if pm2 list 2>/dev/null | grep -q "axon-mcp"; then
    echo "Mode: pm2 daemon"
    pm2 show axon-mcp 2>/dev/null | grep -E "status|uptime|memory|cpu"
    echo ""
    exit 0
fi

# Check by port. -sTCP:LISTEN excludes outbound connections to this port
# (e.g. mcp-proxy's SSE stream), which would otherwise yield a false PID
# and an inaccurate "running on PID X" verdict.
PID=$(lsof -i :$MCP_PORT -sTCP:LISTEN -t 2>/dev/null)

if [ -n "$PID" ]; then
    echo "Status:      RUNNING"
    echo "Port:        $MCP_PORT"
    echo "PID:         $PID"
    echo ""

    # Show memory usage
    MEM=$(ps -p $PID -o rss= 2>/dev/null | awk '{printf "%.1f MB", $1/1024}')
    echo "Memory:      $MEM"

    # Get uptime from health endpoint
    HEALTH=$(curl -s "http://localhost:$MCP_PORT/health" 2>/dev/null)
    if [ -n "$HEALTH" ]; then
        UPTIME=$(echo "$HEALTH" | grep -o '"uptime":[0-9.]*' | cut -d: -f2)
        if [ -n "$UPTIME" ]; then
            # Convert seconds to human readable
            UPTIME_SEC=${UPTIME%.*}
            if [ "$UPTIME_SEC" -ge 86400 ]; then
                echo "Uptime:      $((UPTIME_SEC/86400))d $((UPTIME_SEC%86400/3600))h"
            elif [ "$UPTIME_SEC" -ge 3600 ]; then
                echo "Uptime:      $((UPTIME_SEC/3600))h $((UPTIME_SEC%3600/60))m"
            else
                echo "Uptime:      $((UPTIME_SEC/60))m $((UPTIME_SEC%60))s"
            fi
        fi

        INITIALIZED=$(echo "$HEALTH" | grep -o '"initialized":true')
        if [ -n "$INITIALIZED" ]; then
            echo "Initialized: Yes"
        else
            echo "Initialized: No (still starting)"
        fi

        FUNCTIONS=$(echo "$HEALTH" | grep -o '"functionsIndexed":[0-9]*' | cut -d: -f2)
        if [ -n "$FUNCTIONS" ]; then
            echo "Functions:   $FUNCTIONS indexed"
        fi
    fi

    echo ""
    echo "Endpoints:"
    echo "  MCP:       http://localhost:$MCP_PORT/mcp"
    echo "  Health:    http://localhost:$MCP_PORT/health"
    echo "  Admin:     http://localhost:$MCP_PORT/admin"

    # Check if dashboard is available
    if [ -d "$DASHBOARD_DIR" ] && [ -f "$DASHBOARD_DIR/index.html" ]; then
        echo "  Dashboard: http://localhost:$MCP_PORT/dashboard"
    else
        echo "  Dashboard: Not built (run: npm run dashboard:build)"
    fi

    echo ""
    echo "Logs: /tmp/axon-mcp-server.log"
else
    echo "Status: STOPPED"
    echo ""
    echo "Start with: npm run start:http"
    echo "        or: ./scripts/start-server.sh"
fi
echo ""
