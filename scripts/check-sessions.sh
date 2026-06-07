#!/bin/bash

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Session Cache File Check                             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

CACHE_DIR=".cache"

# Count session files
SESSION_COUNT=$(ls -1 "$CACHE_DIR"/session-*.json 2>/dev/null | wc -l | tr -d ' ')

echo "Cache Directory: $CACHE_DIR"
echo "Session Files Found: $SESSION_COUNT"
echo ""

if [ "$SESSION_COUNT" -eq 0 ]; then
    echo "⚠️  No session cache files found!"
    echo ""
    echo "This means session caching is not working yet."
    echo "Sessions will be created when you:"
    echo "  1. Run the sync CLI"
    echo "  2. Use the MCP server with SkySpark operations"
    echo "  3. Run the session caching test"
    echo ""
else
    echo "✅ Session cache files found:"
    echo ""
    ls -lh "$CACHE_DIR"/session-*.json | awk '{print "  " $9 " (" $5 ", " $6 " " $7 " " $8 ")"}'
    echo ""
    
    echo "Most recent session:"
    LATEST=$(ls -t "$CACHE_DIR"/session-*.json | head -1)
    echo "  File: $(basename $LATEST)"
    echo ""
    echo "  Content:"
    cat "$LATEST" | jq '.' 2>/dev/null || cat "$LATEST"
    echo ""
fi

echo "────────────────────────────────────────────────────────────────"
echo ""
