# DefComp Sync Strategy - Axon + Trio Metadata

## Overview
Synchronize SkySpark functions as both `.axon` source code AND `.trio` metadata files. This ensures all tags (dis, help, ruleOn, sparkRule, kpiRule, curRule) are properly preserved and can be applied when committing functions back to SkySpark.

## Problem Statement
When syncing defcomp functions from SkySpark:
- **Current:** Only `.axon` source code is saved
- **Issue:** Metadata tags (dis, help, ruleOn, sparkRule, etc.) are lost
- **Impact:** When committing function back, must manually re-add all tags

## Solution: Dual File Format

### For Each Function, Save Two Files:

1. **`functionName.axon`** - Source code
```axon
defcomp
  target: {}
  date: {}
  out: {readonly}
  sensor: {bind:"point and temp and equipRef=={{target->id}}"}
  threshold: {bindTuning:"threshold", defVal: 100}
  do
    readings: sensor.hisRead(date)
    out = readings.findAll(x => x > threshold)
  end
end
```

2. **`functionName.trio`** - Metadata tags
```trio
dis:"AHU Cool Failure"
help:"Unit is cooling, but temperature drop between return sensor and discharge sensor is under expected threshold"
name:"ahuCoolFailure"
ruleOn
sparkRule
ruleType:@sparkRule
src:
  /*
   Unit is cooling, but temperature drop between return sensor and 
   discharge sensor is under expected threshold
  */
  defcomp
    target: {}
    date: {}
    out: {readonly}
    sensor: {bind:"point and temp and equipRef=={{target->id}}"}
    threshold: {bindTuning:"threshold", defVal: 100}
    do
      readings: sensor.hisRead(date)
      out = readings.findAll(x => x > threshold)
    end
  end
```

## Rule Type Summary

### Spark Rule (sparkRule marker)
**Purpose:** Fault detection and anomaly analysis
**Common Tags:**
- `dis` - Display name
- `help` - Description of what fault it detects
- `ruleOn` - Rule is active
- `sparkRule` - Spark analysis marker
- `ruleType:@sparkRule` - Reference to rule type

**Typical Slots:**
- `target: {}` - Equipment to analyze
- `date: {}` - Date range for analysis
- `out: {readonly}` - Results output
- Data slots with `bind` - Input data sources
- Tuning slots with `bindTuning` - Configurable thresholds

**Examples:**
- Door open too long
- Temperature sensor failure
- Equipment cycling too frequently
- AHU cooling failure
- Excessive energy consumption

---

### KPI Rule (kpiRule marker)
**Purpose:** Calculate statistics and key performance indicators
**Common Tags:**
- `dis` - KPI name
- `help` - What metric is calculated
- `ruleOn` - Rule is active
- `kpiRule` - KPI calculation marker
- `ruleType:@kpiRule` - Reference to rule type

**Typical Slots:**
- `target: {}` - Equipment to analyze
- `date: {}` - Date range for calculation
- `out: {readonly}` - KPI results (usually Grid)
- Data slots with `bind` - Input points

**Output:** Usually returns Grid with statistics (min, max, avg, sum, etc.)

**Examples:**
- Energy consumption statistics
- Runtime hours
- Temperature averages
- Equipment utilization
- Performance ratios

---

### Cur Rule (curRule marker)
**Purpose:** Real-time value transformation and current state monitoring
**Common Tags:**
- `dis` - Transformation name
- `help` - What transformation does
- `ruleOn` - Rule is active  
- `curRule` - Current value rule marker
- `ruleType:@curRule` - Reference to rule type

**Typical Slots:**
- `target: {}` - Equipment context
- `in: {bind:"...", watch}` - Input with watch for changes
- `out: {bindOut:"...", toCurVal}` - Output writes to curVal

**Key Markers:**
- `watch` - Trigger on value change
- `toCurVal` - Write to point's curVal

**Examples:**
- Convert door sensor string to boolean
- Calculate derived values
- Status aggregation
- Unit conversions
- Threshold checking

## File Sync Structure

```
proj/
  <instance>/
    <project>/
      func/
        ahuCoolFailure.axon        # Source code
        ahuCoolFailure.trio        # Metadata + source
        energyKpiDaily.axon        # Source code
        energyKpiDaily.trio        # Metadata + source
        doorStatusBool.axon        # Source code
        doorStatusBool.trio        # Metadata + source
```

## Implementation Steps

### 1. Enhanced Sync Download
When downloading functions from SkySpark:

```typescript
async syncFunction(funcName: string) {
  // Get function record with ALL tags
  const funcRecord = await skysparkClient.eval(`
    read(func and name=="${funcName}")
  `);
  
  // Extract metadata
  const metadata = {
    dis: funcRecord.get('dis'),
    help: funcRecord.get('help'),
    name: funcRecord.get('name'),
    ruleOn: funcRecord.has('ruleOn'),
    sparkRule: funcRecord.has('sparkRule'),
    kpiRule: funcRecord.has('kpiRule'),
    curRule: funcRecord.has('curRule'),
    ruleType: funcRecord.get('ruleType'),
    // ... all other tags
  };
  
  // Get source code
  const source = await skysparkClient.getFunctionSource(funcName);
  
  // Save .axon file
  await fs.writeFile(`${funcName}.axon`, source);
  
  // Save .trio file with metadata + source
  const trioContent = buildTrioMetadata(metadata, source);
  await fs.writeFile(`${funcName}.trio`, trioContent);
}
```

