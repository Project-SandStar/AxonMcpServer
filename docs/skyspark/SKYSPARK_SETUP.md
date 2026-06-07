# SkySpark Local Setup Guide

## ✅ Your SkySpark Configuration

Your local SkySpark instance is running at:
- **Location**: `/Users/<user>/skyspark/skyspark-3.1.8`
- **URL**: http://localhost:8080
- **Default credentials**: su/su

## 🚀 Quick Start

```bash
# 1. Install dependencies (if not already done)
npm install haystack-core axios dotenv yaml

# 2. Test SkySpark connection and list projects
npx ts-node test-skyspark-projects.ts

# 3. Test haystack-core integration
npx ts-node test-connection.ts
```

## 📁 Configuration Files

1. **`.env.skyspark`** - SkySpark-specific settings
2. **`.env`** - Combined configuration (created from .env.skyspark)

## 🏗️ Available Projects

Your SkySpark has these projects:
- `demo` (default)
- `cityFurnitureCustomerTraffic`
- `eacDemoV4`
- `hybDemo`
- `mobilytik`
- `reFuelMarket`
- `test`

To use a different project, edit `.env` and change:
```
SKYSPARK_PROJECT=eacDemoV4
```

## 🔧 Starting/Stopping SkySpark

```bash
# Start SkySpark
cd /Users/<user>/skyspark/skyspark-3.1.8/bin
./skyspark

# Stop SkySpark
# Press Ctrl+C in the terminal where it's running
```

## 🧪 Testing Your Setup

Run these commands to verify everything works:

```bash
# Test 1: Check projects and authentication
npx ts-node test-skyspark-projects.ts

# Test 2: Test haystack-core integration
npx ts-node test-connection.ts

# Test 3: Direct API test
curl -u su:su http://localhost:8080/api/demo/about
```

## 🎯 Next Steps

1. **Choose a project** - Update `SKYSPARK_PROJECT` in `.env`
2. **Verify credentials** - Update username/password if needed
3. **Start developing** - Follow tasks in `IMPLEMENTATION_TASKS.md`

## 📝 Troubleshooting

### Authentication Failed
- Default credentials are `su/su`
- Check if you have custom credentials set
- Try accessing http://localhost:8080 in browser

### Project Not Found
- Ensure project name matches exactly (case-sensitive)
- Try `demo` project first

### Connection Refused
- Make sure SkySpark is running
- Check port 8080 is not blocked
- Verify no other service is using port 8080

## 🔗 Useful Links

- SkySpark UI: http://localhost:8080
- API endpoint: http://localhost:8080/api/{project}/
- Eval endpoint: http://localhost:8080/api/{project}/eval