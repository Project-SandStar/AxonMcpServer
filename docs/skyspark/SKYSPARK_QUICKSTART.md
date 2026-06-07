# SkySpark Integration Quick Start

## Prerequisites

1. **SkySpark Instance**: Access to a SkySpark server (local or remote)
2. **API Access**: Username/password with API permissions
3. **Node.js**: v16+ installed

## Step 1: Test SkySpark API Access

First, verify you can access the SkySpark API:

```bash
# Test basic connectivity (replace with your details)
curl -u "admin:admin" http://localhost:8080/api/demo/about

# Test Axon evaluation
curl -u "admin:admin" \
  -H "Content-Type: text/plain" \
  -d "now()" \
  http://localhost:8080/api/demo/eval
```

## Step 2: Install Dependencies

```bash
cd /Users/<user>/Code/axon-mcp-server
npm install axios dotenv yaml
npm install --save-dev @types/node
```

## Step 3: Create SkySpark Client

Create the basic client implementation:

```typescript
// src/skyspark/client.ts
import axios, { AxiosInstance } from 'axios';

export interface SkySparkConfig {
  host: string;
  port: number;
  project: string;
  username: string;
  password: string;
  protocol?: 'http' | 'https';
}

export class SkySparkClient {
  private api: AxiosInstance;
  
  constructor(private config: SkySparkConfig) {
    const baseURL = `${config.protocol || 'http'}://${config.host}:${config.port}/api/${config.project}`;
    
    this.api = axios.create({
      baseURL,
      auth: {
        username: config.username,
        password: config.password
      },
      headers: {
        'Accept': 'application/json'
      }
    });
  }
  
  async evalAxon(code: string): Promise<any> {
    try {
      const response = await this.api.post('/eval', code, {
        headers: { 'Content-Type': 'text/plain' }
      });
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`SkySpark error: ${error.response.data}`);
      }
      throw error;
    }
  }
  
  async validateAxon(code: string): Promise<{ valid: boolean; error?: string }> {
    try {
      // Try to compile without executing
      await this.evalAxon(`compile(${JSON.stringify(code)})`);
      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: error.message 
      };
    }
  }
}
```

## Step 4: Create Basic Code Generator

```typescript
// src/generation/basicGenerator.ts
export class BasicAxonGenerator {
  private templates = {
    'equipment-query': {
      template: 'readAll({{equipType}}).size',
      params: ['equipType']
    },
    'point-history': {
      template: 'read({{pointId}})->hisRead({{period}})',
      params: ['pointId', 'period']
    },
    'energy-calc': {
      template: `readAll({{meterType}}).map(m => {
        meter: m.dis,
        energy: read(m->energy)->hisRead(kWh, {{period}}).hisRollup(sum, 1mo).first["v0"]
      })`,
      params: ['meterType', 'period']
    }
  };
  
  generate(templateName: string, params: Record<string, string>): string {
    const template = this.templates[templateName];
    if (!template) {
      throw new Error(`Unknown template: ${templateName}`);
    }
    
    let code = template.template;
    for (const [key, value] of Object.entries(params)) {
      code = code.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    
    return code;
  }
  
  listTemplates(): string[] {
    return Object.keys(this.templates);
  }
}
```

## Step 5: Wire Up MCP Tools

Update your MCP server to include the new tools:

```typescript
// src/index.ts (add to existing tools)

// Initialize SkySpark client
const skysparkClient = new SkySparkClient({
  host: process.env.SKYSPARK_HOST || 'localhost',
  port: parseInt(process.env.SKYSPARK_PORT || '8080'),
  project: process.env.SKYSPARK_PROJECT || 'demo',
  username: process.env.SKYSPARK_USERNAME || 'admin',
  password: process.env.SKYSPARK_PASSWORD || 'admin'
});

const generator = new BasicAxonGenerator();

// Add new tools
{
  name: 'generateAxonCode',
  description: 'Generate Axon code from templates',
  inputSchema: {
    type: 'object',
    properties: {
      template: {
        type: 'string',
        description: 'Template name',
        enum: generator.listTemplates()
      },
      params: {
        type: 'object',
        description: 'Template parameters'
      },
      validate: {
        type: 'boolean',
        description: 'Validate with SkySpark',
        default: true
      }
    },
    required: ['template', 'params']
  },
  handler: async ({ template, params, validate }) => {
    // Generate code
    const code = generator.generate(template, params);
    
    // Validate if requested
    let validation = null;
    if (validate) {
      validation = await skysparkClient.validateAxon(code);
    }
    
    return {
      code,
      template,
      params,
      validation
    };
  }
},

{
  name: 'validateAxonCode',
  description: 'Validate Axon code using SkySpark',
  inputSchema: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'Axon code to validate'
      }
    },
    required: ['code']
  },
  handler: async ({ code }) => {
    const validation = await skysparkClient.validateAxon(code);
    
    // Try to execute with limit for preview
    let preview = null;
    if (validation.valid) {
      try {
        const limitedCode = code.includes('readAll') 
          ? code.replace(/readAll\(/g, 'readAll(').replace(/\)(?!.*\))/, ').limit(5)')
          : code;
        preview = await skysparkClient.evalAxon(limitedCode);
      } catch (e) {
        // Preview failed, but validation passed
      }
    }
    
    return {
      ...validation,
      preview
    };
  }
},

