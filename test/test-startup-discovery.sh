#!/bin/bash

echo "Testing SKYSPARK_AUTO_DISCOVER=true startup..."
echo ""

cd /Users/<user>/Code/axon-mcp-server

# Run with auto-discovery enabled, capture output for 10 seconds
SKYSPARK_AUTO_DISCOVER=true timeout 10 npm start 2>&1 | grep -A 30 "Discovering projects" || echo "Completed or timeout"
