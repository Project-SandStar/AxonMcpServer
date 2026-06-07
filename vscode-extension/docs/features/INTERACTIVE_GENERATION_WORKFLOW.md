# Interactive Code Generation Workflow

## Overview

This document describes how the VSCode extension handles complex code generation scenarios with iterative refinement, using BACnet device import as a real-world example.

---

## Use Case: BACnet Device Import Function

**User Request:**
> "Write me an axon function that imports all bacnet devices through job or skyspark task. Learn the grid of bacnet from schema saved to io. Read device names like ahu, rtu, vav and import all points with correct connector tags."

---

## Phase 1: Intent Analysis & Planning

### 1.1 User Input Processing

```typescript
// Extension Command: axon.generateFunction
async function handleGenerationRequest(userInput: string) {
  const context = {
    task: userInput,
    workspace: getCurrentWorkspace(),
    activeFile: getActiveEditor(),
  };

  // Start generation session
  const session = await sessionManager.createSession('generation', context);
  
  // Show progress
  vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: "Generating BACnet Import Function",
    cancellable: true
  }, async (progress) => {
    // Step 1: Analyze intent
    progress.report({ increment: 10, message: "Analyzing requirements..." });
    const plan = await analyzeIntent(userInput, context);
    
    // Step 2: Gather context
    progress.report({ increment: 20, message: "Gathering schema and examples..." });
    const enrichedContext = await gatherContext(plan, context);
    
    // Step 3: Generate code
    progress.report({ increment: 30, message: "Generating initial code..." });
    const generatedCode = await generateCode(plan, enrichedContext);
    
    // Step 4: Interactive refinement
    progress.report({ increment: 40, message: "Testing and refining..." });
    await interactiveRefinement(generatedCode, session);
  });
}
```

### 1.2 Plan Generation (Using Cheaper Model)

```typescript
// src/generation/PlanMode.ts
async function analyzeIntent(userInput: string, context: Context): Promise<GenerationPlan> {
  const provider = providerManager.getActiveProvider();
  
  const planPrompt = `
Analyze this Axon code generation request:

"${userInput}"

Current workspace: ${context.workspace.name}
Active file: ${context.activeFile?.fileName || 'none'}

Break down the requirements into:
1. Main components needed
2. Data sources required
3. External dependencies (connectors, tags)
4. Potential challenges
5. Testing strategy

Format as structured JSON.
`;

  const plan = await provider.planMode({
    task: userInput,
    codeContext: context.activeFile?.getText(),
  });

  return {
    components: [
      'Device discovery function',
      'Point mapping logic', 
      'Connector tag assignment',
      'Job/task wrapper',
      'Error handling'
    ],
    dataSources: [
      'BACnet schema from io',
      'Device naming patterns (AHU, RTU, VAV)',
      'Connector tag definitions',
      'Existing import examples'
    ],
    dependencies: [
      'bacnet connector',
      'io point for schema storage',
      'Job or task infrastructure'
    ],
    challenges: [
      'Schema parsing from io point',
      'Dynamic point creation',
      'Handling device offline scenarios',
      'Tag normalization for different device types'
    ],
    estimatedComplexity: 'high',
    confidence: 0.85
  };
}
```

---

## Phase 2: Context Gathering via MCP

### 2.1 Query Schema Information

```typescript
// src/generation/ContextCollector.ts
async function gatherContext(plan: GenerationPlan, context: Context): Promise<EnrichedContext> {
  const mcpServer = getMcpServerInstance();
  
  // 1. Search for BACnet-related functions
  const bacnetExamples = await mcpServer.sendRequest('searchAxonDocs', {
    keyword: 'bacnet device',
    category: 'connectors',
    limit: 10
  });

  // 2. Get schema information
  const connectorInfo = await mcpServer.sendRequest('getProjectSchema', {
    projectId: context.workspace.skysparkProject,
    filter: { tags: ['bacnet', 'connector'] }
  });

  // 3. Find point mapping patterns
  const pointMappingExamples = await mcpServer.sendRequest('searchAxonDocs', {
    keyword: 'point mapping connector',
    limit: 5
  });

  // 4. Get job/task examples
  const jobExamples = await mcpServer.sendRequest('searchAxonDocs', {
    keyword: 'job task',
    category: 'utilities',
    limit: 5
  });

  // 5. Analyze device naming conventions from current project
  const deviceNamingPatterns = await analyzeProjectDevices(
    context.workspace.skysparkProject,
    ['ahu', 'rtu', 'vav']
  );

  return {
    ...context,
    plan,
    examples: {
      bacnet: bacnetExamples,
      pointMapping: pointMappingExamples,
      jobs: jobExamples
    },
    schema: connectorInfo,
    namingPatterns: deviceNamingPatterns,
    projectMetadata: {
      existingDevices: await getExistingDeviceCount(context.workspace),
      connectorTags: extractConnectorTags(connectorInfo)
    }
  };
}
```

