# Trio File Metadata Integration

**Date:** October 1, 2025  
**Status:** ✅ Fully Integrated with FlexSearch

---

## Overview

The Axon MCP server now fully reads and indexes `.trio` metadata files that accompany `.axon` function files. This metadata is integrated into FlexSearch, making function searches more intelligent and comprehensive.

## Trio File Structure

Trio files (`.trio`) contain metadata about Axon functions in a simple key-value format:

```trio
dis: "Calculate delta from temperature and current"
help: "Calculates the difference between temperature and current readings"
doc: "This function is used for energy calculations"
mod: "energyLib"
sparkRule
kpiRule
```

## Metadata Fields Extracted

### 1. **Description Fields**

| Trio Field | Maps To | Weight in Search | Usage |
|------------|---------|------------------|-------|
| `dis` | `description` | 1.5 | Short display name/description |
| `help` | `documentation` | 1.8 | Detailed help text |
| `doc` | `documentation` | 1.8 | Additional documentation |

### 2. **Rule Type Markers**

| Trio Marker | Tags Added | Category Override |
|-------------|------------|-------------------|
| `sparkRule` | `sparkRule`, `rule` | `SPARK_ANALYSIS` |
| `kpiRule` | `kpiRule`, `rule`, `kpi` | - |
| `curRule` | `curRule`, `rule` | - |
| `ruleOn` | `rule` | - |

### 3. **Function Type Detection**

| Pattern | Tag Added | Detection Method |
|---------|-----------|------------------|
| `defcomp` in source | `defcomp` | Source code scan |
| In `proj/` directory | `synced`, `skyspark` | File path |

### 4. **Project Context**

Automatically extracts and tags:
- **Instance name** (e.g., `local`, `production`, `demoInstance`)
- **Project name** (e.g., `akpizza`, `demo`)
- **Module name** from `mod` field

---

## FlexSearch Integration

### Indexed Fields

FlexSearch now indexes trio metadata across multiple fields:

```typescript
{
  name: "calculateDeltaFromTempCur",           // From .axon file
  description: "Calculate delta from...",      // From trio 'dis'
  documentation: "Calculates the difference...", // From trio 'help'/'doc'
  tags: "sparkRule rule kpi michealsEnergy akpizza", // From trio markers
  parameters: "point timeRange",               // From .axon parsing
  category: "SPARK_ANALYSIS",                  // From trio sparkRule
  projectContext: "michealsEnergy akpizza"    // From file path/tags
}
```

### Field Weights

The search ranking gives appropriate weight to trio metadata:

| Field | Weight | Trio Source |
|-------|--------|-------------|
| Name | 5.0 | `.axon` filename |
| Parameters | 3.0 | `.axon` parsing |
| Tags | 2.5 | Trio markers |
| Category | 2.0 | Trio rule types |
| **Documentation** | **1.8** | **Trio `help`/`doc`** ✨ |
| **Description** | **1.5** | **Trio `dis`** ✨ |
| Project Context | 1.2 | File path + tags |
| Source Code | 0.8 | `.axon` content |

---

## Search Examples

### 1. Search by Trio Description

```javascript
searchAxonExamples({ keyword: "delta temperature" })
```

Finds functions where trio `dis` or `help` contains "delta temperature".

### 2. Search by Rule Type

```javascript
searchAxonExamples({ 
  keyword: "sparkRule",
  tags: ["rule"]
})
```

Finds all Spark rules (trio marker: `sparkRule`).

### 3. Search by Documentation

```javascript
searchAxonExamples({ keyword: "energy calculation" })
```

Matches functions where trio `doc` or `help` contains "energy calculation".

### 4. Search by Module

```javascript
searchAxonExamples({ 
  keyword: "energyLib",
  tags: ["akpizza"]
})
```

Finds functions from `energyLib` module (trio `mod` field) in the akpizza project.

### 5. Combined Search

```javascript
searchAxonExamples({ 
  keyword: "kpi temperature",
  category: "SPARK_ANALYSIS"
})
```

Finds KPI rules (trio `kpiRule`) related to temperature.

---

## Implementation Details

### Trio Parsing

The `parseTrioMetadata()` method extracts metadata from `.trio` files:

```typescript
private parseTrioMetadata(trioContent: string): any {
  const metadata: any = {};
  const lines = trioContent.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;
    
    // Marker tags (no value)
    if (!trimmed.includes(':')) {
      metadata[trimmed] = true;
      continue;
    }
    
    // Key:value pairs
    const [key, ...valueParts] = trimmed.split(':');
    let value = valueParts.join(':').trim();
    
    // Remove quotes
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    
    metadata[key.trim()] = value || true;
  }
  
  return metadata;
}
```

### Integration Points

Trio metadata is loaded and indexed at three points:

1. **During indexSyncedFunctions()** - When indexing from `proj/` directory
2. **During indexProjectFunctions()** - When building project-specific indexes
3. **During loadProjectCaches()** - Functions loaded from cache already include trio metadata

### FlexSearch Document Structure

