# Quick Reference Card

## Installation

```bash
code --install-extension axon-vscode-0.1.0.vsix
```

## First Time Setup

### 1. Set Anthropic API Key

**Easiest (Settings):**
```
⌘+, → Search "axon.ai.apiKey" → Paste key
```

**Most Secure (Command):**
```
⌘+Shift+P → "Axon: Configure AI Provider" → Enter key
```

Get key: https://console.anthropic.com/

### 2. Verify Setup
```
⌘+Shift+P → "Axon: Check Extension Status"
```

## Essential Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| **AI Features** | | |
| `Axon: Configure AI Provider` | ⌘+Shift+P | Set API key |
| `Axon: Generate Function` | ⌘+Shift+P | Generate Axon function |
| `Axon: Explain Code` | ⌘+Shift+P | Explain selected code |
| `Axon: Optimize Code` | ⌘+Shift+P | Optimize code |
| `Axon: Open AI Chat Panel` | ⌘+Shift+P | Open chat |
| **Configuration** | | |
| `Axon: Open Configuration Editor` | ⌘+Shift+P | Edit server configs |
| `Axon: Quick Configuration` | ⌘+Shift+P | Quick config |
| `Axon: Sync Settings to Config Files` | ⌘+Shift+P | Export to JSON |
| `Axon: Load Settings from Config Files` | ⌘+Shift+P | Import from JSON |
| **MCP Server** | | |
| `Axon: MCP Server Actions` | ⌘+Shift+P | Start/Stop/Restart |
| `Axon: Search Code Examples` | ⌘+Shift+P | Search examples |
| `Axon: Search Documentation` | ⌘+Shift+P | Search docs |
| `Axon: View MCP Server Logs` | ⌘+Shift+P | View logs |
| **Status** | | |
| `Axon: Check Extension Status` | ⌘+Shift+P | Check status |
| `Axon: View Cache Statistics` | ⌘+Shift+P | Cache stats |
| `Axon: View Performance Report` | ⌘+Shift+P | Performance |

## Settings Overview

### AI Settings
```json
{
  "axon.ai.provider": "anthropic",
  "axon.ai.apiKey": "sk-ant-api03-...",
  "axon.ai.planModel": "claude-3-haiku-20240307",
  "axon.ai.actModel": "claude-sonnet-4-20250514"
}
```

### SkySpark Settings
```json
{
  "axon.skyspark.host": "http://localhost:8080",
  "axon.skyspark.project": "demo",
  "axon.skyspark.username": "username"
}
```

### MCP Server Settings
```json
{
  "axon.mcp.enabled": true,
  "axon.mcp.codePath": "/path/to/axon-library",
  "axon.mcp.docsPath": "/path/to/docs"
}
```

## Configuration Files

### Location
```
axon-mcp-server/config/
├── local-skyspark.json     (Local dev)
├── skyone.json             (Production)
├── michealsEnergy.json     (Client server)
└── your-config.json        (Custom)
```

### Structure
```json
{
  "name": "server-name",
  "host": "hostname",
  "port": 8080,
  "protocol": "http",
  "username": "user",
  "password": "pass",
  "projects": [
    {
      "name": "project-name",
      "description": "Description"
    }
  ]
}
```

## Common Workflows

### Generate a Function
1. Open Axon file
2. `⌘+Shift+P` → "Axon: Generate Function"
3. Describe what you need
4. Review and insert

### Edit Server Configuration
1. `⌘+Shift+P` → "Axon: Open Configuration Editor"
2. Select config from sidebar
3. Edit fields
4. Add/remove projects
5. Click "Save"

### Use AI Chat
1. `⌘+Shift+P` → "Axon: Open AI Chat Panel"
2. Type your question
3. Get AI-powered answers
4. Insert code directly

### Check Status
1. `⌘+Shift+P` → "Axon: Check Extension Status"
2. Verify:
   - ✅ AI Provider configured
   - ✅ MCP Server running
   - ✅ SkySpark connected (optional)

## Troubleshooting Quick Fixes

### API Key Not Working
```bash
# Check format
Should start with: sk-ant-api03-

# Verify in settings
⌘+, → Search "axon.ai.apiKey"

# Try command method
⌘+Shift+P → "Axon: Configure AI Provider"
```

### MCP Server Not Starting
```bash
# Check if built
ls ../axon-mcp-server/dist/index.js

# Restart extension
⌘+Shift+P → "Developer: Reload Window"

# Check logs
⌘+Shift+P → "Axon: View MCP Server Logs"
```

### Configuration Editor Not Opening
```bash
# Check config directory exists
ls ../axon-mcp-server/config/

# Create if missing
mkdir -p ../axon-mcp-server/config
```

## File Locations

### Extension
```
~/.vscode/extensions/axon.axon-vscode-0.1.0/
```

### Settings (User)
```
~/Library/Application Support/Code/User/settings.json
```

### Settings (Workspace)
```
.vscode/settings.json
```

### Config Files
```
axon-mcp-server/config/*.json
```

### Logs
```
⌘+Shift+P → "Developer: Show Logs" → "Extension Host"
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `⌘+Shift+P` | Command Palette |
| `⌘+,` | Settings |
| `⌘+Shift+X` | Extensions |
| `⌘+K ⌘+S` | Keyboard Shortcuts |

## Documentation

| Topic | File |
|-------|------|
| API Key Setup | `API_KEY_SETUP.md` |
| Config Editor | `CONFIG_EDITOR.md` |
| Config Sync | `CONFIG_SYNC.md` |
| Release Notes | `RELEASE_NOTES.md` |
| Full Summary | `UPDATE_SUMMARY.md` |

## Support

**Check Status:** `⌘+Shift+P` → "Axon: Check Extension Status"  
**View Logs:** `⌘+Shift+P` → "Developer: Show Logs"  
**Reload Extension:** `⌘+Shift+P` → "Developer: Reload Window"

## License

AFL 3.0 - See `LICENSE` file

---

**Version:** 0.1.0  
**Package:** `axon-vscode-0.1.0.vsix` (33 MB)  
**Ready to use!** 🚀