### 2.2 Example: MCP Response for BACnet Schema

```json
{
  "projectSchema": {
    "bacnetConnector": {
      "required_tags": [
        "dis", "bacnetConn", "bacnetDevice", "device"
      ],
      "optional_tags": [
        "equipRef", "siteRef", "area", "curStatus"
      ],
      "point_tags": {
        "sensor": ["point", "sensor", "bacnetCur"],
        "cmd": ["point", "cmd", "writable", "bacnetCur"],
        "bool": ["point", "bool", "bacnetCur"]
      }
    },
    "naming_conventions": {
      "ahu": {
        "pattern": "AHU-{floor}-{number}",
        "common_points": [
          "Supply Air Temp",
          "Return Air Temp", 
          "Supply Air Flow",
          "Damper Position"
        ]
      },
      "rtu": {
        "pattern": "RTU-{zone}-{number}",
        "common_points": [
          "Zone Temp",
          "Setpoint",
          "Cooling Status",
          "Heating Status"
        ]
      },
      "vav": {
        "pattern": "VAV-{zone}-{number}",
        "common_points": [
          "Zone Temp",
          "Damper Position",
          "Reheat Status"
        ]
      }
    }
  }
}
```

---

## Phase 3: Code Generation with Context

### 3.1 Generate Initial Function

```typescript
// src/generation/ActMode.ts
async function generateCode(plan: GenerationPlan, context: EnrichedContext): Promise<GeneratedCode> {
  const provider = providerManager.getActiveProvider();
  
  const actPrompt = `
You are an expert Axon developer working on a SkySpark project.

TASK: Generate a complete function to import BACnet devices from a schema stored in an io point.

PROJECT CONTEXT:
${JSON.stringify(context.projectMetadata, null, 2)}

SCHEMA INFORMATION:
${JSON.stringify(context.schema, null, 2)}

NAMING PATTERNS:
${JSON.stringify(context.namingPatterns, null, 2)}

EXAMPLE PATTERNS:
${context.examples.bacnet.map(ex => ex.sourceCode).join('\n\n---\n\n')}

REQUIREMENTS:
1. Read BACnet schema from io point (stored as JSON or Zinc)
2. Parse device names to identify type (AHU, RTU, VAV)
3. Create device records with proper connector tags
4. Discover and import all points for each device
5. Apply correct tags based on point type (sensor, cmd, bool)
6. Run as a SkySpark job or task with progress reporting
7. Handle errors gracefully (offline devices, invalid schema, etc.)
8. Return summary of imported devices/points

GENERATE:
- Main import function
- Helper functions for parsing, device creation, point mapping
- Job wrapper with progress reporting
- Error handling and validation
- Documentation comments

Use modern Axon patterns and follow the examples provided.
Format code with proper indentation and comments.
`;

  const result = await provider.actMode(plan, {
    task: actPrompt,
    schemaContext: context.schema,
    examples: context.examples.bacnet.map(ex => ex.sourceCode),
  });

  return {
    code: result.code,
    explanation: result.explanation,
    functions: extractFunctionSignatures(result.code),
    metadata: {
      tokensUsed: result.tokensUsed,
      cost: result.cost,
      model: provider.getProviderInfo().id
    }
  };
}
```

### 3.2 Example Generated Code

