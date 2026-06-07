# Axon MCP Server Implementation Tasks

## 🎯 Project Overview

Transform the Axon MCP Server into an intelligent code generation and validation tool using:
- **haystack-core**: TypeScript library for Haystack data types
- **SkySpark REST API**: For Axon validation and execution
- **Template Engine**: For code generation
- **MCP Tools**: Enhanced tools for Cline integration

## 📅 Week 1: Foundation Setup
**Goal**: Establish SkySpark connection with haystack-core integration

### Day 1-2: Environment Setup
```bash
# Task 1.1: Install dependencies
cd /Users/<user>/Code/axon-mcp-server
npm install haystack-core axios dotenv yaml
npm install --save-dev @types/node jest @types/jest ts-jest

# Task 1.2: Create project structure
mkdir -p src/skyspark src/generation src/templates src/validation
mkdir -p templates/energy templates/hvac templates/fault templates/data
mkdir -p test/unit test/integration
```

### Day 3-4: HaystackSkySparkClient Implementation
```typescript
// Task 1.3: Create src/skyspark/haystackClient.ts
// - Implement HaystackSkySparkClient class
// - Add authentication (Basic + SCRAM)
// - Core methods: evalAxon, validateAxon, readAll, read
// - Response parsing with ZincReader/JsonReader
```

### Day 5: Configuration & Testing
```bash
# Task 1.4: Create .env.example
SKYSPARK_HOST=localhost
SKYSPARK_PORT=8080
SKYSPARK_PROJECT=demo
SKYSPARK_USERNAME=admin
SKYSPARK_PASSWORD=admin
SKYSPARK_PROTOCOL=http
SKYSPARK_FORMAT=zinc

# Task 1.5: Create test script
# src/test-connection.ts - verify SkySpark connectivity
```

### Deliverables:
- [ ] Working SkySpark client with haystack-core
- [ ] Successful connection test
- [ ] Basic CRUD operations working

---

## 📅 Week 2: Code Generation Engine
**Goal**: Build template-based code generation system

### Day 1-2: TypedAxonGenerator
```typescript
// Task 2.1: Create src/generation/typedAxonGenerator.ts
// - Parameter conversion (string → HVal)
// - Template parameter validation
// - Code generation from templates
// - Alternative suggestions
```

### Day 3: Template System
```typescript
// Task 2.2: Create src/templates/templateLoader.ts
// - YAML template loading
// - Template search/filtering
// - Template validation

// Task 2.3: Define template schema
interface AxonTemplate {
  id: string
  name: string
  category: string
  parameters: TemplateParameter[]
  template: string
  validation?: string[]
  examples?: TemplateExample[]
}
```

### Day 4-5: Initial Templates
```yaml
# Task 2.4: Create 5 starter templates
# templates/energy/meter-consumption.yaml
# templates/hvac/ahu-status.yaml
# templates/data/equipment-query.yaml
# templates/fault/temperature-fault.yaml
# templates/data/point-history.yaml
```

### Deliverables:
- [ ] Working code generator
- [ ] Template loader system
- [ ] 5 validated templates
- [ ] Generation test cases

---

## 📅 Week 3: Validation & Intelligence
**Goal**: Smart validation with error recovery

### Day 1-2: Enhanced Validation
```typescript
// Task 3.1: Enhance validation in haystackClient.ts
// - Detailed error parsing
// - Line/column information
// - Error categorization

// Task 3.2: Create src/validation/semanticValidator.ts
// - Function signature checking
// - Parameter type validation
// - Data availability checks
```

### Day 3-4: Best Practices & Performance
```typescript
// Task 3.3: Create src/validation/bestPracticesChecker.ts
// - N+1 query detection
// - Missing null safety warnings
// - Naming convention checks
// - Performance anti-patterns

// Task 3.4: Create src/validation/performanceAnalyzer.ts
// - Query complexity estimation
// - Optimization suggestions
// - Resource usage warnings
```

### Day 5: Error Recovery
```typescript
// Task 3.5: Create src/generation/errorRecovery.ts
// - Common error patterns
// - Auto-fix suggestions
// - Alternative approaches
// - Function name corrections
```

### Deliverables:
- [ ] Comprehensive validation system
- [ ] Performance analyzer
- [ ] Auto-fix capabilities
- [ ] Validation test suite

---

## 📅 Week 4: MCP Tool Integration
**Goal**: Wire up all tools to MCP server

### Day 1-2: Code Generation Tool
```typescript
// Task 4.1: Update src/index.ts
// Add generateAxonCode tool:
// - Natural language intent parsing
// - Template matching
// - Parameter extraction
// - Live testing option
```

### Day 3: Validation & Query Tools
```typescript
// Task 4.2: Add validateAxonCode tool
// - Syntax validation
// - Semantic checks
// - Test execution
// - Fix suggestions

// Task 4.3: Add queryHaystack tool
// - Filter-based queries
// - Column selection
// - Result formatting
```

