# Unified XETO & DefComp Architecture

## Overview

This document describes the unified architecture combining XETO specs (data validation/typing) and defcomp components (computation/logic) for the VSCode extension.

**Correct Understanding:**
- **XETO Specs** = Type system for equipment/points (WHAT things are)
- **DefComp** = Axon components for computation (HOW to process data)
- **They work together**, not replace each other!

---

## Core Relationship

```
┌─────────────────────────────────────────────────────────────┐
│                    XETO Specs Layer                          │
│           (Type System & Data Validation)                    │
│                                                              │
│  - Equipment Types: ph::Ahu, ph::Vav, ph::Chiller          │
│  - Point Types: ph::DischargeAirTempSensor                  │
│  - Validation: fits(), fitsExplain()                        │
│  - Queries: query(), queryAll(), queryNamed()               │
│                                                              │
│  Purpose: Define structure, validate data, query graphs     │
└─────────────────────────────────────────────────────────────┘
                            ↕
              Uses specs for cell typing
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                   DefComp Layer                              │
│         (Axon Components & Data Flow)                        │
│                                                              │
│  - Components: defcomp with cells                           │
│  - Data Flow: input cells → logic → output cells           │
│  - Computation: do blocks with Axon logic                   │
│  - Runtime: Component instances, recompute()                │
│                                                              │
│  Purpose: Process data, compute results, control logic      │
└─────────────────────────────────────────────────────────────┘
                            ↕
              Operates on validated data
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                SkySpark Database                             │
│                                                              │
│  - Equipment Records (validated by XETO specs)              │
│  - Point Records (typed by XETO specs)                      │
│  - Component Instances (defcomp runtime)                    │
│  - Historical Data                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Real-World Example

### XETO Spec (Equipment Schema)

```xeto
// Define what an AHU looks like
StandardAhu: ph::Ahu {
  points: {
    // Required points
    dat: ph::DischargeAirTempSensor
    rat: ph::ReturnAirTempSensor
    daTempSp: ph::DischargeAirTempSp
    
    // Optional points
    mat: ph::MixedAirTempSensor?
    daf: ph::DischargeAirFlowSensor?
    
    // Commands
    coolValve: ph::CoolingValveCmd?
    heatValve: ph::HeatingValveCmd?
  }
}
```

**Purpose:** Validates that AHU records have the correct structure and required points.

### DefComp Component (AHU Logic)

```axon
// Component that computes optimal discharge air temp setpoint
defcomp
  // Input cells (typed with XETO specs)
  oaTemp: {is:^number, unit:"°F", dis:"Outside Air Temp"}
  zoneTempAvg: {is:^number, unit:"°F", dis:"Average Zone Temp"}
  occupancy: {is:^bool, defVal:false, dis:"Occupancy Status"}
  
  // Output cell
  optimalDaTempSp: {is:^number, unit:"°F", ro, dis:"Optimal DA Temp SP"}
  
  // Computation logic
  do
    if (occupancy) do
      // Occupied mode: dynamic setpoint
      tempOffset: (zoneTempAvg - 72).clamp(-5, 5)
      baseSp: 55 + (oaTemp - 70) * 0.1
      optimalDaTempSp = (baseSp + tempOffset).clamp(50, 65)
    end else do
      // Unoccupied mode: fixed setpoint
      optimalDaTempSp = 60
    end
  end
end
```

**Purpose:** Computes optimal setpoint based on current conditions.

### How They Work Together

```axon
// 1. Use XETO to validate and find equipment
validAhus: readAll(ahu and equip).fitsExplain(spec("mylib::StandardAhu"), {graph})
goodAhus: validAhus.findAll(r => r->status == "ok")

