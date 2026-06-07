import { AxonFunction } from '../types/index.js';

interface SearchToken {
  token: string;
  functionIds: Set<string>;
}

export class SearchIndex {
  private tokenIndex: Map<string, Set<string>> = new Map();
  private readonly minTokenLength = 2;
  
  /**
   * Build search index from functions
   */
  buildIndex(functions: Map<string, AxonFunction>): void {
    console.error('Building search index...');
    const startTime = Date.now();
    
    for (const [id, func] of functions) {
      // Extract all searchable text
      const searchableText = [
        func.name,
        func.description || '',
        func.documentation || '',
        ...func.tags,
        ...(func.parameters || []),
        func.category
      ].join(' ').toLowerCase();
      
      // Tokenize and index
      const tokens = this.tokenize(searchableText);
      for (const token of tokens) {
        if (!this.tokenIndex.has(token)) {
          this.tokenIndex.set(token, new Set());
        }
        this.tokenIndex.get(token)!.add(id);
      }
    }
    
    const duration = Date.now() - startTime;
    console.error(`Search index built in ${duration}ms with ${this.tokenIndex.size} unique tokens`);
  }
  
  /**
   * Tokenize text for indexing
   */
  private tokenize(text: string): Set<string> {
    const tokens = new Set<string>();
    
    // Split on non-alphanumeric characters
    const words = text.split(/[^a-z0-9]+/);
    
    for (const word of words) {
      if (word.length >= this.minTokenLength) {
        tokens.add(word);
        
        // Add prefixes for partial matching
        for (let i = this.minTokenLength; i < word.length; i++) {
          tokens.add(word.substring(0, i));
        }
      }
    }
    
    return tokens;
  }
  
  /**
   * Search for functions containing all keywords
   */
  search(keywords: string[]): Set<string> {
    if (keywords.length === 0) {
      return new Set();
    }
    
    // Tokenize keywords
    const searchTokens = keywords
      .map(k => k.toLowerCase())
      .filter(k => k.length >= this.minTokenLength);
    
    if (searchTokens.length === 0) {
      return new Set();
    }
    
    // Find function IDs for each token
    const tokenResults = searchTokens.map(token => {
      const exact = this.tokenIndex.get(token);
      if (exact) {
        return new Set(exact);
      }
      
      // Prefix search
      const results = new Set<string>();
      for (const [indexToken, functionIds] of this.tokenIndex) {
        if (indexToken.startsWith(token)) {
          functionIds.forEach(id => results.add(id));
        }
      }
      return results;
    });
    
    // Intersect all results (AND operation)
    if (tokenResults.length === 0) {
      return new Set();
    }
    
    let intersection = new Set(tokenResults[0]);
    for (let i = 1; i < tokenResults.length; i++) {
      intersection = new Set([...intersection].filter(id => tokenResults[i].has(id)));
    }
    
    return intersection;
  }
  
  /**
   * Get all function IDs containing any of the keywords (OR operation)
   */
  searchAny(keywords: string[]): Set<string> {
    const results = new Set<string>();
    
    for (const keyword of keywords) {
      const token = keyword.toLowerCase();
      if (token.length < this.minTokenLength) continue;
      
      // Exact match
      const exact = this.tokenIndex.get(token);
      if (exact) {
        exact.forEach(id => results.add(id));
      }
      
      // Prefix match
      for (const [indexToken, functionIds] of this.tokenIndex) {
        if (indexToken.startsWith(token)) {
          functionIds.forEach(id => results.add(id));
        }
      }
    }
    
    return results;
  }
  
  /**
   * Clear the index
   */
  clear(): void {
    this.tokenIndex.clear();
  }
  
  /**
   * Get index statistics
   */
  getStats(): { tokenCount: number; avgFunctionsPerToken: number } {
    const tokenCount = this.tokenIndex.size;
    const totalFunctions = Array.from(this.tokenIndex.values())
      .reduce((sum, set) => sum + set.size, 0);
    
    return {
      tokenCount,
      avgFunctionsPerToken: tokenCount > 0 ? totalFunctions / tokenCount : 0
    };
  }
}