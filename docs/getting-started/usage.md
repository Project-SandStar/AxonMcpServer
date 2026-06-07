# Axon MCP Server Usage Guide

## Setting Up Your Paths

The Axon MCP Server needs to know where to find your Axon code and documentation.

### Option 1: Configuration File (Recommended)

1. Copy the example config:
   ```bash
   cp axon-config.example.json axon-config.json
   ```

2. Edit `axon-config.json`:
   ```json
   {
     "codePath": "/path/to/your/axon/code",
     "docsPath": "/path/to/your/axon/docs",
     "filePatterns": {
       "code": ["**/*.axon", "**/*.trio"],
       "docs": ["**/*.html", "**/*.md"]
     }
   }
   ```

3. Run with config file:
   ```bash
   node dist/index.js axon-config.json
   ```

### Option 2: Environment Variables (Quick Testing)

```bash
export AXON_CODE_PATH=/path/to/code
export AXON_DOCS_PATH=/path/to/docs
npm start
```

## Path Examples

### Typical Project Structure

```
/Users/<user>/Code/
├── axon_library_2025/
│   └── axon-library/          # Set as codePath
│       ├── abc/
│       │   └── library/
│       │       ├── *.axon     # Axon source files
│       │       └── *.trio     # Trio files
│       ├── docs/              # Set as docsPath
│       │   └── 3.1.11/
│       │       └── docHaxall/
│       │           └── *.html # Documentation with examples
│       └── mckinstry/
│           └── *.axon
└── axon-mcp-server/
```

### Configuration for Above Structure

**Using axon-config.json:**
```json
{
  "codePath": "/Users/<user>/Code/axon_library_2025/axon-library",
  "docsPath": "/Users/<user>/Code/axon_library_2025/axon-library/docs",
  "filePatterns": {
    "code": ["**/*.axon", "**/*.trio"],
    "docs": ["**/docHaxall/*.html", "**/*.md"]
  },
  "excludeDirs": ["node_modules", ".git", "temp"]
}
```

## What Gets Indexed

### From Code Path
- All `.axon` files - Parsed as Axon functions
- All `.trio` files - Parsed for Axon code blocks

### From Docs Path
- HTML files - Extracts Axon code from `<pre>` tags
- Markdown files - Extracts code blocks marked as Axon

## Verifying Your Configuration

After starting the server, you should see output like:
```
Initializing Axon code index...
Found 245 Axon files
Building search index...
Search index built in 125ms with 3842 unique tokens
Indexed 189 Axon functions
Axon MCP server running on stdio
```

## Troubleshooting

### No files found
- Check your paths are correct
- Ensure file patterns match your file extensions
- Verify you have read permissions

### Cache issues
- Delete `.cache` directory to force reindex
- Disable cache in config: `"cache": { "enabled": false }`

### Performance
- Use specific file patterns to reduce scanning
- Enable caching for faster startup
- Exclude unnecessary directories