# Binding Marker Support in Axon Parser

## Overview
The enhanced Axon parser (`axon-parser-full.js`) fully supports all SkySpark binding markers used in `defcomp` slot definitions. These markers control how slots bind to data, handle changes, and produce output.

## Supported Binding Markers

### 1. `readonly`
**Type:** Marker (no value)  
**Purpose:** Marks a slot as read-only output  
**Usage:**
```axon
out: {readonly}
```
**Description:** Indicates this slot is computed by the component and should not be set externally. Typically used for output slots in all rule types.

---

### 2. `bind`
**Type:** String value  
**Purpose:** Binds slot to Haystack query result  
**Usage:**
```axon
sensor: {bind:"point and temp and sensor"}
equipment: {bind:"equip and ahu and siteRef=={{target->siteRef}}"}
```
**Description:** Executes the Haystack filter query and binds the result(s) to this slot. Supports template interpolation with `{{slot->tag}}` syntax.

**Common Patterns:**
- `{bind:"point and sensor and equipRef=={{target->id}}"}`
- `{bind:"point and {{pointType}} and siteRef=={{target->siteRef}}"}`
- `{bind:"equip and hvac and floor and siteRef=={{site->id}}"}`

---

### 3. `bindOut`
**Type:** String value  
**Purpose:** Binds output slot to a target point for writing  
**Usage:**
```axon
out: {bindOut:"point and computed and equipRef=={{target->id}}"}
```
**Description:** Specifies which point(s) should receive the computed output value. Used in Cur Rules to write results back to points.

---

### 4. `watch`
**Type:** Marker (no value)  
**Purpose:** Watches for value changes to trigger rule execution  
**Usage:**
```axon
in: {bind:"point and door and equipRef=={{target->id}}", watch}
```
**Description:** Causes the rule to execute whenever the bound slot's `curVal` changes. Essential for Cur Rules that react to real-time data changes.

---

### 5. `toCurVal`
**Type:** Marker (no value)  
**Purpose:** Writes output to the curVal of target point(s)  
**Usage:**
```axon
out: {bindOut:"point and status", toCurVal}
```
**Description:** When combined with `bindOut`, writes the computed value to the `curVal` tag of the bound point. Used for real-time status updates.

---

### 6. `bindTuning`
**Type:** String value  
**Purpose:** Creates a tunable parameter that can be customized per equipment  
**Usage:**
```axon
threshold: {bindTuning:"tempThreshold", defVal: 72}
doorOpen: {bindTuning:"doorOpen", defVal: 15min}
```
**Description:** Allows site-specific configuration of parameters. The tuning name can be set differently on each equipment the rule is bound to.

---

### 7. `defVal`
**Type:** Any value (number, string, duration, etc.)  
**Purpose:** Provides default value for tunable parameters  
**Usage:**
```axon
threshold: {bindTuning:"tempThreshold", defVal: 72}
timeout: {bindTuning:"timeout", defVal: 15min}
```
**Description:** Specifies the default value used when no site-specific tuning is configured. Always used with `bindTuning`.

---

## Parser Implementation

### How Markers Are Parsed

The parser treats slot metadata as dictionary expressions and extracts them into the slot's `meta` object:

```javascript
{
  name: "sensor",
  type: null,
  meta: {
    bind: {
      line: 10,
      col: 17,
      value: "point and sensor and temp",
      valueType: "string"
    }
  }
}
```

### Marker vs. Value Detection

- **Markers** (no value): Parsed as `{valueType: "marker", value: true}`
- **String values**: Parsed as `{valueType: "string", value: "..."}`
- **Numeric values**: Parsed as `{valueType: "number", value: "..."}`

### Multiple Markers

Multiple markers in one dict are fully supported:
```axon
input: {bind:"point and door", watch}
output: {bindOut:"point and status", toCurVal}
threshold: {bindTuning:"temp", defVal: 72}
```

Each marker becomes a separate entry in the slot's `meta` object.

## Rule Type Patterns

### Spark Rule Pattern
```axon
defcomp
  target: {}
  date: {}
  out: {readonly}
  sensor: {bind:"point and sensor and equipRef=={{target->id}}"}
  threshold: {bindTuning:"threshold", defVal: 100}
  do
    // Detection logic
    out = sensor.hisRead(date).findAll(x => x > threshold)
  end
end
```

**Key markers:** `readonly`, `bind`, `bindTuning`, `defVal`

---

### KPI Rule Pattern
```axon
defcomp
  target: {}
  date: {}
  out: {readonly}
  pt: {bind:"point and energy and equipRef=={{target->id}}"}
  do
    // Analytics logic
    his: pt.hisRead(date)
    out = toGrid([{avg: his.foldCol("v0", avg)}])
  end
end
```

**Key markers:** `readonly`, `bind`

---

### Cur Rule Pattern
```axon
defcomp
  target: {}
  in: {bind:"point and sensor and equipRef=={{target->id}}", watch}
  out: {bindOut:"point and computed and equipRef=={{target->id}}", toCurVal}
  do
    // Real-time transformation
    if (in["curVal"] != null)
      out = in["curVal"] * 1.8 + 32
    end
  end
end
```

