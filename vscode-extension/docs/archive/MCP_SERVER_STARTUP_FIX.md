# MCP Server Startup Timeout Fix

## Problem
The MCP server was consistently timing out after 30 seconds during VSCode extension activation, causing the error:
```
MCP server failed to become ready within 30000ms
```

## Root Cause
The MCP server had the following startup sequence:
1. **Initialize** - Load caches, scan files, build indexes (can take 30+ seconds)
2. **Connect Transport** - Set up stdio communication
3. **Signal Ready** - Server becomes responsive to ping requests

The VSCode extension was trying to ping the server during step 1, but the server couldn't respond until step 2 completed.

### Why Initialization Was So Slow
The initialization process included:
- Scanning and parsing Axon code files
- Building search indexes (token-based and FlexSearch)
- Parsing HTML documentation files
- Building operator indexes
- Building function usage indexes
- **Auto-discovering and indexing SkySpark projects** (if enabled)
- Loading project-specific caches

This could easily take 30-60+ seconds, especially on first run or with auto-discovery enabled.

## Solution
Reversed the startup order to make the server responsive immediately:

### New Startup Sequence
1. **Connect Transport FIRST** - Set up stdio communication immediately
2. **Log Ready State** - Signal that server can accept requests
3. **Initialize in Background** - Run all indexing asynchronously (non-blocking)

### Code Changes
**File:** `src/index.ts` (lines 3359-3377)

**Before:**
```typescript
async run() {
  const startTime = Date.now();
  await this.initialize();  // BLOCKING - takes 30+ seconds
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  
  const transport = new StdioServerTransport();
  await this.server.connect(transport);  // Can't ping until this completes
  
  this.displayInitializationComplete(elapsed);
}
```

**After:**
```typescript
async run() {
  const startTime = Date.now();
  
  // Connect transport FIRST so server can respond to pings immediately
  const transport = new StdioServerTransport();
  await this.server.connect(transport);
  
  // Log that server is ready to accept requests
  console.error('\n✅ MCP Server transport connected - ready to accept requests');
  console.error('   Initialization continuing in background...\n');
  
  // Now run initialization in background (non-blocking)
  this.initialize().then(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    this.displayInitializationComplete(elapsed);
  }).catch((error) => {
    console.error('\n❌ Initialization error:', error);
    console.error('   Server will continue with partial functionality\n');
  });
}
```

## Benefits
1. **Instant Readiness** - Server responds to ping within milliseconds
2. **No Timeout Errors** - Extension activation succeeds immediately
3. **Background Indexing** - All expensive operations run asynchronously
4. **Progressive Enhancement** - Server is usable immediately, becomes more capable as indexing completes
5. **Graceful Degradation** - If initialization fails, server remains functional

## User Experience
### Before
- VSCode extension would fail to activate 90% of the time
- Error: "MCP server failed to become ready within 30000ms"
- Left menu would not populate
- Had to restart VSCode multiple times to get it working

### After
- Extension activates instantly
- Left menu appears immediately (may be empty initially)
- Functions populate as indexing completes in background
- Clear console messages show progress:
  - "✅ MCP Server transport connected - ready to accept requests"
  - "Initialization continuing in background..."
  - "📚 Building indexes..." (with progress updates)
  - "✓ Axon MCP Server Ready - Initialized in X.XXs"

## Testing
To verify the fix:
1. Reload VSCode window (Cmd+Shift+P → "Reload Window")
2. Check the Output panel (View → Output → select "Axon VSCode Extension")
3. You should see:
   - "Starting MCP server..."
   - "✅ MCP Server transport connected - ready to accept requests"
   - "MCP server started successfully" (within 1-2 seconds)
   - Background indexing continues with progress updates

## Additional Optimizations Considered
The background initialization still includes auto-discovery if enabled. Future optimizations could include:
- Lazy-loading indexes on first use
- Incremental indexing with delta updates
- Streaming results as they become available
- Caching more aggressively to reduce rebuild frequency

## Version
- Fixed in: v0.1.0
- Date: 2025-01-10
- MCP Server: src/index.ts lines 3359-3377
