# Release Notes - Configuration Editor Update

## Version 0.1.0 - Enhanced Configuration Management

### New Features

#### 1. AFL 3.0 License
- **What:** Added Academic Free License (AFL) v. 3.0 to the extension
- **File:** `LICENSE`
- **package.json:** Updated with `"license": "AFL-3.0"`

#### 2. Configuration Editor GUI
- **What:** Visual interface for editing SkySpark server configuration files
- **Command:** `Axon: Open Configuration Editor`
- **File:** `src/configEditor.ts`
- **Documentation:** `CONFIG_EDITOR.md`

**Features:**
- ✓ Split-panel interface with sidebar and editor
- ✓ Create, edit, and delete configuration files
- ✓ Manage multiple SkySpark servers
- ✓ Configure server and project-level authentication
- ✓ Add/remove projects dynamically
- ✓ Test connections (with MCP server integration)
- ✓ Automatic backup creation before saves
- ✓ JSON validation and error handling
- ✓ VSCode theme integration

**Supported Configuration Files:**
- `local-skyspark.json` - Local development server
- `skyone.json` - Production server
- `michealsEnergy.json` - Client server
- Any custom `*.json` files in the config directory

### Technical Details

#### Files Added
```
vscode-extension/
├── LICENSE                  (AFL 3.0 license text)
├── src/configEditor.ts     (Configuration Editor WebView)
├── CONFIG_EDITOR.md        (User documentation)
└── RELEASE_NOTES.md        (This file)
```

#### Files Modified
```
vscode-extension/
├── package.json            (Added license field and new command)
└── src/extension.ts        (Integrated config editor command)
```

#### Configuration Structure

Each configuration file (`*.json` in `axon-mcp-server/config/`) follows this schema:

```typescript
interface SkySparKConfig {
    name: string;                 // Server identifier
    host: string;                 // Server hostname/IP
    port: number;                 // Server port
    protocol: 'http' | 'https';   // Connection protocol
    username?: string;            // Default credentials
    password?: string;
    defaultProjName?: string;     // Default project
    projects: Array<{
        name: string;             // Project name
        username?: string;        // Override credentials
        password?: string;
        description?: string;     // Project description
    }>;
}
```

### Usage

#### Opening the Configuration Editor

**Command Palette:**
1. Press `⌘+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows/Linux)
2. Type: `Axon: Open Configuration Editor`
3. Press Enter

**Status Bar:**
- Click the Axon status bar item
- Select "Open Configuration Editor" from the menu

#### Creating a New Configuration

1. Click **"+ New Config"** in the sidebar
2. Enter a configuration name (e.g., `my-server`)
3. Fill in the server details:
   - Name (identifier)
   - Host (hostname or IP)
   - Port (typically 8080 or 443)
   - Protocol (http or https)
   - Username and Password (optional)
4. Add projects using **"+ Add Project"**
5. Click **Save**

#### Editing Existing Configurations

1. Select a configuration from the sidebar
2. Modify any fields
3. Click **Save** to apply changes
4. A backup file (`.backup`) is automatically created

#### Testing Connections

1. Fill in server details
2. Click **Test Connection**
3. Verify the connection status
4. *Requires MCP server to be running*

### Integration with Existing Features

#### Configuration Sync
The Configuration Editor works seamlessly with the existing Configuration Sync system:
- VSCode Settings ↔ Configuration Files
- Use `Axon: Sync Settings to Config Files` after using the editor
- Changes from the editor are immediately reflected in config files

#### MCP Server
The Configuration Editor modifies the same JSON files used by the MCP server:
- Changes take effect on MCP server restart
- No manual file editing required
- Automatic validation ensures correct format

### Build & Package

The extension has been successfully built and packaged:

```bash
# Compile TypeScript
npm run compile

# Bundle MCP server
npm run bundle-mcp

# Package extension
npx vsce package
```

**Package Details:**
- **File:** `axon-vscode-0.1.0.vsix`
- **Size:** 33.03 MB
- **Files:** 9,738 files
- **License:** AFL-3.0 (now included)

### Installation

**From VSIX:**
```bash
code --install-extension axon-vscode-0.1.0.vsix
```

**From VSCode UI:**
1. Open VSCode
2. Go to Extensions view (⌘+Shift+X)
3. Click "..." menu → "Install from VSIX..."
4. Select `axon-vscode-0.1.0.vsix`

### What's Next

**Planned Enhancements:**
- [ ] Real connection testing integration with SkySpark API
- [ ] Project auto-discovery from SkySpark servers
- [ ] Configuration import/export functionality
- [ ] Configuration templates library
- [ ] Multi-select for bulk operations
- [ ] Search/filter for large configuration lists
- [ ] Configuration validation with SkySpark schema
- [ ] Encrypted credential storage

### Breaking Changes

None. This is a new feature with no breaking changes to existing functionality.

### Dependencies

**New Dependencies:** None
**Updated Dependencies:** None

The Configuration Editor uses only existing VSCode APIs and built-in Node.js modules.

### Security Considerations

**Credential Storage:**
- Configuration files contain plaintext credentials
- Files are stored locally in `axon-mcp-server/config/`
- **Recommendation:** Add `config/*.json` to `.gitignore`
- **Best Practice:** Use environment variables for production

**File Permissions:**
- Configuration files are read/write by the extension
- Backup files (`.backup`) are created before each save
- No external network requests for credentials

**Validation:**
- All configuration data is validated before saving
- Invalid JSON structures are rejected
- Required fields are enforced

### Testing Checklist

- [x] Extension compiles successfully
- [x] Configuration Editor opens without errors
- [x] Can create new configuration files
- [x] Can edit existing configuration files
- [x] Can delete configuration files
- [x] Can add/remove projects
- [x] Backup files are created on save
- [x] JSON validation works correctly
- [x] License file is included in package
- [x] Extension packages successfully

### Documentation

**Added:**
- `CONFIG_EDITOR.md` - Complete user guide for Configuration Editor
- `RELEASE_NOTES.md` - This document

**Updated:**
- `package.json` - Added license and command
- `src/extension.ts` - Integrated config editor

**Related Docs:**
- `CONFIG_SYNC.md` - Configuration synchronization
- `README.marketplace.md` - Extension marketplace documentation
- `changelog.md` - Version history

### Contributors

This feature was developed to provide a user-friendly interface for managing SkySpark server configurations, eliminating the need for manual JSON editing and reducing configuration errors.

### Feedback & Support

For issues, questions, or feature requests:
1. Check the documentation in `CONFIG_EDITOR.md`
2. Review troubleshooting section
3. Check existing issues on GitHub
4. Create a new issue with details

### License

Academic Free License (AFL) v. 3.0

See `LICENSE` file for complete license text.
