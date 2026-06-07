import { HaystackSkySparkClient, ValidationResult, ErrorCategory } from '../skyspark/haystackClient';
import { HDict, HGrid } from 'haystack-core';

export interface SemanticValidationResult extends ValidationResult {
  warnings?: ValidationWarning[];
  suggestions?: string[];
  functionCalls?: FunctionCallInfo[];
}

export interface ValidationWarning {
  type: 'deprecated' | 'performance' | 'null_safety' | 'data_availability';
  message: string;
  line?: number;
  column?: number;
}

export interface FunctionCallInfo {
  name: string;
  signature: string;
  providedArgs: number;
  expectedArgs: string;
  line?: number;
}

export interface FunctionSignature {
  name: string;
  sig: string;
  params: Array<{
    name: string;
    type: string;
    optional: boolean;
  }>;
  returns: string;
  deprecated?: boolean;
}

export class SemanticValidator {
  private functionCache: Map<string, FunctionSignature> = new Map();
  private lastCacheUpdate: number = 0;
  private readonly cacheTimeout = 300000; // 5 minutes
  
  constructor(private client: HaystackSkySparkClient) {}
  
  /**
   * Perform comprehensive semantic validation
   */
  async validate(code: string): Promise<SemanticValidationResult> {
    // First do syntax validation
    const syntaxResult = await this.client.validateAxon(code);
    
    if (!syntaxResult.valid) {
      return syntaxResult;
    }
    
    // If syntax is valid, perform semantic checks
    const warnings: ValidationWarning[] = [];
    const suggestions: string[] = [];
    const functionCalls: FunctionCallInfo[] = [];
    
    // Update function cache if needed
    await this.updateFunctionCache();
    
    // Extract function calls from code
    const calls = this.extractFunctionCalls(code);
    
    // Validate each function call
    for (const call of calls) {
      const validation = await this.validateFunctionCall(call, code);
      if (validation.warning) warnings.push(validation.warning);
      if (validation.suggestion) suggestions.push(validation.suggestion);
      if (validation.functionCall) functionCalls.push(validation.functionCall);
    }
    
    // Check for data availability issues
    const dataWarnings = await this.checkDataAvailability(code);
    warnings.push(...dataWarnings);
    
    // Check for null safety
    const nullSafetyWarnings = this.checkNullSafety(code);
    warnings.push(...nullSafetyWarnings);
    
    return {
      valid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
      functionCalls: functionCalls.length > 0 ? functionCalls : undefined
    };
  }
  
  /**
   * Update the function cache from SkySpark
   */
  private async updateFunctionCache(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCacheUpdate < this.cacheTimeout) {
      return; // Cache is still fresh
    }
    
