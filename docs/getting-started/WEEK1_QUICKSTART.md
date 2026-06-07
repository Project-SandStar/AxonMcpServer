# Week 1 Quick Start: Fantom Bridge Setup

## Day 1: Environment Setup

### 1. Install Fantom
```bash
# macOS with Homebrew
brew install fantom

# Or download from https://fantom.org/download
# Add to PATH: export PATH=$PATH:/path/to/fantom/bin
```

### 2. Verify Installation
```bash
fan -version
# Should show: Fantom Launcher v1.0.x
```

### 3. Build Haxall Parser
```bash
cd /Users/<user>/Code/haxall
./bin/build.fan

# Or use the pre-built jars if available
```

## Day 2-3: Create Fantom Bridge Service

### Option A: Child Process Approach (Recommended for Quick Start)

Create a simple Fantom script that can be called from Node.js:

```fantom
// src/bridge/axonParser.fan
using concurrent
using axon
using haystack

class AxonParserService
{
  static Void main(Str[] args)
  {
    if (args.size == 0) 
    {
      echo("Usage: fan axonParser.fan <command> [args]")
      return
    }
    
    cmd := args[0]
    switch (cmd)
    {
      case "parse":
        parseCode(args.getSafe(1, ""))
      case "validate":
        validateCode(args.getSafe(1, ""))
      case "format":
        formatCode(args.getSafe(1, ""))
      default:
        echo("Unknown command: $cmd")
    }
  }
  
  static Void parseCode(Str code)
  {
    try
    {
      parser := Parser(Loc("input"), code.in)
      expr := parser.parse
      
      // Convert AST to JSON
      json := exprToJson(expr)
      echo(json)
    }
    catch (Err e)
    {
      result := ["error": e.msg, "line": e.line, "col": e.col]
      echo(JsonOutStream.writeJsonToStr(result))
    }
  }
  
  static Str exprToJson(Expr expr)
  {
    // Convert Fantom AST to JSON representation
    dict := expr.encode
    return JsonOutStream.writeJsonToStr(dict)
  }
}
```

### TypeScript Wrapper

```typescript
// src/bridge/fantomBridge.ts
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ASTNode {
  type: string;
  loc: Location;
  children?: ASTNode[];
  value?: any;
}

export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
  warnings?: ValidationWarning[];
  ast?: ASTNode;
}

export class FantomBridge {
  private fantomScript: string;
  
  constructor() {
    this.fantomScript = path.join(__dirname, 'axonParser.fan');
  }
  
  async parseAxon(code: string): Promise<ASTNode> {
    try {
      const { stdout } = await execAsync(
        `fan "${this.fantomScript}" parse "${this.escapeCode(code)}"`
      );
      return JSON.parse(stdout);
    } catch (error) {
      throw new Error(`Parse error: ${error.message}`);
    }
  }
  
  async validateSyntax(code: string): Promise<ValidationResult> {
    try {
      const ast = await this.parseAxon(code);
      return { valid: true, ast };
    } catch (error) {
      return {
        valid: false,
        errors: [this.parseError(error)]
      };
    }
  }
  
  private escapeCode(code: string): string {
    return code.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }
  
  private parseError(error: any): ValidationError {
    // Parse Fantom error messages
    const match = error.message.match(/line:(\d+) col:(\d+): (.+)/);
    if (match) {
      return {
        line: parseInt(match[1]),
        column: parseInt(match[2]),
        message: match[3],
        severity: 'error'
      };
    }
    return {
      line: 1,
      column: 1,
      message: error.message,
      severity: 'error'
    };
  }
}
```

## Day 4-5: Test Integration

### Create Test Suite

