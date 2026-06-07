# XETO and DefComp Mapping Roadmap

## Overview

This document provides a comprehensive roadmap for understanding and mapping between XETO specs, defcomp components, and SkySpark tools based on the Haxall source code analysis.

**Goal:** Enable the VSCode extension to intelligently work with both defcomp (Spark templates) and XETO specs, providing a clear migration path and tooling for equipment validation and code generation.

---

## Key Concepts from Haxall Source

### 1. **XETO (Xeto Data Specification System)**

XETO is the modern, type-safe data specification system in Haxall/SkySpark:

```fantom
// Core XETO APIs (from /Users/<user>/Code/haxall/src/core/xeto)
- LibNamespace: Container for XETO libraries and specs
- Spec: Data specification (types, slots, meta)
- fits(): Structural typing validation
- specFits(): Type-level structural validation
- XetoContext: Context for validation with database access
```

**Key Functions:**
- `fits(val, spec, opts)` - Check if instance fits spec structurally
- `specFits(specA, specB)` - Check if spec A fits spec B
- `fitsExplain(recs, spec, opts)` - Explain why fits pass/fail
- `fitsMatchAll(recs, specs, opts)` - Find all matching specs

### 2. **DefComp (Defined Components)**

DefComp is the Axon component system using Spark template syntax:

```axon
// From /Users/<user>/Code/haxall/src/doc/docHaxall/doc/Comps.fandoc
defcomp
  inA: {is:^number, defVal:0}
  inB: {is:^number, defVal:0}
  out: {is:^number, ro}
  do
    out = inA + inB
  end
end
```

**Key Characteristics:**
- Uses `defcomp` keyword
- Declares cells (inputs/outputs with metadata)
- Has `do` block for computation logic
- Cannot have parameters or return values (uses cells instead)

### 3. **Relationship Between XETO and DefComp**

```
┌────────────────────────────────────────────────────┐
│                  XETO Specs                        │
│  (Modern, Type-Safe, Structural Typing)            │
│                                                    │
│  - Equipment Types (ph::Ahu, ph::Vav)             │
│  - Point Types (ph::DischargeAirTempSensor)       │
│  - Relationship Queries (Equip.points)            │
│  - Choice Types (FluidType, DuctSection)          │
└────────────────────────────────────────────────────┘
                      ↕
              Validation & Matching
                      ↕
┌────────────────────────────────────────────────────┐
│              DefComp Components                    │
│  (Legacy, Spark Template Syntax)                   │
│                                                    │
│  - Equipment Templates (^ahu, ^vav)               │
│  - Point Requirements (mandatory/optional)        │
│  - Cell Definitions (inputs/outputs)              │
└────────────────────────────────────────────────────┘
                      ↕
              Applied to Records
                      ↕
┌────────────────────────────────────────────────────┐
│           SkySpark Database Records                │
│                                                    │
│  - Equipment Records (site, equip, ahu)           │
│  - Point Records (point, sensor, cmd)             │
│  - Tags and References (equipRef, siteRef)        │
└────────────────────────────────────────────────────┘
```

---

## Haxall Tools Analysis

### Tool 1: `xeto fits` Command

**Location:** `/Users/<user>/Code/haxall/src/tool/xetoTools/fan/FitsCmd.fan`

**Purpose:** Validate input data against XETO specs

**Usage:**
```bash
xeto fits recs.zinc            # Validate Zinc input file
xeto fits recs.json            # Validate Hayson input file
xeto fits recs.trio            # Validate Trio input file
xeto fits recs.trio -graph     # Validate graph queries (required points)
```

**How It Works:**
1. Reads input records (zinc/json/trio format)
2. Loads XETO namespace from data
3. For each record:
   - Reads `spec` tag (e.g., `spec: @ph::Ahu`)
   - Validates record against spec using `ns.fits()`
   - Reports errors/warnings
4. Outputs validation results

**Options:**
- `graph` - Check graph of query references (e.g., required points)
- `ignoreRefs` - Ignore if refs resolve to valid targets
- `outFile` - Output validation results to file

