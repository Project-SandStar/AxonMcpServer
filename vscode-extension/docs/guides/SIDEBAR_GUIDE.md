# Axon Sidebar Guide

## What's New: Sidebar View! 

The Axon extension now includes a **sidebar panel** (like Cline!) that gives you quick access to all AI features and configuration tools.

## How to Access the Sidebar

### Option 1: Activity Bar Icon
1. Look for the **✨ sparkle icon** in the left activity bar (where File Explorer, Search, etc. are)
2. Click the sparkle icon
3. The Axon sidebar will open!

### Option 2: Command Palette
1. Press `⌘+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows/Linux)
2. Type: `View: Show Axon`
3. Press Enter

### Option 3: View Menu
1. Go to **View** → **Open View...**
2. Search for "Axon"
3. Click "Axon Assistant"

## What's in the Sidebar?

### 🚀 Quick Actions
One-click access to AI features:
- **Generate Function** - Create new Axon functions with AI
- **Explain Code** - Get AI explanations of selected code
- **Optimize Code** - Improve code performance and readability
- **Open AI Chat** - Launch the full AI chat panel

### ⚙️ Configuration
Easy access to settings:
- **Server Config Editor** - Visual editor for SkySpark servers
- **Configure API Key** - Set your Anthropic API key
- **MCP Server Actions** - Start/Stop/Restart MCP server

### 📊 Status
- **Check System Status** - View extension and server status

### ✨ Features
Information about what Axon can do:
- AI Code Generation
- MCP Server Integration
- SkySpark Management

## Tips & Tricks

### Keep It Open
The sidebar stays open even when you switch files or tabs. Perfect for quick access while coding!

### Keyboard Shortcuts
All sidebar buttons trigger existing commands, so you can also use:
- `⌘+Shift+P` → "Axon: Generate Function"
- `⌘+Shift+P` → "Axon: Explain Code"
- etc.

### Resize the Sidebar
Drag the right edge of the sidebar to make it wider or narrower.

### Hide/Show Quickly
- Click the sparkle icon again to hide the sidebar
- Or use `⌘+B` to toggle the entire sidebar area

## Comparison with Command Palette

| Feature | Sidebar | Command Palette |
|---------|---------|-----------------|
| **Quick Access** | ✅ One click | ⚠️ Type command |
| **Visual** | ✅ Organized sections | ❌ Text list |
| **Discovery** | ✅ See all features | ⚠️ Need to know names |
| **Persistent** | ✅ Stays open | ❌ Closes after use |
| **Keyboard** | ❌ Mouse required | ✅ Keyboard only |

**Use the sidebar when:**
- You want quick visual access
- You're exploring features
- You prefer mouse/trackpad
- You want to keep it visible

**Use Command Palette when:**
- You know the command name
- You prefer keyboard-only workflow
- You need autocomplete
- You want to stay focused on code

## Sidebar Layout

```
┌─────────────────────────────┐
│ ✨ Axon AI                  │
│ AI-powered SkySpark Axon    │
├─────────────────────────────┤
│ 🚀 Quick Actions            │
│  🔧 Generate Function       │
│  💡 Explain Code            │
│  ⚡ Optimize Code            │
│  💬 Open AI Chat            │
├─────────────────────────────┤
│ ⚙️ Configuration            │
│  📝 Server Config Editor    │
│  🔑 Configure API Key       │
│  🖥️ MCP Server Actions      │
├─────────────────────────────┤
│ 📊 Status                   │
│  ✓ Check System Status      │
├─────────────────────────────┤
│ ✨ Features                 │
│  • AI Code Generation       │
│  • MCP Server Integration   │
│  • SkySpark Management      │
└─────────────────────────────┘
```

## Customization

### Change the Icon
To use a different icon in the activity bar, edit `package.json`:
```json
"viewsContainers": {
  "activitybar": [{
    "icon": "$(sparkle)"  // Change to any VSCode icon
  }]
}
```

Available icons: https://code.visualstudio.com/api/references/icons-in-labels

### Reorder in Activity Bar
Drag the sparkle icon up or down in the activity bar to reposition it.

### Hide the Sidebar
If you prefer Command Palette only:
1. Right-click the sparkle icon
2. Select "Hide 'Axon'"

To restore:
1. View → Open View...
2. Search "Axon"
3. Click to open

## Troubleshooting

### Sidebar Not Showing
1. Make sure extension is installed and activated
2. Look for the sparkle icon in the activity bar
3. Try: View → Open View... → "Axon Assistant"
4. Reload window: `⌘+Shift+P` → "Developer: Reload Window"

### Buttons Not Working
1. Check extension logs: `⌘+Shift+P` → "Developer: Show Logs"
2. Verify API key is configured: Sidebar → "Configure API Key"
3. Check status: Sidebar → "Check System Status"

### Sidebar Too Wide/Narrow
Drag the right edge of the sidebar panel to resize it.

### Icon Not Visible
The sparkle icon should be at the bottom of the activity bar. If you can't find it:
1. Check if it's hidden: Right-click activity bar → Check "Axon" is enabled
2. Restart VSCode

## Future Enhancements

Coming soon to the sidebar:
- [ ] Real-time MCP server status indicator
- [ ] Recent tasks/history
- [ ] Quick settings toggles
- [ ] Inline API usage stats
- [ ] Recent files with AI edits

## Related Documentation

- [Quick Reference](./QUICK_REFERENCE.md) - All commands
- [API Key Setup](./API_KEY_SETUP.md) - Configure API key
- [Config Editor](./CONFIG_EDITOR.md) - Server configuration

## Feedback

Love the sidebar? Have suggestions? Let us know!

The sidebar is designed to make Axon features more discoverable and accessible, just like Cline's interface. 

**Happy Coding!** ✨
