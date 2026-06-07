# SkySpark Function Sync Guide

Complete guide for syncing SkySpark function source code to your local filesystem.

## Overview

The Axon MCP Server includes powerful function synchronization capabilities that download both `.axon` (source code) and `.trio` (metadata) files from your SkySpark instances to your local filesystem.

### Features

✅ **Dual File Format**: Downloads both `.axon` source and `.trio` metadata  
✅ **Smart Sync**: Only downloads new/changed functions (detects modifications)  
✅ **Parallel Downloads**: Configurable concurrency for fast syncing  
✅ **Auto-Sync on Start**: Automatically syncs when MCP server starts  
✅ **Function Versioning**: Optional backup of previous versions  
✅ **Enhanced Metadata**: Extracts rich function metadata during sync  
✅ **Multiple Modes**: Fast, smart, and force sync modes  

---

## Auto-Sync on Server Start

### How It Works

When you run `npm start`, the MCP server automatically:

1. **Checks if `proj/` folder exists**
   - If not, creates it and performs initial full sync
   
2. **Checks for `.sync-metadata.json`**
   - If missing, performs full sync
   - If present, performs smart sync (only changed functions)

3. **Downloads functions for all configured projects**
   - Uses modification timestamps to detect changes
   - Parallel downloads (10 concurrent by default)
   - Shows progress and summary

### Configuration

Enable auto-sync by setting this environment variable in `.env`:

```bash
# Enable automatic function sync on server start
SKYSPARK_AUTO_SYNC_FUNCTIONS=true

# Optional: Enable project auto-discovery
SKYSPARK_AUTO_DISCOVER=true

# Optional: Set sync concurrency (default: 10)
SKYSPARK_SYNC_CONCURRENCY=20

# Optional: Enable function versioning (backups)
SKYSPARK_FUNCTION_VERSIONING=true
SKYSPARK_MAX_VERSIONS=4

# Optional: Enable enhanced metadata parsing (default: true)
SKYSPARK_ENHANCED_PARSING=true
```

### Example Output

```
🚀 Starting automatic project discovery and indexing...

🔍 Discovering projects for instance: local...
  📚 Building index for local/mobilytik...
    ✓ Indexed 245 functions
    📥 Initializing function sync (first time)...
  📥 Smart syncing functions for local/mobilytik...
    ⚡ Using 10 parallel downloads
    📦 Batch 1/25 (10 functions)
    ⬇️  myCustomFunc.axon (new)
    ⬇️  anotherFunc.axon (new)
    ...
    ✅ Smart sync complete:
       📥 Downloaded: 245 new
       ⏭️  Skipped: 0 unchanged

📂 Total files in proj/local/mobilytik/func/:
   245 .axon files
   245 .trio files (metadata)
```

---

## Manual Sync (CLI)

For manual syncing outside of server startup, use the CLI tool:

### Basic Usage

```bash
# Build and sync (simple)
npm run sync local mobilytik

# Or run the compiled script directly
node dist/sync/sync-functions-cli.js local mobilytik
```

### Options

```bash
# Force re-download all functions (ignore cache)
npm run sync local mobilytik -- --force

# Fast sync (skip modification time checks)
npm run sync local mobilytik -- --fast

# Sync with custom concurrency
npm run sync local mobilytik -- --concurrency 20

# List all synced projects
npm run sync -- --list

# Show sync statistics
npm run sync local mobilytik -- --stats

# Show help
npm run sync -- --help
```

### CLI Commands

#### Normal Sync (Smart)
```bash
npm run sync local mobilytik
```
- Checks modification times
- Only downloads new/changed functions
- Default mode (recommended)

#### Force Sync
```bash
npm run sync local mobilytik -- --force
```
- Re-downloads ALL functions
- Ignores local cache
- Use when you suspect inconsistencies

#### Fast Sync
```bash
npm run sync local mobilytik -- --fast
```
- Only checks file existence
- Skips modification time checks
- Faster but may miss updates

#### List Projects
```bash
npm run sync -- --list
```
```
📋 Synced Projects:

  📦 local/mobilytik
     Functions: 245
     Last sync: 2h ago

  📦 local/demo
     Functions: 123
     Last sync: 1d 5h ago
```

#### Show Statistics
```bash
npm run sync local mobilytik -- --stats
```
```
📊 Sync Statistics for local/mobilytik:

  Total functions:     245
  With modification:   245
  With hash:           245
  Last sync:           2 hours ago
  Has metadata:        ✅
```

---

## File Structure

### Directory Layout

