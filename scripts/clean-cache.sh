#!/bin/bash

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Axon Cache Analyzer & Cleaner                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

CACHE_DIR=".cache"

# Count different types of cache files
INDEX_FILES=$(ls -1 "$CACHE_DIR"/axon-index-*.json 2>/dev/null | wc -l | tr -d ' ')
METADATA_FILES=$(ls -1 "$CACHE_DIR"/cache-metadata-*.json 2>/dev/null | wc -l | tr -d ' ')
SESSION_FILES=$(ls -1 "$CACHE_DIR"/session-*.json 2>/dev/null | wc -l | tr -d ' ')

echo "Cache Statistics:"
echo "─────────────────────────────────────────────────────────────"
echo "  Index files:    $INDEX_FILES"
echo "  Metadata files: $METADATA_FILES"
echo "  Session files:  $SESSION_FILES"
echo ""

# Analyze empty index files
echo "Analyzing index files..."
echo ""

EMPTY_COUNT=0
SMALL_COUNT=0
LARGE_COUNT=0

for file in "$CACHE_DIR"/axon-index-*.json; do
    if [ -f "$file" ]; then
        # Check if functions array is empty
        FUNC_COUNT=$(jq -r '.functions | length' "$file" 2>/dev/null || echo "0")
        SIZE=$(wc -c < "$file" | tr -d ' ')
        
        if [ "$FUNC_COUNT" -eq 0 ]; then
            EMPTY_COUNT=$((EMPTY_COUNT + 1))
        elif [ "$FUNC_COUNT" -lt 10 ]; then
            SMALL_COUNT=$((SMALL_COUNT + 1))
        else
            LARGE_COUNT=$((LARGE_COUNT + 1))
        fi
    fi
done

echo "Index File Analysis:"
echo "─────────────────────────────────────────────────────────────"
echo "  Empty (0 functions):        $EMPTY_COUNT"
echo "  Small (1-9 functions):      $SMALL_COUNT"
echo "  Large (10+ functions):      $LARGE_COUNT"
echo ""

if [ "$EMPTY_COUNT" -gt 0 ]; then
    echo "Empty Index Files:"
    echo "─────────────────────────────────────────────────────────────"
    for file in "$CACHE_DIR"/axon-index-*.json; do
        if [ -f "$file" ]; then
            FUNC_COUNT=$(jq -r '.functions | length' "$file" 2>/dev/null || echo "0")
            if [ "$FUNC_COUNT" -eq 0 ]; then
                BASENAME=$(basename "$file")
                # Extract instance and project from filename
                # axon-index-{instance}-{project}.json
                NAME_PART=${BASENAME#axon-index-}
                NAME_PART=${NAME_PART%.json}
                LAST_UPDATED=$(jq -r '.lastUpdated' "$file" 2>/dev/null || echo "unknown")
                echo "  • $NAME_PART"
                echo "    Updated: $LAST_UPDATED"
                echo "    File: $file"
            fi
        fi
    done
    echo ""
fi

# Show largest index files
echo "Largest Index Files (Top 5):"
echo "─────────────────────────────────────────────────────────────"
for file in $(ls -S "$CACHE_DIR"/axon-index-*.json 2>/dev/null | head -5); do
    if [ -f "$file" ]; then
        BASENAME=$(basename "$file")
        NAME_PART=${BASENAME#axon-index-}
        NAME_PART=${NAME_PART%.json}
        FUNC_COUNT=$(jq -r '.functions | length' "$file" 2>/dev/null || echo "0")
        SIZE=$(du -h "$file" | cut -f1)
        echo "  • $NAME_PART: $FUNC_COUNT functions ($SIZE)"
    fi
done
echo ""

# Check for old cache files (>7 days)
echo "Checking for old cache files (>7 days)..."
echo ""

OLD_COUNT=0
SEVEN_DAYS_AGO=$(($(date +%s) - 604800))

for file in "$CACHE_DIR"/axon-index-*.json; do
    if [ -f "$file" ]; then
        FILE_TIME=$(stat -f %m "$file" 2>/dev/null || stat -c %Y "$file" 2>/dev/null)
        if [ "$FILE_TIME" -lt "$SEVEN_DAYS_AGO" ]; then
            OLD_COUNT=$((OLD_COUNT + 1))
        fi
    fi
done

if [ "$OLD_COUNT" -gt 0 ]; then
    echo "⚠️  Found $OLD_COUNT index files older than 7 days"
    echo ""
fi

# Summary and cleanup options
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Cleanup Options:"
echo ""
echo "1. Remove empty index files (0 functions)"
echo "2. Remove all index files (will rebuild on next server start)"
echo "3. Remove old session files (force re-authentication)"
echo "4. Remove everything (full cache clear)"
echo "5. Exit (no changes)"
echo ""
read -p "Select option (1-5): " -n 1 -r OPTION
echo ""
echo ""

case $OPTION in
    1)
        if [ "$EMPTY_COUNT" -eq 0 ]; then
            echo "✅ No empty index files to remove"
        else
            echo "Removing empty index files..."
            REMOVED=0
            for file in "$CACHE_DIR"/axon-index-*.json; do
                if [ -f "$file" ]; then
                    FUNC_COUNT=$(jq -r '.functions | length' "$file" 2>/dev/null || echo "0")
                    if [ "$FUNC_COUNT" -eq 0 ]; then
                        rm "$file"
                        # Also remove corresponding metadata file
                        METADATA_FILE="${file/axon-index-/cache-metadata-}"
                        rm "$METADATA_FILE" 2>/dev/null
                        REMOVED=$((REMOVED + 1))
                    fi
                fi
            done
            echo "✅ Removed $REMOVED empty index files (and metadata)"
        fi
        ;;
    2)
        echo "Removing all index files..."
        rm "$CACHE_DIR"/axon-index-*.json 2>/dev/null
        rm "$CACHE_DIR"/cache-metadata-*.json 2>/dev/null
        echo "✅ Removed all index files"
        echo "   (Will rebuild on next server start)"
        ;;
    3)
        echo "Removing session files..."
        COUNT=$(ls -1 "$CACHE_DIR"/session-*.json 2>/dev/null | wc -l | tr -d ' ')
        rm "$CACHE_DIR"/session-*.json 2>/dev/null
        echo "✅ Removed $COUNT session files"
        echo "   (Will re-authenticate on next access)"
        ;;
    4)
        echo "⚠️  This will remove ALL cache files!"
        read -p "Are you sure? (y/N) " -n 1 -r CONFIRM
        echo ""
        if [[ $CONFIRM =~ ^[Yy]$ ]]; then
            rm -rf "$CACHE_DIR"/*
            echo "✅ Cache cleared completely"
        else
            echo "❌ Cancelled"
        fi
        ;;
    5)
        echo "👋 No changes made"
        ;;
    *)
        echo "❌ Invalid option"
        ;;
esac

echo ""
