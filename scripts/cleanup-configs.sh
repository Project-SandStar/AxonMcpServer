#!/bin/bash

echo "🧹 Cleaning up duplicate SkySpark config files"
echo "==============================================="
echo ""

echo "Current config directory:"
ls -lh /Users/<user>/Code/axon-mcp-server/config/*.json | grep -v backup
echo ""

echo "ℹ️  You have duplicate config files:"
echo "   - local-skyspark.json (old) vs local.json (new, from auto-discovery)"
echo "   - skyone.json (old) vs production.json (new, from auto-discovery)"
echo ""
echo "The new files have all discovered projects with credentials preserved."
echo ""

read -p "Do you want to archive the old files? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "📦 Archiving old config files..."
    mv /Users/<user>/Code/axon-mcp-server/config/local-skyspark.json /Users/<user>/Code/axon-mcp-server/config/local-skyspark.json.archived 2>/dev/null
    mv /Users/<user>/Code/axon-mcp-server/config/skyone.json /Users/<user>/Code/axon-mcp-server/config/skyone.json.archived 2>/dev/null
    echo "   ✅ Archived local-skyspark.json → local-skyspark.json.archived"
    echo "   ✅ Archived skyone.json → skyone.json.archived"
    echo ""
    
    echo "📊 Final configuration:"
    echo ""
    echo "Instance: local (local.json)"
    echo "   Projects: $(jq '.projects | length' /Users/<user>/Code/axon-mcp-server/config/local.json)"
    jq -r '.projects[] | "   - \(.name) (\(.username // "inherit"))"' /Users/<user>/Code/axon-mcp-server/config/local.json
    
    echo ""
    echo "Instance: production (production.json)"
    echo "   Projects: $(jq '.projects | length' /Users/<user>/Code/axon-mcp-server/config/production.json)"
    jq -r '.projects[] | "   - \(.name) (\(.username // "inherit"))"' /Users/<user>/Code/axon-mcp-server/config/production.json | head -20
    echo "   ... and more (52 total)"
else
    echo "❌ Cancelled - no changes made"
fi
