# Default Project Name for Discovery

## Overview

The `defaultProjName` configuration option allows you to specify which project should be used when connecting to a SkySpark instance for project discovery. This is useful when you want to avoid listing remote/inaccessible projects or when you need admin-level access for full project discovery.

## Problem

When discovering projects from a SkySpark instance, the system needs to connect to the instance using **some** project. Previously, it would:
1. Use the first project in the config list, OR
2. Default to `"demo"` if no projects exist

This could cause issues:
- The first project might not have proper access rights
- The first project might be a remote/routed project that's slow or unreachable
- You might want to use a specific "admin" project for discovery

## Solution

Add an optional `defaultProjName` field to your instance configuration:

```json
{
  "name": "demoInstance",
  "host": "<skyspark-host>",
  "port": 80,
  "protocol": "http",
  "username": "<username>",
  "password": "<password>",
  "defaultProjName": "demo",
  "projects": [
    {
      "name": "demo",
      "description": "Admin project for discovery"
    },
    {
      "name": "demoProject",
      "description": "Production project"
    },
    ...
  ]
}
```

## Configuration

### TypeScript Interface

```typescript
export interface SkySparkInstance {
  name: string;
  host: string;
  port: number;
  protocol: 'http' | 'https';
  username?: string;
  password?: string;
  defaultProjName?: string;  // ← NEW: Optional discovery project
  projects: SkySparkProject[];
}
```

### Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `defaultProjName` | `string` | No | First project or `"demo"` | Project to use for discovery connections |

## Behavior

### Priority Order

When connecting for discovery, the system uses this priority:

1. **`defaultProjName`** (if specified)
2. First project in `projects` array
3. `"demo"` (fallback)

### Example Scenarios

#### Scenario 1: Using Admin Project

```json
{
  "name": "production",
  "host": "skyspark.company.com",
  "defaultProjName": "admin",
  "projects": [
    {"name": "project1"},
    {"name": "project2"},
    {"name": "admin"}
  ]
}
```

**Result:** Always connects via `"admin"` project for discovery, even though it's not first in the list.

#### Scenario 2: Avoiding Remote Projects

```json
{
  "name": "demoInstance",
  "defaultProjName": "demo",
  "projects": [
    {"name": "remoteProject1"},
    {"name": "remoteProject2"},
    {"name": "demo"}
  ]
}
```

**Result:** Uses local `"demo"` project instead of slow remote projects.

#### Scenario 3: No defaultProjName (Legacy Behavior)

```json
{
  "name": "oldInstance",
  "projects": [
    {"name": "firstProject"},
    {"name": "secondProject"}
  ]
}
```

**Result:** Uses `"firstProject"` for discovery (backward compatible).

## Usage

### During Auto-Discovery

When `SKYSPARK_AUTO_DISCOVER=true` is set:

```bash
node dist/index.js
```

**Output with `defaultProjName`:**
```
🔍 Discovering projects for instance: demoInstance...
  🎯 Using discovery project: demo
  ✅ Discovered 52 projects
```

**Output without `defaultProjName`:**
```
🔍 Discovering projects for instance: demoInstance...
  ✅ Discovered 52 projects
```

### Via MCP Tool

```typescript
// Call discoverInstanceProjects tool
{
  "instanceName": "demoInstance",
  "updateConfig": true,
  "buildIndex": false
}
```

The tool will automatically use `defaultProjName` if specified.

## Best Practices

### 1. Use Admin/Demo Projects

```json
{
  "defaultProjName": "demo"  // Usually has full access
}
```

OR

```json
{
  "defaultProjName": "admin"  // Dedicated admin project
}
```

### 2. Avoid Remote Projects

If your instance has remote/routed projects (via ArcBeam), use a local project for discovery:

```json
{
  "defaultProjName": "local-admin"
}
```

### 3. Match Your Access Level

Use a project where your credentials have `su` or admin access:

```json
{
  "username": "admin",
  "password": "admin-password",
  "defaultProjName": "admin-project"
}
```

## Implementation Details

### Discovery Process

