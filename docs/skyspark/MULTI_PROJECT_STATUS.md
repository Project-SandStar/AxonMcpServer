# Multi-Project Setup & Haystack Client Status

**Date:** September 30, 2025  
**Status:** Multi-Project Infrastructure COMPLETE ✅  
**Haystack Core:** Fully Integrated ✅

---

## 🎉 Executive Summary

### What's Done ✅
1. ✅ **Multi-project infrastructure** - Fully implemented
2. ✅ **Haystack Core library** - Correctly integrated
3. ✅ **Configuration management** - SkySparkConfigManager working
4. ✅ **Project switching** - Runtime switching between instances/projects
5. ✅ **Basic SkySpark operations** - eval, read, validate, query

### What's Missing 🚧
1. 🚧 **MCP tool integration** - Multi-project support in MCP tools (2-3 hours)
2. 🚧 **Project discovery tool** - List available projects via MCP
3. 🚧 **Project context switching** - Change active project during session
4. 🚧 **Per-project caching** - Cache data separately per project

---

## 📊 Current Architecture

### Haystack Core Library Usage ✅

**Status:** PROPERLY IMPLEMENTED (Refactored September 30, 2025)

The `haystackClient.ts` now properly uses haystack-core:

```typescript
import {
  HDict,      // ✅ Used for type checking
  HGrid,      // ✅ Used for type checking
  HVal,       // ✅ Return type
  HStr,       // ✅ Used in HStr.make().toZinc()
  HNum,       // ⚠️ Imported but not used
  HRef,       // ✅ Used in HRef.make()
  HMarker,    // ✅ Used for type checking
  HBool,      // ✅ Used for type checking
  ZincReader, // ✅ MAIN USAGE - Parses Zinc
  HFilter     // ⚠️ Imported but not used
} from 'haystack-core';
```

**Implementation Details:**
- ✅ ZincReader properly parses Zinc responses
- ✅ Type checking with `instanceof HDict`, `instanceof HGrid`, etc.
- ✅ Creating typed values with `HRef.make()`, `HStr.make()`, etc.
- ✅ Using `HDict.get<T>()` for type-safe property access
- ✅ Helper methods for extracting typed values:
  - `getStr(dict, name)` → `string | undefined`
  - `getNum(dict, name)` → `number | undefined`  
  - `getBool(dict, name)` → `boolean | undefined`
  - `isMarker(val)` → `boolean`
- ✅ Proper value access via `.value` property on HBool, HNum
- ✅ Type-safe grid iteration with `Array.from(grid)`

**Should we continue using it?** **YES!** But use it properly. `haystack-core` provides:
- Type safety for Haystack data
- Proper Zinc parsing/encoding
- Standards compliance
- Better error handling

---

## 🔧 Multi-Project Infrastructure

### 1. Configuration Management ✅

**Location:** `src/config/skysparkConfig.ts`

