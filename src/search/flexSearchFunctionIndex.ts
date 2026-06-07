import FlexSearch from 'flexsearch';
import { AxonFunction } from '../types/index.js';

export interface FunctionSearchOptions {
  query: string;
  limit?: number;
  category?: string;
  tags?: string[];
  source?: 'library' | 'project' | 'all';
  project?: string;
  instance?: string;
  fuzzy?: boolean;
}

export interface FunctionSearchResult {
  function: AxonFunction;
  score: number;
  matchedFields: string[];
  highlights?: { [field: string]: string };
}

export interface FlexSearchFunctionStats {
  totalFunctions: number;
  indexSize: number;
  libraryFunctions: number;
  projectFunctions: number;
  categories: string[];
  avgIndexTime: number;
}

/**
 * FlexSearch-based index for Axon functions
 * Provides fast, fuzzy, and contextual search capabilities
 */
export class FlexSearchFunctionIndex {
  private index: any; // FlexSearch.Document
  private functions: Map<string, AxonFunction> = new Map();
  private categoryIndex: Map<string, Set<string>> = new Map();
  private projectIndex: Map<string, Set<string>> = new Map();
  private sourceIndex: Map<'library' | 'project', Set<string>> = new Map();
  
  constructor() {
    // Initialize FlexSearch Document index with optimized configuration for code search
    this.index = new (FlexSearch as any).Document({
      document: {
        id: 'id',
        index: [
          {
            field: 'name',
            tokenize: 'forward',
            optimize: true,
            resolution: 9,
            // Name matches are most important
          },
          {
            field: 'description',
            tokenize: 'forward',
            optimize: true,
            resolution: 5,
            context: {
              resolution: 3,
              depth: 2,
              bidirectional: true
            }
          },
          {
            field: 'tags',
            tokenize: 'strict',
            optimize: true,
            resolution: 3,
          },
          {
            field: 'category',
            tokenize: 'strict',
            optimize: true,
            resolution: 3,
          },
          {
            field: 'parameters',
            tokenize: 'forward',
            optimize: true,
            resolution: 5,
          },
          {
            field: 'sourceCode',
            tokenize: 'forward',
            optimize: true,
            resolution: 3,
            context: {
              resolution: 2,
              depth: 2,
              bidirectional: false
            }
          },
          {
            field: 'projectContext',
            tokenize: 'strict',
            optimize: true,
            resolution: 3,
          },
          {
            field: 'documentation',
            tokenize: 'forward',
            optimize: true,
            resolution: 4,
            context: {
              resolution: 2,
              depth: 2,
              bidirectional: true
            }
          }
        ]
      },
      tokenize: 'forward',
      cache: 100, // Cache 100 most recent queries
      optimize: true,
      context: {
        resolution: 4,
        depth: 2,
        bidirectional: true
      }
    });
    
    // Initialize source index
    this.sourceIndex.set('library', new Set());
    this.sourceIndex.set('project', new Set());
  }
  
  /**
   * Build index from Axon functions
   */
  async buildIndex(functions: Map<string, AxonFunction>): Promise<void> {
    console.error(`Building FlexSearch function index for ${functions.size} functions...`);
    const startTime = Date.now();
    
    let libraryCount = 0;
    let projectCount = 0;
    
    for (const [id, func] of functions) {
      // Prepare searchable document with comprehensive metadata
      const searchDoc = {
        id: func.id,
        name: func.name,
        description: func.description || '',
        tags: func.tags.join(' '),
        category: func.category,
        parameters: (func.parameters || []).join(' '),
        sourceCode: func.sourceCode.substring(0, 500), // Limit source code indexing
        projectContext: this.buildProjectContext(func),
        // Include documentation from trio files (help, doc fields)
        documentation: func.documentation || ''
      };
      
      // Add to FlexSearch index
      await this.index.addAsync(id, searchDoc);
      
      // Store function for retrieval
      this.functions.set(id, func);
      
      // Index by category
      if (!this.categoryIndex.has(func.category)) {
        this.categoryIndex.set(func.category, new Set());
      }
      this.categoryIndex.get(func.category)!.add(id);
      
      // Index by project (extract from tags or filePath)
      const project = this.extractProject(func);
      if (project) {
        if (!this.projectIndex.has(project)) {
          this.projectIndex.set(project, new Set());
        }
        this.projectIndex.get(project)!.add(id);
      }
      
      // Index by source (library vs project)
      const source = this.determineSource(func);
      this.sourceIndex.get(source)!.add(id);
      
      if (source === 'library') libraryCount++;
      else projectCount++;
    }
    
    const duration = Date.now() - startTime;
    console.error(`FlexSearch function index built in ${duration}ms`);
    console.error(`  Library functions: ${libraryCount}`);
    console.error(`  Project functions: ${projectCount}`);
    console.error(`  Categories: ${this.categoryIndex.size}`);
    console.error(`  Projects: ${this.projectIndex.size}`);
  }
  