**Key Code:**
```fantom
ns.fits(rec, spec, opts)
// opts:
//   - explain: callback for logging validation issues
//   - haystack: use Haystack-level fidelity
//   - graph: validate relationship queries
//   - ignoreRefs: skip ref validation
```

### Tool 2: `xeto gen-axon` Command

**Location:** `/Users/<user>/Code/haxall/src/tool/xetoTools/fan/GenAxon.fan`

**Purpose:** Generate XETO function specs from Axon defined by Trio/Fantom

**Usage:**
```bash
xeto gen-axon hx          # Generate from hx pod
xeto gen-axon myPod       # Generate from custom pod
```

**How It Works:**
1. Scans pod for Axon functions
2. Reflects Fantom methods with `@Axon` facet
3. Reflects Trio function definitions
4. Generates XETO function specs

**Output Format:**
```xeto
// Generated function spec
funcName: Func <meta> { param1: Type1, param2: Type2, returns: ReturnType }
  --- axon
  // original axon code
  ---
```

### Tool 3: XETO Axon Functions

**Location:** `/Users/<user>/Code/haxall/src/ext/hxXeto/fan/XetoFuncs.fan`

**Key Functions for Equipment Validation:**

```axon
// Check if instance fits spec (structural typing)
fits(equipRec, Ahu)                          // >> true/false
fits(vav, MyVavSpec, {graph})                // >> validate with required points

// Explain why fits failed
fitsExplain(readAll(vav), G36ReheatVav)      // >> Grid with errors
fitsExplain(readAll(vav), G36ReheatVav, {graph})  // >> with point validation

// Find all matching specs
fitsMatchAll(readAll(equip))                 // >> Grid with matches per rec

// Query relationships
read(ahu).query(spec("ph::Equip.points"))    // >> single point
read(ahu).queryAll(spec("ph::Equip.points")) // >> Grid of points

// Named queries (map points by name)
read(ahu).queryNamed(spec("mylib::MyAhu.points"))
// >> {dat: {dis:"DAT",...}, rat: {dis:"RAT",...}}

// Spec information
specOf(equipRec)                             // >> ph::Ahu
specIs(Meter, Equip)                         // >> true (nominal)
specFits(Meter, Equip)                       // >> true (structural)
choiceOf({discharge, duct}, DuctSection)     // >> DischargeDuct
```

---

## Mapping Strategy: DefComp ↔ XETO

### Current State (SkySpark 3.1.x)

```axon
// DefComp Spark Template
defcomp ^ahu
  mandatory ^discharge ^air ^temp ^sensor ^point
  mandatory ^return ^air ^temp ^sensor ^point
  optional ^mixed ^air ^temp ^sensor ^point
  optional ^discharge ^air ^flow ^sensor ^point
end

// Applied to equipment
commit(diff(@ahuId, {defcomp: ^ahu}))
```

### Future State (XETO - SkySpark 4.0+)

```xeto
// XETO Equipment Spec
MyAhu: ph::Ahu {
  points: {
    dat: ph::DischargeAirTempSensor      // mandatory
    rat: ph::ReturnAirTempSensor         // mandatory
    mat: ph::MixedAirTempSensor?         // optional (? = maybe)
    daf: ph::DischargeAirFlowSensor?     // optional
  }
}

// Validation
readAll(ahu).fitsExplain(MyAhu, {graph})
```

### Conversion Mapping

| DefComp Concept | XETO Equivalent | Notes |
|----------------|-----------------|-------|
| `defcomp ^name` | `MyType: BaseType` | XETO uses inheritance |
| `mandatory ^tags` | Named slot without `?` | Mandatory points |
| `optional ^tags` | Named slot with `?` | Optional points (maybe) |
| Cell definitions | Spec slots | Cells → slots with types |
| `do` block logic | External Axon functions | Logic separate from schema |
| `defVal` | `val:` meta on slot | Default values |
| `ro` flag | `writeLevel` constraint | Read-only enforcement |

---

## Implementation Roadmap

### Phase 1: DefComp Support (Current - V1.0)

**Goal:** Full support for existing defcomp Spark templates

