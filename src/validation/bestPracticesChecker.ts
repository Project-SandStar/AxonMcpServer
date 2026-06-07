export interface BestPracticeViolation {
  type: 'n_plus_one' | 'missing_null_safety' | 'naming_convention' | 'anti_pattern' | 'code_smell';
  severity: 'error' | 'warning' | 'info';
  message: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface BestPracticesResult {
  violations: BestPracticeViolation[];
  score: number; // 0-100
  summary: string;
}

export class BestPracticesChecker {
  private readonly namingConventions = {
    variable: /^[a-z][a-zA-Z0-9]*$/,
    function: /^[a-z][a-zA-Z0-9]*$/,
    constant: /^[A-Z][A-Z0-9_]*$/,
    tag: /^[a-z][a-zA-Z0-9]*$/
  };
  
  /**
   * Check code against best practices
   */
  check(code: string): BestPracticesResult {
    const violations: BestPracticeViolation[] = [];
    
    // Check for N+1 query patterns
    violations.push(...this.checkNPlusOnePatterns(code));
    
    // Check for missing null safety
    violations.push(...this.checkNullSafety(code));
    
    // Check naming conventions
    violations.push(...this.checkNamingConventions(code));
    
    // Check for anti-patterns
    violations.push(...this.checkAntiPatterns(code));
    
    // Check for code smells
    violations.push(...this.checkCodeSmells(code));
    
    // Calculate score
    const score = this.calculateScore(violations, code);
    
    return {
      violations,
      score,
      summary: this.generateSummary(violations, score)
    };
  }
  
  /**
   * Check for N+1 query patterns
   */
  private checkNPlusOnePatterns(code: string): BestPracticeViolation[] {
    const violations: BestPracticeViolation[] = [];
    
    // Pattern: readAll in a loop/map without proper batching
    const loopPatterns = [
      /\.map\s*\([^)]*=>\s*do[^]*?readAll\s*\(/g,
      /\.each\s*\([^)]*=>\s*do[^]*?readAll\s*\(/g,
      /\.map\s*\([^)]*=>\s*[^{]*readAll\s*\(/g
    ];
    
    for (const pattern of loopPatterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        // Check if it's accessing related data
        const snippet = code.substring(match.index, match.index + 200);
        if (snippet.includes('equipRef==') || snippet.includes('siteRef==') || snippet.includes('Ref==')) {
          violations.push({
            type: 'n_plus_one',
            severity: 'warning',
            message: 'Potential N+1 query: readAll() inside map/each. Consider using a single query with joins.',
            line: this.getLineNumber(code, match.index),
            suggestion: 'Use readAll() with a filter outside the loop, then use findAll() to filter the results'
          });
        }
      }
    }
    
    // Pattern: Multiple sequential readAll calls that could be combined
    const readAllRegex = /readAll\s*\([^)]+\)/g;
    const readAllMatches: Array<{index: number; match: string}> = [];
    let readMatch;
    
    while ((readMatch = readAllRegex.exec(code)) !== null) {
      readAllMatches.push({
        index: readMatch.index,
        match: readMatch[0]
      });
    }
    
    // Check for readAll calls within 5 lines of each other
    for (let i = 0; i < readAllMatches.length - 1; i++) {
      const current = readAllMatches[i];
      const next = readAllMatches[i + 1];
      
      const linesBetween = code.substring(current.index, next.index).split('\n').length;
      if (linesBetween <= 5) {
        // Check if they're querying similar entities
        if (this.areSimilarQueries(current.match, next.match)) {
          violations.push({
            type: 'n_plus_one',
            severity: 'info',
            message: 'Multiple readAll() calls that might be combined into a single query',
            line: this.getLineNumber(code, current.index),
            suggestion: 'Consider combining filters with "or" operator or using a more general filter'
          });
        }
      }
    }
    
    return violations;
  }
  
  /**
   * Check for missing null safety
   */
  private checkNullSafety(code: string): BestPracticeViolation[] {
    const violations: BestPracticeViolation[] = [];
    
    // Direct property access without null checks
    const propertyAccessRegex = /(\w+)->(\w+)(?!\s*\?)/g;
    let match;
    
    while ((match = propertyAccessRegex.exec(code)) !== null) {
      const variable = match[1];
      const property = match[2];
      
      // Check if this is preceded by a null check
      if (!this.hasNullCheckBefore(code, match.index, variable)) {
        violations.push({
          type: 'missing_null_safety',
          severity: 'warning',
          message: `Direct property access '${variable}->${property}' without null check`,
          line: this.getLineNumber(code, match.index),
          suggestion: `Add null check: if (${variable} != null) ${variable}->${property} else defaultValue`
        });
      }
    }
    
    // Array/list access without bounds checking
    const arrayAccessRegex = /(\w+)\[(\d+)\]/g;
    while ((match = arrayAccessRegex.exec(code)) !== null) {
      violations.push({
        type: 'missing_null_safety',
        severity: 'warning',
        message: `Array access without bounds check: ${match[0]}`,
        line: this.getLineNumber(code, match.index),
        suggestion: 'Check array size before accessing by index'
      });
    }
    
    // .first() without false parameter
    const firstRegex = /\.first\s*\(\s*\)/g;
    while ((match = firstRegex.exec(code)) !== null) {
      violations.push({
        type: 'missing_null_safety',
        severity: 'error',
        message: '.first() without parameter will throw exception if empty',
        line: this.getLineNumber(code, match.index),
        suggestion: 'Use .first(false) to return null instead of throwing'
      });
    }
    
    return violations;
  }
  
  /**
   * Check naming conventions
   */
  private checkNamingConventions(code: string): BestPracticeViolation[] {
    const violations: BestPracticeViolation[] = [];
    
    // Variable declarations
    const varRegex = /(\w+)\s*:\s*[^=\n]+=/g;
    let match;
    
    while ((match = varRegex.exec(code)) !== null) {
      const varName = match[1];
      
      // Skip if it's a tag access or function parameter
      if (code[match.index - 1] === '-' || code[match.index - 1] === '(') {
        continue;
      }
      
      if (!this.namingConventions.variable.test(varName)) {
        violations.push({
          type: 'naming_convention',
          severity: 'info',
          message: `Variable '${varName}' doesn't follow camelCase convention`,
          line: this.getLineNumber(code, match.index),
          suggestion: `Use camelCase: ${this.toCamelCase(varName)}`
        });
      }
    }
    
    // Check for single letter variables (except in loops)
    const singleLetterRegex = /\b([a-z])\s*:/g;
    while ((match = singleLetterRegex.exec(code)) !== null) {
      const context = code.substring(Math.max(0, match.index - 50), match.index);
      if (!context.includes('each') && !context.includes('map') && !context.includes('fold')) {
        violations.push({
          type: 'naming_convention',
          severity: 'info',
          message: `Single letter variable '${match[1]}' is not descriptive`,
          line: this.getLineNumber(code, match.index),
          suggestion: 'Use descriptive variable names'
        });
      }
    }
    
    return violations;
  }
  
  /**
   * Check for anti-patterns
   */
  private checkAntiPatterns(code: string): BestPracticeViolation[] {
    const violations: BestPracticeViolation[] = [];
    
    // String concatenation in loops
    const loopConcatRegex = /\.(each|map|fold)\s*\([^)]*=>[^]*?\+\s*["']/g;
    let match;
    
    while ((match = loopConcatRegex.exec(code)) !== null) {
      violations.push({
        type: 'anti_pattern',
        severity: 'warning',
        message: 'String concatenation inside loop is inefficient',
        line: this.getLineNumber(code, match.index),
        suggestion: 'Consider using ioWriteStr() or collecting results and joining'
      });
    }
    
    // Nested readAll calls
    const nestedReadAllRegex = /readAll[^]*?readAll/g;
    while ((match = nestedReadAllRegex.exec(code)) !== null) {
      const snippet = match[0];
      if (snippet.split('\n').length <= 10) { // Within 10 lines
        violations.push({
          type: 'anti_pattern',
          severity: 'error',
          message: 'Nested readAll() calls can cause performance issues',
          line: this.getLineNumber(code, match.index),
          suggestion: 'Refactor to use a single query or cache intermediate results'
        });
      }
    }
    
    // Using == for null checks instead of .isNull()
    const nullCheckRegex = /==\s*null\b/g;
    while ((match = nullCheckRegex.exec(code)) !== null) {
      violations.push({
        type: 'anti_pattern',
        severity: 'info',
        message: 'Use isNull() instead of == null',
        line: this.getLineNumber(code, match.index),
        suggestion: 'Replace with .isNull() for clarity'
      });
    }
    
    // Complex filter expressions that should be functions
    const complexFilterRegex = /readAll\s*\(([^)]{100,})\)/g;
    while ((match = complexFilterRegex.exec(code)) !== null) {
      violations.push({
        type: 'anti_pattern',
        severity: 'warning',
        message: 'Complex filter expression should be extracted to a function',
        line: this.getLineNumber(code, match.index),
        suggestion: 'Create a named function for complex filters to improve readability'
      });
    }
    
    return violations;
  }
  
  /**
   * Check for code smells
   */
  private checkCodeSmells(code: string): BestPracticeViolation[] {
    const violations: BestPracticeViolation[] = [];
    
    // Long functions (more than 50 lines)
    const functionRegex = /\bdo\b[^]*?\bend\b/g;
    let match;
    
    while ((match = functionRegex.exec(code)) !== null) {
      const functionBody = match[0];
      const lineCount = functionBody.split('\n').length;
      
      if (lineCount > 50) {
        violations.push({
          type: 'code_smell',
          severity: 'warning',
          message: `Function is too long (${lineCount} lines)`,
          line: this.getLineNumber(code, match.index),
          suggestion: 'Consider breaking this into smaller functions'
        });
      }
    }
    
    // Deeply nested code (more than 4 levels)
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const indentLevel = this.getIndentLevel(lines[i]);
      if (indentLevel > 4) {
        violations.push({
          type: 'code_smell',
          severity: 'warning',
          message: 'Code is too deeply nested',
          line: i + 1,
          suggestion: 'Consider extracting nested logic into separate functions'
        });
        break; // Only report once per file
      }
    }
    
    // Duplicate code detection (simple)
    const codeBlocks: Map<string, number[]> = new Map();
    const blockRegex = /\{[^{}]{20,}\}/g;
    
    while ((match = blockRegex.exec(code)) !== null) {
      const block = match[0].replace(/\s+/g, ' ').trim();
      if (codeBlocks.has(block)) {
        violations.push({
          type: 'code_smell',
          severity: 'info',
          message: 'Potential duplicate code detected',
          line: this.getLineNumber(code, match.index),
          suggestion: 'Consider extracting common code into a reusable function'
        });
      } else {
        codeBlocks.set(block, [match.index]);
      }
    }
    
    // Magic numbers
    const magicNumberRegex = /\b\d{2,}\b(?!\s*[:=])/g;
    const commonNumbers = new Set(['10', '60', '100', '1000', '24', '365', '86400']);
    
    while ((match = magicNumberRegex.exec(code)) !== null) {
      const number = match[0];
      if (!commonNumbers.has(number)) {
        violations.push({
          type: 'code_smell',
          severity: 'info',
          message: `Magic number ${number} should be a named constant`,
          line: this.getLineNumber(code, match.index),
          suggestion: 'Define as a constant with a descriptive name'
        });
      }
    }
    
    return violations;
  }
  
  /**
   * Helper: Check if two queries are similar
   */
  private areSimilarQueries(query1: string, query2: string): boolean {
    // Extract the main entity type from each query
    const entityRegex = /\b(site|equip|point|meter|sensor|ahu|vav)\b/g;
    
    const entities1: string[] = query1.match(entityRegex) || [];
    const entities2: string[] = query2.match(entityRegex) || [];
    
    // Check if they share any entity types
    return entities1.some((e: string) => entities2.includes(e));
  }
  
  /**
   * Helper: Check if variable has null check before position
   */
  private hasNullCheckBefore(code: string, position: number, variable: string): boolean {
    // Look back up to 100 characters
    const lookback = code.substring(Math.max(0, position - 100), position);
    
    // Common null check patterns
    const patterns = [
      new RegExp(`if\\s*\\(\\s*${variable}\\s*\\)`),
      new RegExp(`${variable}\\s*!=\\s*null`),
      new RegExp(`${variable}\\s*\\.\\s*isNull`),
      new RegExp(`${variable}\\s*\\?`),
    ];
    
    return patterns.some(pattern => pattern.test(lookback));
  }
  
  /**
   * Helper: Get indentation level
   */
  private getIndentLevel(line: string): number {
    const match = line.match(/^(\s*)/);
    if (!match) return 0;
    
    const spaces = match[1].length;
    return Math.floor(spaces / 2); // Assuming 2-space indentation
  }
  
  /**
   * Helper: Convert to camelCase
   */
  private toCamelCase(str: string): string {
    return str
      .replace(/[_-](.)/g, (_, char) => char.toUpperCase())
      .replace(/^./, char => char.toLowerCase());
  }
  
  /**
   * Helper: Get line number
   */
  private getLineNumber(code: string, position: number): number {
    return code.substring(0, position).split('\n').length;
  }
  
  /**
   * Calculate overall score based on violations
   */
  private calculateScore(violations: BestPracticeViolation[], code: string): number {
    const lineCount = code.split('\n').length;
    let score = 100;
    
    for (const violation of violations) {
      switch (violation.severity) {
        case 'error':
          score -= 10;
          break;
        case 'warning':
          score -= 5;
          break;
        case 'info':
          score -= 2;
          break;
      }
    }
    
    // Adjust for code size (smaller penalty for larger codebases)
    const sizeFactor = Math.min(1, lineCount / 100);
    score = score + (100 - score) * (1 - sizeFactor) * 0.2;
    
    return Math.max(0, Math.round(score));
  }
  
  /**
   * Generate summary of findings
   */
  private generateSummary(violations: BestPracticeViolation[], score: number): string {
    const counts = {
      error: violations.filter(v => v.severity === 'error').length,
      warning: violations.filter(v => v.severity === 'warning').length,
      info: violations.filter(v => v.severity === 'info').length
    };
    
    let summary = `Code quality score: ${score}/100. `;
    
    if (score >= 90) {
      summary += 'Excellent code quality! ';
    } else if (score >= 70) {
      summary += 'Good code quality with room for improvement. ';
    } else if (score >= 50) {
      summary += 'Fair code quality. Consider addressing violations. ';
    } else {
      summary += 'Poor code quality. Significant improvements needed. ';
    }
    
    if (counts.error > 0) {
      summary += `Found ${counts.error} critical issues. `;
    }
    if (counts.warning > 0) {
      summary += `Found ${counts.warning} warnings. `;
    }
    if (counts.info > 0) {
      summary += `Found ${counts.info} suggestions. `;
    }
    
    return summary;
  }
}