# Configuration Sync System

## Overview

The Axon VSCode Extension now features **automatic bidirectional synchronization** between VSCode settings and your configuration files (`axon-config.json` and `.env.skyspark`).

This means you can edit settings either way:
1. **Via VSCode Settings UI** → Automatically synced to files
2. **Via Config Files** → Automatically synced to VSCode

---

## Synced Configuration Files

### 1. `axon-config.json`
Location: `/Users/<user>/Code/axon-mcp-server/axon-config.json`

**Controls MCP Server Settings:**
- Code library path
- Documentation path  
- Cache settings
- Search configuration

### 2. `.env.skyspark`
Location: `/Users/<user>/Code/axon-mcp-server/.env.skyspark`

**Controls SkySpark Integration:**
- Connection settings (host, port, project)
- Auto-discovery
- Function sync settings
- Versioning configuration

---

## VSCode Settings Mapping

### MCP Server Settings

| VSCode Setting | Config File | Description |
|---------------|-------------|-------------|
| `axon.mcp.codePath` | `codePath` in axon-config.json | Path to Axon library code |
| `axon.mcp.docsPath` | `docsPath` in axon-config.json | Path to documentation |
| `axon.mcp.cache.enabled` | `cache.enabled` in axon-config.json | Enable caching |
| `axon.mcp.cache.maxAge` | `cache.maxAge` in axon-config.json | Cache TTL (ms) |
| `axon.mcp.search.maxResults` | `search.maxResults` in axon-config.json | Max search results |

### SkySpark Settings

| VSCode Setting | Environment Variable | Description |
|---------------|---------------------|-------------|
| `axon.skyspark.home` | `SKYSPARK_HOME` | Installation directory |
| `axon.skyspark.configDir` | `SKYSPARK_CONFIG_DIR` | JSON config directory |
| `axon.skyspark.host` | `SKYSPARK_HOST` | Server hostname |
| `axon.skyspark.port` | `SKYSPARK_PORT` | Server port |
| `axon.skyspark.project` | `SKYSPARK_PROJECT` | Project name |
| `axon.skyspark.username` | `SKYSPARK_USERNAME` | Username |
| `axon.skyspark.protocol` | `SKYSPARK_PROTOCOL` | http or https |
| `axon.skyspark.format` | `SKYSPARK_FORMAT` | zinc or json |
| `axon.skyspark.autoDiscover` | `SKYSPARK_AUTO_DISCOVER` | Auto-discover projects |
| `axon.skyspark.autoSyncFunctions` | `SKYSPARK_AUTO_SYNC_FUNCTIONS` | Auto-sync functions |
| `axon.skyspark.syncConcurrency` | `SKYSPARK_SYNC_CONCURRENCY` | Parallel downloads |
| `axon.skyspark.functionVersioning` | `SKYSPARK_FUNCTION_VERSIONING` | Enable versioning |
| `axon.skyspark.maxVersions` | `SKYSPARK_MAX_VERSIONS` | Versions to keep |

---

## How to Use

### Method 1: VSCode Settings UI (Recommended)

1. **Open Settings**
   ```
   Cmd+Shift+P → "Preferences: Open Settings (UI)"
   Search for "Axon"
   ```

2. **Or use Quick Config**
   ```
   Cmd+Shift+P → "Axon: Quick Configuration"
   ```

3. **Edit any setting**
   - Changes are automatically saved to config files
   - MCP server picks up changes immediately

### Method 2: Edit Config Files Directly

1. **Edit `axon-config.json`**
   ```json
   {
     "codePath": "/path/to/axon-library",
     "docsPath": "/path/to/docs"
   }
   ```

2. **Edit `.env.skyspark`**
   ```bash
   SKYSPARK_HOME=/path/to/skyspark
   SKYSPARK_PROJECT=myproject
   ```

3. **Changes are automatically detected and loaded into VSCode**

---

## Commands

| Command | Description |
|---------|-------------|
| `Axon: Quick Configuration` | Quick access to common settings |
| `Axon: Configuration Sync Status` | View sync status and file paths |
| `Axon: Sync Settings to Config Files` | Force sync VSCode → Files |
| `Axon: Load Settings from Config Files` | Force sync Files → VSCode |

---

## How It Works

### Automatic Sync

**VSCode → Files:**
- Triggered when you change any `axon.mcp.*` or `axon.skyspark.*` setting
- Updates corresponding config files immediately
- MCP server reads files on next restart

**Files → VSCode:**
- File system watcher detects changes to config files
- Loads values into VSCode settings
- Shows notification when sync completes

### File Watching

The extension watches for changes to:
- `axon-config.json`
- `.env.skyspark`

When you edit these files externally, changes are reflected in VSCode immediately.

---

## Example Workflow

### Setup MCP Server Paths

1. Open VSCode Settings (`Cmd+,`)
2. Search for "axon mcp code path"
3. Set path: `/Users/yourname/Code/axon-library`
4. File `axon-config.json` is automatically updated
5. MCP server will use this path on next start

