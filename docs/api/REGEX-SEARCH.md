# Regex Search in Axon MCP Server

## Overview

The `searchAxonRegex` tool allows you to search Axon code using regular expressions with context, similar to `grep` but with enhanced formatting and integration with the MCP server.

## Usage

### Basic Search

Search for `if.*do` pattern:
```json
{
  "tool": "searchAxonRegex",
  "arguments": {
    "pattern": "if.*do"
  }
}
```

This returns results formatted like:
```
Found 3 results.

demo/ahuOutsideDamperStuckClosed.axon
│----
│  if (mixedTemp != null) do
│    tempPeriods: ahuTempDiff(outsideTemp, mixedTemp, dates).hisFindPeriods(match)
│      // the function with reGroups
│----

demo/importExample.axon
│----
│  mixedTemp: toAhuMixedTemp(ahu, false)
│      if (regex.reMatches(name)) do
│        tagsToAdd.each((v, n) => do
│----
```

### With More Context

Get more context lines around matches:
```json
{
  "tool": "searchAxonRegex",
  "arguments": {
    "pattern": "readAll\\(.*\\)",
    "contextLines": 5
  }
}
```

### JSON Output Format

Get structured JSON output instead of text:
```json
{
  "tool": "searchAxonRegex",
  "arguments": {
    "pattern": "hisRead",
    "format": "json"
  }
}
```

Returns:
```json
{
  "totalMatches": 5,
  "results": [
    {
      "file": "energy/meterOccUsage.axon",
      "matches": [
        {
          "line": 15,
          "matchedLine": "data: meter.hisRead(span)",
          "context": [
            "meter: readById(meter)",
            "data: meter.hisRead(span)",
            "rollup: data.hisRollup(sum, 1day)"
          ]
        }
      ]
    }
  ]
}
```

## Common Regex Patterns

### Control Flow Patterns
- `if.*do` - Find if-do blocks
- `if.*then.*else` - Find if-then-else statements
- `try.*catch` - Find try-catch blocks
- `\\.each\\s*\\(` - Find each iterations

### Function Calls
- `readAll\\(.*\\)` - Find readAll calls
- `hisRead\\(.*\\)` - Find history reads
- `\\.map\\s*\\(` - Find map operations
- `=>` - Find lambda functions

### Operators
- `>=|<=` - Find comparison operators
- `\\+|-|\\*|/` - Find arithmetic operators
- `&&|\\|\\|` - Find logical operators
- `->` - Find navigation operator

### Data Patterns
- `@[a-fA-F0-9-]+` - Find record IDs
- `\\d+[a-zA-Z]+²?` - Find numbers with units
- `"[^"]*"` - Find string literals
- `//.*$` - Find comments

## Advanced Examples

### Find Function Definitions
```json
{
  "tool": "searchAxonRegex",
  "arguments": {
    "pattern": "^\\s*\\(.*\\)\\s*=>\\s*do",
    "contextLines": 0
  }
}
```

### Find Grid Operations
```json
{
  "tool": "searchAxonRegex",
  "arguments": {
    "pattern": "\\.toGrid|gridColNames|gridRowCount",
    "contextLines": 3
  }
}
```

### Find Energy Calculations
```json
{
  "tool": "searchAxonRegex",
  "arguments": {
    "pattern": "kW|kWh|energy|power",
    "contextLines": 4
  }
}
```

### Find Date Operations
```json
{
  "tool": "searchAxonRegex",
  "arguments": {
    "pattern": "today\\(\\)|yesterday\\(\\)|thisMonth\\(\\)|lastMonth\\(\\)",
    "contextLines": 2
  }
}
```

## Tips

1. **Escape Special Characters**: Remember to escape regex special characters:
   - Use `\\.` for literal dots
   - Use `\\(` and `\\)` for literal parentheses
   - Use `\\[` and `\\]` for literal brackets

2. **Case Sensitivity**: Patterns are case-sensitive by default

3. **Multi-line Patterns**: The search works line by line, so multi-line patterns won't match across lines

4. **Performance**: Complex regex patterns may take longer on large codebases

5. **Context Lines**: Use `contextLines: 0` for just the matching lines, or increase for more context

## Integration with Other Tools

The regex search complements other search tools:
- Use `searchAxonExamples` for keyword-based searches
- Use `searchAxonOperatorExamples` for operator-specific searches
- Use `searchAxonRegex` for pattern-based searches
- Use `findFunctionUsage` for specific function call tracking

## Error Handling

If you provide an invalid regex pattern, you'll get an error message. Common issues:
- Unclosed parentheses
- Invalid escape sequences
- Syntax errors in the pattern

The tool will return "No matches found." if the pattern is valid but doesn't match anything.