# Architecture: Proj Functions Integration

## Current State (Before Fix)

```
┌─────────────────────────────────────────────────────────────────┐
│                     Server Initialization                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │   Load Main Cache (.cache/axon-index.json)  │
        │   - Library functions from codePath      │
        │   - Documentation examples               │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │   Build codeIndex (Map<id, function>)   │
        │   - Only contains library functions     │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │   Build searchIndex from codeIndex      │
        │   - Tokenizes function metadata         │
        │   - Creates search tokens               │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │   indexSyncedFunctions()                │
        │   - Scans proj/ directory               │
        │   - Adds .axon files to codeIndex       │
        └─────────────────────────────────────────┘
                              │
                              ▼
                         ⚠️ PROBLEM ⚠️
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │   Project caches NEVER loaded!          │
        │                                         │
        │   .cache/axon-index-demoInstance-demo.json    │ ← 📦 NOT LOADED
        │   .cache/axon-index-local-test.json     │ ← 📦 NOT LOADED
        │   .cache/axon-index-prod-main.json      │ ← 📦 NOT LOADED
        └─────────────────────────────────────────┘
```

### Result: searchAxonExamples Cannot Find Project Functions

```
searchAxonExamples("calculateDeltaFromTempCur")
       │
       ▼
Search in codeIndex.functions
       │
       ├─ Library functions ✅ (found)
       ├─ Documentation examples ✅ (found, but filtered out)
       └─ Project functions ❌ (NOT IN INDEX)
       
Result: { count: 0, functions: [] }
```

---

## Proposed State (After Fix)

```
┌─────────────────────────────────────────────────────────────────┐
│                     Server Initialization                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │   Load Main Cache                       │
        │   - Library functions                   │
        │   - Documentation examples              │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │   Build Initial codeIndex               │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │   indexSyncedFunctions()                │
        │   - Scans proj/ directory               │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │   ✨ NEW: loadProjectCaches() ✨         │
        │                                         │
        │   For each .cache/axon-index-*.json:    │
        │   ├─ Parse JSON                         │
        │   ├─ Extract functions                  │
        │   ├─ Add instance/project tags          │
        │   └─ Merge into codeIndex               │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │   Build searchIndex from codeIndex      │
        │   - NOW includes project functions! ✅  │
        └─────────────────────────────────────────┘
```

### Result: searchAxonExamples Finds Everything

```
searchAxonExamples("calculateDeltaFromTempCur")
       │
       ▼
Search in codeIndex.functions
       │
       ├─ Library functions ✅
       ├─ Documentation examples ✅ (filtered out)
       └─ Project functions ✅ ← NOW FOUND!
              │
              ├─ michealsEnergy/kidsfoodbasket/calculateDeltaFromTempCur
              ├─ michealsEnergy/akpizza/calculateDeltaFromTempCur
              └─ michealsEnergy/walmartcostarica/calculateDeltaFromTempCur
       
Result: { count: 3, functions: [...] }
```

---

## Data Flow Diagram

### Project Function Lifecycle

```
┌───────────────────────────────────────────────────────────────────┐
│                        1. Function Sync                            │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼
        SkySpark Instance/Project
                │
                │ discoverProjectFunctions()
                │ syncFunctions()
                ▼
        proj/instance/project/func/
        ├─ calculateDelta.axon ─────────┐
        └─ calculateDelta.trio          │
                                        │
┌───────────────────────────────────────┼───────────────────────────┐
│                        2. Caching     │                            │
└───────────────────────────────────────┼───────────────────────────┘
                                        │
                                        ▼
        .cache/axon-index-instance-project.json
        {
          "functions": [
            [id, { name, sourceCode, tags, ... }]
          ]
        }
                                        │
┌───────────────────────────────────────┼───────────────────────────┐
│                      3. Indexing      │                            │
│                      (NEW PHASE)      │                            │
└───────────────────────────────────────┼───────────────────────────┘
                                        │
                                        ▼
                          loadProjectCaches()
                                        │
                                        ▼
                    Merge into codeIndex.functions
                                        │
                                        ▼
                          Build searchIndex tokens
                                        │
┌───────────────────────────────────────┼───────────────────────────┐
│                      4. Searching     │                            │
└───────────────────────────────────────┼───────────────────────────┘
                                        │
                                        ▼
                          searchAxonExamples()
                                        │
                                        ▼
                    ✅ Function is found and returned
```

---

## Cache File Structure

### Project Cache Format
```json
{
  "functions": [
    [
      "19be9a0e101314ac99ab096e9520701c",  ← Function ID
      {
        "id": "19be9a0e101314ac99ab096e9520701c",
        "name": "calculateDeltaFromTempCur",
        "filePath": "proj/michealsEnergy/kidsfoodbasket/func/calculateDeltaFromTempCur.axon",
        "sourceCode": "...",
        "category": "sensor",
        "tags": ["defcomp", "curRule", "skyspark-function"],
        "parameters": ["target", "in", "out"],
        ...
      }
    ],
    // More functions...
  ],
  "categories": { ... },
  "tags": { ... },
  "lastUpdated": "2025-10-01T03:10:00Z"
}
```

### Load Process
```
For each .cache/axon-index-{instance}-{project}.json:
  1. Parse JSON
  2. Extract functions array
  3. For each [id, func]:
     - Add tags: [instance, project]
     - Insert into codeIndex.functions
     - Update codeIndex.categories
     - Update codeIndex.tags
  4. Log progress
```

---

## Search Index Integration

### Before Fix
```
searchIndex tokens:
├─ "hvac" → [lib_func_1, lib_func_2]
├─ "energy" → [lib_func_3, lib_func_4]
└─ "calculate" → [] ← MISSING!
```

### After Fix
```
searchIndex tokens:
├─ "hvac" → [lib_func_1, lib_func_2]
├─ "energy" → [lib_func_3, lib_func_4]
└─ "calculate" → [
     lib_func_5,
     proj_func_1,  ← calculateDeltaFromTempCur (kidsfoodbasket)
     proj_func_2,  ← calculateDeltaFromTempCur (akpizza)
     proj_func_3   ← calculateDeltaFromTempCur (walmartcostarica)
   ]
```

---

## Implementation Impact

### Code Changes
- **1 new method**: `loadProjectCaches()` (~70 lines)
- **1 line added**: Call in `initialize()`
- **Total**: ~71 lines of code

### Performance Impact
- **Load time**: +200-500ms for 50 projects
- **Memory**: +30-50MB for 50 projects
- **Search time**: No change (same index structure)

### Compatibility
- ✅ No breaking changes
- ✅ Backward compatible
- ✅ Existing searches still work
- ✅ New project functions just appear

---

## Future Enhancements (Phase 2-4)

### Phase 2: Advanced Filtering
```typescript
searchAxonExamples({
  keyword: "calculate",
  source: "proj",           // NEW: Only project functions
  instance: "michealsEnergy", // NEW: Specific instance
  project: "kidsfoodbasket"  // NEW: Specific project
})
```

### Phase 3: Better Tokenization
```
"calculateDeltaFromTempCur"
    ↓
Tokenize with camelCase splitting
    ↓
["calculate", "delta", "from", "temp", "cur"]
    ↓
Better search matches!
```

### Phase 4: Real-time Updates
```
File watcher on .cache/
    │
    ├─ Cache file changed? → Reload that project
    ├─ New cache file? → Load new project
    └─ Cache deleted? → Remove from index
```
