# Cache Management

The Axon MCP Server uses a cache system to improve startup performance by storing indexed function data.

## Cache Location

By default, the cache is stored in the `.cache` directory in the project root. You can configure this in `axon-config.json`:

```json
{
  "cache": {
    "enabled": true,
    "maxAge": 86400000,  // 24 hours in milliseconds
    "directory": ".cache"
  }
}
```

## What's Cached

The cache stores three main components:

1. **Code Index** (`axon-index.json`)
   - Functions from `.axon` files
   - Documentation examples from HTML files
   - Categories and tags
   - Source file metadata

2. **Function Usage Index** (`function-usage-index.json`)
   - Where each function is called
   - Call patterns and contexts
   - Function dependencies

3. **Cache Metadata** (`cache-metadata.json`)
   - Version information
   - Timestamp
   - Library path for validation

## Cache Summary Display

When the server starts, it shows a detailed breakdown of cached content:

```
┌────────────────────────────────────────────────────────────┐
│ Axon Code Index Summary                                      │
├─────────────────────────────┼──────────────────────────────┤
│ Total Functions                     │ 1974                           │
│   - From .axon files                │ 1500                           │
│   - From HTML docs                  │ 474                            │
├─────────────────────────────┼──────────────────────────────┤
│ Source File Types:                  │                                │
│   - .axon                           │ 1500                           │
│   - .html                           │ 474                            │
└─────────────────────────────┴──────────────────────────────┘
```

The search index summary now clearly shows what's searchable:

```
┌────────────────────────────────────────────────────────────┐
│ Search Index Summary                                         │
├─────────────────────────────┼──────────────────────────────┤
│ Indexed Content:                    │                                │
│   - Axon code functions             │ 1500                           │
│   - Documentation examples          │ 474                            │
├─────────────────────────────┼──────────────────────────────┤
│ Search Tools Available:             │                                │
│   - searchAxonExamples              │ Code files only                │
│   - searchAxonDocs                  │ HTML docs only                 │
└─────────────────────────────┴──────────────────────────────┘
```

## Clearing the Cache

There are several ways to clear the cache:

### 1. Using NPM Scripts

```bash
# Clear cache using the cache manager
npm run cache:clear

# Force remove all cache files
npm run cache:clear:all
```

### 2. Manual Deletion

```bash
rm -rf .cache
```

### 3. Using the Clear Cache Script

```bash
node clear-cache.js [optional-config-path]
```

## When to Clear Cache

You should clear the cache when:

- You've added or modified Axon functions
- You've updated HTML documentation
- The cache seems corrupted or outdated
- You want to force a fresh index build

## Cache Invalidation

The cache is automatically invalidated when:

- The cache version changes
- The configured library path changes
- The cache age exceeds `maxAge` (default: 24 hours)
- Cache files are missing or corrupted

## Disabling Cache

To disable caching entirely, set `enabled` to `false` in your configuration:

```json
{
  "cache": {
    "enabled": false
  }
}
```