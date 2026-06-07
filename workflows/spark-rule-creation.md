---
title: Create Spark Rule
description: Step-by-step guide for creating a Spark rule with func and sparkRule records
category: fault-detection
tags: [spark, rule, fault, automation]
version: 1.0
---

# Create Spark Rule Workflow

## Overview

Spark rules are SkySpark's fault detection and diagnostic (FDD) rules that automatically monitor equipment and points for issues. A complete Spark rule requires creating TWO records that work together:

1. **Func Record**: Contains the Axon code logic that performs the actual fault detection
2. **SparkRule Record**: Configures how and where the rule should be applied

This workflow guides you through creating both records correctly.

## When to Use Spark Rules

Use Spark rules when you need to:
- Detect equipment faults automatically (e.g., simultaneous heating/cooling)
- Monitor point values for out-of-range conditions
- Track equipment performance issues
- Alert on abnormal operating conditions
- Implement continuous commissioning checks

## Prerequisites

Before creating a Spark rule, you need:

1. **Target Filter**: A Haystack filter defining what equipment/points the rule monitors
   - Examples: `ahu`, `point and temp`, `equip and chiller`
2. **Rule Logic**: The Axon code that detects the fault condition
3. **Unique Name**: A unique identifier for your rule function
4. **SkySpark Connection**: Active connection to execute the records

## Step 1: Create the Func Record

The func record contains the actual fault detection logic.

### Required Tags

| Tag | Type | Description | Example |
|-----|------|-------------|---------|
| `func` | Marker | Identifies this as a function record | `func` |
| `name` | String | Unique function name | `"simultaneousHeatingCooling"` |
| `src` | String | Axon code implementing the rule logic | `"(target) => ..."` |
| `ruleOn` | Filter | Target filter for entities this rule applies to | `ahu` |
| `ruleType` | Symbol | Must be `sparkRule` | `sparkRule` |

### Func Record Structure

```axon
{
  func,
  name: "uniqueRuleName",
  src: "(target) => do
    // Your fault detection logic here
    // Return fault level: 0 (ok), 1 (info), 2 (warning), 3 (alarm)
    if (condition) return 3  // Alarm
    return 0  // OK
  end",
  ruleOn: targetFilter,
  ruleType: sparkRule
}
```

### Important Notes

- **Function Signature**: Spark rule functions must accept a `target` parameter
- **Return Value**: Must return fault level (0-3)
  - `0` = OK (no fault)
  - `1` = Info (informational)
  - `2` = Warning
  - `3` = Alarm (critical fault)
- **Rule Logic**: Should check the target's points/data and determine fault state

## Step 2: Create the SparkRule Record

The sparkRule record configures how the rule is applied and displayed.

### Required Tags

| Tag | Type | Description | Example |
|-----|------|-------------|---------|
| `rule` | Marker | Identifies this as a rule record | `rule` |
| `dis` | String | Display name shown in SkySpark UI | `"Simultaneous Heating & Cooling"` |
| `ruleFunc` | String | Name of the func record (from Step 1) | `"simultaneousHeatingCooling"` |
| `ruleOn` | Filter | Same target filter as func record | `ahu` |

### Optional Tags

| Tag | Type | Description | Example |
|-----|------|-------------|---------|
| `help` | String | Detailed description of what the rule detects | `"Detects when heating and cooling..."` |
| `priority` | Number | Rule priority (higher = more important) | `2` |

### SparkRule Record Structure

```axon
{
  rule,
  dis: "Human Readable Rule Name",
  ruleFunc: "uniqueRuleName",  // Must match func name
  ruleOn: targetFilter,         // Must match func ruleOn
  help: "Description of what this rule detects and why it matters"
}
```

### Important Notes

- **ruleFunc Matching**: The `ruleFunc` value must EXACTLY match the `name` from the func record
- **ruleOn Matching**: The `ruleOn` filter must be IDENTICAL in both records
- **Display Name**: Choose a clear, descriptive name for operators

## Step 3: Execute the Records

Use the `executeAxonCode` tool to create both records in a single transaction using `commit()`.

### Batch Commit Syntax

```axon
commit([
  {func, name: "myRule", src: "...", ruleOn: ahu, ruleType: sparkRule},
  {rule, dis: "My Rule", ruleFunc: "myRule", ruleOn: ahu, help: "..."}
])
```

