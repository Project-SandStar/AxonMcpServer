# Config JSON Files Bundling Fix

## Issue

The MCP server was loading a default "demo" project instead of reading your actual config files:

**What was happening:**
```
📁 Config directory: /Users/<user>/.vscode/.../dist/mcp-server/config
Active: local / demo
Instances: 1 (auto-discovery will run...)
```

**Why:**
The bundling script copied the **compiled TypeScript files** from `dist/config/` but forgot to copy the **actual JSON config files** from `config/`.

**Result:**
- ❌ No `local-skyspark.json`
- ❌ No `michealsEnergy.json`
- ❌ No `demoInstance.json`
- ✅ Only TypeScript `.js` and `.d.ts` files

So the MCP server fell back to default configuration.

---

## The Fix

Updated `scripts/bundle-mcp-server.js` to copy JSON config files during bundling:

```javascript
// Copy config JSON files
console.log('Copying config JSON files...');
const mcpConfigDir = path.join(mcpServerRoot, 'config');
const destConfigDir = path.join(destDir, 'config');

if (fs.existsSync(mcpConfigDir)) {
  // Create config directory in destination
  if (!fs.existsSync(destConfigDir)) {
    fs.mkdirSync(destConfigDir, { recursive: true });
  }
  
  // Copy all JSON files from config directory
  const configFiles = fs.readdirSync(mcpConfigDir).filter(f => f.endsWith('.json'));
  configFiles.forEach(file => {
    const srcFile = path.join(mcpConfigDir, file);
    const destFile = path.join(destConfigDir, file);
    fs.copyFileSync(srcFile, destFile);
    console.log(`  ✓ Copied ${file}`);
  });
  console.log(`✓ ${configFiles.length} config file(s) copied`);
}
```

---

## Verification

**Config files now copied:**
```bash
$ ls -la ~/.vscode/extensions/axon.axon-vscode-0.1.0/dist/mcp-server/config/*.json

-rw-r--r--  local-skyspark.json (1.2 KB)
-rw-r--r--  michealsEnergy.json (599 B)
-rw-r--r--  demoInstance.json (8.4 KB)
```

**Total: 3 config files ✅**

---

## What You'll See Now

When you reload VSCode, the MCP server should now load your actual projects:

```
📁 Config directory: /Users/<user>/.vscode/.../dist/mcp-server/config
   Working directory: /Users/<user>/.vscode/.../dist/mcp-server
✅ SkySpark client initialized
   Active: local / mobilytik
   Instances: 1 (auto-discovery will run...)
   - local: 6 projects
```

**Your 6 projects from `local-skyspark.json`:**
1. cityFurnitureCustomerTraffic
2. eacDemoV4
3. hybDemo
4. mobilytik
5. reFuelMarket
6. test

---

## Testing

### Step 1: Reload VSCode
```
Cmd+Shift+P → "Developer: Reload Window"
```

### Step 2: Check MCP Server Logs
```
Cmd+Shift+P → "Axon: View MCP Server Logs"
```

### Step 3: Look For
```
✅ SkySpark client initialized
   Active: local / mobilytik
   Instances: 1
     - local: 6 projects
```

**NOT:**
```
Active: local / demo  ❌
```

---

## Why This Happened

The bundling process has two phases:

1. **TypeScript Compilation** (`npm run build`)
   - Compiles `src/config/*.ts` → `dist/config/*.js`
   - Does NOT touch JSON files

2. **Bundling for Extension** (`bundle-mcp-server.js`)
   - Copies `dist/**` (compiled code)
   - Previously forgot to copy `config/**/*.json` (data files)

**Now fixed:** Step 2 explicitly copies JSON config files.

---

## Files Modified

**File:** `vscode-extension/scripts/bundle-mcp-server.js`
- Added section to copy JSON files from `config/` directory
- Copies all `*.json` files
- Logs each file copied

**Output during packaging:**
```
Copying config JSON files...
  ✓ Copied local-skyspark.json
  ✓ Copied michealsEnergy.json
  ✓ Copied demoInstance.json
✓ 3 config file(s) copied
```

---

## What About Auto-Discovery?

With your config files now properly loaded, you have two options:

### Option 1: Keep Auto-Discovery Enabled
- MCP server will try to discover projects from your configured instances
- May still get 404 errors if `mcpserver` user lacks permissions
- Will use your 6 projects as fallback

### Option 2: Disable Auto-Discovery (Recommended)
Since you already have all projects configured, disable auto-discovery:

1. `Cmd+Shift+P` → "Preferences: Open User Settings (JSON)"
2. Add:
   ```json
   {
     "axon.mcp.autoDiscover": false,
     "axon.mcp.autoSyncFunctions": false
   }
   ```
3. Reload window

**This prevents the 404 errors you were seeing.**

---

## Summary

✅ **Fixed:** Config JSON files now bundled with extension
✅ **Result:** MCP server loads your actual SkySpark instances and projects
✅ **Benefit:** No more "demo" project fallback

**Files now copied during bundling:**
- `local-skyspark.json` - Your main localhost instance with 6 projects
- `michealsEnergy.json` - Additional instance config
- `demoInstance.json` - Additional instance config

---

## Next Steps

1. **Reload VSCode** to activate the fix
2. **Check logs** to verify your projects loaded
3. **Optionally disable auto-discovery** to prevent 404 errors
4. **Test the extension** - all features should work with your real projects!

---

**Installation Complete!** 🎉

Extension has been:
- ✅ Fixed
- ✅ Rebuilt
- ✅ Packaged
- ✅ Installed

Ready to use with your actual SkySpark projects!
