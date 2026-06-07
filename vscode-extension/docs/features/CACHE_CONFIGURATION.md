# Cache Configuration Guide

## Overview

The Axon VSCode extension includes a sophisticated 3-layer caching system that dramatically improves performance. All cache settings are fully configurable through VSCode settings, allowing you to tune the cache behavior to your needs.

---

## Quick Start

### Default Configuration (Recommended)

The extension comes with sensible defaults that work well for most users:

- ✅ All caching enabled
- 📦 Semantic Cache: 100 entries, 7-day TTL
- 📦 Context Cache: 50 entries, 1-hour TTL
- 📦 MCP Query Cache: 200 entries, 24-hour TTL

**No configuration needed!** The caching system works out of the box.

---

## Configuration Settings

### Master Cache Control

#### `axon.cache.enabled`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Master switch for the entire caching system

```json
{
  "axon.cache.enabled": true
}
```

**When to disable**: Rarely needed, but useful for debugging or if you want completely fresh results every time.

---

### Semantic Cache (AI Responses)

The semantic cache stores AI-generated code to avoid expensive API calls.

#### `axon.cache.semantic.enabled`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Enable caching of AI-generated responses

```json
{
  "axon.cache.semantic.enabled": true
}
```

#### `axon.cache.semantic.maxSize`
- **Type**: `number`
- **Default**: `100`
- **Range**: `10` - `500`
- **Description**: Maximum number of cached AI responses

```json
{
  "axon.cache.semantic.maxSize": 100
}
```

**Tuning guide**:
- **Low usage** (< 10 generations/day): `50`
- **Medium usage** (10-50 generations/day): `100` (default)
- **High usage** (> 50 generations/day): `200-300`

#### `axon.cache.semantic.ttl`
- **Type**: `number` (seconds)
- **Default**: `604800` (7 days)
- **Range**: `3600` (1 hour) - `2592000` (30 days)
- **Description**: How long to keep cached responses

```json
{
  "axon.cache.semantic.ttl": 604800
}
```

**Tuning guide**:
- **Frequently changing code**: `86400` (1 day)
- **Stable project**: `604800` (7 days, default)
- **Long-term caching**: `1209600` (14 days)

**Cost savings**: ~$0.03 per cache hit

---

### Context Cache (Gathered Contexts)

The context cache stores gathered contexts (examples, docs, schema) with automatic file change detection.

#### `axon.cache.context.enabled`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Enable caching of gathered contexts

```json
{
  "axon.cache.context.enabled": true
}
```

#### `axon.cache.context.maxSize`
- **Type**: `number`
- **Default**: `50`
- **Range**: `5` - `200`
- **Description**: Maximum number of cached contexts

```json
{
  "axon.cache.context.maxSize": 50
}
```

**Tuning guide**:
- **Small projects** (1-5 files): `20-30`
- **Medium projects** (5-20 files): `50` (default)
- **Large projects** (> 20 files): `100-150`

#### `axon.cache.context.ttl`
- **Type**: `number` (seconds)
- **Default**: `3600` (1 hour)
- **Range**: `300` (5 min) - `86400` (24 hours)
- **Description**: How long to keep cached contexts

```json
{
  "axon.cache.context.ttl": 3600
}
```

**Tuning guide**:
- **Rapidly changing files**: `600` (10 minutes)
- **Normal development**: `3600` (1 hour, default)
- **Stable files**: `7200` (2 hours)

**Note**: Cache is automatically invalidated when files change!

---

### MCP Query Cache (Examples & Docs)

The MCP query cache stores results from MCP server queries (code examples, documentation, schemas).

#### `axon.cache.mcpQuery.enabled`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Enable caching of MCP query results

```json
{
  "axon.cache.mcpQuery.enabled": true
}
```

#### `axon.cache.mcpQuery.maxSize`
- **Type**: `number`
- **Default**: `200`
- **Range**: `20` - `1000`
- **Description**: Maximum number of cached MCP queries

```json
{
  "axon.cache.mcpQuery.maxSize": 200
}
```

**Tuning guide**:
- **Small example library**: `100`
- **Medium example library**: `200` (default)
- **Large example library**: `500-1000`

#### `axon.cache.mcpQuery.ttl`
- **Type**: `number` (seconds)
- **Default**: `86400` (24 hours)
- **Range**: `3600` (1 hour) - `604800` (7 days)
- **Description**: How long to keep cached MCP results

```json
{
  "axon.cache.mcpQuery.ttl": 86400
}
```

**Tuning guide**:
- **Frequently updated examples**: `3600` (1 hour)
- **Stable examples**: `86400` (24 hours, default)
- **Static documentation**: `604800` (7 days)

---

## Configuration Examples

### Example 1: Minimal Memory Usage

For environments with limited memory:

