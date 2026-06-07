# SkySpark-Based Implementation Roadmap

## 🎯 Overview

This updated roadmap leverages SkySpark's commercial Axon engine for robust parsing, validation, and execution capabilities. SkySpark provides REST APIs and built-in Axon evaluation that we can use directly.

## 🔧 Architecture Overview

### Enhanced Stack with SkySpark
```
┌─────────────────────────────────────┐
│      MCP Server (TypeScript)         │
├─────────────────────────────────────┤
│    SkySpark REST API Client          │
├─────────────────────────────────────┤
│    SkySpark Server (Local/Remote)    │
│    - Axon Parser & Evaluator         │
│    - Function Library                │
│    - Database & Points               │
└─────────────────────────────────────┘
```

## 🚀 Key Advantages of Using SkySpark

1. **Production-Ready Parser**: Battle-tested Axon parser and evaluator
2. **REST API**: Direct HTTP access to Axon functions
3. **Live Evaluation**: Test code against real data
4. **Built-in Functions**: Access to complete Axon function library
5. **Validation**: Immediate syntax and runtime validation
6. **Documentation**: Built-in function documentation and help

## 📋 Phase 1: SkySpark Integration

### Week 1: SkySpark API Client

#### 1.1 SkySpark REST Client
```typescript
// src/skyspark/client.ts
import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';

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
  private authToken?: string;
  
  constructor(private config: SkySparkConfig) {
    const baseURL = `${config.protocol || 'http'}://${config.host}:${config.port}/api/${config.project}`;
    
    this.api = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'text/zinc',
        'Accept': 'application/json'
      }
    });
  }
  
  async authenticate(): Promise<void> {
    // SkySpark uses SCRAM authentication
    const response = await this.api.get('/about');
    const authHeader = response.headers['www-authenticate'];
    
    if (authHeader && authHeader.includes('SCRAM')) {
      this.authToken = await this.scramAuth();
    } else {
      // Fallback to basic auth
      const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
      this.api.defaults.headers['Authorization'] = `Basic ${auth}`;
    }
  }
  
  async evalAxon(code: string): Promise<any> {
    const response = await this.api.post('/eval', code, {
      headers: { 'Content-Type': 'text/plain' }
    });
    return this.parseZinc(response.data);
  }
  
  async validateAxon(code: string): Promise<ValidationResult> {
    try {
      // Use SkySpark's compile function to validate without executing
      const compileCode = `try compile(${JSON.stringify(code)}) catch (ex) ex`;
      const result = await this.evalAxon(compileCode);
      
      if (result && result.type === 'err') {
        return {
          valid: false,
          error: result.dis || result.msg,
          line: result.line,
          column: result.col
        };
      }
      
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }
  
  async getFunctionHelp(funcName: string): Promise<FunctionHelp> {
    const code = `funcs(${funcName}).first`;
    const func = await this.evalAxon(code);
    
    return {
      name: func.name,
      sig: func.sig,
      doc: func.doc,
      params: this.parseFuncParams(func.sig),
      returns: func.returns
    };
  }
  
  async listFunctions(filter?: string): Promise<FunctionInfo[]> {
    const code = filter ? `funcs().findAll(f => f.name.contains("${filter}"))` : 'funcs()';
    const funcs = await this.evalAxon(code);
    return funcs.rows || [];
  }
  
  private parseZinc(zinc: string): any {
    // Parse Zinc format response to JSON
    // SkySpark can also return JSON directly with Accept header
    return JSON.parse(zinc);
  }
  
  private parseFuncParams(sig: string): ParamInfo[] {
    // Parse function signature to extract parameters
    const match = sig.match(/\(([^)]*)\)/);
    if (!match) return [];
    
    return match[1].split(',').map(param => {
      const [name, type] = param.trim().split(':');
      return { name: name.trim(), type: type?.trim() };
    });
  }
}
```

#### 1.2 Axon Code Generator using SkySpark
```typescript
// src/generation/skysparkGenerator.ts
export class SkySparkAxonGenerator {
  constructor(
    private client: SkySparkClient,
    private templates: TemplateEngine,
    private index: FunctionIndex
  ) {}
  