### Execution Steps

1. Prepare both record definitions
2. Wrap them in an array `[...]`
3. Pass to `commit()` function
4. Execute using `executeAxonCode` tool with your project name

### Error Handling

Common errors:
- **Name conflict**: Func name already exists → Choose unique name
- **Invalid filter**: `ruleOn` filter syntax error → Verify filter with `readAll(filter)`
- **Syntax error**: Axon code in `src` has errors → Test logic separately first
- **Mismatched references**: `ruleFunc` doesn't match func `name` → Double-check names

## Complete Example

Here's a complete example creating a rule that detects simultaneous heating and cooling in AHUs:

```axon
commit([
  // Func Record - The rule logic
  {
    func,
    name: "ahSimultaneousHeatCool",
    src: "(target) => do
      // Get heating and cooling outputs
      heating: readAll(point and hot and water and cmd and equipRef==target.id).first
      cooling: readAll(point and chilled and water and cmd and equipRef==target.id).first

      // Check if both are on
      if (heating != null and cooling != null) do
        heatVal: heating->curVal
        coolVal: cooling->curVal

        // If both valves > 20% open, it's a fault
        if (heatVal > 20 and coolVal > 20) return 3  // Alarm
        if (heatVal > 10 and coolVal > 10) return 2  // Warning
      end

      return 0  // OK
    end",
    ruleOn: ahu,
    ruleType: sparkRule
  },

  // SparkRule Record - The rule configuration
  {
    rule,
    dis: "Simultaneous Heating & Cooling",
    ruleFunc: "ahSimultaneousHeatCool",
    ruleOn: ahu,
    help: "Detects when an AHU is heating and cooling at the same time, which wastes energy and indicates a control problem. Triggers alarm when both heating and cooling valves are >20% open."
  }
])
```

## Verification

After creating the rule, verify it was created successfully:

Verify axon function validation with 

parseAxonAst MCP Tool to verify if the axon is valid.

Debug the rule with the function name 

Example function name is Discharge-Return Temperature Difference Fault

ruleDebug("rule",readAll(sparkRule).findAll x=>x->dis=="Discharge-Return Temperature Difference Fault")

Or call could be 

ruleDebug("rule",@p:demo:r:30e16e07-85599b1b)

After committing updated code, we need to make following calls.

ruleRosterRefresh()

ruleRecompute(null,null,[@p:demo:r:30e16e07-85599b1b],{})

```axon
// Check func record
readAll(func and name=="ahSimultaneousHeatCool")

// Check rule record
readAll(rule and ruleFunc=="ahSimultaneousHeatCool")

// Test rule execution on a target
read(ahu).ext.call("ahSimultaneousHeatCool")

```

## Success Parameters

When you see number of hits on the ruleDebug call that means spark is working.

Spark should be applied to equipment where points do exist. 

ruleStatus should not have Error at all. 



## Best Practices

1. **Test Logic First**: Develop and test your rule logic on a single target before creating the func record
2. **Descriptive Names**: Use clear, descriptive names that indicate what the rule checks
3. **Helpful Descriptions**: Write detailed `help` text so operators understand the fault
4. **Appropriate Levels**: Choose fault levels carefully (don't alarm for minor issues)
5. **Performance**: Keep rule logic efficient - it runs on all matching entities
6. **Error Handling**: Use null checks and safe navigation to handle missing points
7. **Version Control**: Document rule logic and changes in comments

## Troubleshooting

### Rule Not Running

- Check that `ruleOn` filter matches actual equipment
- Verify Spark engine is running: `sparks.status()`
- Check rule is enabled (not disabled)

### Rule Always Returns 0

- Test logic manually on a target: `read(ahu).ext.call("ruleName")`
- Verify point references are correct
- Check for null values in point reads

### Rule Creates Too Many Alarms

- Adjust thresholds in logic
- Add debounce logic to prevent flapping
- Change fault level from alarm (3) to warning (2)

## Related Workflows

- Equipment Setup Workflow (coming soon)
- Point Commissioning Workflow (coming soon)
- Rule Testing & Debugging Workflow (coming soon)

## Additional Resources

- SkySpark Spark Rules Documentation
- Axon Function Reference
- Haystack Tagging Conventions