```json
{
  "axon.cache.enabled": true,
  "axon.cache.semantic.maxSize": 20,
  "axon.cache.context.maxSize": 10,
  "axon.cache.mcpQuery.maxSize": 50
}
```

**Memory estimate**: ~300-500 KB

---

### Example 2: Maximum Performance

For power users who want maximum caching:

```json
{
  "axon.cache.enabled": true,
  "axon.cache.semantic.maxSize": 300,
  "axon.cache.semantic.ttl": 1209600,
  "axon.cache.context.maxSize": 150,
  "axon.cache.context.ttl": 7200,
  "axon.cache.mcpQuery.maxSize": 500,
  "axon.cache.mcpQuery.ttl": 604800
}
```

**Memory estimate**: ~5-10 MB  
**Benefits**: Higher hit rates, longer retention

---

### Example 3: Disable Specific Cache

If you want to disable just the semantic cache (always get fresh AI responses):

```json
{
  "axon.cache.enabled": true,
  "axon.cache.semantic.enabled": false,
  "axon.cache.context.enabled": true,
  "axon.cache.mcpQuery.enabled": true
}
```

---

### Example 4: Aggressive Caching (Large Team)

For teams working on stable codebases:

```json
{
  "axon.cache.enabled": true,
  "axon.cache.semantic.maxSize": 500,
  "axon.cache.semantic.ttl": 2592000,
  "axon.cache.context.maxSize": 200,
  "axon.cache.context.ttl": 86400,
  "axon.cache.mcpQuery.maxSize": 1000,
  "axon.cache.mcpQuery.ttl": 604800
}
```

**Memory estimate**: ~10-20 MB  
**Benefits**: Maximum cache hits, minimal API calls

---

### Example 5: Debug Mode (No Caching)

For debugging or ensuring fresh results every time:

```json
{
  "axon.cache.enabled": false
}
```

**Note**: All caches disabled, every request is fresh.

---

## How to Configure

### Method 1: VSCode Settings UI

1. Open Settings: `Cmd+,` (Mac) or `Ctrl+,` (Windows/Linux)
2. Search for "Axon Cache"
3. Adjust settings using the UI

### Method 2: settings.json

1. Open Command Palette: `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
2. Type "Preferences: Open Settings (JSON)"
3. Add configuration:

```json
{
  "axon.cache.enabled": true,
  "axon.cache.semantic.maxSize": 100,
  "axon.cache.semantic.ttl": 604800,
  "axon.cache.context.maxSize": 50,
  "axon.cache.context.ttl": 3600,
  "axon.cache.mcpQuery.maxSize": 200,
  "axon.cache.mcpQuery.ttl": 86400
}
```

### Method 3: Workspace Settings

For project-specific settings, create `.vscode/settings.json` in your project:

```json
{
  "axon.cache.semantic.maxSize": 200,
  "axon.cache.context.maxSize": 100
}
```

---

## Cache Management Commands

### View Cache Statistics

See how your caches are performing:

1. Open Command Palette: `Cmd+Shift+P` / `Ctrl+Shift+P`
2. Type "Axon: View Cache Statistics"
3. View detailed statistics in output panel

**Statistics shown**:
- Hits, misses, hit rate
- Cache size and memory usage
- Cost and time savings (semantic cache)
- File invalidations (context cache)

### Clear All Caches

Clear all cached data:

1. Open Command Palette: `Cmd+Shift+P` / `Ctrl+Shift+P`
2. Type "Axon: Clear All Caches"
3. Confirm the action

**When to use**:
- After updating configuration
- If cache seems stale
- Before important benchmarks

---

## Understanding Cache Behavior

### Semantic Cache

**What triggers a cache hit**:
- Same instruction text
- Same selected code
- Same file name and language

**What triggers a cache miss**:
- Different instruction (even slightly)
- Different selected code
- Different file
- Entry expired (TTL)

**Example**:
```
Request 1: "Generate a function to read points"
Request 2: "Generate a function to read points"  ← CACHE HIT!
Request 3: "Generate a function to write points" ← CACHE MISS
```

---

### Context Cache

**What triggers a cache hit**:
- Same instruction
- Same file (unchanged)
- Within TTL

**What triggers a cache miss or invalidation**:
- File content changed (automatic)
- Different instruction
- Different file
- Entry expired (TTL)

**Example**:
```
Request 1: Generate function in file.axon
           → Cache context
Request 2: Generate different function in same file
           → CACHE HIT! (file unchanged)
User edits file.axon
           → Cache INVALIDATED (automatic)
Request 3: Generate function in file.axon
           → CACHE MISS (need fresh context)
