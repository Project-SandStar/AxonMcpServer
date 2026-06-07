import { AxonParser } from './axonParser.js';
import { AxonCategory } from '../types/index.js';

// Enhanced metadata interfaces
export interface FunctionParameter {
  name: string;
  type?: string;
  defaultValue?: string;
  required: boolean;
  description?: string;
}

export interface FunctionSignature {
  parameters: FunctionParameter[];
  returnType?: string;
  isAsync: boolean;
}

export interface FunctionDependencies {
  functions: string[];      // Other functions called
  tags: string[];           // Haystack tags used (ahu, point, etc.)
  queries: string[];        // Haystack queries (readAll, read, etc.)
  externalApis: string[];   // HTTP calls, external services
}

export interface CodeComplexity {
  linesOfCode: number;
  cyclomaticComplexity: number;
  nestedDepth: number;
  commentRatio: number;
}

export interface DataOperations {
  reads: string[];          // Data sources read from
  writes: string[];         // Data targets written to
  commits: boolean;
  jobs: boolean;
  emails: boolean;
}

export interface FunctionDocumentation {
  description: string;
  examples: string[];
  author?: string;
  version?: string;
  lastUpdatedBy?: string;
  notes: string[];
}

export interface UsagePatterns {
  category: string;
  subcategory?: string;
  keywords: string[];
  useCase: string;
}

export interface PerformanceHints {
  estimatedRuntime: 'fast' | 'medium' | 'slow' | 'batch';
  hasLoops: boolean;
  hasRecursion: boolean;
  datasetSize: 'small' | 'medium' | 'large';
}

export interface FunctionContext {
  siteSpecific: boolean;
  projectName: string;
  instanceName: string;
  sharedAcrossProjects: boolean;
}

export interface QualityMetrics {
  hasDocumentation: boolean;
  hasExamples: boolean;
  hasErrorHandling: boolean;
  hasTests: boolean;
  lastReviewed?: string;
}

export interface FunctionRelationships {
  similarFunctions: string[];
  relatedEquipTypes: string[];
  prerequisiteFunctions: string[];
  deprecatedBy?: string;
}

export interface EnhancedFunctionMetadata {
  // Basic info
  name: string;
  hash: string;
  lastModified?: string;
  synced: string;
  
  // Enhanced metadata
  signature: FunctionSignature;
  dependencies: FunctionDependencies;
  complexity: CodeComplexity;
  operations: DataOperations;
  documentation: FunctionDocumentation;
  patterns: UsagePatterns;
  performance: PerformanceHints;
  context: FunctionContext;
  quality: QualityMetrics;
  relationships: FunctionRelationships;
}

export class EnhancedAxonParser extends AxonParser {
  
  /**
   * Parse function and extract all enhanced metadata
   */
  parseEnhancedFunction(
    source: string,
    name: string,
    instance: string,
    project: string,
    hash: string,
    lastModified?: string
  ): EnhancedFunctionMetadata {
    
    return {
      name,
      hash,
      lastModified,
      synced: new Date().toISOString(),
      signature: this.extractSignature(source),
      dependencies: this.extractDependencies(source),
      complexity: this.calculateComplexity(source),
      operations: this.extractOperations(source),
      documentation: this.extractDocumentation(source),
      patterns: this.extractPatterns(source, name),
      performance: this.estimatePerformance(source),
      context: {
        siteSpecific: this.isSiteSpecific(source),
        projectName: project,
        instanceName: instance,
        sharedAcrossProjects: false // Will be updated by cross-project analysis
      },
      quality: this.assessQuality(source),
      relationships: {
        similarFunctions: [],
        relatedEquipTypes: this.extractEquipTypes(source),
        prerequisiteFunctions: [],
        deprecatedBy: undefined
      }
    };
  }
  
  /**
   * Extract function signature (parameters, return type)
   */
  private extractSignature(source: string): FunctionSignature {
    const parameters: FunctionParameter[] = [];
    
    // Match function declaration: (param1, param2: Type = default) => do
    const sigMatch = source.match(/^\s*\(([^)]*)\)\s*=>/m);
    
