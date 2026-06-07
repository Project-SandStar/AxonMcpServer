#!/bin/bash

echo "=== Testing Axon MCP Server Search Functionality ==="
echo ""
echo "This script will help you verify that project functions are searchable."
echo ""

# Check if server is running
if ! pgrep -f "axon-mcp-server/dist/index.js" > /dev/null; then
    echo "❌ ERROR: MCP server is not running!"
    echo "   Please start the server first."
    exit 1
fi

echo "✅ MCP server is running"
echo ""

# Check the debug state file
if [ -f "debug-index-state.txt" ]; then
    echo "📊 Current Index State:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    cat debug-index-state.txt | head -4
    echo ""
else
    echo "⚠️  debug-index-state.txt not found"
    echo ""
fi

# Check project cache loading log
if [ -f "load-project-caches.log" ]; then
    echo "📦 Project Cache Loading:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    tail -5 load-project-caches.log
    echo ""
else
    echo "⚠️  load-project-caches.log not found"
    echo ""
fi

# Check if the fix is applied
echo "🔍 Checking if fix is applied:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if grep -q "Clearing old index" /tmp/axon-mcp-server.log 2>/dev/null; then
    echo "✅ Fix is applied: Search index clearing detected"
else
    echo "⚠️  Fix not detected in logs"
    echo "   This might mean the server needs to be restarted"
fi
echo ""

# Show recent initialization logs
echo "📝 Recent Server Logs:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ -f "/tmp/axon-mcp-server.log" ]; then
    echo "Last initialization:"
    tail -100 /tmp/axon-mcp-server.log | grep -A 3 "Rebuilding search index" | tail -4
else
    echo "⚠️  Server log not found at /tmp/axon-mcp-server.log"
fi
echo ""

# Suggest next steps
echo "🧪 Next Steps:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. If the fix is not applied, restart your MCP server"
echo "2. After restart, look for this in the logs:"
echo "   🔄 Rebuilding search index with project functions..."
echo "   Clearing old index..."
echo "   ✅ Search index rebuilt: [TOKEN_COUNT] tokens, [FUNCTION_COUNT] functions"
echo ""
echo "3. Test a search for a project function:"
echo "   Use searchAxonExamples with keywords like:"
echo "   - 'calculateDeltaFromTempCur'"
echo "   - 'delta'"
echo "   - 'temp'"
echo ""
echo "4. Check that results include functions from your projects"
echo "   (look for instance/project tags in results)"
echo ""