**Features:**
1. ✅ Parse and validate defcomp syntax
2. ✅ Store defcomp templates in library
3. ✅ Match templates to equipment records
4. ✅ Generate application code
5. ✅ Apply templates with dry-run testing

**Tools to Build:**
- DefComp Template Manager
- Schema Analyzer (tag-based matching)
- Code Generator (Axon `commit()` statements)
- Template Library UI

### Phase 2: XETO Integration (V2.0)

**Goal:** Add XETO spec support alongside defcomp

**Features:**
1. ⚡ Parse XETO spec syntax
2. ⚡ Use `fits()` for validation
3. ⚡ Use `fitsExplain()` for diagnostics
4. ⚡ Use `fitsMatchAll()` for discovery
5. ⚡ Support graph queries (required points)

**Tools to Build:**
- XETO Spec Library Manager
- Fits-based Validator
- Graph Query Analyzer
- Choice Type Resolver

### Phase 3: DefComp → XETO Converter (V2.5)

**Goal:** Automatic conversion from defcomp to XETO

**Features:**
1. 🔄 Parse defcomp templates
2. 🔄 Generate equivalent XETO specs
3. 🔄 Map mandatory → named slots
4. 🔄 Map optional → maybe slots (?)
5. 🔄 Convert cell definitions → spec slots

**Conversion Example:**

```typescript
// Input: DefComp
const input = `
defcomp ^ahu
  mandatory ^discharge ^air ^temp ^sensor ^point
  mandatory ^return ^air ^temp ^sensor ^point
  optional ^mixed ^air ^temp ^sensor ^point
end
`;

// Output: XETO
const output = `
MyAhu: ph::Ahu {
  points: {
    dat: ph::DischargeAirTempSensor
    rat: ph::ReturnAirTempSensor
    mat: ph::MixedAirTempSensor?
  }
}
`;
```

### Phase 4: Unified Workflow (V3.0)

**Goal:** Support both formats with intelligent migration

**Features:**
1. 🚀 Detect which format is in use
2. 🚀 Suggest XETO upgrades for defcomp
3. 🚀 Side-by-side validation (defcomp vs XETO)
4. 🚀 Migration assistant
5. 🚀 Version tracking (3.1.x vs 4.0+)

---

## VSCode Extension Features

### Feature 1: Equipment Validation

**Command:** "Axon: Validate Equipment Against Spec"

**Workflow:**
```
1. User selects equipment records
2. Extension queries specs (defcomp or XETO)
3. For DefComp:
   - Match tags against template requirements
   - Check mandatory/optional points exist
4. For XETO:
   - Call fits(rec, spec, {graph})
   - Parse fitsExplain() results
5. Show validation results in UI
6. Highlight issues in editor
```

**UI:**
```
Equipment Validation Results
────────────────────────────────────
✅ AHU-1: Matches MyAhu template (100%)
  ✓ All mandatory points present
  ✓ 2/3 optional points found

⚠️  AHU-2: Partial match (87%)
  ✓ Mandatory points OK
  ✗ Missing: Mixed Air Temp Sensor

❌ VAV-101: No match (45%)
  ✗ Missing: Discharge Air Damper Cmd
  ✗ Missing: Zone Air Temp Sensor
```

### Feature 2: Spec-to-DefComp Code Generation

**Command:** "Axon: Generate Code from XETO Spec"

**Workflow:**
```
1. User selects XETO spec
2. Extension analyzes spec structure
3. AI generates Axon code:
   - Equipment discovery
   - Point mapping
   - Validation logic
   - Tagging operations
4. Show generated code in editor
5. User can test and refine
```

**Example:**

```typescript
// Input: XETO Spec
const spec = `
G36ReheatVav: ph::Vav {
  points: {
    zoneTemp: ph::ZoneAirTempSensor
    damperCmd: ph::DamperCmd
    reheatValve: ph::ReheatValveCmd?
  }
}
`;

// Generated Axon Code
const generatedCode = `
// Find VAVs that match G36ReheatVav spec
findG36ReheatVavs() do
  // Query all VAV equipment
  vavs: readAll(vav and equip)
  
  // Validate against spec
  results: vavs.fitsExplain(spec("mylib::G36ReheatVav"), {graph})
  
  // Return matching VAVs
  vavs.findAll(vav => 
    results.findAll(r => r->recId == vav.id and r->status == "ok").size == 0
  ).toGrid
