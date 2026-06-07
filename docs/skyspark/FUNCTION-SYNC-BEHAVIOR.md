# Function Sync Behavior Guide

## Overview

The SkySpark MCP server includes two approaches for syncing functions:

1. **Basic Sync** (`FunctionSyncManager`) - Simple, fast, file-existence based
2. **Smart Sync** (`FunctionSyncManagerEnhanced`) - Intelligent, change-detection based

## 📊 Current Implementation (Basic Sync)

### How It Works

#### **On Server Boot:**

```
1. Check if synced:
   ├─ Load .sync-metadata.json
   ├─ Check lastSync < 24 hours
   └─ Check if func/ directory has .axon files

2. If NOT synced OR stale (>24h):
   ├─ Query SkySpark: funcs()
   ├─ For each function:
   │  ├─ Check if file exists
   │  ├─ If exists: SKIP (assume unchanged)
   │  └─ If missing: Download and save
   └─ Update .sync-metadata.json

3. If synced:
   └─ Skip entirely (use cached files)
```

### Behavior Summary

| Scenario | Action | Speed |
|----------|--------|-------|
| **First boot** | Downloads ALL functions | Slow |
| **Boot within 24h** | Skip (uses cache) | Instant |
| **Boot after 24h** | Downloads NEW/MISSING only | Fast |
| **Function modified on server** | **NOT DETECTED** ❌ | N/A |
| **Function deleted on server** | **NOT DETECTED** ❌ | N/A |

### Current Limitations

❌ **Does NOT detect changes** - If function exists locally, skips it  
❌ **Does NOT detect deletions** - Old functions stay on disk  
❌ **Does NOT check modification times** - Assumes local copy is current  
❌ **Simple file existence check** - No hash verification  

### When It's Good Enough

✅ Functions rarely change  
✅ You manually clear cache when needed  
✅ Speed is more important than accuracy  
✅ You're okay with 24-hour sync cycle  

---

## 🚀 Enhanced Implementation (Smart Sync)

### Features

✅ **Change Detection** - Detects modified functions via mod time or hash  
✅ **Deletion Detection** - Removes functions deleted from server  
✅ **Selective Updates** - Only downloads what changed  
✅ **Verification** - SHA256 hash validation  
✅ **Per-Function Metadata** - Tracks each function individually  

### How It Works

#### **Smart Sync Process:**

```
1. Load existing metadata (per-function tracking):
   {
     "functions": {
       "spk_chillerCOP": {
         "lastModified": "2025-01-15T10:30:00Z",
         "hash": "abc123def456...",
         "synced": "2025-01-15T12:00:00Z"
       },
       ...
     }
   }

2. Query SkySpark: funcs()

3. For each function:
   ├─ Get 'mod' timestamp from SkySpark
   ├─ Compare with local metadata:
   │  ├─ If mod time differs: DOWNLOAD (changed)
   │  ├─ If no mod time: Calculate hash and compare
   │  └─ If same: SKIP (unchanged)
   └─ Update metadata

4. Check for deletions:
   └─ If function in metadata but NOT on server: DELETE local file

5. Save updated metadata
```

### Comparison

| Feature | Basic Sync | Smart Sync |
|---------|-----------|------------|
| **Detects new functions** | ✅ Yes | ✅ Yes |
| **Detects changes** | ❌ No | ✅ Yes |
| **Detects deletions** | ❌ No | ✅ Yes |
| **Modification tracking** | ❌ No | ✅ Yes (mod time) |
| **Hash verification** | ❌ No | ✅ Yes (SHA256) |
| **Per-function metadata** | ❌ No | ✅ Yes |
| **Speed (first sync)** | Fast | Medium |
| **Speed (subsequent)** | Instant | Fast |
| **Accuracy** | Low | High |

---

## 📝 Metadata Formats

### Basic Sync Metadata

```json
{
  "instance": "skyone",
  "project": "demoProject",
  "lastSync": "2025-01-15T12:00:00.000Z",
  "functionCount": 957
}
```