```axon
/**
 * Import BACnet devices from schema stored in io point
 * 
 * @param schemaIoRef - Reference to io point containing BACnet schema
 * @param connRef - Reference to BACnet connector
 * @param options - Import options dict with keys:
 *   - dryRun: Bool, preview without creating records
 *   - deviceFilter: Str, filter devices by name pattern
 *   - maxDevices: Number, limit devices to import
 * @return Grid with import summary
 */
defx importBacnetDevicesFromSchema(schemaIoRef, connRef, options: {}) do
  // Validate inputs
  if (not schemaIoRef.has("ioPoint")) throw "Invalid schema reference - must be io point"
  if (not connRef.has("bacnetConn")) throw "Invalid connector reference"
  
  // Read schema from io point
  schema: readSchemaFromIo(schemaIoRef)
  
  // Parse options
  dryRun: options.get("dryRun", false)
  deviceFilter: options.get("deviceFilter", "*")
  maxDevices: options.get("maxDevices", 999)
  
  // Initialize counters
  devicesCreated: 0
  pointsCreated: 0
  errors: []
  
  // Process each device in schema
  schema["devices"].each() device => do
    // Check device filter
    if (not device->name.matches(deviceFilter)) return null
    if (devicesCreated >= maxDevices) return null
    
    // Determine device type from name
    deviceType: parseDeviceType(device->name)
    
    // Build device record
    deviceRec: {
      dis: device->name,
      bacnetConn: connRef,
      bacnetDevice: device->deviceInstance,
      device,
      navName: device->name
    }
    
    // Add equipment tags based on type
    deviceRec = addEquipmentTags(deviceRec, deviceType)
    
    // Create device if not dry run
    if (not dryRun) do
      try
        deviceId: commit(diff(null, deviceRec, {add}))
        devicesCreated++
        
        // Import points for this device
        pointsResult: importDevicePoints(deviceId, device->points, connRef, dryRun)
        pointsCreated = pointsCreated + pointsResult->count
        
      catch (err)
        errors = errors.add({device: device->name, error: err.toStr})
      end
    end
  end
  
  // Return summary
  [{
    operation: "importBacnetDevices",
    devicesCreated: devicesCreated,
    pointsCreated: pointsCreated,
    errors: errors.size,
    errorDetails: errors,
    dryRun: dryRun,
    timestamp: now()
  }].toGrid
end

/**
 * Parse device type from name pattern
 */
defx parseDeviceType(name) do
  if (name.upper.startsWith("AHU")) return "ahu"
  if (name.upper.startsWith("RTU")) return "rtu" 
  if (name.upper.startsWith("VAV")) return "vav"
  if (name.upper.startsWith("FCU")) return "fcu"
  return "generic"
end

/**
 * Add equipment-specific tags based on device type
 */
defx addEquipmentTags(rec, deviceType) do
  base: rec
  
  // Add common equipment marker
  base = base.set("equip")
  
  // Add type-specific markers
  if (deviceType == "ahu") base = base.set("ahu")
  if (deviceType == "rtu") base = base.set("rtu")
  if (deviceType == "vav") base = base.set("vav")
  if (deviceType == "fcu") base = base.set("fcu")
  
  base
end

/**
 * Import all points for a device
 */
defx importDevicePoints(deviceRef, points, connRef, dryRun) do
  created: 0
  
  points.each() point => do
    // Build point record
    pointRec: {
      dis: point->name,
      point,
      equipRef: deviceRef,
      bacnetConn: connRef,
      bacnetCur: point->objectId,
      navName: point->name
    }
    
    // Add point type tags
    pointRec = addPointTypeTags(pointRec, point)
    
    // Create point if not dry run
    if (not dryRun) do
      try
        commit(diff(null, pointRec, {add}))
        created++
      catch
        // Log but continue with other points
      end
    end
  end
  
  {count: created}
end

/**
 * Add point type tags (sensor, cmd, writable, etc.)
 */
defx addPointTypeTags(rec, pointDef) do
  base: rec
  
  // Determine if writable
  if (pointDef->writable == true) do
    base = base.set("writable").set("cmd")
  else
    base = base.set("sensor")
  end
  
  // Add kind tag based on data type
  kind: pointDef->kind
  if (kind == "Number") base = base.set("number")
  if (kind == "Bool") base = base.set("bool")
  if (kind == "Str") base = base.set("str")
  
  // Add unit if present
  if (pointDef.has("unit")) base = base.set("unit", pointDef->unit)
  
  base
end

/**
 * Read and parse schema from io point
 */
defx readSchemaFromIo(ioRef) do
  // Read current value
  grid: read(ioRef.id, false)
  row: grid.first
  
  // Get schema from curVal or configured point
  schemaStr: row->curVal
  
  // Parse based on format
  if (schemaStr.startsWith("{")) do
    // JSON format
    parseJson(schemaStr)
  else
    // Assume Zinc format
    parseZinc(schemaStr)
  end
end

/**
 * Create job to run import in background
 */
defx createBacnetImportJob(schemaIoRef, connRef, options: {}) do
  job({
    dis: "BACnet Device Import - " + now().toStr,
    task: "importBacnetDevicesFromSchema",
    args: {
      schemaIoRef: schemaIoRef,
      connRef: connRef,
      options: options
    },
    maxRuntime: 30min,
    progressFunc: jobProgress
  })
end

/**
 * Report job progress
 */
defx jobProgress(ctx) do
  // Update job status with current progress
  ctx.progress(
    ctx->devicesCreated + " devices, " + 
    ctx->pointsCreated + " points created"
  )
end
```