// 2. Use defcomp to process data from validated equipment
goodAhus.each(ahu => do
  // Get points (XETO ensures they exist)
  points: ahu.queryNamed(spec("mylib::StandardAhu.points"))
  
  // Read current values
  oaTemp: read(@oaTempSensorId)->curVal
  zoneTemps: points->dat.hisRead(today()).hisFoldCols(avg)
  occupied: read(ahu.id)->occupied
  
  // Run defcomp to compute optimal setpoint
  result: optimalDaTempSpComp({
    oaTemp: oaTemp,
    zoneTempAvg: zoneTemps,
    occupancy: occupied
  })
  
  // Write computed setpoint
  commit(diff(points->daTempSp.id, {curVal: result->optimalDaTempSp}))
end)
```

---

## Extension Architecture

### Layer 1: XETO Validation & Discovery

**Purpose:** Validate equipment structure, discover specs, query graphs

```typescript
// src/xeto/XetoValidator.ts
export class XetoValidator {
  // Validate equipment against spec
  async validateEquipment(equipId: string, specQName: string): Promise<ValidationResult> {
    const code = `
      rec: read(@${equipId})
      spec: spec("${specQName}")
      
      passes: fits(rec, spec, {graph})
      explanation: [rec].fitsExplain(spec, {graph})
      
      {passes, explanation}
    `;
    return await this.execute(code);
  }
  
  // Find matching specs
  async findMatchingSpecs(equipIds: string[]): Promise<SpecMatch[]> {
    const code = `
      recs: readAll(${this.buildFilter(equipIds)})
      recs.fitsMatchAll()
    `;
    return await this.execute(code);
  }
  
  // Query required points
  async queryPoints(equipId: string, specQName: string): Promise<PointMapping> {
    const code = `
      equip: read(@${equipId})
      pointsSpec: spec("${specQName}.points")
      equip.queryNamed(pointsSpec)
    `;
    return await this.execute(code);
  }
}
```

### Layer 2: DefComp Management

**Purpose:** Create, manage, and execute Axon components

```typescript
// src/defcomp/DefCompManager.ts
export class DefCompManager {
  // Create component from template
  async createComponent(spec: DefCompSpec): Promise<string> {
    const code = `
defcomp
${spec.cells.map(c => `  ${c.name}: ${this.formatCellMeta(c)}`).join('\n')}
  do
${this.indent(spec.logic, 4)}
  end
end
    `;
    return code;
  }
  
  // Execute component
  async executeComponent(
    compName: string, 
    inputs: Record<string, any>
  ): Promise<Record<string, any>> {
    const inputDict = this.formatDict(inputs);
    const code = `${compName}(${inputDict})`;
    return await this.skysparkClient.eval(code);
  }
  
  // List all components
  async listComponents(): Promise<ComponentInfo[]> {
    const code = `
      funcs().findAll(f => f.has("comp")).toGrid
    `;
    return await this.execute(code);
  }
}
```

### Layer 3: Unified Workflow Orchestration

**Purpose:** Combine XETO validation with defcomp logic

```typescript
// src/workflows/UnifiedWorkflow.ts
export class UnifiedWorkflow {
  constructor(
    private xetoValidator: XetoValidator,
    private defcompManager: DefCompManager
  ) {}
  
