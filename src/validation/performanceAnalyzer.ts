export interface PerformanceIssue {
  type: 'high_complexity' | 'large_dataset' | 'inefficient_operation' | 'missing_index' | 'resource_intensive';
  severity: 'high' | 'medium' | 'low';
  message: string;
  estimatedImpact: string;
  location: {
    line?: number;
    operation?: string;
  };
  optimization?: string;
}

export interface PerformanceMetrics {
  estimatedComplexity: number;  // O(n) notation as a number
  estimatedRows: number;
  estimatedDuration: string;    // e.g., "<1s", "1-5s", ">30s"
  memoryUsage: 'low' | 'medium' | 'high';
  cpuUsage: 'low' | 'medium' | 'high';
}

export interface PerformanceAnalysisResult {
  metrics: PerformanceMetrics;
  issues: PerformanceIssue[];
  optimizations: string[];
  score: number; // 0-100
  summary: string;
}

export class PerformanceAnalyzer {
  private readonly operationCosts = {
    // Basic operations
    readAll: 10,
    read: 1,
    eval: 5,
    
    // Collection operations
    map: 2,
    each: 2,
    fold: 3,
    filter: 2,
    findAll: 2,
    sort: 5,
    unique: 4,
    
    // History operations
    hisRead: 20,
    hisWrite: 15,
    hisRollup: 10,
    
    // String operations
    concat: 1,
    split: 2,
    regex: 3,
    
    // Complex operations
    join: 8,
    union: 6,
    diff: 6
  };
  
  /**
   * Analyze Axon code for performance issues
   */
  analyze(code: string): PerformanceAnalysisResult {
    const issues: PerformanceIssue[] = [];
    const optimizations: string[] = [];
    
    // Calculate metrics
    const metrics = this.calculateMetrics(code);
    
    // Check for specific performance issues
    issues.push(...this.checkQueryComplexity(code));
    issues.push(...this.checkDatasetSize(code));
    issues.push(...this.checkInefficientOperations(code));
    issues.push(...this.checkMissingOptimizations(code));
    issues.push(...this.checkResourceUsage(code));
    
    // Generate optimizations
    optimizations.push(...this.generateOptimizations(code, issues));
    
    // Calculate performance score
    const score = this.calculateScore(metrics, issues);
    
    return {
      metrics,
      issues,
      optimizations,
      score,
      summary: this.generateSummary(metrics, issues, score)
    };
  }
  
  /**
   * Calculate performance metrics
   */
  private calculateMetrics(code: string): PerformanceMetrics {
    let complexity = 1;
    let estimatedRows = 100; // Default assumption
    
    // Count operations and calculate complexity
    for (const [operation, cost] of Object.entries(this.operationCosts)) {
      const regex = new RegExp(`\\b${operation}\\b`, 'g');
      const matches = code.match(regex) || [];
      complexity += matches.length * cost;
    }
    
    // Check for nested loops (exponential complexity)
    const nestedLoops = this.countNestedLoops(code);
    if (nestedLoops > 0) {
      complexity *= Math.pow(10, nestedLoops);
    }
    
    // Estimate dataset size based on filters
    const filters = code.match(/readAll\s*\([^)]+\)/g) || [];
    for (const filter of filters) {
      if (filter.includes('site')) {
        estimatedRows = 10; // Sites are typically few
      } else if (filter.includes('equip')) {
        estimatedRows = 100; // Equipment moderate
      } else if (filter.includes('point')) {
        estimatedRows = 1000; // Points are many
      } else if (filter.includes('his')) {
        estimatedRows = 10000; // History data is large
      }
    }
    
    // Estimate duration based on complexity and data size
    const totalCost = complexity * Math.log10(estimatedRows + 1);
    let estimatedDuration: string;
    if (totalCost < 100) {
      estimatedDuration = '<1s';
    } else if (totalCost < 1000) {
      estimatedDuration = '1-5s';
    } else if (totalCost < 5000) {
      estimatedDuration = '5-30s';
    } else {
      estimatedDuration = '>30s';
    }
    
