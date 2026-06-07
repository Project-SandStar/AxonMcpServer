# Configuration Guide

The Axon MCP Server supports multiple configuration methods with a clear priority order.

## Configuration Priority (highest to lowest)

1. **Config file** (`axon-config.json`)
2. **Environment variables** (`.env` or shell environment)
3. **Default values** (hardcoded in `src/config/config.ts`)

## Setup Methods

### Method 1: Configuration File (Recommended)

Create your own `axon-config.json` (already gitignored):

```bash
cp axon-config.example.json axon-config.json
# Edit axon-config.json with your paths
```

**Example:**
```json
{
  "codePath": "/Users/yourname/Code/axon-library",
  "docsPath": "/Users/yourname/Code/docs",
  "cache": {
    "enabled": true,
    "maxAge": 86400000
  }
}
```

### Method 2: Environment Variables

Set environment variables in your shell or Claude Desktop config:

```bash
export AXON_CODE_PATH=/Users/yourname/Code/axon-library
export AXON_DOCS_PATH=/Users/yourname/Code/docs
```

### Method 3: Default Values

The server includes default paths in `src/config/config.ts` as a fallback. These are the developer's paths and work out-of-the-box for development.

## Why Have Paths in Multiple Places?

1. **`src/config/config.ts`** - Developer's working defaults (fallback)
2. **`axon-config.example.json`** - Template for users (committed with placeholder paths)
3. **`axon-config.json`** - Your actual config (gitignored, not committed)

## For Claude Desktop Integration

You can pass a config file path as an argument:

```json
{
  "mcpServers": {
    "axon-code": {
      "command": "node",
      "args": [
        "/path/to/axon-mcp-server/dist/index.js",
        "/path/to/your-custom-config.json"
      ]
    }
  }
}
```

Or rely on environment variables:

```json
{
  "mcpServers": {
    "axon-code": {
      "command": "node",
      "args": ["/path/to/axon-mcp-server/dist/index.js"],
      "env": {
        "AXON_CODE_PATH": "/Users/yourname/Code/axon-library",
        "AXON_DOCS_PATH": "/Users/yourname/Code/docs"
      }
    }
  }
}
```

## Best Practices

- **For development**: Use the defaults or create `axon-config.json`
- **For production**: Always use config file or env vars, never rely on defaults
- **For sharing**: Only commit example files with placeholder paths
- **For security**: Never commit actual paths or sensitive config to git
