# Configuration Editor

The Axon VSCode extension includes a powerful graphical configuration editor for managing SkySpark server connections and projects.

## Quick Start: Adding a New SkySpark Instance

**From Sidebar (Easiest):**
1. Click the ✨ **sparkle icon** in the activity bar to open Axon sidebar
2. Click **"Add/Edit SkySpark Servers"** button
3. In the Configuration Editor, click **"+ New Config"**
4. Enter a name (e.g., `production-server`)
5. Fill in connection details (host, port, credentials)
6. Add projects if needed
7. Click **Save**

**From Command Palette:**
1. Press `⌘+Shift+P`
2. Type: `Axon: Open Configuration Editor`
3. Follow steps 3-7 above

**Each configuration file = One SkySpark instance**
- `local-skyspark.json` = Local dev instance
- `production.json` = Production instance
- `client-server.json` = Client instance
- etc.

## Overview

The Configuration Editor provides a user-friendly interface to:
- Create, edit, and delete SkySpark server configurations
- Manage multiple server connections (local, remote, cloud)
- Configure server-level and project-level authentication
- Test connections before saving
- Automatic backup creation before saves

## Features

### Visual Editor Interface

The Configuration Editor uses a split-panel layout:

**Left Panel (Sidebar)**
- List of all configuration files
- Quick create new configuration button
- Select any configuration to edit

**Right Panel (Editor)**
- Server connection settings
- Protocol selection (HTTP/HTTPS)
- Host and port configuration
- Authentication credentials
- Project management with nested credentials

### Supported Configuration Files

All configuration files are stored in:
```
axon-mcp-server/config/
```

Common configurations include:
- `local-skyspark.json` - Local development server
- `skyone.json` - Production server
- `michealsEnergy.json` - Client server
- Custom configurations

## Configuration Structure

Each configuration file follows this structure:

```json
{
  "name": "server-name",
  "host": "hostname-or-ip",
  "port": 8080,
  "protocol": "http",
  "username": "username",
  "password": "password",
  "defaultProjName": "default-project",
  "projects": [
    {
      "name": "project-name",
      "username": "project-username",
      "password": "project-password",
      "description": "Project description"
    }
  ]
}
```

### Configuration Fields

#### Server Level

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique identifier for this server connection |
| `host` | string | Yes | Server hostname or IP address |
| `port` | number | Yes | Server port (typically 8080 or 443) |
| `protocol` | string | Yes | Connection protocol: `http` or `https` |
| `username` | string | No | Default username for authentication |
| `password` | string | No | Default password for authentication |
| `defaultProjName` | string | No | Default project to use when connecting |

#### Project Level

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Project name in SkySpark |
| `username` | string | No | Override username for this project |
| `password` | string | No | Override password for this project |
| `description` | string | No | Human-readable description |

## Usage

### Opening the Configuration Editor

1. **Via Command Palette** (⌘+Shift+P):
   - Type: `Axon: Open Configuration Editor`

2. **Via Status Bar**:
   - Click the Axon status bar item
   - Select "Open Configuration Editor"

### Creating a New Configuration

1. Click the **"+ New Config"** button in the sidebar
2. Enter a name (e.g., `my-server`)
3. The editor will create `my-server.json` with defaults
4. Fill in the server connection details
5. Click **Save**

### Editing Existing Configuration

1. Select a configuration file from the sidebar
2. Modify any fields in the editor
3. Click **Save** to apply changes
4. A backup file (`.backup`) is automatically created

### Managing Projects

**Add a Project:**
1. Click **"+ Add Project"** in the Projects section
2. Enter the project name
3. Fill in credentials if different from server defaults
4. Click **Save**

**Remove a Project:**
1. Click the **Remove** button next to the project
2. Confirm the deletion
3. Click **Save** to apply changes

### Testing Connections

Click the **Test Connection** button to verify:
- Server is reachable
- Port is accessible
- Authentication credentials are valid

*Note: Connection testing requires the MCP server to be running*

### Deleting a Configuration

1. Select the configuration to delete
2. Click the **Delete** button
3. Confirm the deletion
4. The file will be permanently removed

