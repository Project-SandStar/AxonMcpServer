# Axon MCP Server - Phase 1 Implementation Roadmap

## 🎯 Overview

This document provides a concrete implementation plan for Phase 1 of the Axon MCP Server enhancements, leveraging Haxall's existing Fantom-based Axon parser for semantic analysis.

## 🔧 Architecture Overview

### Current Stack
- **TypeScript/Node.js**: MCP Server implementation
- **Basic Parser**: Simple regex-based function extraction
- **Index**: 1,974 functions with usage tracking

### Enhanced Stack
```
┌─────────────────────────────────────┐
│         MCP Server (TypeScript)      │
├─────────────────────────────────────┤
│     Axon Bridge Service (Node.js)   │
├─────────────────────────────────────┤
│   Fantom Runtime + Haxall Parser    │
└─────────────────────────────────────┘
```

## 📋 Phase 1.1: Axon Code Generator

### Week 1-2: Bridge Setup & Basic Generation

#### 1.1.1 Fantom-TypeScript Bridge
```typescript
// src/bridge/fantomBridge.ts
interface FantomBridge {
  parseAxon(code: string): ASTNode;
  validateSyntax(code: string): ValidationResult;
  formatCode(ast: ASTNode): string;
}

// Implementation options:
// Option A: Child process running Fantom
// Option B: WebAssembly compilation of Fantom runtime
// Option C: REST service wrapping Fantom parser
```

**Tasks:**
- [ ] Set up Fantom runtime environment
- [ ] Create Node.js wrapper for Fantom parser
- [ ] Define TypeScript interfaces for AST nodes
- [ ] Implement code serialization/deserialization

#### 1.1.2 Template Engine
```typescript
// src/generation/templateEngine.ts
interface CodeTemplate {
  id: string;
  name: string;
  description: string;
  parameters: TemplateParam[];
  pattern: string; // Axon code with placeholders
  examples: Example[];
  tags: string[];
}

class TemplateEngine {
  generateFromTemplate(templateId: string, params: Dict): string;
  suggestTemplates(intent: string): Template[];
  validateParameters(template: Template, params: Dict): Error[];
}
```

**Initial Templates:**
1. **Equipment Query**
   ```axon
   // Template: equipment-query
   readAll({{equipType}})
     .findAll(x => x->{{filterTag}})
     .map(x => {{projection}})
   ```

2. **Historical Analysis**
   ```axon
   // Template: history-rollup
   read({{pointRef}})->hisRead({{tag}}, {{dateRange}})
     .hisRollup({{aggregation}}, {{interval}})
   ```

3. **Fault Detection**
   ```axon
   // Template: equipment-fault
   readAll({{equipType}}).map(equip => do
     point: read(equip->{{pointTag}})
     val: point->curVal
     if (val > {{threshold}}) 
       {equip:equip.dis, fault:{{faultName}}, val:val}
     else null
   end).removeNull()
   ```

### Week 3-4: Pattern-Based Generation

#### 1.1.3 Code Generator Core
```typescript
// src/generation/axonGenerator.ts
class AxonCodeGenerator {
  constructor(
    private bridge: FantomBridge,
    private templates: TemplateEngine,
    private index: FunctionIndex
  ) {}

  async generateCode(intent: CodeIntent): Promise<GeneratedCode> {
    // 1. Parse intent to identify operation type
    const operation = this.parseIntent(intent);
    
    // 2. Find best matching template or pattern
    const template = this.findBestTemplate(operation);
    
    // 3. Extract parameters from intent
    const params = this.extractParameters(intent, template);
    
    // 4. Generate code using template
    const code = this.templates.generateFromTemplate(template.id, params);
    
    // 5. Validate generated code
    const ast = await this.bridge.parseAxon(code);
    const validation = await this.validateGenerated(ast);
    
    return {
      code,
      ast,
      validation,
      alternatives: this.generateAlternatives(operation)
    };
  }
}
```

#### 1.1.4 Intent Parser
```typescript
// src/generation/intentParser.ts
interface CodeIntent {
  description: string;
  equipmentType?: string;
  operation?: 'query' | 'calculate' | 'monitor' | 'report';
  timeframe?: string;
  conditions?: Condition[];
}

class IntentParser {
  parseIntent(naturalLanguage: string): CodeIntent {
    // Use NLP techniques to extract:
    // - Equipment types (ahu, vav, meter, etc.)
    // - Operations (find, calculate, monitor, etc.)
    // - Time references (yesterday, last month, etc.)
    // - Conditions (greater than, equals, etc.)
  }
}
```

