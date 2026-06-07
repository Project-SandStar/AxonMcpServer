# Testing the MCP Server Startup Fix

## Quick Test Steps

### 1. Install the Updated Extension
The extension has already been installed:
```bash
/Applications/Visual\ Studio\ Code.app/Contents/Resources/app/bin/code \
  --install-extension /Users/<user>/Code/axon-mcp-server/vscode-extension/axon-vscode-0.1.0.vsix \
  --force
```

### 2. Reload VSCode
- Press **Cmd+Shift+P** (Mac) or **Ctrl+Shift+P** (Windows/Linux)
- Type "Reload Window"
- Press Enter

### 3. Open Output Panel
- Go to **View → Output** (or press **Cmd+Shift+U**)
- In the dropdown at the top-right, select **"Axon VSCode Extension"**

### 4. What to Look For

#### ✅ Success Indicators
Within 1-2 seconds you should see:
```
[2025-01-10T16:XX:XX.XXXZ] [INFO] Starting MCP server...
[2025-01-10T16:XX:XX.XXXZ] [INFO] Using MCP server at: /path/to/mcp/server
[2025-01-10T16:XX:XX.XXXZ] [INFO] Server working directory: /path/to/axon-mcp-server
[2025-01-10T16:XX:XX.XXXZ] [INFO] STDOUT: ✅ MCP Server transport connected - ready to accept requests
[2025-01-10T16:XX:XX.XXXZ] [INFO] STDOUT:    Initialization continuing in background...
[2025-01-10T16:XX:XX.XXXZ] [INFO] MCP server is ready
[2025-01-10T16:XX:XX.XXXZ] [INFO] MCP server started successfully
```

Then, in the background (over the next 10-60 seconds):
```
[INFO] STDOUT: 📚 Building indexes...
[INFO] STDOUT: ✓ Indexed X functions
[INFO] STDOUT: 🔍 Building search indexes...
[INFO] STDOUT: ✓ Axon MCP Server Ready - Initialized in XX.XXs
```

#### ❌ Old Error (Should NOT Appear)
```
[ERROR] Failed to start MCP server: MCP server failed to become ready within 30000ms
```

### 5. Check the Sidebar
- Click the **✨ sparkle icon** in the VSCode activity bar (left side)
- The Axon sidebar should appear immediately
- You should see:
  - **Add/Edit SkySpark Servers** button
  - **Libraries** section (may be empty initially, then populate)
  - **Projects** section (may be empty initially, then populate)

### 6. Verify Functionality
Try any of these to confirm the extension is working:
- Click "Add/Edit SkySpark Servers" to open the configuration editor
- Run a command: **Cmd+Shift+P** → "Axon: Search Examples"
- Check server status: **Cmd+Shift+P** → "Axon: Check MCP Server Status"

## Common Issues and Solutions

### Issue: Still seeing timeout errors
**Solution:** Make sure you installed the correct VSIX file:
```bash
ls -lh /Users/<user>/Code/axon-mcp-server/vscode-extension/axon-vscode-0.1.0.vsix
```
Should show a recent timestamp.

### Issue: Sidebar is empty
**Solution:** This is expected initially! The sidebar populates as background indexing completes. Check the Output panel to see progress.

### Issue: Old behavior persists
**Solution:** 
1. Completely quit VSCode (not just close the window)
2. Restart VSCode
3. If still having issues, uninstall the old extension first:
   - Go to Extensions view (Cmd+Shift+X)
   - Find "Axon VSCode"
   - Click the gear icon → Uninstall
   - Restart VSCode
   - Reinstall using the command above

## Expected Timings

| Phase | Time | Description |
|-------|------|-------------|
| Transport connection | <100ms | Server becomes ready to accept requests |
| Extension activation | 1-2s | VSCode extension fully activated |
| Initial indexing | 10-30s | Scanning and parsing library code |
| Project discovery | 10-60s | If auto-discovery enabled, discovering and indexing projects |
| Total time to full functionality | 20-90s | Depends on number of projects and cache state |

**Key Point:** The extension works immediately, but full functionality (all functions indexed) takes time to build in the background.

## Debug Information

If you encounter issues, check these files for diagnostic info:
- VSCode Output: **View → Output → "Axon VSCode Extension"**
- MCP Server logs: `/Users/<user>/Code/axon-mcp-server/debug-index-state.txt`
- Load cache logs: `/Users/<user>/Code/axon-mcp-server/load-project-caches.log`

## Reporting Issues

If the fix doesn't work, provide:
1. VSCode version: **Help → About**
2. Output panel logs (full text from "Starting MCP server..." to first error)
3. Any error messages in the bottom-right notification area
4. Output of: `ls -la ~/.vscode/extensions/axon.axon-vscode-0.1.0/`