```typescript
// In discoverAndIndexAllProjects()
const discoveryProject = instance.defaultProjName 
  || instance.projects[0]?.name 
  || 'demo';

if (instance.defaultProjName) {
  console.error(`  🎯 Using discovery project: ${instance.defaultProjName}`);
}

const tempClient = new HaystackSkySparkClient({
  host: instance.host,
  port: instance.port,
  protocol: instance.protocol,
  project: discoveryProject,  // ← Uses defaultProjName!
  username: credentials.username,
  password: credentials.password
});

// Now discover all projects via this connection
const projects = await tempClient.getAvailableProjects();
```

### Credentials

The `defaultProjName` project doesn't need separate credentials. It will use:

1. **Instance-level credentials** (if specified)
2. **First project credentials** (fallback)
3. **Default `su`/`su`** (last resort)

## Migration Guide

### Before (Old Config)

```json
{
  "name": "demoInstance",
  "host": "<skyspark-host>",
  "port": 80,
  "protocol": "http",
  "username": "<username>",
  "password": "secret",
  "projects": [
    {"name": "aero247"},
    {"name": "demo"},
    {"name": "demoProject"}
  ]
}
```

**Problem:** Discovery always uses `"aero247"` (first project), which might not have full access.

### After (New Config)

```json
{
  "name": "demoInstance",
  "host": "<skyspark-host>",
  "port": 80,
  "protocol": "http",
  "username": "<username>",
  "password": "secret",
  "defaultProjName": "demo",  // ← Add this!
  "projects": [
    {"name": "aero247"},
    {"name": "demo"},
    {"name": "demoProject"}
  ]
}
```

**Result:** Discovery uses `"demo"` which has full access to list all 52 projects!

## Troubleshooting

### Issue: Only discovering 1 project instead of all

**Symptom:**
```
🔍 Discovering projects for instance: demoInstance...
  ✅ Discovered 1 projects
```

**Cause:** Using a project with limited access.

**Solution:** Add `defaultProjName` pointing to an admin/demo project:

```json
{
  "defaultProjName": "demo"
}
```

### Issue: Discovery failing with "unauthorized"

**Symptom:**
```
❌ Error: Unauthorized
```

**Cause:** Credentials don't have access to the `defaultProjName` project.

**Solution:** Either:
1. Use a project your credentials can access
2. Update instance-level credentials
3. Add project-specific credentials for the discovery project

### Issue: Slow discovery

**Symptom:** Discovery takes minutes instead of seconds.

**Cause:** Using a remote/routed project.

**Solution:** Use a local project:

```json
{
  "defaultProjName": "local-project"
}
```

## Examples

### Example 1: DemoInstance Production Setup

```json
{
  "name": "demoInstance",
  "host": "<skyspark-host>",
  "port": 80,
  "protocol": "http",
  "username": "<username>",
  "password": "<password>",
  "defaultProjName": "demo",
  "projects": [
    {"name": "demo", "description": "Admin/discovery project"},
    {"name": "demoProject", "description": "Production - Dubai Police"},
    {"name": "aero247", "description": "Production - Aero247"},
    ... (49 more projects)
  ]
}
```

### Example 2: Development Setup

```json
{
  "name": "local",
  "host": "localhost",
  "port": 8080,
  "protocol": "http",
  "username": "su",
  "password": "su",
  "defaultProjName": "test",
  "projects": [
    {"name": "test", "description": "Test/dev project"},
    {"name": "mobilytik", "description": "Dev project"},
    {"name": "eacDemoV4", "description": "Demo project"}
  ]
}
```

### Example 3: Mixed Environment

```json
{
  "name": "mixed",
  "host": "skyspark.company.com",
  "port": 443,
  "protocol": "https",
  "username": "admin",
  "password": "admin-pass",
  "defaultProjName": "admin",
  "projects": [
    {"name": "remote-site-1", "description": "Remote via ArcBeam"},
    {"name": "remote-site-2", "description": "Remote via ArcBeam"},
    {"name": "admin", "description": "Local admin project"}
  ]
}
```

## Summary

The `defaultProjName` option gives you fine-grained control over which project is used for discovery, allowing you to:

✅ **Avoid slow remote projects**  
✅ **Use admin/privileged projects for full discovery**  
✅ **Work around access restrictions**  
✅ **Maintain backward compatibility** (optional parameter)  

**Recommendation:** Always set `defaultProjName` to your instance's admin or demo project for best results!