### Configure SkySpark Connection

1. Run command: `Axon: Quick Configuration`
2. Select "SkySpark: Installation"
3. Enter path: `/Users/yourname/skyspark/skyspark-3.1.8`
4. File `.env.skyspark` is automatically updated
5. Settings are ready for use

### Sync from Files

If you edited config files manually:
1. Run command: `Axon: Configuration Sync Status`
2. Click "Sync Now" or run `Axon: Load Settings from Config Files`
3. VSCode settings are updated

---

## Configuration Examples

### Example 1: Development Setup

**axon-config.json:**
```json
{
  "codePath": "/Users/<user>/Code/axon_library_2025/axon-library",
  "docsPath": "/Users/<user>/Code/axon_library_2025/docs",
  "cache": {
    "enabled": true,
    "maxAge": 86400000
  },
  "search": {
    "maxResults": 20
  }
}
```

**Corresponding VSCode Settings:**
```json
{
  "axon.mcp.codePath": "/Users/<user>/Code/axon_library_2025/axon-library",
  "axon.mcp.docsPath": "/Users/<user>/Code/axon_library_2025/docs",
  "axon.mcp.cache.enabled": true,
  "axon.mcp.cache.maxAge": 86400000,
  "axon.mcp.search.maxResults": 20
}
```

### Example 2: SkySpark Connection

**.env.skyspark:**
```bash
SKYSPARK_HOME=/Users/<user>/skyspark/skyspark-3.1.8
SKYSPARK_HOST=localhost
SKYSPARK_PORT=8080
SKYSPARK_PROJECT=mobilytik
SKYSPARK_AUTO_DISCOVER=true
SKYSPARK_AUTO_SYNC_FUNCTIONS=true
SKYSPARK_SYNC_CONCURRENCY=10
```

**Corresponding VSCode Settings:**
```json
{
  "axon.skyspark.home": "/Users/<user>/skyspark/skyspark-3.1.8",
  "axon.skyspark.host": "localhost",
  "axon.skyspark.port": 8080,
  "axon.skyspark.project": "mobilytik",
  "axon.skyspark.autoDiscover": true,
  "axon.skyspark.autoSyncFunctions": true,
  "axon.skyspark.syncConcurrency": 10
}
```

---

## Troubleshooting

### Settings Not Syncing

1. Check sync status:
   ```
   Cmd+Shift+P → "Axon: Configuration Sync Status"
   ```

2. Verify files exist:
   - axon-config.json should be in `/Users/<user>/Code/axon-mcp-server/`
   - .env.skyspark should be in `/Users/<user>/Code/axon-mcp-server/`

3. Force sync:
   ```
   Cmd+Shift+P → "Axon: Sync Settings to Config Files"
   ```

### MCP Server Not Using New Settings

1. Restart MCP server:
   ```
   Cmd+Shift+P → "Axon: MCP Server Actions" → Restart
   ```

2. Check MCP server logs:
   ```
   Cmd+Shift+P → "Axon: View MCP Server Logs"
   ```

### Files Show Old Values

1. Force sync from VSCode:
   ```
   Cmd+Shift+P → "Axon: Sync Settings to Config Files"
   ```

2. Check file permissions (must be writable)

---

## Benefits

✅ **Single Source of Truth**
- Edit settings anywhere, available everywhere

✅ **No Manual Sync**
- Automatic bidirectional synchronization

✅ **File Watching**
- External changes detected immediately

✅ **VSCode UI**
- User-friendly settings interface with validation

✅ **Version Control Friendly**
- Config files can be committed to git

✅ **MCP Integration**
- Server automatically uses latest settings

---

## Architecture

```
User edits VSCode setting
    ↓
ConfigSyncManager detects change
    ↓
Updates axon-config.json or .env.skyspark
    ↓
MCP Server reads files on startup
```

```
User edits config file
    ↓
File system watcher detects change
    ↓
ConfigSyncManager loads values
    ↓
VSCode settings updated
    ↓
Notification shown
```

---

## Technical Details

### Implementation

- **ConfigSyncManager** (`src/core/ConfigSyncManager.ts`)
  - Manages bidirectional sync
  - File system watching
  - Type conversion (string ↔ boolean ↔ number)

- **Configuration Commands** (`src/commands/configSync.ts`)
  - Quick configuration picker
  - Status viewer
  - Manual sync commands

- **Integration** (`src/extension.ts`)
  - Initialized on extension activation
  - Subscribed to configuration changes
  - Disposed on deactivation

### File Formats

- **JSON** (axon-config.json): Native JavaScript object notation
- **ENV** (.env.skyspark): Key=value format with comments

### Type Conversion

The sync manager handles type conversion automatically:
- String → String (direct copy)
- "true"/"false" → Boolean
- Numeric strings → Number (for ports, counts, etc.)

---

**Configuration is now seamless! Edit anywhere, use everywhere.** ✨