## File Management

### Automatic Backups

Before every save operation, the extension creates a backup:
```
config/my-server.json.backup
```

Backups help you recover from mistakes or accidental changes.

### File Validation

The editor validates configurations before saving:
- ✓ Required fields are present
- ✓ Port is a valid number
- ✓ Protocol is either `http` or `https`
- ✓ Projects array is valid
- ✗ Invalid JSON structure is rejected

## Integration with MCP Server

The Configuration Editor directly modifies the JSON files used by the MCP server for SkySpark connections. Changes take effect immediately when the MCP server is restarted or when it reloads configurations.

### Configuration Sync

The extension also provides **Configuration Sync** commands to synchronize between:
- VSCode settings (UI)
- Configuration files (JSON)

See `CONFIG_SYNC.md` for more details.

## Best Practices

### Security

1. **Never commit passwords to version control**
   - Add `config/*.json` to `.gitignore`
   - Use environment variables for production

2. **Use project-specific credentials**
   - Avoid sharing admin credentials
   - Create dedicated users for development

3. **Rotate passwords regularly**
   - Update credentials in config files
   - Test connections after changes

### Organization

1. **Use descriptive names**
   - Good: `local-dev-server`, `prod-skyspark`
   - Bad: `server1`, `test`

2. **Add project descriptions**
   - Helps identify project purposes
   - Useful for team collaboration

3. **Keep configurations organized**
   - One file per server
   - Group related projects together

### Development Workflow

1. **Local Development**
   ```json
   {
     "name": "local",
     "host": "localhost",
     "port": 8080,
     "protocol": "http"
   }
   ```

2. **Staging Environment**
   ```json
   {
     "name": "staging",
     "host": "staging.company.com",
     "port": 443,
     "protocol": "https"
   }
   ```

3. **Production**
   ```json
   {
     "name": "production",
     "host": "prod.company.com",
     "port": 443,
     "protocol": "https"
   }
   ```

## Troubleshooting

### Configuration File Not Found

**Problem:** Configuration files don't appear in the sidebar

**Solution:**
1. Verify files are in `axon-mcp-server/config/`
2. Ensure files have `.json` extension
3. Refresh by reopening the Configuration Editor

### Cannot Save Changes

**Problem:** Save button doesn't work or shows errors

**Solution:**
1. Check that all required fields are filled
2. Verify JSON structure is valid
3. Ensure you have write permissions to the config directory
4. Check the error message for specific validation issues

### Connection Test Fails

**Problem:** Test Connection returns an error

**Solution:**
1. Verify MCP server is running
2. Check host and port are correct
3. Ensure SkySpark server is accessible
4. Verify credentials are correct
5. Check firewall/network settings

### Projects Not Loading

**Problem:** Projects array shows as empty

**Solution:**
1. Projects may need to be added manually
2. Use the MCP server's project discovery feature
3. Check that project names match SkySpark exactly

## Related Documentation

- [Configuration Sync](./CONFIG_SYNC.md) - VSCode settings synchronization
- [MCP Server](../README.md) - MCP server documentation
- [Extension Usage](./README.marketplace.md) - General extension guide

## Advanced Usage

### Bulk Configuration Updates

For multiple configurations, consider:
1. Edit JSON files directly in your editor
2. Use the Configuration Editor for validation
3. Test each configuration after changes

### Configuration Templates

Create template files for common setups:
```json
{
  "name": "template-name",
  "host": "REPLACE_ME",
  "port": 8080,
  "protocol": "http",
  "projects": []
}
```

### Environment-Specific Configs

Use different config files per environment:
- `local-*.json` - Local development
- `staging-*.json` - Staging servers
- `prod-*.json` - Production servers

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open Configuration Editor | `⌘+Shift+P` → "Axon: Open Configuration Editor" |
| Save Configuration | Click "Save" button |
| Create New Config | Click "+ New Config" |
| Delete Configuration | Click "Delete" button |

## License

This feature is part of the Axon VSCode extension, licensed under the Academic Free License (AFL) v. 3.0.