  /**
   * Search functions with advanced options
   */
  async search(options: FunctionSearchOptions): Promise<FunctionSearchResult[]> {
    const {
      query,
      limit = 20,
      category,
      tags = [],
      source = 'all',
      project,
      instance,
      fuzzy = true
    } = options;
    
    if (!query || query.trim().length === 0) {
      return [];
    }
    
    const startTime = Date.now();
    
    // Prepare query - split into words for better matching
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    
    let searchResults: any[] = [];
    
    // Multi-field search with different weights (includes trio metadata)
    const fields = ['name', 'description', 'documentation', 'tags', 'parameters', 'category', 'projectContext'];
    
    if (queryWords.length === 1) {
      // Single word search - use FlexSearch's native search
      searchResults = await this.index.searchAsync(queryWords[0], {
        index: fields,
        limit: limit * 3, // Get more results for filtering
        enrich: true
      });
    } else {
      // Multi-word search - find documents matching all words
      const allResults: Map<string, Set<string>> = new Map();
      
      for (const word of queryWords) {
        const wordResults = await this.index.searchAsync(word, {
          index: fields,
          limit: 100,
          enrich: true
        });
        
        for (const fieldResult of wordResults) {
          if (fieldResult && fieldResult.result) {
            const field = fieldResult.field;
            if (!allResults.has(field)) {
              allResults.set(field, new Set());
            }
            for (const docId of fieldResult.result) {
              allResults.get(field)!.add(docId as string);
            }
          }
        }
      }
      
      // Score documents by how many query words they match
      const docScores = new Map<string, { score: number; fields: Set<string> }>();
      
      for (const [field, docIds] of allResults) {
        for (const docId of docIds) {
          const func = this.functions.get(docId);
          if (!func) continue;
          
          // Count matching words
          let matchCount = 0;
          const searchText = this.buildSearchableText(func).toLowerCase();
          
          for (const word of queryWords) {
            if (searchText.includes(word)) {
              matchCount++;
            }
          }
          
          if (matchCount > 0) {
            if (!docScores.has(docId)) {
              docScores.set(docId, { score: 0, fields: new Set() });
            }
            const entry = docScores.get(docId)!;
            entry.score += matchCount * this.getFieldWeight(field);
            entry.fields.add(field);
          }
        }
      }
      
      // Convert to result format
      const sortedDocs = Array.from(docScores.entries())
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, limit * 3)
        .map(([docId, data]) => ({
          docId,
          score: data.score,
          fields: Array.from(data.fields)
        }));
      
      if (sortedDocs.length > 0) {
        searchResults = sortedDocs;
      }
    }
    
    // Process and filter results
    const results: FunctionSearchResult[] = [];
    const seenFuncs = new Set<string>();
    
    // Handle different result formats from FlexSearch
    const processResults = Array.isArray(searchResults) ? searchResults : [];
    
    for (const item of processResults) {
      // Extract function ID based on result format
      let funcId: string;
      let matchedFields: string[] = [];
      let baseScore = 1;
      
      if (typeof item === 'object' && item.docId) {
        // Multi-word result format
        funcId = item.docId;
        matchedFields = item.fields || [];
        baseScore = item.score || 1;
      } else if (typeof item === 'object' && item.field && item.result) {
        // FlexSearch enrich format
        for (const resultItem of item.result) {
          const id = typeof resultItem === 'string' ? resultItem : resultItem.id;
          if (seenFuncs.has(id)) continue;
          
          const func = this.functions.get(id);
          if (!func) continue;
          
          // Apply filters
          if (!this.matchesFilters(func, category, tags, source, project, instance)) continue;
          
          seenFuncs.add(id);
          matchedFields = [item.field];
          
          const score = this.calculateScore(func, query, matchedFields, queryWords);
          results.push({
            function: func,
            score,
            matchedFields
          });
          
          if (results.length >= limit) break;
        }
        continue;
      } else {
        continue;
      }
      
      if (seenFuncs.has(funcId)) continue;
      
      const func = this.functions.get(funcId);
      if (!func) continue;
      
      // Apply filters
      if (!this.matchesFilters(func, category, tags, source, project, instance)) continue;
      
      seenFuncs.add(funcId);
      
      const score = this.calculateScore(func, query, matchedFields, queryWords) * baseScore;
      results.push({
        function: func,
        score,
        matchedFields
      });
      
      if (results.length >= limit) break;
    }
    
    // Sort by score (descending)
    results.sort((a, b) => b.score - a.score);
    
    const duration = Date.now() - startTime;
    console.error(`FlexSearch query "${query}" completed in ${duration}ms - ${results.length} results`);
    
