# MCP Server Troubleshooting Guide

## Common Issues

### Issue 1: ERR_STREAM_DESTROYED - Server Crashes on Startup

**Symptoms:**
```
[WARN] MCP ping failed: ERR_STREAM_DESTROYED
[ERROR] Failed to start MCP server: MCP server failed to become ready within 30000ms
```

**Cause:** The MCP server process crashes during initialization, usually when trying to auto-discover SkySpark servers or sync functions.

**Solutions:**

#### Solution 1: Disable Auto-Discovery (Recommended)
Edit `/Users/<user>/Code/axon-mcp-server/.env.skyspark`:

```bash
# Change these lines:
SKYSPARK_AUTO_DISCOVER=false  # was: true
SKYSPARK_AUTO_SYNC_FUNCTIONS=false  # was: true
```

Then reload VSCode:
```
⌘+Shift+P → "Developer: Reload Window"
```

#### Solution 2: Check SkySpark Connection
If you want auto-discovery, verify SkySpark is running:

```bash
# Check if SkySpark is running
curl http://localhost:8080/api/demo/about

# If it fails, start SkySpark first
```

#### Solution 3: Kill Existing MCP Server Process
If an MCP server is already running:

```bash
# Find the process
ps aux | grep "node.*mcp-server" | grep -v grep

# Kill it (replace PID with actual process ID)
kill -9 <PID>

# Then reload VSCode
```

### Issue 2: Sidebar Buttons Don't Work

**Symptoms:**
- Click buttons in sidebar, nothing happens
- No errors shown

**Fixed in latest version!** The sidebar commands now properly await and include error handling.

**If still not working:**
1. Check Developer Tools for errors: `Help → Toggle Developer Tools`
2. Look in Console tab for JavaScript errors
3. Try reloading: `⌘+Shift+P` → "Developer: Reload Window"

### Issue 3: MCP Server Takes Too Long to Start

**Symptoms:**
```
[ERROR] MCP server failed to become ready within 30000ms
```

**Cause:** Building indexes for large codebases (5000+ files) takes time.

**Solutions:**

#### Option 1: Wait Longer
The server will eventually become ready. You can:
1. Continue using the extension (features still work)
2. MCP-specific features (search examples) will be available once ready

#### Option 2: Reduce File Count
Edit MCP server config to index fewer files:
- Remove large directories from scan
- Use `.mcpignore` file to exclude paths

### Issue 4: Multiple MCP Server Instances

**Symptoms:**
- Multiple `node` processes running MCP server
- High CPU/memory usage

**Solution:**
```bash
# Kill all MCP server processes
pkill -f "node.*mcp-server"
pkill -f "node.*axon-mcp"

# Reload VSCode
⌘+Shift+P → "Developer: Reload Window"
```

### Issue 5: Config Directory Not Found

**Symptoms:**
```
Config directory not found: /Users/<user>/.vscode/extensions/.../dist/config
```

**Solution:** Already fixed in latest version! The extension now uses correct working directory.

If still seeing this:
1. Verify config directory exists:
   ```bash
   ls -la ~/Code/axon-mcp-server/config/
   ```

2. Check `.env.skyspark`:
   ```bash
   cat ~/Code/axon-mcp-server/.env.skyspark | grep CONFIG_DIR
   ```

3. Should show:
   ```
   SKYSPARK_CONFIG_DIR=/Users/<user>/Code/axon-mcp-server/config
   ```

## Recommended Configuration

For stable startup, use this in `.env.skyspark`:

```bash
# Recommended for VSCode Extension
SKYSPARK_AUTO_DISCOVER=false
SKYSPARK_AUTO_SYNC_FUNCTIONS=false

# Fallback configuration
SKYSPARK_HOST=localhost
SKYSPARK_PORT=8080
SKYSPARK_PROJECT=mobilytik
SKYSPARK_USERNAME=su
SKYSPARK_PASSWORD=su
SKYSPARK_PROTOCOL=http

# Config directory (required)
SKYSPARK_CONFIG_DIR=/Users/<user>/Code/axon-mcp-server/config
```

## Manual MCP Server Testing

To test the MCP server independently:

```bash
# Navigate to MCP server directory
cd /Users/<user>/Code/axon-mcp-server

# Run the server directly
node dist/index.js

# Should see:
# ✅ SkySpark client initialized
# ✅ FlexSearch index built
# Server listening on stdio...
```

If it crashes, you'll see the actual error.

## Checking MCP Server Logs

### From VSCode Extension
```
⌘+Shift+P → "Axon: View MCP Server Logs"
```

### From Developer Tools
```
Help → Toggle Developer Tools → Console tab
```

Look for lines starting with:
- `[INFO] MCP server...`
- `[WARN] MCP server...`
- `[ERROR] MCP server...`

## Quick Fixes Summary

### Can't Start MCP Server
```bash
# 1. Disable auto-discovery
sed -i '' 's/SKYSPARK_AUTO_DISCOVER=true/SKYSPARK_AUTO_DISCOVER=false/' ~/Code/axon-mcp-server/.env.skyspark
sed -i '' 's/SKYSPARK_AUTO_SYNC_FUNCTIONS=true/SKYSPARK_AUTO_SYNC_FUNCTIONS=false/' ~/Code/axon-mcp-server/.env.skyspark

# 2. Kill existing processes
pkill -f "node.*mcp-server"

# 3. Reload VSCode
# ⌘+Shift+P → "Developer: Reload Window"
```

### Sidebar Not Working
```bash
# 1. Install latest version
code --install-extension axon-vscode-0.1.0.vsix

# 2. Reload
# ⌘+Shift+P → "Developer: Reload Window"
```

### Extension Won't Activate
```bash
# 1. Check logs
# Help → Toggle Developer Tools → Console

# 2. Look for red errors
# 3. Try safe mode
# Help → Reload Window
```

## Still Not Working?

### Disable MCP Server Temporarily
In VSCode Settings:
```json
{
  "axon.mcp.enabled": false
}
```

This will disable MCP-specific features (search examples) but everything else will work.

### Use Extension Without MCP
The extension can work without MCP server:
- ✅ AI Code Generation
- ✅ Code Explanation
- ✅ Code Optimization
- ✅ AI Chat
- ✅ Configuration Editor
- ❌ Search Axon Examples (requires MCP)
- ❌ Search Documentation (requires MCP)

## Getting Help

1. **Check logs:**
   - `⌘+Shift+P` → "Axon: View MCP Server Logs"
   - `Help` → `Toggle Developer Tools` → `Console`

2. **Check status:**
   - `⌘+Shift+P` → "Axon: Check Extension Status"

3. **Try clean install:**
   ```bash
   # Remove extension
   code --uninstall-extension axon.axon-vscode
   
   # Kill processes
   pkill -f "node.*mcp-server"
   
   # Reinstall
   code --install-extension axon-vscode-0.1.0.vsix
   ```

4. **Report issue** with:
   - Full logs from "Axon: View MCP Server Logs"
   - Developer Tools console output
   - Output from: `ps aux | grep node`

## Related Documentation

- [MCP Server Fixes](./MCP_SERVER_FIXES.md) - What we fixed
- [Quick Reference](./QUICK_REFERENCE.md) - All commands
- [Sidebar Guide](./SIDEBAR_GUIDE.md) - Using the sidebar

---

**Most issues are fixed by disabling auto-discovery in `.env.skyspark`** ✅
