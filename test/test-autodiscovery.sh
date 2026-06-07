#!/bin/bash

echo "🧪 Testing Auto-Discovery with Credential Preservation"
echo "========================================================"
echo ""

# Show config before
echo "📄 Config files BEFORE auto-discovery:"
echo ""
echo "local-skyspark.json projects:"
jq '.projects[] | {name, username, description}' /Users/<user>/Code/axon-mcp-server/config/local-skyspark.json
echo ""
echo "demoInstance.json projects:"
jq '.projects[] | {name, username, description}' /Users/<user>/Code/axon-mcp-server/config/demoInstance.json

echo ""
echo "🚀 Starting server with SKYSPARK_AUTO_DISCOVER=true (will auto-exit after 5 seconds)..."
echo ""

# Start server with auto-discovery in background
SKYSPARK_AUTO_DISCOVER=true timeout 5s node /Users/<user>/Code/axon-mcp-server/dist/index.js 2>&1 | grep -E "(Discovering|discovered|projects|Instance|Building index|✅|✓)" || true

echo ""
echo "📄 Config files AFTER auto-discovery:"
echo ""
echo "local-skyspark.json projects:"
jq '.projects[] | {name, username, description}' /Users/<user>/Code/axon-mcp-server/config/local-skyspark.json
echo ""
echo "demoInstance.json projects:"
jq '.projects[] | {name, username, description}' /Users/<user>/Code/axon-mcp-server/config/demoInstance.json

echo ""
echo "✅ Test complete - compare before/after to verify credentials are preserved"