  async executeValidatedWorkflow(config: WorkflowConfig): Promise<WorkflowResult> {
    // Step 1: XETO - Validate equipment structure
    const validation = await this.xetoValidator.validateEquipment(
      config.equipId,
      config.specQName
    );
    
    if (!validation.passes) {
      return {
        success: false,
        stage: 'validation',
        errors: validation.issues
      };
    }
    
    // Step 2: XETO - Query required points
    const points = await this.xetoValidator.queryPoints(
      config.equipId,
      config.specQName
    );
    
    // Step 3: DefComp - Execute component logic
    const inputs = this.buildComponentInputs(points, config);
    const result = await this.defcompManager.executeComponent(
      config.componentName,
      inputs
    );
    
    // Step 4: Apply results
    await this.applyResults(config.equipId, points, result);
    
    return {
      success: true,
      validation,
      points,
      computation: result
    };
  }
}
```

---

## Use Cases

### Use Case 1: Equipment Commissioning

**Workflow:**
1. **XETO:** Validate equipment has all required points
2. **DefComp:** Run commissioning tests (component logic)
3. **XETO:** Verify results meet specifications

```typescript
async commissionEquipment(equipId: string) {
  // 1. XETO: Validate structure
  const spec = await this.getEquipmentSpec(equipId);
  const validation = await this.xetoValidator.validateEquipment(equipId, spec);
  
  if (!validation.passes) {
    throw new Error(`Equipment fails spec: ${validation.issues}`);
  }
  
  // 2. XETO: Get point mapping
  const points = await this.xetoValidator.queryPoints(equipId, spec);
  
  // 3. DefComp: Run commissioning tests
  const tests = await this.defcompManager.executeComponent(
    'commissioningTests',
    {
      equipId,
      points: this.formatPointsForComponent(points)
    }
  );
  
  // 4. XETO: Validate test results
  const resultsValid = await this.validateResults(tests, spec);
  
  return {
    structureValid: true,
    pointsFound: Object.keys(points).length,
    testsPass: tests.passed,
    resultsValid
  };
}
```

### Use Case 2: Control Sequence Generation

**Workflow:**
1. **XETO:** Identify equipment type and capabilities
2. **DefComp:** Generate appropriate control logic
3. **XETO:** Validate control sequence meets standards

```typescript
async generateControlSequence(equipId: string) {
  // 1. XETO: Identify equipment type
  const matches = await this.xetoValidator.findMatchingSpecs([equipId]);
  const bestMatch = matches[0].specs[0]; // Most specific match
  
  // 2. XETO: Get equipment capabilities
  const points = await this.xetoValidator.queryPoints(equipId, bestMatch.qname);
  
  // 3. DefComp: Generate control logic based on capabilities
  const controlLogic = await this.generateDefComp(bestMatch, points);
  
  // 4. Create component
  await this.defcompManager.createComponent({
    name: `${equipId}_control`,
    cells: this.mapPointsToCells(points),
    logic: controlLogic
  });
  
  // 5. XETO: Validate generated logic
  const valid = await this.validateControlSequence(controlLogic, bestMatch);
  
  return {
    componentName: `${equipId}_control`,
    spec: bestMatch.qname,
    pointsUsed: Object.keys(points),
    valid
  };
}
```

### Use Case 3: AI-Assisted Development

**Workflow:**
1. **XETO:** Provide type context to AI
2. **AI:** Generate defcomp logic
3. **XETO:** Validate generated code
4. **DefComp:** Execute and test

```typescript
async aiGenerateComponent(prompt: string, context: AIContext) {
  // 1. XETO: Get relevant specs for context
  const specs = await this.getRelevantSpecs(context);
  
  // 2. Build AI prompt with XETO context
  const enhancedPrompt = `
Context: ${specs.map(s => s.documentation).join('\n')}

Available Points:
${specs.flatMap(s => s.points).map(p => `- ${p.name}: ${p.type}`).join('\n')}

User Request: ${prompt}

Generate an Axon defcomp component that:
${prompt}

Use proper cell types from the specs provided.
  `;
  
  // 3. AI generates defcomp
  const generated = await this.aiProvider.actMode(
    { steps: ['Analyze specs', 'Design component', 'Generate code'] },
    { task: enhancedPrompt, schemaContext: specs }
  );
  
  // 4. XETO: Validate component uses correct types
  const validation = await this.validateComponentTypes(generated, specs);
  
  // 5. DefComp: Create and test
  if (validation.valid) {
    await this.defcompManager.createComponent(generated);
    const testResult = await this.testComponent(generated.name);
    return { generated, testResult };
  }
  
  return { generated, validation };
}
```

---

## VSCode Extension Features

### Feature 1: Smart Equipment Validation

**Command:** "Axon: Validate Equipment and Components"

```typescript
async validateEquipmentWithComponents(equipId: string) {
  const results = {
    xeto: null as ValidationResult,
    defcomp: [] as ComponentStatus[]
  };
  
  // 1. XETO: Validate structure
  results.xeto = await this.xetoValidator.validateEquipment(equipId, 'auto');
  
  // 2. DefComp: Check associated components
  const components = await this.findComponentsForEquipment(equipId);
  
  for (const comp of components) {
    const status = await this.defcompManager.checkComponentHealth(comp);
    results.defcomp.push(status);
  }
  
  // 3. Show unified results
  this.showValidationResults(results);
}
```

### Feature 2: Component Generator with Type Safety

**Command:** "Axon: Generate Component from Spec"

```typescript
async generateComponentFromSpec(specQName: string) {
  // 1. XETO: Get spec details
  const spec = await this.getSpec(specQName);
  const points = spec.slots.filter(s => s.isQuery);
  
  // 2. AI: Generate component template
  const template = await this.aiProvider.generateDefComp({
    spec,
    points,
    purpose: 'control logic'
  });
  
  // 3. Show in editor with type hints
  const editor = await vscode.window.showTextDocument(
    await vscode.workspace.openTextDocument({
      language: 'axon',
      content: template
    })
  );
  
  // 4. Add inline type hints from XETO
  this.addXetoTypeHints(editor, spec);
}
```

### Feature 3: Interactive Component Builder

**UI Flow:**
```
1. User: Select equipment type (XETO spec)
   Extension: Shows available points from spec
   