**Simple:** Just tracks when sync happened and how many functions.

### Smart Sync Metadata

```json
{
  "instance": "skyone",
  "project": "demoProject",
  "lastSync": "2025-01-15T12:00:00.000Z",
  "functionCount": 957,
  "functions": {
    "spk_chillerCOP": {
      "name": "spk_chillerCOP",
      "lastModified": "2025-01-10T08:30:00.000Z",
      "hash": "a1b2c3d4e5f6...",
      "synced": "2025-01-15T12:00:00.000Z"
    },
    "spk_ahuCoolAndHeat": {
      "name": "spk_ahuCoolAndHeat",
      "lastModified": "2025-01-12T14:20:00.000Z",
      "hash": "f6e5d4c3b2a1...",
      "synced": "2025-01-15T12:00:00.000Z"
    },
    ... (955 more)
  }
}
```

**Detailed:** Tracks each function's modification time, hash, and sync timestamp.

---

## 🎯 Usage Examples

### Example 1: First Sync (Both Approaches)

```bash
# Boot server with auto-sync enabled
node dist/index.js
```

**Basic Sync Output:**
```
📥 Syncing functions for skyone/demoProject...
  ✅ Synced: 957 downloaded, 0 skipped, 0 errors
```

**Smart Sync Output:**
```
📥 Smart syncing functions for skyone/demoProject...
  ✅ Smart sync complete:
     📥 Downloaded: 957 new
     ⏭️  Skipped: 0 unchanged
```

### Example 2: Subsequent Boot (No Changes)

**Basic Sync:**
```
✓ Functions already synced (957 files)
```

**Smart Sync:**
```
✓ Functions already synced (957 files)
```

### Example 3: Function Changed on Server

**Basic Sync:**
```
✓ Functions already synced (957 files)
```
❌ **Miss the change!** - Uses stale cached version

**Smart Sync:**
```
📥 Smart syncing functions for skyone/demoProject...
  🔄 spk_chillerCOP.axon (modified on server)
  ✅ Smart sync complete:
     🔄 Updated: 1 changed
     ⏭️  Skipped: 956 unchanged
```
✅ **Detects and updates!**

### Example 4: Function Deleted on Server

**Basic Sync:**
```
✓ Functions already synced (957 files)
```
❌ **File remains on disk** - Orphaned function

**Smart Sync:**
```
📥 Smart syncing functions for skyone/demoProject...
  🗑️  oldFunction.axon (deleted from server)
  ✅ Smart sync complete:
     🗑️  Deleted: 1 removed
     ⏭️  Skipped: 956 unchanged
```
✅ **Detects and removes!**

---

## ⚙️ Configuration Options

### Basic Sync Options

```typescript
await syncManager.syncFunctions(client, instance, project, {
  force: false,   // Force re-download all (ignores existence check)
  silent: false   // Suppress console output
});
```

### Smart Sync Options

```typescript
await syncManager.syncFunctions(client, instance, project, {
  force: false,         // Force re-download all
  silent: false,        // Suppress console output
  checkModTime: true    // Check modification times (default)
});
```

#### `checkModTime` Explanation:

- **`true` (default)**: Queries each function's `mod` tag from SkySpark
  - **Pro**: Accurate change detection
  - **Con**: Slower (makes API call for each function)

- **`false`**: Only checks file existence
  - **Pro**: Faster (no API calls)
  **Con**: May miss updates

---

## 🔄 Sync Strategies

### Strategy 1: Fast Boot (Current Default)

```typescript
// Check if synced (age < 24h)
const isSynced = await syncManager.isSynced(instance, project);

if (!isSynced) {
  // Basic sync - only downloads missing files
  await syncManager.syncFunctions(client, instance, project);
}
```

**Use When:**
- Boot time is critical
- Functions change infrequently
- 24-hour delay is acceptable

### Strategy 2: Always Fresh (Smart Sync)

```typescript
// Always check for changes (but smart about it)
await smartSyncManager.syncFunctions(client, instance, project, {
  checkModTime: true
});
```

