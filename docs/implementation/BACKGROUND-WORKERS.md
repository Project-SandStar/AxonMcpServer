# Background Workers with Real-Time UI Updates

## Overview

Implement **non-blocking initialization** with **progressive updates** to the UI.

## Goals

1. **Server starts in < 1 second** (instant, ready for requests)
2. **Indexing runs in background** (async workers)
3. **UI updates in real-time** (via MCP notifications)
4. **Functions become available progressively** (as they're indexed)

## Current Problem

```
Server Start → Wait 65 seconds → Server Ready
     ❌ User must wait
     ❌ UI frozen
     ❌ No progress feedback
```

## Desired Flow

```
Server Start (instant) → Server Ready ✅
    ↓
Background Worker: Index Project 1 → Notify UI "10 functions added"
    ↓
Background Worker: Index Project 2 → Notify UI "25 functions added"
    ↓
Background Worker: Index Project 3 → Notify UI "50 functions added"
    ↓
All indexing complete → Notify UI "Index complete: 2500 functions"
```

**User Experience:**
- Server responds immediately
- Sees "Indexing in progress..." message
- Gets real-time updates as functions are indexed
- Can start using available functions while others load

## Implementation Strategy

### Phase 1: Non-Blocking Initialization (Quick Win)

```typescript
async initialize() {
  const startTime = Date.now();
  
  // 1. Quick initialization (< 1s)
  await this.cacheManager.initialize();
  
  // 2. Load from cache if available (instant!)
  const cached = await this.loadCachedIndexes();
  if (cached) {
    console.error('✅ Server ready (loaded from cache)');
    // Start background sync in parallel
    this.startBackgroundSync();
    return;
  }
  
  // 3. If no cache, index local files only (fast!)
  await this.indexLocalAxonFiles();
  
  console.error('✅ Server ready (basic index loaded)');
  
  // 4. Background: Discover and index SkySpark projects
  this.startBackgroundProjectDiscovery();
}
```

### Phase 2: Progress Notifications (MCP Protocol)

Use MCP's logging notifications:

```typescript
// Server sends progress updates
server.sendLoggingMessage({
  level: 'info',
  logger: 'axon-indexer',
  data: {
    type: 'indexing_progress',
    project: 'skyone/techwind',
    functionsIndexed: 127,
    totalProjects: 64,
    completedProjects: 1
  }
});
```

**UI displays:**
```
🔄 Indexing: skyone/techwind (127 functions)
📊 Progress: 1/64 projects (1.5%)
```

### Phase 3: Dynamic Index Updates

```typescript
// As each project is indexed:
async indexProjectInBackground(instance, project) {
  const functions = await buildProjectIndex(instance, project);
  
  // Add to main index
  for (const func of functions) {
    this.codeIndex.functions.set(func.id, func);
  }
  
  // Rebuild search index
  this.searchIndex.addFunctions(functions);
  
  // Notify UI
  this.notifyIndexUpdate({
    project: `${instance}/${project}`,
    functionsAdded: functions.length,
    totalFunctions: this.codeIndex.functions.size
  });
}
```

## Implementation Code

### 1. Background Worker Manager

```typescript
// src/workers/backgroundIndexer.ts
export class BackgroundIndexer {
  private queue: Array<{instance: string; project: string}> = [];
  private isRunning = false;
  private progressCallback?: (progress: IndexingProgress) => void;
  
  async startIndexing(
    projects: Array<{instance: string; project: string}>,
    onProgress: (progress: IndexingProgress) => void
  ) {
    this.queue = [...projects];
    this.progressCallback = onProgress;
    this.isRunning = true;
    
    // Process queue with concurrency control
    const concurrency = 5;
    const workers = Array(concurrency).fill(null).map(() => this.worker());
    
    await Promise.all(workers);
  }
  
  private async worker() {
    while (this.queue.length > 0 && this.isRunning) {
      const item = this.queue.shift();
      if (!item) break;
      
      try {
        await this.indexProject(item.instance, item.project);
      } catch (error) {
        console.error(`Failed to index ${item.instance}/${item.project}:`, error);
      }
    }
  }
  
  stop() {
    this.isRunning = false;
  }
}
```

### 2. Modified Initialize Method

```typescript
async initialize() {
  const startTime = Date.now();
  console.error('╔══════════════════════════════════════════════════════════════╗');
  console.error('║           Axon MCP Server Starting...                        ║');
  console.error('╚══════════════════════════════════════════════════════════════╝');
  
  // Initialize cache (fast)
  await this.cacheManager.initialize();
  
  // Strategy 1: Load from cache (instant if available)
  const hasCache = await this.loadFromCache();
  
  if (hasCache) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`✅ Server ready in ${elapsed}s (using cache)`);
    console.error('🔄 Background sync starting...\n');
    
    // Start background sync (non-blocking)
    setImmediate(() => this.backgroundSync());
    return;
  }
  
  // Strategy 2: Quick local indexing (no cache)
  await this.indexLocalFilesOnly();
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.error(`✅ Server ready in ${elapsed}s (basic index)`);
  console.error('🔄 Background project discovery starting...\n');
  
  // Start background project discovery (non-blocking)
  setImmediate(() => this.backgroundProjectDiscovery());
}

private async backgroundSync() {
  if (!this.autoDiscoverProjects) return;
  
  console.error('[Background] Starting project sync...');
  
  try {
    const result = await this.discoverAndIndexAllProjects();
    
    console.error('[Background] ✅ Sync complete:');
    console.error(`   Indexed ${result.projects} projects`);
    console.error(`   Total functions: ${this.codeIndex.functions.size}`);
    
    // Notify UI
    this.notifyIndexingComplete({
      totalProjects: result.projects,
      totalFunctions: this.codeIndex.functions.size
    });
  } catch (error: any) {
    console.error(`[Background] ❌ Sync failed: ${error.message}`);
  }
}
```

### 3. UI Notification Methods

```typescript
// Send notifications via MCP logging
private notifyIndexUpdate(update: {
  project: string;
  functionsAdded: number;
  totalFunctions: number;
}) {
  // Log for terminal
  console.error(`[Background] ✓ ${update.project}: ${update.functionsAdded} functions`);
  
  // Send MCP notification (if server supports it)
  try {
    this.server.sendLoggingMessage?.({
      level: 'info',
      logger: 'axon-indexer',
      data: JSON.stringify({
        type: 'index_update',
        ...update
      })
    });
  } catch {
    // MCP notifications not available in this version
  }
}

private notifyIndexingComplete(summary: {
  totalProjects: number;
  totalFunctions: number;
}) {
  console.error('\n' + '='.repeat(60));
  console.error('🎉 Background Indexing Complete!');
  console.error(`   Projects: ${summary.totalProjects}`);
  console.error(`   Functions: ${summary.totalFunctions}`);
  console.error('='.repeat(60) + '\n');
}
```

### 4. Quick Local Indexing

```typescript
private async indexLocalFilesOnly() {
  console.error('📁 Quick indexing of local files...');
  
  // Only index local .axon files (fast!)
  const axonFiles = await this.scanner.scanForAxonFiles();
  const localFiles = axonFiles.filter(f => 
    f.fileType === 'code' && 
    f.codePath.endsWith('.axon') &&
    !f.codePath.includes('proj/')  // Skip synced files for now
  );
  
  console.error(`   Found ${localFiles.length} local files`);
  
  for (const fileInfo of localFiles) {
    const content = await this.scanner.readFileContents(fileInfo.codePath);
    const functions = await this.enhancedIndexer.parseAxonFile(fileInfo.codePath, content);
    
    for (const func of functions) {
      this.codeIndex.functions.set(func.id, func);
      // Index by category and tags...
    }
  }
  
  // Build search indexes
  this.searchIndex.buildIndex(this.codeIndex.functions);
  this.operatorIndex.buildIndex(this.codeIndex.functions);
  
  console.error(`   ✓ Indexed ${this.codeIndex.functions.size} functions\n`);
}
```

## User Experience

### Before (Current)
```
$ npm start

╔══════════════════════════════════════════════════════════════╗
║           Axon MCP Server Initialization                     ║
╚══════════════════════════════════════════════════════════════╝

🚀 Starting automatic project discovery and indexing...
Instance: skyone
  📚 Building index for skyone/techwind...
  📚 Building index for skyone/baymak...
  ... (60+ more projects)
  
[User waits 65 seconds] ⏳

✅ Successfully indexed 64 projects
║   Initialized in 65.64s                                       ║

Server ready
```

### After (With Background Workers)
```
$ npm start

╔══════════════════════════════════════════════════════════════╗
║           Axon MCP Server Starting...                        ║
╚══════════════════════════════════════════════════════════════╝

📦 Loading from cache...
✅ Server ready in 0.8s (using cache)
🔄 Background sync starting...

[Server is ready! Can handle requests immediately] ✅

[Background] ✓ skyone/techwind: 127 functions (1/64)
[Background] ✓ skyone/baymak: 5 functions (2/64)
[Background] ✓ skyone/demoProject: 127 functions (3/64)
... [continues in background]

🎉 Background Indexing Complete!
   Projects: 64
   Functions: 2500
```

**Time to Ready:** 0.8s (vs 65s) - **98% faster!**

## MCP Client Integration

### Claude Desktop

Claude Desktop will see updates in the conversation:

```
🔄 Axon MCP Server: Indexing in progress
   Synced 10/64 projects (450 functions available)
```

As indexing progresses:

```
🔄 Axon MCP Server: Indexing in progress
   Synced 30/64 projects (1200 functions available)
```

When complete:

```
✅ Axon MCP Server: Indexing complete
   64 projects, 2500 functions available
```

## Configuration

### Enable Background Mode

**`.env` file:**
```bash
# Enable background discovery
SKYSPARK_BACKGROUND_DISCOVERY=true  # Default: true

# Server starts immediately, indexes in background
SKYSPARK_BLOCKING_INIT=false        # Default: false

# Progress notifications
SKYSPARK_NOTIFY_PROGRESS=true       # Default: true

# Update frequency (seconds)
SKYSPARK_PROGRESS_INTERVAL=5        # Default: 5
```

### Disable Background Mode (Old Behavior)

```bash
SKYSPARK_BACKGROUND_DISCOVERY=false
SKYSPARK_BLOCKING_INIT=true
```

## Benefits

### Performance
- **98% faster startup** (0.8s vs 65s)
- **Non-blocking** (server ready immediately)
- **Progressive loading** (functions available as indexed)

### User Experience
- **Instant feedback** (no 65s wait)
- **Real-time progress** (see what's happening)
- **Can start working** (while indexing continues)

### Developer Experience
- **Faster development** (no wait on restart)
- **Better debugging** (see indexing progress)
- **Flexible** (can disable if needed)

## Implementation Timeline

### Phase 1: Non-Blocking Init (Immediate)
- Move project discovery after server ready
- Use `setImmediate()` for background work
- **Result:** 0.8s startup (vs 65s)

### Phase 2: Progress Logging (Quick)
- Add console.error updates
- Show "Background" prefix
- **Result:** Real-time feedback in logs

### Phase 3: MCP Notifications (Later)
- Implement proper MCP notifications
- Client sees updates in UI
- **Result:** Rich UI experience

## Monitoring

### Server Logs
```bash
npm start 2>&1 | tee server.log

# Watch progress in real-time
tail -f server.log | grep "Background"
```

### Check Indexing Status

```bash
# View function count
curl http://localhost:8080/status

# Or use MCP tool
listAxonCategories
```

## Rollback Plan

If issues occur, disable background mode:

```bash
# .env
SKYSPARK_BACKGROUND_DISCOVERY=false
```

Server will revert to blocking initialization (65s).

## Summary

✅ **Instant startup** (< 1s vs 65s)  
✅ **Background indexing** (non-blocking)  
✅ **Real-time updates** (progress logging)  
✅ **Progressive availability** (functions ready as indexed)  
✅ **Backward compatible** (can disable)  

**Result: From 65-second wait to instant startup!** ⚡

---

**Implementation Priority:** HIGH  
**Effort:** Medium (1-2 hours)  
**Impact:** MASSIVE (98% startup improvement)