    try {
      // Get all available functions
      const functionsGrid = await this.client.listFunctions();
      
      for (const func of functionsGrid) {
        const name = func.get('name')?.toString();
        const sig = func.get('sig')?.toString();
        
        if (name && sig) {
          const signature = this.parseFunctionSignature(name, sig, func);
          this.functionCache.set(name, signature);
        }
      }
      
      this.lastCacheUpdate = now;
    } catch (error) {
      console.warn('Failed to update function cache:', error);
    }
  }
  
  /**
   * Parse function signature from SkySpark
   */
  private parseFunctionSignature(name: string, sig: string, func: HDict): FunctionSignature {
    const params: FunctionSignature['params'] = [];
    let returns = 'Obj';
    
    // Parse signature format: (param1: Type1, param2?: Type2) => ReturnType
    const paramMatch = sig.match(/\(([^)]*)\)/);
    const returnMatch = sig.match(/=>\s*(\w+)$/);
    
    if (returnMatch) {
      returns = returnMatch[1];
    }
    
    if (paramMatch && paramMatch[1]) {
      const paramStr = paramMatch[1];
      const paramParts = paramStr.split(',').map(p => p.trim());
      
      for (const part of paramParts) {
        const optional = part.includes('?');
        const [paramName, paramType = 'Obj'] = part.split(':').map(s => s.trim().replace('?', ''));
        
        params.push({
          name: paramName,
          type: paramType,
          optional
        });
      }
    }
    
    return {
      name,
      sig,
      params,
      returns,
      deprecated: func.has('deprecated')
    };
  }
  
  /**
   * Extract function calls from Axon code
   */
  private extractFunctionCalls(code: string): Array<{name: string; args: string[]; position: number}> {
    const calls: Array<{name: string; args: string[]; position: number}> = [];
    
    // Regex to match function calls
    const funcRegex = /(\w+)\s*\(/g;
    let match;
    
    while ((match = funcRegex.exec(code)) !== null) {
      const name = match[1];
      const position = match.index;
      
      // Skip known non-functions
      if (['if', 'do', 'end', 'else', 'try', 'catch', 'throw'].includes(name)) {
        continue;
      }
      
      // Extract arguments
      const args = this.extractArguments(code, position + match[0].length - 1);
      
      calls.push({ name, args, position });
    }
    
    return calls;
  }
  
  /**
   * Extract arguments from a function call
   */
  private extractArguments(code: string, startPos: number): string[] {
    const args: string[] = [];
    let depth = 1;
    let current = '';
    let inString = false;
    let stringChar = '';
    
    for (let i = startPos + 1; i < code.length && depth > 0; i++) {
      const char = code[i];
      
      if (inString) {
        current += char;
        if (char === stringChar && code[i - 1] !== '\\') {
          inString = false;
        }
      } else {
        if (char === '"' || char === "'") {
          inString = true;
          stringChar = char;
          current += char;
        } else if (char === '(') {
          depth++;
          current += char;
        } else if (char === ')') {
          depth--;
          if (depth === 0) {
            if (current.trim()) args.push(current.trim());
          } else {
            current += char;
          }
        } else if (char === ',' && depth === 1) {
          if (current.trim()) args.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
    }
    
    return args;
  }
  
  /**
   * Validate a function call
   */
  private async validateFunctionCall(
    call: {name: string; args: string[]; position: number}, 
    code: string
  ): Promise<{
    warning?: ValidationWarning;
    suggestion?: string;
    functionCall?: FunctionCallInfo;
  }> {
    const result: any = {};
    
    // Check if function exists
    const signature = this.functionCache.get(call.name);
    
    if (!signature) {
      // Try common function name corrections
      const corrections = this.suggestFunctionCorrections(call.name);
      if (corrections.length > 0) {
        result.suggestion = `Unknown function '${call.name}'. Did you mean: ${corrections.join(', ')}?`;
      }
    } else {
      // Check if deprecated
      if (signature.deprecated) {
        result.warning = {
          type: 'deprecated' as const,
          message: `Function '${call.name}' is deprecated`,
          line: this.getLineNumber(code, call.position)
        };
      }
      
      // Check argument count
      const requiredArgs = signature.params.filter(p => !p.optional).length;
      const maxArgs = signature.params.length;
      const providedArgs = call.args.length;
      
      if (providedArgs < requiredArgs) {
        result.functionCall = {
          name: call.name,
          signature: signature.sig,
          providedArgs,
          expectedArgs: requiredArgs === maxArgs ? `${requiredArgs}` : `${requiredArgs}-${maxArgs}`,
          line: this.getLineNumber(code, call.position)
        };
        
        result.suggestion = `Function '${call.name}' requires at least ${requiredArgs} arguments, but ${providedArgs} provided`;
      } else if (providedArgs > maxArgs) {
        result.warning = {
          type: 'performance' as const,
          message: `Function '${call.name}' called with ${providedArgs} arguments but expects at most ${maxArgs}`,
          line: this.getLineNumber(code, call.position)
        };
      }
    }
    
    return result;
  }
  
  /**
   * Suggest function name corrections
   */
  private suggestFunctionCorrections(name: string): string[] {
    const suggestions: string[] = [];
    const lowerName = name.toLowerCase();
    
    // Check for common typos and similar functions
    for (const [funcName] of this.functionCache) {
      const lowerFunc = funcName.toLowerCase();
      
      // Exact match with different case
      if (lowerFunc === lowerName && funcName !== name) {
        suggestions.push(funcName);
      }
      
      // Levenshtein distance <= 2
      else if (this.levenshteinDistance(lowerName, lowerFunc) <= 2) {
        suggestions.push(funcName);
      }
      
      // Common prefix
      else if (lowerFunc.startsWith(lowerName.slice(0, 3)) && lowerName.length >= 3) {
        suggestions.push(funcName);
      }
    }
    
    return suggestions.slice(0, 3);
  }
  
  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[b.length][a.length];
  }
  
  /**
   * Check for data availability issues
   */
  private async checkDataAvailability(code: string): Promise<ValidationWarning[]> {
    const warnings: ValidationWarning[] = [];
    
    // Check for common data patterns that might not exist
    const patterns = [
      { regex: /readAll\s*\(\s*([^)]+)\s*\)/g, type: 'filter' },
      { regex: /read\s*\(\s*([^)]+)\s*\)/g, type: 'ref' },
      { regex: /(\w+)->(\w+)/g, type: 'tag' }
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(code)) !== null) {
        if (pattern.type === 'filter') {
          // Check for overly complex filters
          const filter = match[1];
          const complexity = (filter.match(/and|or/g) || []).length;
          if (complexity > 3) {
            warnings.push({
              type: 'performance',
              message: `Complex filter with ${complexity + 1} conditions may be slow. Consider breaking it down.`,
              line: this.getLineNumber(code, match.index)
            });
          }
        } else if (pattern.type === 'tag') {
          // Check for common missing tags
          const tag = match[2];
          const riskyTags = ['curVal', 'curStatus', 'curErr', 'writeVal', 'writeStatus'];
          if (riskyTags.includes(tag)) {
            warnings.push({
              type: 'data_availability',
              message: `Tag '${tag}' may not be available on all points. Consider adding null checks.`,
              line: this.getLineNumber(code, match.index)
            });
          }
        }
      }
    }
    
    return warnings;
  }
  
  /**
   * Check for null safety issues
   */
  private checkNullSafety(code: string): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    
    // Patterns that might need null checks
    const patterns = [
      { regex: /(\w+)->(\w+)(?!\s*\?)/g, message: 'Direct tag access without null check' },
      { regex: /\.first(?!\s*\(false\))/g, message: '.first() without false parameter may throw if empty' },
      { regex: /\[0\]/g, message: 'Array index access without bounds check' }
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(code)) !== null) {
        // Skip if in a try block
        if (!this.isInTryBlock(code, match.index)) {
          warnings.push({
            type: 'null_safety',
            message: pattern.message,
            line: this.getLineNumber(code, match.index)
          });
        }
      }
    }
    
    return warnings;
  }
  
  /**
   * Check if position is inside a try block
   */
  private isInTryBlock(code: string, position: number): boolean {
    const before = code.substring(0, position);
    const after = code.substring(position);
    
    // Count try/end pairs before position
    const tryCount = (before.match(/\btry\b/g) || []).length;
    const endBeforeCount = (before.match(/\bend\b/g) || []).length;
    const catchBeforeCount = (before.match(/\bcatch\b/g) || []).length;
    
    // We're in a try block if there are more try's than end's
    return tryCount > endBeforeCount - catchBeforeCount;
  }
  
  /**
   * Get line number from position
   */
  private getLineNumber(code: string, position: number): number {
    const lines = code.substring(0, position).split('\n');
    return lines.length;
  }
}