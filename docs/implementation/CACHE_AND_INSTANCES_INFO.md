# Cache Structure & Instance Status

**Date:** September 30, 2025  
**Status:** ✅ Both instances loaded correctly

---

## Current Instance Configuration

### Instances Loaded: 2

1. **local** (from `config/local-skyspark.json`)
   - Host: localhost:8080
   - Projects: 7
     - mobilytik
     - cityFurnitureCustomerTraffic
     - eacDemoV4
     - hybDemo
     - reFuelMarket
     - test
     - demo

2. **production** (from `config/demoInstance.json`)
   - Host: <skyspark-host>:80
   - Projects: 3
     - demoProject
     - buildingA
     - specialProject

### Active Instance
- Currently active: `local / mobilytik`

---

## Cache Directory Structure

### Location
`.cache/` directory in project root

### Cache File Patterns

**For SkySpark Project Indexes:**
```
.cache/axon-index-{instance}-{project}.json
.cache/cache-metadata-{instance}-{project}.json
```

**Examples:**
```
.cache/
  ├── axon-index-local-mobilytik.json
  ├── cache-metadata-local-mobilytik.json
  ├── axon-index-local-eacDemoV4.json
  ├── cache-metadata-local-eacDemoV4.json
  ├── axon-index-production-demoProject.json
  ├── cache-metadata-production-demoProject.json
  └── ... (one pair per project)
```

**For Axon Library (backward compatible):**
```
.cache/
  ├── axon-index.json            # Main library functions
  ├── cache-metadata.json        # Library metadata
  └── function-usage-index.json  # Function usage analysis
```

### Current Cache Files

```bash
$ ls -lh .cache/
total 96208
-rw-r--r--  axon-index.json (3.0 MB)           # Library functions
-rw-r--r--  cache-metadata.json (164 B)       # Library metadata
-rw-r--r--  function-usage-index.json (46 MB) # Usage analysis
```

**Note:** Project-specific caches will be created when auto-discovery runs.

---

## How Auto-Discovery Creates Caches

### When Enabled (`SKYSPARK_AUTO_DISCOVER=true`)

1. **Discovery Phase**
   - Connects to each instance
   - Queries for all projects
   - Updates config files

2. **Indexing Phase**
   - For each project:
     - Fetches all custom Axon functions
     - Creates `AxonCodeIndex` structure
     - Saves to: `.cache/axon-index-{instance}-{project}.json`
     - Saves metadata: `.cache/cache-metadata-{instance}-{project}.json`

3. **Result**
   ```
   .cache/
     # Local instance (7 projects)
     axon-index-local-mobilytik.json
     cache-metadata-local-mobilytik.json
     axon-index-local-cityFurnitureCustomerTraffic.json
     cache-metadata-local-cityFurnitureCustomerTraffic.json
     ... (7 pairs)
     
     # Production instance (3 projects)
     axon-index-production-demoProject.json
     cache-metadata-production-demoProject.json
     axon-index-production-buildingA.json
     cache-metadata-production-buildingA.json
     ... (3 pairs)
     
     Total: 10 project caches + library cache = 11 cache file pairs
   ```

---

## Testing Auto-Discovery

### Step 1: Check Current Status

```bash
$ npm start 2>&1 | head -20
```

**Current Output:**
```
✅ SkySpark client initialized
   Active: local / mobilytik
   Instances: 2
     - local: 7 projects
     - production: 3 projects
```

✅ **Both instances are loaded!**

### Step 2: Enable Auto-Discovery

```bash
$ export SKYSPARK_AUTO_DISCOVER=true
$ npm start
```

**Expected Output:**
```
✅ SkySpark client initialized
   Active: local / mobilytik
   Instances: 2 (auto-discovery enabled)  ← Note: shows "auto-discovery enabled"
     - local: 7 projects
     - production: 3 projects

🚀 Starting automatic project discovery and indexing...

🔍 Discovering projects for instance: local...
  ✅ Discovered 7 projects
  📚 Building index for local/mobilytik...
    ✓ Indexed 156 functions
  ... (continues for all 7 projects)

🔍 Discovering projects for instance: production...
  [Connection attempt to <skyspark-host>:80]
  ... (depends on connectivity)

============================================================
📊 SKYSPARK PROJECT INDEXING SUMMARY
============================================================
✅ Successfully indexed X instance(s), Y project(s)

📦 local (localhost:8080)
   └─ mobilytik: 156 functions
   └─ eacDemoV4: 89 functions
   ... (all local projects)

📦 production (<skyspark-host>:80)
   └─ demoProject: ?? functions
   ... (if reachable)
============================================================
```

