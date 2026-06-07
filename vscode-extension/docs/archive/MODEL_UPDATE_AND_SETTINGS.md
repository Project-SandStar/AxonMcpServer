# Model Updates and New Settings

## Date: 2025-06-XX

## Summary

This update adds support for the latest Claude models and introduces new MCP server configuration options for auto-discovery and auto-sync functionality.

---

## 1. Updated Claude Models

### New Models Added

The extension now supports all the latest Claude models from Anthropic:

#### Sonnet Family (Balanced Performance)
- **`claude-sonnet-4-5-20250929`** ⭐ - Latest and best balanced model (Sep 2025)
- **`claude-sonnet-4-20250514`** - Claude Sonnet 4 (May 2025)
- **`claude-3-7-sonnet-20250219`** - Enhanced Sonnet 3.7 (Feb 2025)
- **`claude-3-5-sonnet-20241022`** - Sonnet 3.5 (Oct 2024)
- **`claude-3-5-sonnet-20240620`** - Previous Sonnet 3.5 (Jun 2024)

#### Opus Family (Most Capable)
- **`claude-opus-4-1-20250805`** 🚀 - Latest most capable model (Aug 2025)
- **`claude-opus-4-20250514`** - Claude Opus 4 (May 2025)
- **`claude-3-opus-20240229`** - Claude 3 Opus (Feb 2024)

#### Haiku Family (Fast & Efficient)
- **`claude-3-5-haiku-20241022`** ⚡ - Fast Haiku 3.5 (Oct 2024)
- **`claude-3-haiku-20240307`** - Original Haiku (Mar 2024, cheapest)

### Default Model Configuration

- **Planning Model**: `claude-3-5-haiku-20241022` (fast and efficient)
- **Code Generation Model**: `claude-sonnet-4-5-20250929` (latest balanced model)

### Model Selection Guide

**For Planning (cheaper, faster):**
- ✅ Haiku 3.5 - Best for most planning tasks
- ⚖️ Sonnet 4.5 - For complex planning
- 💪 Opus 4.1 - Only for extremely complex plans

**For Code Generation (more capable):**
- ⭐ **Recommended**: Sonnet 4.5 - Best balance
- 🔥 Opus 4.1 - Complex/critical code generation
- ⚡ Haiku 3.5 - Simple code only

---

## 2. New MCP Server Settings

### Auto-Discovery Setting

**Setting**: `axon.mcp.autoDiscover`
- **Type**: Boolean
- **Default**: `true`
- **Description**: Automatically discover and index all projects from all instances on MCP server startup

When enabled, the MCP server will:
1. Scan all configured SkySpark instances
2. Discover all available projects
3. Build indexes for discovered projects
4. Update the configuration file

This eliminates the need to manually configure each project.

### Auto-Sync Functions Setting

**Setting**: `axon.mcp.autoSyncFunctions`
- **Type**: Boolean
- **Default**: `true`
- **Description**: Automatically download function source code for offline searching

When enabled:
1. Function source code is downloaded to local disk
2. Functions are stored in `proj/<instance>/<project>/func/`
3. Enables faster offline access and searching
4. Background sync runs periodically

### How Settings Are Applied

The VSCode extension now:
1. Reads these settings from VSCode configuration
2. Passes them to the MCP server via environment variables:
   - `SKYSPARK_AUTO_DISCOVER`
   - `SKYSPARK_AUTO_SYNC_FUNCTIONS`
3. The MCP server respects these settings on startup

---

## 3. Technical Changes

### Files Modified

#### `package.json`
- Updated `axon.ai.planModel` enum with all new Claude models
- Updated `axon.ai.actModel` enum with all new Claude models
- Added `axon.mcp.autoDiscover` setting
- Added `axon.mcp.autoSyncFunctions` setting
- Updated default models to latest versions

#### `src/mcp/McpServerManager.ts`
- Reads auto-discovery and auto-sync settings from VSCode configuration
- Passes settings to MCP server via environment variables in spawn options
- Logs settings on server startup for transparency

#### `src/providers/anthropic/AnthropicProvider.ts`
- Already supports all models via the Anthropic SDK
- Pricing information updated to reflect current models
- Default model updated to `claude-sonnet-4-5-20250929`

---

## 4. Configuration in VSCode Settings

### Via Settings UI

1. Open Settings (`Cmd+,` on Mac, `Ctrl+,` on Windows/Linux)
2. Search for "Axon"
3. Navigate to:
   - **Axon › AI: Plan Model** - Select planning model
   - **Axon › AI: Act Model** - Select code generation model
   - **Axon › MCP: Auto Discover** - Enable/disable auto-discovery
   - **Axon › MCP: Auto Sync Functions** - Enable/disable auto-sync

