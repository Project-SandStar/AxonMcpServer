# Roadmap: Integrate Proj Functions into searchAxonExamples

## Problem Statement

**Current Issue**: `searchAxonExamples` cannot find functions from SkySpark projects (stored in `proj/` directory) because:

1. Proj functions are synced to `proj/instance/project/func/*.axon` files
2. They are cached in **separate project-specific JSON files** (`.cache/axon-index-{instance}-{project}.json`)
3. During initialization, `indexSyncedFunctions()` only loads from the `proj/` directory if the files exist
4. The main `codeIndex` and `searchIndex` are built from the library code path, not from these cached proj functions
5. Result: Searching for "calculateDeltaFromTempCur" returns 0 results even though it exists in multiple projects

## Current Architecture

```
Initialization Flow:
1. Load main cache (library functions only)
2. Build searchIndex from codeIndex.functions
3. indexSyncedFunctions() scans proj/ directory
4. ❌ Individual project caches are NOT loaded into main index
```

## Solution Overview

**Goal**: Make proj functions searchable through `searchAxonExamples` by loading all project-specific caches into the main search index.

---

## Roadmap Tasks

### Phase 1: Load Project Caches into Main Index

#### Task 1.1: Create Project Cache Loader
**File**: `src/index.ts` - Add new method

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
    
    let loadedProjects = 0;
    let loadedFunctions = 0;
    
    for (const cacheFile of projectCacheFiles) {
      try {
        const cachePath = path.join(cacheDir, cacheFile);
        const cacheContent = await fs.readFile(cachePath, 'utf-8');
        const projectIndex = JSON.parse(cacheContent);
        
        // Extract instance/project from filename: axon-index-{instance}-{project}.json
        const match = cacheFile.match(/^axon-index-(.+)-(.+)\.json$/);
        const [, instance, project] = match || [];
        
        // Merge functions into main index
        if (projectIndex.functions && Array.isArray(projectIndex.functions)) {
          for (const funcEntry of projectIndex.functions) {
            if (Array.isArray(funcEntry) && funcEntry.length === 2) {
              const [funcId, func] = funcEntry;
              
              // Skip if already exists
              if (this.codeIndex.functions.has(funcId)) continue;
              
              // Add project context tags
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
      } catch (error) {
        console.error(`  ⚠️  Failed to load ${cacheFile}:`, error.message);
      }
    }
    
    if (loadedProjects > 0) {
      console.error(`  ✅ Loaded ${loadedFunctions} functions from ${loadedProjects} project caches`);
    }
  } catch (error) {
    console.error(`  ⚠️  Could not load project caches:`, error.message);
  }
}
```

#### Task 1.2: Integrate into Initialization
**File**: `src/index.ts` - Modify `initialize()` method

Add after line 3152 (`await this.indexSyncedFunctions();`):

```typescript
// Load project-specific caches
await this.loadProjectCaches();
```

**Priority**: HIGH  
**Effort**: 2 hours  
**Impact**: Immediate - proj functions become searchable

---

### Phase 2: Enhance Search Index for Proj Functions

#### Task 2.1: Add Source Filter to searchAxonExamples
**File**: `src/index.ts` - Update `searchExamples()` method

Add new parameter to SearchOptions:
```typescript
interface SearchOptions {
  keyword?: string;
  category?: string;
  tags?: string[];
  limit?: number;
  source?: 'library' | 'proj' | 'all'; // NEW
  instance?: string; // NEW - filter by instance
  project?: string; // NEW - filter by project
}
```

Update filter logic (around line 754):
```typescript
// Source filter
if (options.source === 'library' && func.tags.includes('skyspark-function')) {
  match = false;
}
if (options.source === 'proj' && !func.tags.includes('skyspark-function')) {
  match = false;
}

// Instance/Project filter
if (options.instance && !func.tags.includes(options.instance)) {
  match = false;
}
if (options.project && !func.tags.includes(options.project)) {
  match = false;
}
```

**Priority**: MEDIUM  
**Effort**: 1 hour  
**Impact**: Better search control

---

### Phase 3: Improve Metadata and Search Quality

#### Task 3.1: Enrich Proj Function Metadata
**File**: `src/sync/functionSyncManagerEnhanced.ts`

Enhance metadata saved in project caches to include:
- Instance and project names as top-level fields
- Function type (rule, defcomp, task, etc.)
- Better descriptions from trio files
- Usage frequency (if tracked)

#### Task 3.2: Better Tokenization for DefComps
**File**: `src/search/searchIndex.ts`

Current tokenization might miss camelCase. Enhance `tokenize()`:
```typescript
private tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  
  // Split camelCase: "calculateDelta" -> ["calculate", "Delta"]
  const camelCaseSplit = text.replace(/([a-z])([A-Z])/g, '$1 $2');
  
  // Split on non-alphanumeric
  const words = camelCaseSplit.toLowerCase().split(/[^a-z0-9]+/);
  
  for (const word of words) {
    if (word.length >= this.minTokenLength) {
      tokens.add(word);
      // Add prefixes for partial matching
      for (let i = this.minTokenLength; i < word.length; i++) {
        tokens.add(word.substring(0, i));
      }
    }
  }
  
  return tokens;
}
```

**Priority**: MEDIUM  
**Effort**: 2 hours  
**Impact**: Better search quality

---

### Phase 4: Real-time Updates (Optional)

#### Task 4.1: Watch for Project Cache Changes
Add file watcher for `.cache/axon-index-*.json` files to auto-reload when projects are synced.

**Priority**: LOW  
**Effort**: 3 hours  
**Impact**: Convenience

---

## Implementation Order

### Sprint 1 (Immediate - 3 hours)
1. ✅ **Task 1.1**: Create `loadProjectCaches()` method
2. ✅ **Task 1.2**: Integrate into initialization
3. ✅ **Test**: Search for "calculateDeltaFromTempCur" should return results

### Sprint 2 (Week 2 - 3 hours)
4. **Task 2.1**: Add source/instance/project filters
5. **Task 3.2**: Improve tokenization for camelCase
6. **Test**: Advanced filtering works correctly

### Sprint 3 (Optional - 5 hours)
7. **Task 3.1**: Enrich metadata
8. **Task 4.1**: Real-time updates
9. **Documentation**: Update README with new search capabilities

---

## Testing Checklist

- [ ] Search "calculateDeltaFromTempCur" returns 3 results (from different projects)
- [ ] Search "delta temp" returns partial matches
- [ ] Filter by instance: `{ keyword: "calculate", instance: "michealsEnergy" }`
- [ ] Filter by project: `{ keyword: "calculate", project: "kidsfoodbasket" }`
- [ ] Source filter works: `{ source: "proj" }` returns only proj functions
- [ ] Performance: Loading 100+ project caches doesn't slow initialization significantly

---

## Expected Results

**Before**:
```json
{
  "keyword": "calculateDeltaFromTempCur"
}
→ { "count": 0, "functions": [] }
```

**After Phase 1**:
```json
{
  "keyword": "calculateDeltaFromTempCur"
}
→ {
  "count": 3,
  "functions": [
    {
      "name": "calculateDeltaFromTempCur",
      "category": "sensor",
      "filePath": "proj/michealsEnergy/kidsfoodbasket/func/...",
      "tags": ["defcomp", "curRule", "michealsEnergy", "kidsfoodbasket"]
    },
    // ... more results
  ]
}
```

**After Phase 2**:
```json
{
  "keyword": "calculate",
  "source": "proj",
  "instance": "michealsEnergy"
}
→ Returns only functions from michealsEnergy instance
```

---

## Risk Mitigation

1. **Memory Usage**: Loading many project caches could increase memory
   - **Mitigation**: Add config option to limit max projects loaded
   
2. **Duplicate Functions**: Same function name across projects
   - **Mitigation**: Use unique IDs, include instance/project in results
   
3. **Stale Caches**: Project cache might be outdated
   - **Mitigation**: Check cache timestamps, add manual refresh option

---

## Success Metrics

- ✅ All proj functions are searchable via `searchAxonExamples`
- ✅ Search performance remains < 100ms for typical queries
- ✅ Zero breaking changes to existing API
- ✅ Memory usage increase < 50MB for 50 projects