  async generateCode(intent: CodeIntent): Promise<GeneratedCode> {
    // 1. Parse intent
    const operation = this.parseIntent(intent);
    
    // 2. Find matching template
    const template = await this.findBestTemplate(operation);
    
    // 3. Generate code from template
    let code = this.templates.generate(template, operation.params);
    
    // 4. Validate with SkySpark
    const validation = await this.client.validateAxon(code);
    
    // 5. If validation fails, try to fix
    if (!validation.valid) {
      code = await this.attemptAutoFix(code, validation.error);
      validation = await this.client.validateAxon(code);
    }
    
    // 6. Test with sample data if possible
    const testResult = await this.testWithSampleData(code);
    
    return {
      code,
      validation,
      testResult,
      alternatives: await this.generateAlternatives(operation)
    };
  }
  
  async attemptAutoFix(code: string, error: string): Promise<string> {
    // Common fixes based on error patterns
    const fixes = [
      {
        pattern: /Unknown func: (\w+)/,
        fix: (match: RegExpMatchArray) => this.suggestSimilarFunction(match[1])
      },
      {
        pattern: /Expected .* but found/,
        fix: () => this.fixSyntaxError(code, error)
      },
      {
        pattern: /Null safe/,
        fix: () => this.addNullSafety(code)
      }
    ];
    
    for (const { pattern, fix } of fixes) {
      const match = error.match(pattern);
      if (match) {
        return await fix(match);
      }
    }
    
    return code;
  }
  