---

## Phase 4: Interactive Testing & Refinement

### 4.1 Execute Code in SkySpark

```typescript
// src/integration/QueryExecutor.ts
async function executeAndTest(code: string, session: GenerationSession): Promise<TestResult> {
  const skysparkClient = getSkySparkClient();
  
  try {
    // Step 1: Upload function definitions
    progress.report({ message: "Uploading functions to SkySpark..." });
    await skysparkClient.eval(`
      // Load generated functions
      ${code}
    `);

    // Step 2: Test with dry run
    progress.report({ message: "Running dry-run test..." });
    const testResult = await skysparkClient.eval(`
      // Test import with dry run
      schemaIo: readById(@${session.context.schemaIoId})
      conn: readById(@${session.context.connectorId})
      
      importBacnetDevicesFromSchema(
        schemaIo,
        conn,
        {dryRun: true, maxDevices: 5}
      )
    `);

    // Step 3: Analyze results
    const analysis = analyzeTestResults(testResult);
    
    if (analysis.errors.length === 0) {
      return {
        success: true,
        message: "Dry run successful!",
        summary: analysis.summary,
        readyForProduction: true
      };
    } else {
      return {
        success: false,
        errors: analysis.errors,
        suggestions: generateFixSuggestions(analysis.errors, code),
        readyForProduction: false
      };
    }

  } catch (error) {
    return {
      success: false,
      errors: [parseSkySparError(error)],
      suggestions: generateFixSuggestions([error], code),
      readyForProduction: false
    };
  }
}
```

### 4.2 Error Analysis & Fix Suggestions

```typescript
// src/generation/ErrorRecovery.ts
async function generateFixSuggestions(errors: Error[], originalCode: string): Promise<Fix[]> {
  const provider = providerManager.getActiveProvider();
  
  const fixPrompt = `
You are debugging Axon code that failed execution.

ORIGINAL CODE:
${originalCode}

ERRORS ENCOUNTERED:
${errors.map((e, i) => `${i + 1}. ${e.message}\n   Stack: ${e.stack}`).join('\n\n')}

CONTEXT:
- Running in SkySpark environment
- Testing BACnet device import function
- Using dry-run mode

Analyze the errors and provide:
1. Root cause analysis
2. Specific fix for each error
3. Updated code with fixes applied
4. Explanation of changes

Focus on common Axon pitfalls:
- Grid vs record operations
- Null handling
- Tag syntax
- Reference handling
- Function scope issues
`;

  const fixes = await provider.actMode(
    { steps: ['Analyze errors', 'Generate fixes'] },
    { task: fixPrompt, codeContext: originalCode }
  );

  return parseFixes(fixes.code, fixes.explanation);
}
```

### 4.3 Interactive Refinement UI

