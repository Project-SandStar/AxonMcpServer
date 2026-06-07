# SkySpark + Haystack Core Implementation

## 🎯 Overview

This implementation leverages the `haystack-core` TypeScript library to provide native Haystack data type support, combined with SkySpark's REST API for Axon code validation and execution. This gives us the best of both worlds: type-safe Haystack handling in TypeScript and production-ready Axon evaluation.

## 🚀 Key Benefits

1. **Native TypeScript**: Full type safety for Haystack values
2. **Zinc/JSON Support**: Built-in encoding/decoding
3. **Grid Handling**: Native HGrid support for SkySpark responses
4. **Filter Support**: Haystack filter compilation and evaluation
5. **No Fantom Bridge**: Pure TypeScript implementation

## 📦 Installation

```bash
cd /Users/<user>/Code/axon-mcp-server
npm install haystack-core axios dotenv
npm install --save-dev @types/node
```

## 🔧 Implementation

### Step 1: Enhanced SkySpark Client with Haystack Core

```typescript
// src/skyspark/haystackClient.ts
import axios, { AxiosInstance } from 'axios';
import {
  HDict,
  HGrid,
  HVal,
  HStr,
  HNum,
  HBool,
  HRef,
  HMarker,
  ZincReader,
  JsonReader,
  JsonWriter,
  hayson,
  HFilter
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
  
  /**
   * Evaluate Axon code and return typed Haystack value
   */
  async evalAxon(code: string): Promise<HVal> {
    const response = await this.api.post('/eval', code, {
      headers: { 
        'Content-Type': 'text/plain',
        'Accept': this.getAcceptHeader()
      }
    });
    
    return this.parseResponse(response.data);
  }
  
  /**
   * Execute Axon and expect a grid result
   */
  async evalAxonGrid(code: string): Promise<HGrid> {
    const result = await this.evalAxon(code);
    if (!(result instanceof HGrid)) {
      throw new Error(`Expected grid result, got ${result.constructor.name}`);
    }
    return result;
  }
  
  /**
   * Read entities using Haystack filter
   */
  async readAll(filter: string | HFilter): Promise<HGrid> {
    const filterStr = typeof filter === 'string' ? filter : filter.toZinc();
    const code = `readAll(${filterStr})`;
    return this.evalAxonGrid(code);
  }
  
  /**
   * Read single entity
   */
  async read(id: string | HRef, checked = true): Promise<HDict | null> {
    const ref = typeof id === 'string' ? HRef.make(id) : id;
    const code = `read(${ref.toZinc()}, ${checked})`;
    const result = await this.evalAxon(code);
    
    if (result instanceof HDict) return result;
    if (result === null && !checked) return null;
    throw new Error(`Unexpected read result: ${result}`);
  }
  
  /**
   * Validate Axon code with detailed error info
   */
  async validateAxon(code: string): Promise<ValidationResult> {
    try {
      // Use SkySpark's parseAxon to validate syntax
      const checkCode = `
        try do
          expr: parseAxon(${HStr.make(code).toZinc()})
          {valid:true, ast:expr}
        end catch (ex) do
          {
            valid: false,
            error: ex.toStr,
            type: ex.type,
            line: ex.line ?: na(),
            col: ex.col ?: na()
          }
        end
      `;
      
      const result = await this.evalAxon(checkCode);
      if (!(result instanceof HDict)) {
        throw new Error('Unexpected validation result');
      }
      
      return {
        valid: result.get('valid')?.toBool() ?? false,
        error: result.get('error')?.toString(),
        line: result.get('line')?.toNumber(),
        column: result.get('col')?.toNumber()
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }
  
  /**
   * Get function help using typed response
   */
  async getFunctionHelp(funcName: string): Promise<FunctionHelp | null> {
    const code = `funcs(${HStr.make(funcName).toZinc()}).first(false)`;
    const result = await this.evalAxon(code);
    
    if (!(result instanceof HDict)) return null;
    
    return {
      name: result.get('name')?.toString() ?? funcName,
      sig: result.get('sig')?.toString() ?? '',
      doc: result.get('doc')?.toString() ?? '',
      params: this.parseFunctionSig(result.get('sig')?.toString() ?? '')
    };
  }
  
  /**
   * List all functions matching filter
   */
  async listFunctions(filter?: string): Promise<HDict[]> {
    const code = filter 
      ? `funcs().findAll(f => f->name.contains(${HStr.make(filter).toZinc()}))`
      : 'funcs()';
    
    const grid = await this.evalAxonGrid(code);
    return Array.from(grid);
  }
  
  private getAcceptHeader(): string {
    switch (this.config.format) {
      case 'json': return 'application/json';
      case 'hayson': return 'application/vnd.haystack.hayson+json';
      default: return 'text/zinc';
    }
  }
  
  private parseResponse(data: any): HVal {
    const format = this.config.format || 'zinc';
    
    switch (format) {
      case 'zinc':
        return new ZincReader(data).readVal();
      
      case 'json':
        return JsonReader.readVal(data);
      
      case 'hayson':
        return hayson.decode(data);
      
      default:
        throw new Error(`Unknown format: ${format}`);
    }
  }
  
  private parseFunctionSig(sig: string): ParamInfo[] {
    const match = sig.match(/\(([^)]*)\)/);
    if (!match) return [];
    
    return match[1].split(',').map(param => {
      const [name, type] = param.trim().split(':').map(s => s.trim());
      return { name, type };
    });
  }
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  line?: number;
  column?: number;
}

interface FunctionHelp {
  name: string;
  sig: string;
  doc: string;
  params: ParamInfo[];
}

interface ParamInfo {
  name: string;
  type?: string;
}
```

