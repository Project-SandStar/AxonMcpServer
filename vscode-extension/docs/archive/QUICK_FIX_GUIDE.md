# Quick Fix Guide - Two Issues

## Issue 1: Stop the 404 Errors (Auto-Discovery)

### Step 1: Open VSCode Settings JSON
1. Press `Cmd+Shift+P`
2. Type: **"Preferences: Open User Settings (JSON)"**
3. Press Enter

### Step 2: Add These Two Lines
Add this to your settings.json:

```json
{
  "axon.mcp.autoDiscover": false,
  "axon.mcp.autoSyncFunctions": false
}
```

### Step 3: Reload VSCode
1. Press `Cmd+Shift+P`
2. Type: **"Developer: Reload Window"**
3. Press Enter

✅ **Done!** No more 404 errors.

---

## Issue 2: View/Edit Your Projects

### The Config Editor Is The Answer

Your projects aren't in VSCode settings - they're in a JSON file.
Use the **Configuration Editor** to see and manage them:

### How to Open It
1. Press `Cmd+Shift+P`
2. Type: **"Axon: Open Configuration Editor"**
3. Press Enter

### What You'll See
A visual editor showing:
- ✅ All your instances (localhost)
- ✅ All 6 projects under each instance
- ✅ Buttons to Add/Edit/Delete projects
- ✅ Test connection buttons
- ✅ Username/password fields (editable)

### Your Current Projects
The editor will show these 6 projects:
1. cityFurnitureCustomerTraffic
2. eacDemoV4
3. hybDemo
4. mobilytik
5. reFuelMarket
6. test

All configured with:
- Username: mcpserver
- Password: DZSY5-G7R2K-45D7X

---

## Issue 3: Sidebar Buttons Not Working

### Workaround: Use Command Palette

Instead of clicking sidebar buttons, use `Cmd+Shift+P` and type these commands:

**Most Useful Commands:**

```
Axon: Open Configuration Editor    ← View/edit projects
Axon: Check Extension Status        ← See what's running
Axon: Generate Function            ← AI code generation
Axon: View MCP Server Logs         ← See MCP logs
Axon: Configure AI Provider        ← Set API key
```

### Debug Sidebar (Optional)

To see why buttons aren't working:

1. `Cmd+Shift+P` → **"Developer: Toggle Developer Tools"**
2. Click the **Console** tab
3. Click a sidebar button
4. Look for **red error messages**
5. Share the error with me if you see one

---

## Summary

### What You Need to Do Right Now

1. **Disable auto-discovery** (Steps above) ← Stops 404 errors
2. **Reload VSCode window**
3. **Open Configuration Editor** to see your projects

### How to View Projects

```
Cmd+Shift+P → "Axon: Open Configuration Editor"
```

This visual editor shows EVERYTHING about your SkySpark configuration!

### Projects Are Here

The actual JSON file is at:
```
/Users/<user>/Code/axon-mcp-server/config/local-skyspark.json
```

But use the **Configuration Editor** GUI - it's much easier!

---

## Questions?

- **"I don't see the password in VSCode settings"** → That's correct! Passwords are in the JSON config file, not VSCode settings. Use the Configuration Editor GUI.

- **"Sidebar buttons don't work"** → Use Command Palette (`Cmd+Shift+P`) instead. All commands work from there.

- **"How do I see my projects?"** → `Cmd+Shift+P` → "Axon: Open Configuration Editor"

- **"Still getting 404 errors?"** → Make sure you added the two settings to settings.json and reloaded VSCode.

---

**That's it!** These three steps will fix everything. 🚀