### Day 4-5: Additional Tools & Integration
```typescript
// Task 4.4: Add listAxonTemplates tool
// - Category filtering
// - Search functionality
// - Parameter documentation

// Task 4.5: Add executeAxonCode tool
// - Safety limits
// - Result preview
// - Error handling

// Task 4.6: Update existing tools
// - Enhance searchAxonExamples
// - Add template suggestions to search results
```

### Deliverables:
- [ ] 5 new MCP tools integrated
- [ ] Updated existing tools
- [ ] Tool documentation
- [ ] Integration tests

---

## 📅 Week 5: Template Library
**Goal**: Comprehensive template coverage

### Day 1-2: Energy Templates (10+)
```yaml
# Task 5.1: Energy analysis templates
- energy/consumption-by-meter.yaml
- energy/demand-analysis.yaml
- energy/cost-calculation.yaml
- energy/baseline-comparison.yaml
- energy/peak-usage.yaml
- energy/efficiency-metrics.yaml
- energy/utility-billing.yaml
- energy/submetering.yaml
- energy/renewable-generation.yaml
- energy/carbon-footprint.yaml
```

### Day 3-4: HVAC Templates (10+)
```yaml
# Task 5.2: HVAC control templates
- hvac/ahu-operation.yaml
- hvac/vav-analysis.yaml
- hvac/chiller-efficiency.yaml
- hvac/boiler-runtime.yaml
- hvac/zone-comfort.yaml
- hvac/setpoint-analysis.yaml
- hvac/equipment-cycling.yaml
- hvac/ventilation-rates.yaml
- hvac/temperature-trends.yaml
- hvac/pressure-monitoring.yaml
```

### Day 5: Fault & Other Templates
```yaml
# Task 5.3: Fault detection templates
- fault/sensor-failure.yaml
- fault/equipment-offline.yaml
- fault/comfort-deviation.yaml
- fault/energy-spike.yaml
- fault/communication-loss.yaml

# Task 5.4: Data & reporting templates
- data/point-export.yaml
- data/bulk-update.yaml
- report/daily-summary.yaml
- report/kpi-dashboard.yaml
```

### Deliverables:
- [ ] 30+ production-ready templates
- [ ] Template documentation
- [ ] Example outputs
- [ ] Category organization

---

## 📅 Week 6: Testing & Polish
**Goal**: Production-ready system

### Day 1-2: Unit Testing
```typescript
// Task 6.1: Unit tests
// test/unit/haystackClient.test.ts
// test/unit/typedAxonGenerator.test.ts
// test/unit/templateLoader.test.ts
// test/unit/validators.test.ts
```

### Day 3: Integration Testing
```typescript
// Task 6.2: Integration tests
// test/integration/generation.test.ts
// test/integration/validation.test.ts
// test/integration/mcp-tools.test.ts
```

### Day 4-5: Documentation & Examples
```markdown
# Task 6.3: Documentation
- API.md - Complete API reference
- TEMPLATES.md - Template documentation
- EXAMPLES.md - Cline usage examples
- TROUBLESHOOTING.md - Common issues

# Task 6.4: Example workflows
- examples/energy-report.md
- examples/fault-detection.md
- examples/data-analysis.md
```

### Deliverables:
- [ ] 90% test coverage
- [ ] Complete documentation
- [ ] Performance benchmarks
- [ ] Production deployment guide

---

## 🚀 Quick Start Tasks (Do Today!)

### Immediate Actions (1-2 hours)
```bash
# 1. Install dependencies
cd /Users/<user>/Code/axon-mcp-server
npm install haystack-core axios dotenv yaml

# 2. Create basic structure
mkdir -p src/skyspark src/generation src/templates
touch src/skyspark/haystackClient.ts
touch src/generation/typedAxonGenerator.ts

# 3. Set up environment
cp .env.example .env
# Edit .env with your SkySpark credentials

# 4. Create first test
cat > test-connection.ts << 'EOF'
import { HaystackSkySparkClient } from './src/skyspark/haystackClient';
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
  
  const result = await client.evalAxon('now()');
  console.log('Success!', result.toZinc());
}

test().catch(console.error);
EOF
```

---

## 📊 Success Metrics

### Week 1
- ✅ SkySpark connection working
- ✅ Basic Axon evaluation functional

### Week 2
- ✅ Generate valid Axon code from templates
- ✅ 5 working templates

### Week 3
- ✅ Catch 90% of syntax errors
- ✅ Provide fix suggestions

### Week 4
- ✅ All MCP tools integrated
- ✅ Natural language queries working

### Week 5
- ✅ 30+ templates covering main use cases
- ✅ Template search/discovery working

### Week 6
- ✅ Tests passing
- ✅ Documentation complete
- ✅ Ready for production use

---

## 🔗 Resources

- [haystack-core API](https://github.com/j2inn/haystack-core)
- [SkySpark REST API](https://skyfoundry.com/doc/skyarc/rest/index)
- [Axon Language Guide](https://skyfoundry.com/doc/axon/index)
- [MCP SDK Documentation](https://github.com/anthropics/model-context-protocol)

---

## 📝 Notes

- Start with Week 1 tasks immediately
- Test each component thoroughly before moving on
- Keep templates simple initially, enhance later
- Document as you build
- Get feedback early and often