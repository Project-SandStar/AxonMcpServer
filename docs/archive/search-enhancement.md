# Enhanced searchExamples with Template Suggestions

## Overview
The `searchAxonExamples` tool has been enhanced to include template suggestions alongside function search results. When users search for Axon code examples, they will now also see relevant templates that can be used to generate similar code.

## Implementation Details

### Changes Made
1. Modified `searchExamples` method in `src/index.ts` to:
   - Check if templates are loaded when a keyword is provided
   - Use `templateLoader.findTemplatesByIntent()` to find matching templates
   - Include up to 3 most relevant templates in the response
   - Add helpful hints about how to use the templates

### Response Structure
The enhanced response now includes:
```json
{
  "count": <number of functions found>,
  "functions": [
    // ... existing function results
  ],
  "templateSuggestions": [  // New field - only included if templates match
    {
      "id": "template-id",
      "name": "Template Name",
      "category": "category",
      "description": "Template description",
      "hint": "Use generateAxonCode with templateId: 'template-id' to generate this code"
    }
    // ... up to 3 templates
  ]
}
```

### Benefits
1. **Discoverability**: Users can discover relevant code templates while searching
2. **Guidance**: Clear hints on how to use the templates
3. **Context**: Templates appear only when relevant to the search
4. **Non-intrusive**: Templates don't appear if no keyword is provided

## Example Usage

When a user searches for "energy":
```
searchAxonExamples({ keyword: "energy" })
```

They might see:
- Functions related to energy calculations
- Template suggestion: "Meter Energy Consumption" template that can generate energy consumption queries

## Testing
A test script (`test-template-search.ts`) verifies:
- Templates are properly loaded
- Intent-based search matches relevant templates
- Response structure includes template suggestions
- Hints are formatted correctly

## Future Enhancements
1. Could rank templates by relevance score
2. Could allow configuration of max template suggestions
3. Could include template preview in response
4. Could match templates by category/tags in addition to intent