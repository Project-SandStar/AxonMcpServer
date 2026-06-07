# Auto-Discovery Troubleshooting Guide

## Issue: 404 Not Found During Auto-Discovery

### What's Happening

The MCP server is trying to automatically discover all available projects from your SkySpark instance but is getting a 404 error. This typically means:

1. The SkySpark server is running but authentication is failing
2. The discovery project doesn't exist or isn't accessible
3. SkySpark is configured to use a different authentication method

### Quick Fix: Disable Auto-Discovery

Since you already have all your projects configured in `config/local-skyspark.json`, you can safely disable auto-discovery:

#### Option 1: Via VSCode Settings UI

1. Open Settings (`Cmd+,` on Mac)
2. Search for **"Axon MCP Auto Discover"**
3. **Uncheck** the box to disable
4. Search for **"Axon MCP Auto Sync Functions"** 
5. **Uncheck** this as well (optional, but recommended if discovery fails)
6. Reload VSCode: `Cmd+Shift+P` → "Developer: Reload Window"

#### Option 2: Via settings.json

1. `Cmd+Shift+P` → "Preferences: Open User Settings (JSON)"
2. Add these lines:

```json
{
  "axon.mcp.autoDiscover": false,
  "axon.mcp.autoSyncFunctions": false
}
```

3. Save and reload VSCode

### What This Means

- **Auto-Discovery Disabled**: The MCP server will NOT try to automatically find new projects
- **Manual Configuration**: You'll use the projects already defined in your config file
- **Still Works**: All extension features work normally with your configured projects

---

## Understanding the Error

The error occurs because the auto-discovery feature tries to:

1. Connect to SkySpark using the `defaultProjName` or first project
2. Execute `aboutProj()` to list all available projects
3. Automatically add newly discovered projects to the config

The 404 error means this connection/authentication step is failing.

### Why It Might Fail

1. **Authentication Method Mismatch**
   - SkySpark might use session-based auth instead of HTTP Basic Auth
   - The MCP server is trying HTTP Basic Auth (username/password)

2. **Project Access Permissions**
   - The `mcpserver` user might not have permission to list projects
   - Requires admin/su privileges for project discovery

3. **SkySpark Configuration**
   - SkySpark might be configured to require web-based login
   - API endpoint for project discovery might be restricted

---

## Alternative: Manual Project Configuration

You already have projects configured! Your `config/local-skyspark.json` has:

- ✅ cityFurnitureCustomerTraffic
- ✅ eacDemoV4
- ✅ hybDemo
- ✅ mobilytik
- ✅ reFuelMarket
- ✅ test

The extension can work perfectly with these manual configurations.

---

## Testing Individual Project Connections

To verify your projects are accessible, you can test each one in VSCode:

1. Open Command Palette (`Cmd+Shift+P`)
2. Run **"Axon: Check Status"**
3. Look at the MCP Server status section
4. Check if projects are listed and indexed

---

## Fixing Auto-Discovery (Advanced)

If you want auto-discovery to work, you need to:

### 1. Verify SkySpark Authentication

Check which authentication method your SkySpark instance uses:

```bash
# Try accessing a project
curl -i http://localhost:8080/ui/mobilytik/
```

Look for authentication headers in the response.

### 2. Update Config with Correct defaultProjName

I already added `defaultProjName: "mobilytik"` to your config. This tells auto-discovery which project to use for the initial connection.

### 3. Check User Permissions

The `mcpserver` user needs permissions to:
- List available projects (via `aboutProj()`)
- Read project metadata

You might need to:
- Grant admin permissions to `mcpserver` user
- Or use a different user (like `su`) for discovery

### 4. Alternative: Use SkySpark Admin Account

Edit `/Users/<user>/Code/axon-mcp-server/config/local-skyspark.json`:

```json
{
  "name": "local",
  "host": "localhost",
  "port": 8080,
  "protocol": "http",
  "username": "su",
  "password": "your-su-password",
  "defaultProjName": "mobilytik",
  "projects": [
    // ... existing projects ...
  ]
}
```

Then in VSCode settings, enable auto-discovery again.

---

## Recommended Setup

For most users:

✅ **Keep auto-discovery DISABLED**
✅ **Manually configure projects** in the JSON config
✅ **Enable auto-sync** (if you want function source code downloaded)

This gives you:
- ✅ Full control over which projects are indexed
- ✅ Faster startup (no discovery scan)
- ✅ No authentication issues
- ✅ Still get all extension features

---

## When to Enable Auto-Discovery

Enable auto-discovery if:
- ✅ You frequently add new SkySpark projects
- ✅ You have admin/su access to SkySpark
- ✅ Your SkySpark uses standard HTTP Basic Auth
- ✅ You want automatic detection of new projects

Keep it disabled if:
- ✅ Your projects rarely change
- ✅ You prefer manual configuration
- ✅ Authentication isn't working properly
- ✅ You want faster startup times

---

## Summary

**What You Should Do Now:**

1. **Disable auto-discovery** via VSCode settings (see instructions above)
2. **Reload VSCode window**
3. **Verify MCP server starts** without 404 errors
4. **Check that your 6 projects are accessible** via "Axon: Check Status"
5. **Use the extension normally** - all features will work!

The auto-discovery feature is optional - your extension works perfectly with manual project configuration.

---

## Still Having Issues?

If you're still seeing problems:

1. Check MCP Server logs: `Cmd+Shift+P` → "Axon: View MCP Server Logs"
2. Check extension output: View → Output → Select "Axon"
3. Verify SkySpark is running: `curl http://localhost:8080`
4. Check project access manually using the Config Editor

---

**Bottom Line**: Disable auto-discovery and use your existing manual project configuration. Everything will work great! 🚀
