# New MCP Tools Available

After rebuilding the server, these new tools are now available:

## 1. generateAxonCode
Generate Axon code from templates using natural language intent.

```json
{
  "tool": "generateAxonCode",
  "arguments": {
    "intent": "calculate energy consumption for all meters last month",
    "validate": true
  }
}
```

## 2. validateAxonCode
Comprehensive code validation including syntax, semantics, best practices, and performance.

```json
{
  "tool": "validateAxonCode",
  "arguments": {
    "code": "readAll(ahu).map(x => x->airFlow)",
    "includeSemantics": true,
    "includeBestPractices": true,
    "includePerformance": true,
    "suggestFixes": true
  }
}
```

## 3. queryHaystack
Query Haystack data using filters (requires SkySpark connection).

```json
{
  "tool": "queryHaystack",
  "arguments": {
    "filter": "site",
    "limit": 10,
    "format": "json"
  }
}
```

## 4. listAxonTemplates
List available code templates with optional filtering.

```json
{
  "tool": "listAxonTemplates",
  "arguments": {
    "category": "energy",
    "search": "meter"
  }
}
```

## 5. executeAxonCode
Execute Axon code directly in SkySpark (requires connection).

```json
{
  "tool": "executeAxonCode",
  "arguments": {
    "code": "readAll(site).size",
    "timeout": 30
  }
}
```

## Enhanced Tool

### searchAxonExamples
Now includes template suggestions when searching with keywords.

Response includes:
```json
{
  "count": 5,
  "functions": [...],
  "templateSuggestions": [...]
}
```

## How to Use

1. **Restart Claude Desktop/Cline** to pick up the new tools
2. Update your `autoApprove` list in the MCP configuration to include the new tools
3. The tools will now be available for AI assistants to use

## Recommended autoApprove Configuration

```json
"autoApprove": [
  "searchAxonExamples",
  "searchAxonOperatorExamples",
  "searchAxonDocs",
  "listAxonCategories",
  "getAxonExample",
  "getAxonPattern",
  "listAxonPatterns",
  "findFunctionUsage",
  "getFunctionExamples",
  "getFunctionCallGraph",
  "getFunctionUsageStats",
  "searchAxonRegex",
  "listAxonTemplates",
  "generateAxonCode",
  "validateAxonCode",
  "queryHaystack",
  "executeAxonCode"
]
```

## Notes

- **SkySpark Connection**: `queryHaystack` and `executeAxonCode` require a SkySpark connection
- **Validation**: `validateAxonCode` provides best results with SkySpark connection, but works offline too
- **Templates**: Currently 5 templates available (energy, HVAC, data, fault detection)
- **Safety**: `executeAxonCode` should be used carefully as it runs code on your SkySpark server