2. User: Choose points to use as inputs
   Extension: Creates cells with correct XETO types
   
3. User: Define logic (AI-assisted)
   Extension: Validates against XETO constraints
   
4. User: Test component
   Extension: Runs with sample data, shows results
   
5. User: Deploy component
   Extension: Saves to project, adds to runtime
```

---

## Configuration

```json
// .vscode/settings.json
{
  "axon.unified": {
    "enabled": true,
    "xeto": {
      "enabled": true,
      "validation": {
        "autoValidate": true,
        "useGraph": true,
        "showInProblems": true
      },
      "codeCompletion": {
        "suggestSpecs": true,
        "suggestPoints": true,
        "inlineTypeHints": true
      }
    },
    "defcomp": {
      "enabled": true,
      "cellTypes": {
        "inferFromXeto": true,
        "validateTypes": true
      },
      "codeGeneration": {
        "useAI": true,
        "includeXetoContext": true
      },
      "runtime": {
        "autoRecompute": false,
        "logExecutions": true
      }
    }
  }
}
```

---

## Implementation Timeline

### Phase 1: Foundation (Months 1-2)

**XETO Integration:**
- ✅ Implement fits(), fitsExplain(), fitsMatchAll()
- ✅ Spec browser and documentation
- ✅ Type validation engine
- ✅ Point query functions

**DefComp Support:**
- ✅ Parse and validate defcomp syntax
- ✅ Component browser
- ✅ Cell type checking
- ✅ Execution engine

### Phase 2: Unified Workflows (Months 3-4)

**Integration:**
- ✅ XETO-aware component generator
- ✅ Validated workflow orchestration
- ✅ Type-safe cell definitions
- ✅ Interactive debugging

**AI Enhancement:**
- ✅ AI with XETO context
- ✅ Smart component generation
- ✅ Auto-fixing validation errors

### Phase 3: Advanced Features (Months 5-6)

**Developer Experience:**
- ✅ Inline XETO type hints
- ✅ Component templates library
- ✅ Performance profiling
- ✅ Version control integration

**Team Collaboration:**
- ✅ Shared component library
- ✅ Spec versioning
- ✅ Team best practices

---

## Example: Complete Workflow

### Scenario: Create AHU Control Sequence

```typescript
// 1. User requests: "Create optimal start control for AHUs"