**Key markers:** `bind`, `watch`, `bindOut`, `toCurVal`

---

## Template Interpolation

The parser preserves template interpolation syntax in bind strings:

```axon
{bind:"point and sensor and equipRef=={{target->id}}"}
{bind:"equip and siteRef=={{target->siteRef}}"}
```

These templates are evaluated by SkySpark at runtime when the rule is bound to equipment.

## Validation

The parser validates:
- ✅ Correct dictionary syntax `{key: value, marker}`
- ✅ Proper nesting of defcomp structure
- ✅ Do/end block balance
- ✅ Slot name uniqueness

The parser does **not** validate:
- ❌ Marker name correctness (e.g., typo in `bindTuning`)
- ❌ Haystack filter syntax in bind strings
- ❌ Template variable existence
- ❌ Logical correctness of marker combinations

Runtime validation requires a SkySpark connection.

## Testing

### Comprehensive Test
```bash
# Run the marker verification test
node test-verify-markers.js
```

**Output:**
```
🔍 Testing Binding Marker Parsing

✅ Successfully parsed defcomp with binding markers

Slots found: 7

📊 Marker Types Found:

  ✓ readonly        - Marks slot as read-only output
  ✓ bind            - Binds slot to Haystack query result
  ✓ watch           - Watches for value changes
  ✓ bindOut         - Binds output slot to target point
  ✓ toCurVal        - Writes to curVal of target point
  ✓ bindTuning      - Creates tunable parameter
  ✓ defVal          - Provides default value for tuning

✅ All binding markers parsed correctly!
```

### Parse Individual Files
```bash
# Parse defcomp with markers
node scripts/axon-parser-full.js my-rule.axon

# Show AST including marker details
node scripts/axon-parser-full.js my-rule.axon --ast
```

## Common Use Cases

### 1. Door Open Detection (Spark Rule)
```axon
door: {bind:"point and door and equipRef=={{target->id}}"}
doorOpen: {bindTuning:"doorOpen", defVal: 15min}
```

### 2. Energy Statistics (KPI Rule)
```axon
pt: {bind:"point and energy and total and equipRef=={{target->id}}"}
```

### 3. Real-time Value Conversion (Cur Rule)
```axon
in: {bind:"point and temp and sensor and equipRef=={{target->id}}", watch}
out: {bindOut:"point and temp and computed and equipRef=={{target->id}}", toCurVal}
```

### 4. Multi-point Monitoring
```axon
fan: {bind:"point and fan and cmd and equipRef=={{target->id}}"}
damper: {bind:"point and damper and cmd and equipRef=={{target->id}}"}
temp: {bind:"point and temp and sensor and equipRef=={{target->id}}"}
```

### 5. Site-level Aggregation
```axon
meters: {bind:"point and meter and energy and siteRef=={{target->siteRef}}"}
```

## Integration with Templates

All rule templates support binding markers:

```bash
# Generate Spark rule with bindings
generateAxonCode --template spark-rule-door-open \
  --ruleName "doorAlert" \
  --doorPointFilter "point and door and sensor"

# Generate KPI rule with bindings
generateAxonCode --template kpi-rule-energy-stats \
  --ruleName "energyKpi" \
  --pointFilter "point and energy and total"

# Generate Cur rule with bindings
generateAxonCode --template cur-rule-door-bool \
  --ruleName "doorBool" \
  --inputPointFilter "point and door" \
  --outputPointFilter "point and doorBool"
```

## Best Practices

1. **Always use `readonly` for output slots** - Prevents accidental modification
2. **Use template interpolation** - `{{target->id}}` ensures rules work across equipment
3. **Provide meaningful `defVal`** - Good defaults improve usability
4. **Combine `watch` + `toCurVal`** - For real-time reactive rules
5. **Use descriptive `bindTuning` names** - Makes site configuration clearer
6. **Test bind filters** - Verify they match expected points before deploying

## Troubleshooting

### Marker not recognized
- **Symptom:** Marker parsed as identifier instead of marker
- **Cause:** Missing braces or incorrect syntax
- **Solution:** Ensure `{markerName}` syntax

### Bind string template not interpolated
- **Symptom:** Literal `{{target->id}}` in output
- **Cause:** Parser preserves templates (correct behavior)
- **Solution:** SkySpark evaluates at runtime - no action needed

### Multiple values for one key
- **Symptom:** Only last value kept
- **Cause:** Duplicate keys in metadata dict
- **Solution:** Use unique key names

## References

- SkySpark Documentation: Spark Rules
- SkySpark Documentation: KPI Rules  
- SkySpark Documentation: Cur Rules
- Project Haystack: Filter Syntax
- `DEFCOMP_ENHANCEMENT.md` - DefComp parser implementation details

## Conclusion

The enhanced Axon parser provides complete support for all SkySpark binding markers, enabling:
- ✅ Automated rule generation
- ✅ Static analysis of rule definitions
- ✅ Template-based rule creation
- ✅ Validation before deployment
- ✅ Documentation extraction

All seven standard binding markers are parsed correctly and preserved in the AST for downstream processing.
