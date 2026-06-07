# Function Usage Tracking Extension Design

## Overview
This extension adds the capability to track where and how Axon functions are used throughout a codebase, providing valuable context for AI assistants and developers.

## Key Features

### 1. Function Usage Index
- Track every function call location
- Store context (surrounding code, line numbers)
- Differentiate between built-in and user-defined functions
- Support for method calls (e.g., `grid.hisRead()`)

### 2. New MCP Tools

#### `findFunctionUsage`
```json
{
  "name": "findFunctionUsage",
  "description": "Find all places where a specific function is used",
  "inputSchema": {
    "type": "object",
    "properties": {
      "functionName": {
        "type": "string",
        "description": "Name of the function to search for (e.g., 'readAll', 'commit')"
      },
      "includeContext": {
        "type": "boolean",
        "description": "Include surrounding code context (default: true)"
      },
      "limit": {
        "type": "number",
        "description": "Maximum results to return (default: 20)"
      }
    },
    "required": ["functionName"]
  }
}
```

#### `getFunctionExamples`
```json
{
  "name": "getFunctionExamples",
  "description": "Get real-world examples of how a function is used",
  "inputSchema": {
    "type": "object",
    "properties": {
      "functionName": {
        "type": "string",
        "description": "Function name"
      },
      "maxExamples": {
        "type": "number",
        "description": "Number of examples (default: 5)"
      },
      "sortBy": {
        "type": "string",
        "enum": ["relevance", "complexity", "file"],
        "description": "How to sort examples"
      }
    }
  }
}
```

#### `getFunctionCallGraph`
```json
{
  "name": "getFunctionCallGraph",
  "description": "Show what functions call this function and what it calls",
  "inputSchema": {
    "type": "object",
    "properties": {
      "functionName": {
        "type": "string"
      },
      "depth": {
        "type": "number",
        "description": "How many levels deep to traverse (default: 1)"
      }
    }
  }
}
```

## Implementation Details

### Parser Enhancement
Extend `AxonParser` to detect function calls:

```typescript
interface FunctionUsage {
  functionName: string;
  file: string;
  line: number;
  column: number;
  context: string;
  arguments: string[];
  callingFunction?: string;
  isMethodCall: boolean;
  receiver?: string; // For method calls like grid.hisRead()
}
```

### Usage Detection Patterns
1. **Direct calls**: `readAll(site)`
2. **Method calls**: `point.hisRead(yesterday)`
3. **Nested calls**: `readAll(site).map(s => s.dis)`
4. **Function references**: `sites.map(toRec)`
5. **Dynamic calls**: `funcs[name](args)`

### Storage Structure
```typescript
interface FunctionUsageIndex {
  // Function name -> usage locations
  usages: Map<string, FunctionUsage[]>;
  
  // Function name -> functions that call it
  calledBy: Map<string, Set<string>>;
  
  // Function name -> functions it calls
  calls: Map<string, Set<string>>;
  
  // Statistics
  stats: {
    totalFunctions: number;
    totalUsages: number;
    unusedFunctions: string[];
    mostUsedFunctions: Array<{name: string; count: number}>;
  };
}
```

## Benefits for AI

1. **Contextual Learning**: AI can see how functions are actually used
2. **Pattern Recognition**: Identify common usage patterns
3. **Error Prevention**: Learn from common mistakes in existing code
4. **Best Practices**: Extract best practices from real implementations

## Example Usage

### Query: "How is the commit function used?"

Response would include:
```axon
// Example 1: Adding a new record
commit(diff(null, {dis: "New Site", site: marker()}, {add}))

// Example 2: Updating existing record
rec: read(site and dis=="Test")
commit(diff(rec, {updated: now()}, {update}))

// Example 3: Removing records
readAll(imported).each r => commit(diff(r, {}, {remove}))
```

## Performance Considerations

1. **Incremental Indexing**: Only re-parse changed files
2. **Lazy Loading**: Load usage data on demand
3. **Background Processing**: Index in background thread
4. **Caching**: Cache parsed ASTs and query results

## Configuration

```json
{
  "functionUsageTracking": {
    "enabled": true,
    "excludePatterns": ["test/**", "backup/**"],
    "maxContextLines": 5,
    "indexBuiltinFunctions": true,
    "cacheTimeout": 3600
  }
}
```