```
proj/
└── <instance>/          # e.g., "local"
    └── <project>/       # e.g., "mobilytik"
        ├── func/        # Function source files
        │   ├── myFunc.axon       # Axon source code
        │   ├── myFunc.trio       # Function metadata
        │   ├── anotherFunc.axon
        │   └── anotherFunc.trio
        ├── .sync-metadata.json   # Sync tracking
        └── .versions/            # Version history (optional)
            └── myFunc_2025-01-01T12-00-00-000Z.axon
```

### File Formats

#### `.axon` Files
Pure Axon source code:
```axon
(site) => do
  // Get all equipment for the site
  equips: readAll(equip and siteRef==site->id)
  
  // Calculate average runtime
  equips.map(e => e->runtimeHrs).avg()
end
```

#### `.trio` Files
Haystack Trio format with metadata:
```trio
dis:"Calculate Site Runtime"
ruleOn
sparkRule
doc:"Calculates average runtime for all equipment at a site"
src:
  (site) => do
    // Get all equipment for the site
    equips: readAll(equip and siteRef==site->id)
    
    // Calculate average runtime
    equips.map(e => e->runtimeHrs).avg()
  end
```

### Metadata File (`.sync-metadata.json`)

Tracks sync state and function metadata:
```json
{
  "instance": "local",
  "project": "mobilytik",
  "lastSync": "2025-01-01T12:00:00.000Z",
  "functionCount": 245,
  "functions": {
    "myFunc": {
      "name": "myFunc",
      "hash": "a1b2c3d4e5f6",
      "lastModified": "2024-12-15T10:30:00Z",
      "synced": "2025-01-01T12:00:00.000Z",
      "signature": {
        "parameters": ["site"],
        "isAsync": false
      },
      "dependencies": {
        "functions": ["readAll", "avg"],
        "tags": ["equip", "siteRef"],
        "queries": ["equip and siteRef==site->id"]
      }
    }
  }
}
```

---

## Configuration Options

### Environment Variables

#### Required (for each instance)
```bash
# Instance connection info
SKYSPARK_LOCAL_URI=http://localhost:8080
SKYSPARK_LOCAL_USERNAME=su
SKYSPARK_LOCAL_PASSWORD=su
```

#### Optional Features
```bash
# Auto-sync on server start (default: false)
SKYSPARK_AUTO_SYNC_FUNCTIONS=true

# Auto-discover projects (default: false)
SKYSPARK_AUTO_DISCOVER=true

# Parallel downloads (default: 10)
SKYSPARK_SYNC_CONCURRENCY=20

# Function versioning (default: false)
SKYSPARK_FUNCTION_VERSIONING=true
SKYSPARK_MAX_VERSIONS=4

# Enhanced metadata parsing (default: true)
SKYSPARK_ENHANCED_PARSING=true
```

---

## Sync Modes Comparison

| Mode | Speed | Accuracy | Use Case |
|------|-------|----------|----------|
| **Smart** (default) | Medium | High | Regular syncing, detects changes |
| **Fast** | Fast | Medium | Quick check, may miss updates |
| **Force** | Slow | Highest | Recovery, full re-download |

### When to Use Each Mode

- **Smart Sync**: Daily use, automatic syncing
- **Fast Sync**: Quick checks when you know functions haven't changed
- **Force Sync**: After manual changes in SkySpark, troubleshooting

---

## Advanced Features

### 1. Function Versioning

Keep backup versions of functions when they change:

```bash
# Enable in .env
SKYSPARK_FUNCTION_VERSIONING=true
SKYSPARK_MAX_VERSIONS=4
```

Creates backups in `.versions/`:
```
proj/local/mobilytik/.versions/
├── myFunc_2025-01-01T10-00-00-000Z.axon
├── myFunc_2025-01-02T14-30-00-000Z.axon
└── myFunc_2025-01-03T09-15-00-000Z.axon
```

### 2. Enhanced Metadata Parsing

Extract rich metadata during sync (enabled by default):

```bash
SKYSPARK_ENHANCED_PARSING=true
```

Extracts:
- Function signatures (parameters, return types)
- Dependencies (called functions, tags, queries)
- Complexity metrics (LOC, cyclomatic complexity)
- Operations (reads, writes, commits)
- Documentation (comments, examples)
- Patterns (category, keywords, use case)
- Performance hints (loops, recursion)

### 3. Parallel Downloads

Adjust concurrency for your network:

```bash
# Conservative (slow network)
SKYSPARK_SYNC_CONCURRENCY=5

# Aggressive (fast network)
SKYSPARK_SYNC_CONCURRENCY=50
```

---

## Integration with MCP Server

### Accessing Synced Functions

The MCP server automatically enriches function results with local source code:

```javascript
// When a function is searched/retrieved
const func = await searchFunction("myFunc");

// If source is missing, server checks:
// 1. proj/<instance>/<project>/func/<name>.axon
// 2. If found, enriches function with source code
// 3. Returns complete function object
```