    return results.slice(0, limit);
  }
  
  /**
   * Get index statistics
   */
  getStats(): FlexSearchFunctionStats {
    const libraryFunctions = this.sourceIndex.get('library')!.size;
    const projectFunctions = this.sourceIndex.get('project')!.size;
    
    return {
      totalFunctions: this.functions.size,
      indexSize: this.functions.size * 1024, // Rough estimate
      libraryFunctions,
      projectFunctions,
      categories: Array.from(this.categoryIndex.keys()),
      avgIndexTime: 0 // Can be calculated if tracking
    };
  }
  
  /**
   * Clear the index
   */
  clear(): void {
    this.functions.clear();
    this.categoryIndex.clear();
    this.projectIndex.clear();
    this.sourceIndex.get('library')!.clear();
    this.sourceIndex.get('project')!.clear();
    // FlexSearch doesn't have a clear method, so we recreate the index
    this.index = new (FlexSearch as any).Document({
      document: {
        id: 'id',
        index: ['name', 'description', 'tags', 'category', 'parameters', 'sourceCode', 'projectContext']
      },
      tokenize: 'forward',
      cache: 100,
      optimize: true
    });
  }
  
  // Private helper methods
  
  private buildProjectContext(func: AxonFunction): string {
    const contextParts: string[] = [];
    
    // Extract instance and project from tags
    const projectTags = func.tags.filter(t => 
      !['documentation', 'example', 'synced', 'skyspark', 'library'].includes(t)
    );
    
    contextParts.push(...projectTags);
    
    // Extract from file path
    if (func.filePath.includes('proj/')) {
      const pathParts = func.filePath.split('/');
      const projIndex = pathParts.indexOf('proj');
      if (projIndex >= 0 && projIndex + 2 < pathParts.length) {
        contextParts.push(pathParts[projIndex + 1]); // instance
        contextParts.push(pathParts[projIndex + 2]); // project
      }
    }
    
    return contextParts.join(' ');
  }
  
  private extractProject(func: AxonFunction): string | null {
    // Check tags first
    for (const tag of func.tags) {
      if (tag.includes('/')) {
        return tag; // instance/project format
      }
    }
    
    // Extract from file path
    if (func.filePath.includes('proj/')) {
      const match = func.filePath.match(/proj\/([^/]+)\/([^/]+)/);
      if (match) {
        return `${match[1]}/${match[2]}`;
      }
    }
    
    return null;
  }
  
  private determineSource(func: AxonFunction): 'library' | 'project' {
    // If it has synced or skyspark tags, or filePath contains proj/, it's a project function
    if (func.tags.includes('synced') || func.tags.includes('skyspark') || func.filePath.includes('proj/')) {
      return 'project';
    }
    return 'library';
  }
  
  private buildSearchableText(func: AxonFunction): string {
    return [
      func.name,
      func.description || '',
      func.documentation || '', // Includes trio help/doc fields
      ...(func.parameters || []),
      ...func.tags, // Includes trio rule types (sparkRule, kpiRule, etc.)
      func.category
    ].join(' ');
  }
  
  private getFieldWeight(field: string): number {
    const weights: { [key: string]: number } = {
      name: 5.0,          // Exact name matches are most important
      parameters: 3.0,    // Parameter matches are very relevant
      tags: 2.5,          // Tags help with categorization (includes trio rule types)
      category: 2.0,      // Category matches are useful
      documentation: 1.8, // Documentation from trio files (help, doc) is very useful
      description: 1.5,   // Description (dis from trio) is helpful
      projectContext: 1.2, // Project context helps with filtering
      sourceCode: 0.8     // Source code matches are less reliable
    };
    return weights[field] || 1.0;
  }
  
  private matchesFilters(
    func: AxonFunction,
    category?: string,
    tags?: string[],
    source?: 'library' | 'project' | 'all',
    project?: string,
    instance?: string
  ): boolean {
    // Category filter
    if (category && func.category !== category) {
      return false;
    }
    
    // Tags filter
    if (tags && tags.length > 0) {
      const hasAllTags = tags.every(tag => 
        func.tags.some(t => t.toLowerCase().includes(tag.toLowerCase()))
      );
      if (!hasAllTags) return false;
    }
    
    // Source filter
    if (source && source !== 'all') {
      const funcSource = this.determineSource(func);
      if (funcSource !== source) return false;
    }
    
    // Project filter
    if (project) {
      const funcProject = this.extractProject(func);
      if (!funcProject || !funcProject.includes(project)) return false;
    }
    
    // Instance filter
    if (instance) {
      const funcProject = this.extractProject(func);
      if (!funcProject || !funcProject.startsWith(instance + '/')) return false;
    }
    
    return true;
  }
  
  private calculateScore(
    func: AxonFunction,
    query: string,
    matchedFields: string[],
    queryWords: string[]
  ): number {
    let score = 0;
    const queryLower = query.toLowerCase();
    const funcName = func.name.toLowerCase();
    
    // Exact name match gets highest score
    if (funcName === queryLower) {
      score += 100;
    } else if (funcName.startsWith(queryLower)) {
      score += 50;
    } else if (funcName.includes(queryLower)) {
      score += 25;
    }
    
    // Count matching words in name
    for (const word of queryWords) {
      if (funcName.includes(word)) {
        score += 10;
      }
    }
    
    // Field-based scoring
    for (const field of matchedFields) {
      score += this.getFieldWeight(field);
    }
    
    // Boost project functions slightly (they're often more relevant to user's work)
    if (this.determineSource(func) === 'project') {
      score *= 1.1;
    }
    
    // Penalize functions with 'documentation' tag (examples, not real code)
    if (func.tags.includes('documentation')) {
      score *= 0.3;
    }
    
    // Boost based on description quality
    if (func.description && func.description.length > 50) {
      score += 2;
    }
    
    return score;
  }
}
