# Common Axon Patterns

This document describes common patterns found in the Axon codebase that the MCP server can help you discover.

## 1. Energy Monitoring Patterns

### Basic kWh Consumption
```axon
// Calculate total energy consumption for a period
(site, dates) => do
  meter: read(elec and siteMeter and siteRef == site->id)
  meter.hisRead(dates).foldCol("v0", sum)
end
```

### Energy Cost Calculation
```axon
// Convert kWh to cost with rate
(kwh, rate: 0.12$) => do
  kwh * rate
end
```

## 2. HVAC Control Patterns

### Temperature Setpoint Control
```axon
// Determine active setpoint based on occupancy
(zone, occupied) => do
  if (occupied)
    zone->coolingSpOcc
  else
    zone->coolingSpUnocc
end
```

### VAV Damper Control
```axon
// Calculate damper position based on space temp
(spaceTemp, setpoint, minPos: 20%, maxPos: 100%) => do
  error: spaceTemp - setpoint
  
  if (error > 2°F) maxPos
  else if (error < -2°F) minPos
  else minPos + ((error + 2) / 4) * (maxPos - minPos)
end
```

## 3. Meter Data Analysis

### Detect Zero Readings
```axon
// Find periods of zero meter readings
(meter, dates) => do
  his: meter.hisRead(dates)
  zeros: his.filter(row => row->v0 == 0)
  if (zeros.size > 0) {count: zeros.size, periods: zeros}
  else null
end
```

### Calculate Peak Demand
```axon
// Find peak demand in a period
(meter, dates) => do
  meter.hisRead(dates)
    .hisRollup(max, 15min)
    .foldCol("v0", max)
end
```

## 4. Fault Detection (Sparks)

### Simultaneous Heating and Cooling
```axon
// Detect when both heating and cooling are active
(ahu) => do
  heatValve: read(hot and water and valve and cmd and equipRef == ahu->id)
  coolValve: read(chilled and water and valve and cmd and equipRef == ahu->id)
  
  history: readAll([heatValve, coolValve]).hisRead(yesterday)
  
  history.findAll(row => row->v0 > 10% and row->v1 > 10%)
end
```

### Equipment Runtime Analysis
```axon
// Calculate equipment runtime hours
(equip, dates) => do
  status: read(run and sensor and equipRef == equip->id)
  status.hisRead(dates)
    .hisFindPeriods(v => v == true)
    .foldCol("dur", sum)
end
```

## 5. Data Aggregation

### Site Summary Report
```axon
// Generate site summary statistics
(site, dates) => do
  meters: readAll(meter and siteRef == site->id)
  
  meters.map(meter => do
    consumption: meter.hisRead(dates).foldCol("v0", sum)
    {
      meter: meter->dis,
      consumption: consumption,
      unit: meter->unit
    }
  end)
end
```

### Monthly Rollup
```axon
// Aggregate data by month
(point, year) => do
  point.hisRead(year)
    .hisRollup(sum, 1mo)
    .map(row => {
      month: row->ts.month,
      total: row->v0
    })
end
```

## 6. Scheduling and Time-based Logic

### Occupancy Schedule Check
```axon
// Check if current time is within occupied hours
(schedule) => do
  now: now()
  todaySchedule: schedule[now.date]
  
  if (todaySchedule == null) false
  else now.time >= todaySchedule->start and now.time <= todaySchedule->end
end
```

## Using These Patterns

To find similar patterns in the MCP server:

1. Search by category:
   ```
   searchAxonExamples({ category: "energy" })
   ```

2. Search by keyword:
   ```
   searchAxonExamples({ keyword: "meter" })
   ```

3. Get specific example:
   ```
   getAxonExample({ identifier: "meterOccUsage" })
   ```