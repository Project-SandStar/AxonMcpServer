import { FunctionUsage, BUILTIN_FUNCTIONS } from '../types/functionUsage.js';
import * as path from 'path';

export class FunctionUsageParser {
  private userDefinedFunctions: Set<string>;

  constructor(userDefinedFunctions?: Set<string>) {
    this.userDefinedFunctions = userDefinedFunctions || new Set();
  }

  /**
   * Parse Axon code and extract all function usages
   */
  parseFunctionUsages(code: string, filePath: string): FunctionUsage[] {
    const usages: FunctionUsage[] = [];
    const lines = code.split('\n');
    
    // Find the current function being defined (if any)
    let currentFunction: string | undefined;
    const funcDefPattern = /^\s*\(([^)]*)\)\s*=>\s*do/;
    
    lines.forEach((line, index) => {
      const funcDefMatch = line.match(funcDefPattern);
      if (funcDefMatch) {
        // Extract function name from file path
        currentFunction = path.basename(filePath, '.axon');
      }
      
      // Look for function calls in the line
      const lineUsages = this.extractFunctionCalls(line, index + 1, filePath, currentFunction);
      usages.push(...lineUsages);
    });

    // Add surrounding context to each usage
    usages.forEach(usage => {
      usage.surroundingLines = this.getContextLines(lines, usage.line - 1);
    });

    return usages;
  }

  /**
   * Extract function calls from a single line
   */
  private extractFunctionCalls(
    line: string, 
    lineNumber: number, 
    filePath: string,
    callingFunction?: string
  ): FunctionUsage[] {
    const usages: FunctionUsage[] = [];
    
    // Pattern to match function calls including method calls
    // Matches: functionName(...) or object.methodName(...)
    const functionCallPattern = /(?:(\w+)\.)?(\w+)\s*\(/g;
    
    let match;
    while ((match = functionCallPattern.exec(line)) !== null) {
      const receiver = match[1];
      const functionName = match[2];
      const column = match.index + (receiver ? receiver.length + 1 : 0);
      
      // Skip certain keywords that look like function calls
      if (this.isKeyword(functionName)) continue;
      
      // Extract arguments
      const args = this.extractArguments(line, match.index + match[0].length - 1);
      
      const usage: FunctionUsage = {
        functionName,
        file: filePath,
        line: lineNumber,
        column,
        context: line.trim(),
        arguments: args,
        callingFunction,
        isMethodCall: !!receiver,
        receiver,
        functionType: this.getFunctionType(functionName)
      };
      
      usages.push(usage);
    }

    // Also check for function references (without parentheses)
    // e.g., sites.map(toRec) where toRec is a function reference
    const funcRefPattern = /(?:map|filter|find|findAll|each|fold|reduce|sort|sortr)\s*\(\s*(\w+)\s*\)/g;
    while ((match = funcRefPattern.exec(line)) !== null) {
      const functionName = match[1];
      if (!this.isKeyword(functionName)) {
        usages.push({
          functionName,
          file: filePath,
          line: lineNumber,
          column: match.index + match[0].indexOf(functionName),
          context: line.trim(),
          arguments: [],
          callingFunction,
          isMethodCall: false,
          functionType: this.getFunctionType(functionName)
        });
      }
    }

    return usages;
  }

  /**
   * Extract function arguments from the code
   */
  private extractArguments(code: string, startPos: number): string[] {
    const args: string[] = [];
    let depth = 1;
    let currentArg = '';
    let inString = false;
    let stringChar = '';
    
    for (let i = startPos; i < code.length && depth > 0; i++) {
      const char = code[i];
      
      // Handle string literals
      if ((char === '"' || char === "'") && (i === 0 || code[i - 1] !== '\\')) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
      }
      
      if (!inString) {
        if (char === '(') depth++;
        else if (char === ')') {
          depth--;
          if (depth === 0) {
            if (currentArg.trim()) args.push(currentArg.trim());
            break;
          }
        } else if (char === ',' && depth === 1) {
          if (currentArg.trim()) args.push(currentArg.trim());
          currentArg = '';
          continue;
        }
      }
      
      if (depth > 0) currentArg += char;
    }
    
    return args;
  }

  /**
   * Get surrounding lines for context
   */
  private getContextLines(lines: string[], targetLine: number, contextSize: number = 2): string[] {
    const start = Math.max(0, targetLine - contextSize);
    const end = Math.min(lines.length, targetLine + contextSize + 1);
    return lines.slice(start, end);
  }

  /**
   * Determine if a name is a keyword rather than a function
   */
  private isKeyword(name: string): boolean {
    const keywords = new Set([
      'if', 'else', 'do', 'end', 'return', 'throw', 'try', 'catch',
      'finally', 'for', 'while', 'break', 'continue', 'switch', 'case',
      'default', 'function', 'const', 'let', 'var'
    ]);
    return keywords.has(name);
  }

  /**
   * Determine the type of function (builtin, user-defined, or unknown)
   */
  private getFunctionType(functionName: string): 'builtin' | 'user-defined' | 'unknown' {
    if (BUILTIN_FUNCTIONS.has(functionName)) return 'builtin';
    if (this.userDefinedFunctions.has(functionName)) return 'user-defined';
    return 'unknown';
  }

  /**
   * Update the set of known user-defined functions
   */
  updateUserDefinedFunctions(functions: Set<string>) {
    this.userDefinedFunctions = functions;
  }

  /**
   * Extract function calls from an entire codebase
   */
  async parseCodebase(files: Array<{path: string; content: string}>): Promise<FunctionUsage[]> {
    const allUsages: FunctionUsage[] = [];
    
    for (const file of files) {
      const usages = this.parseFunctionUsages(file.content, file.path);
      allUsages.push(...usages);
    }
    
    return allUsages;
  }

  /**
   * Find complex usage patterns (e.g., chained calls)
   */
  findChainedCalls(code: string, filePath: string): FunctionUsage[] {
    const usages: FunctionUsage[] = [];
    const lines = code.split('\n');
    
    // Pattern for chained method calls like: readAll(site).map(s => s.dis).filter(...)
    const chainPattern = /(\w+)\s*\([^)]*\)(?:\s*\.\s*\w+\s*\([^)]*\))*/g;
    
    lines.forEach((line, index) => {
      let match;
      while ((match = chainPattern.exec(line)) !== null) {
        const chain = match[0];
        const methods = chain.match(/\w+(?=\s*\()/g) || [];
        
        methods.forEach((method, i) => {
          if (i > 0) { // Skip the first one as it's already captured by normal parsing
            usages.push({
              functionName: method,
              file: filePath,
              line: index + 1,
              column: line.indexOf(method),
              context: chain,
              arguments: [],
              isMethodCall: true,
              receiver: methods[i - 1],
              functionType: this.getFunctionType(method)
            });
          }
        });
      }
    });
    
    return usages;
  }
}