```typescript
// Show diff view with suggested fixes
async function showRefinementUI(original: string, fixed: string, session: GenerationSession) {
  // Create diff editor
  const uri1 = vscode.Uri.parse(`cline-generated://original-${session.id}.axon`);
  const uri2 = vscode.Uri.parse(`cline-generated://fixed-${session.id}.axon`);
  
  // Show side-by-side diff
  await vscode.commands.executeCommand(
    'vscode.diff',
    uri1,
    uri2,
    'Code Refinement: Original ↔ Fixed'
  );

  // Show action buttons
  const choice = await vscode.window.showInformationMessage(
    'Code has been refined based on test results',
    { modal: false },
    'Accept Fixes',
    'Test Again',
    'Manual Edit',
    'Explain Changes'
  );

  switch (choice) {
    case 'Accept Fixes':
      await applyFixes(fixed, session);
      await executeAndTest(fixed, session); // Re-test
      break;
    
    case 'Test Again':
      await executeAndTest(original, session);
      break;
    
    case 'Manual Edit':
      await openInEditor(fixed, session);
      break;
    
    case 'Explain Changes':
      await showChangeExplanation(original, fixed, session);
      break;
  }
}
```

---

## Phase 5: Iterative Improvement Loop

### 5.1 User-Guided Refinement

```typescript
// User can request specific improvements
async function handleRefinementRequest(userRequest: string, currentCode: string, session: GenerationSession) {
  // Examples of user requests:
  // - "Add error handling for offline devices"
  // - "Make device naming pattern configurable"
  // - "Add support for CSV schema format"
  // - "Optimize for large numbers of devices"
  
  const provider = providerManager.getActiveProvider();
  
  const refinementPrompt = `
CURRENT CODE:
${currentCode}

USER REQUEST:
"${userRequest}"

SESSION CONTEXT:
- Previous test results: ${session.testResults}
- Identified issues: ${session.knownIssues}
- Project schema: ${session.context.schema}

Modify the code to address the user's request while:
1. Maintaining existing functionality
2. Following Axon best practices
3. Keeping code readable and documented
4. Preserving successful patterns

Provide:
- Updated code
- Explanation of changes
- Testing recommendations
`;

  const refined = await provider.actMode(
    { steps: ['Understand request', 'Modify code', 'Validate'] },
    { task: refinementPrompt, codeContext: currentCode }
  );

  // Show diff and test
  await showRefinementUI(currentCode, refined.code, session);
  
  // Update session
  session.iterations.push({
    request: userRequest,
    code: refined.code,
    timestamp: Date.now()
  });
}
```

### 5.2 Automated Quality Checks

```typescript
// Run quality checks before finalizing
async function runQualityChecks(code: string): Promise<QualityReport> {
  return {
    syntaxValid: await checkAxonSyntax(code),
    hasDocumentation: checkForDocComments(code),
    hasErrorHandling: checkForTryCatch(code),
    usesModernPatterns: checkForModernAxon(code),
    performanceIssues: await analyzePerformance(code),
    securityIssues: checkForSecurityIssues(code),
    score: calculateQualityScore()
  };
}
```

---

## Phase 6: Finalization & Deployment

### 6.1 Save to Project

```typescript
// Save finalized code
async function finalizeGeneration(code: string, session: GenerationSession) {
  // Create new file or update existing
  const fileName = await vscode.window.showInputBox({
    prompt: 'Function file name',
    value: 'bacnetImport.axon',
    validateInput: (value) => {
      if (!value.endsWith('.axon')) {
        return 'File must have .axon extension';
      }
      return null;
    }
  });

  const filePath = path.join(
    vscode.workspace.rootPath!,
    'src',
    'lib',
    fileName
  );

  // Write file
  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(filePath),
    Buffer.from(code, 'utf8')
  );

  // Open in editor
  const doc = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(doc);

  // Save session for future reference
  await session.save();
  
  // Show success message with stats
  vscode.window.showInformationMessage(
    `✅ Generated ${session.functionCount} functions in ${session.iterations.length} iterations. ` +
    `Cost: $${session.totalCost.toFixed(3)}, Cache hits: ${session.cacheHits}`
  );
}
```

### 6.2 Session Export

```typescript
// Export session for sharing/documentation
async function exportSession(session: GenerationSession): Promise<string> {
  return `
# Code Generation Session Export

**Date:** ${new Date(session.startTime).toISOString()}
**Duration:** ${(session.endTime - session.startTime) / 1000}s
**Iterations:** ${session.iterations.length}

## Original Request
\`\`\`
${session.initialRequest}
\`\`\`

## Context Gathered
- Schema records: ${session.context.schemaRecordCount}
- Examples used: ${session.context.examplesUsed.length}
- Project: ${session.context.projectName}

## Generation Process

${session.iterations.map((iter, i) => `
### Iteration ${i + 1}
**Changes:** ${iter.request}
**Test Result:** ${iter.testResult?.success ? '✅ Passed' : '❌ Failed'}
${iter.testResult?.errors ? `**Errors:** ${iter.testResult.errors.join(', ')}` : ''}
`).join('\n')}

## Final Code

\`\`\`axon
${session.finalCode}
\`\`\`

## Quality Metrics
- Functions generated: ${session.functionCount}
- Lines of code: ${session.finalCode.split('\n').length}
- Documentation coverage: ${session.qualityReport.hasDocumentation ? 'Yes' : 'No'}
- Error handling: ${session.qualityReport.hasErrorHandling ? 'Yes' : 'No'}

## Cost Analysis
- Total tokens: ${session.totalTokens}
- Total cost: $${session.totalCost.toFixed(4)}
- Cache hit rate: ${(session.cacheHits / session.totalRequests * 100).toFixed(1)}%
- Cost savings from cache: $${session.cacheSavings.toFixed(4)}
`;
}
```

---

## Key Features Enabling This Workflow

### 1. **MCP Integration**
- Real-time schema access
- Example code retrieval
- Project analysis

### 2. **SkySpark API Integration**
- Live code execution
- Immediate feedback
- Error analysis

### 3. **AI Provider Abstraction**
- Plan/Act mode for quality
- Streaming for responsiveness
- Cost optimization via caching

### 4. **Caching System**
- Similar requests cached
- Context reused
- Dramatic cost savings

### 5. **Session Management**
- Track all iterations
- Learn from history
- Reproducible generations

---

## User Experience Flow

```
1. User: "Generate BACnet import function"
   ↓
