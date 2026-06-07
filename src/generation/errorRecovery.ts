import { ValidationResult, ErrorCategory } from '../skyspark/haystackClient';

export interface ErrorFix {
  description: string;
  fixedCode: string;
  confidence: 'high' | 'medium' | 'low';
  explanation?: string;
}

export interface RecoveryResult {
  originalError: ValidationResult;
  fixes: ErrorFix[];
  alternatives: string[];
  learnMore?: string;
}

export class ErrorRecovery {
  private readonly commonFixes: Map<string, (code: string, error: ValidationResult) => ErrorFix[]> = new Map();
  
  constructor() {
    this.initializeCommonFixes();
  }
  
  /**
   * Initialize common error patterns and their fixes
   */
  private initializeCommonFixes() {
    // Unknown function fixes
    this.commonFixes.set('unknown_function', (code, error) => {
      const fixes: ErrorFix[] = [];
      const errorMsg = error.message || error.error || '';
      
      // Extract function name from error
      const funcMatch = errorMsg.match(/Unknown func[:\s]+(\w+)/i);
      if (!funcMatch) return fixes;
      
      const funcName = funcMatch[1];
      const corrections = this.getFunctionCorrections(funcName);
      
      for (const correction of corrections) {
        fixes.push({
          description: `Replace '${funcName}' with '${correction.correct}'`,
          fixedCode: code.replace(new RegExp(`\\b${funcName}\\b`, 'g'), correction.correct),
          confidence: correction.confidence,
          explanation: correction.reason
        });
      }
      
      return fixes;
    });
    
    // Type error fixes
    this.commonFixes.set('type_error', (code, error) => {
      const fixes: ErrorFix[] = [];
      
      // Common type conversions
      if (error.message?.includes('Number') && error.message?.includes('Str')) {
        fixes.push({
          description: 'Add number to string conversion',
          fixedCode: this.addTypeConversion(code, error, 'toStr()'),
          confidence: 'high',
          explanation: 'Convert number to string using toStr()'
        });
      }
      
      if (error.message?.includes('Str') && error.message?.includes('Number')) {
        fixes.push({
          description: 'Add string to number conversion',
          fixedCode: this.addTypeConversion(code, error, 'parseNumber()'),
          confidence: 'medium',
          explanation: 'Parse string to number using parseNumber()'
        });
      }
      
      return fixes;
    });
    
    // Argument error fixes
    this.commonFixes.set('argument_error', (code, error) => {
      const fixes: ErrorFix[] = [];
      
      // Missing argument
      if (error.message?.includes('expects') || error.message?.includes('required')) {
        const funcMatch = code.match(/(\w+)\s*\(\s*\)/);
        if (funcMatch) {
          const funcName = funcMatch[1];
          const defaults = this.getDefaultArguments(funcName);
          
          if (defaults) {
            fixes.push({
              description: `Add default arguments to ${funcName}()`,
              fixedCode: code.replace(`${funcName}()`, `${funcName}(${defaults})`),
              confidence: 'medium',
              explanation: 'Added commonly used default arguments'
            });
          }
        }
      }
      
      // Too many arguments
      if (error.message?.includes('too many')) {
        fixes.push({
          description: 'Remove extra arguments',
          fixedCode: this.removeExtraArguments(code, error),
          confidence: 'medium'
        });
      }
      
      return fixes;
    });
    
    // Unknown variable fixes
    this.commonFixes.set('unknown_variable', (code, error) => {
      const fixes: ErrorFix[] = [];
      const varMatch = error.message?.match(/Unknown var[:\s]+(\w+)/i);
      
      if (varMatch) {
        const varName = varMatch[1];
        
        // Check if it's a missing tag reference
        if (code.includes(`${varName}->`)) {
          fixes.push({
            description: `Add 'it->' prefix for implicit variable`,
            fixedCode: code.replace(new RegExp(`\\b${varName}->`, 'g'), `it->${varName}->`),
            confidence: 'medium',
            explanation: 'In map/each blocks, use "it" to reference current item'
          });
        }
        
        // Check if variable should be defined
        fixes.push({
          description: `Define variable '${varName}'`,
          fixedCode: `${varName}: null // TODO: Define this variable\n${code}`,
          confidence: 'low',
          explanation: 'Add variable definition at the beginning'
        });
      }
      
      return fixes;
    });
    
    // Filter error fixes
    this.commonFixes.set('filter_error', (code, error) => {
      const fixes: ErrorFix[] = [];
      
      // Invalid filter syntax
      if (error.message?.includes('filter')) {
        // Check for missing quotes
        const filterMatch = code.match(/readAll\s*\(([^)]+)\)/);
        if (filterMatch) {
          const filter = filterMatch[1];
          
          // Fix string comparisons without quotes
          if (filter.match(/==\s*[a-zA-Z]+(?!["\'])/)) {
            const fixedFilter = filter.replace(/==\s*([a-zA-Z]+)(?!["\'])/g, '=="$1"');
            fixes.push({
              description: 'Add quotes to string values in filter',
              fixedCode: code.replace(filter, fixedFilter),
              confidence: 'high',
              explanation: 'String values in filters must be quoted'
            });
          }
          
          // Fix tag paths
          if (filter.includes('.')) {
            fixes.push({
              description: 'Replace dot notation with arrow notation',
              fixedCode: code.replace(filter, filter.replace(/\./g, '->')),
              confidence: 'high',
              explanation: 'Use -> for tag access in filters'
            });
          }
        }
      }
      
      return fixes;
    });
    
    // Syntax error fixes
    this.commonFixes.set('syntax', (code, error) => {
      const fixes: ErrorFix[] = [];
      
      // Missing closing parenthesis
      if (error.message?.includes('paren') || error.message?.includes(')')) {
        const openCount = (code.match(/\(/g) || []).length;
        const closeCount = (code.match(/\)/g) || []).length;
        
        if (openCount > closeCount) {
          fixes.push({
            description: 'Add missing closing parenthesis',
            fixedCode: code + ')'.repeat(openCount - closeCount),
            confidence: 'high',
            explanation: `Found ${openCount} opening but only ${closeCount} closing parentheses`
          });
        }
      }
      
      // Missing 'do' in blocks
      if (code.includes('=>') && !code.includes('do')) {
        fixes.push({
          description: 'Add missing "do" keyword',
          fixedCode: code.replace(/=>\s*(?!do)/, '=> do\n  ').replace(/(\n\s*)([^}]+)$/, '$1$2\nend'),
          confidence: 'medium',
          explanation: 'Multi-line blocks need do...end'
        });
      }
      
      // Unclosed string
      const stringMatches = code.match(/["']/g) || [];
      if (stringMatches.length % 2 !== 0) {
        fixes.push({
          description: 'Close unclosed string',
          fixedCode: code + '"',
          confidence: 'medium',
          explanation: 'Found unclosed string literal'
        });
      }
      
      return fixes;
    });
  }
  
  /**
   * Attempt to recover from an error
   */
  recover(code: string, error: ValidationResult): RecoveryResult {
    const fixes: ErrorFix[] = [];
    const alternatives: string[] = [];
    
    // Get specific fixes based on error category
    const category = error.category || 'syntax';
    const fixFunction = this.commonFixes.get(category);
    
    if (fixFunction) {
      fixes.push(...fixFunction(code, error));
    }
    
    // Add general fixes that work for many errors
    fixes.push(...this.getGeneralFixes(code, error));
    
    // Generate alternative approaches
    alternatives.push(...this.generateAlternatives(code, error));
    
    // Add learning resources
    const learnMore = this.getLearnMoreLink(error);
    
    return {
      originalError: error,
      fixes,
      alternatives,
      learnMore
    };
  }
  
  /**
   * Get function name corrections
   */
  private getFunctionCorrections(funcName: string): Array<{correct: string; confidence: 'high' | 'medium' | 'low'; reason: string}> {
    const corrections: Array<{correct: string; confidence: 'high' | 'medium' | 'low'; reason: string}> = [];
    const lower = funcName.toLowerCase();
    
    // Common misspellings
    const commonMisspellings: Record<string, string> = {
      'readall': 'readAll',
      'hisread': 'hisRead',
      'hiswrite': 'hisWrite',
      'findall': 'findAll',
      'parsedate': 'parseDate',
      'parsenumber': 'parseNumber',
      'tostring': 'toStr',
      'today': 'today()',
      'now': 'now()',
      'yesterday': 'yesterday()',
      'isnull': 'isNull',
      'isnan': 'isNaN'
    };
    
    if (commonMisspellings[lower]) {
      corrections.push({
        correct: commonMisspellings[lower],
        confidence: 'high',
        reason: 'Common misspelling - incorrect case'
      });
    }
    
    // Similar function names
    const similarFunctions: Record<string, Array<{name: string; reason: string}>> = {
      'get': [{name: 'trap', reason: 'Use trap() for safe property access'}, {name: 'get', reason: 'Use -> for tag access'}],
      'filter': [{name: 'findAll', reason: 'Use findAll() to filter collections'}, {name: 'filter', reason: 'Use parseFilter() to create filter'}],
      'select': [{name: 'readAll', reason: 'Use readAll() to query database'}, {name: 'map', reason: 'Use map() to transform data'}],
      'count': [{name: 'size', reason: 'Use size() to count items'}],
      'length': [{name: 'size', reason: 'Use size() for collections'}],
      'sum': [{name: 'fold', reason: 'Use fold(sum) to sum values'}],
      'average': [{name: 'fold', reason: 'Use fold(avg) to average values'}],
      'min': [{name: 'fold', reason: 'Use fold(min) to find minimum'}],
      'max': [{name: 'fold', reason: 'Use fold(max) to find maximum'}]
    };
    
    const lowerKey = Object.keys(similarFunctions).find(k => lower.includes(k));
    if (lowerKey && similarFunctions[lowerKey]) {
      for (const similar of similarFunctions[lowerKey]) {
        corrections.push({
          correct: similar.name,
          confidence: 'medium',
          reason: similar.reason
        });
      }
    }
    
    return corrections.slice(0, 3); // Return top 3 suggestions
  }
  
  /**
   * Get default arguments for common functions
   */
  private getDefaultArguments(funcName: string): string | null {
    const defaults: Record<string, string> = {
      'hisRead': 'yesterday',
      'hisWrite': '{ts: now(), val: 0}',
      'hisRollup': 'avg, 1hr',
      'limit': '100',
      'sort': '"name"',
      'trap': 'null',
      'as': '"kWh"'
    };
    
    return defaults[funcName] || null;
  }
  
  /**
   * Add type conversion
   */
  private addTypeConversion(code: string, error: ValidationResult, conversion: string): string {
    if (error.line) {
      const lines = code.split('\n');
      const lineIdx = error.line - 1;
      
      if (lineIdx >= 0 && lineIdx < lines.length) {
        const line = lines[lineIdx];
        // Simple heuristic: add conversion to the end of the expression
        lines[lineIdx] = line.replace(/([a-zA-Z_]\w*)(\s*[,\)]|$)/, `$1.${conversion}$2`);
        return lines.join('\n');
      }
    }
    
    return code;
  }
  
  /**
   * Remove extra arguments
   */
  private removeExtraArguments(code: string, error: ValidationResult): string {
    const funcMatch = error.message?.match(/(\w+)\s+expects\s+(\d+)/);
    if (funcMatch) {
      const funcName = funcMatch[1];
      const expectedArgs = parseInt(funcMatch[2]);
      
      const regex = new RegExp(`${funcName}\\s*\\(([^)]+)\\)`, 'g');
      return code.replace(regex, (match, args) => {
        const argList = args.split(',');
        if (argList.length > expectedArgs) {
          const trimmedArgs = argList.slice(0, expectedArgs).join(',');
          return `${funcName}(${trimmedArgs})`;
        }
        return match;
      });
    }
    
    return code;
  }
  
  /**
   * Get general fixes that apply to many error types
   */
  private getGeneralFixes(code: string, error: ValidationResult): ErrorFix[] {
    const fixes: ErrorFix[] = [];
    
    // Try wrapping in try-catch
    if (!code.includes('try')) {
      fixes.push({
        description: 'Wrap code in try-catch block',
        fixedCode: `try do\n  ${code.split('\n').map(line => '  ' + line).join('\n')}\nend catch (ex) do\n  {error: ex.toStr()}\nend`,
        confidence: 'low',
        explanation: 'Handle errors gracefully with try-catch'
      });
    }
    
    // Check for common missing imports/dependencies
    if (error.message?.includes('func') && code.includes('funcs()')) {
      fixes.push({
        description: 'Check if function is project-specific',
        fixedCode: code,
        confidence: 'low',
        explanation: 'This function might be defined in your project. Check readAll(func) for available functions.'
      });
    }
    
    return fixes;
  }
  
  /**
   * Generate alternative approaches
   */
  private generateAlternatives(code: string, error: ValidationResult): string[] {
    const alternatives: string[] = [];
    
    // For complex queries, suggest breaking them down
    if (code.length > 200 || (code.match(/\./g) || []).length > 5) {
      alternatives.push('Break this complex expression into smaller steps with intermediate variables');
    }
    
    // For filter errors, suggest using parseFilter
    if (error.category === 'filter_error') {
      alternatives.push('Use parseFilter() to validate filter syntax before using it');
      alternatives.push('Build filter programmatically using filter expression functions');
    }
    
    // For type errors, suggest checking types
    if (error.category === 'type_error') {
      alternatives.push('Add type checking: if (val.typeof.name == "Number") ...');
      alternatives.push('Use trap() for safe type conversions: val.trap(null, v => v.toStr())');
    }
    
    // For unknown functions, suggest exploring available functions
    if (error.category === 'unknown_function') {
      alternatives.push('List available functions: funcs().map(f => f->name).sort.join(", ")');
      alternatives.push('Search for functions: funcs().findAll(f => f->name.contains("search term"))');
    }
    
    return alternatives;
  }
  
  /**
   * Get learning resource link based on error
   */
  private getLearnMoreLink(error: ValidationResult): string | undefined {
    const baseUrl = 'https://skyfoundry.com/doc/';
    
    const links: Record<string, string> = {
      'unknown_function': `${baseUrl}axonLang/funcs`,
      'type_error': `${baseUrl}axonLang/types`,
      'filter_error': `${baseUrl}axonLang/filters`,
      'syntax': `${baseUrl}axonLang/lang`,
      'argument_error': `${baseUrl}axonLang/funcParams`
    };
    
    return links[error.category || 'syntax'];
  }
  
  /**
   * Analyze common error patterns in a codebase
   */
  analyzeErrorPatterns(errors: ValidationResult[]): {
    commonPatterns: Array<{pattern: string; count: number; suggestion: string}>;
    recommendations: string[];
  } {
    const patterns: Map<string, number> = new Map();
    
    for (const error of errors) {
      const pattern = `${error.category}:${error.errorType || 'unknown'}`;
      patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
    }
    
    const commonPatterns = Array.from(patterns.entries())
      .map(([pattern, count]) => ({
        pattern,
        count,
        suggestion: this.getPatternSuggestion(pattern)
      }))
      .sort((a, b) => b.count - a.count);
    
    const recommendations = this.generateRecommendations(commonPatterns);
    
    return { commonPatterns, recommendations };
  }
  
  /**
   * Get suggestion for error pattern
   */
  private getPatternSuggestion(pattern: string): string {
    const [category, type] = pattern.split(':');
    
    const suggestions: Record<string, string> = {
      'unknown_function:': 'Create a project function library or check function availability',
      'type_error:': 'Add type validation and conversion utilities',
      'filter_error:': 'Create reusable filter functions for common queries',
      'syntax:': 'Use a linter or syntax checker before execution',
      'argument_error:': 'Create wrapper functions with default arguments'
    };
    
    return suggestions[`${category}:`] || 'Review and refactor code for better error handling';
  }
  
  /**
   * Generate recommendations based on patterns
   */
  private generateRecommendations(patterns: Array<{pattern: string; count: number}>): string[] {
    const recommendations: string[] = [];
    
    const totalErrors = patterns.reduce((sum, p) => sum + p.count, 0);
    const topPattern = patterns[0];
    
    if (topPattern && topPattern.count > totalErrors * 0.5) {
      recommendations.push(`Focus on fixing ${topPattern.pattern.split(':')[0]} errors - they account for ${Math.round(topPattern.count / totalErrors * 100)}% of issues`);
    }
    
    if (patterns.some(p => p.pattern.includes('unknown_function'))) {
      recommendations.push('Consider creating a custom function library for commonly used operations');
    }
    
    if (patterns.some(p => p.pattern.includes('type_error'))) {
      recommendations.push('Implement type checking helpers and conversion utilities');
    }
    
    if (totalErrors > 10) {
      recommendations.push('Set up automated validation in your development workflow');
    }
    
    return recommendations;
  }
}