# Function Versioning

## Overview

The function sync system now includes automatic versioning that creates backups of functions when they are updated. This provides a safety net to restore previous versions if needed.

## Configuration

Add to your `.env.skyspark` file:

```bash
# Function Versioning
# Keep backups of previous versions when functions are updated
# Set to 'true' to enable versioning (default: false)
SKYSPARK_FUNCTION_VERSIONING=true

# Number of versions to keep per function (default: 4)
# Older versions beyond this limit will be automatically deleted
SKYSPARK_MAX_VERSIONS=4
```

## How It Works

### 1. **Automatic Backup on Update**

When a function is synced and the system detects it has changed (based on modification time):

1. The current local version is backed up to `.versions/`
2. The new version is downloaded from SkySpark
3. Old versions beyond the limit are automatically cleaned up

### 2. **Directory Structure**

```
proj/
└── <instance>/
    └── <project>/
        ├── func/
        │   ├── myFunction.axon          ← Current version
        │   ├── otherFunction.axon
        │   └── ...
        ├── .versions/                   ← Version history
        │   ├── myFunction_2025-10-01T05-26-22-878Z.axon
        │   ├── myFunction_2025-09-30T14-15-10-123Z.axon
        │   ├── myFunction_2025-09-29T08-30-45-456Z.axon
        │   └── myFunction_2025-09-28T10-20-30-789Z.axon
        └── .sync-metadata.json
```

### 3. **Filename Format**

Backup versions use the format:
```
<functionName>_<ISO8601-timestamp>.axon
```

Example: `addEnumPoints_2025-10-01T05-26-22-878Z.axon`

The timestamp format ensures:
- Chronological sorting
- No conflicts
- Easy identification of when the backup was created

## Example Usage

### Automatic Versioning (On Sync)

```bash
# Sync a project - automatically creates backups when functions change
node skyspark-sync.js pull --instance local --project mobilytik

# Output:
#   🔄 addEnumPoints.axon (modified)
#   ✅ Smart sync complete:
#      🔄 Updated: 1 changed
```

A backup is automatically created at:
```
proj/local/mobilytik/.versions/addEnumPoints_2025-10-01T05-26-22-878Z.axon
```

### Viewing Versions

Check what versions exist:

```bash
ls -la proj/local/mobilytik/.versions/
```

View a specific version:

```bash
cat proj/local/mobilytik/.versions/addEnumPoints_2025-10-01T05-26-22-878Z.axon
```

### Restoring a Previous Version

```bash
# Copy a previous version back to the current file
cp proj/local/mobilytik/.versions/addEnumPoints_2025-09-30T14-15-10-123Z.axon \
   proj/local/mobilytik/func/addEnumPoints.axon
```

## API Methods

The `FunctionSyncManagerEnhanced` class provides methods to work with versions:

```typescript
// List all versions of a function
const versions = await syncManager.listFunctionVersions(
  'local',
  'mobilytik', 
  'addEnumPoints'
);

// Returns:
// [
//   {
//     timestamp: '2025-10-01T05-26-22-878Z',
//     filePath: 'proj/local/mobilytik/.versions/addEnumPoints_2025-10-01T05-26-22-878Z.axon'
//   },
//   ...
// ]

// Get content of a specific version
const content = await syncManager.getFunctionVersion(
  'local',
  'mobilytik',
  'addEnumPoints',
  '2025-10-01T05-26-22-878Z'
);
```

## Behavior Details

### When Backups Are Created

✅ **Backup IS created when:**
- A function exists locally
- The function's modification time on the server has changed
- Versioning is enabled
- The sync detects it as an update (not a new download)

❌ **Backup is NOT created when:**
- Versioning is disabled (`SKYSPARK_FUNCTION_VERSIONING=false`)
- The function is being downloaded for the first time
- The function hasn't changed (same modification time)
- Force sync is used (treats all as new downloads)

### Automatic Cleanup

When a backup is created, the system automatically:
1. Counts existing versions for that function
2. Keeps only the N most recent (where N = `SKYSPARK_MAX_VERSIONS`)
3. Deletes older versions beyond the limit

Example with `SKYSPARK_MAX_VERSIONS=4`:
```
Before backup:
- myFunc_2025-10-01.axon
- myFunc_2025-09-30.axon  
- myFunc_2025-09-29.axon
- myFunc_2025-09-28.axon

After new backup created:
- myFunc_2025-10-02.axon  ← New backup
- myFunc_2025-10-01.axon
- myFunc_2025-09-30.axon
- myFunc_2025-09-29.axon
- myFunc_2025-09-28.axon  ✗ Deleted (oldest)
```

## Testing Versioning

1. Enable versioning in `.env.skyspark`:
   ```bash
   SKYSPARK_FUNCTION_VERSIONING=true
   SKYSPARK_MAX_VERSIONS=4
   ```

2. Make a change to a function in SkySpark

3. Sync the project:
   ```bash
   node skyspark-sync.js pull --instance local --project mobilytik
   ```

4. Check for backups:
   ```bash
   ls -la proj/local/mobilytik/.versions/
   ```

## Benefits

1. **Safety**: Recover from accidental overwrites
2. **History**: See how functions evolved over time
3. **Automatic**: No manual intervention needed
4. **Space-efficient**: Old versions are automatically cleaned up
5. **Transparent**: Doesn't affect normal sync operations

## Storage Considerations

With `SKYSPARK_MAX_VERSIONS=4` and assuming average function size of 1KB:

```
100 functions × 4 versions × 1KB = 400KB storage
```

Adjust `SKYSPARK_MAX_VERSIONS` based on your needs:
- More versions = better history, more storage
- Fewer versions = less storage, less history

## Troubleshooting

### No backups being created

Check:
1. Is `SKYSPARK_FUNCTION_VERSIONING=true` in `.env.skyspark`?
2. Are functions actually being updated (check for "modified" in sync output)?
3. Is there enough disk space?

### Too many old versions

Reduce `SKYSPARK_MAX_VERSIONS`:
```bash
SKYSPARK_MAX_VERSIONS=2  # Keep only 2 versions
```

Then run a sync to trigger cleanup.

### Manually clean all versions

```bash
rm -rf proj/<instance>/<project>/.versions/
```

Next sync will start fresh with new backups as functions change.