  private async testWithSampleData(code: string): Promise<TestResult> {
    try {
      // Wrap code in a safe test harness
      const testCode = `
        // Test with limited data
        limit: 10
        ${code.replace(/readAll\(/g, 'readAll(').replace(/\)/g, ').limit(limit)')}
      `;
      
      const result = await this.client.evalAxon(testCode);
      
      return {
        success: true,
        sampleOutput: result,
        performance: result.meta?.execTime
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
```

### Week 2: Enhanced Validation with SkySpark

#### 2.1 Advanced Validator
```typescript
// src/validation/skysparkValidator.ts
export class SkySparkValidator {
  constructor(private client: SkySparkClient) {}
  
  async validate(code: string, options: ValidationOptions = {}): Promise<ValidationReport> {
    const report: ValidationReport = {
      syntax: await this.validateSyntax(code),
      semantic: await this.validateSemantics(code),
      performance: options.checkPerformance ? await this.analyzePerformance(code) : undefined,
      security: options.checkSecurity ? await this.validateSecurity(code) : undefined,
      bestPractices: options.checkBestPractices ? await this.checkBestPractices(code) : undefined
    };
    
    report.overall = this.calculateOverallStatus(report);
    return report;
  }
  
  private async validateSyntax(code: string): Promise<SyntaxValidation> {
    // Use SkySpark's parser
    const result = await this.client.validateAxon(code);
    
    if (!result.valid) {
      return {
        valid: false,
        errors: [{
          message: result.error,
          line: result.line,
          column: result.column,
          suggestion: await this.getSyntaxFixSuggestion(result.error)
        }]
      };
    }
    
    return { valid: true };
  }
  
  private async validateSemantics(code: string): Promise<SemanticValidation> {
    // Check function calls, types, and data access
    const checkCode = `
      do
        // Parse the code to AST
        ast: parseAxon(${JSON.stringify(code)})
        
        // Extract function calls
        funcs: ast.findAll(node => node.type == "call")
        
        // Validate each function exists and has correct params
        errors: []
        funcs.each(f => do
          func: funcs(f.name, false)
          if (func == null) errors = errors.add({
            type: "unknown-function",
            func: f.name,
            line: f.line
          })
        end)
        
        {valid: errors.isEmpty, errors: errors}
      end
    `;
    
    const result = await this.client.evalAxon(checkCode);
    return result;
  }
  
  private async analyzePerformance(code: string): Promise<PerformanceAnalysis> {
    // Detect performance issues
    const analysis = {
      issues: [],
      suggestions: [],
      estimatedComplexity: 'O(n)'
    };
    
    // Check for N+1 queries
    if (code.includes('.map') && code.includes('readAll')) {
      analysis.issues.push({
        type: 'n-plus-one',
        message: 'Potential N+1 query pattern detected',
        suggestion: 'Consider using a single query with joins'
      });
    }
    
    // Check for missing limits
    if (code.includes('readAll') && !code.includes('limit')) {
      analysis.suggestions.push('Consider adding .limit() to readAll queries');
    }
    
    // Check for inefficient history queries
    if (code.includes('hisRead') && !code.includes('hisRollup')) {
      analysis.suggestions.push('Consider using hisRollup for aggregated data');
    }
    
    return analysis;
  }
  
  private async checkBestPractices(code: string): Promise<BestPracticesCheck> {
    const violations = [];
    const suggestions = [];
    
    // Check naming conventions
    const varPattern = /(\w+):/g;
    let match;
    while ((match = varPattern.exec(code)) !== null) {
      const varName = match[1];
      if (!varName.match(/^[a-z][a-zA-Z0-9]*$/)) {
        violations.push(`Variable '${varName}' doesn't follow camelCase convention`);
      }
    }
    
    // Check for error handling
    if (code.includes('hisRead') && !code.includes('try')) {
      suggestions.push('Consider adding error handling for history reads');
    }
    
    // Check for null safety
    if (code.includes('->') && !code.includes('?->')) {
      suggestions.push('Consider using safe navigation operator (?->) for null safety');
    }
    
    return { violations, suggestions };
  }
}
```

### Week 3: Template System with SkySpark Validation

#### 3.1 SkySpark-Aware Templates
```yaml
# templates/skyspark/energy-analysis.yaml
id: skyspark-energy-analysis
name: Energy Analysis with SkySpark
category: energy
description: Comprehensive energy analysis using SkySpark functions
requirements:
  - skyspark: "3.1+"
  - extensions: ["energy", "analytics"]

parameters:
  - name: site
    type: ref
    description: Site reference
    validation: "readAll(site).has(id=={{value}})"
  
  - name: period
    type: dateRange
    description: Analysis period
    default: "lastMonth"
  
  - name: groupBy
    type: string
    enum: ["equip", "meter", "zone"]
    default: "meter"

template: |
  // Energy Analysis for {{site.dis}}
  site: read({{site}})
  period: {{period}}
  
  // Get all meters for the site
  meters: readAll(elecMeter and siteRef==site->id)
  
  // Calculate consumption by {{groupBy}}
  data: meters.map(meter => do
    // Read historical data with proper error handling
    his: try
      read(meter->energy)->hisRead(kWh, period).hisRollup(sum, 1day)
    catch
      null
    end
    
    if (his != null) do
      consumption: his.foldCol("v0", sum)
      peak: his.foldCol("v0", max)
      avg: his.foldCol("v0", avg)
      
      {
        {{groupBy}}: meter.{{groupBy}} ?: meter.dis,
        consumption: consumption,
        peak: peak,
        avg: avg,
        cost: consumption * site->utilityRate ?: 0.12
      }
    end
    else null
  end).removeNull()
  
  // Summary statistics
  summary: {
    total: data.foldCol("consumption", sum),
    avgDaily: data.foldCol("avg", avg),
    peakDay: data.foldCol("peak", max),
    totalCost: data.foldCol("cost", sum)
  }
  
  {data: data, summary: summary}

validation:
  # SkySpark-specific validation rules
  - rule: check-points-exist
    query: "readAll(energy and his and siteRef=={{site}}).size > 0"
    error: "No energy points with history found for site"
  
  - rule: check-data-availability
    query: "read({{site}}->energy)->hisRead(kWh, {{period}}).size > 0"
    error: "No historical data available for the specified period"

test:
  # Test with SkySpark eval
  setup: |
    // Create test data
    testSite: {id:@test, dis:"Test Site", site, utilityRate:0.15}
    testMeter: {id:@meter1, dis:"Meter 1", elecMeter, siteRef:@test, energy:@point1}
    testPoint: {id:@point1, dis:"Energy", point, his, unit:"kWh"}
  
  expected:
    hasData: true
    summaryKeys: ["total", "avgDaily", "peakDay", "totalCost"]
```

#### 3.2 Template Executor with SkySpark
```typescript
// src/templates/skysparkTemplateExecutor.ts
export class SkySparkTemplateExecutor {
  constructor(
    private client: SkySparkClient,
    private validator: SkySparkValidator
  ) {}
  
  async executeTemplate(
    template: Template,
    params: Record<string, any>
  ): Promise<ExecutionResult> {
    // 1. Validate parameters against SkySpark
    const paramValidation = await this.validateParameters(template, params);
    if (!paramValidation.valid) {
      return { success: false, errors: paramValidation.errors };
    }
    
    // 2. Generate code from template
    const code = this.instantiateTemplate(template, params);
    
    // 3. Validate generated code
    const validation = await this.validator.validate(code, {
      checkPerformance: true,
      checkBestPractices: true
    });
    
    if (!validation.overall.valid) {
      return {
        success: false,
        code,
        validation,
        errors: validation.overall.errors
      };
    }
    
    // 4. Execute test run if available
    let testResult;
    if (template.test) {
      testResult = await this.runTemplateTest(template, code);
    }
    
    // 5. Return successful result
    return {
      success: true,
      code,
      validation,
      testResult,
      metadata: {
        template: template.id,
        generatedAt: new Date(),
        skyspark: await this.client.evalAxon('version()')
      }
    };
  }
  
  private async validateParameters(
    template: Template,
    params: Record<string, any>
  ): Promise<ParameterValidation> {
    const errors = [];
    
    for (const param of template.parameters) {
      const value = params[param.name];
      
      // Check required
      if (param.required && !value) {
        errors.push(`Missing required parameter: ${param.name}`);
        continue;
      }
      
      // Validate with SkySpark if validation query provided
      if (param.validation && value) {
        const validationQuery = param.validation.replace(/{{value}}/g, value);
        try {
          const result = await this.client.evalAxon(validationQuery);
          if (!result) {
            errors.push(`Invalid ${param.name}: ${value}`);
          }
        } catch (e) {
          errors.push(`Cannot validate ${param.name}: ${e.message}`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  private async runTemplateTest(
    template: Template,
    code: string
  ): Promise<TestResult> {
    if (!template.test) return null;
    
    try {
      // Setup test data
      if (template.test.setup) {
        await this.client.evalAxon(template.test.setup);
      }
      
      // Run the generated code
      const result = await this.client.evalAxon(code);
      
      // Validate against expectations
      const expectations = template.test.expected;
      const passed = this.validateExpectations(result, expectations);
      
      return {
        passed,
        result,
        expectations
      };
    } catch (error) {
      return {
        passed: false,
        error: error.message
      };
    }
  }
}
```

## 🛠️ MCP Tool Implementations

### Tool: generateAxonCode with SkySpark
```typescript
{
  name: 'generateAxonCode',
  description: 'Generate Axon code using SkySpark validation',
  handler: async (args) => {
    const generator = new SkySparkAxonGenerator(skysparkClient, templates, index);
    
    // Generate code
    const result = await generator.generateCode({
      intent: args.intent,
      equipmentType: args.equipmentType,
      operation: args.operation
    });
    
    // Validate with SkySpark
    if (result.validation.valid) {
      // Optionally test with live data
      if (args.testWithData) {
        const testResult = await skysparkClient.evalAxon(
          `// Test query limited to 10 results\n${result.code}.limit(10)`
        );
        result.sampleOutput = testResult;
      }
    }
    
    return result;
  }
}
```

### Tool: validateAxonCode with SkySpark
```typescript
{
  name: 'validateAxonCode',
  description: 'Validate Axon code using SkySpark parser',
  handler: async (args) => {
    const validator = new SkySparkValidator(skysparkClient);
    
    const report = await validator.validate(args.code, {
      checkPerformance: args.checkPerformance ?? true,
      checkSecurity: args.checkSecurity ?? false,
      checkBestPractices: args.checkBestPractices ?? true
    });
    
    // Add fix suggestions
    if (!report.overall.valid) {
      report.suggestions = await generateFixSuggestions(args.code, report);
    }
    
    return report;
  }
}
```

## 📊 SkySpark Integration Benefits

### Immediate Benefits
1. **Real Validation**: Code is validated against actual SkySpark instance
2. **Live Testing**: Can test generated code with real data
3. **Function Discovery**: Access to all SkySpark functions and extensions
4. **Documentation**: Built-in function help and signatures

### Advanced Features
1. **Optimization**: SkySpark can suggest query optimizations
2. **Security**: Validate against project permissions
3. **Extensions**: Use SkySpark extensions (energy, analytics, etc.)
4. **Debugging**: Step through code execution

## 🚀 Implementation Timeline

### Week 1: SkySpark Connection
- [ ] Set up SkySpark REST client
- [ ] Implement authentication (SCRAM/Basic)
- [ ] Test basic eval and validation
- [ ] Create connection configuration

### Week 2: Core Integration
- [ ] Build validation pipeline
- [ ] Implement code execution wrapper
- [ ] Create error parser
- [ ] Set up function discovery

### Week 3: Template System
- [ ] Create SkySpark-aware templates
- [ ] Implement parameter validation
- [ ] Build test harness
- [ ] Add performance checks

### Week 4: MCP Tools
- [ ] Wire up generateAxonCode tool
- [ ] Implement validateAxonCode tool
- [ ] Add template tools
- [ ] Create comprehensive tests

## 🔧 Configuration

### Environment Setup
```bash
# .env file
SKYSPARK_HOST=localhost
SKYSPARK_PORT=8080
SKYSPARK_PROJECT=demo
SKYSPARK_USERNAME=admin
SKYSPARK_PASSWORD=admin
SKYSPARK_PROTOCOL=http

# For production
SKYSPARK_HOST=skyspark.company.com
SKYSPARK_PORT=443
SKYSPARK_PROTOCOL=https
```

### Testing with SkySpark
```typescript
// Quick test script
import { SkySparkClient } from './src/skyspark/client';

async function test() {
  const client = new SkySparkClient({
    host: process.env.SKYSPARK_HOST,
    port: parseInt(process.env.SKYSPARK_PORT),
    project: process.env.SKYSPARK_PROJECT,
    username: process.env.SKYSPARK_USERNAME,
    password: process.env.SKYSPARK_PASSWORD,
    protocol: process.env.SKYSPARK_PROTOCOL as 'http' | 'https'
  });
  
  await client.authenticate();
  
  // Test evaluation
  const result = await client.evalAxon('now()');
  console.log('Current time from SkySpark:', result);
  
  // Test validation
  const validation = await client.validateAxon('readAll(site).size');
  console.log('Validation result:', validation);
  
  // Test function help
  const help = await client.getFunctionHelp('readAll');
  console.log('Function help:', help);
}

test().catch(console.error);
```

## 📝 Notes

1. **SkySpark License**: Ensure you have appropriate SkySpark license for API usage
2. **Performance**: Cache validation results to avoid repeated API calls
3. **Security**: Use HTTPS in production and secure credential storage
4. **Rate Limiting**: Implement rate limiting to avoid overloading SkySpark
5. **Offline Mode**: Consider caching templates and basic validation for offline use

This approach leverages SkySpark's production-ready capabilities while maintaining the flexibility to enhance and extend with your custom logic.