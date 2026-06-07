# Function Usage Tracking Feature

## Overview

The Function Usage Tracking feature enhances the Axon MCP Server by providing deep insights into how functions are used throughout your codebase. This is particularly useful for:

- **AI Assistants**: Learn from real-world usage patterns to provide better suggestions
- **Developers**: Quickly find examples and understand function usage
- **Code Quality**: Identify unused functions and analyze dependencies

## Architecture

### Components

1. **FunctionUsageParser** (`src/parser/functionUsageParser.ts`)
   - Parses Axon code to detect function calls
   - Handles direct calls, method calls, and function references
   - Extracts context and arguments

2. **FunctionUsageIndexer** (`src/search/functionUsageIndex.ts`)
   - Builds and maintains the usage index
   - Provides search and analysis capabilities
   - Handles caching for performance

3. **MCP Tools** (integrated in `src/index.ts`)
   - `findFunctionUsage`: Find where functions are used
   - `getFunctionExamples`: Get real-world examples
   - `getFunctionCallGraph`: Analyze call relationships
   - `getFunctionUsageStats`: Get usage statistics

## How It Works

### 1. Parsing Phase
The parser scans all Axon files and identifies:
- Function calls: `readAll(site)`
- Method calls: `point.hisRead(yesterday)`
- Function references: `sites.map(toRec)`
- Chained calls: `readAll(site).map(s => s.dis).filter(...)`

### 2. Indexing Phase
The indexer builds several data structures:
- **Usage Map**: Function name → list of usage locations
- **Call Graph**: Tracks which functions call which
- **Statistics**: Most used functions, unused functions, etc.

### 3. Querying Phase
The MCP tools provide various ways to query the index:
- Search by function name
- Get examples with varying complexity
- Analyze dependencies
- Generate statistics

## Example Usage

### Finding Function Usage
```javascript
// Request
{
  "tool": "findFunctionUsage",
  "arguments": {
    "functionName": "commit",
    "limit": 5,
    "includeContext": true
  }
}

// Response
{
  "function": "commit",
  "count": 5,
  "usages": [
    {
      "file": "/axon-library/admin/addRec.axon",
      "line": 20,
      "context": "commit(diff(null, tags, {add}))",
      "arguments": ["diff(null, tags, {add})"],
      "isMethodCall": false,
      "functionType": "builtin",
      "surroundingContext": [
        "// adds temporary \"imported\" marker",
        "tags = tags.set(\"imported\", marker())",
        "commit(diff(null, tags, {add}))"
      ]
    }
  ]
}
```

### Getting Function Examples
```javascript
// Request
{
  "tool": "getFunctionExamples",
  "arguments": {
    "functionName": "hisRead",
    "maxExamples": 3
  }
}

// Response
{
  "function": "hisRead",
  "examples": [
    {
      "file": "/axon-library/energy/consumption.axon",
      "line": 15,
      "complexity": "simple",
      "description": "1 argument",
      "code": "data: point.hisRead(yesterday)"
    },
    {
      "file": "/axon-library/analysis/trends.axon",
      "line": 42,
      "complexity": "medium",
      "description": "2 arguments, Method call on point",
      "code": "his: point.hisRead(dateRange, {limit: 1000})"
    }
  ]
}
```

### Analyzing Call Graphs
```javascript
// Request
{
  "tool": "getFunctionCallGraph",
  "arguments": {
    "functionName": "meterOccUsage",
    "depth": 2
  }
}

// Response
{
  "function": "meterOccUsage",
  "calledBy": ["energyReport", "monthlyAnalysis"],
  "calls": ["readAll", "hisRead", "fold"],
  "depth": 2,
  "graph": [
    ["meterOccUsage", ["readAll", "hisRead", "fold"]],
    ["readAll", ["toGrid", "filter"]],
    ["hisRead", ["hisInterpolate"]]
  ]
}
```

## Performance Considerations

1. **Caching**: The index is cached to avoid re-parsing on every startup
2. **Incremental Updates**: Future versions will support incremental updates
3. **Lazy Loading**: Large result sets are paginated
4. **Background Processing**: Indexing happens asynchronously

## Configuration

Add to your `axon-config.json`:

```json
{
  "functionUsageTracking": {
    "enabled": true,
    "excludePatterns": ["test/**", "backup/**"],
    "maxContextLines": 5,
    "indexBuiltinFunctions": true,
    "cacheTimeout": 3600000
  }
}
```

## Built-in Functions

The system recognizes 85+ built-in SkySpark functions including:
- Database: `read`, `readAll`, `commit`, `diff`
- History: `hisRead`, `hisWrite`, `hisRollup`
- Points: `pointWrite`, `pointRead`
- Utilities: `now`, `today`, `toStr`
- Collections: `map`, `filter`, `fold`, `each`

## Future Enhancements

1. **Real-time Updates**: Watch for file changes and update index
2. **Semantic Search**: Find functions by what they do, not just name
3. **Type Analysis**: Track argument types and return values
4. **Performance Metrics**: Measure function execution patterns
5. **Refactoring Support**: Suggest optimizations based on usage patterns