```typescript
// src/bridge/__tests__/fantomBridge.test.ts
import { FantomBridge } from '../fantomBridge';

describe('FantomBridge', () => {
  let bridge: FantomBridge;
  
  beforeEach(() => {
    bridge = new FantomBridge();
  });
  
  test('parses valid Axon code', async () => {
    const code = 'readAll(site).size';
    const ast = await bridge.parseAxon(code);
    
    expect(ast).toBeDefined();
    expect(ast.type).toBe('call');
  });
  
  test('validates syntax correctly', async () => {
    const validCode = 'readAll(ahu).map(x => x->airFlow)';
    const result = await bridge.validateSyntax(validCode);
    
    expect(result.valid).toBe(true);
    expect(result.ast).toBeDefined();
  });
  
  test('catches syntax errors', async () => {
    const invalidCode = 'readAll(ahu.map(x => x->airFlow)'; // missing )
    const result = await bridge.validateSyntax(invalidCode);
    
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('Expecting');
  });
});
```

### Sample Axon Code for Testing

```typescript
// src/bridge/__tests__/samples.ts
export const SAMPLE_CODE = {
  simple: 'readAll(site)',
  
  withFilter: 'readAll(ahu and siteRef==@site)',
  
  withMap: `readAll(equip).map(e => {
    name: e.dis,
    points: readAll(point and equipRef==e->id).size
  })`,
  
  withHistory: `read(@point)->hisRead(yesterday).hisRollup(avg, 1hr)`,
  
  spark: `readAll(ahu).map(equip => do
    dat: read(equip->discharge)
    oat: read(equip->outside)
    if (dat->curVal > oat->curVal) equip
    else null
  end).removeNull()`,
  
  complex: `// Calculate monthly energy by meter type
  lastMonth: dateTime(today()).toDateSpan("M-1")
  readAll(meter).findAll(m => m->elecMeter).map(meter => do
    energy: read(meter)->hisRead(kWh, lastMonth).hisRollup(sum, 1mo).first["v0"]
    cost: energy * read(meter->utilityRate->costPerKwh)
    {meter: meter.dis, energy: energy, cost: cost}
  end)`
};
```

## Alternative: REST Service Approach

If the child process approach has issues, create a simple REST service:

```fantom
// src/bridge/axonParserServer.fan
using web
using wisp
using axon

class AxonParserServer : AbstractMain
{
  @Opt { help = "Port to bind to" }
  Int port := 8080

  override Int run()
  {
    wisp := WispService
    {
      it.port = this.port
      it.root = AxonParserMod()
    }
    return runServices([wisp])
  }
}

class AxonParserMod : WebMod
{
  override Void onService()
  {
    // Handle CORS
    res.headers["Access-Control-Allow-Origin"] = "*"
    
    if (req.method == "POST" && req.uri.path == ["parse"])
    {
      code := req.body.readAllStr
      result := parseAxon(code)
      res.headers["Content-Type"] = "application/json"
      res.out.print(result).close
    }
    else
    {
      res.sendErr(404)
    }
  }
  
  Str parseAxon(Str code)
  {
    try
    {
      parser := Parser(Loc("api"), code.in)
      expr := parser.parse
      return JsonOutStream.writeJsonToStr(["success": true, "ast": expr.encode])
    }
    catch (Err e)
    {
      return JsonOutStream.writeJsonToStr(["success": false, "error": e.msg])
    }
  }
}
```

## Troubleshooting

### Common Issues

1. **Fantom Not Found**
   ```bash
   # Add to ~/.zshrc or ~/.bashrc
   export FAN_HOME=/path/to/fantom
   export PATH=$PATH:$FAN_HOME/bin
   ```

2. **Haxall Classes Not Found**
   ```bash
   # Set classpath to include Haxall jars
   export FAN_ENV_PATH=$FAN_ENV_PATH:/Users/<user>/Code/haxall/lib/fan
   ```

3. **Permission Issues**
   ```bash
   chmod +x /Users/<user>/Code/haxall/bin/*
   ```

## Next Steps

Once the bridge is working:
1. Create TypeScript interfaces for all AST node types
2. Implement code generation helpers
3. Build template system foundation
4. Set up CI/CD for automated testing

## Resources
- Fantom Docs: https://fantom.org/doc/
- Haxall Build Guide: https://haxall.io/doc/docHaxall/Setup.html
- Axon Grammar: https://haxall.io/doc/lib-axon/doc/Grammar.html