end

// Tag VAVs with spec
tagG36ReheatVavs() do
  matches: findG36ReheatVavs()
  
  matches.each(vav => 
    commit(diff(vav.id, {spec: @mylib::G36ReheatVav}, {add}))
  )
  
  "Tagged " + matches.size + " VAVs"
end
`;
```

### Feature 3: Smart Template Suggestion

**Command:** "Axon: Suggest Specs for Equipment"

**Uses:** `fitsMatchAll()` function

**Workflow:**
```
1. User selects equipment records
2. Extension calls fitsMatchAll(recs)
3. For each record, shows matching specs
4. User can apply best match
5. Extension generates tagging code
```

**UI:**
```
Spec Matching Results
─────────────────────────────────────
AHU-1 (@abc123)
  Best Match: ph::Ahu (95%)
  Other Matches:
    - mylib::StandardAhu (88%)
    - mylib::RooftopAhu (75%)
  
  [Apply ph::Ahu] [Compare Specs] [Details]

VAV-101 (@def456)
  Best Match: ph::Vav (100%)
  Other Matches:
    - mylib::G36ReheatVav (92%)
    - mylib::G36CoolingVav (85%)
  
  [Apply ph::Vav] [Compare Specs] [Details]
```

### Feature 4: DefComp Migration Assistant

**Command:** "Axon: Migrate DefComp to XETO"

**Workflow:**
```
1. User selects defcomp template
2. Extension analyzes structure
3. AI generates equivalent XETO spec
4. Shows side-by-side comparison
5. User can test both versions
6. Extension generates migration plan
```

**UI:**
```
DefComp → XETO Migration
────────────────────────────────────

DefComp (Legacy)              XETO (Modern)
─────────────────────────────────────────────
defcomp ^ahu                  MyAhu: ph::Ahu {
  mandatory ^discharge          points: {
    ^air ^temp ^sensor            dat: DischargeAirTempSensor
    ^point                        rat: ReturnAirTempSensor
  mandatory ^return               mat: MixedAirTempSensor?
    ^air ^temp ^sensor          }
    ^point                    }
  optional ^mixed
    ^air ^temp ^sensor
    ^point
end

Applied to: 15 equipment records
Migration Impact:
  ✓ All records pass XETO validation
  ✓ More precise type checking
  ✓ Graph query support enabled
  ⚠️ Requires SkySpark 4.0+

[Migrate All] [Test Migration] [Export XETO]
```

---

## Code Examples

### Example 1: Using fits() in Extension

```typescript
// src/validation/XetoValidator.ts
export class XetoValidator {
  private skysparkClient: SkySparkClient;

  async validateEquipment(
    equipId: string,
    specQName: string,
    options: ValidationOptions = {}
  ): Promise<ValidationResult> {
    // Build opts dict
    const opts = [];
    if (options.graph) opts.push('graph');
    if (options.ignoreRefs) opts.push('ignoreRefs');
    
    const optsStr = opts.length > 0 
      ? `, {${opts.join(', ')}}` 
      : '';

    // Generate Axon code
    const code = `
      rec: read(@${equipId})
      spec: spec("${specQName}")
      
      // Check if fits
      passes: fits(rec, spec${optsStr})
      
      // Get explanation
      explanation: [rec].fitsExplain(spec${optsStr})
      
      {passes, explanation}
    `;

    // Execute
    const result = await this.skysparkClient.eval(code);

    return {
      passes: result.passes,
      issues: this.parseExplanation(result.explanation),
      equipId,
      spec: specQName
    };
  }

  private parseExplanation(grid: Grid): ValidationIssue[] {
    return grid.rows.map(row => ({
      severity: row.status === 'err' ? 'error' : 'warning',
      message: row.msg,
      recId: row.recId
    }));
  }
}
```

### Example 2: Template Matching

