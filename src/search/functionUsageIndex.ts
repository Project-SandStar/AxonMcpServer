import { FunctionUsage, FunctionUsageIndex, FunctionUsageStats, FunctionExample } from '../types/functionUsage.js';
import { FunctionUsageParser } from '../parser/functionUsageParser.js';
import { FileScanner } from '../scanner/fileScanner.js';
import { AxonCodeIndex } from '../types/index.js';
import { EnhancedAxonParser, type EnhancedFunctionMetadata } from '../parser/enhancedAxonParser.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

export class FunctionUsageIndexer {
  private index: FunctionUsageIndex;
  private parser: FunctionUsageParser;
  private enhancedParser: EnhancedAxonParser;
  private scanner: FileScanner;
  private cacheDir: string;
  private enhancedMetadata: Map<string, EnhancedFunctionMetadata>; // Store enhanced metadata by function name

  constructor(scanner: FileScanner, cacheDir: string = '.cache') {
    this.scanner = scanner;
    this.cacheDir = cacheDir;
    this.parser = new FunctionUsageParser();
    this.enhancedParser = new EnhancedAxonParser();
    this.index = this.createEmptyIndex();
    this.enhancedMetadata = new Map();
  }

  /**
   * Create an empty index structure
   */
  private createEmptyIndex(): FunctionUsageIndex {
    return {
      usages: new Map(),
      calledBy: new Map(),
      calls: new Map(),
      stats: {
        totalFunctions: 0,
        totalUsages: 0,
        unusedFunctions: [],
        mostUsedFunctions: [],
        builtinFunctions: new Set(),
        userDefinedFunctions: new Set()
      },
      lastIndexed: new Date()
    };
  }

  /**
   * Load enhanced metadata from synced function files
   */
  private async loadEnhancedMetadata(): Promise<void> {
    const projDir = 'proj';
    
    try {
      // Check if proj directory exists
      await fs.access(projDir);
      
      // Scan for all .sync-metadata.json files
      const metadataFiles = await this.findMetadataFiles(projDir);
      
      for (const metadataFile of metadataFiles) {
        try {
          const content = await fs.readFile(metadataFile, 'utf-8');
          const metadata = JSON.parse(content);
          
          // Load enhanced metadata for each function
          if (metadata.functions && typeof metadata.functions === 'object') {
            for (const [funcName, funcMeta] of Object.entries(metadata.functions)) {
              this.enhancedMetadata.set(funcName, funcMeta as EnhancedFunctionMetadata);
            }
          }
        } catch (error) {
          // Skip invalid metadata files
        }
      }
      
      if (this.enhancedMetadata.size > 0) {
        console.error(`  ✓ Loaded enhanced metadata for ${this.enhancedMetadata.size} functions`);
      }
    } catch {
      // proj/ directory doesn't exist yet
    }
  }
  