### Step 2: Axon Code Generator with Typed Templates

```typescript
// src/generation/typedAxonGenerator.ts
import { 
  HDict, 
  HGrid, 
  HVal, 
  HStr, 
  HNum, 
  HRef,
  HFilter,
  HMarker,
  HDate,
  HDateTime,
  HDateTimeRange
} from 'haystack-core';
import { HaystackSkySparkClient } from '../skyspark/haystackClient';

export interface AxonTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  parameters: TemplateParameter[];
  template: string;
  validation?: string[];
  examples?: TemplateExample[];
}

export interface TemplateParameter {
  name: string;
  type: 'ref' | 'str' | 'num' | 'bool' | 'date' | 'dateRange' | 'filter';
  description: string;
  required?: boolean;
  default?: any;
  validation?: string; // Axon expression to validate
}

export interface TemplateExample {
  description: string;
  params: Record<string, any>;
  expected?: string;
}

export class TypedAxonGenerator {
  constructor(
    private client: HaystackSkySparkClient,
    private templates: Map<string, AxonTemplate>
  ) {}
  
  async generateCode(
    templateId: string,
    params: Record<string, any>
  ): Promise<GeneratedCode> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Unknown template: ${templateId}`);
    }
    
    // 1. Convert params to Haystack values
    const hParams = await this.convertParams(template, params);
    
    // 2. Validate parameters
    const validation = await this.validateParams(template, hParams);
    if (!validation.valid) {
      return {
        success: false,
        errors: validation.errors,
        template
      };
    }
    
    // 3. Generate code
    let code = template.template;
    for (const [key, value] of Object.entries(hParams)) {
      const zinc = value.toZinc();
      code = code.replace(new RegExp(`{{${key}}}`, 'g'), zinc);
      
      // Also replace property access patterns like {{site.dis}}
      if (value instanceof HDict) {
        for (const [prop, propVal] of value) {
          code = code.replace(
            new RegExp(`{{${key}\\.${prop}}}`, 'g'),
            propVal.toZinc()
          );
        }
      }
    }
    
    // 4. Validate generated code
    const codeValidation = await this.client.validateAxon(code);
    
    return {
      success: codeValidation.valid,
      code,
      template,
      params: hParams,
      validation: codeValidation,
      alternatives: this.generateAlternatives(template, hParams)
    };
  }
  
  private async convertParams(
    template: AxonTemplate,
    params: Record<string, any>
  ): Promise<Record<string, HVal>> {
    const converted: Record<string, HVal> = {};
    
    for (const param of template.parameters) {
      const value = params[param.name] ?? param.default;
      
      if (!value && param.required) {
        throw new Error(`Missing required parameter: ${param.name}`);
      }
      
      if (value !== undefined) {
        converted[param.name] = await this.convertParam(param, value);
      }
    }
    
    return converted;
  }
  
  private async convertParam(
    param: TemplateParameter,
    value: any
  ): Promise<HVal> {
    switch (param.type) {
      case 'ref':
        if (typeof value === 'string') {
          // If it's an ID, verify it exists
          const entity = await this.client.read(value, false);
          if (!entity) {
            throw new Error(`Entity not found: ${value}`);
          }
          return entity.id as HRef;
        }
        return value instanceof HRef ? value : HRef.make(value);
      
      case 'str':
        return HStr.make(String(value));
      
      case 'num':
        return typeof value === 'number' ? HNum.make(value) : HNum.make(parseFloat(value));
      
      case 'bool':
        return HBool.make(Boolean(value));
      
      case 'date':
        return value instanceof HDate ? value : HDate.make(value);
      
      case 'dateRange':
        return this.parseDateRange(value);
      
      case 'filter':
        return typeof value === 'string' ? HFilter.make(value) : value;
      
      default:
        return HStr.make(String(value));
    }
  }
  
  private parseDateRange(value: string): HVal {
    // Parse common date range patterns
    const patterns: Record<string, () => string> = {
      'today': () => 'today()',
      'yesterday': () => 'yesterday()',
      'thisWeek': () => 'thisWeek()',
      'lastWeek': () => 'lastWeek()',
      'thisMonth': () => 'thisMonth()',
      'lastMonth': () => 'lastMonth()',
      'thisYear': () => 'thisYear()',
      'lastYear': () => 'lastYear()'
    };
    
    return HStr.make(patterns[value]?.() ?? value);
  }
  
  private async validateParams(
    template: AxonTemplate,
    params: Record<string, HVal>
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    // Check template-level validation
    if (template.validation) {
      for (const rule of template.validation) {
        let check = rule;
        // Replace param references
        for (const [key, value] of Object.entries(params)) {
          check = check.replace(new RegExp(`{{${key}}}`, 'g'), value.toZinc());
        }
        
        try {
          const result = await this.client.evalAxon(check);
          if (!result?.toBool()) {
            errors.push(`Validation failed: ${rule}`);
          }
        } catch (e) {
          errors.push(`Validation error: ${e.message}`);
        }
      }
    }
    
    return { valid: errors.length === 0, errors };
  }
  
  private generateAlternatives(
    template: AxonTemplate,
    params: Record<string, HVal>
  ): string[] {
    const alternatives: string[] = [];
    
    // Generate variations based on template category
    if (template.category === 'energy' && params.period) {
      // Suggest different rollup intervals
      alternatives.push(
        this.replaceTemplate(template.template, params)
          .replace(/hisRollup\([^,]+,\s*\w+\)/, 'hisRollup(sum, 1hr)'),
        this.replaceTemplate(template.template, params)
          .replace(/hisRollup\([^,]+,\s*\w+\)/, 'hisRollup(avg, 1day)')
      );
    }
    
    return alternatives.filter((alt, i, arr) => arr.indexOf(alt) === i);
  }
  
  private replaceTemplate(template: string, params: Record<string, HVal>): string {
    let result = template;
    for (const [key, value] of Object.entries(params)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value.toZinc());
    }
    return result;
  }
}

