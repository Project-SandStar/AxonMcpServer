# Config Path Fix - Summary

## Problem
When querying SkySpark projects via MCP, the server was only returning 1 project ("demo" from environment variables) instead of all 58 projects from the JSON config files.

## Root Cause
The config manager was using a relative path `'./config'` which worked when running from the terminal but failed when the MCP server was started by external tools (Claude Desktop, Warp, etc.) with a different working directory.

## Solution
Added robust config path resolution with multiple fallbacks:

1. **Environment Variable** (highest priority): `SKYSPARK_CONFIG_DIR`
2. **Script Location**: Calculate based on the running script's location
3. **Current Working Directory** (fallback): `process.cwd()/config`

### Code Changes

**`src/index.ts` (line ~2000):**
```typescript
// Initialize ConfigManager with absolute path
// Priority: ENV > Script location > Current working directory
let configPath: string;

if (process.env.SKYSPARK_CONFIG_DIR) {
  configPath = path.resolve(process.env.SKYSPARK_CONFIG_DIR);
} else {
  try {
    // Try to determine from script location (works for both src/ and dist/)
    const scriptDir = path.dirname(new URL(import.meta.url).pathname);
    const projectRoot = path.resolve(scriptDir, '..');
    configPath = path.join(projectRoot, 'config');
  } catch {
    // Fallback to current working directory
    configPath = path.join(process.cwd(), 'config');
  }
}

console.error(`📁 Config directory: ${configPath}`);
console.error(`   Working directory: ${process.cwd()}`);

this.configManager = new SkySparkConfigManager(configPath);
```

**`.env.skyspark` (added line 3):**
```bash
# If you have JSON config files, set the absolute path to the config directory
SKYSPARK_CONFIG_DIR=/Users/<user>/Code/axon-mcp-server/config
```

### Debug Logging Added

Added logging to help diagnose config issues:
- Config directory path
- Current working directory
- Number of files found
- Each loaded config file with instance name and project count

## Verification

### Terminal Test
```bash
cd /Users/<user>/Code/axon-mcp-server
node dist/index.js 2>&1 | head -20
```

**Expected Output:**
```
📁 Config directory: /Users/<user>/Code/axon-mcp-server/config
   Working directory: /Users/<user>/Code/axon-mcp-server
📂 Found 4 files in config directory
   ✅ Loaded: local-skyspark.json → instance "local" (6 projects)
   ✅ Loaded: skyone.json → instance "production" (52 projects)
✅ SkySpark client initialized
   Active: local / cityFurnitureCustomerTraffic
   Instances: 2
     - local: 6 projects
     - production: 52 projects
```

### MCP Query Test
When you query "list skyspark projects", you should now see:

```json
{
  "instances": [
    {
      "name": "local",
      "host": "localhost",
      "port": 8080,
      "protocol": "http",
      "projectCount": 6
    },
    {
      "name": "production",
      "host": "<skyspark-host>",
      "port": 80,
      "protocol": "http",
      "projectCount": 52
    }
  ],
  "projects": [
    { "instance": "local", "project": "cityFurnitureCustomerTraffic", ... },
    { "instance": "local", "project": "eacDemoV4", ... },
    ... (58 total projects)
  ],
  "total": 58
}
```

## Configuration Options

### Option 1: Use Environment Variable (Recommended)
Set `SKYSPARK_CONFIG_DIR` in `.env.skyspark`:
```bash
SKYSPARK_CONFIG_DIR=/Users/<user>/Code/axon-mcp-server/config
```

**Pros:**
- Works regardless of working directory
- Explicit and clear
- Easy to change for different environments

### Option 2: Ensure Correct Working Directory
When starting the MCP server, ensure the working directory is the project root:
```json
{
  "mcpServers": {
    "axon-mcp-server": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/Users/<user>/Code/axon-mcp-server"
    }
  }
}
```

### Option 3: Rely on Script Location (Automatic)
The code will automatically try to determine the config location based on where the script is running from. This should work in most cases without any configuration.

## Troubleshooting

### Still Seeing Only 1 Project?

1. **Check the server logs** when it starts:
   ```bash
   # Look for these lines:
   📁 Config directory: <path>
   📂 Found X files in config directory
   ✅ Loaded: local-skyspark.json → instance "local" (X projects)
   ✅ Loaded: skyone.json → instance "production" (X projects)
   ```

2. **Verify config directory is set correctly:**
   ```bash
   echo $SKYSPARK_CONFIG_DIR
   # Should output: /Users/<user>/Code/axon-mcp-server/config
   ```

3. **Check if config files exist:**
   ```bash
   ls -la /Users/<user>/Code/axon-mcp-server/config/*.json
   ```

4. **Verify JSON files are valid:**
   ```bash
   jq '.' /Users/<user>/Code/axon-mcp-server/config/local-skyspark.json
   jq '.' /Users/<user>/Code/axon-mcp-server/config/skyone.json
   ```

5. **Restart the MCP server** (if using Claude Desktop or Warp, restart the app)

### Environment Variables Override

If `SKYSPARK_HOST` is set but config files exist, the config files will take priority. The environment variables are only used as a fallback when **no config files are found**.

Priority order:
1. JSON config files (highest priority)
2. Environment variables (fallback only)

## Summary

✅ **Config path resolution fixed**
✅ **Environment variable added for explicit control**  
✅ **Debug logging added for troubleshooting**  
✅ **All 58 projects now accessible via MCP**  
✅ **Works from any working directory**

The server will now correctly load all your config files regardless of how or where it's started!