  /**
   * Find all .sync-metadata.json files
   */
  private async findMetadataFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          files.push(...await this.findMetadataFiles(fullPath));
        } else if (entry.isFile() && entry.name === '.sync-metadata.json') {
          files.push(fullPath);
        }
      }
    } catch {
      // Ignore errors
    }
    
    return files;
  }
  
  /**
   * Build the function usage index from the codebase
   */
  async buildIndex(codeIndex: AxonCodeIndex): Promise<void> {
    console.error('Building function usage index...');
    const startTime = Date.now();
    
    // Load enhanced metadata from synced files
    await this.loadEnhancedMetadata();

    // Get all user-defined function names
    const userDefinedFunctions = new Set<string>();
    for (const [_, func] of codeIndex.functions) {
      userDefinedFunctions.add(func.name);
    }
    this.parser.updateUserDefinedFunctions(userDefinedFunctions);

    // Scan all Axon files
    const files = await this.scanner.scanForAxonFiles();
    const allUsages: FunctionUsage[] = [];

    // Process each file
    for (const fileInfo of files) {
      try {
        const content = await this.scanner.readFileContents(fileInfo.codePath);
        const usages = this.parser.parseFunctionUsages(content, fileInfo.codePath);
        allUsages.push(...usages);

        // Also extract chained calls
        const chainedCalls = this.parser.findChainedCalls(content, fileInfo.codePath);
        allUsages.push(...chainedCalls);
      } catch (error) {
        console.error(`Error processing ${fileInfo.codePath}:`, error);
      }
    }

    // Build the index from usages
    this.buildIndexFromUsages(allUsages, userDefinedFunctions);

    // Calculate statistics
    this.calculateStats();

    const duration = Date.now() - startTime;
    console.error(`Function usage index built in ${duration}ms with ${this.index.stats.totalUsages} usages`);
  }

  /**
   * Build index structures from usage data
   */
  private buildIndexFromUsages(usages: FunctionUsage[], userDefinedFunctions: Set<string>) {
    // Clear existing index
    this.index = this.createEmptyIndex();
    this.index.stats.userDefinedFunctions = userDefinedFunctions;

    for (const usage of usages) {
      // Add to usages map
      if (!this.index.usages.has(usage.functionName)) {
        this.index.usages.set(usage.functionName, []);
      }
      this.index.usages.get(usage.functionName)!.push(usage);

      // Update called-by relationships
      if (usage.callingFunction) {
        if (!this.index.calledBy.has(usage.functionName)) {
          this.index.calledBy.set(usage.functionName, new Set());
        }
        this.index.calledBy.get(usage.functionName)!.add(usage.callingFunction);

        // Update calls relationships
        if (!this.index.calls.has(usage.callingFunction)) {
          this.index.calls.set(usage.callingFunction, new Set());
        }
        this.index.calls.get(usage.callingFunction)!.add(usage.functionName);
      }

      // Track builtin functions
      if (usage.functionType === 'builtin') {
        this.index.stats.builtinFunctions.add(usage.functionName);
      }
    }

    this.index.lastIndexed = new Date();
  }

  /**
   * Calculate index statistics
   */
  private calculateStats() {
    const stats = this.index.stats;
    
    // Total functions and usages
    stats.totalFunctions = this.index.usages.size;
    stats.totalUsages = Array.from(this.index.usages.values())
      .reduce((sum, usages) => sum + usages.length, 0);

    // Find unused functions
    stats.unusedFunctions = Array.from(stats.userDefinedFunctions)
      .filter(func => !this.index.usages.has(func));

    // Find most used functions
    const usageCounts = Array.from(this.index.usages.entries())
      .map(([name, usages]) => ({ name, count: usages.length }))
      .sort((a, b) => b.count - a.count);
    
    stats.mostUsedFunctions = usageCounts.slice(0, 20);
  }

  /**
   * Find all usages of a specific function
   */
  findUsages(functionName: string, limit: number = 20): FunctionUsage[] {
    const usages = this.index.usages.get(functionName) || [];
    return usages.slice(0, limit);
  }

  /**
   * Get real-world examples of function usage
   */
  getFunctionExamples(functionName: string, maxExamples: number = 5): FunctionExample[] {
    const usages = this.index.usages.get(functionName) || [];
    const examples: FunctionExample[] = [];
    
    // Group by complexity based on argument count and context
    const categorized = usages.map(usage => {
      const complexity = this.calculateComplexity(usage);
      return { usage, complexity };
    });

    // Get diverse examples from each complexity level
    const complexityLevels: Array<'simple' | 'medium' | 'complex'> = ['simple', 'medium', 'complex'];
    
    for (const level of complexityLevels) {
      const levelUsages = categorized
        .filter(item => item.complexity === level)
        .slice(0, Math.ceil(maxExamples / 3));
      
      for (const { usage, complexity } of levelUsages) {
        if (examples.length >= maxExamples) break;
        
        const code = this.formatUsageAsExample(usage);
        examples.push({
          file: usage.file,
          line: usage.line,
          code,
          complexity,
          description: this.generateExampleDescription(usage)
        });
      }
    }

    return examples.slice(0, maxExamples);
  }

  /**
   * Calculate complexity of a usage
   */
  private calculateComplexity(usage: FunctionUsage): 'simple' | 'medium' | 'complex' {
    const argCount = usage.arguments.length;
    const hasMethodChaining = usage.isMethodCall;
    const hasComplexArgs = usage.arguments.some(arg => 
      arg.includes('=>') || arg.includes('(') || arg.length > 50
    );

    if (argCount === 0 || (argCount === 1 && !hasComplexArgs)) return 'simple';
    if (argCount <= 3 && !hasComplexArgs && !hasMethodChaining) return 'medium';
    return 'complex';
  }

  /**
   * Format usage as an example with context
   */
  private formatUsageAsExample(usage: FunctionUsage): string {
    if (usage.surroundingLines && usage.surroundingLines.length > 0) {
      return usage.surroundingLines.join('\n');
    }
    return usage.context;
  }

  /**
   * Generate a description for an example
   */
  private generateExampleDescription(usage: FunctionUsage): string {
    const parts: string[] = [];
    
    if (usage.isMethodCall && usage.receiver) {
      parts.push(`Method call on ${usage.receiver}`);
    }
    
    if (usage.arguments.length > 0) {
      parts.push(`${usage.arguments.length} argument${usage.arguments.length > 1 ? 's' : ''}`);
    }
    
    if (usage.callingFunction) {
      parts.push(`called from ${usage.callingFunction}`);
    }
    
    return parts.join(', ');
  }

  /**
   * Get function call graph
   */
  getCallGraph(functionName: string, depth: number = 1): {
    calledBy: string[];
    calls: string[];
    graph?: Map<string, Set<string>>;
  } {
    const calledBy = Array.from(this.index.calledBy.get(functionName) || new Set<string>());
    const calls = Array.from(this.index.calls.get(functionName) || new Set<string>());
    
    if (depth > 1) {
      // Build deeper graph
      const graph = new Map<string, Set<string>>();
      this.buildDeepGraph(functionName, depth, graph, new Set());
      return { calledBy, calls, graph };
    }
    
    return { calledBy, calls };
  }

  /**
   * Build a deep call graph
   */
  private buildDeepGraph(
    functionName: string, 
    depth: number, 
    graph: Map<string, Set<string>>,
    visited: Set<string>
  ) {
    if (depth <= 0 || visited.has(functionName)) return;
    visited.add(functionName);
    
    const calls = this.index.calls.get(functionName) || new Set();
    if (calls.size > 0) {
      graph.set(functionName, new Set(calls));
      for (const calledFunc of calls) {
        this.buildDeepGraph(calledFunc, depth - 1, graph, visited);
      }
    }
  }

  /**
   * Search for function patterns
   */
  searchPatterns(pattern: {
    functionName?: string;
    argumentPattern?: string;
    contextPattern?: string;
  }): FunctionUsage[] {
    let results = Array.from(this.index.usages.values()).flat();
    
    if (pattern.functionName) {
      const regex = new RegExp(pattern.functionName, 'i');
      results = results.filter(usage => regex.test(usage.functionName));
    }
    
    if (pattern.argumentPattern) {
      const regex = new RegExp(pattern.argumentPattern, 'i');
      results = results.filter(usage => 
        usage.arguments.some(arg => regex.test(arg))
      );
    }
    
    if (pattern.contextPattern) {
      const regex = new RegExp(pattern.contextPattern, 'i');
      results = results.filter(usage => regex.test(usage.context));
    }
    
    return results;
  }

  /**
   * Get index statistics
   */
  getStats(): FunctionUsageStats {
    return { ...this.index.stats };
  }

  /**
   * Save index to cache
   */
  async saveCache(): Promise<void> {
    const cacheFile = path.join(this.cacheDir, 'function-usage-index.json');
    
    // Convert Maps to arrays for JSON serialization
    const serializable = {
      usages: Array.from(this.index.usages.entries()),
      calledBy: Array.from(this.index.calledBy.entries())
        .map(([k, v]) => [k, Array.from(v)]),
      calls: Array.from(this.index.calls.entries())
        .map(([k, v]) => [k, Array.from(v)]),
      stats: {
        ...this.index.stats,
        builtinFunctions: Array.from(this.index.stats.builtinFunctions),
        userDefinedFunctions: Array.from(this.index.stats.userDefinedFunctions)
      },
      enhancedMetadata: Array.from(this.enhancedMetadata.entries()),
      lastIndexed: this.index.lastIndexed.toISOString()
    };
    
    await fs.mkdir(this.cacheDir, { recursive: true });
    await fs.writeFile(cacheFile, JSON.stringify(serializable, null, 2));
  }

  /**
   * Load index from cache
   */
  async loadCache(): Promise<boolean> {
    const cacheFile = path.join(this.cacheDir, 'function-usage-index.json');
    
    try {
      const data = await fs.readFile(cacheFile, 'utf-8');
      const parsed = JSON.parse(data);
      
      // Reconstruct the index
      this.index = {
        usages: new Map(parsed.usages),
        calledBy: new Map(parsed.calledBy.map(([k, v]: [string, string[]]) => [k, new Set(v)])),
        calls: new Map(parsed.calls.map(([k, v]: [string, string[]]) => [k, new Set(v)])),
        stats: {
          ...parsed.stats,
          builtinFunctions: new Set(parsed.stats.builtinFunctions),
          userDefinedFunctions: new Set(parsed.stats.userDefinedFunctions)
        },
        lastIndexed: new Date(parsed.lastIndexed)
      };
      
      // Restore enhanced metadata if available
      if (parsed.enhancedMetadata) {
        this.enhancedMetadata = new Map(parsed.enhancedMetadata);
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Get enhanced metadata for a function
   */
  getEnhancedMetadata(functionName: string): EnhancedFunctionMetadata | undefined {
    return this.enhancedMetadata.get(functionName);
  }
  
  /**
   * Get all functions with enhanced metadata
   */
  getFunctionsWithMetadata(): Array<{ name: string; metadata: EnhancedFunctionMetadata }> {
    return Array.from(this.enhancedMetadata.entries()).map(([name, metadata]) => ({ name, metadata }));
  }
}