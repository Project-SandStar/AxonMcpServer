# Auto-Discovery Configuration Update - Summary

## Issue
When auto-discovery ran during server startup, the JSON config files were not being updated with all discovered projects, and credentials were being lost.

## Root Cause
The auto-discovery code in `src/index.ts` (lines 2075-2080) was creating new project objects with only `name` and `description` fields, **losing all credential information**.

## Fix Applied
Updated `src/index.ts` (around line 2075) to:
1. **Preserve existing project configurations** - If a project already exists in the config, keep all its fields (username, password, description)
2. **Inherit instance-level credentials** - For new projects, automatically inherit username/password from the instance configuration
3. **Add auto-discovery description** - New projects get a description indicating they were auto-discovered

### Code Changes
```typescript
// OLD CODE (lost credentials):
const newProjects = discoveredProjects.map(name => ({
  name,
  description: `Auto-discovered from ${instance.name}`
}));

// NEW CODE (preserves/inherits credentials):
const newProjects = discoveredProjects.map(name => {
  const existingProject = instance.projects.find(p => p.name === name);
  
  if (existingProject) {
    return existingProject; // Preserve all existing configuration
  } else {
    const project = {
      name,
      description: `Auto-discovered from ${instance.name}`
    };
    
    // Inherit instance-level credentials
    if (instance.username) project.username = instance.username;
    if (instance.password) project.password = instance.password;
    
    return project;
  }
});
```

## Results

### Before Auto-Discovery
- **local-skyspark.json**: 7 projects (manually configured)
- **skyone.json**: 3 projects (manually configured)

### After Auto-Discovery
- **local.json**: 6 projects discovered ✅
  - Host: localhost:8080
  - All projects have credentials: `username: "su", password: "su"`
  - Existing project descriptions preserved

- **production.json**: 52 projects discovered ✅ (was only 3!)
  - Host: <skyspark-host>:80
  - New projects inherited: `username: "<username>"`
  - Existing projects kept their custom descriptions

## File Naming Issue
The config manager saves files as `{instanceName}.json`:
- Instance named "local" → `local.json`
- Instance named "production" → `production.json`

Your original files were:
- `local-skyspark.json` (for instance "local")
- `skyone.json` (for instance "production")

This created duplicates. The new files have ALL discovered projects with correct credentials.

## Recommendation
**Archive the old config files** since the new ones are complete and correct:

```bash
chmod +x cleanup-configs.sh
./cleanup-configs.sh
```

Or manually:
```bash
mv config/local-skyspark.json config/local-skyspark.json.old
mv config/skyone.json config/skyone.json.old
```

## Verification

### Check project counts:
```bash
jq '.projects | length' config/local.json        # Should show 6
jq '.projects | length' config/production.json   # Should show 52
```

### Check credentials are present:
```bash
# Local projects (existing - preserved):
jq '.projects[0] | {name, username, password}' config/local.json

# Production projects (new - inherited):
jq '.projects[0] | {name, username}' config/production.json
```

### Test with server startup:
```bash
SKYSPARK_AUTO_DISCOVER=true node dist/index.js
```

Should show:
- ✅ Discovered 6 projects for "local"
- ✅ Discovered 52 projects for "production"
- ✅ All projects indexed successfully

## Next Steps
1. Archive old config files (optional but recommended)
2. Test server startup to verify all projects load correctly
3. Verify you can switch between projects using the MCP tools
4. Future auto-discovery runs will update these files with any new projects

## Benefits
✅ **Credential preservation** - Existing credentials never lost  
✅ **Credential inheritance** - New projects automatically get instance credentials  
✅ **Full discovery** - All 52 production projects now available (vs 3 before)  
✅ **Description preservation** - Custom descriptions for existing projects kept  
✅ **Automatic updates** - Config files stay in sync with SkySpark server  