### 2. Enhanced Index Building
When indexing, read both files:

```typescript
async parseFunction(funcName: string) {
  const axonSource = await fs.readFile(`${funcName}.axon`);
  const trioMeta = await fs.readFile(`${funcName}.trio`);
  
  // Parse trio to get tags
  const metadata = parseTrioFile(trioMeta);
  
  // Parse axon for structure
  const ast = parseAxonSource(axonSource);
  
  // Combine into enhanced function record
  return {
    name: funcName,
    source: axonSource,
    dis: metadata.dis,
    help: metadata.help,
    tags: metadata.tags,
    ruleType: metadata.ruleType,
    defcomp: analyzeDefComp(ast),
    bindings: extractBindings(ast),
    // ... all metadata
  };
}
```

### 3. Easy Commit Back
When committing function to SkySpark:

```typescript
async commitFunction(funcName: string) {
  // Read trio metadata
  const metadata = await readTrioFile(`${funcName}.trio`);
  
  // Read source
  const source = await fs.readFile(`${funcName}.axon`);
  
  // Build complete record with all tags
  const record = {
    ...metadata,
    src: source
  };
  
  // Commit to SkySpark - all tags included!
  await skysparkClient.eval(`
    diff(null, ${JSON.stringify(record)}, {add}).commit
  `);
}
```

## Benefits

1. **Complete Metadata Preservation**
   - All SkySpark tags preserved locally
   - No manual tag re-entry when committing
   - Version control for both code AND metadata

2. **Easy Commits**
   - `readAll(func)` returns complete records
   - Simple diff/commit workflow
   - All rule types properly tagged

3. **Better Search/Filter**
   - `readAll(func and sparkRule)` - Find all spark rules
   - `readAll(func and kpiRule)` - Find all KPI rules  
   - `readAll(func and curRule)` - Find all cur rules
   - `readAll(func and ruleOn)` - Find active rules

4. **Enhanced Indexing**
   - Index knows rule types
   - Can filter by functionality
   - Better categorization

5. **Documentation**
   - `dis` and `help` provide inline docs
   - Easy to see what each rule does
   - Better team collaboration

## Example Workflow

### Download Function
```bash
# Sync function from SkySpark
node sync-function.js michealsEnergy akpizza ahuCoolFailure

# Creates:
# proj/michealsEnergy/akpizza/func/ahuCoolFailure.axon
# proj/michealsEnergy/akpizza/func/ahuCoolFailure.trio
```

### Edit Function
```bash
# Edit source code
vim proj/michealsEnergy/akpizza/func/ahuCoolFailure.axon

# Metadata stays intact in .trio file
```

### Commit Back
```bash
# Commit with all metadata
node commit-function.js michealsEnergy akpizza ahuCoolFailure

# SkySpark receives:
# - Source code from .axon
# - All tags from .trio (dis, help, ruleOn, sparkRule, etc.)
```

### Query in SkySpark
```axon
// Find all spark rules
readAll(func and sparkRule)

// Find specific rule
read(func and name=="ahuCoolFailure")
  // Returns complete record with all tags:
  // dis: "AHU Cool Failure"
  // help: "Unit is cooling, but..."
  // ruleOn
  // sparkRule
  // src: <source code>
```

## Migration Plan

1. **Update sync manager** to save both `.axon` and `.trio`
2. **Update indexer** to read trio metadata  
3. **Update commit logic** to use trio tags
4. **Re-sync existing functions** to generate trio files
5. **Update templates** to include proper tags

## Template Updates

Update rule templates to include all necessary tags:

**Spark Rule Template:**
```trio
dis:"{{ruleName}}"
help:"{{helpText}}"
name:"{{functionName}}"
ruleOn
sparkRule
ruleType:@sparkRule
src:
  defcomp
    dis: "{{ruleName}}"
    help: "{{helpText}}"
    ruleOn
    sparkRule
    target: {}
    date: {}
    out: {readonly}
    // ... slots ...
    do
      // ... logic ...
    end
  end
```

**KPI Rule Template:**
```trio
dis:"{{kpiName}}"
help:"{{helpText}}"
name:"{{functionName}}"
ruleOn
kpiRule
ruleType:@kpiRule
src:
  defcomp
    dis: "{{kpiName}}"
    help: "{{helpText}}"
    ruleOn
    kpiRule
    target: {}
    date: {}
    out: {readonly}
    // ... slots ...
    do
      // ... calculation ...
    end
  end
```

**Cur Rule Template:**
```trio
dis:"{{ruleName}}"
help:"{{helpText}}"
name:"{{functionName}}"
ruleOn
curRule
ruleType:@curRule
src:
  defcomp
    dis: "{{ruleName}}"
    help: "{{helpText}}"
    ruleOn
    curRule
    target: {}
    in: {bind:"...", watch}
    out: {bindOut:"...", toCurVal}
    do
      // ... transformation ...
    end
  end
```

## Conclusion

By syncing both `.axon` source and `.trio` metadata:
- ✅ Complete metadata preservation
- ✅ Easy commits with all tags
- ✅ Better searchability in SkySpark  
- ✅ Proper rule type identification
- ✅ Version control for everything
- ✅ Simplified workflow

This approach ensures that `readAll(func)` returns fully-tagged records that can be easily filtered, analyzed, and committed back to SkySpark without losing any information.
