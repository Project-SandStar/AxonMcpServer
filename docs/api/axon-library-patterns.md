# Axon Library Pattern Analysis

## Source
Analysis of `/Users/<user>/Code/axon_library_2025/axon-library`

## Key Findings

### Common Patterns

#### 1. **Function Signatures**
```axon
(parameter1, parameter2, optionalParam: defaultValue) => do
  // function body
end
```

#### 2. **Energy Consumption Patterns**
- **hisRead** for reading historical data: `point.hisRead(dateRange)`
- **hisRollup** for aggregation: `.hisRollup(sum, 1mo)`
- **Unit conversion**: `value.as(unit)`
- **Cost calculation**: `kwh * rate`
- **Year-over-year comparison**: Using `currentYear` and `pastYear - 1yr`

Example from `dg_homeMonthlyConsumption.axon`:
```axon
kwhPointMain: read(energy and equipRef->siteMeter and siteRef->id == sites->id)
mainkwhCurrent: kwhPointMain.hisRead(currentYear).hisRollup(sum, 1mo)
```

#### 3. **HVAC Fault Detection Patterns**
- **Period finding**: `hisFindPeriods(condition)`
- **Period intersection**: `hisPeriodIntersection([period1, period2, period3])`
- **Temperature differential**: `ahuTempDiff(temp1, temp2, dates)`
- **Tolerance checking**: `diff.abs > tolerance`

Example from `ahuOutsideDamperStuckClosed.axon`:
```axon
fanOn: ahuFanPeriods(ahu, dates)
damperOpen: ahuEconPeriods(ahu, dates, 70..100)
tempPeriods: ahuTempDiff(outsideTemp, mixedTemp, dates).hisFindPeriods(match)
hisPeriodIntersection([fanOn, damperOpen, tempPeriods])
```

#### 4. **Equipment Cycling Detection**
- **Minimum on/off times**: `minOffTime: 5min`, `minOnTime: 5min`
- **Time conversion**: `minOffTime.to(1h)`
- **Period filtering**: `findAll row => row["v0"] < minOffTime`
- **Period union**: `hisPeriodUnion([periods])`

#### 5. **Error Handling**
```axon
try do
  // main logic
end
catch
  // fallback logic
end
```

#### 6. **Data Filtering Patterns**
- **Equipment filtering**: `readAll(energy and equipRef->siteMeter)`
- **Point resolution**: `equipToPoints.has("tagName")`
- **Site-specific**: `siteRef->id == sites->id`

#### 7. **Common Parameters**
- `dates`: Date range for historical queries (any valid hisRead range)
- `tolerance`: Numeric threshold (often with default)
- `percentage`: Decimal multiplier for calculations
- `rec` or `equip`: Equipment record or grid
- `points`: Point or grid of points

#### 8. **Unit Handling**
- Check metric: `if (isMetric(point)) 4Δ°C else 8Δ°F`
- Unit conversion: `value.as(targetUnit)`
- Delta units: `Δ°C`, `Δ°F` for temperature differences

#### 9. **Grid Operations**
- **Join**: `joinAll([grid1, grid2], "columnName")`
- **Map**: `grid.map(row => {...})`
- **Add metadata**: `.addColMeta("colName", {dis: "Display Name"})`
- **Column folding**: `hisFoldCols(sum)` for combining columns

#### 10. **Output Formatting**
- **Month format**: `row["ts"].format("MMM")`
- **Rounding**: `value.round`
- **Grid creation**: `toGrid`

## Template Creation Guidelines

### 1. **Parameter Definitions**
```yaml
parameters:
  - name: equipmentFilter
    type: string
    description: "Filter expression for equipment (e.g., 'ahu', 'chiller and plant')"
    required: true
    examples: ["ahu", "chiller", "elecMeter"]
    
  - name: dateRange
    type: string
    description: "Date range for analysis (e.g., 'today', 'lastMonth', 'lastYear')"
    default: "today"
    examples: ["today", "lastWeek", "lastMonth", "2024-01-01..2024-12-31"]
```

### 2. **Template Structure**
```yaml
id: unique-template-id
name: Human Readable Name
category: energy|hvac|fault|data
description: Brief description of what the template does
tags: [relevant, search, tags]

parameters:
  # parameter definitions

template: |
  ({{param1}}, {{param2}}) => do
    // Axon code with {{placeholders}}
  end

examples:
  - name: Example scenario name
    description: What this example demonstrates
    params:
      param1: "example value"
      param2: 100
```

### 3. **Best Practices from Library**
1. Always include error handling with try/catch where appropriate
2. Use optional parameters with sensible defaults
3. Handle both metric and imperial units
4. Include tolerance parameters for fault detection
5. Use period operations for temporal analysis
6. Format output grids with proper column metadata
7. Include comments explaining complex logic
8. Use consistent naming conventions (camelCase)

### 4. **Common Use Cases**
- Energy: Consumption analysis, cost calculation, baseline comparison
- HVAC: Performance metrics, fault detection, optimization
- Fault: Sensor failures, equipment offline, comfort violations
- Data: Export, bulk updates, reporting

## Next Steps
Use these patterns to create production-ready templates that:
1. Follow observed conventions
2. Include realistic defaults
3. Handle edge cases
4. Provide clear examples
5. Are immediately usable in real projects