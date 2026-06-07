# Using Enhanced AxonUsage.html Examples

## Overview

The Axon MCP Server now includes enhanced processing for the `AxonUsage.html` file, which contains the official Axon language usage examples. These examples are now extracted with special handling to preserve their format, expected outputs, and categorization.

## Special Features

### 1. Example Pairs Preserved

Examples from AxonUsage.html maintain their original format with expected outputs:

```axon
"hi world".size                >>  8
today() + 1day                 >>  tomorrow
x.any v => v < 20              >>  true
```

The expression, output, and any inline comments are all preserved.

### 2. Automatic Section Categorization

Examples are automatically categorized based on their section in the documentation:
- String Examples → `utilities`
- DateTime Examples → `utilities`
- List Examples → `data_analysis`
- Dict Examples → `data_analysis`
- Grid Examples → `data_analysis`
- Energy Examples → `energy`
- And more...

### 3. Enhanced Tags

Each example from AxonUsage.html receives special tags:
- `axon-usage-guide` - Identifies it as from the official guide
- `has-output` - If the example includes expected output (`>>`)
- `has-comment` - If the example includes an inline comment
- `uses-<operator>` - For each operator used (e.g., `uses->=`, `uses-+`)
- Section-specific tags (e.g., `string`, `datetime`, `list`)

### 4. Operator Detection

Operators in examples are automatically detected and tagged:
- Comparison: `==`, `!=`, `>`, `<`, `>=`, `<=`
- Arithmetic: `+`, `-`, `*`, `/`, `%`
- Logical: `&&`, `||`, `!`
- Navigation: `->`, `?->`
- And more...

## Searching for AxonUsage Examples

### Search by Tag

Find all examples from the usage guide:
```json
{
  "tool": "searchAxonDocs",
  "arguments": {
    "keyword": "axon-usage-guide",
    "limit": 20
  }
}
```

### Search by Section

Find examples from a specific section:
```json
{
  "tool": "searchAxonDocs",
  "arguments": {
    "keyword": "string",
    "limit": 10
  }
}
```

### Search for Examples with Output

Find examples that include expected output:
```json
{
  "tool": "searchAxonDocs",
  "arguments": {
    "keyword": "has-output",
    "sourcefile": "AxonUsage",
    "limit": 10
  }
}
```

### Search for Operator Usage

Find usage guide examples that use specific operators:
```json
{
  "tool": "searchAxonOperatorExamples",
  "arguments": {
    "operator": ">=",
    "limit": 10
  }
}
```

## Example Output Format

When you retrieve an AxonUsage example, the source code preserves the original format:

```json
{
  "name": "List_Example_3",
  "sourceCode": "x.any v => v < 20  >>  true",
  "description": "List example from AxonUsage guide",
  "tags": [
    "documentation",
    "example", 
    "axon-usage-guide",
    "list",
    "has-output",
    "uses-<",
    "uses-=>"
  ],
  "category": "data_analysis"
}
```

## Benefits

1. **Learning Resource**: Official examples with expected outputs help developers learn Axon
2. **Operator Reference**: Real examples of how operators are used in context
3. **Categorized Examples**: Easy to find examples for specific data types or operations
4. **Preserved Format**: The `>>` output format makes it clear what the expression evaluates to

## Implementation Details

The enhanced processing:
1. Parses HTML to extract section headers
2. Extracts code from `<pre>` blocks within each section
3. Parses each line to separate expression from output
4. Detects operators and adds appropriate tags
5. Preserves the complete example including output and comments
6. Stores structured data in the `documentation` field as JSON

This provides a rich, searchable reference of official Axon usage examples directly within the MCP server.