### Via settings.json

```json
{
  "axon.ai.planModel": "claude-3-5-haiku-20241022",
  "axon.ai.actModel": "claude-sonnet-4-5-20250929",
  "axon.mcp.autoDiscover": true,
  "axon.mcp.autoSyncFunctions": true
}
```

---

## 5. Sidebar Commands

All sidebar commands remain fully functional:

### Quick Actions
- **Generate Function** - Opens AI code generation prompt
- **Explain Code** - Explains selected code
- **Optimize Code** - Suggests optimizations
- **Open AI Chat** - Opens interactive chat panel

### Configuration
- **Add/Edit SkySpark Servers** - Opens visual config editor
- **Configure API Key** - Set Anthropic API key
- **MCP Server Actions** - Start/stop/restart MCP server

### Status
- **Check System Status** - Displays extension and MCP server status

All buttons are wired correctly and invoke their respective VSCode commands.

---

## 6. Verification Steps

### After Installing the Extension

1. **Reload VSCode** - Press `Cmd+Shift+P` → "Developer: Reload Window"

2. **Check MCP Server Logs**:
   - Open Command Palette (`Cmd+Shift+P`)
   - Run "Axon: View MCP Server Logs"
   - Look for:
     ```
     🔍 Auto-discovery: ENABLED/DISABLED
     📥 Auto-sync functions: ENABLED/DISABLED
     MCP server settings: auto-discover=true, auto-sync=true
     ```

3. **Verify Model Selection**:
   - Open Settings → Search "Axon AI"
   - Check that all new models appear in dropdown lists
   - Default should be:
     - Plan Model: claude-3-5-haiku-20241022
     - Act Model: claude-sonnet-4-5-20250929

4. **Test Sidebar Commands**:
   - Open the Axon sidebar (left panel)
   - Click each button to ensure it triggers correctly
   - No console errors should appear in Output panel

5. **Verify Auto-Discovery** (if enabled):
   - Wait for MCP server initialization
   - Check logs for:
     ```
     [Background] 🚀 Starting project discovery and indexing...
     ✅ Successfully indexed X instance(s), Y project(s)
     ```

---

## 7. Troubleshooting

### Models Not Appearing in Dropdown

**Solution**: Reload VSCode after installation
```
Cmd+Shift+P → Developer: Reload Window
```

### Auto-Discovery Not Running

**Check**:
1. Setting is enabled: `axon.mcp.autoDiscover: true`
2. MCP server is running (check status bar)
3. SkySpark instances are configured in `config/local-skyspark.json`

**View Logs**:
```
Cmd+Shift+P → Axon: View MCP Server Logs
```

### Sidebar Buttons Not Working

**Check**:
1. No errors in Output panel (View → Output → "Axon")
2. Extension is activated (status bar shows "Axon")
3. Reload VSCode window

---

## 8. Performance Notes

### Auto-Discovery Impact

- **Initial Startup**: Adds 0-5 seconds (depends on # of projects)
- **Background Process**: Does not block extension activation
- **Benefit**: No manual configuration required

### Auto-Sync Impact

- **Storage**: ~1-10 MB per project (depends on function count)
- **Network**: Downloads function source code once, then caches
- **Benefit**: Much faster offline search and code analysis

### Recommendations

- **Keep Both Enabled** for best experience
- **Disable Auto-Discovery** if you have many instances and prefer manual config
- **Disable Auto-Sync** if disk space is very limited

---

## 9. API Key Requirements

To use the new Claude models, ensure you have:

1. An Anthropic API key from [console.anthropic.com](https://console.anthropic.com/)
2. API key configured in VSCode:
   - Settings → Search "Axon API Key"
   - Or run command: "Axon: Configure AI Provider"

The latest models (Claude 4.5, Opus 4.1) may require:
- API tier with higher rate limits
- Billing account in good standing

---

## 10. Next Steps

1. **Reload VSCode** to activate the updated extension
2. **Check MCP Server Logs** to verify auto-discovery status
3. **Open Settings** to explore new model options
4. **Test Sidebar** commands to ensure everything works
5. **Generate Code** with the latest Claude models!

---

## Support

If you encounter issues:

1. Check Output panel: View → Output → Select "Axon"
2. View MCP Server logs: Command Palette → "Axon: View MCP Server Logs"
3. Check system status: Command Palette → "Axon: Check Status"
4. Review troubleshooting docs in the extension README

---

**Enjoy the enhanced Axon VSCode Extension with the latest AI models!** 🚀✨
