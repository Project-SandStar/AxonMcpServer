# Enhancement: Special Handling for AxonUsage.html

## Overview

The `AxonUsage.html` file in the Haxall documentation contains comprehensive examples of Axon code usage, including extensive operator usage examples. This file serves as a primary reference for Axon developers and should receive special handling in our indexing system.

## Current State

The file is already being captured by our HTML documentation scanner through the pattern `**/docHaxall/*.html`. However, the examples in this file are particularly valuable and could benefit from enhanced tokenization.

## Examples Found in AxonUsage.html

### String Operations
```axon
"num=" + 3                     >>  "num=3"  // string concatenation
"hi world"[3..-2]              >>  "worl"   // range slice operator
```

### Comparison Operators
```axon
x.any v => v < 20              >>  true     // less than
x.all v => v < 20              >>  false    // less than
d.any v => v.isDate            >>  true     // arrow operator
g.any r => r->area > 2000ft²   >>  true     // arrow and greater than
g.findAll r => r->area < 2000   >>  grid with rows where area < 2000
```

### Arithmetic Operators
```axon
today() + 1day                 >>  tomorrow  // addition
now() + 1hr                    >>  one hour from now
x.fold(sum)                    >>  60       // using sum function
```

### Range Operators
```axon
toDateSpan(2023-01-01..2023-02-28)  // date range
g[0..1]                              // slice to new grid
```

### Logical Operators
```axon
site and geoCity=="Richmond"    // logical AND
readAll(cool and equipRef==ahu->id)  // AND in filter
```

### Special Operators
```axon
ahu->dis                       // arrow operator for navigation
equipRef==xxx                  // equality operator
siteRef->dis=="Foo"            // combined arrow and equality
```

## Recommendations

### 1. Enhanced Example Extraction

Currently, the HTML scanner extracts code from `<pre>` tags. For AxonUsage.html specifically, we should:

- Preserve the example format including the `>>` output indicators
- Extract both the expression and its expected result
- Tag these examples with special metadata indicating they're from the usage guide

### 2. Special Tokenization Rules

For examples from AxonUsage.html, consider:

- Creating "example pairs" that link expressions with their results
- Adding tags like `usage-example`, `has-output`, `reference-example`
- Preserving the complete context including comments

### 3. Categorization Enhancement

The file is already organized into sections:
- Str Examples
- Date/Time Examples  
- List Examples
- Dict Examples
- Grid Examples
- His Examples
- Energy Examples

We could use these section headers to automatically categorize the extracted examples.

### 4. Implementation Approach

```typescript
// In fileScanner.ts, add special handling:
if (filePath.includes('AxonUsage.html')) {
  // Extract section headers
  const sections = extractSections(htmlContent);
  
  // Extract examples with their outputs
  const examples = extractAxonUsageExamples(htmlContent);
  
  // Tag examples with their section
  examples.forEach(example => {
    example.tags.push('axon-usage-guide');
    example.tags.push(example.section.toLowerCase());
    if (example.hasOutput) {
      example.tags.push('has-example-output');
    }
  });
}
```

### 5. Search Enhancement

Add a new search filter for reference examples:
```json
{
  "tool": "searchAxonExamples",
  "arguments": {
    "tags": ["axon-usage-guide"],
    "keyword": ">=",
    "limit": 10
  }
}
```

## Benefits

1. **Better Learning Resources**: Developers can find canonical examples from the official usage guide
2. **Operator Examples**: Rich source of operator usage in context
3. **Expected Output**: Examples include their expected results, making them more valuable
4. **Categorized Examples**: Section-based categorization helps find relevant examples

## Future Enhancements

1. **Interactive Examples**: Link back to the specific section in the HTML documentation
2. **Example Testing**: Validate that examples still produce their documented output
3. **Cross-Reference**: Link usage examples to their corresponding function documentation
4. **Pattern Extraction**: Extract common patterns from the usage guide for the pattern library