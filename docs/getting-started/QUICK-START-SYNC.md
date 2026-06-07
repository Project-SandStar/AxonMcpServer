# Quick Start: Auto-Sync Functions

Enable automatic syncing of SkySpark functions when the MCP server starts.

## 1. Enable Auto-Sync

Add this to your `.env` file:

```bash
# Enable automatic function sync on server start
SKYSPARK_AUTO_SYNC_FUNCTIONS=true

# Optional: Enable project auto-discovery
SKYSPARK_AUTO_DISCOVER=true
```

## 2. Start the Server

```bash
npm start
```

The server will automatically:
- ✅ Create `proj/` folder if it doesn't exist
- ✅ Sync all functions from configured SkySpark projects
- ✅ Download both `.axon` (source) and `.trio` (metadata) files
- ✅ Only download new/changed functions on subsequent starts

## 3. Verify

Check that files were synced:

```bash
ls -la proj/local/mobilytik/func/
```

You should see:
```
myFunction.axon       # Axon source code
myFunction.trio       # Function metadata
anotherFunction.axon
anotherFunction.trio
...
```

## 4. Manual Sync (Optional)

To manually sync outside of server startup:

```bash
# Normal sync (smart - only changed functions)
npm run sync local mobilytik

# Force sync (re-download everything)
npm run sync local mobilytik -- --force

# List synced projects
npm run sync -- --list

# Show sync stats
npm run sync local mobilytik -- --stats
```

## What Gets Synced?

For each function:
- **`.axon` file**: Pure Axon source code
- **`.trio` file**: Haystack metadata (tags, documentation, etc.)

## File Structure

```
proj/
└── local/
    └── mobilytik/
        ├── func/
        │   ├── myFunc.axon
        │   ├── myFunc.trio
        │   └── ...
        └── .sync-metadata.json
```

## Configuration Options

```bash
# Parallel downloads (default: 10)
SKYSPARK_SYNC_CONCURRENCY=20

# Enable function versioning (backup old versions)
SKYSPARK_FUNCTION_VERSIONING=true
SKYSPARK_MAX_VERSIONS=4

# Enhanced metadata parsing (default: true)
SKYSPARK_ENHANCED_PARSING=true
```

## Troubleshooting

### Functions not syncing?

1. Check environment variables:
   ```bash
   echo $SKYSPARK_AUTO_SYNC_FUNCTIONS
   ```

2. Check SkySpark connection:
   ```bash
   curl http://localhost:8080/api/mobilytik/about
   ```

3. Force sync:
   ```bash
   npm run sync local mobilytik -- --force
   ```

### Need help?

See the full documentation: [FUNCTION-SYNC-GUIDE.md](./docs/FUNCTION-SYNC-GUIDE.md)

---

**That's it! Your functions will now sync automatically. 🚀**
