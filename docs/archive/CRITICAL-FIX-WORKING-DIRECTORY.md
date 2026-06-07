# CRITICAL FIX: Working Directory Issue

**Date:** October 1, 2025, 1:10 PM  
**Severity:** 🔴 CRITICAL  
**Status:** ✅ FIXED - Server restart required

---

## Root Cause Found!

The MCP server was running from the **wrong working directory**, causing ALL relative paths to fail:

```bash
⚠️  Failed to sync functions: ENOENT: no such file or directory, mkdir 'proj'
⚠️  Failed to save session cache: ENOENT: no such file or directory, mkdir '/.cache'
```

### The Problem

The wrapper script `mcp-server-with-logs.sh` was starting the server **without changing to the server directory first**. This meant:

- Relative path `.cache` → resolved to `/.cache` (root!) or wrong directory
- Relative path `proj` → resolved to `/proj` or wrong directory  
- All cache loading failed silently
- Project functions couldn't be loaded
- Result: Only 2,227 functions instead of 6,344

### How It Happened

**Old wrapper script:**
```bash
#!/bin/bash
LOG_FILE="/tmp/axon-mcp-server.log"

> "$LOG_FILE"
node /Users/<user>/Code/axon-mcp-server/dist/index.js "$@" 2> >(tee -a "$LOG_FILE" >&2)
```

The script ran `node` from whatever directory the MCP client happened to be in, not from the server directory.

---

## The Fix

**New wrapper script:**
```bash
#!/bin/bash
LOG_FILE="/tmp/axon-mcp-server.log"
SERVER_DIR="/Users/<user>/Code/axon-mcp-server"

> "$LOG_FILE"

# Change to server directory (critical for relative paths)
cd "$SERVER_DIR" || exit 1

node "$SERVER_DIR/dist/index.js" "$@" 2> >(tee -a "$LOG_FILE" >&2)
```

**Key change:** Added `cd "$SERVER_DIR"` to ensure the server always runs from the correct directory.

---

## Evidence of the Issue

### Before Fix (Current Server - Started 8:09 AM)

```
📦 Loading project caches...
   Found 62 project cache files
   Current codeIndex size: 2227 functions
  📄 Processing axon-index-local-hybDemo.json: local/hybDemo
     Found 0 functions in cache  ← WRONG!
     ✅ Loaded 0 functions from this project
```

### What It Should Show

```
📦 Loading project caches...
   Found 76 project cache files
   Current codeIndex size: 4337 functions
  📄 Processing axon-index-local-hybDemo.json: local/hybDemo
     Found 47 functions in cache  ← CORRECT!
     ✅ Loaded 47 functions from this project
```

### Verification of Cache Files

The cache files are **actually fine**:
```bash
$ node -e "..." # Check cache file
Cache structure:
- Has functions array? true
- Functions count: 47  ← Functions ARE in the cache!
```

But the server couldn't read them because it was looking in the **wrong directory**.

---

## Impact

### Before Fix
- ❌ Only 2,227 functions loaded (library functions only)
- ❌ 2,007 project functions NOT loaded
- ❌ Search for project functions returned zero results
- ❌ `calculateDeltaFromTempCur` not found (exists in 3 projects)

### After Fix (Expected)
- ✅ 6,344 functions loaded (4,337 library + 2,007 project)
- ✅ All project functions properly loaded
- ✅ Search for project functions returns results
- ✅ `calculateDeltaFromTempCur` found in 3 projects

---

## Action Required

### 🚨 **RESTART THE MCP SERVER IMMEDIATELY**

The wrapper script has been fixed. You must restart the server for the fix to take effect.

### How to Restart

**Option 1: Via Cline/MCP Client (Recommended)**
1. Find the MCP server settings or connections
2. Click restart/reload for the `axon` server
3. Wait for initialization to complete

**Option 2: Manual Kill and Let Client Restart**
```bash
# Kill the current broken server
pkill -f "axon-mcp-server/dist/index.js"

# Your MCP client should automatically restart it
# using the fixed wrapper script
```

**Option 3: Manual Restart (If Needed)**
```bash
# Kill current server
pkill -f "axon-mcp-server/dist/index.js"

# Start manually with the fixed wrapper
/Users/<user>/Code/axon-mcp-server/mcp-server-with-logs.sh \
  /Users/<user>/Code/axon_library_2025/axon-library/.warp/axon-config.json
```

---

## Post-Restart Verification

### 1. Check Server Logs

