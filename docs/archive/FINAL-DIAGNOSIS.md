# FINAL DIAGNOSIS: Empty Cache Files

**Date:** October 1, 2025, 1:25 PM  
**Status:** 🔴 ROOT CAUSE IDENTIFIED

---

## The Real Problem

The project cache files are **EMPTY**! They contain no functions.

### Evidence

**Cache file location (from config):**
```
/Users/<user>/Code/axon_library_2025/axon-library/.warp/.axon-mcp-cache/
```

**Cache file contents:**
```json
{
  "functions": [],
  "categories": [],
  "tags": [],
  "lastUpdated": "2025-10-01T11:00:20.257Z"
}
```

**File size:** 100 bytes (essentially empty)  
**Last modified:** 6:00 AM (11:00 UTC) today

---

## Why This Happened

1. **Background indexing runs** - discovers projects, downloads functions
2. **Functions are downloaded to `proj/` directory** - Files exist on disk
3. **Cache files are created** - But with EMPTY function arrays!
4. **Background indexing completes** - Reports "0 functions" for all projects

The background indexing process is **NOT saving the functions to the cache files**. It downloads them, but doesn't index them into the cache.

---

## Proof

**Old cache files (from before config change):**
- Location: `/Users/<user>/Code/axon-mcp-server/.cache/`
- Created: Oct 1, 3:10 AM
- Size: 71KB for `axon-index-michealsEnergy-akpizza.json`
- Contents: **46 functions**

**Current cache files (from config):**
- Location: `/Users/<user>/Code/axon_library_2025/axon-library/.warp/.axon-mcp-cache/`
- Created: Oct 1, 6:00 AM  
- Size: 100 bytes for `axon-index-michealsEnergy-akpizza.json`
- Contents: **0 functions** (empty array)

---

## Why Search Returns Zero

1. Server loads main cache: 2,227 library functions
2. Server calls `loadProjectCaches()`:
   - Finds 62 project cache files
   - Each file has `functions: []` (empty)
   - Loads 0 functions from each
3. Search index built with only 2,227 functions
4. Project functions like `calculateDeltaFromTempCur` not in index
5. Search returns zero results

---

## The Solution

We need to **properly index the project functions**. The functions ARE downloaded (check `proj/` directory), they just need to be indexed into the cache files.

### Option 1: Disable Background Auto-Discovery (Quick Fix)

1. Turn off auto-discovery temporarily
2. Manually sync specific projects when needed
3. This prevents the broken background indexing from running

### Option 2: Fix the Background Indexing (Proper Fix)

The background indexing code needs to be fixed to actually save functions to the cache after downloading them.

### Option 3: Manual Re-Index (Immediate Fix)

Force a re-index of project functions:

```bash
# Delete empty cache files
rm -rf "/Users/<user>/Code/axon_library_2025/axon-library/.warp/.axon-mcp-cache/axon-index-"*.json

# The next server start will rebuild them from proj/ directory
# IF the indexSyncedFunctions() method works correctly
```

---

## Testing the Fix

After the caches are properly populated:

```javascript
// This should return 3 results:
searchAxonExamples({ keyword: "calculateDeltaFromTempCur" })

// Expected functions from:
// 1. michealsEnergy/akpizza
// 2. michealsEnergy/kidsfoodbasket  
// 3. michealsEnergy/walmartcostarica
```

---

## Code Investigation Needed

Check these functions to understand why caches are empty:

1. **`runBackgroundDiscovery()`** - Does it call save after indexing?
2. **`indexProjectFunctions()`** - Does it actually index or just download?
3. **`CacheManager.saveCache()`** - Is it being called with the right data?

The functions are clearly being downloaded (files exist in `proj/`) but not indexed into the cache.

---

## Related Files

- Config: `/Users/<user>/Code/axon_library_2025/axon-library/.warp/axon-config.json`
- Cache dir: `/Users/<user>/Code/axon_library_2025/axon-library/.warp/.axon-mcp-cache/`
- Functions: `/Users/<user>/Code/axon-mcp-server/proj/{instance}/{project}/func/*.axon`

---

## Immediate Action

**The fastest way to fix this right now:**

1. Check if functions exist in `proj/` directory:
   ```bash
   ls -la /Users/<user>/Code/axon-mcp-server/proj/michealsEnergy/akpizza/func/
   ```

2. If they exist, the `indexSyncedFunctions()` method should index them on next start

3. If they don't exist, we need to manually trigger a sync for that project

The core issue is that the background indexing creates EMPTY cache files instead of properly indexing the functions it downloads.
