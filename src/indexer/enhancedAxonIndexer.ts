/**
 * Enhanced Axon Indexer
 * 
 * Leverages the improved axon-parser-full.js to extract rich metadata
 * including defcomp structures, binding markers, and enhanced function details.
 */

import * as fs from 'fs';
import * as path from 'path';
import { AxonFunction, AxonCategory, AxonCodeIndex } from '../types/index.js';
import { AxonParser } from '../parser/axonParser.js';
import { EnhancedAxonParser, EnhancedFunctionMetadata } from '../parser/enhancedAxonParser.js';

// Import the JavaScript parser for AST analysis
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const axonParserFullPath = path.resolve(process.cwd(), 'scripts/axon-parser-full.js');

export interface DefCompSlot {
  name: string;
  type: string | null;
  meta: Record<string, any>;
  line: number;
  col: number;
}

export interface DefCompInfo {
  isDefComp: boolean;
  slots?: DefCompSlot[];
  ruleType?: 'sparkRule' | 'kpiRule' | 'curRule' | 'other';
  hasReadonly?: boolean;
  hasBinding?: boolean;
  hasWatch?: boolean;
  bindingCount?: number;
  tuningParameters?: string[];
}

export interface EnhancedAxonFunction extends AxonFunction {
  // Parser metadata
  astNodeType?: string;
  hasDoBlocks?: boolean;
  doBlockCount?: number;
  
  // DefComp specific
  defComp?: DefCompInfo;
  
  // Binding information
  bindings?: {
    input?: string[];   // bind markers
    output?: string[];  // bindOut markers
    tuning?: string[];  // bindTuning markers
  };
  
  // Enhanced metadata from sync (if available)
  enhanced?: EnhancedFunctionMetadata;
}

export class EnhancedAxonIndexer {
  private basicParser: AxonParser;
  private enhancedParser: EnhancedAxonParser;
  
  constructor() {
    this.basicParser = new AxonParser();
    this.enhancedParser = new EnhancedAxonParser();
  }
  
  /**
   * Parse and index an Axon file with enhanced metadata
   */
  async parseAxonFile(filePath: string, content: string): Promise<EnhancedAxonFunction[]> {
    const functions: EnhancedAxonFunction[] = [];
    
    try {
      // Try to parse with JavaScript parser for AST analysis
      const jsParserResult = await this.parseWithJsParser(content);
      
      // Parse with TypeScript parser for basic metadata
      const basicFunctions = this.basicParser.parseFunctions(content, filePath);
      
      for (const func of basicFunctions) {
        const enhanced: EnhancedAxonFunction = {
          ...func,
          examples: this.basicParser.extractExamples(func.sourceCode)
        };
        
        // Analyze AST if available
        if (jsParserResult?.ast) {
          enhanced.astNodeType = jsParserResult.ast.constructor?.name;
          
          // Check for DefComp
          if (enhanced.astNodeType === 'DefComp') {
            enhanced.defComp = this.analyzeDefComp(jsParserResult.ast);
            
            // Update tags based on rule type
            if (enhanced.defComp.ruleType) {
              enhanced.tags.push(enhanced.defComp.ruleType);
              enhanced.tags.push('defcomp');
              
              // Update category
              if (enhanced.defComp.ruleType === 'sparkRule') {
                enhanced.category = AxonCategory.SPARK_ANALYSIS;
              }
            }
            
            // Extract bindings
            enhanced.bindings = this.extractBindings(enhanced.defComp);
          }
          
          // Count do blocks
          const doBlockInfo = this.countDoBlocks(jsParserResult.ast);
          enhanced.hasDoBlocks = doBlockInfo.count > 0;
          enhanced.doBlockCount = doBlockInfo.count;
        }
        
        functions.push(enhanced);
      }
      
    } catch (error: any) {
      // Fallback to basic parsing if enhanced parsing fails
      console.error(`Enhanced parsing failed for ${filePath}, using basic: ${error.message}`);
      const basicFunctions = this.basicParser.parseFunctions(content, filePath);
      return basicFunctions.map(f => ({
        ...f,
        examples: this.basicParser.extractExamples(f.sourceCode)
      }));
    }
    
    return functions;
  }
  
  /**
   * Parse with JavaScript parser to get full AST
   */
  private async parseWithJsParser(content: string): Promise<{ ast: any; valid: boolean } | null> {
    try {
      // Dynamically import the JS parser
      const { AxonParser: JsAxonParser, AxonValidator } = await import(axonParserFullPath);
      
      const parser = new JsAxonParser(content);
      const ast = parser.parse();
      
      const validator = new AxonValidator(ast);
      const result = validator.validate();
      
      return { ast, valid: result.valid };
    } catch (error: any) {
      // Parser not available or parsing failed
      return null;
    }
  }
  