```typescript
// src/templates/SpecMatcher.ts
export class SpecMatcher {
  async findMatchingSpecs(
    equipIds: string[],
    options: MatchOptions = {}
  ): Promise<MatchResult[]> {
    // Build filter
    const filter = equipIds
      .map(id => `id==@${id}`)
      .join(' or ');

    // Build Axon code
    const code = `
      recs: readAll(${filter})
      specs: ${options.specs ? `[${options.specs.join(', ')}]` : 'null'}
      opts: ${this.buildOptsDict(options)}
      
      recs.fitsMatchAll(specs, opts)
    `;

    // Execute
    const grid = await this.skysparkClient.eval(code);

    // Parse results
    return grid.rows.map(row => ({
      equipId: row.id,
      numMatches: row.num,
      matchingSpecs: row.specs.map(spec => ({
        qname: spec.qname,
        name: spec.name,
        confidence: this.calculateConfidence(row.id, spec)
      }))
    }));
  }

  private buildOptsDict(options: MatchOptions): string {
    const opts = [];
    if (options.graph) opts.push('graph');
    if (options.sort) opts.push('sort');
    if (options.limit) opts.push(`limit: ${options.limit}`);
    
    return opts.length > 0 ? `{${opts.join(', ')}}` : 'null';
  }
}
```

### Example 3: Query Named Points

```typescript
// src/queries/PointMapper.ts
export class PointMapper {
  async queryNamedPoints(
    equipId: string,
    specQName: string
  ): Promise<PointMapping> {
    // Generate Axon code
    const code = `
      equip: read(@${equipId})
      spec: spec("${specQName}")
      pointsSpec: spec("${specQName}.points")
      
      // Query named points
      equip.queryNamed(pointsSpec)
    `;

    // Execute
    const result = await this.skysparkClient.eval(code);

    // Result is a dict like:
    // {
    //   dat: {dis:"DAT", discharge, air, temp, sensor, ...},
    //   rat: {dis:"RAT", return, air, temp, sensor, ...}
    // }

    return this.parsePointMapping(result);
  }

  private parsePointMapping(dict: Dict): PointMapping {
    const mapping: PointMapping = {};
    
    Object.entries(dict).forEach(([name, pointRec]) => {
      mapping[name] = {
        id: pointRec.id,
        dis: pointRec.dis,
        tags: Object.keys(pointRec),
        type: this.inferPointType(pointRec)
      };
    });

    return mapping;
  }
}
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('XetoValidator', () => {
  it('validates equipment against XETO spec', async () => {
    const result = await validator.validateEquipment(
      'abc123',
      'ph::Ahu'
    );
    
    expect(result.passes).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('reports validation errors', async () => {
    const result = await validator.validateEquipment(
      'def456',
      'ph::Ahu',
      { graph: true }
    );
    
    expect(result.passes).toBe(false);
    expect(result.issues).toContain({
      severity: 'error',
      message: 'Missing required point: DischargeAirTempSensor'
    });
  });
});
```

### Integration Tests

```typescript
describe('Template Application E2E', () => {
  it('converts defcomp to XETO and validates', async () => {
    // 1. Load defcomp template
    const defcomp = await loadDefCompTemplate('ahu-standard');
    
    // 2. Convert to XETO
    const xeto = await converter.convertToXeto(defcomp);
    
    // 3. Apply to equipment
    const equipIds = await findEquipment('ahu');
    
    // 4. Validate with XETO
    const results = await Promise.all(
      equipIds.map(id => validator.validateEquipment(id, xeto.qname))
    );
    
    // 5. Assert all pass
    expect(results.every(r => r.passes)).toBe(true);
  });
});
```

---

## Migration Plan

### Step 1: Support Current SkySpark (3.1.x)

**Timeline:** Immediate (V1.0)

- Full defcomp support
- Tag-based matching
- Template library
- Code generation

### Step 2: Add XETO Awareness (3.1.x compatible)

**Timeline:** 3 months (V1.5)

- Parse XETO specs (read-only)
- Show XETO documentation
- Preview XETO equivalents
- Educational UI

### Step 3: XETO Validation (4.0+ required)

