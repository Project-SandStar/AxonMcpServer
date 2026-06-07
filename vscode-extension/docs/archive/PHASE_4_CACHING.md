# Phase 4: Caching & Performance Optimization - Architecture

## Overview

Phase 4 implements intelligent caching to improve performance and reduce costs. The caching system uses multiple cache layers with different strategies and TTLs.

## Goals

1. **Reduce API Costs**: Cache AI responses to avoid redundant expensive calls
2. **Improve Speed**: Serve cached results instantly (< 100ms vs 3-10s)
3. **Optimize Context**: Cache MCP queries and context gathering
4. **Monitor Performance**: Track metrics for continuous optimization
5. **Maintain Quality**: Ensure cache doesn't compromise code quality

## Cache Architecture

### Multi-Layer Caching Strategy

```
Request
    ↓
┌─────────────────────────────────────┐
│  Layer 1: Semantic Cache             │ ← AI Responses
│  - Hash-based similarity             │
│  - LRU eviction                      │
│  - TTL: 7 days                       │
└─────────────────────────────────────┘
    ↓ (cache miss)
┌─────────────────────────────────────┐
│  Layer 2: Context Cache              │ ← Gathered Context
│  - Request fingerprint               │
│  - File change detection             │
│  - TTL: 1 hour                       │
└─────────────────────────────────────┘
    ↓ (cache miss)
┌─────────────────────────────────────┐
│  Layer 3: MCP Query Cache            │ ← Examples & Docs
│  - Query string + params             │
│  - Simple key-value                  │
│  - TTL: 24 hours                     │
└─────────────────────────────────────┘
    ↓ (cache miss)
Generate Fresh Result
```

## Cache Types

### 1. Semantic Cache (AI Responses)

**Purpose**: Cache AI-generated code and explanations

**Strategy**: Simplified hash-based similarity
- Hash request content (instruction + context)
- Exact match for cache hits
- LRU eviction when full

**Storage**:
- In-memory Map for active session
- VSCode global state for persistence
- Max size: 100 entries
- Max memory: ~10 MB

**Cache Key**:
```typescript
{
  type: 'function' | 'explain' | 'optimize',
  instructionHash: string,    // MD5 of instruction
  contextHash: string,         // MD5 of selected code
  model: string                // e.g., 'claude-sonnet-4'
}
```

**TTL**: 7 days

**Eviction**: LRU when cache is full

**Benefits**:
- 100% cost savings on cache hits
- Instant response (< 100ms)
- Useful for repeated similar requests

### 2. Context Cache

**Purpose**: Cache gathered context (examples, docs, schema)

**Strategy**: Fingerprint-based caching
- Hash request params + file state
- Invalidate on file changes
- Short TTL due to dynamic nature

**Storage**:
- In-memory Map
- Not persisted (regenerated each session)
- Max size: 50 entries
- Max memory: ~5 MB

**Cache Key**:
```typescript
{
  instruction: string,
  fileName: string,
  fileHash: string,           // MD5 of file content
  timestamp: number
}
```

**TTL**: 1 hour

**Benefits**:
- Avoid redundant MCP queries
- Faster context gathering (500ms → 50ms)
- Reduced MCP server load

### 3. MCP Query Cache

**Purpose**: Cache MCP server query results