interface GeneratedCode {
  success: boolean;
  code?: string;
  template: AxonTemplate;
  params?: Record<string, HVal>;
  validation?: any;
  errors?: string[];
  alternatives?: string[];
}
```

### Step 3: Template Loader with Validation

```typescript
// src/templates/templateLoader.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'yaml';
import { AxonTemplate } from '../generation/typedAxonGenerator';

export class TemplateLoader {
  private templates: Map<string, AxonTemplate> = new Map();
  
  async loadTemplatesFromDirectory(dir: string): Promise<void> {
    const files = await fs.readdir(dir);
    
    for (const file of files) {
      if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        const content = await fs.readFile(path.join(dir, file), 'utf-8');
        const template = yaml.parse(content) as AxonTemplate;
        this.templates.set(template.id, template);
      }
    }
  }
  
  getTemplate(id: string): AxonTemplate | undefined {
    return this.templates.get(id);
  }
  
  getAllTemplates(): AxonTemplate[] {
    return Array.from(this.templates.values());
  }
  
  findTemplates(filter: {
    category?: string;
    search?: string;
  }): AxonTemplate[] {
    let results = this.getAllTemplates();
    
    if (filter.category) {
      results = results.filter(t => t.category === filter.category);
    }
    
    if (filter.search) {
      const search = filter.search.toLowerCase();
      results = results.filter(t => 
        t.name.toLowerCase().includes(search) ||
        t.description.toLowerCase().includes(search)
      );
    }
    
    return results;
  }
}
```

### Step 4: Enhanced MCP Tools

```typescript
// src/index.ts (enhanced tools)
import { HaystackSkySparkClient } from './skyspark/haystackClient';
import { TypedAxonGenerator } from './generation/typedAxonGenerator';
import { TemplateLoader } from './templates/templateLoader';
import { HGrid, HDict, HStr, HNum } from 'haystack-core';