    if (sigMatch && sigMatch[1]) {
      const paramStr = sigMatch[1];
      const paramParts = paramStr.split(',');
      
      for (const part of paramParts) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        
        // Parse: name: Type = default
        const paramMatch = trimmed.match(/^(\w+)(?:\s*:\s*(\w+))?(?:\s*=\s*(.+))?$/);
        
        if (paramMatch) {
          parameters.push({
            name: paramMatch[1],
            type: paramMatch[2] || undefined,
            defaultValue: paramMatch[3] || undefined,
            required: !paramMatch[3], // Has default = not required
            description: undefined
          });
        }
      }
    }
    
    // Try to infer return type
    const returnType = this.inferReturnType(source);
    
    // Check if async (uses async operations)
    const isAsync = /\b(httpGet|httpPost|httpPut|httpDelete|ioSendEmail)\b/.test(source);
    
    return { parameters, returnType, isAsync };
  }
  
  /**
   * Infer return type from code
   */
  private inferReturnType(source: string): string | undefined {
    // Look for return statements or final expressions
    if (/return\s+\[/.test(source) || /=>\s*\[/.test(source)) return 'List';
    if (/return\s+\{/.test(source) || /=>\s*\{/.test(source)) return 'Dict';
    if (/readAll\(/.test(source) || /read\(/.test(source)) return 'Grid';
    if (/hisRead\(/.test(source)) return 'Grid';
    if (/commit\(/.test(source)) return 'Grid';
    if (/return\s+\d+/.test(source)) return 'Number';
    if (/return\s+"/.test(source) || /return\s+'/.test(source)) return 'Str';
    if (/return\s+(true|false)/.test(source)) return 'Bool';
    
    return undefined;
  }
  
  /**
   * Extract dependencies (functions, tags, queries)
   */
  private extractDependencies(source: string): FunctionDependencies {
    const functions: Set<string> = new Set();
    const tags: Set<string> = new Set();
    const queries: Set<string> = new Set();
    const externalApis: Set<string> = new Set();
    
    // Extract function calls: functionName(
    const funcMatches = source.matchAll(/\b([a-z][a-zA-Z0-9]*)\s*\(/g);
    for (const match of funcMatches) {
      const funcName = match[1];
      
      // Categorize the function
      if (['readAll', 'read', 'readById', 'hisRead', 'hisWrite'].includes(funcName)) {
        queries.add(funcName);
      } else if (['httpGet', 'httpPost', 'httpPut', 'httpDelete', 'ioSendEmail'].includes(funcName)) {
        externalApis.add(funcName);
      } else if (!['do', 'if', 'else', 'each', 'map', 'filter', 'fold'].includes(funcName)) {
        functions.add(funcName);
      }
    }
    
    // Extract common Haystack tags
    const commonTags = [
      'point', 'equip', 'site', 'ahu', 'vav', 'meter', 'sensor',
      'temp', 'pressure', 'flow', 'cmd', 'sp', 'cooling', 'heating',
      'zone', 'room', 'floor', 'building', 'hvac', 'elec', 'water'
    ];
    
    for (const tag of commonTags) {
      const regex = new RegExp(`\\b${tag}\\b`, 'i');
      if (regex.test(source)) {
        tags.add(tag);
      }
    }
    
    return {
      functions: Array.from(functions),
      tags: Array.from(tags),
      queries: Array.from(queries),
      externalApis: Array.from(externalApis)
    };
  }
  
  /**
   * Calculate code complexity metrics
   */
  private calculateComplexity(source: string): CodeComplexity {
    const lines = source.split('\n');
    const linesOfCode = lines.filter(l => l.trim() && !l.trim().startsWith('//')).length;
    
    // Count comment lines
    const commentLines = lines.filter(l => l.trim().startsWith('//')).length;
    const blockComments = (source.match(/\/\*[\s\S]*?\*\//g) || []).join('\n').split('\n').length;
    const totalComments = commentLines + blockComments;
    
    const commentRatio = linesOfCode > 0 ? totalComments / (linesOfCode + totalComments) : 0;
    
    // Cyclomatic complexity: count decision points
    let cyclomaticComplexity = 1; // Base complexity
    cyclomaticComplexity += (source.match(/\bif\b/g) || []).length;
    cyclomaticComplexity += (source.match(/\belse\b/g) || []).length;
    cyclomaticComplexity += (source.match(/\beach\b/g) || []).length;
    cyclomaticComplexity += (source.match(/\bwhile\b/g) || []).length;
    cyclomaticComplexity += (source.match(/\bfor\b/g) || []).length;
    cyclomaticComplexity += (source.match(/\bcatch\b/g) || []).length;
    cyclomaticComplexity += (source.match(/\band\b/g) || []).length;
    cyclomaticComplexity += (source.match(/\bor\b/g) || []).length;
    
    // Calculate nesting depth
    let nestedDepth = 0;
    let currentDepth = 0;
    
    for (const char of source) {
      if (char === '{' || char === '(') {
        currentDepth++;
        nestedDepth = Math.max(nestedDepth, currentDepth);
      } else if (char === '}' || char === ')') {
        currentDepth--;
      }
    }
    
    return {
      linesOfCode,
      cyclomaticComplexity,
      nestedDepth,
      commentRatio: Math.round(commentRatio * 100) / 100
    };
  }
  
  /**
   * Extract data operations
   */
  private extractOperations(source: string): DataOperations {
    const reads: Set<string> = new Set();
    const writes: Set<string> = new Set();
    
    // Extract read operations
    const readMatch = source.match(/readAll\((\w+)\)/g);
    if (readMatch) {
      for (const match of readMatch) {
        const tag = match.match(/readAll\((\w+)\)/)?.[1];
        if (tag) reads.add(tag);
      }
    }
    
    // Extract write operations
    const writeMatch = source.match(/commit\(/);
    if (writeMatch) {
      writes.add('commit');
    }
    
    const hisWriteMatch = source.match(/hisWrite\(/);
    if (hisWriteMatch) {
      writes.add('hisWrite');
    }
    
    return {
      reads: Array.from(reads),
      writes: Array.from(writes),
      commits: /commit\(/.test(source),
      jobs: /scheduleJob\(|jobAdd\(/.test(source),
      emails: /ioSendEmail\(/.test(source)
    };
  }
  
  /**
   * Extract documentation
   */
  private extractDocumentation(source: string): FunctionDocumentation {
    const examples: string[] = [];
    const notes: string[] = [];
    let description = '';
    let author: string | undefined;
    let version: string | undefined;
    
    // Extract doc comment
    const docMatch = source.match(/\/\*\*([\s\S]*?)\*\//);
    if (docMatch) {
      const docText = docMatch[1];
      
      // Extract description (first non-empty line)
      const lines = docText.split('\n').map(l => l.replace(/^\s*\*\s?/, ''));
      description = lines.find(l => l.trim() && !l.startsWith('@'))?.trim() || '';
      
      // Extract @tags
      const authorMatch = docText.match(/@author\s+(.+)/);
      if (authorMatch) author = authorMatch[1].trim();
      
      const versionMatch = docText.match(/@version\s+(.+)/);
      if (versionMatch) version = versionMatch[1].trim();
      
      // Extract examples
      const exampleMatches = docText.matchAll(/@example\s+(.+)/g);
      for (const match of exampleMatches) {
        examples.push(match[1].trim());
      }
    }
    
    // Extract inline examples
    const inlineExamples = source.match(/\/\/\s*(?:example|usage):\s*(.+)/gi);
    if (inlineExamples) {
      for (const ex of inlineExamples) {
        const exampleText = ex.replace(/\/\/\s*(?:example|usage):\s*/i, '').trim();
        if (!examples.includes(exampleText)) {
          examples.push(exampleText);
        }
      }
    }
    
    // Extract notes/warnings
    const noteMatches = source.matchAll(/\/\/\s*(?:note|warning|todo):\s*(.+)/gi);
    for (const match of noteMatches) {
      notes.push(match[1].trim());
    }
    
    return { description, examples, author, version, notes, lastUpdatedBy: undefined };
  }
  
  /**
   * Extract usage patterns
   */
  private extractPatterns(source: string, name: string): UsagePatterns {
    const keywords: Set<string> = new Set();
    
    // Extract keywords from function name
    const nameWords = name.split(/(?=[A-Z])/).map(w => w.toLowerCase());
    nameWords.forEach(w => keywords.add(w));
    
    // Extract keywords from source
    const commonKeywords = [
      'calculate', 'compute', 'analyze', 'report', 'monitor', 'control',
      'read', 'write', 'update', 'create', 'delete', 'import', 'export',
      'schedule', 'job', 'email', 'alert', 'notify', 'check', 'validate'
    ];
    
    for (const keyword of commonKeywords) {
      if (new RegExp(`\\b${keyword}\\b`, 'i').test(source)) {
        keywords.add(keyword);
      }
    }
    
    // Determine category
    const category = this.categorizeFunction(name, source, Array.from(keywords));
    
    // Determine subcategory
    let subcategory: string | undefined;
    if (/\bahu\b/i.test(source)) subcategory = 'AHU';
    else if (/\bvav\b/i.test(source)) subcategory = 'VAV';
    else if (/\bmeter\b/i.test(source)) subcategory = 'Meter';
    else if (/\bchiller\b/i.test(source)) subcategory = 'Chiller';
    else if (/\bboiler\b/i.test(source)) subcategory = 'Boiler';
    
    // Infer use case
    let useCase = 'General utility';
    if (keywords.has('calculate') || keywords.has('compute')) useCase = 'Calculation';
    if (keywords.has('report') || keywords.has('analyze')) useCase = 'Reporting/Analysis';
    if (keywords.has('monitor') || keywords.has('check')) useCase = 'Monitoring';
    if (keywords.has('control') || keywords.has('cmd')) useCase = 'Control';
    if (keywords.has('import') || keywords.has('export')) useCase = 'Data Import/Export';
    if (keywords.has('job') || keywords.has('schedule')) useCase = 'Scheduled Task';
    
    return {
      category,
      subcategory,
      keywords: Array.from(keywords),
      useCase
    };
  }
  
  /**
   * Estimate performance characteristics
   */
  private estimatePerformance(source: string): PerformanceHints {
    const linesOfCode = source.split('\n').length;
    const hasLoops = /\b(each|while|for|fold|map|filter)\b/.test(source);
    const hasRecursion = this.detectRecursion(source);
    
    // Estimate dataset size based on queries
    let datasetSize: 'small' | 'medium' | 'large' = 'small';
    if (/readAll\(site\)/.test(source)) datasetSize = 'small';
    else if (/readAll\(equip\)/.test(source)) datasetSize = 'medium';
    else if (/readAll\(point\)/.test(source)) datasetSize = 'large';
    else if (/hisRead\(/.test(source)) datasetSize = 'large';
    
    // Estimate runtime
    let estimatedRuntime: 'fast' | 'medium' | 'slow' | 'batch' = 'fast';
    if (linesOfCode > 200 || (hasLoops && datasetSize === 'large')) {
      estimatedRuntime = 'slow';
    } else if (linesOfCode > 100 || (hasLoops && datasetSize === 'medium')) {
      estimatedRuntime = 'medium';
    } else if (hasLoops || datasetSize === 'medium') {
      estimatedRuntime = 'medium';
    }
    
    // Check for batch operations
    if (/scheduleJob|jobAdd/.test(source)) {
      estimatedRuntime = 'batch';
    }
    
    return { estimatedRuntime, hasLoops, hasRecursion, datasetSize };
  }
  
  /**
   * Detect if function is recursive
   */
  private detectRecursion(source: string): boolean {
    // This is a simple heuristic - proper detection would need AST
    const funcNameMatch = source.match(/def\s+(\w+)/);
    if (!funcNameMatch) return false;
    
    const funcName = funcNameMatch[1];
    const regex = new RegExp(`\\b${funcName}\\s*\\(`);
    
    // Check if function calls itself
    return regex.test(source.substring(funcNameMatch.index! + funcNameMatch[0].length));
  }
  
  /**
   * Check if function is site-specific
   */
  private isSiteSpecific(source: string): boolean {
    // Heuristics for site-specific code
    const siteSpecificPatterns = [
      /site\(".*"\)/,           // Hardcoded site reference
      /ref\(".*"\)/,            // Hardcoded ref
      /@[a-f0-9-]{36}/,         // UUID reference
      /navName\s*==\s*".*"/,    // Hardcoded navName
      /dis\s*==\s*".*"/,        // Hardcoded display name
    ];
    
    return siteSpecificPatterns.some(pattern => pattern.test(source));
  }
  
  /**
   * Assess code quality
   */
  private assessQuality(source: string): QualityMetrics {
    const hasDocumentation = /\/\*\*[\s\S]*?\*\//.test(source) || /\/\/.*/.test(source);
    const hasExamples = /@example|example:|usage:/.test(source);
    const hasErrorHandling = /try\s*{|catch\s*{/.test(source);
    const hasTests = /test|assert|verify/.test(source);
    
    return {
      hasDocumentation,
      hasExamples,
      hasErrorHandling,
      hasTests,
      lastReviewed: undefined
    };
  }
  
  /**
   * Extract related equipment types
   */
  private extractEquipTypes(source: string): string[] {
    const equipTypes: Set<string> = new Set();
    
    const knownEquipTypes = [
      'ahu', 'vav', 'fcu', 'meter', 'chiller', 'boiler', 'pump', 'fan',
      'damper', 'valve', 'sensor', 'thermostat', 'vfd', 'tower'
    ];
    
    for (const type of knownEquipTypes) {
      if (new RegExp(`\\b${type}\\b`, 'i').test(source)) {
        equipTypes.add(type);
      }
    }
    
    return Array.from(equipTypes);
  }
}
