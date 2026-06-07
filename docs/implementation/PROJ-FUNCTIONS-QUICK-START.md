# Quick Start: Enable Proj Functions in Search (Phase 1)

## Goal
Make `searchAxonExamples` return results from SkySpark project functions stored in `.cache/axon-index-{instance}-{project}.json` files.

## Implementation (30 minutes)

### Step 1: Add the loadProjectCaches Method

**File**: `src/index.ts`

Add this method after the `indexSyncedFunctions()` method (around line 2985):

```typescript
/**
 * Load all project-specific caches into the main code index
 */
private async loadProjectCaches(): Promise<void> {
  const fs = await import('fs/promises');
  const cacheDir = this.config.cache?.directory || '.cache';
  
  try {
    const files = await fs.readdir(cacheDir);
    const projectCacheFiles = files.filter(f => 
      f.startsWith('axon-index-') && 
      f.endsWith('.json') &&
      f !== 'axon-index.json' // Skip main cache
    );
    
    if (projectCacheFiles.length === 0) {
      return; // No project caches to load
    }
    
    console.error(`\n📦 Loading project caches...`);
    let loadedProjects = 0;
    let loadedFunctions = 0;
    
    for (const cacheFile of projectCacheFiles) {
      try {
        const cachePath = path.join(cacheDir, cacheFile);
        const cacheContent = await fs.readFile(cachePath, 'utf-8');
        const projectIndex = JSON.parse(cacheContent);
        
        // Extract instance/project from filename: axon-index-{instance}-{project}.json
        const match = cacheFile.match(/^axon-index-(.+)-(.+)\.json$/);
        if (!match) continue;
        
        const [, instance, project] = match;
        
        // Merge functions into main index
        if (projectIndex.functions && Array.isArray(projectIndex.functions)) {
          for (const funcEntry of projectIndex.functions) {
            if (Array.isArray(funcEntry) && funcEntry.length === 2) {
              const [funcId, func] = funcEntry;
              
              // Skip if already exists (avoid duplicates)
              if (this.codeIndex.functions.has(funcId)) {
                continue;
              }
              
              // Ensure func has required fields
              if (!func.name || !func.filePath) continue;
              
              // Add project context tags if not already present
              if (!func.tags) func.tags = [];
              if (!func.tags.includes(instance)) func.tags.push(instance);
              if (!func.tags.includes(project)) func.tags.push(project);
              
              // Add to main index
              this.codeIndex.functions.set(funcId, func);
              loadedFunctions++;
              
              // Index by category
              if (!this.codeIndex.categories.has(func.category)) {
                this.codeIndex.categories.set(func.category, []);
              }
              this.codeIndex.categories.get(func.category)!.push(funcId);
              
              // Index by tags
              for (const tag of func.tags) {
                if (!this.codeIndex.tags.has(tag)) {
                  this.codeIndex.tags.set(tag, []);
                }
                this.codeIndex.tags.get(tag)!.push(funcId);
              }
            }
          }
          loadedProjects++;
        }
      } catch (error: any) {
        console.error(`  ⚠️  Failed to load ${cacheFile}:`, error.message);
      }
    }
    
    if (loadedProjects > 0) {
      console.error(`  ✅ Loaded ${loadedFunctions} functions from ${loadedProjects} project caches`);
    }
  } catch (error: any) {
    console.error(`  ⚠️  Could not load project caches:`, error.message);
  }
}
```

### Step 2: Call the Method During Initialization

**File**: `src/index.ts`

Find the `initialize()` method (around line 2987). Locate this line:

```typescript
// Index synced functions from proj/ directory if available
await this.indexSyncedFunctions();
```

Add the new method call **right after** it:

```typescript
// Index synced functions from proj/ directory if available
await this.indexSyncedFunctions();

// Load project-specific caches into main index
await this.loadProjectCaches();
```

### Step 3: Rebuild and Test

```bash
# Rebuild the project
npm run build

# Restart the MCP server
npm start
```

### Step 4: Verify It Works

Test with your MCP client or directly:

```json
{
  "tool": "searchAxonExamples",
  "arguments": {
    "keyword": "calculateDeltaFromTempCur"
  }
}
```

**Expected Result**:
```json
{
  "count": 3,
  "functions": [
    {
      "id": "19be9a0e101314ac99ab096e9520701c",
      "name": "calculateDeltaFromTempCur",
      "category": "sensor",
      "description": "",
      "filePath": "proj/michealsEnergy/kidsfoodbasket/func/calculateDeltaFromTempCur.axon",
      "tags": ["defcomp", "curRule", "michealsEnergy", "kidsfoodbasket"],
      "preview": "..."
    },
    // ... more results from other projects
  ]
}
```

## Verification Checklist

- [ ] Server starts without errors
- [ ] Console shows: "✅ Loaded N functions from M project caches"
- [ ] Search for exact function name returns results
- [ ] Search for partial name works (e.g., "calculate")
- [ ] Functions show correct instance/project in tags
- [ ] No duplicate results

## Troubleshooting

### No project caches loaded
**Check**: Do you have `.cache/axon-index-*.json` files?
```bash
ls -la .cache/axon-index-*.json
```

### Functions still not found
**Check**: Are functions actually in the cache files?
```bash
cat .cache/axon-index-michealsEnergy-kidsfoodbasket.json | jq '.functions | length'
```

### Errors during loading
**Check**: Cache file format
```bash
cat .cache/axon-index-michealsEnergy-kidsfoodbasket.json | jq '.functions[0]' | head -30
```

## Next Steps

Once Phase 1 is working:

1. **Phase 2**: Add filtering by instance/project
2. **Phase 3**: Improve camelCase tokenization
3. **Phase 4**: Add real-time cache reloading

See `PROJ-FUNCTIONS-SEARCH-ROADMAP.md` for complete roadmap.