**Features:**
- ✅ Load from environment variables (.env, .env.skyspark)
- ✅ Load from JSON config files (config/*.json)
- ✅ Support multiple SkySpark instances
- ✅ Support multiple projects per instance
- ✅ Runtime project switching
- ✅ Get all available projects

**Example Usage:**
```typescript
const configManager = new SkySparkConfigManager('./config');
const client = new HaystackSkySparkClient(configManager);

// Switch projects
client.switchTo('local', 'mobilytik');
client.switchTo('local', 'eacDemoV4');

// Get current config
const config = client.getCurrentConfig();
// { instance: 'local', project: 'mobilytik', url: '...' }
```

### 2. Haystack Client ✅

**Location:** `src/skyspark/haystackClient.ts`

**Core Features:**
- ✅ `evalAxon(code)` - Execute Axon code
- ✅ `readAll(filter)` - Query entities
- ✅ `read(id)` - Read single entity
- ✅ `validateAxon(code)` - Validate with detailed errors
- ✅ `switchTo(instance, project)` - Change active project

**Project Discovery Features:**
- ✅ `getProjectFunctions()` - List all custom functions
- ✅ `getFunctionSource(name)` - Get function source code
- ✅ `getProjectSchema()` - Get all tags and their usage
- ✅ `getRecordTypes()` - Get entity types (site, equip, point, etc.)

### 3. Configuration Files ✅

**Structure:**
```
config/
├── local-skyspark.json          # Your local instance config
└── remote-skyspark.example.json # Template for remote instances
```

**Current Projects Available:**
1. **mobilytik** - Your primary project
2. **cityFurnitureCustomerTraffic**
3. **eacDemoV4**
4. **hybDemo**
5. **reFuelMarket**
6. **test**
7. **demo**

---

## 🚧 What Needs to Be Done

### Priority 1: MCP Tool Integration (2-3 hours)

**Add these new MCP tools:**

#### 1. `listSkySparkProjects` 
```typescript
{
  name: 'listSkySparkProjects',
  description: 'List available SkySpark instances and projects',
  inputSchema: {
    type: 'object',
    properties: {
      instanceName: {
        type: 'string',
        description: 'Filter by instance name (optional)'
      }
    }
  }
}
```

**Implementation:**
```typescript
private async listProjects(args: any) {
  if (!this.skysparkClient || !this.configManager) {
    return { error: 'SkySpark not configured' };
  }
  
  const projects = this.configManager.getAllProjects();
  const current = this.skysparkClient.getCurrentConfig();
  
  return {
    current: {
      instance: current.instance,
      project: current.project
    },
    available: projects,
    count: projects.length
  };
}
```

#### 2. `switchSkySparkProject`
```typescript
{
  name: 'switchSkySparkProject',
  description: 'Switch to a different SkySpark project',
  inputSchema: {
    type: 'object',
    properties: {
      instanceName: {
        type: 'string',
        description: 'Instance name (e.g., "local")',
        default: 'local'
      },
      projectName: {
        type: 'string',
        description: 'Project name to switch to'
      }
    },
    required: ['projectName']
  }
}
```

**Implementation:**
```typescript
private async switchProject(args: any) {
  if (!this.skysparkClient) {
    throw new McpError(ErrorCode.InvalidRequest, 'SkySpark not configured');
  }
  
  const instance = args.instanceName || 'local';
  const project = args.projectName;
  
  try {
    this.skysparkClient.switchTo(instance, project);
    const config = this.skysparkClient.getCurrentConfig();
    
    // Clear caches that are project-specific
    this.cacheManager.clearProjectCache?.();
    
    return {
      success: true,
      activeProject: config.project,
      activeInstance: config.instance,
      url: config.url
    };
  } catch (error: any) {
    throw new McpError(ErrorCode.InvalidRequest, error.message);
  }
}
```

#### 3. `discoverProjectFunctions`
```typescript
{
  name: 'discoverProjectFunctions',
  description: 'Discover all custom Axon functions in the current project',
  inputSchema: {
    type: 'object',
    properties: {
      includeSource: {
        type: 'boolean',
        description: 'Include function source code',
        default: false
      }
    }
  }
}
```

**Implementation:**
```typescript
private async discoverFunctions(args: any) {
  if (!this.skysparkClient) {
    throw new McpError(ErrorCode.InvalidRequest, 'SkySpark not configured');
  }
  
  const grid = await this.skysparkClient.getProjectFunctions();
  const functions = [];
  
  for (const row of grid) {
    if (!row) continue;
    
    const func = {
      name: row.get('name')?.toString(),
      signature: row.get('sig')?.toString(),
      doc: row.get('doc')?.toString(),
      module: row.get('mod')?.toString()
    };
    
    if (args.includeSource && func.name) {
      func.source = await this.skysparkClient.getFunctionSource(func.name);
    }
    
    functions.push(func);
  }
  
  return {
    project: this.skysparkClient.getCurrentConfig().project,
    count: functions.length,
    functions
  };
}
```

#### 4. `getProjectSchema`
```typescript
{
  name: 'getProjectSchema',
  description: 'Get the data model schema of the current project',
  inputSchema: {
    type: 'object',
    properties: {
      includeTypes: {
        type: 'boolean',
        description: 'Include record type analysis',
        default: true
      }
    }
  }
}
```

**Implementation:**
```typescript
private async getProjectSchema(args: any) {
  if (!this.skysparkClient) {
    throw new McpError(ErrorCode.InvalidRequest, 'SkySpark not configured');
  }
  
  const [schema, types] = await Promise.all([
    this.skysparkClient.getProjectSchema(),
    args.includeTypes ? this.skysparkClient.getRecordTypes() : Promise.resolve(null)
  ]);
  
  const tags = Array.from(schema).filter(row => row !== undefined).map(row => ({
    name: row!.get('tag')?.toString(),
    count: row!.get('count')?.toString(),
    isMarker: row!.get('marker')?.toString() === 'true',
    isRef: row!.get('ref')?.toString() === 'true',
    isStr: row!.get('str')?.toString() === 'true',
    isNum: row!.get('num')?.toString() === 'true'
  }));
  
  let recordTypes = null;
  if (types) {
    recordTypes = Array.from(types).filter(row => row !== undefined).map(row => ({
      type: row!.get('type')?.toString(),
      count: row!.get('count')?.toString(),
      subtypes: row!.get('subtypes')?.toString()
    }));
  }
  
  return {
    project: this.skysparkClient.getCurrentConfig().project,
    tagCount: tags.length,
    tags,
    recordTypes
  };
}
```

### Priority 2: Per-Project Caching (1-2 hours)

**Update CacheManager to support project-specific caches:**

```typescript
// src/cache/cacheManager.ts

export class CacheManager {
  // Add project-specific cache keys
  private getProjectCacheKey(baseKey: string, project?: string): string {
    if (!project) return baseKey;
    return `${project}:${baseKey}`;
  }
  
  // Add method to clear project cache
  public clearProjectCache(project?: string) {
    if (!project) {
      // Clear all project caches
      this.cache.clear();
    } else {
      // Clear specific project cache
      const keysToDelete = Array.from(this.cache.keys())
        .filter(key => key.startsWith(`${project}:`));
      keysToDelete.forEach(key => this.cache.delete(key));
    }
  }
}
```

### Priority 3: Configuration UI/Tools (Optional)

**Consider adding:**
- Tool to add new SkySpark instances via MCP
- Tool to test connection to a project
- Tool to list available projects without switching

---

## 🎯 Recommended Implementation Order

### Step 1: Add MCP Tools (Today - 2 hours)
```bash
# 1. Edit src/index.ts
# 2. Add 4 new tools to ListToolsRequestSchema
# 3. Add 4 new cases to CallToolRequestSchema
# 4. Implement the 4 handler methods
# 5. Test with MCP inspector
```

### Step 2: Update CacheManager (Today - 1 hour)
```bash
# 1. Add project-aware cache keys
# 2. Add clearProjectCache method
# 3. Call clearProjectCache when switching projects
```

### Step 3: Test Multi-Project Workflow (Today - 30 min)
```bash
# 1. Use listSkySparkProjects to see available
# 2. Use switchSkySparkProject to change
# 3. Use discoverProjectFunctions to explore
# 4. Use generateAxonCode with project-specific context
```

---

## 📝 Integration Points

### Where Multi-Project Support Matters:

1. **Code Generation** (`generateAxonCode`)
   - ✅ Already works (uses active client)
   - Could enhance: Suggest functions from current project

2. **Code Validation** (`validateAxonCode`)
   - ✅ Already works (validates against active project)
   - Working correctly

3. **Code Execution** (`executeAxonCode`)
   - ✅ Already works (executes in active project)
   - Working correctly

4. **Haystack Queries** (`queryHaystack`)
   - ✅ Already works (queries active project)
   - Working correctly

5. **Template Library**
   - Could enhance: Tag templates by project they came from
   - Could enhance: Export templates from specific projects

---

## 🔑 Key Files to Edit

### 1. src/index.ts
- Add new tool definitions (lines ~410-455)
- Add new tool handlers (lines ~460-575)
- Add handler implementations (lines ~1220-1430)

### 2. src/cache/cacheManager.ts
- Add project-aware caching
- Add clearProjectCache method

### 3. Update REMAINING_WORK.md
- Mark multi-project as complete
- Update MCP tools count to 20

---

## 💡 Example Usage After Implementation

```typescript
// User asks: "What SkySpark projects do I have access to?"
// Tool: listSkySparkProjects
// Response:
{
  current: { instance: 'local', project: 'mobilytik' },
  available: [
    { instance: 'local', project: 'mobilytik', description: 'Primary' },
    { instance: 'local', project: 'eacDemoV4', description: 'Energy demo' },
    // ... more projects
  ],
  count: 7
}

// User: "Switch to eacDemoV4"
// Tool: switchSkySparkProject
// Response:
{
  success: true,
  activeProject: 'eacDemoV4',
  activeInstance: 'local',
  url: 'http://localhost:8080/api/eacDemoV4'
}

// User: "What custom functions exist in this project?"
// Tool: discoverProjectFunctions
// Response:
{
  project: 'eacDemoV4',
  count: 42,
  functions: [
    { name: 'energyAnalysis', signature: '(meter, range)', doc: '...' },
    // ... more functions
  ]
}

// User: "Generate code to analyze energy consumption"
// Tool: generateAxonCode
// - Uses templates + discovered project functions
// - Generates code that works in current project context
```

---

## ✅ Haystack Core: Why It's The Right Choice

### Benefits We Get:

1. **Type Safety**
   ```typescript
   const dict = await client.read('site-123');
   const name = dict.get('dis');  // HStr type, not any
   ```

2. **Proper Value Handling**
   ```typescript
   HNum.make(42, 'kW')     // Numbers with units
   HRef.make('equip-123')  // Typed references
   HMarker.make()          // Marker values
   ```

3. **Zinc Parsing**
   ```typescript
   const reader = new ZincReader(response);
   const grid = reader.readValue();  // Properly parsed HGrid
   ```

4. **Standards Compliance**
   - Follows Project Haystack specs
   - Compatible with all Haystack servers
   - Not SkySpark-specific

### Alternative (Not Recommended):

Using raw axios/fetch would require:
- ❌ Manual Zinc parsing
- ❌ Custom type definitions
- ❌ More error-prone
- ❌ Reinventing the wheel

**Recommendation:** Keep using `haystack-core` - it's the right tool for the job! ✅

---

## 📊 Current vs Target State

### Current (Today)
```
MCP Server
├── 16 tools implemented ✅
├── Haystack client working ✅
├── Multi-project infrastructure ✅
└── BUT: No MCP tools for project management ❌
```

### Target (After 3 hours work)
```
MCP Server
├── 20 tools implemented ✅
├── Haystack client working ✅
├── Multi-project infrastructure ✅
├── Project discovery via MCP ✅
├── Project switching via MCP ✅
└── Per-project caching ✅
```

---

## 🚀 Quick Start Commands

### Test Current Multi-Project Setup
```bash
# Test connection to current project
npx ts-node test-connection.ts

# Test project switching
npx ts-node test-multi-project.ts

# Export functions from mobilytik
npx ts-node test-multi-project.ts --export mobilytik
```

### After MCP Tools Implementation
```bash
# In Claude Desktop or any MCP client:
# 1. Ask: "What SkySpark projects are available?"
# 2. Ask: "Switch to eacDemoV4"
# 3. Ask: "What functions exist in this project?"
# 4. Ask: "Generate code to analyze energy data"
```

---

**Next Action:** Add the 4 MCP tools listed above to complete multi-project integration.

**Estimated Time:** 2-3 hours  
**Priority:** HIGH  
**Dependencies:** None - infrastructure is ready!

---

**Last Updated:** September 30, 2025  
**Status:** Infrastructure complete, MCP integration pending