    // Estimate resource usage
    const memoryUsage = estimatedRows > 10000 ? 'high' : estimatedRows > 1000 ? 'medium' : 'low';
    const cpuUsage = complexity > 1000 ? 'high' : complexity > 100 ? 'medium' : 'low';
    
    return {
      estimatedComplexity: complexity,
      estimatedRows,
      estimatedDuration,
      memoryUsage,
      cpuUsage
    };
  }
  
  /**
   * Check query complexity
   */
  private checkQueryComplexity(code: string): PerformanceIssue[] {
    const issues: PerformanceIssue[] = [];
    
    // Check for complex filters
    const filterRegex = /readAll\s*\(([^)]+)\)/g;
    let match;
    
    while ((match = filterRegex.exec(code)) !== null) {
      const filter = match[1];
      const conditions = (filter.match(/\band\b|\bor\b/g) || []).length + 1;
      
      if (conditions > 5) {
        issues.push({
          type: 'high_complexity',
          severity: 'high',
          message: `Complex filter with ${conditions} conditions`,
          estimatedImpact: 'Query time increases exponentially with filter complexity',
          location: {
            line: this.getLineNumber(code, match.index),
            operation: 'readAll'
          },
          optimization: 'Break down into multiple queries or use server-side filtering function'
        });
      } else if (conditions > 3) {
        issues.push({
          type: 'high_complexity',
          severity: 'medium',
          message: `Moderately complex filter with ${conditions} conditions`,
          estimatedImpact: 'May slow down with large datasets',
          location: {
            line: this.getLineNumber(code, match.index),
            operation: 'readAll'
          },
          optimization: 'Consider indexing frequently used filter combinations'
        });
      }
    }
    
    // Check for multiple sorts
    const sortCount = (code.match(/\.sort\b/g) || []).length;
    if (sortCount > 1) {
      issues.push({
        type: 'inefficient_operation',
        severity: 'medium',
        message: `Multiple sort operations (${sortCount}) detected`,
        estimatedImpact: 'Each sort is O(n log n) - multiple sorts compound the cost',
        location: {
          operation: 'sort'
        },
        optimization: 'Combine sorts into a single operation with composite sort key'
      });
    }
    
    return issues;
  }
  
  /**
   * Check dataset size issues
   */
  private checkDatasetSize(code: string): PerformanceIssue[] {
    const issues: PerformanceIssue[] = [];
    
    // Check for unbounded queries
    const unboundedPatterns = [
      { regex: /readAll\s*\(\s*point\s*\)/, entity: 'points' },
      { regex: /readAll\s*\(\s*his\s*\)/, entity: 'history records' },
      { regex: /hisRead\s*\([^)]*\)(?!\.limit)/, entity: 'history data' }
    ];
    
    for (const pattern of unboundedPatterns) {
      const matches = code.match(pattern.regex);
      if (matches) {
        issues.push({
          type: 'large_dataset',
          severity: 'high',
          message: `Unbounded query for ${pattern.entity}`,
          estimatedImpact: 'Could return thousands of records',
          location: {
            line: this.getLineNumber(code, code.indexOf(matches[0]))
          },
          optimization: 'Add .limit() or more specific filters'
        });
      }
    }
    
    // Check for Cartesian products
    const joinRegex = /readAll\([^)]+\)[^]*?\.map[^]*?readAll\([^)]+\)/g;
    if (joinRegex.test(code)) {
      issues.push({
        type: 'large_dataset',
        severity: 'high',
        message: 'Potential Cartesian product from nested queries',
        estimatedImpact: 'Result size = N × M records',
        location: {},
        optimization: 'Use proper joins or pre-filter data'
      });
    }
    
    return issues;
  }
  
  /**
   * Check for inefficient operations
   */
  private checkInefficientOperations(code: string): PerformanceIssue[] {
    const issues: PerformanceIssue[] = [];
    
    // String concatenation in loops
    const concatInLoopRegex = /\.(map|each|fold)\s*\([^)]*=>[^]*?\+\s*["'][^]*?\)/g;
    if (concatInLoopRegex.test(code)) {
      issues.push({
        type: 'inefficient_operation',
        severity: 'medium',
        message: 'String concatenation inside loop',
        estimatedImpact: 'O(n²) string operations',
        location: {},
        optimization: 'Use ioWriteStr() or collect to list then join'
      });
    }
    
    // Multiple passes over same data
    const dataFlowRegex = /(\w+)\s*:\s*readAll[^]*?\1\.[^]*?\1\./g;
    if (dataFlowRegex.test(code)) {
      issues.push({
        type: 'inefficient_operation',
        severity: 'low',
        message: 'Multiple operations on same dataset',
        estimatedImpact: 'Multiple iterations over data',
        location: {},
        optimization: 'Chain operations to process in single pass'
      });
    }
    
    // Inefficient uniqueness checks
    if (code.includes('.unique') && code.includes('.size')) {
      issues.push({
        type: 'inefficient_operation',
        severity: 'low',
        message: 'Using unique() for counting distinct values',
        estimatedImpact: 'Creates unnecessary intermediate collection',
        location: {},
        optimization: 'Use fold operation with dict for counting'
      });
    }
    
    return issues;
  }
  
  /**
   * Check for missing optimizations
   */
  private checkMissingOptimizations(code: string): PerformanceIssue[] {
    const issues: PerformanceIssue[] = [];
    
    // Missing indexes on common filters
    const filterPatterns = code.match(/readAll\s*\(([^)]+)\)/g) || [];
    const tagFrequency: Map<string, number> = new Map();
    
    for (const pattern of filterPatterns) {
      const tags = pattern.match(/\b(\w+)\s*(==|!=)/g) || [];
      for (const tag of tags) {
        const tagName = tag.split(/\s*(==|!=)/)[0];
        tagFrequency.set(tagName, (tagFrequency.get(tagName) || 0) + 1);
      }
    }
    
    for (const [tag, count] of tagFrequency) {
      if (count >= 3) {
        issues.push({
          type: 'missing_index',
          severity: 'medium',
          message: `Tag '${tag}' used in ${count} filters`,
          estimatedImpact: 'Each filter scans all records',
          location: {},
          optimization: `Consider creating an index on '${tag}' tag`
        });
      }
    }
    
    // Missing limit on large queries
    const largequeryRegex = /readAll\s*\([^)]*point[^)]*\)(?!\.limit)/g;
    if (largequeryRegex.test(code)) {
      issues.push({
        type: 'missing_index',
        severity: 'medium',
        message: 'Large query without limit',
        estimatedImpact: 'May return more data than needed',
        location: {},
        optimization: 'Add .limit() to restrict result size'
      });
    }
    
    return issues;
  }
  
  /**
   * Check resource usage
   */
  private checkResourceUsage(code: string): PerformanceIssue[] {
    const issues: PerformanceIssue[] = [];
    
    // Check for memory-intensive operations
    const memoryOps = [
      { pattern: /\.toGrid\(\)/, op: 'toGrid()', impact: 'Loads entire result set into memory' },
      { pattern: /\.collect\(\)/, op: 'collect()', impact: 'Collects all items in memory' },
      { pattern: /hisRead[^]*?\.map/, op: 'hisRead().map()', impact: 'Processes large history in memory' }
    ];
    
    for (const { pattern, op, impact } of memoryOps) {
      if (pattern.test(code)) {
        issues.push({
          type: 'resource_intensive',
          severity: 'medium',
          message: `Memory-intensive operation: ${op}`,
          estimatedImpact: impact,
          location: {},
          optimization: 'Process data in chunks or use streaming operations'
        });
      }
    }
    
    // Check for CPU-intensive operations
    if (code.includes('parseNumber') || code.includes('parseDate')) {
      const parseCount = (code.match(/parse(Number|Date)/g) || []).length;
      if (parseCount > 5) {
        issues.push({
          type: 'resource_intensive',
          severity: 'low',
          message: `Multiple parse operations (${parseCount})`,
          estimatedImpact: 'Repeated parsing is CPU intensive',
          location: {},
          optimization: 'Parse once and reuse results'
        });
      }
    }
    
    return issues;
  }
  
  /**
   * Generate optimization suggestions
   */
  private generateOptimizations(code: string, issues: PerformanceIssue[]): string[] {
    const optimizations: string[] = [];
    const added = new Set<string>();
    
    // Add issue-specific optimizations
    for (const issue of issues) {
      if (issue.optimization && !added.has(issue.optimization)) {
        optimizations.push(issue.optimization);
        added.add(issue.optimization);
      }
    }
    
    // Add general optimizations based on code patterns
    if (code.includes('readAll') && !code.includes('limit')) {
      optimizations.push('Consider adding .limit() to queries to prevent large result sets');
    }
    
    if (code.includes('.map') && code.includes('.filter')) {
      optimizations.push('Filter before mapping to reduce iterations');
    }
    
    if (code.includes('hisRead') && !code.includes('hisRollup')) {
      optimizations.push('Consider using hisRollup() to reduce history data points');
    }
    
    const readAllCount = (code.match(/readAll/g) || []).length;
    if (readAllCount > 3) {
      optimizations.push('Consider caching query results to avoid repeated database calls');
    }
    
    return optimizations;
  }
  
  /**
   * Count nested loops
   */
  private countNestedLoops(code: string): number {
    let maxNesting = 0;
    let currentNesting = 0;
    
    const loopKeywords = ['map', 'each', 'fold', 'findAll', 'filter'];
    const tokens = code.split(/\s+/);
    
    for (const token of tokens) {
      if (loopKeywords.some(keyword => token.includes(`.${keyword}`))) {
        currentNesting++;
        maxNesting = Math.max(maxNesting, currentNesting);
      } else if (token.includes('end')) {
        currentNesting = Math.max(0, currentNesting - 1);
      }
    }
    
    return maxNesting > 1 ? maxNesting - 1 : 0;
  }
  
  /**
   * Calculate performance score
   */
  private calculateScore(metrics: PerformanceMetrics, issues: PerformanceIssue[]): number {
    let score = 100;
    
    // Deduct for complexity
    if (metrics.estimatedComplexity > 1000) score -= 20;
    else if (metrics.estimatedComplexity > 500) score -= 10;
    else if (metrics.estimatedComplexity > 100) score -= 5;
    
    // Deduct for estimated duration
    if (metrics.estimatedDuration === '>30s') score -= 30;
    else if (metrics.estimatedDuration === '5-30s') score -= 20;
    else if (metrics.estimatedDuration === '1-5s') score -= 10;
    
    // Deduct for issues
    for (const issue of issues) {
      switch (issue.severity) {
        case 'high': score -= 15; break;
        case 'medium': score -= 10; break;
        case 'low': score -= 5; break;
      }
    }
    
    // Deduct for resource usage
    if (metrics.memoryUsage === 'high') score -= 10;
    if (metrics.cpuUsage === 'high') score -= 10;
    
    return Math.max(0, Math.round(score));
  }
  
  /**
   * Generate summary
   */
  private generateSummary(metrics: PerformanceMetrics, issues: PerformanceIssue[], score: number): string {
    let summary = `Performance score: ${score}/100. `;
    
    if (score >= 90) {
      summary += 'Excellent performance characteristics. ';
    } else if (score >= 70) {
      summary += 'Good performance with minor optimization opportunities. ';
    } else if (score >= 50) {
      summary += 'Moderate performance. Consider optimizations for production use. ';
    } else {
      summary += 'Poor performance. Significant optimizations needed. ';
    }
    
    summary += `Estimated complexity: O(${this.formatComplexity(metrics.estimatedComplexity)}). `;
    summary += `Expected duration: ${metrics.estimatedDuration}. `;
    
    const highIssues = issues.filter(i => i.severity === 'high').length;
    if (highIssues > 0) {
      summary += `Found ${highIssues} critical performance issues. `;
    }
    
    return summary;
  }
  
  /**
   * Format complexity notation
   */
  private formatComplexity(complexity: number): string {
    if (complexity <= 10) return '1';
    if (complexity <= 100) return 'n';
    if (complexity <= 1000) return 'n log n';
    if (complexity <= 10000) return 'n²';
    return 'n³+';
  }
  
  /**
   * Get line number
   */
  private getLineNumber(code: string, position: number): number {
    return code.substring(0, position).split('\n').length;
  }
}