# Adding New SkySpark Instances - Quick Guide

## Where to Add SkySpark Instances

### ✨ Option 1: Sidebar (Recommended - Easiest!)

1. **Open the Axon Sidebar**
   - Click the ✨ **sparkle icon** in the left activity bar
   - (It's in the same bar as File Explorer, Search, etc.)

2. **Click "Add/Edit SkySpark Servers"**
   - Look under the "⚙️ Configuration" section
   - It's the first button (highlighted)
   - Icon: 🏗️

3. **Configuration Editor Opens**
   - Left side shows all your current instances
   - Right side is the editor

4. **Click "+ New Config"**
   - Button at the bottom of the left sidebar
   - A form will appear asking for a name

5. **Enter Instance Name**
   - Examples:
     - `production-server`
     - `staging-skyspark`
     - `client-abc-server`
   - This creates `<name>.json` in the config folder

6. **Fill in Details**
   ```
   Configuration Name: production-server
   Protocol: https
   Host: prod.mycompany.com
   Port: 443
   Username: your-username
   Password: your-password
   ```

7. **Add Projects (Optional)**
   - Click "+ Add Project"
   - Enter project name
   - Add project-specific credentials if different

8. **Click Save**
   - Done! Your new instance is ready to use

### Option 2: Command Palette

```
⌘+Shift+P → "Axon: Open Configuration Editor"
```

Then follow steps 4-8 above.

### Option 3: Direct File Creation

Create a new JSON file in `~/Code/axon-mcp-server/config/`:

```json
{
  "name": "my-instance",
  "host": "skyspark.example.com",
  "port": 8080,
  "protocol": "http",
  "username": "admin",
  "password": "password123",
  "projects": []
}
```

## Understanding Multiple Instances

### One File = One Instance

```
config/
├── local-skyspark.json      → Local development instance
├── production.json          → Production instance
├── staging.json             → Staging instance
├── client-a.json            → Client A's instance
└── client-b.json            → Client B's instance
```

### Each Instance Can Have Multiple Projects

```json
{
  "name": "production",
  "host": "prod.example.com",
  "projects": [
    { "name": "building-a" },
    { "name": "building-b" },
    { "name": "building-c" }
  ]
}
```

## Example Configurations

### Local Development Instance

```json
{
  "name": "local",
  "host": "localhost",
  "port": 8080,
  "protocol": "http",
  "username": "su",
  "password": "su",
  "defaultProjName": "demo",
  "projects": [
    {
      "name": "demo",
      "description": "Local development project"
    }
  ]
}
```

### Remote Production Instance

```json
{
  "name": "production",
  "host": "skyspark.company.com",
  "port": 443,
  "protocol": "https",
  "username": "api-user",
  "password": "secure-password",
  "projects": [
    {
      "name": "main",
      "description": "Main production database"
    },
    {
      "name": "analytics",
      "username": "analyst",
      "password": "analyst-password",
      "description": "Analytics project with custom credentials"
    }
  ]
}
```

### Cloud SkySpark Instance

```json
{
  "name": "cloud-skyspark",
  "host": "customer123.skyspark.io",
  "port": 443,
  "protocol": "https",
  "username": "integration",
  "password": "api-token-here",
  "projects": [
    {
      "name": "site-1",
      "description": "Customer site 1"
    },
    {
      "name": "site-2",
      "description": "Customer site 2"
    }
  ]
}
```

## Workflow: Adding a New Client

Let's say you need to add a new client's SkySpark instance:

### Step-by-Step

1. **Open Sidebar**
   - Click ✨ sparkle icon

2. **Open Config Editor**
   - Click "Add/Edit SkySpark Servers"

3. **Create New Config**
   - Click "+ New Config"
   - Name: `client-acme`

4. **Fill in Client Details**
   ```
   Name: client-acme
   Host: skyspark.acme.com
   Port: 443
   Protocol: https
   Username: integration-user
   Password: [from client]
   ```

5. **Add Their Projects**
   - Click "+ Add Project"
   - Add each building/site as a project
   - Examples:
     - `headquarters`
     - `warehouse-east`
     - `warehouse-west`

6. **Save**
   - File created: `config/client-acme.json`

7. **Use It**
   - MCP server will automatically detect it
   - Available for code generation
   - Available for data queries

## Managing Multiple Instances

### Switching Between Instances

The MCP server loads ALL instances from the config folder automatically. When you:
- Generate code
- Search examples
- Query data

The system knows about all your instances!

### Viewing All Instances

```bash
# List all your instances
ls ~/Code/axon-mcp-server/config/*.json

# Should show:
# local-skyspark.json
# production.json
# client-a.json
# client-b.json
```

### Editing Existing Instances

1. Open Config Editor (sidebar or command palette)
2. Click the instance name in the left sidebar
3. Edit fields
4. Click Save
5. Backup automatically created (`.backup` file)

### Deleting Instances

1. Open Config Editor
2. Select the instance
3. Click "Delete" button
4. Confirm deletion
5. File is removed

## Settings vs Config Files

### VSCode Settings (Single Instance)

```json
{
  "axon.skyspark.host": "localhost",
  "axon.skyspark.project": "demo"
}
```

**Used for:** Quick single-instance setup

### Config Files (Multiple Instances)

```
config/
├── instance-1.json
├── instance-2.json
└── instance-3.json
```

**Used for:** Professional multi-instance setups

**Recommended:** Use config files! They're more powerful.

## Tips & Tricks

### 1. Descriptive Names
```
✅ Good: client-energycorp-production
❌ Bad: server1
```

### 2. One File Per Instance
Don't combine multiple servers in one file!

```
✅ Good:
   - local.json
   - staging.json
   - prod.json

❌ Bad:
   - all-servers.json (with multiple instances)
```

### 3. Use Project Descriptions
```json
{
  "name": "main-office",
  "description": "Main office HVAC system - 3 floors"
}
```

### 4. Backup Before Changes
The editor does this automatically, but you can also:
```bash
cp config/production.json config/production.json.manual-backup
```

### 5. Version Control
Add to `.gitignore`:
```
config/*.json
config/*.backup
```

But keep a template:
```
config/template.json
```

## Troubleshooting

### Config Editor Button Not Visible
1. Make sure extension is installed
2. Click ✨ sparkle icon in activity bar
3. Look under "⚙️ Configuration" section

### Can't Create New Config
1. Check that `~/Code/axon-mcp-server/config/` directory exists
2. Check write permissions
3. Try manually creating a JSON file

### Instance Not Showing Up
1. Make sure file is in `config/` directory
2. File must end with `.json`
3. Must be valid JSON structure
4. Reload VSCode: `⌘+Shift+P` → "Developer: Reload Window"

### Multiple Projects Not Working
Each project is a separate object in the `projects` array:
```json
"projects": [
  { "name": "project1" },
  { "name": "project2" },
  { "name": "project3" }
]
```

## Related Documentation

- [Config Editor Guide](./CONFIG_EDITOR.md) - Complete documentation
- [Quick Reference](./QUICK_REFERENCE.md) - All commands
- [Sidebar Guide](./SIDEBAR_GUIDE.md) - Using the sidebar

## Video Tutorial (Text)

```
1. Click ✨ in activity bar
   ↓
2. Click "Add/Edit SkySpark Servers"
   ↓
3. Click "+ New Config"
   ↓
4. Type name: "my-server"
   ↓
5. Fill in host, port, credentials
   ↓
6. Click "Save"
   ↓
7. Done! New instance ready.
```

---

**Adding SkySpark instances is now as easy as clicking a button!** 🚀
