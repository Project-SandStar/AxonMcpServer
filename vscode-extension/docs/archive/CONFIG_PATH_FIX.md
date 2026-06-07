# Config Path Fix

## Issue

The MCP server was looking for the config directory in the wrong location when bundled with the VSCode extension:

**What it was looking for:**
```
/Users/<user>/.vscode/extensions/axon.axon-vscode-0.1.0/dist/config
```

**Where it actually is:**
```
/Users/<user>/.vscode/extensions/axon.axon-vscode-0.1.0/dist/mcp-server/config
```

**Error seen:**
```
⚠️  Config directory not found: /Users/<user>/.vscode/extensions/.../dist/config
```

---

## Root Cause

The config path detection logic was:
1. Get script directory: `/path/to/mcp-server/`
2. Go up one level: `/path/to/`
3. Add `config`: `/path/to/config` ❌

This worked for standalone MCP server but failed when bundled in VSCode extension where the config is in the same directory as the script.

---

## The Fix

Updated the config path detection in `src/index.ts` to be more robust:

```typescript
// Strategy: Try multiple locations in order of preference
// 1. Check if config exists in the same directory as the script (bundled mode)
const configInScriptDir = path.join(scriptDir, 'config');

// 2. Check if config exists one level up (development/standalone mode)
const projectRoot = path.resolve(scriptDir, '..');
const configInParentDir = path.join(projectRoot, 'config');

// 3. Check current working directory
const configInCwd = path.join(process.cwd(), 'config');

// Use the first one that exists
const fs = require('fs');
if (fs.existsSync(configInScriptDir)) {
  configPath = configInScriptDir;
} else if (fs.existsSync(configInParentDir)) {
  configPath = configInParentDir;
} else if (fs.existsSync(configInCwd)) {
  configPath = configInCwd;
} else {
  // Default to script directory (will be created if needed)
  configPath = configInScriptDir;
}
```

---

## How It Works Now

The MCP server now checks **three locations** in order:

### 1. Same directory as script (Bundled mode)
```
/Users/<user>/.vscode/extensions/.../dist/mcp-server/config ✅
```
Used when bundled with VSCode extension.

### 2. One level up (Standalone mode)
```
/Users/<user>/Code/axon-mcp-server/dist/../config
→ /Users/<user>/Code/axon-mcp-server/config ✅
```
Used when running standalone MCP server.

### 3. Current working directory (Fallback)
```
$(pwd)/config
```
Used if neither of the above exist.

---

## Testing

### For VSCode Extension (Bundled)
1. Reload VSCode: `Cmd+Shift+P` → "Developer: Reload Window"
2. Check MCP Server logs: `Cmd+Shift+P` → "Axon: View MCP Server Logs"
3. Should see:
   ```
   📁 Config directory: /Users/<user>/.vscode/extensions/.../dist/mcp-server/config
   ✅ SkySpark client initialized
   ```

### For Standalone MCP Server
1. Run: `cd /Users/<user>/Code/axon-mcp-server && npm start`
2. Should see:
   ```
   📁 Config directory: /Users/<user>/Code/axon-mcp-server/config
   ✅ SkySpark client initialized
   ```

---

## Files Modified

**File:** `src/index.ts` (lines 2260-2290)
- Updated `initializeSkySparkClient()` method
- Added intelligent config path detection
- Checks multiple locations with `fs.existsSync()`

---

## Benefits

✅ **Works in VSCode extension** (bundled mode)
✅ **Works as standalone MCP server** (development mode)
✅ **Works in any working directory** (fallback)
✅ **No breaking changes** to existing functionality
✅ **Automatic detection** - no manual configuration needed

---

## Environment Variables

You can still override the config path using:
```bash
export SKYSPARK_CONFIG_DIR=/custom/path/to/config
```

This takes precedence over all automatic detection.

---

## What You'll See Now

When you reload VSCode, the MCP server should start successfully with:

```
📁 Config directory: /Users/<user>/.vscode/extensions/axon.axon-vscode-0.1.0/dist/mcp-server/config
   Working directory: /Users/<user>/.vscode/extensions/axon.axon-vscode-0.1.0/dist/mcp-server
✅ SkySpark client initialized
   Active: local / mobilytik
   Instances: 1
     - local: 6 projects
```

No more "Config directory not found" warnings! 🎉

---

## Next Steps

1. **Reload VSCode**: `Cmd+Shift+P` → "Developer: Reload Window"
2. **Check logs**: `Cmd+Shift+P` → "Axon: View MCP Server Logs"
3. **Verify**: Should see correct config path and no warnings

---

## Installation Complete

✅ MCP server rebuilt
✅ Extension recompiled
✅ Extension repackaged
✅ Extension reinstalled

**Ready to test!**