```

---

### MCP Query Cache

**What triggers a cache hit**:
- Same query string
- Same parameters (limit, filters, etc.)
- Within TTL

**What triggers a cache miss**:
- Different query
- Different parameters
- Entry expired (TTL)

**Example**:
```
Query 1: search_axon_examples("points", limit=5)
         → Query MCP server, cache result
Query 2: search_axon_examples("points", limit=5)
         → CACHE HIT! (same query)
Query 3: search_axon_examples("points", limit=10)
         → CACHE MISS (different limit)
```

---

## Performance Tuning Tips

### For Maximum Speed

1. **Increase cache sizes**: More entries = higher hit rate
2. **Increase TTLs**: Longer retention = more hits
3. **Monitor statistics**: Use `View Cache Statistics` to see hit rates

```json
{
  "axon.cache.semantic.maxSize": 300,
  "axon.cache.context.maxSize": 150,
  "axon.cache.mcpQuery.maxSize": 500
}
```

### For Minimum Memory

1. **Decrease cache sizes**: Fewer entries = less memory
2. **Decrease TTLs**: Shorter retention = faster cleanup

```json
{
  "axon.cache.semantic.maxSize": 20,
  "axon.cache.context.maxSize": 10,
  "axon.cache.mcpQuery.maxSize": 50
}
```

### For Fresh Results

1. **Decrease TTLs**: More frequent expiration
2. **Disable semantic cache**: Always fresh AI responses

```json
{
  "axon.cache.semantic.enabled": false,
  "axon.cache.context.ttl": 600,
  "axon.cache.mcpQuery.ttl": 3600
}
```

### For Cost Savings

1. **Maximize semantic cache**: Most cost impact
2. **Increase TTL**: Keep entries longer

```json
{
  "axon.cache.semantic.maxSize": 500,
  "axon.cache.semantic.ttl": 2592000
}
```

---

## Troubleshooting

### Cache Not Working

**Check**:
1. Is `axon.cache.enabled` set to `true`?
2. Are individual caches enabled?
3. Check logs: View → Output → Axon

**Solution**: Verify configuration and restart extension.

### Cache Hit Rate Low

**Possible causes**:
1. Highly varied requests (expected)
2. Cache size too small
3. TTL too short

**Solution**: Increase `maxSize` and `ttl` values.

### Too Much Memory Usage

**Possible causes**:
1. Cache sizes too large
2. Large cached entries

**Solution**: Decrease `maxSize` values or clear caches.

### Stale Results

**Possible causes**:
1. TTL too long
2. File change detection not working

**Solution**: Decrease TTL or use "Clear All Caches" command.

---

## Advanced Configuration

### Per-Project Settings

Different projects may need different cache settings. Use workspace settings:

**Project A** (stable, large):
```json
{
  "axon.cache.semantic.maxSize": 300,
  "axon.cache.context.maxSize": 150
}
```

**Project B** (experimental, changing):
```json
{
  "axon.cache.semantic.ttl": 86400,
  "axon.cache.context.ttl": 600
}
```

### Environment-Specific

Use different settings for different environments:

**Development**:
```json
{
  "axon.cache.semantic.ttl": 86400,
  "axon.cache.context.ttl": 600
}
```

**Production/Stable**:
```json
{
  "axon.cache.semantic.ttl": 2592000,
  "axon.cache.context.ttl": 7200
}
```

---

## FAQs

**Q: Will cached results become stale?**  
A: Context cache automatically invalidates when files change. Other caches expire based on TTL.

**Q: How much memory does caching use?**  
A: Typically 1-4MB with defaults, up to 20MB with maximum settings.

**Q: Can I disable caching completely?**  
A: Yes, set `axon.cache.enabled` to `false`.

**Q: Do cache settings require restart?**  
A: No, settings take effect immediately for new operations.

**Q: Can I see cache statistics?**  
A: Yes, use the "Axon: View Cache Statistics" command.

**Q: What happens if I clear caches?**  
A: All cached data is deleted, but it will rebuild naturally as you use the extension.

---

## Best Practices

1. **Start with defaults**: They work well for most users
2. **Monitor statistics**: Use `View Cache Statistics` to understand performance
3. **Tune gradually**: Make small adjustments based on hit rates
4. **Clear when needed**: Use `Clear All Caches` after major changes
5. **Project-specific**: Use workspace settings for different projects
6. **Balance memory vs speed**: Find the right balance for your system

---

## Summary

The Axon caching system is designed to be:
- ✅ **Automatic**: Works out of the box
- ✅ **Intelligent**: File change detection, LRU eviction
- ✅ **Tunable**: Full control via VSCode settings
- ✅ **Transparent**: No impact on functionality
- ✅ **Observable**: Statistics and commands

**Default configuration is recommended** for most users. Advanced users can tune settings based on their specific needs and usage patterns.

---

**Need help?** Check the logs or create an issue with your cache statistics!