Look for these messages (should NO longer see errors):
```
✅ CORRECT:
📦 Loading project caches...
   Found 76 project cache files
   Current codeIndex size: 4337 functions
  📄 Processing axon-index-local-hybDemo.json: local/hybDemo
     Found 47 functions in cache
     ✅ Loaded 47 functions from this project

🔄 Rebuilding search index with project functions...
   Clearing old index...
   ✅ Search index rebuilt: 29662 tokens, 6344 functions
```

### 2. Check for Absence of Errors

These errors should **NOT appear** anymore:
```
❌ Should NOT see:
⚠️  Failed to sync functions: ENOENT: no such file or directory, mkdir 'proj'
⚠️  Failed to save session cache: ENOENT: no such file or directory, mkdir '/.cache'
✓ Using cached index (0 functions)
```

### 3. Test Search

```javascript
// Test 1: Search for specific function
searchAxonExamples({ keyword: "calculateDeltaFromTempCur", limit: 10 })
// Expected: 3 results from michealsEnergy/{akpizza,kidsfoodbasket,walmartcostarica}

// Test 2: Check function count
// Should see ~6344 functions total
```

### 4. Check Files Created

After successful restart, these files should be updated:
```bash
ls -la /Users/<user>/Code/axon-mcp-server/load-project-caches.log
ls -la /Users/<user>/Code/axon-mcp-server/debug-index-state.txt

# Both should have NEW timestamps (after restart)
# Both should show 6344 functions
```

---

## Success Criteria

After restart, ALL must be true:

- [ ] No "ENOENT" errors for `proj` or `.cache` directories
- [ ] Project cache log shows 76 caches loaded (not 62)
- [ ] All caches show function counts > 0 (not all zeros)
- [ ] Final function count: 6,344 (not 2,227)
- [ ] Search index tokens: ~29,662 (not 14,965)
- [ ] Search for "calculateDeltaFromTempCur" returns 3 results
- [ ] `load-project-caches.log` has new timestamp after restart
- [ ] `debug-index-state.txt` has new timestamp after restart

---

## Technical Details

### Why Relative Paths?

The server code uses relative paths for flexibility:

```typescript
// From config
const cacheDir = this.config.cache?.directory || '.cache';  // Relative!
const projDir = 'proj';  // Relative!

// These REQUIRE the process.cwd() to be the server directory
```

### Why It Worked Before

The previous test runs (at 8:03 AM) must have been executed directly from the correct directory:

```bash
# This works (run from correct dir):
cd /Users/<user>/Code/axon-mcp-server
node dist/index.js config.json

# This BREAKS (run from wrong dir):
cd /somewhere/else
node /Users/<user>/Code/axon-mcp-server/dist/index.js config.json
```

### The Wrapper's Purpose

The wrapper script exists to capture logs:
```bash
node server.js 2> >(tee -a /tmp/axon-mcp-server.log >&2)
```

But it **MUST** also set the working directory, or the server breaks.

---

## Files Modified

1. **`mcp-server-with-logs.sh`** - Added `cd "$SERVER_DIR"`
2. **`src/index.ts`** - Already fixed (search index clearing)
3. **`dist/index.js`** - Already compiled with fixes

---

## Related Issues

### Issue 1: Search Index Duplicates
- **Status:** ✅ FIXED (added `searchIndex.clear()`)
- **File:** `src/index.ts` line 3192

### Issue 2: Working Directory
- **Status:** ✅ FIXED (added `cd` to wrapper)
- **File:** `mcp-server-with-logs.sh` line 11

Both fixes are now in place. Only server restart is needed!

---

## Prevention

To prevent this in the future:

1. **Always use absolute paths** for critical directories, OR
2. **Always `cd` to the server directory** in wrapper scripts
3. **Add validation** at server startup to check if required directories exist:

```typescript
// Could add to initialize():
if (!fs.existsSync('.cache') || !fs.existsSync('proj')) {
  console.error('❌ ERROR: Running from wrong directory!');
  console.error(`   Current dir: ${process.cwd()}`);
  console.error(`   Expected: /Users/<user>/Code/axon-mcp-server`);
  process.exit(1);
}
```

---

## Timeline

- **8:03 AM** - Test run worked (6,344 functions loaded)
- **8:09 AM** - Server restarted via MCP client (wrong directory)
- **8:09 AM** - Server loaded only 2,227 functions (cache failure)
- **1:10 PM** - Issue identified and fixed
- **Next** - Restart required to apply fix

---

## Contact

After restart, if you still see issues:

1. Check the timestamps on the log files
2. Verify the wrapper script was actually used
3. Check `/tmp/axon-mcp-server.log` for the initialization sequence
4. Run the test script: `./test-search.sh`

The fix is ready - just needs the restart! 🚀
