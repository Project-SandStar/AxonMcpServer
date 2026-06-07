# Multi-Project SkySpark Setup

## 🎯 Overview

The system is now configured to work with multiple SkySpark instances and projects. You can easily switch between different projects while developing.

## 📁 Configuration Structure

```
axon-mcp-server/
├── config/
│   ├── local-skyspark.json      # Your local SkySpark instance
│   └── remote-skyspark.example.json  # Template for remote instances
├── .env.skyspark               # Default configuration (mobilytik)
└── src/
    ├── config/
    │   └── skysparkConfig.ts   # Configuration manager
    └── skyspark/
        └── haystackClient.ts   # Enhanced client with multi-project support
```

## 🚀 Quick Start

### Test Current Setup (Mobilytik)
```bash
npx ts-node test-connection.ts
```

### Test Multi-Project Switching
```bash
npx ts-node test-multi-project.ts
```

### Export Functions from a Project
```bash
# Export mobilytik functions
npx ts-node test-multi-project.ts --export mobilytik

# Export from another project
npx ts-node test-multi-project.ts --export eacDemoV4
```

## 🔧 Configuration

### Current Default
- **Instance**: local (localhost:8080)
- **Project**: mobilytik
- **Credentials**: su/su

### Available Projects
1. **mobilytik** - Primary development project
2. **cityFurnitureCustomerTraffic** - Customer traffic analysis
3. **eacDemoV4** - Energy analytics demo
4. **hybDemo** - Hybrid demo project
5. **reFuelMarket** - ReFuel market project
6. **test** - Test project
7. **demo** - Demo project

## 💡 Key Features

### 1. Easy Project Switching
```typescript
// In your code
client.switchTo('local', 'eacDemoV4');
// Now all operations work on eacDemoV4
```

### 2. Project Function Discovery
```typescript
const functions = await client.getProjectFunctions();
const schema = await client.getProjectSchema();
const types = await client.getRecordTypes();
```

### 3. Function Source Reading
```typescript
const source = await client.getFunctionSource('myFunction');
```

### 4. Multi-Instance Support
Add new instances by creating JSON files in the `config/` directory:
```json
{
  "name": "cloud",
  "host": "skyspark.cloud.com",
  "port": 443,
  "protocol": "https",
  "projects": [
    {
      "name": "project1",
      "username": "api_user",
      "password": "password",
      "description": "Cloud Project 1"
    }
  ]
}
```

## 🔄 Workflow Examples

### 1. Analyze Project Schema
```typescript
// Get all tags used in mobilytik
const tags = await client.getProjectSchema();
console.log(`Found ${tags.size} unique tags`);
```

### 2. Export All Functions
```bash
# Export functions from all projects
for project in mobilytik eacDemoV4 hybDemo; do
  npx ts-node test-multi-project.ts --export $project
done
```

### 3. Compare Projects
```typescript
// Compare function counts across projects
for (const proj of ['mobilytik', 'eacDemoV4', 'hybDemo']) {
  client.switchTo('local', proj);
  const funcs = await client.getProjectFunctions();
  console.log(`${proj}: ${funcs.size} functions`);
}
```

## 🛠️ Development Tips

1. **Primary Development**: Keep mobilytik as your primary project
2. **Schema Learning**: Export schemas from different projects to understand patterns
3. **Function Libraries**: Build your template library from exported functions
4. **Testing**: Use different projects for testing various scenarios

## 📊 Next Steps

1. Export functions from mobilytik: `npx ts-node test-multi-project.ts --export mobilytik`
2. Analyze the schema to understand your data model
3. Start building templates based on your actual functions
4. Use the multi-project support to validate templates across different projects

## 🔐 Security Note

- Credentials are stored in config files
- For production, consider using environment variables or secrets management
- Add `config/*.json` to `.gitignore` (except examples)