```typescript
const searchDoc = {
  id: func.id,
  name: func.name,
  description: func.description || '',        // trio 'dis'
  documentation: func.documentation || '',    // trio 'help'/'doc'
  tags: func.tags.join(' '),                  // includes trio markers
  category: func.category,                    // may be set by trio
  parameters: (func.parameters || []).join(' '),
  sourceCode: func.sourceCode.substring(0, 500),
  projectContext: this.buildProjectContext(func)
};
```

---

## Benefits

### Before (without trio metadata in search)
- ❌ Could only search by function name
- ❌ No access to descriptions in search
- ❌ Couldn't filter by rule types
- ❌ Missing contextual help text

### After (with trio metadata in FlexSearch)
- ✅ Search by description (`dis` field)
- ✅ Search by help text (`help` field)
- ✅ Search by documentation (`doc` field)
- ✅ Filter by rule types (`sparkRule`, `kpiRule`, etc.)
- ✅ Search by module name (`mod` field)
- ✅ Better ranking based on comprehensive metadata

---

## Example Function with Trio Metadata

### File: `proj/michealsEnergy/akpizza/func/calculateDeltaFromTempCur.axon`

```axon
(point, timeRange) => do
  temp: hisRead(point->tempSensor, timeRange)
  cur: hisRead(point->currentSensor, timeRange)
  temp - cur
end
```

### File: `proj/michealsEnergy/akpizza/func/calculateDeltaFromTempCur.trio`

```trio
dis: "Calculate Delta from Temperature and Current"
help: "Calculates the difference between temperature and current sensor readings for energy analysis"
doc: "Used in energy consumption calculations. Returns the delta between two sensor values over a time range."
mod: "energyLib"
sparkRule
kpiRule
```

### Resulting Indexed Function

```json
{
  "id": "de2056...-michealsEnergy-akpizza",
  "name": "calculateDeltaFromTempCur",
  "description": "Calculate Delta from Temperature and Current",
  "documentation": "Calculates the difference between temperature...",
  "tags": ["sparkRule", "rule", "kpiRule", "kpi", "michealsEnergy", "akpizza", "energyLib"],
  "category": "SPARK_ANALYSIS",
  "parameters": ["point", "timeRange"],
  "filePath": "proj/michealsEnergy/akpizza/func/calculateDeltaFromTempCur.axon"
}
```

### Search Queries That Match

All of these will find this function:

```javascript
// By name
searchAxonExamples({ keyword: "delta" })

// By description
searchAxonExamples({ keyword: "temperature current" })

// By documentation
searchAxonExamples({ keyword: "energy consumption" })

// By rule type
searchAxonExamples({ tags: ["sparkRule"] })

// By module
searchAxonExamples({ keyword: "energyLib" })

// By project
searchAxonExamples({ tags: ["akpizza"] })

// Combined
searchAxonExamples({ 
  keyword: "delta energy",
  category: "SPARK_ANALYSIS",
  tags: ["kpi"]
})
```

---

## Trio File Best Practices

### 1. Always Include `dis`
```trio
dis: "Short, clear description"
```

### 2. Add Detailed `help` for Complex Functions
```trio
help: "Detailed explanation of what the function does, its parameters, and return value"
```

### 3. Use `doc` for Additional Context
```trio
doc: "Usage examples, edge cases, performance notes"
```

### 4. Tag Rule Types Appropriately
```trio
sparkRule    # For Spark analytics rules
kpiRule      # For KPI calculations
curRule      # For current value rules
```

### 5. Specify Module for Organization
```trio
mod: "energyLib"    # Groups related functions
```

---

## Caching

Trio metadata is included in the function cache files:

```json
{
  "functions": [
    [
      "function-id",
      {
        "name": "functionName",
        "description": "From trio dis",
        "documentation": "From trio help/doc",
        "tags": ["sparkRule", "rule", ...],
        ...
      }
    ]
  ]
}
```

This means trio metadata is preserved across server restarts and doesn't need to be re-parsed unless the `.trio` file changes.

---

## Future Enhancements

Potential improvements to trio integration:

1. ⬜ Support more trio fields (`lib`, `version`, `author`)
2. ⬜ Parse trio function signatures for parameter types
3. ⬜ Extract example usage from trio `example` field
4. ⬜ Support trio references/links to other functions
5. ⬜ Validate trio syntax and show warnings
6. ⬜ Generate trio files from function analysis
7. ⬜ Support trio includes/imports

---

## Troubleshooting

### "Trio metadata not appearing in search"

1. Check if `.trio` file exists next to `.axon` file
2. Verify trio file is properly formatted (key: value pairs)
3. Restart server to rebuild FlexSearch index
4. Check logs for "Indexed X synced functions"

### "Rule types not being detected"

Make sure trio markers have no colons:
```trio
✅ sparkRule
❌ sparkRule:
❌ sparkRule: true
```

### "Description not showing in results"

- Check that `dis` field is quoted: `dis: "Description here"`
- Verify no syntax errors in trio file
- Clear cache and rebuild: delete `.cache/` directory

---

## References

- Trio file format: SkySpark documentation
- Implementation: `src/index.ts` → `parseTrioMetadata()`
- FlexSearch integration: `src/search/flexSearchFunctionIndex.ts`
- Function indexing: `indexSyncedFunctions()`, `indexProjectFunctions()`
