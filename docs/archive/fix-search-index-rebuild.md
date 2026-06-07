# Fix: Search Index Rebuild Issue

## Problem

When the Axon MCP server initialized from cache, it was building the search index **twice**:

1. First build after loading the main cache (library functions)
2. Second build after loading project caches (project functions)

The issue was that the `SearchIndex.buildIndex()` method is **additive** - it doesn't clear the existing token index before adding new tokens. This meant:

- Library functions were indexed twice (once in each build)
- The token count didn't increase when project functions were added
- Search results for project functions returned zero matches because the search was primarily hitting duplicate library function tokens

## Root Cause

In `src/index.ts`, the initialization flow was:

```typescript
// Load from cache
this.codeIndex = cachedIndex;
this.searchIndex.buildIndex(this.codeIndex.functions);  // Build 1

// Load project caches
await this.loadProjectCaches();  // Adds project functions to codeIndex

// Rebuild search index
this.searchIndex.buildIndex(this.codeIndex.functions);  // Build 2 (additive!)
```

The second `buildIndex()` call added all function tokens again (both library and project), resulting in duplicate entries for library functions.

## Solution

Clear the search index before rebuilding:

```typescript
// Load project-specific caches into main index
await this.loadProjectCaches();

// Rebuild search index to include project functions
console.error('\n🔄 Rebuilding search index with project functions...');
console.error('   Clearing old index...');
this.searchIndex.clear();  // ← Clear existing tokens
this.searchIndex.buildIndex(this.codeIndex.functions);
```

## Changes Made

**File: `src/index.ts`**
- Line ~3191: Added `this.searchIndex.clear()` before rebuilding the search index

## Impact

- ✅ Search index now correctly contains tokens for both library and project functions
- ✅ Token count increases properly when project functions are added
- ✅ Searches for project-specific functions now return results
- ✅ No duplicate token entries for library functions

## Verification Steps

1. **Rebuild the server:**
   ```bash
   npm run build
   ```

2. **Restart the MCP server** (in your MCP client)

3. **Check the logs** during initialization:
   ```
   🔄 Rebuilding search index with project functions...
      Clearing old index...
      ✅ Search index rebuilt: [NEW_TOKEN_COUNT] tokens, [TOTAL_FUNCTIONS] functions
   ```

4. **Test a search** for a project function:
   ```javascript
   searchAxonExamples({ keyword: "calculateDeltaFromTempCur" })
   ```

   Should return results from project functions.

## Related Files

- `src/search/searchIndex.ts` - Contains the `clear()` and `buildIndex()` methods
- `src/index.ts` - Server initialization logic
- `.cache/axon-index-*.json` - Project-specific cache files

## Future Improvements

Consider refactoring `buildIndex()` to:
- Always clear before building (make it idempotent)
- Or rename to `addToIndex()` and create a separate `rebuildIndex()` method that clears first