### Step 3: Verify Cache Creation

```bash
$ ls -1 .cache/axon-index-*.json
```

**Expected:**
```
.cache/axon-index-local-cityFurnitureCustomerTraffic.json
.cache/axon-index-local-demo.json
.cache/axon-index-local-eacDemoV4.json
.cache/axon-index-local-hybDemo.json
.cache/axon-index-local-mobilytik.json
.cache/axon-index-local-reFuelMarket.json
.cache/axon-index-local-test.json
.cache/axon-index-production-buildingA.json (if reachable)
.cache/axon-index-production-demoProject.json (if reachable)
.cache/axon-index-production-specialProject.json (if reachable)
.cache/axon-index.json (library cache)
```

---

## About the "production" Instance (demoInstance.json)

### Configuration
```json
{
  "name": "production",
  "host": "<skyspark-host>",
  "port": 80,
  "protocol": "http",
  "username": "<username>",
  "password": "<password>",
  "projects": [
    {"name": "demoProject", "description": "Dubai Police Department"},
    {"name": "buildingA", "description": "Building A Management"},
    {"name": "specialProject", ...}
  ]
}
```

### Status
- ✅ Config file loaded successfully
- ✅ Shows in instance list: "production: 3 projects"
- ❓ Connectivity: **Not tested yet**

### To Test Connectivity

**Manual test:**
```bash
curl -u <username>:<password> http://<skyspark-host>/api/demoProject/about
```

**With auto-discovery:**
```bash
SKYSPARK_AUTO_DISCOVER=true npm start
```

If the server is reachable:
- ✅ Projects will be discovered
- ✅ Functions will be indexed
- ✅ Caches will be created

If the server is NOT reachable:
- ⚠️ Warning shown in output
- ✅ System continues with other instances
- ❌ No cache files created for this instance

---

## Cache File Format

### Index File Structure
```json
{
  "functions": [
    ["funcId1", {...}],
    ["funcId2", {...}]
  ],
  "categories": [
    ["category1", ["funcId1", "funcId2"]],
    ["category2", ["funcId3"]]
  ],
  "tags": [
    ["tag1", ["funcId1"]],
    ["tag2", ["funcId2"]]
  ],
  "lastUpdated": "2025-09-30T16:00:00.000Z"
}
```

### Metadata File Structure
```json
{
  "version": "1.0.0",
  "timestamp": 1727712000000,
  "libraryPath": "production/demoProject",
  "instance": "production",
  "project": "demoProject"
}
```

---

## Cache Management Commands

### View Cache Files
```bash
ls -lh .cache/
```

### View Project Caches Only
```bash
ls -1 .cache/axon-index-*.json | grep -v "axon-index.json$"
```

### Clear All Caches
```bash
rm -rf .cache/
```

### Clear Specific Project Cache
```bash
rm .cache/*production-demoProject*
```

### View Cache Metadata
```bash
cat .cache/cache-metadata-local-mobilytik.json | jq
```

---

## Quick Reference

| What | Command |
|------|---------|
| **Check instances** | `npm start 2>&1 \| head -20` |
| **Enable auto-discovery** | `SKYSPARK_AUTO_DISCOVER=true npm start` |
| **View caches** | `ls -lh .cache/` |
| **Clear caches** | `rm -rf .cache/` |
| **Test connectivity** | `curl http://host:port/api/project/about` |

---

## Summary

✅ **Both instances are loaded correctly:**
- local (7 projects)
- production (3 projects from demoInstance.json)

✅ **Cache location:** `.cache/` directory

✅ **Cache pattern:** `axon-index-{instance}-{project}.json`

⏭️ **Next step:** Enable auto-discovery to:
- Discover all projects automatically
- Build indexes for each project
- Create cache files

```bash
export SKYSPARK_AUTO_DISCOVER=true
npm start
```

---

**Last Updated:** September 30, 2025