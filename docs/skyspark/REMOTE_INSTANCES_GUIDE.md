# Remote Instances Setup Guide

**Date:** September 30, 2025  
**Status:** Complete Guide ✅

---

## Table of Contents
1. [Instance-Level Credentials](#instance-level-credentials)
2. [Auto-Discovering Projects](#auto-discovering-projects)
3. [Manual Configuration](#manual-configuration)
4. [Permission Requirements](#permission-requirements)
5. [Examples](#examples)

---

## Instance-Level Credentials

### New Feature: Centralized Credentials ✨

Instead of repeating username/password for every project, you can now define them once at the instance level!

### Old Way (Repetitive) ❌
```json
{
  "name": "production",
  "host": "<skyspark-host>",
  "port": 80,
  "protocol": "http",
  "projects": [
    {
      "name": "demoProject",
      "username": "<username>",
      "password": "<password>",
      "description": "Project 1"
    },
    {
      "name": "buildingA",
      "username": "<username>",
      "password": "<password>",
      "description": "Project 2"
    }
  ]
}
```

### New Way (Centralized) ✅
```json
{
  "name": "production",
  "host": "<skyspark-host>",
  "port": 80,
  "protocol": "http",
  "username": "<username>",
  "password": "<password>",
  "projects": [
    {
      "name": "demoProject",
      "description": "Dubai Police Department"
    },
    {
      "name": "buildingA",
      "description": "Building A Management"
    },
    {
      "name": "specialProject",
      "username": "specialUser",
      "password": "specialPassword",
      "description": "Project with different credentials"
    }
  ]
}
```

**Benefits:**
- ✅ Write credentials once
- ✅ All projects use instance credentials by default
- ✅ Override per-project when needed
- ✅ Less error-prone
- ✅ Easier to update credentials

---

## Auto-Discovering Projects

### New MCP Tool: `discoverInstanceProjects` 🔍

Automatically discover all projects from a SkySpark instance and update your config file!

### How It Works

1. **Connect to instance with credentials**
2. **Query SkySpark for all projects** (requires admin/su access)
3. **Update config file** (optional)

### Usage

#### Step 1: Create Minimal Instance Config

```json
{
  "name": "production",
  "host": "<skyspark-host>",
  "port": 80,
  "protocol": "http",
  "username": "<username>",
  "password": "<password>",
  "projects": [
    {
      "name": "demoProject",
      "description": "Initial project for discovery"
    }
  ]
}
```

**Save as:** `config/demoInstance.json`

#### Step 2: Discover Projects (Preview)

```bash
# In Claude Desktop or MCP client
"Discover all projects from the production instance"
```

**Tool:** `discoverInstanceProjects`  
**Args:** `{ instanceName: "production", updateConfig: false }`

**Response:**
```json
{
  "success": true,
  "instance": "production",
  "discovered": 15,
  "projects": [
    { "name": "demoProject", "description": "Auto-discovered from production" },
    { "name": "buildingA", "description": "Auto-discovered from production" },
    { "name": "buildingB", "description": "Auto-discovered from production" },
    { "name": "energyProject", "description": "Auto-discovered from production" },
    ...
  ],
  "updated": false,
  "message": "Found 15 projects (not saved yet)",
  "hint": "Set updateConfig=true to save these projects to the config file"
}
```

#### Step 3: Update Config File

```bash
"Update the production instance config with discovered projects"
```

**Tool:** `discoverInstanceProjects`  
**Args:** `{ instanceName: "production", updateConfig: true }`

**Response:**
```json
{
  "success": true,
  "instance": "production",
  "discovered": 15,
  "projects": [...],
  "updated": true,
  "message": "Config file updated with 15 projects",
  "hint": "You can now switch to any of these projects"
}
```

**Result:** `config/demoInstance.json` is automatically updated!

---

## Manual Configuration

### Adding a Remote Instance

**File:** `config/{instance-name}.json`

```json
{
  "name": "production",
  "host": "skyspark.company.com",
  "port": 443,
  "protocol": "https",
  "username": "your-username",
  "password": "your-password",
  "projects": [
    {
      "name": "project1",
      "description": "First project"
    },
    {
      "name": "project2",
      "description": "Second project"
    }
  ]
}
```

### Configuration Fields

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| `name` | ✅ | Instance identifier | `"production"` |
| `host` | ✅ | Hostname or IP | `"<skyspark-host>"` |
| `port` | ✅ | Port number | `80` or `443` |
| `protocol` | ✅ | HTTP or HTTPS | `"http"` or `"https"` |
| `username` | ⚠️ | Instance-level username | `"<username>"` |
| `password` | ⚠️ | Instance-level password | `"secure_pass"` |
| `projects` | ✅ | Array of projects | `[...]` |

**Project Fields:**

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| `name` | ✅ | Project name | `"demoProject"` |
| `description` | ❌ | Project description | `"Dubai Police"` |
| `username` | ❌ | Override instance username | `"projectUser"` |
| `password` | ❌ | Override instance password | `"projectPass"` |

---

## Permission Requirements

### Admin/SU Access for Discovery

To use `discoverInstanceProjects`, you need:

✅ **Admin or "su" user access**  
✅ **Permission to read `proj` records**  
✅ **Network access to the instance**

### What If I Don't Have Admin Access?

**Option 1: Manual Configuration**
- Get list of projects from your admin
- Manually add them to config file

**Option 2: Limited Discovery**
- Discovery will return projects you have access to
- May not see all projects on the instance

**Option 3: Per-Project Credentials**
- Add projects individually with their own credentials

---

## Examples

### Example 1: Production Instance with Auto-Discovery

```bash
# 1. Create minimal config
cat > config/production.json << 'EOF'
{
  "name": "production",
  "host": "skyspark.company.com",
  "port": 443,
  "protocol": "https",
  "username": "admin",
  "password": "secure_password",
  "projects": [
    {
      "name": "demo",
      "description": "Demo project for discovery"
    }
  ]
}
EOF

# 2. Start server
npm start

# 3. In Claude Desktop:
"Discover all projects from production instance and update the config"
# Tool: discoverInstanceProjects
# Args: { instanceName: "production", updateConfig: true }

# 4. Result: config/production.json now has all projects!
```

### Example 2: Multiple Instances

```bash
# Local development
cat > config/local.json << 'EOF'
{
  "name": "local",
  "host": "localhost",
  "port": 8080,
  "protocol": "http",
  "username": "su",
  "password": "su",
  "projects": [...]
}
EOF

# Production
cat > config/production.json << 'EOF'
{
  "name": "production",
  "host": "<skyspark-host>",
  "port": 80,
  "protocol": "http",
  "username": "<username>",
  "password": "secret",
  "projects": [...]
}
EOF

# Staging
cat > config/staging.json << 'EOF'
{
  "name": "staging",
  "host": "staging.company.com",
  "port": 443,
  "protocol": "https",
  "username": "tester",
  "password": "test_pass",
  "projects": [...]
}
EOF
```

### Example 3: Mixed Credentials

```json
{
  "name": "production",
  "host": "<skyspark-host>",
  "port": 80,
  "protocol": "http",
  "username": "default_user",
  "password": "default_pass",
  "projects": [
    {
      "name": "publicProject",
      "description": "Uses instance credentials"
    },
    {
      "name": "privateProject",
      "username": "private_user",
      "password": "private_pass",
      "description": "Uses project-specific credentials"
    },
    {
      "name": "teamProject",
      "description": "Also uses instance credentials"
    }
  ]
}
```

---

## Workflow

### Complete Setup Workflow

```
1. Create Instance Config
   ↓
2. Add instance-level credentials
   ↓
3. Add one initial project (for discovery)
   ↓
4. Save as config/{instance-name}.json
   ↓
5. Start MCP server
   ↓
6. Use discoverInstanceProjects (preview)
   ↓
7. Review discovered projects
   ↓
8. Use discoverInstanceProjects (updateConfig=true)
   ↓
9. Config file auto-updated!
   ↓
10. Switch to any project and start working
```

---

## Security Best Practices

### 1. File Permissions
```bash
# Restrict access to config files
chmod 600 config/*.json

# Only you can read/write
ls -la config/
# -rw------- 1 user user 1234 config/production.json
```

### 2. Environment Variables
```bash
# Store sensitive credentials in environment
export SKYSPARK_PROD_PASSWORD=$(security find-generic-password -s skyspark-prod -w)

# Reference in code (future enhancement)
```

### 3. Encrypted Configs
```bash
# Encrypt config files at rest
gpg --encrypt config/production.json

# Decrypt when needed
gpg --decrypt config/production.json.gpg > config/production.json
```

### 4. Git Ignore
```bash
# Add to .gitignore
echo "config/*.json" >> .gitignore
echo "!config/*.example.json" >> .gitignore

# Only example files are committed
git add config/*.example.json
```

---

## Troubleshooting

### Problem: "No projects discovered"

**Possible Causes:**
1. User doesn't have admin/su access
2. Instance is unreachable
3. Incorrect credentials

**Solutions:**
```bash
# Test connection
curl -u username:password http://<skyspark-host>/api/demoProject/about

# Check user permissions in SkySpark
# Navigate to: Admin > Users > Check "su" role

# Manually add projects if auto-discovery fails
```

### Problem: "Project not found after discovery"

**Solution:**
```bash
# Restart server to reload configs
npm start

# Or use listSkySparkProjects to verify
```

### Problem: "Authentication failed"

**Solution:**
```bash
# Verify credentials
# Check if password has special characters that need escaping in JSON

# Test with basic project first
{
  "name": "test",
  "host": "<skyspark-host>",
  "port": 80,
  "protocol": "http",
  "username": "su",
  "password": "su",
  "projects": [{"name": "demo"}]
}
```

---

## MCP Tools Summary

| Tool | Purpose | Auto-Discovery |
|------|---------|----------------|
| `listSkySparkProjects` | List configured projects | ❌ |
| `discoverInstanceProjects` | **Discover & update projects** | ✅ |
| `switchSkySparkProject` | Switch to project | ❌ |
| `discoverProjectFunctions` | Find project functions | ❌ |
| `getProjectSchema` | Get project schema | ❌ |

---

## Quick Start Commands

```bash
# 1. Create your instance config
cp config/demoInstance-improved.json.example config/myinstance.json
nano config/myinstance.json  # Edit with your details

# 2. Start server
npm start

# 3. In Claude Desktop or MCP client:
"List available SkySpark instances"
"Discover projects from myinstance"
"Update myinstance config with discovered projects"
"Switch to myinstance/projectname"
"What functions exist in this project?"
```

---

## Next Steps

After setting up remote instances:

1. ✅ Configure instance with credentials
2. ✅ Discover projects (auto or manual)
3. ✅ Switch between projects
4. ✅ Discover project functions
5. ✅ Get project schema
6. ✅ Generate project-specific code
7. ✅ Execute Axon code
8. ✅ Query project data

---

**Last Updated:** September 30, 2025  
**Total MCP Tools:** 21 (added `discoverInstanceProjects`)  
**Status:** Production Ready ✅