#!/bin/bash

echo "🔍 Verifying MCP Server Tools..."
echo ""

# Start the server in background
node dist/index.js 2>&1 > /tmp/mcp-server.log &
SERVER_PID=$!

# Give it time to initialize
sleep 3

# Check if server is running
if ps -p $SERVER_PID > /dev/null; then
    echo "✅ Server started successfully (PID: $SERVER_PID)"
    
    # Check the log for tool initialization
    echo ""
    echo "📋 Checking available tools..."
    echo ""
    
    # Expected new tools
    TOOLS=(
        "generateAxonCode"
        "validateAxonCode"
        "queryHaystack"
        "listAxonTemplates"
        "executeAxonCode"
    )
    
    for tool in "${TOOLS[@]}"; do
        if grep -q "$tool" dist/index.js; then
            echo "  ✅ $tool - Available"
        else
            echo "  ❌ $tool - NOT FOUND"
        fi
    done
    
    echo ""
    echo "✅ Server verification complete!"
    echo ""
    echo "📝 Next steps:"
    echo "  1. Restart Claude Desktop or Cline"
    echo "  2. Update your MCP config with the new tools"
    echo "  3. The tools will be available to AI assistants"
    
    # Clean up
    kill $SERVER_PID 2>/dev/null
else
    echo "❌ Server failed to start"
    echo "Check logs at /tmp/mcp-server.log"
    exit 1
fi