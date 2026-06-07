# Searching for Operators in Axon Code

This guide explains how to search for operators (like `>=`, `==`, `+`, etc.) in the Axon MCP Server.

## Understanding the Difference: Functions vs Operators

- **Functions**: Called with parentheses, e.g., `readAll()`, `hisRead(point, yesterday)`
- **Operators**: Used inline between values, e.g., `temp >= 70`, `a + b`, `x == y`

## How to Search for Operators

### 1. Using `searchAxonOperatorExamples` (Recommended - New!)

This is a dedicated tool for operator searches with proper indexing and tokenization:

```json
{
  "tool": "searchAxonOperatorExamples",
  "arguments": {
    "operator": ">=",
    "limit": 10
  }
}
```

**Features:**
- Properly tokenizes and indexes all operators during server initialization
- Returns exact line numbers and surrounding code context
- Can search for multiple operators (AND operation)
- Filters by category
- Much faster than text searching

### 2. Using `searchAxonExamples` (Alternative)

```json
{
  "tool": "searchAxonExamples",
  "arguments": {
    "keyword": ">=",
    "limit": 10
  }
}
```

**Note**: As of the latest update, `searchAxonExamples` includes special handling for operators. When you search for a recognized operator, it performs a direct text search in the source code.

### 3. Using `searchAxonDocs`

```json
{
  "tool": "searchAxonDocs",
  "arguments": {
    "keyword": ">=",
    "limit": 5
  }
}
```

This searches for operators in HTML documentation examples.

## Supported Operators

The following operators are recognized and can be searched:

### Comparison Operators
- `==` - Equality
- `!=` - Inequality  
- `>` - Greater than
- `<` - Less than
- `>=` - Greater than or equal
- `<=` - Less than or equal

### Arithmetic Operators
- `+` - Addition
- `-` - Subtraction
- `*` - Multiplication
- `/` - Division
- `%` - Modulo

### Logical Operators
- `&&` - Logical AND
- `||` - Logical OR
- `!` - Logical NOT

### Other Operators
- `?:` - Ternary operator
- `=>` - Lambda/function arrow
- `<<` - Left shift
- `>>` - Right shift
- `&` - Bitwise AND
- `|` - Bitwise OR
- `^` - Bitwise XOR
- `~` - Bitwise NOT

## Examples

### Search for Greater Than or Equal (>=) with New Tool
```json
{
  "tool": "searchAxonOperatorExamples",
  "arguments": {
    "operator": ">=",
    "category": "hvac",
    "limit": 5
  }
}
```

### Search for Functions Using Multiple Operators
```json
{
  "tool": "searchAxonOperatorExamples",
  "arguments": {
    "operators": [">=", "<="],
    "limit": 10
  }
}
```
This finds functions that use BOTH >= and <= operators.

### Search for Greater Than or Equal (>=) with Old Tool
```json
{
  "tool": "searchAxonExamples",
  "arguments": {
    "keyword": ">=",
    "category": "hvac",
    "limit": 5
  }
}
```

### Search for Equality Operator (==)
```json
{
  "tool": "searchAxonExamples",  
  "arguments": {
    "keyword": "==",
    "limit": 10
  }
}
```

### Search for Lambda Arrow (=>)
```json
{
  "tool": "searchAxonExamples",
  "arguments": {
    "keyword": "=>",
    "category": "data",
    "limit": 5
  }
}
```

## What Happens When You Search for an Operator in `findFunctionUsage`

If you try to use `findFunctionUsage` with an operator, you'll get a helpful error message:

```json
{
  "error": "Operator search not supported",
  "message": ">= is an operator, not a function. The findFunctionUsage tool only searches for function calls.",
  "suggestion": "To search for operator usage, use the searchAxonExamples tool with the operator as a keyword.",
  "example": {
    "tool": "searchAxonExamples",
    "arguments": {
      "keyword": ">=",
      "limit": 20
    }
  }
}
```

## Tips for Better Operator Searches

1. **Be specific**: Search for the exact operator symbol
2. **Use categories**: Narrow down results by category if you know where to look
3. **Combine with other filters**: Use tags to further refine results
4. **Check documentation**: Use `searchAxonDocs` for tutorial examples

## Limitations

- Operators must be recognized in the supported list above
- Complex expressions with multiple operators should be searched individually
- The search is case-sensitive for operators (though this rarely matters)