## 📋 Phase 1.2: Axon Code Validator

### Week 5-6: Validation Engine

#### 1.2.1 Syntax Validator
```typescript
// src/validation/syntaxValidator.ts
class AxonSyntaxValidator {
  async validate(code: string): Promise<ValidationResult> {
    try {
      // Use Fantom parser for syntax checking
      const ast = await this.bridge.parseAxon(code);
      return { valid: true, ast };
    } catch (e) {
      return {
        valid: false,
        errors: this.parseFantomError(e),
        suggestions: this.generateFixSuggestions(e)
      };
    }
  }
}
```

#### 1.2.2 Semantic Validator
```typescript
// src/validation/semanticValidator.ts
class AxonSemanticValidator {
  validateFunctionCalls(ast: ASTNode): ValidationError[] {
    const errors: ValidationError[] = [];
    
    // Walk AST and check each function call
    ast.walk((node) => {
      if (node.type === 'call') {
        const func = this.index.getFunction(node.funcName);
        if (!func) {
          errors.push({
            type: 'unknown-function',
            message: `Unknown function: ${node.funcName}`,
            location: node.loc,
            suggestions: this.findSimilarFunctions(node.funcName)
          });
        } else {
          // Validate parameter count and types
          const paramErrors = this.validateParameters(node, func);
          errors.push(...paramErrors);
        }
      }
    });
    
    return errors;
  }
}
```

#### 1.2.3 Best Practices Validator
```typescript
// src/validation/bestPracticesValidator.ts
class BestPracticesValidator {
  validate(ast: ASTNode): Warning[] {
    const warnings: Warning[] = [];
    
    // Check for common anti-patterns
    warnings.push(...this.checkNPlusOneQueries(ast));
    warnings.push(...this.checkNullSafety(ast));
    warnings.push(...this.checkPerformance(ast));
    warnings.push(...this.checkNamingConventions(ast));
    
    return warnings;
  }
  
  private checkNPlusOneQueries(ast: ASTNode): Warning[] {
    // Detect patterns like:
    // readAll(equip).map(e => readAll(point and equipRef==e->id))
    // Suggest: Use joins or batch queries
  }
}
```

## 📋 Phase 1.3: Code Template System

### Week 7-8: Template Repository

#### 1.3.1 Template Format
```yaml
# templates/energy/monthly-consumption.yaml
id: energy-monthly-consumption
name: Monthly Energy Consumption
category: energy
description: Calculate monthly energy consumption for meters
parameters:
  - name: meterType
    type: tag
    description: Type of meter (elecMeter, gasMeter, etc.)
    default: elecMeter
  - name: dateRange
    type: dateRange
    description: Date range for calculation
    default: lastMonth
  - name: unit
    type: string
    description: Output unit
    default: kWh

template: |
  // Calculate {{dateRange}} consumption for {{meterType}}
  readAll({{meterType}}).map(meter => do
    consumption: read(meter)->hisRead(energy, {{dateRange}})
      .hisRollup(sum, 1mo)
      .hisConvert({{unit}})
      .first["v0"]
    {meter: meter.dis, consumption: consumption, unit: "{{unit}}"}
  end)

examples:
  - description: Last month electricity consumption
    params:
      meterType: elecMeter
      dateRange: lastMonth
      unit: kWh
  - description: Year to date gas consumption
    params:
      meterType: gasMeter
      dateRange: thisYear
      unit: therms

validation:
  - rule: meter-must-have-energy-his
    check: "{{meterType}} must have energy point with history"
```

#### 1.3.2 Template Manager
```typescript
// src/templates/templateManager.ts
class TemplateManager {
  private templates: Map<string, Template> = new Map();
  
  async loadTemplates(dir: string) {
    // Load all YAML templates from directory
    const files = await this.scanner.scan(dir, '*.yaml');
    for (const file of files) {
      const template = await this.parseTemplate(file);
      this.templates.set(template.id, template);
    }
  }
  
  findTemplates(criteria: SearchCriteria): Template[] {
    return Array.from(this.templates.values())
      .filter(t => this.matchesCriteria(t, criteria))
      .sort((a, b) => this.scoreRelevance(b, criteria) - this.scoreRelevance(a, criteria));
  }
  
  instantiateTemplate(id: string, params: Dict): GeneratedCode {
    const template = this.templates.get(id);
    if (!template) throw new Error(`Template not found: ${id}`);
    
    // Validate parameters
    const errors = this.validateParams(template, params);
    if (errors.length > 0) throw new ValidationError(errors);
    
    // Replace placeholders
    let code = template.template;
    for (const [key, value] of Object.entries(params)) {
      code = code.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    
    return { code, template, params };
  }
}
```

