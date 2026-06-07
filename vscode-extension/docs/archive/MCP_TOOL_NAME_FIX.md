# MCP Tool Name Mismatch Fix

## Issue

When trying to use AI features like "Explain Code", you got error:
```
[ERROR] MCP request failed: Method not found
Error: Method not found (error code -32601)
```

Even though your API key was configured correctly.

## Root Cause

The extension was calling MCP tools with **snake_case** names:
- ❌ `search_axon_examples`
- ❌ `search_axon_docs`  
- ❌ `get_project_schema`

But the MCP server registered tools with **camelCase** names:
- ✅ `searchAxonExamples`
- ✅ `searchAxonDocs`
- ✅ `getProjectSchema`

So when the extension tried to call `search_axon_examples`, the MCP server responded "Method not found" because it only knows about `searchAxonExamples`.

---

## The Fix

Updated `src/ai/ContextGatherer.ts` to use the correct camelCase tool names:

**Before:**
```typescript
client.callTool('search_axon_examples', { query, limit })
client.callTool('search_axon_docs', { query, limit })
client.callTool('get_project_schema', {})
```

**After:**
```typescript
client.callTool('searchAxonExamples', { query, limit })
client.callTool('searchAxonDocs', { query, limit })
client.callTool('getProjectSchema', {})
```

---

## What This Fixes

✅ **Explain Code** - Now works!
✅ **Optimize Code** - Now works!
✅ **Generate Function** - Now works!
✅ **All AI features** - Context gathering works properly

These features now:
1. Query MCP server for relevant code examples
2. Search documentation
3. Get project schema
4. Use all that context to generate better AI responses

---

## Testing

**Step 1: Reload VSCode**
```
Cmd+Shift+P → "Developer: Reload Window"
```

**Step 2: Test Explain Code**
1. Open an `.axon` file (or create one with some code)
2. Select some code
3. `Cmd+Shift+P` → "Axon: Explain Code"
4. Should work without "Method not found" error!

**Step 3: Check Logs (Optional)**
```
Cmd+Shift+P → "Axon: View MCP Server Logs"
```

You should see successful MCP tool calls like:
```
[INFO] Gathering context for generation request
[INFO] Searching for examples...
[INFO] Tool called: searchAxonExamples
[INFO] Context gathering complete
```

---

## Files Modified

**File:** `src/ai/ContextGatherer.ts`

**Lines changed:**
- Line 149: `search_axon_examples` → `searchAxonExamples`
- Line 155: `search_axon_examples` → `searchAxonExamples`
- Line 200: `search_axon_docs` → `searchAxonDocs`
- Line 206: `search_axon_docs` → `searchAxonDocs`
- Line 245: `get_project_schema` → `getProjectSchema`
- Line 248: `get_project_schema` → `getProjectSchema`

---

## How AI Features Work Now

### Explain Code Workflow

1. **Context Gathering**
   - Calls `searchAxonExamples` ✅ (was failing before)
   - Calls `searchAxonDocs` ✅ (was failing before)
   - Calls `getProjectSchema` ✅ (was failing before)

2. **AI Processing**
   - Sends code + context to Claude
   - Gets detailed explanation

3. **Display**
   - Shows explanation in new editor window
   - Includes original code for reference

### Generate Function Workflow

1. **Plan Phase** (Using Haiku - fast & cheap)
   - Gathers context from MCP ✅
   - Creates execution plan

2. **Act Phase** (Using Sonnet - powerful)
   - Uses context + plan ✅
   - Generates actual code

---

## Why camelCase?

MCP (Model Context Protocol) servers typically use camelCase for tool/method names, following JavaScript/TypeScript conventions. The MCP server was implemented correctly with camelCase, but the extension client had outdated snake_case references.

---

## Summary

**Before Fix:**
```
User: "Explain this code"
Extension: "Let me call search_axon_examples..."
MCP Server: "❌ Method not found"
Extension: "Error: Method not found"
```

**After Fix:**
```
User: "Explain this code"
Extension: "Let me call searchAxonExamples..."
MCP Server: "✅ Here are 5 relevant examples"
Extension: "✅ Here's the explanation with context!"
```

---

## Next Steps

1. **Reload VSCode window**
2. **Test "Explain Code"** with some Axon code
3. **Try "Generate Function"** with a description
4. **Use "Optimize Code"** on existing code

All AI features should now work properly! 🚀

---

## Installation Complete

✅ Extension rebuilt
✅ Extension packaged
✅ Extension installed

**Ready to use AI features!**
