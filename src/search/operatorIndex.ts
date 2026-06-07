import { AxonFunction } from '../types/index.js';

export interface OperatorUsage {
  operator: string;
  functionId: string;
  file: string;
  line: number;
  column: number;
  context: string;
  surroundingCode: string;
}

export interface OperatorStats {
  totalOperators: number;
  totalUsages: number;
  operatorCounts: Map<string, number>;
  mostUsedOperators: Array<{ operator: string; count: number }>;
}

export class OperatorIndex {
  // Map of operator -> function IDs that use it
  private operatorToFunctions: Map<string, Set<string>> = new Map();
  
  // Map of function ID -> operator usages in that function
  private functionToOperators: Map<string, OperatorUsage[]> = new Map();
  
  // Define all searchable operators
  private readonly OPERATORS = [
    // Comparison
    '==', '!=', '>', '<', '>=', '<=',
    // Arithmetic
    '+', '-', '*', '/', '%',
    // Logical
    '&&', '||', '!',
    // Bitwise
    '&', '|', '^', '~', '<<', '>>',
    // Other
    '?:', '=>', '..', '->', '?->'
  ];
  
  // Create regex patterns for each operator (escape special chars)
  private operatorPatterns: Map<string, RegExp>;
  
  constructor() {
    this.operatorPatterns = new Map();
    for (const op of this.OPERATORS) {
      // Escape special regex characters
      const escaped = op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Create pattern that matches the operator but not as part of a larger operator
      // For example, '>' should not match in '>=' or '>>'
      let pattern: RegExp;
      
      if (op === '>') {
        pattern = new RegExp(`(?<![>=-])${escaped}(?![>=])`, 'g');
      } else if (op === '<') {
        pattern = new RegExp(`(?<![<=-])${escaped}(?![<=])`, 'g');
      } else if (op === '=') {
        pattern = new RegExp(`(?<![!=<>])${escaped}(?![=>])`, 'g');
      } else if (op === '!') {
        pattern = new RegExp(`${escaped}(?!=)`, 'g');
      } else if (op === '&') {
        pattern = new RegExp(`(?<!&)${escaped}(?!&)`, 'g');
      } else if (op === '|') {
        pattern = new RegExp(`(?<!\\|)${escaped}(?!\\|)`, 'g');
      } else {
        pattern = new RegExp(escaped, 'g');
      }
      
      this.operatorPatterns.set(op, pattern);
    }
  }
  
  /**
   * Build operator index from functions
   */
  buildIndex(functions: Map<string, AxonFunction>): void {
    console.error('Building operator index...');
    const startTime = Date.now();
    
    // Clear existing index
    this.operatorToFunctions.clear();
    this.functionToOperators.clear();
    
    let totalUsages = 0;
    
    for (const [id, func] of functions) {
      const usages = this.extractOperators(func);
      if (usages.length > 0) {
        this.functionToOperators.set(id, usages);
        
        // Update operator -> functions mapping
        for (const usage of usages) {
          if (!this.operatorToFunctions.has(usage.operator)) {
            this.operatorToFunctions.set(usage.operator, new Set());
          }
          this.operatorToFunctions.get(usage.operator)!.add(id);
          totalUsages++;
        }
      }
    }
    
    const duration = Date.now() - startTime;
    console.error(`Operator index built in ${duration}ms with ${totalUsages} operator usages found`);
  }
  
  /**
   * Extract all operator usages from a function
   */
  private extractOperators(func: AxonFunction): OperatorUsage[] {
    const usages: OperatorUsage[] = [];
    const lines = func.sourceCode.split('\n');
    
    for (const [operator, pattern] of this.operatorPatterns) {
      // Reset regex state
      pattern.lastIndex = 0;
      
      let match;
      while ((match = pattern.exec(func.sourceCode)) !== null) {
        // Find line number and column
        let charCount = 0;
        let lineNum = 1;
        let column = 1;
        
        for (let i = 0; i < lines.length; i++) {
          if (charCount + lines[i].length >= match.index) {
            lineNum = i + 1;
            column = match.index - charCount + 1;
            break;
          }
          charCount += lines[i].length + 1; // +1 for newline
        }
        
        // Get context (the line containing the operator)
        const contextLine = lines[lineNum - 1] || '';
        
        // Get surrounding code (3 lines before and after)
        const startLine = Math.max(0, lineNum - 4);
        const endLine = Math.min(lines.length, lineNum + 3);
        const surroundingCode = lines.slice(startLine, endLine).join('\n');
        
        usages.push({
          operator,
          functionId: func.id,
          file: func.filePath,
          line: lineNum + (func.lineNumber || 0) - 1,
          column,
          context: contextLine.trim(),
          surroundingCode
        });
      }
    }
    
    return usages;
  }
  
  /**
   * Search for functions using a specific operator
   */
  searchOperator(operator: string, limit: number = 20): string[] {
    const functionIds = this.operatorToFunctions.get(operator);
    if (!functionIds) return [];
    
    return Array.from(functionIds).slice(0, limit);
  }
  
  /**
   * Get all operator usages for a function
   */
  getFunctionOperators(functionId: string): OperatorUsage[] {
    return this.functionToOperators.get(functionId) || [];
  }
  
  /**
   * Search for functions using multiple operators (AND operation)
   */
  searchMultipleOperators(operators: string[], limit: number = 20): string[] {
    if (operators.length === 0) return [];
    
    // Get functions for first operator
    let results = this.operatorToFunctions.get(operators[0]);
    if (!results) return [];
    
    // Intersect with other operators
    for (let i = 1; i < operators.length; i++) {
      const funcs = this.operatorToFunctions.get(operators[i]);
      if (!funcs) return [];
      
      results = new Set([...results].filter(id => funcs.has(id)));
    }
    
    return Array.from(results).slice(0, limit);
  }
  
  /**
   * Get operator usage statistics
   */
  getStats(): OperatorStats {
    const operatorCounts = new Map<string, number>();
    let totalUsages = 0;
    
    for (const [operator, functions] of this.operatorToFunctions) {
      const count = functions.size;
      operatorCounts.set(operator, count);
      totalUsages += count;
    }
    
    // Sort by usage count
    const mostUsedOperators = Array.from(operatorCounts.entries())
      .map(([operator, count]) => ({ operator, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    return {
      totalOperators: this.operatorToFunctions.size,
      totalUsages,
      operatorCounts,
      mostUsedOperators
    };
  }
  
  /**
   * Get all supported operators
   */
  getSupportedOperators(): string[] {
    return [...this.OPERATORS];
  }
}