**Strategy**: Simple query-based caching
- Cache by query string + params
- Long TTL (examples don't change often)
- Separate caches for examples vs docs

**Storage**:
- In-memory Map
- Persistent to disk (global state)
- Max size: 200 entries per type
- Max memory: ~20 MB total

**Cache Key**:
```typescript
{
  toolName: 'search_axon_examples' | 'search_axon_docs',
  query: string,
  limit: number
}
```

**TTL**: 24 hours

**Benefits**:
- Faster example/doc retrieval
- Reduced MCP server queries
- Better offline experience

## Performance Monitoring

### Metrics Tracked

```typescript
interface PerformanceMetrics {
  // Cache metrics
  cacheHitRate: {
    semantic: number,      // % hits
    context: number,
    mcpQuery: number,
    overall: number
  },
  
  // Timing metrics
  avgGenerationTime: {
    cached: number,        // ms
    uncached: number,
    improvement: number    // %
  },
  
  // Cost metrics
  totalRequests: number,
  cachedRequests: number,
  costSaved: number,       // USD
  
  // Token metrics
  tokensSaved: number,
  tokensUsed: number,
  
  // Cache usage
  cacheSize: {
    semantic: number,      // entries
    context: number,
    mcpQuery: number
  },
  
  memoryUsage: number      // MB
}
```

### Monitoring Commands

1. **View Cache Stats**: Display current metrics
2. **Clear Cache**: Clear specific or all caches
3. **Export Metrics**: Save metrics to file for analysis

## Implementation Components

### 1. SemanticCache

**File**: `src/cache/SemanticCache.ts`

**Key Methods**:
```typescript
class SemanticCache {
  get(request: GenerationRequest): GenerationResult | null
  set(request: GenerationRequest, result: GenerationResult): void
  has(request: GenerationRequest): boolean
  clear(): void
  getStats(): CacheStats
  evictLRU(): void
}
```

**Features**:
- Hash-based key generation
- LRU eviction
- Persistent storage
- Memory management

### 2. ContextCache

**File**: `src/cache/ContextCache.ts`

**Key Methods**:
```typescript
class ContextCache {
  get(request: GenerationRequest): GatheredContext | null
  set(request: GenerationRequest, context: GatheredContext): void
  invalidateFile(filePath: string): void
  clear(): void
}
```

**Features**:
- File change detection
- Automatic invalidation
- Memory-only storage
- TTL enforcement

### 3. McpQueryCache

**File**: `src/cache/McpQueryCache.ts`

**Key Methods**:
```typescript
class McpQueryCache {
  get(toolName: string, params: any): any | null
  set(toolName: string, params: any, result: any): void
  clear(toolName?: string): void
  getStats(): CacheStats
}
```

**Features**:
- Tool-specific caching
- Persistent storage
- Configurable TTL
- Memory limits

### 4. PerformanceMonitor

**File**: `src/utils/PerformanceMonitor.ts`

**Key Methods**:
```typescript
class PerformanceMonitor {
  recordCacheHit(cacheType: string): void
  recordCacheMiss(cacheType: string): void
  recordGeneration(cached: boolean, duration: number, tokens: number, cost: number): void
  getMetrics(): PerformanceMetrics
  exportMetrics(path: string): void
  reset(): void
}
```

## Cache Invalidation Strategies

### 1. TTL-Based (Time)
- Semantic Cache: 7 days
- Context Cache: 1 hour
- MCP Query Cache: 24 hours

### 2. Event-Based
- File change → Invalidate context cache
- Extension reload → Clear memory caches
- MCP restart → Clear MCP query cache

### 3. Manual
- User command → Clear specific/all caches
- Config change → Clear affected caches

### 4. Size-Based
- LRU eviction when max size reached
- Memory pressure → Aggressive eviction

## Configuration

### Settings (package.json)

```json
{
  "axon.cache.enabled": true,
  "axon.cache.semantic.enabled": true,
  "axon.cache.semantic.maxSize": 100,
  "axon.cache.semantic.ttl": 604800,        // 7 days in seconds
  "axon.cache.context.enabled": true,
  "axon.cache.context.maxSize": 50,
  "axon.cache.context.ttl": 3600,           // 1 hour
  "axon.cache.mcpQuery.enabled": true,
  "axon.cache.mcpQuery.maxSize": 200,
  "axon.cache.mcpQuery.ttl": 86400,         // 24 hours
  "axon.performance.monitoring": true
}
```

## Expected Performance Improvements

### Baseline (No Caching - Phase 3)
- Generation time: 4-10 seconds
- Cost per request: $0.01-0.05
- Context gathering: 500-1000ms

### With Caching (Phase 4 - Estimated)
- Cache hit rate: 20-40% (depends on usage patterns)
- Cached generation: < 100ms (40-100x faster)
- Cost reduction: 20-40% overall
- Context gathering: 50-100ms (5-10x faster on hits)

### Example Savings
**100 requests with 30% cache hit rate:**
- Cached: 30 requests × 0ms generation = $0 saved
- Uncached: 70 requests × $0.03 = $2.10
- Total saved: $0.90 (30% reduction)
- Time saved: 30 × 5s = 150 seconds (2.5 minutes)

## Cache Warmup Strategy

### On Extension Activation
1. Load common Axon patterns (background)
2. Pre-cache frequent documentation (async)
3. Warm MCP query cache with popular examples

### Warmup Content
- Top 10 most common Axon functions
- Standard query patterns
- Error handling examples
- Common operators documentation

### Implementation
- Non-blocking background process
- Low priority to avoid startup delay
- Configurable enable/disable

## Storage Strategy

### In-Memory (Fast Access)
- Active session cache
- Context cache
- Performance metrics

### Persistent (VSCode Global State)
- Semantic cache
- MCP query cache
- Performance history

### Advantages
- Fast access for hot data
- Survives VSCode reload for cold data
- Automatic cleanup on uninstall

## Testing Strategy

### Performance Tests
1. **Cache Hit Rate**: Measure across cache types
2. **Speed Improvement**: Compare cached vs uncached
3. **Memory Usage**: Ensure limits respected
4. **Eviction**: Validate LRU works correctly

### Integration Tests
1. End-to-end with caching enabled
2. Cache invalidation scenarios
3. Config changes
4. Storage persistence

### Benchmark Tests
1. 100 requests with varying similarity
2. Measure hit rates at 10/25/50/100 requests
3. Compare costs and timings
4. Memory profiling

## Security & Privacy

### Cached Data
- Only user's own code cached
- API keys never cached
- Cache stored locally only
- Cleared on extension uninstall

### Sensitive Data
- No logging of cached content
- Hash keys only (no raw content in logs)
- Respect VSCode privacy settings

## Future Enhancements (Phase 5+)

1. **Embedding-based Semantic Search**
   - Use vector embeddings for similarity
   - Find similar (not just exact) requests
   - Higher cache hit rates

2. **Distributed Cache**
   - Share cache across team
   - Optional cloud sync
   - Privacy-preserving

3. **Predictive Caching**
   - Predict next user action
   - Pre-fetch likely contexts
   - Background warming

4. **Smart Eviction**
   - Usage patterns
   - User-specific priorities
   - Time-of-day patterns

## Success Metrics

### Target Goals
- Cache hit rate: > 25%
- Speed improvement: > 30x on cache hits
- Cost reduction: > 20% overall
- Memory usage: < 50 MB
- User satisfaction: Faster perceived performance

---

**Phase 4 Status**: Architecture Designed ✅  
**Next**: Implementation of cache components