## 🛠️ Implementation Tools

### Tool 1: `generateAxonCode`
```typescript
{
  name: 'generateAxonCode',
  description: 'Generate Axon code from natural language or specifications',
  inputSchema: {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        description: 'Natural language description of what you want to do'
      },
      equipmentType: {
        type: 'string',
        description: 'Optional: Type of equipment (ahu, vav, meter, etc.)'
      },
      operation: {
        type: 'string',
        enum: ['query', 'calculate', 'monitor', 'report', 'fault'],
        description: 'Optional: Type of operation'
      },
      templateId: {
        type: 'string',
        description: 'Optional: Specific template to use'
      }
    },
    required: ['intent']
  }
}
```

### Tool 2: `validateAxonCode`
```typescript
{
  name: 'validateAxonCode',
  description: 'Validate Axon code syntax and semantics',
  inputSchema: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'Axon code to validate'
      },
      strictMode: {
        type: 'boolean',
        description: 'Enable strict validation including best practices'
      },
      context: {
        type: 'object',
        description: 'Optional context (available points, equipment, etc.)'
      }
    },
    required: ['code']
  }
}
```

### Tool 3: `getCodeTemplate`
```typescript
{
  name: 'getCodeTemplate',
  description: 'Get a specific code template with parameters',
  inputSchema: {
    type: 'object',
    properties: {
      templateId: {
        type: 'string',
        description: 'Template ID'
      },
      includeExamples: {
        type: 'boolean',
        description: 'Include usage examples'
      }
    },
    required: ['templateId']
  }
}
```

### Tool 4: `listCodeTemplates`
```typescript
{
  name: 'listCodeTemplates',
  description: 'List available code templates',
  inputSchema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description: 'Filter by category'
      },
      operation: {
        type: 'string',
        description: 'Filter by operation type'
      },
      search: {
        type: 'string',
        description: 'Search in template names and descriptions'
      }
    }
  }
}
```

## 📊 Success Criteria

### Week 8 Deliverables
1. **Working Fantom Bridge**: Parse and validate Axon code
2. **20+ Templates**: Common patterns for energy, HVAC, faults
3. **Code Generation**: Natural language → working Axon code
4. **Validation**: Syntax, semantics, and best practices
5. **4 New MCP Tools**: Integrated and tested

### Metrics
- **Parse Success Rate**: >95% for valid Axon code
- **Generation Accuracy**: >80% produces valid code first try
- **Template Coverage**: Covers 60% of common use cases
- **Performance**: <100ms for validation, <500ms for generation

## 🚀 Next Steps

### Week 1: Environment Setup
- [ ] Install Fantom runtime
- [ ] Clone and build Haxall parser
- [ ] Create TypeScript bridge prototype
- [ ] Test parsing sample Axon code

### Week 2: Core Infrastructure
- [ ] Implement AST type definitions
- [ ] Build template engine base
- [ ] Create validation framework
- [ ] Set up test harness

### Week 3-4: Template Development
- [ ] Create initial 10 templates
- [ ] Implement parameter validation
- [ ] Build intent parser
- [ ] Test generation pipeline

### Week 5-6: Validation Engine
- [ ] Integrate Fantom parser
- [ ] Implement semantic checks
- [ ] Add best practices rules
- [ ] Create fix suggestions

### Week 7-8: Integration & Testing
- [ ] Wire up MCP tools
- [ ] Comprehensive testing
- [ ] Performance optimization
- [ ] Documentation

## 🔗 Resources

- **Haxall Source**: https://github.com/haxall/haxall
- **Fantom Lang**: https://fantom.org/
- **MCP SDK**: https://github.com/anthropics/model-context-protocol
- **Axon Docs**: https://haxall.io/doc/lib-axon/

<citations>
<document>
    <document_type>WEB_PAGE</document_type>
    <document_id>https://github.com/haxall/haxall</document_id>
</document>
</citations>