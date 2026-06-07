#!/bin/bash

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Fix Empty Index Files                                ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

CACHE_DIR=".cache"

# Find empty index files
echo "Scanning for empty index files..."
echo ""

EMPTY_COUNT=0
FIXED_COUNT=0

for file in "$CACHE_DIR"/axon-index-*.json; do
    if [ -f "$file" ]; then
        FUNC_COUNT=$(jq -r '.functions | length' "$file" 2>/dev/null || echo "0")
        
        if [ "$FUNC_COUNT" -eq 0 ]; then
            EMPTY_COUNT=$((EMPTY_COUNT + 1))
            
            # Extract instance and project from filename
            # axon-index-{instance}-{project}.json
            BASENAME=$(basename "$file")
            NAME_PART=${BASENAME#axon-index-}
            NAME_PART=${NAME_PART%.json}
            
            echo "❌ Empty: $NAME_PART (0 functions)"
            
            # Check if synced files exist
            INSTANCE=$(echo "$NAME_PART" | cut -d'-' -f1)
            PROJECT=$(echo "$NAME_PART" | cut -d'-' -f2-)
            PROJ_DIR="proj/$INSTANCE/$PROJECT/func"
            
            if [ -d "$PROJ_DIR" ]; then
                FILE_COUNT=$(ls -1 "$PROJ_DIR"/*.axon 2>/dev/null | wc -l | tr -d ' ')
                if [ "$FILE_COUNT" -gt 0 ]; then
                    echo "  ✓ Found $FILE_COUNT synced .axon files in $PROJ_DIR"
                    echo "  🔧 Removing empty cache (will rebuild from synced files)"
                    
                    # Remove empty cache files
                    rm "$file"
                    METADATA_FILE="${file/axon-index-/cache-metadata-}"
                    rm "$METADATA_FILE" 2>/dev/null
                    
                    FIXED_COUNT=$((FIXED_COUNT + 1))
                else
                    echo "  ⚠️  No synced files found in $PROJ_DIR"
                    echo "  💡 Run: npm run sync -- --instance $INSTANCE --project $PROJECT"
                fi
            else
                echo "  ⚠️  Directory not found: $PROJ_DIR"
                echo "  💡 Run: npm run sync -- --instance $INSTANCE --project $PROJECT"
            fi
            echo ""
        fi
    fi
done

if [ "$EMPTY_COUNT" -eq 0 ]; then
    echo "✅ No empty index files found!"
    echo ""
else
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "Summary:"
    echo "  Empty indexes found: $EMPTY_COUNT"
    echo "  Fixed (removed):     $FIXED_COUNT"
    echo "  Need manual sync:    $((EMPTY_COUNT - FIXED_COUNT))"
    echo ""
    
    if [ "$FIXED_COUNT" -gt 0 ]; then
        echo "✅ Removed $FIXED_COUNT empty cache files"
        echo "   These will rebuild from synced files on next server start"
        echo ""
    fi
    
    if [ $((EMPTY_COUNT - FIXED_COUNT)) -gt 0 ]; then
        echo "⚠️  Some projects need syncing first"
        echo "   Run the sync commands shown above"
        echo ""
    fi
    
    echo "Next steps:"
    echo "  1. npm run build      # Rebuild server"
    echo "  2. npm start          # Restart server"
    echo "  3. Watch logs for successful indexing"
    echo ""
fi