// Initialize components
const skysparkClient = new HaystackSkySparkClient({
  host: process.env.SKYSPARK_HOST || 'localhost',
  port: parseInt(process.env.SKYSPARK_PORT || '8080'),
  project: process.env.SKYSPARK_PROJECT || 'demo',
  username: process.env.SKYSPARK_USERNAME || 'admin',
  password: process.env.SKYSPARK_PASSWORD || 'admin',
  format: 'zinc' // or 'json' or 'hayson'
});

const templateLoader = new TemplateLoader();
await templateLoader.loadTemplatesFromDirectory('./templates');

const generator = new TypedAxonGenerator(skysparkClient, templateLoader.templates);

// Enhanced MCP tools
{
  name: 'generateAxonCode',
  description: 'Generate Axon code from templates with full validation',
  inputSchema: {
    type: 'object',
    properties: {
      template: {
        type: 'string',
        description: 'Template ID or natural language intent'
      },
      params: {
        type: 'object',
        description: 'Template parameters'
      },
      testWithData: {
        type: 'boolean',
        description: 'Test with live data (limited)',
        default: false
      }
    },
    required: ['template']
  },
  handler: async ({ template, params = {}, testWithData }) => {
    try {
      // If template is not an ID, try to find best match
      let templateId = template;
      if (!templateLoader.getTemplate(template)) {
        // Simple intent matching
        const templates = templateLoader.getAllTemplates();
        const match = templates.find(t => 
          t.name.toLowerCase().includes(template.toLowerCase()) ||
          t.description.toLowerCase().includes(template.toLowerCase())
        );
        
        if (match) {
          templateId = match.id;
        } else {
          return {
            error: `No template found matching: ${template}`,
            availableTemplates: templates.map(t => ({ id: t.id, name: t.name }))
          };
        }
      }
      
      // Generate code
      const result = await generator.generateCode(templateId, params);
      
      // Test with data if requested and successful
      if (result.success && testWithData) {
        try {
          const testCode = result.code!.includes('readAll') 
            ? result.code!.replace(/readAll\(/g, 'readAll(').replace(/\)(?=[^)]*$)/, ').limit(10)')
            : result.code!;
          
          const testResult = await skysparkClient.evalAxon(testCode);
          
          if (testResult instanceof HGrid) {
            result.testData = {
              rows: testResult.size,
              columns: testResult.cols.map(col => col.name),
              sample: Array.from(testResult).slice(0, 3).map(dict => 
                Object.fromEntries(Array.from(dict).map(([k, v]) => [k, v.toJSON()]))
              )
            };
          } else {
            result.testData = { value: testResult.toJSON() };
          }
        } catch (e) {
          result.testError = e.message;
        }
      }
      
      return result;
    } catch (error) {
      return {
        error: error.message,
        stack: error.stack
      };
    }
  }
},