**Timeline:** 6 months (V2.0)

- Use fits() API
- Graph query support
- Full validation
- Interactive diagnostics

### Step 4: Unified Experience

**Timeline:** 9 months (V2.5)

- Automatic format detection
- Side-by-side comparison
- Migration assistant
- Best practices guidance

---

## Configuration

```json
// .vscode/settings.json
{
  "axon.xeto": {
    "enabled": true,
    "version": "detect",  // "detect" | "3.1" | "4.0"
    "preferXeto": false,  // Prefer XETO over defcomp when both available
    "validation": {
      "useGraph": true,   // Validate required points
      "ignoreRefs": false,
      "showInProblems": true
    },
    "migration": {
      "suggestXeto": true,     // Suggest XETO upgrades
      "autoConvert": false,    // Auto-convert defcomp to XETO
      "keepBothFormats": true  // Keep both during migration
    }
  },
  "axon.defcomp": {
    "enabled": true,
    "libraryPath": ".vscode/axon-templates/defcomp",
    "validation": {
      "checkTags": true,
      "checkPoints": true,
      "strictMode": false
    }
  }
}
```

---

## Resources

### Haxall Source Files

1. **XETO Core:**
   - `/Users/<user>/Code/haxall/src/core/xeto/fan/LibNamespace.fan`
   - `/Users/<user>/Code/haxall/src/core/xeto/fan/Spec.fan`

2. **XETO Tools:**
   - `/Users/<user>/Code/haxall/src/tool/xetoTools/fan/FitsCmd.fan`
   - `/Users/<user>/Code/haxall/src/tool/xetoTools/fan/GenAxon.fan`

3. **XETO Functions:**
   - `/Users/<user>/Code/haxall/src/ext/hxXeto/fan/XetoFuncs.fan`
   - `/Users/<user>/Code/haxall/src/xeto/hx.xeto/funcs.xeto`

4. **DefComp:**
   - `/Users/<user>/Code/haxall/src/core/axon/fan/ast/CompDef.fan`
   - `/Users/<user>/Code/haxall/src/doc/docHaxall/doc/Comps.fandoc`

### Key Functions to Implement

```typescript
// Priority 1: Validation
fits(val, spec, opts): Bool
fitsExplain(recs, spec, opts): Grid

// Priority 2: Discovery
fitsMatchAll(recs, specs, opts): Grid
specOf(val): Spec

// Priority 3: Queries
query(subject, spec): Dict
queryAll(subject, spec, opts): Grid
queryNamed(subject, spec): Dict

// Priority 4: Type Checking
specIs(a, b): Bool          // Nominal typing
specFits(a, b): Bool        // Structural typing
choiceOf(instance, choice): Spec
```

---

## Success Metrics

### V1.0 (DefComp)
- ✅ 100% defcomp template support
- ✅ 95% accuracy in template matching
- ✅ 99% time reduction in template application

### V2.0 (XETO)
- ✅ Full XETO spec support
- ✅ Graph query validation working
- ✅ fits() integration complete
- ✅ 100% accuracy in spec matching

### V2.5 (Migration)
- ✅ 90% automatic defcomp → XETO conversion
- ✅ Side-by-side validation working
- ✅ Migration assistant complete

### V3.0 (Unified)
- ✅ Seamless experience across versions
- ✅ Intelligent format detection
- ✅ Best practices guidance
- ✅ 100% feature parity

---

## Conclusion

This roadmap provides a clear path from current defcomp support to future XETO integration:

1. **Phase 1:** Full defcomp support (legacy systems)
2. **Phase 2:** Add XETO validation (modern systems)
3. **Phase 3:** Conversion tools (migration path)
4. **Phase 4:** Unified experience (best of both)

The extension will intelligently detect which format is in use and provide appropriate tooling, while offering a smooth migration path to XETO for future-proofing.

Key advantages:
- ✅ Works with current SkySpark 3.1.x
- ✅ Ready for SkySpark 4.0+ XETO
- ✅ Smooth migration path
- ✅ AI-assisted conversion
- ✅ Validation and diagnostics
- ✅ Graph query support
