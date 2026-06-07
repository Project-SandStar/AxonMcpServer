#!/bin/bash

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     Session Cache Migration: Project → Instance Level        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

CACHE_DIR=".cache"
BACKUP_DIR=".cache/session-backup-$(date +%Y%m%d-%H%M%S)"

# Count old sessions
OLD_COUNT=$(ls -1 "$CACHE_DIR"/session-*-*.json 2>/dev/null | wc -l | tr -d ' ')

if [ "$OLD_COUNT" -eq 0 ]; then
    echo "✅ No old session files to migrate"
    echo ""
    exit 0
fi

echo "Found $OLD_COUNT old project-level session files"
echo ""

# Create backup
echo "Creating backup in: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
cp "$CACHE_DIR"/session-*.json "$BACKUP_DIR"/ 2>/dev/null
echo "✅ Backup created"
echo ""

# Analyze sessions by instance
echo "Analyzing sessions by instance:"
echo ""

declare -A instance_counts
declare -A instance_users

for file in "$CACHE_DIR"/session-*-*.json; do
    if [ -f "$file" ]; then
        # Extract instance and username from JSON
        instance=$(jq -r '.instance' "$file" 2>/dev/null || echo "unknown")
        username=$(jq -r '.username' "$file" 2>/dev/null || echo "unknown")
        
        if [ "$instance" != "unknown" ] && [ "$instance" != "null" ]; then
            key="${instance}:${username}"
            instance_counts[$key]=$((${instance_counts[$key]:-0} + 1))
            instance_users[$key]="$username"
        fi
    fi
done

# Display consolidation plan
echo "Consolidation Plan:"
echo "───────────────────────────────────────────────────────────────"
for key in "${!instance_counts[@]}"; do
    instance="${key%:*}"
    username="${key#*:}"
    count="${instance_counts[$key]}"
    echo "  $instance (user: $username): $count sessions → 1 session"
done
echo ""

total_old=$OLD_COUNT
total_new=${#instance_counts[@]}
reduction=$((total_old - total_new))
percentage=$((reduction * 100 / total_old))

echo "Summary:"
echo "  Old sessions: $total_old (one per project)"
echo "  New sessions: $total_new (one per instance)"
echo "  Reduction: $reduction sessions ($percentage%)"
echo ""

# Ask for confirmation
read -p "Proceed with migration? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Migration cancelled"
    echo "Backup remains in: $BACKUP_DIR"
    exit 0
fi

echo ""
echo "Migrating sessions..."
echo ""

# Delete old project-level sessions
rm "$CACHE_DIR"/session-*-*.json 2>/dev/null

echo "✅ Migration complete!"
echo ""
echo "Old sessions backed up to: $BACKUP_DIR"
echo "New sessions will be created on next access"
echo ""
echo "Next Steps:"
echo "  1. Run your sync or MCP server"
echo "  2. New instance-level sessions will be created"
echo "  3. All projects on same instance will share the session"
echo ""
echo "Example: Instead of 64 project sessions, you'll have ~3-5 instance sessions!"
echo ""
