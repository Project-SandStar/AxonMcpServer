#!/bin/bash

# Axon MCP Server Setup Script
# This script sets up the initial project structure and dependencies

echo "🚀 Setting up Axon MCP Server with haystack-core..."

# Create directory structure
echo "📁 Creating project directories..."
mkdir -p src/skyspark
mkdir -p src/generation  
mkdir -p src/templates
mkdir -p src/validation
mkdir -p templates/energy
mkdir -p templates/hvac
mkdir -p templates/fault
mkdir -p templates/data
mkdir -p test/unit
mkdir -p test/integration
mkdir -p examples

# Install dependencies
echo "📦 Installing dependencies..."
npm install haystack-core axios dotenv yaml
npm install --save-dev @types/node jest @types/jest ts-jest typescript

# Create basic TypeScript files
echo "📝 Creating TypeScript source files..."

# Create HaystackSkySparkClient stub
cat > src/skyspark/haystackClient.ts << 'EOF'
import axios, { AxiosInstance } from 'axios';
import {
  HDict,
  HGrid,
  HVal,
  HStr,
  HNum,
  HRef,
  ZincReader,
  JsonReader,
  hayson
} from 'haystack-core';

export interface SkySparkConfig {
  host: string;
  port: number;
  project: string;
  username: string;
  password: string;
  protocol?: 'http' | 'https';
  format?: 'zinc' | 'json' | 'hayson';
}

export class HaystackSkySparkClient {
  private api: AxiosInstance;
  
  constructor(private config: SkySparkConfig) {
    const baseURL = `${config.protocol || 'http'}://${config.host}:${config.port}/api/${config.project}`;
    
    this.api = axios.create({
      baseURL,
      auth: {
        username: config.username,
        password: config.password
      }
    });
  }
  
  async evalAxon(code: string): Promise<HVal> {
    // TODO: Implement
    const response = await this.api.post('/eval', code, {
      headers: { 'Content-Type': 'text/plain', 'Accept': 'text/zinc' }
    });
    return new ZincReader(response.data).readVal();
  }
  
  async validateAxon(code: string): Promise<{ valid: boolean; error?: string }> {
    // TODO: Implement full validation
    try {
      await this.evalAxon(`parseAxon(${HStr.make(code).toZinc()})`);
      return { valid: true };
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  }
}
EOF

# Create TypedAxonGenerator stub
cat > src/generation/typedAxonGenerator.ts << 'EOF'
import { HVal, HStr, HRef, HNum } from 'haystack-core';
import { HaystackSkySparkClient } from '../skyspark/haystackClient';

export interface AxonTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  parameters: TemplateParameter[];
  template: string;
}

export interface TemplateParameter {
  name: string;
  type: 'ref' | 'str' | 'num' | 'bool' | 'date' | 'dateRange' | 'filter';
  description: string;
  required?: boolean;
  default?: any;
}

export class TypedAxonGenerator {
  constructor(
    private client: HaystackSkySparkClient,
    private templates: Map<string, AxonTemplate>
  ) {}
  
  async generateCode(templateId: string, params: Record<string, any>): Promise<any> {
    // TODO: Implement
    const template = this.templates.get(templateId);
    if (!template) throw new Error(`Unknown template: ${templateId}`);
    
    let code = template.template;
    // Simple parameter replacement for now
    for (const [key, value] of Object.entries(params)) {
      code = code.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }
    
    return { code, template };
  }
}
EOF

# Create TemplateLoader stub
cat > src/templates/templateLoader.ts << 'EOF'
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'yaml';
import { AxonTemplate } from '../generation/typedAxonGenerator';

export class TemplateLoader {
  templates = new Map<string, AxonTemplate>();
  
  async loadTemplatesFromDirectory(dir: string): Promise<void> {
    // TODO: Implement full loader
    console.log(`Loading templates from ${dir}...`);
  }
  
  getAllTemplates(): AxonTemplate[] {
    return Array.from(this.templates.values());
  }
}
EOF

# Create test connection script
cat > test-connection.ts << 'EOF'
import { HaystackSkySparkClient } from './src/skyspark/haystackClient';
import * as dotenv from 'dotenv';

dotenv.config();

async function test() {
  console.log('🔍 Testing SkySpark connection...');
  
  const client = new HaystackSkySparkClient({
    host: process.env.SKYSPARK_HOST || 'localhost',
    port: parseInt(process.env.SKYSPARK_PORT || '8080'),
    project: process.env.SKYSPARK_PROJECT || 'demo',
    username: process.env.SKYSPARK_USERNAME || 'admin',
    password: process.env.SKYSPARK_PASSWORD || 'admin'
  });
  
  try {
    const result = await client.evalAxon('now()');
    console.log('✅ Success! Current time:', result.toZinc());
  } catch (error) {
    console.error('❌ Connection failed:', error);
  }
}

test();
EOF

# Create axon-config.json if it doesn't exist
if [ ! -f axon-config.json ]; then
  echo "⚙️  Creating axon-config.json..."
  cp axon-config.example.json axon-config.json
  echo "⚠️  Please edit axon-config.json with your paths!"
fi

# Create first template
echo "📋 Creating sample template..."
mkdir -p templates/energy
cat > templates/energy/meter-consumption.yaml << 'EOF'
id: meter-consumption
name: Meter Energy Consumption
category: energy
description: Calculate energy consumption for meters
parameters:
  - name: meterType
    type: str
    description: Type of meter (elecMeter, gasMeter)
    default: elecMeter
  - name: period
    type: str
    description: Time period
    default: yesterday
template: |
  // Calculate {{period}} consumption for {{meterType}}
  readAll({{meterType}}).map(meter => do
    energy: read(meter->energy)->hisRead({{period}})
    {meter: meter.dis, consumption: energy.hisRollup(sum).first.v0}
  end)
EOF

# Create jest config
cat > jest.config.js << 'EOF'
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
};
EOF

# Create tsconfig if it doesn't exist
if [ ! -f tsconfig.json ]; then
  echo "⚙️  Creating TypeScript config..."
  cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
EOF
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit axon-config.json with your Axon library paths"
echo "2. Edit .env.skyspark with your SkySpark credentials (if using SkySpark)"
echo "3. Run: npx ts-node test-connection.ts"
echo "4. Start implementing the tasks in IMPLEMENTATION_TASKS.md"
echo ""
echo "Quick test command:"
echo "  npx ts-node test-connection.ts"