// Extension executes:

// Step 1: XETO - Find AHUs and validate
const ahus = await skysparkClient.eval(`
  ahus: readAll(ahu and equip)
  validated: ahus.fitsExplain(spec("ph::Ahu"), {graph})
  validated.findAll(v => v->status == "ok")
`);

// Step 2: XETO - Get point structure for one AHU
const pointStructure = await skysparkClient.eval(`
  read(@${ahus[0].id}).queryNamed(spec("ph::Ahu.points"))
`);

// Step 3: AI - Generate defcomp with XETO context
const component = await aiProvider.actMode(
  { 
    steps: [
      'Analyze AHU spec and available points',
      'Design optimal start algorithm',
      'Generate defcomp with proper cell types'
    ]
  },
  {
    task: 'Create optimal start control component for AHU',
    schemaContext: {
      spec: 'ph::Ahu',
      points: pointStructure,
      requirements: 'Use outside air temp, zone temps, schedule'
    }
  }
);

// Step 4: DefComp - Create component
const defcompCode = `
defcomp
  // Inputs (types inferred from XETO)
  oaTemp: {is:^number, unit:"°F", dis:"Outside Air Temp"}
  zoneTemps: {is:^list, dis:"Zone Temperatures"}
  schedule: {is:^dict, dis:"Occupancy Schedule"}
  
  // Parameters
  targetStartTime: {is:^time, defVal:06:00, dis:"Target Start Time"}
  massCoeff: {is:^number, defVal:0.5, dis:"Building Mass Coefficient"}
  
  // Outputs
  startTime: {is:^time, ro, dis:"Calculated Start Time"}
  startNow: {is:^bool, ro, dis:"Start Equipment Now"}
  
  do
    // Calculate required warmup time
    avgZoneTemp: zoneTemps.avg()
    tempDelta: 72 - avgZoneTemp
    warmupHours: (tempDelta * massCoeff) / (10 * (1 + (oaTemp - 20) / 50))
    
    // Calculate optimal start time
    startTime = targetStartTime - warmupHours.toDuration()
    
    // Determine if should start now
    now: time()
    startNow = now >= startTime and now < targetStartTime
  end
end
`;

// Step 5: XETO - Validate component uses correct types
const typeValidation = await validateComponentTypes(defcompCode, 'ph::Ahu');

// Step 6: Deploy to all valid AHUs
for (const ahu of ahus) {
  await skysparkClient.eval(`
    // Install component
    ${defcompCode}
    
    // Run for this AHU
    points: read(@${ahu.id}).queryNamed(spec("ph::Ahu.points"))
    
    result: optimalStartComp({
      oaTemp: read(points->oaTemp.id)->curVal,
      zoneTemps: points->zoneTemps.map(p => read(p->id)->curVal),
      schedule: read(@${ahu.id})->schedule
    })
    
    // Log result
    logInfo("AHU ${ahu.dis}: Start ${result->startNow ? "NOW" : "at " + result->startTime}")
  `);
}
```

---

## Success Metrics

### XETO Integration
- ✅ 100% spec validation coverage
- ✅ <100ms validation response time
- ✅ Graph query support for all equipment types

### DefComp Development
- ✅ 90% AI-generated components work first try
- ✅ Type-safe cell definitions
- ✅ Component reuse across projects

### Unified Experience
- ✅ Single workflow for validation + execution
- ✅ Seamless XETO → DefComp integration
- ✅ 10x faster development time

---

## Conclusion

The unified architecture leverages:

1. **XETO** for structure, validation, and type safety
2. **DefComp** for computation, logic, and data flow
3. **AI** for intelligent code generation with type awareness

They work **together**, not separately:
- XETO ensures data is valid
- DefComp processes that valid data
- AI generates code using both systems

This creates a powerful, type-safe, AI-assisted development environment for SkySpark!
