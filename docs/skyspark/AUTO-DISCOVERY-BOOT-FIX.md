# Auto-Discovery on Boot - Fix Summary

## Problem
Auto-discovery was not running when the MCP server started via Cline/Warp, even though `SKYSPARK_AUTO_DISCOVER=true` was set in `.env.skyspark`.

## Root Cause
**Timing issue**: The code checked for the `SKYSPARK_AUTO_DISCOVER` environment variable BEFORE the `dotenv` library loaded the `.env.skyspark` file.

### Original Code Flow
```
1. initializeSkySparkClient() runs
2. ❌ Checks process.env.SKYSPARK_AUTO_DISCOVER (not loaded yet!)
3. Creates new SkySparkConfigManager()
4. ✅ ConfigManager constructor loads dotenv files (too late!)
```

## Solution
Moved the auto-discovery check to AFTER the config manager is created:

```typescript
// Initialize ConfigManager (this loads dotenv files)
this.configManager = new SkySparkConfigManager(configPath);

// Check for auto-discovery flag AFTER config manager loads dotenv
this.autoDiscoverProjects = process.env.SKYSPARK_AUTO_DISCOVER === 'true';
console.error(`🔍 Auto-discovery: ${this.autoDiscoverProjects ? 'ENABLED' : 'DISABLED'}`);
```

## Verification

Run the server and look for these lines:

```bash
node dist/index.js 2>&1 | head -40
```

**Expected output:**
```
📁 Config directory: /Users/<user>/Code/axon-mcp-server/config
📂 Found X files in config directory
   ✅ Loaded: local-skyspark.json → instance "local" (6 projects)
   ✅ Loaded: demoInstance.json → instance "production" (52 projects)
🔍 Auto-discovery: ENABLED
   Will discover projects from all instances on initialization
✅ SkySpark client initialized

🚀 Starting automatic project discovery and indexing...

🔍 Discovering projects for instance: local...
  ✅ Discovered 6 projects
  📚 Building index for local/...

🔍 Discovering projects for instance: production...
  ✅ Discovered 52 projects
  📚 Building index for production/...

📊 SKYSPARK PROJECT INDEXING SUMMARY
✅ Successfully indexed 2 instance(s), 58 project(s)
```

## Now When You Add "Michaels Energy"

### Scenario
You add a new project called "michaelsEnergy" to your production SkySpark server.

### What Happens on Next Boot

1. **Server starts** with `SKYSPARK_AUTO_DISCOVER=true` (from `.env.skyspark`)
2. **Auto-discovery runs** automatically during initialization
3. **Connects to production instance** using existing credentials
4. **Queries all projects** using `projs()` function
5. **Finds "michaelsEnergy"** in the list
6. **Updates config file** (`demoInstance.json`):
   ```json
   {
     "projects": [
       ... existing 52 projects ...,
       {
         "name": "michaelsEnergy",
         "username": "<username>",
         "description": "Auto-discovered from production"
       }
     ]
   }
   ```
7. **Indexes the new project** for search
8. **New project is immediately available** to Cline!

### Using Cline After Boot

Once auto-discovery completes, you can:

```
User: "List all SkySpark projects"
Cline: Shows 53 projects (including michaelsEnergy)

User: "Switch to michaelsEnergy project"  
Cline: Switches active project

User: "Run this query in michaelsEnergy: readAll(site)"
Cline: Executes query on the new project
```

## Important: Duplicate Instance Names

⚠️ **Issue Found**: You have TWO config files with the same `"name": "production"`:
- `michealsEnergy.json` → `"name": "production"`
- `demoInstance.json` → `"name": "production"`

This causes a conflict - the last one loaded wins!

### Solution Options

**Option 1: Use Different Instance Names**
```bash
# Edit michealsEnergy.json
{
  "name": "michealsEnergy",  # Changed from "production"
  "host": "...",
  ...
}
```

**Option 2: Merge into One File**
If both point to the same server, put all projects in one file (`demoInstance.json`) and delete `michealsEnergy.json`.

**Option 3: Use Different Filenames, Same Instance**
If you want to keep separate files for organization but they're the same server, you need to decide which one is authoritative. Auto-discovery will update both to have the full project list.

## Configuration Summary

✅ **Auto-discovery runs on every boot** (when enabled in `.env.skyspark`)  
✅ **New projects automatically added** to config files  
✅ **Existing project info preserved** (credentials, descriptions)  
✅ **Immediate availability** - no manual config updates needed  
✅ **Works with Cline/MCP** - environment variables loaded correctly  

## Troubleshooting

### Auto-discovery not running?
Check the logs for:
```
🔍 Auto-discovery: ENABLED
```

If you see `DISABLED`, check:
1. `.env.skyspark` file exists
2. Contains: `SKYSPARK_AUTO_DISCOVER=true`
3. No typos in the variable name

### Not discovering all projects?
Check credentials - you need admin/su access to see all projects via `projs()` function.

### Duplicate instances showing up?
Multiple config files with the same `"name"` field. Rename or merge them.

## Summary

🎉 **Auto-discovery now works automatically on boot!**

Every time your MCP server starts (via Cline, Warp, or terminal):
1. ✅ Loads `.env.skyspark`
2. ✅ Sees `SKYSPARK_AUTO_DISCOVER=true`
3. ✅ Runs discovery for all instances
4. ✅ Updates config files with any new projects
5. ✅ Indexes everything for search
6. ✅ Ready to use immediately!

No manual intervention needed when adding new SkySpark projects! 🚀
