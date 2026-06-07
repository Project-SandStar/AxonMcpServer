# SkySpark Instance Configuration - Flexible Naming

## Overview
You can name your SkySpark instance configuration files anything you want. The system will automatically track and preserve the original filename when updating configurations.

## How It Works

### Instance Name vs. Filename
- **Filename**: The JSON file in the `config/` directory (e.g., `demoInstance.json`, `skytwo.json`, `local-skyspark.json`)
- **Instance Name**: The `"name"` field inside the JSON file (used for switching between instances)

These can be different, and the system will maintain both correctly.

## Examples

### Example 1: Production Servers
You might have multiple production servers:

**File: `config/demoInstance.json`**
```json
{
  "name": "production",
  "host": "<skyspark-host>",
  "port": 80,
  "protocol": "http",
  "username": "<username>",
  "password": "********",
  "projects": [...]
}
```

**File: `config/skytwo.json`**
```json
{
  "name": "production2",
  "host": "<skyspark-host>",
  "port": 80,
  "protocol": "http",
  "username": "admin",
  "password": "********",
  "projects": [...]
}
```

### Example 2: Environment-Based Naming
You can organize by environment:

**File: `config/development.json`**
```json
{
  "name": "dev",
  "host": "dev-server.local",
  ...
}
```

**File: `config/staging.json`**
```json
{
  "name": "staging",
  "host": "staging.example.com",
  ...
}
```

**File: `config/production-us.json`**
```json
{
  "name": "prod-us",
  "host": "us.example.com",
  ...
}
```

**File: `config/production-eu.json`**
```json
{
  "name": "prod-eu",
  "host": "eu.example.com",
  ...
}
```

### Example 3: Client-Based Naming
For multi-tenant scenarios:

```
config/
  ├── client-acme.json       (name: "acme")
  ├── client-globex.json     (name: "globex")
  ├── client-initech.json    (name: "initech")
  └── local-skyspark.json    (name: "local")
```

## Configuration File Behavior

### Loading
When the server starts, it:
1. Scans the `config/` directory for all `*.json` files
2. Excludes backup/archived files (`.backup`, `.archived`, `.old`)
3. Loads each file and maps it by the `"name"` field
4. Tracks the original filename for each instance

### Saving (Auto-Discovery)
When auto-discovery updates an instance:
1. Uses the **original filename** to save updates
2. Preserves the `"name"` field in the JSON
3. Never creates duplicate files

### Example Update Flow
1. **Start**: File `demoInstance.json` contains instance with `"name": "production"`
2. **Load**: System loads it and remembers: `production → demoInstance.json`
3. **Discovery**: Finds 52 projects for instance "production"
4. **Update**: Saves back to `demoInstance.json` (not `production.json`)
5. **Result**: `demoInstance.json` now has all 52 projects ✅

## Switching Between Instances

Use the instance **name** (not filename) when switching:

```typescript
// Switch using the "name" field from the JSON
configManager.switchTo("production", "projectName");
configManager.switchTo("prod-us", "projectName");
configManager.switchTo("acme", "projectName");
```

## Listing All Instances

```bash
# See all loaded instances
jq '{filename: input_filename, name: .name, host: .host, projects: (.projects | length)}' config/*.json
```

## Best Practices

### ✅ DO
- Use descriptive filenames that make sense for your organization
- Keep `"name"` field short and easy to type (you'll use it in commands)
- Use consistent naming patterns across your configs
- Put environment or server info in filename: `demoInstance.json`, `skytwo.json`

### ❌ DON'T
- Don't manually rename files while the server is running
- Don't create multiple files with the same `"name"` field
- Don't use spaces in filenames (use hyphens or underscores)
- Don't include sensitive info in filenames (use generic names)

## Migration Guide

### Moving from `{name}.json` to Custom Names
If you have auto-generated files like `local.json` and `production.json`:

```bash
# Rename to your preferred names
cd config/
mv local.json local-skyspark.json
mv production.json demoInstance.json

# Verify the "name" fields
jq '.name' local-skyspark.json  # Should still show "local"
jq '.name' demoInstance.json          # Should still show "production"
```

The system will automatically track the new filenames on next load.

## Credential Management

Credentials can be at two levels:

### Instance-Level (Shared)
```json
{
  "name": "production",
  "username": "<username>",
  "password": "********",
  "projects": [
    {"name": "project1"},  // Inherits instance credentials
    {"name": "project2"}   // Inherits instance credentials
  ]
}
```

### Project-Level (Override)
```json
{
  "name": "production",
  "username": "<username>",
  "password": "********",
  "projects": [
    {
      "name": "secure-project",
      "username": "admin",
      "password": "********"  // Overrides instance credentials
    }
  ]
}
```

## Auto-Discovery Behavior

When `SKYSPARK_AUTO_DISCOVER=true`:
1. Discovers all projects from each instance
2. **Preserves** existing project configurations (credentials, descriptions)
3. **Adds** new projects with inherited instance-level credentials
4. **Saves** back to the original filename
5. **Never** loses your custom naming

## Troubleshooting

### Issue: Files being created with wrong names
**Cause**: Old version before the filename tracking fix  
**Solution**: Update to latest version, manually rename files to desired names

### Issue: Duplicate instances showing up
**Cause**: Multiple files with the same `"name"` field  
**Solution**: Check all JSON files, ensure unique `"name"` values

### Issue: Can't find instance after renaming file
**Cause**: Renamed file while server was running  
**Solution**: Restart the server to reload configurations

## Summary

You have complete flexibility in naming your instance config files. The system will:
- ✅ Preserve your chosen filenames
- ✅ Track the mapping between filenames and instance names
- ✅ Update the correct file during auto-discovery
- ✅ Never create unwanted duplicate files

Name your files whatever makes sense for your organization! 🎉