{
  name: 'validateAxonCode',
  description: 'Validate Axon code with detailed feedback',
  inputSchema: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'Axon code to validate'
      },
      executeTest: {
        type: 'boolean',
        description: 'Try to execute with limits',
        default: false
      }
    },
    required: ['code']
  },
  handler: async ({ code, executeTest }) => {
    // Validate syntax
    const validation = await skysparkClient.validateAxon(code);
    
    if (validation.valid && executeTest) {
      try {
        // Add safety limits for testing
        const safeCode = code.includes('readAll') 
          ? code.replace(/readAll\(/g, 'readAll(').replace(/\)(?=[^)]*$)/, ').limit(5)')
          : code;
        
        const result = await skysparkClient.evalAxon(safeCode);
        
        validation.testResult = {
          success: true,
          type: result.constructor.name,
          preview: result instanceof HGrid 
            ? `Grid with ${result.size} rows and ${result.cols.length} columns`
            : result.toZinc()
        };
      } catch (e) {
        validation.testResult = {
          success: false,
          error: e.message
        };
      }
    }
    
    return validation;
  }
},

{
  name: 'queryHaystack',
  description: 'Query Haystack data using filters',
  inputSchema: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        description: 'Haystack filter (e.g., "site", "equip and ahu")'
      },
      limit: {
        type: 'number',
        description: 'Max results',
        default: 100
      },
      columns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Columns to include'
      }
    },
    required: ['filter']
  },
  handler: async ({ filter, limit, columns }) => {
    try {
      // Read with filter
      const code = `readAll(${filter}).limit(${limit})`;
      const grid = await skysparkClient.evalAxonGrid(code);
      
      // Convert to friendly format
      const result = {
        count: grid.size,
        columns: grid.cols.map(col => col.name),
        rows: Array.from(grid).map(dict => {
          const row: Record<string, any> = {};
          
          if (columns && columns.length > 0) {
            // Only include specified columns
            for (const col of columns) {
              const val = dict.get(col);
              row[col] = val ? val.toJSON() : null;
            }
          } else {
            // Include all columns
            for (const [key, val] of dict) {
              row[key] = val.toJSON();
            }
          }
          
          return row;
        })
      };
      
      return result;
    } catch (error) {
      return {
        error: error.message,
        hint: 'Check filter syntax. Examples: "site", "equip and ahu", "point and sensor"'
      };
    }
  }
},

{
  name: 'listAxonTemplates',
  description: 'List available Axon code templates',
  inputSchema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description: 'Filter by category'
      },
      search: {
        type: 'string',
        description: 'Search in name/description'
      }
    }
  },
  handler: async ({ category, search }) => {
    const templates = templateLoader.findTemplates({ category, search });
    
    return {
      count: templates.length,
      templates: templates.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        parameters: t.parameters.map(p => ({
          name: p.name,
          type: p.type,
          required: p.required,
          description: p.description
        }))
      }))
    };
  }
}
```

### Step 5: Example Templates

```yaml
# templates/energy/meter-consumption.yaml
id: meter-energy-consumption
name: Meter Energy Consumption Analysis
category: energy
description: Calculate energy consumption for meters over a time period
parameters:
  - name: site
    type: ref
    description: Site reference (@siteId)
    required: true
    validation: "readAll(site).any(s => s->id == {{site}})"
  
  - name: meterType
    type: str
    description: Type of meter (elecMeter, gasMeter, waterMeter)
    default: elecMeter
  
  - name: period
    type: dateRange
    description: Time period (today, yesterday, lastWeek, lastMonth)
    default: lastMonth
  
  - name: rollup
    type: str
    description: Rollup interval (15min, 1hr, 1day, 1mo)
    default: 1day