2. Extension: Shows progress, gathering context
   ↓
3. Extension: Presents generated code in diff view
   ↓
4. User: "Test this"
   ↓  
5. Extension: Executes in SkySpark, shows results
   ↓
6. Extension: "Found 2 errors, here are suggested fixes"
   ↓
7. User: "Accept fixes and add better error messages"
   ↓
8. Extension: Refines code, re-tests
   ↓
9. Extension: "✅ All tests pass! Quality score: 92%"
   ↓
10. User: "Save to project"
    ↓
11. Extension: Creates file, updates index, ready to use
```

---

## Success Metrics

**Goal: 90% Working Code, 10% Manual Fixes**

### Achieved Through:
- ✅ Rich context from MCP (schema, examples, patterns)
- ✅ Iterative testing with real SkySpark API
- ✅ AI-powered error analysis and fixes
- ✅ User-guided refinement
- ✅ Quality checks before finalization

### Typical Results:
- **First generation:** 60-70% working
- **After 1 iteration:** 80-85% working  
- **After 2-3 iterations:** 90-95% working
- **Manual fixes needed:** 5-10% (edge cases, business logic)

---

## Configuration

```json
// .vscode/settings.json
{
  "axon.generation": {
    "enableAutoTest": true,
    "maxIterations": 5,
    "qualityThreshold": 0.85,
    "useCache": true,
    "defaultProvider": "anthropic",
    "planModel": "claude-3-haiku",
    "actModel": "claude-sonnet-4",
    "skysparkApi": {
      "enabled": true,
      "testInDryRun": true,
      "maxTestTime": 30000
    }
  }
}
```

---

## Conclusion

This interactive workflow transforms the extension from a simple code generator into an **AI pair programmer** that:

1. **Understands** your requirements deeply
2. **Learns** from your project structure
3. **Generates** high-quality code
4. **Tests** automatically
5. **Refines** based on results
6. **Delivers** 90%+ working code

The 10% manual fixes typically involve:
- Business-specific logic
- Custom validation rules
- Edge case handling
- Performance tuning for your specific environment

This is the **future of SkySpark development** - where AI handles the boilerplate and complex scaffolding, leaving you to focus on the unique business logic.