### Benefits

- **Faster responses**: No network calls for source code
- **Offline capability**: Access functions without SkySpark running
- **Version control**: Track changes over time
- **Rich search**: Full-text search across all function code
- **Metadata extraction**: Enhanced function analysis

---

## Workflow Examples

### First-Time Setup

```bash
# 1. Enable auto-sync in .env
echo "SKYSPARK_AUTO_SYNC_FUNCTIONS=true" >> .env

# 2. Start the server (will auto-sync)
npm start
```

### Daily Development

```bash
# Server auto-syncs on each start
npm start

# Or manually sync if server is already running
npm run sync local mobilytik
```

### After Major Changes

```bash
# Force re-download everything
npm run sync local mobilytik -- --force
```

### Checking Sync Status

```bash
# List all synced projects
npm run sync -- --list

# Check specific project stats
npm run sync local mobilytik -- --stats
```

### Multi-Project Setup

```bash
# Sync multiple projects
npm run sync local mobilytik
npm run sync local demo
npm run sync prod mainProject

# Or enable auto-discovery to sync all
SKYSPARK_AUTO_DISCOVER=true npm start
```

---

## Troubleshooting

### Issue: Functions not syncing

**Check:**
1. Environment variables are set correctly
2. SkySpark instance is running and accessible
3. Credentials are valid
4. Project exists in SkySpark

**Solution:**
```bash
# Test connection
curl http://localhost:8080/api/mobilytik/about

# Force sync
npm run sync local mobilytik -- --force
```

### Issue: Sync is slow

**Check:**
1. Network connection to SkySpark
2. Concurrency setting
3. Number of functions

**Solution:**
```bash
# Increase concurrency
SKYSPARK_SYNC_CONCURRENCY=20 npm run sync local mobilytik
```

### Issue: Outdated functions

**Check:**
1. Modification time detection
2. Local files modified manually

**Solution:**
```bash
# Force re-download
npm run sync local mobilytik -- --force
```

### Issue: Missing metadata

**Check:**
1. `.sync-metadata.json` exists
2. Enhanced parsing is enabled

**Solution:**
```bash
# Enable enhanced parsing
export SKYSPARK_ENHANCED_PARSING=true

# Force sync
npm run sync local mobilytik -- --force
```

---

## Performance Tips

1. **Use Smart Sync**: Only downloads what changed
2. **Adjust Concurrency**: Balance speed vs. server load
3. **Enable Caching**: Keep `.sync-metadata.json`
4. **Schedule Syncs**: Run during off-peak hours
5. **Filter Projects**: Sync only needed projects

---

## API Reference

### FunctionSyncManagerEnhanced

```typescript
class FunctionSyncManagerEnhanced {
  // Smart sync with modification time checking
  async syncFunctions(
    client: HaystackSkySparkClient,
    instance: string,
    project: string,
    options?: {
      force?: boolean;        // Force re-download all
      silent?: boolean;       // Suppress output
      checkModTime?: boolean; // Check mod times
      concurrency?: number;   // Parallel downloads
    }
  ): Promise<SyncResult>

  // Fast sync (existence check only)
  async syncFunctionsFast(
    client: HaystackSkySparkClient,
    instance: string,
    project: string,
    options?: {
      force?: boolean;
      silent?: boolean;
    }
  ): Promise<FastSyncResult>

  // Check if synced
  async isSynced(
    instance: string,
    project: string,
    maxAge?: number
  ): Promise<boolean>

  // Get function source from local file
  async getFunctionSource(
    instance: string,
    project: string,
    functionName: string
  ): Promise<string | null>

  // List synced projects
  async listSyncedProjects(): Promise<Array<ProjectInfo>>

  // Get sync statistics
  async getSyncStats(
    instance: string,
    project: string
  ): Promise<SyncStats | null>
}
```

---

## Next Steps

1. **Enable Auto-Sync**: Add `SKYSPARK_AUTO_SYNC_FUNCTIONS=true` to `.env`
2. **Start Server**: Run `npm start` to trigger initial sync
3. **Verify Files**: Check `proj/<instance>/<project>/func/` directory
4. **Use CLI**: Manually sync when needed with `npm run sync`
5. **Monitor**: Use `npm run sync -- --list` to check sync status

---

## Related Documentation

- [Binding Markers Support](./BINDING-MARKERS-SUPPORT.md) - SkySpark binding markers
- [Enhanced Parser Guide](./ENHANCED-PARSER-GUIDE.md) - Parser capabilities
- [MCP Server Documentation](../README.md) - Main server docs

---

**Happy syncing! 🚀**