template: |
  // Energy consumption for {{site}}
  site: read({{site}})
  period: {{period}}
  
  meters: readAll({{meterType}} and siteRef==site->id)
  
  data: meters.map(meter => do
    energy: read(meter->energy, false)
    
    if (energy != null) do
      his: energy->hisRead(period).hisRollup(sum, {{rollup}})
      
      {
        meter: meter.dis,
        total: his.foldCol("v0", sum),
        avg: his.foldCol("v0", avg),
        peak: his.foldCol("v0", max),
        unit: energy->unit
      }
    end else {
      meter: meter.dis,
      error: "No energy point"
    }
  end)
  
  // Summary
  {
    site: site.dis,
    period: period,
    meterCount: data.size,
    totalEnergy: data.findAll(d => d.has("total")).foldCol("total", sum),
    data: data
  }

validation:
  - "meters.size > 0"  # At least one meter found

examples:
  - description: Last month electricity consumption
    params:
      site: "@demo"
      meterType: elecMeter
      period: lastMonth
      rollup: 1day
```

## 🚀 Quick Test Script

```typescript
// test-haystack-skyspark.ts
import { HaystackSkySparkClient } from './src/skyspark/haystackClient';
import { HRef, HStr, HGrid } from 'haystack-core';
import * as dotenv from 'dotenv';

dotenv.config();

async function test() {
  const client = new HaystackSkySparkClient({
    host: process.env.SKYSPARK_HOST!,
    port: parseInt(process.env.SKYSPARK_PORT!),
    project: process.env.SKYSPARK_PROJECT!,
    username: process.env.SKYSPARK_USERNAME!,
    password: process.env.SKYSPARK_PASSWORD!
  });
  
  console.log('Testing Haystack + SkySpark integration...\n');
  
  // Test 1: Basic evaluation with typed result
  console.log('1. Typed Evaluation:');
  const now = await client.evalAxon('now()');
  console.log(`Current time: ${now.toZinc()} (type: ${now.constructor.name})`);
  
  // Test 2: Read sites as typed grid
  console.log('\n2. Read Sites:');
  const sites = await client.readAll('site');
  console.log(`Found ${sites.size} sites:`);
  for (const site of sites) {
    console.log(`  - ${site.get('dis')} [${site.id}]`);
    if (sites.size > 3) break; // Limit output
  }
  
  // Test 3: Validate code
  console.log('\n3. Code Validation:');
  const valid = await client.validateAxon('readAll(site).map(s => s.dis)');
  console.log('Valid:', valid);
  
  const invalid = await client.validateAxon('readAll(site.map(');
  console.log('Invalid:', invalid);
  
  // Test 4: Function help
  console.log('\n4. Function Help:');
  const help = await client.getFunctionHelp('hisRead');
  console.log(`${help?.name}: ${help?.sig}`);
  console.log(`Params:`, help?.params);
}

test().catch(console.error);
```

## 📊 Benefits of Haystack Core Integration

1. **Type Safety**: Full TypeScript types for all Haystack values
2. **Encoding Support**: Zinc, JSON, and Hayson formats
3. **Grid Operations**: Native iteration and manipulation
4. **Filter Support**: Compile and evaluate Haystack filters
5. **Standards Compliant**: Follows Haystack v4 specifications

## 🎯 Next Steps

1. Install haystack-core: `npm install haystack-core`
2. Implement HaystackSkySparkClient
3. Create typed templates
4. Test with your SkySpark instance
5. Expand template library

This approach gives you the best of both worlds: native TypeScript Haystack support with SkySpark's powerful Axon engine.

<citations>
<document>
    <document_type>WEB_PAGE</document_type>
    <document_id>https://github.com/j2inn/haystack-core</document_id>
</document>
</citations>