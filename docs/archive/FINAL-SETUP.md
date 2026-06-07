# ✅ Auto-Sync Setup Complete & Working!

## What Just Happened

Your function sync is now working perfectly! Here's what we fixed:

### The Problem
The CLI script was looking for environment variables that didn't exist, causing confusion with multiple .env files.

### The Solution
**Simplified everything to use ONLY the JSON config files in `config/` folder.**

## Current Configuration

### 1. Config Files (Main Source of Truth)
```
config/
├── local-skyspark.json       # Local instance (6 projects)
├── michealsEnergy.json       # Michael's Energy (3 projects)
└── demoInstance.json               # DemoInstance (52 projects)
```

Each file contains:
- Instance connection info (host, port, protocol)
- Credentials (username, password)
- List of projects

### 2. Environment File (.env)
**Simplified to only contain:**
```bash
# Your SkySpark installation
SKYSPARK_HOME=/Users/<user>/skyspark/skyspark-3.1.8

# NOTE: SkySpark connection info is now in config/*.json files

# Enable auto-sync and auto-discovery
SKYSPARK_AUTO_SYNC_FUNCTIONS=true
SKYSPARK_AUTO_DISCOVER=true
```

**No more redundant SKYSPARK_HOST, SKYSPARK_PORT, etc.** ✅

## Verified Working

### Manual Sync ✅
```bash
npm run sync local mobilytik
```

**Result:**
- ✅ Created `proj/local/mobilytik/func/` directory
- ✅ Downloaded 53 functions (both .axon and .trio files)
- ✅ Took 0.18 seconds
- ✅ Enhanced parsing enabled

### Files Created
```
proj/local/mobilytik/
├── func/
│   ├── kpiKwh.axon           # Source code
│   ├── kpiKwh.trio           # Metadata  
│   ├── ahuCoolFailure.axon
│   ├── ahuCoolFailure.trio
│   └── ... (53 functions total)
└── .sync-metadata.json       # Sync tracking
```

## How It Works Now

### 1. Manual Sync
```bash
npm run sync <instance> <project> [options]
```

The CLI:
1. Loads config from `config/*.json` files
2. Verifies instance and project exist
3. Creates HaystackSkySparkClient with ConfigManager
4. Switches to requested instance/project
5. Syncs functions with smart mode (default)

**Examples:**
```bash
# Sync a specific project
npm run sync local mobilytik

# Force re-download all
npm run sync local mobilytik -- --force

# List synced projects
npm run sync -- --list

# Show stats
npm run sync local mobilytik -- --stats
```

### 2. Auto-Sync on Server Start

When you run `npm start`:
1. Reads `SKYSPARK_AUTO_SYNC_FUNCTIONS=true` from .env
2. Loads all config files from `config/` folder
3. For each instance/project:
   - Checks if `proj/<instance>/<project>/` exists
   - If NO: Full sync (downloads all functions)
   - If YES: Smart sync (only changed functions)
4. Creates both .axon and .trio files
5. Uses enhanced parser for rich metadata

## Next Test: Auto-Sync on Start

Now that manual sync works, let's test `npm start`:

```bash
# Delete the proj folder to test first-time sync
rm -rf proj/

# Start the server
npm start
```

**Expected behavior:**
- Server starts
- Detects `SKYSPARK_AUTO_SYNC_FUNCTIONS=true`
- Auto-discovers all projects from config files
- Creates `proj/` folder
- Syncs all functions from all projects
- Shows progress for each project

## Available Commands

### Sync Commands
```bash
# Normal sync (smart - only changed)
npm run sync local mobilytik

# Force sync (re-download all)
npm run sync local mobilytik -- --force

# Fast sync (skip mod time checks)
npm run sync local mobilytik -- --fast

# High concurrency sync
npm run sync local mobilytik -- --concurrency 20
```

### Info Commands
```bash
# List all synced projects
npm run sync -- --list

# Show sync statistics
npm run sync local mobilytik -- --stats

# Show help
npm run sync -- --help
```

### Available Instances & Projects

From your config files:

**local** (6 projects)
- cityFurnitureCustomerTraffic
- eacDemoV4
- hybDemo
- mobilytik ✅ (just synced!)
- reFuelMarket
- test

**michealsEnergy** (3 projects)
**demoInstance** (52 projects)

You can sync any of these:
```bash
npm run sync local demo
npm run sync local test
npm run sync michealsEnergy projectName
npm run sync demoInstance projectName
```

## File Formats

### .axon Files (Source Code)
Pure Axon source code, ready to copy/paste:
```axon
defcomp
  target: {}
  date:   {}
  out:    {readonly}
  kwh:    {bind:"energy and equipRef->siteMeter and siteRef=={{target->id}}"}
  do
    if (kwh == null) return null
    his: hisRead(kwh, date).hisClip
    kpiSum: his.foldCol("v0", sum)
    out = if (na() == kpiSum) null else {sum: kpiSum}
  end
end
```

### .trio Files (Metadata)
Haystack Trio format with tags and source:
```trio
dis:"kWh"
help:"Site electrical kWh consumption summed over time period."
name:"kpiKwh"
ruleOn:"site"
kpiRule:"✔"
mod:"9/15/2023, 3:40:34 PM UTC"
src:
  defcomp
    target: {}
    ...
```

## Configuration Options

### Enable Function Versioning
Add to `.env`:
```bash
SKYSPARK_FUNCTION_VERSIONING=true
SKYSPARK_MAX_VERSIONS=4
```

Keeps backup versions in `proj/<instance>/<project>/.versions/`

### Adjust Sync Concurrency
Add to `.env`:
```bash
SKYSPARK_SYNC_CONCURRENCY=20  # Default: 10
```

### Disable Enhanced Parsing
Add to `.env`:
```bash
SKYSPARK_ENHANCED_PARSING=false
```

(Not recommended - you'll lose rich metadata)

## Troubleshooting

### "Instance not found"
**Error:** `Instance 'xyz' not found in config files`

**Solution:** Check config folder:
```bash
ls -la config/*.json
```

Add a config file for the instance or use an existing one.

### "Project not found"
**Error:** `Project 'xyz' not found in instance 'local'`

**Solution:** Check available projects:
```bash
cat config/local-skyspark.json | grep '"name"'
```

Or the error message shows available projects.

### Sync Not Running on Server Start

**Check:**
```bash
grep SKYSPARK_AUTO_SYNC_FUNCTIONS .env
# Should show: SKYSPARK_AUTO_SYNC_FUNCTIONS=true
```

### SkySpark Connection Failed

**Check if SkySpark is running:**
```bash
curl http://localhost:8080/api/mobilytik/about
```

**Check config file credentials:**
```bash
cat config/local-skyspark.json
```

## Summary

✅ **Simplified Configuration:** Only use config/*.json files  
✅ **No More Confusion:** Removed duplicate .env variables  
✅ **Verified Working:** Manual sync downloads 53 functions successfully  
✅ **Both File Types:** Creates .axon (source) and .trio (metadata)  
✅ **Enhanced Parsing:** Extracts rich function metadata  
✅ **Ready for Auto-Sync:** `npm start` will now create proj/ folder automatically  

## What Changed

**Before:**
- Multiple .env variables (SKYSPARK_HOST, SKYSPARK_PORT, etc.)
- Confusion between .env and config files
- CLI didn't work with existing setup

**After:**
- Config files are the single source of truth
- .env only has feature flags
- CLI works seamlessly with config files
- Everything simplified and working!

---

🎉 **You're all set!** The `proj/` folder was created successfully and contains 53 functions from the mobilytik project.

**Next:** Try `npm start` to see auto-sync work across all projects!
