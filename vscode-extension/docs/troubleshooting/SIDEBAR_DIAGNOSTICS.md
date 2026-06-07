# Sidebar Buttons Not Working - Diagnostics

## Quick Test: Try Commands Manually

Since the sidebar buttons aren't working, try running the commands directly from the Command Palette to see which ones work:

### Test Each Command

1. Press `Cmd+Shift+P`
2. Type each of these commands and see if they work:

#### Working Commands (Should Work)
- **"Axon: Check Extension Status"** - Shows extension status
- **"Axon: Configure AI Provider"** - Set API key
- **"Axon: Open Configuration Editor"** - Opens config editor (THIS is how you see/edit projects!)
- **"Axon: Generate Function"** - AI code generation
- **"Axon: View MCP Server Logs"** - View logs

#### To View Your Projects
**Run this command:**
```
Axon: Open Configuration Editor
```

This opens a visual editor where you can:
- ✅ See all your configured projects
- ✅ Add/remove projects
- ✅ Edit project settings
- ✅ Test connections

## Quick Fix for Auto-Discovery

Since sidebar isn't working, disable auto-discovery via settings.json:

### Step 1: Open Settings JSON
1. `Cmd+Shift+P`
2. Type "Preferences: Open User Settings (JSON)"
3. Press Enter

### Step 2: Add These Lines
```json
{
  "axon.mcp.autoDiscover": false,
  "axon.mcp.autoSyncFunctions": false
}
```

### Step 3: Reload
1. `Cmd+Shift+P`
2. "Developer: Reload Window"

## Debugging Sidebar

To debug why sidebar buttons aren't working:

### Check Output Panel
1. View → Output
2. Select "Axon" from dropdown
3. Look for errors when clicking buttons

### Check Developer Console
1. `Cmd+Shift+P`
2. "Developer: Toggle Developer Tools"
3. Go to Console tab
4. Click a sidebar button
5. Look for JavaScript errors in red

### Common Issues

1. **Extension Not Activated**
   - Look at status bar bottom
   - Should see "Axon" indicator
   - If not, extension didn't activate

2. **Webview Not Loading**
   - The sidebar is a webview component
   - Check console for webview errors
   - Try closing and reopening the sidebar

3. **Command Registration Failed**
   - Check Output panel for registration errors
   - Extension may have failed to activate properly

## Workaround: Use Command Palette

While we debug the sidebar, use the Command Palette (`Cmd+Shift+P`) for all commands:

### Most Useful Commands

**View Projects:**
```
Axon: Open Configuration Editor
```

**Disable Auto-Discovery:**
Edit settings.json (see above)

**Check Status:**
```
Axon: Check Extension Status
```

**View Logs:**
```
Axon: View MCP Server Logs
```

**Generate Code:**
```
Axon: Generate Function
```

**Configure API Key:**
```
Axon: Configure AI Provider
```

## Your Projects Are In the Config File

Your 6 projects are defined in:
```
/Users/<user>/Code/axon-mcp-server/config/local-skyspark.json
```

They are:
1. cityFurnitureCustomerTraffic
2. eacDemoV4
3. hybDemo
4. mobilytik
5. reFuelMarket
6. test

All have:
- Username: mcpserver
- Password: DZSY5-G7R2K-45D7X

## Next Steps

1. **Disable auto-discovery** (settings.json method above)
2. **Reload VSCode window**
3. **Open Configuration Editor** to see your projects
4. **Check Output/Console** for sidebar errors
5. Report any errors you see

The extension will work fine via Command Palette even if sidebar buttons don't work!