{
  name: 'executeAxonCode',
  description: 'Execute Axon code in SkySpark (with safety limits)',
  inputSchema: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'Axon code to execute'
      },
      limit: {
        type: 'number',
        description: 'Limit results',
        default: 10
      }
    },
    required: ['code']
  },
  handler: async ({ code, limit }) => {
    // Add safety limits
    const safeCode = code.includes('readAll') 
      ? code.replace(/readAll\(/g, 'readAll(').replace(/\)(?!.*\))/, `).limit(${limit})`)
      : code;
    
    try {
      const result = await skysparkClient.evalAxon(safeCode);
      return {
        success: true,
        result,
        executedCode: safeCode
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        executedCode: safeCode
      };
    }
  }
}
```

## Step 6: Configure Environment

Create a `.env` file:

```env
# SkySpark Configuration
SKYSPARK_HOST=localhost
SKYSPARK_PORT=8080
SKYSPARK_PROJECT=demo
SKYSPARK_USERNAME=admin
SKYSPARK_PASSWORD=admin
SKYSPARK_PROTOCOL=http

# Your existing config...
AXON_CODE_PATH=/Users/<user>/Code/axon_library_2025/axon-library
```

## Step 7: Test the Integration

Create a test script:

```typescript
// test-skyspark.ts
import { SkySparkClient } from './src/skyspark/client';
import { BasicAxonGenerator } from './src/generation/basicGenerator';
import * as dotenv from 'dotenv';

dotenv.config();

async function test() {
  // Initialize client
  const client = new SkySparkClient({
    host: process.env.SKYSPARK_HOST!,
    port: parseInt(process.env.SKYSPARK_PORT!),
    project: process.env.SKYSPARK_PROJECT!,
    username: process.env.SKYSPARK_USERNAME!,
    password: process.env.SKYSPARK_PASSWORD!
  });
  
  console.log('Testing SkySpark connection...');
  
  // Test 1: Basic evaluation
  console.log('\n1. Basic Eval:');
  const now = await client.evalAxon('now()');
  console.log('Current time:', now);
  
  // Test 2: Validation
  console.log('\n2. Validation:');
  const valid = await client.validateAxon('readAll(site).size');
  console.log('Valid code:', valid);
  
  const invalid = await client.validateAxon('readAll(');
  console.log('Invalid code:', invalid);
  
  // Test 3: Code generation
  console.log('\n3. Code Generation:');
  const generator = new BasicAxonGenerator();
  const code = generator.generate('equipment-query', { equipType: 'ahu' });
  console.log('Generated:', code);
  
  const validation = await client.validateAxon(code);
  console.log('Validation:', validation);
  
  // Test 4: Execute generated code
  if (validation.valid) {
    console.log('\n4. Execution:');
    try {
      const result = await client.evalAxon(code);
      console.log('Result:', result);
    } catch (e) {
      console.log('Execution error:', e.message);
    }
  }
}

test().catch(console.error);
```

Run the test:

```bash
npx ts-node test-skyspark.ts
```

## Next Steps

Once basic integration is working:

1. **Add More Templates**: Expand the template library
2. **Enhance Validation**: Add semantic validation beyond syntax
3. **Implement Caching**: Cache validation results
4. **Add Error Recovery**: Auto-fix common errors
5. **Build Template UI**: Create template builder

## Common Issues

### Authentication Failed
```bash
# Check credentials
curl -u "your-username:your-password" http://your-host:port/api/your-project/about
```

### CORS Issues (Browser)
Add proxy configuration or use server-side requests only.

### Timeout on Large Queries
Always add `.limit()` to `readAll()` queries during development.

### Invalid Project
Ensure the project name in the URL matches exactly (case-sensitive).

## Example Usage in Cline

Once integrated, you can use it like:

```
User: "Generate code to find all AHUs"