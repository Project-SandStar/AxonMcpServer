#!/bin/bash
# MCP Server wrapper that logs stderr to a file for debugging

LOG_FILE="/tmp/axon-mcp-server.log"
SERVER_DIR="/Users/<user>/Code/axon-mcp-server"

# Clear old log
> "$LOG_FILE"

# Change to server directory (critical for relative paths like .cache and proj/)
cd "$SERVER_DIR" || exit 1

# Run the server and tee stderr to both the log file and original stderr
node --max-old-space-size=8192 "$SERVER_DIR/dist/index.js" "$@" 2> >(tee -a "$LOG_FILE" >&2)