  /**
   * Analyze DefComp AST node
   */
  private analyzeDefComp(ast: any): DefCompInfo {
    const info: DefCompInfo = {
      isDefComp: true,
      slots: [],
      bindingCount: 0,
      tuningParameters: []
    };
    
    if (!ast.slots) return info;
    
    // Analyze slots
    for (const slot of ast.slots) {
      info.slots!.push({
        name: slot.name,
        type: slot.type,
        meta: slot.meta || {},
        line: slot.line,
        col: slot.col
      });
      
      // Check for specific markers
      if (slot.meta) {
        if (slot.meta.readonly) {
          info.hasReadonly = true;
        }
        if (slot.meta.bind || slot.meta.bindOut) {
          info.hasBinding = true;
          info.bindingCount! += 1;
        }
        if (slot.meta.watch) {
          info.hasWatch = true;
        }
        if (slot.meta.bindTuning) {
          info.tuningParameters!.push(slot.name);
        }
      }
    }
    
    // Determine rule type from marker tags
    const markerNames = ast.slots.flatMap((slot: any) => 
      Object.keys(slot.meta || {})
    );
    
    if (markerNames.includes('sparkRule') || info.slots!.some(s => s.name === 'date' && s.meta.readonly)) {
      info.ruleType = 'sparkRule';
    } else if (markerNames.includes('kpiRule')) {
      info.ruleType = 'kpiRule';
    } else if (info.hasWatch || markerNames.includes('curRule')) {
      info.ruleType = 'curRule';
    } else {
      info.ruleType = 'other';
    }
    
    return info;
  }
  
  /**
   * Extract binding information from DefComp
   */
  private extractBindings(defComp: DefCompInfo): {
    input: string[];
    output: string[];
    tuning: string[];
  } {
    const bindings = {
      input: [] as string[],
      output: [] as string[],
      tuning: [] as string[]
    };
    
    if (!defComp.slots) return bindings;
    
    for (const slot of defComp.slots) {
      if (slot.meta.bind && typeof slot.meta.bind.value === 'string') {
        bindings.input.push(slot.meta.bind.value);
      }
      if (slot.meta.bindOut && typeof slot.meta.bindOut.value === 'string') {
        bindings.output.push(slot.meta.bindOut.value);
      }
      if (slot.meta.bindTuning && typeof slot.meta.bindTuning.value === 'string') {
        bindings.tuning.push(slot.meta.bindTuning.value);
      }
    }
    
    return bindings;
  }
  
  /**
   * Count do blocks in AST
   */
  private countDoBlocks(node: any): { count: number } {
    let count = 0;
    
    const traverse = (n: any) => {
      if (!n) return;
      
      // Check node type
      const nodeType = n.constructor?.name;
      if (nodeType === 'Block') {
        count++;
      }
      
      // Recursively traverse
      if (n.exprs && Array.isArray(n.exprs)) {
        n.exprs.forEach(traverse);
      }
      if (n.body) {
        traverse(n.body);
      }
      if (n.trueExpr) traverse(n.trueExpr);
      if (n.falseExpr) traverse(n.falseExpr);
      if (n.tryExpr) traverse(n.tryExpr);
      if (n.catchExpr) traverse(n.catchExpr);
    };
    
    traverse(node);
    return { count };
  }
  
  /**
   * Build enhanced index from directory
   */
  async buildIndex(directory: string): Promise<AxonCodeIndex> {
    const index: AxonCodeIndex = {
      functions: new Map(),
      categories: new Map(),
      tags: new Map(),
      lastUpdated: new Date()
    };
    
    // Scan for .axon files
    const files = this.scanDirectory(directory);
    
    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const functions = await this.parseAxonFile(file, content);
        
        for (const func of functions) {
          // Index function
          index.functions.set(func.id, func);
          
          // Index by category
          if (!index.categories.has(func.category)) {
            index.categories.set(func.category, []);
          }
          index.categories.get(func.category)!.push(func.id);
          
          // Index by tags
          for (const tag of func.tags) {
            if (!index.tags.has(tag)) {
              index.tags.set(tag, []);
            }
            index.tags.get(tag)!.push(func.id);
          }
        }
      } catch (error: any) {
        console.error(`Error indexing ${file}: ${error.message}`);
      }
    }
    
    return index;
  }
  
  /**
   * Recursively scan directory for .axon files
   */
  private scanDirectory(dir: string): string[] {
    const files: string[] = [];
    
    if (!fs.existsSync(dir)) {
      return files;
    }
    
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        files.push(...this.scanDirectory(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.axon')) {
        files.push(fullPath);
      }
    }
    
    return files;
  }
  
  /**
   * Get statistics about indexed functions
   */
  getIndexStats(index: AxonCodeIndex): {
    total: number;
    byCategory: Record<string, number>;
    defCompCount: number;
    ruleTypes: Record<string, number>;
    withBindings: number;
    withTuning: number;
  } {
    const stats = {
      total: index.functions.size,
      byCategory: {} as Record<string, number>,
      defCompCount: 0,
      ruleTypes: {} as Record<string, number>,
      withBindings: 0,
      withTuning: 0
    };
    
    for (const [category, ids] of index.categories) {
      stats.byCategory[category] = ids.length;
    }
    
    for (const func of index.functions.values()) {
      const enhanced = func as EnhancedAxonFunction;
      
      if (enhanced.defComp?.isDefComp) {
        stats.defCompCount++;
        
        if (enhanced.defComp.ruleType) {
          stats.ruleTypes[enhanced.defComp.ruleType] = 
            (stats.ruleTypes[enhanced.defComp.ruleType] || 0) + 1;
        }
        
        if (enhanced.bindings && 
            ((enhanced.bindings.input?.length || 0) > 0 || (enhanced.bindings.output?.length || 0) > 0)) {
          stats.withBindings++;
        }
        
        if (enhanced.bindings && (enhanced.bindings.tuning?.length || 0) > 0) {
          stats.withTuning++;
        }
      }
    }
    
    return stats;
  }
}
