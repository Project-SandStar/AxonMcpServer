# Node.js Executable Detection - Cross-Platform

## Problem
VSCode extension host doesn't always have `node` in its PATH, causing `spawn node ENOENT` errors when trying to start the MCP server.

## Solution
Implemented a 4-strategy fallback system to find Node.js on any platform.

## Detection Strategies (in order)

### Strategy 1: Use VSCode's Node.js ✅ **MOST RELIABLE**
```typescript
// Use process.execPath - the node running VSCode itself
const execDir = path.dirname(process.execPath);
const nodePath = path.join(execDir, 'node' or 'node.exe');
```
**Why:** VSCode runs on Node.js, so we can use the same executable that's running the extension host.

### Strategy 2: Search PATH Environment Variable
```typescript
// Parse PATH and check each directory
const pathSeparator = isWindows ? ';' : ':';
const pathDirs = process.env.PATH.split(pathSeparator);
// Check each dir for node/node.exe
```
**Why:** Standard location for executables on all platforms.

### Strategy 3: Check Common Installation Paths
Platform-specific known locations:

#### macOS
- `/opt/homebrew/bin/node` - Homebrew on Apple Silicon (M1/M2/M3)
- `/usr/local/bin/node` - Homebrew on Intel Macs
- `/usr/bin/node` - System Node.js
- `~/.nvm/current/bin/node` - Node Version Manager (nvm)
- `~/.asdf/shims/node` - asdf version manager

#### Linux
- `/usr/bin/node` - System Node.js
- `/usr/local/bin/node` - Manually installed
- `/opt/node/bin/node` - Alternative installation
- `~/.nvm/current/bin/node` - nvm
- `~/.asdf/shims/node` - asdf
- `/snap/bin/node` - Snap package (Ubuntu/Fedora)

#### Windows
- `C:\Program Files\nodejs\node.exe` - Standard installation
- `C:\Program Files (x86)\nodejs\node.exe` - 32-bit on 64-bit system
- `%ProgramFiles%\nodejs\node.exe` - Using environment variable
- `%APPDATA%\npm\node.exe` - npm global installation

### Strategy 4: Fallback to Command Name
```typescript
return isWindows ? 'node.exe' : 'node';
```
**Why:** Last resort - let the OS try to find it in PATH (might fail).

## Code Location
**File:** `vscode-extension/src/mcp/McpServerManager.ts`
- `getNodeExecutable()` - Main detection logic (lines 218-260)
- `getCommonNodePaths()` - Platform-specific paths (lines 262-301)

## Platform Support

| Platform | Supported | Detection Methods |
|----------|-----------|-------------------|
| macOS (Intel) | ✅ | process.execPath, PATH, Homebrew, nvm, asdf |
| macOS (Apple Silicon) | ✅ | process.execPath, PATH, Homebrew (ARM), nvm, asdf |
| Linux (Ubuntu/Debian) | ✅ | process.execPath, PATH, apt, snap, nvm, asdf |
| Linux (Fedora/RHEL) | ✅ | process.execPath, PATH, dnf, snap, nvm, asdf |
| Windows 10/11 | ✅ | process.execPath, PATH, Program Files, npm global |

## Version Managers Supported
- ✅ **nvm** (Node Version Manager)
- ✅ **asdf** (Universal version manager)
- ✅ **Homebrew** (macOS package manager)
- ✅ **Snap** (Linux package manager)
- ✅ **npm global** (Windows)

## Error Handling

### If Node.js Not Found
The extension will:
1. Log a warning: `Could not find node executable, using "node" from PATH`
2. Fall back to using `node` or `node.exe` as command
3. Let the OS attempt to spawn it
4. If that fails, show user-friendly error: `spawn node ENOENT`

### User Action Required
If the extension fails to find Node.js:
1. Install Node.js from [nodejs.org](https://nodejs.org)
2. Ensure it's in PATH
3. Restart VSCode
4. Check that `node --version` works in terminal

## Testing

### Verify Node Detection
Add to extension activation:
```typescript
const nodeExec = this.mcpServerManager['getNodeExecutable']();
this.logger.info(`Detected Node.js: ${nodeExec}`);
```

### Test on Different Systems
1. **Fresh VSCode install** - Should use Strategy 1 (process.execPath)
2. **Custom PATH** - Should use Strategy 2 (PATH search)
3. **nvm/asdf** - Should use Strategy 3 (common paths)
4. **No Node.js** - Should fail gracefully with clear error

## Logging
When the MCP server starts, you'll see:
```
[INFO] Starting MCP server...
[INFO] Using MCP server at: /path/to/server
[INFO] Server working directory: /path/to/working/dir
[INFO] Using Node.js: /opt/homebrew/bin/node
```

The "Using Node.js" line shows which node executable was detected.

## Future Improvements
Potential enhancements:
1. Cache detected path for faster subsequent starts
2. Allow user to configure node path in settings
3. Detect node version and warn if too old
4. Support for alternative runtimes (Deno, Bun)

## Why This Approach?

### ✅ Pros
- **Cross-platform** - Works on macOS, Linux, Windows
- **Reliable** - Multiple fallback strategies
- **No external dependencies** - Pure Node.js and path manipulation
- **Flexible** - Supports many installation methods
- **User-friendly** - Clear logging and error messages

### ⚠️ Cons
- **File system checks** - Slight startup delay (milliseconds)
- **Hardcoded paths** - New installation methods need updates
- **No validation** - Doesn't check if found executable is actually node

## Related Issues
- ❌ **spawn node ENOENT** - Fixed by this implementation
- ❌ **MCP server failed to start** - Prevented by proper node detection
- ✅ **Works in dev mode but not packaged** - Resolved by Strategy 1

## Version History
- **v0.1.0** (2025-01-10) - Initial cross-platform implementation
  - Added 4-strategy detection system
  - Support for macOS, Linux, Windows
  - Support for nvm, asdf, Homebrew, Snap