**Use When:**
- Functions change frequently
- You need up-to-date code
- Willing to wait a few seconds on boot

### Strategy 3: Hybrid (Recommended)

```typescript
// Use 24h cache, but do smart sync when needed
const isSynced = await syncManager.isSynced(instance, project);

if (!isSynced) {
  // Smart sync only when cache is stale
  await smartSyncManager.syncFunctions(client, instance, project, {
    checkModTime: true
  });
}
```

**Use When:**
- Balance between speed and accuracy
- Functions change occasionally
- Want best of both worlds

---

## 📈 Performance Comparison

### Benchmark: 957 Functions (demoProject project)

| Operation | Basic Sync | Smart Sync | Smart Sync (no changes) |
|-----------|-----------|-----------|------------------------|
| **First sync** | 2-3 min | 3-4 min | N/A |
| **Boot (<24h)** | Instant | Instant | Instant |
| **Boot (>24h, no changes)** | 5-10s | 15-20s | 15-20s |
| **Boot (>24h, 10 changes)** | 5-10s | 15-25s | 15-25s |
| **Force re-download** | 2-3 min | 2-3 min | N/A |

**Notes:**
- Smart sync is ~2-3x slower due to mod time checks
- But only downloads what changed (more efficient long-term)
- Basic sync may download nothing OR everything

---

## 🎛️ Switching to Smart Sync

### Option 1: Replace Existing Implementation

```typescript
// In src/index.ts
import { FunctionSyncManagerEnhanced } from './sync/functionSyncManagerEnhanced.js';

// Replace:
this.functionSyncManager = new FunctionSyncManager('proj');

// With:
this.functionSyncManager = new FunctionSyncManagerEnhanced('proj');
```

### Option 2: Use Both (Recommended for Testing)

```typescript
// Keep both available
import { FunctionSyncManager } from './sync/functionSyncManager.js';
import { FunctionSyncManagerEnhanced } from './sync/functionSyncManagerEnhanced.js';

// Use basic for fast sync, smart for accurate sync
this.basicSyncManager = new FunctionSyncManager('proj');
this.smartSyncManager = new FunctionSyncManagerEnhanced('proj');
```

---

## 💡 Recommendations

### For Development

✅ Use **Smart Sync**
- Functions change frequently
- Need accurate code
- Can tolerate slower boots

### For Production

✅ Use **Hybrid Approach**
- Fast boots most of the time
- Smart sync when cache expires
- Best balance

### For CI/CD

✅ Use **Basic Sync with Manual Clear**
- Fast builds
- Manually clear cache when deploying new functions
- Consistent behavior

---

## 🔧 Manual Sync Commands

### Force Re-sync Everything

```bash
# Delete metadata to force re-sync
rm proj/skyone/demoProject/.sync-metadata.json

# Restart server
node dist/index.js
```

### Sync Specific Project Manually

```bash
# Use CLI tool
node skyspark-sync.js pull --instance skyone --project demoProject --force
```

### Check Sync Status

```typescript
// Via API
const stats = await smartSyncManager.getSyncStats('skyone', 'demoProject');

console.log(stats);
// {
//   functionCount: 957,
//   lastSync: "2025-01-15T12:00:00.000Z",
//   hasMetadata: true,
//   withModTimes: 957,
//   withHashes: 957
// }
```

---

## 📝 Summary

| Question | Basic Sync | Smart Sync |
|----------|-----------|-----------|
| **Syncs on every boot?** | No (24h cache) | No (24h cache) |
| **Checks modification times?** | No | Yes (optional) |
| **Detects changes?** | No | Yes |
| **Detects deletions?** | No | Yes |
| **Speed** | Faster | Slower |
| **Accuracy** | Lower | Higher |
| **Recommended for** | Production | Development |

**Current default:** Basic Sync (fast, simple, good enough for most cases)  
**Available upgrade:** Smart Sync (accurate, thorough, better for active development)

**You can switch between them based on your needs!**
