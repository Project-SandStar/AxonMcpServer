import FlexSearch from 'flexsearch';
import { 
  HtmlDocument, 
  DocSearchOptions, 
  DocSearchResult, 
  FlexSearchIndexStats,
  DocumentSection 
} from '../types/documentation.js';

export class FlexSearchDocIndex {
  private index: any; // FlexSearch.Document
  private documents: Map<string, HtmlDocument> = new Map();
  private libraryIndex: Map<string, Set<string>> = new Map(); // library -> document IDs
  
  constructor() {
    // Initialize FlexSearch Document index with optimized configuration
    this.index = new (FlexSearch as any).Document({
      document: {
        id: 'id',
        index: [
          {
            field: 'title',
            tokenize: 'forward',
            optimize: true,
            resolution: 9,
            // boost: Title matches are most important
          },
          {
            field: 'library',
            tokenize: 'strict',
            optimize: true,
            resolution: 3,
          },
          {
            field: 'fullText',
            tokenize: 'forward',
            optimize: true,
            context: {
              resolution: 5,
              depth: 3,
              bidirectional: true
            }
          }
        ]
      },
      tokenize: 'forward',
      cache: true,
      optimize: true,
      context: true
    });
  }
  
  /**
   * Build index from parsed HTML documents
   */
  async buildIndex(documents: HtmlDocument[]): Promise<void> {
    console.error(`Building FlexSearch index for ${documents.length} documents...`);
    const startTime = Date.now();
    
    for (const doc of documents) {
      // Add to FlexSearch index
      await this.index.addAsync(doc.id, doc);
      
      // Store document for retrieval
      this.documents.set(doc.id, doc);
      
      // Index by library
      if (!this.libraryIndex.has(doc.library)) {
        this.libraryIndex.set(doc.library, new Set());
      }
      this.libraryIndex.get(doc.library)!.add(doc.id);
    }
    
    const duration = Date.now() - startTime;
    console.error(`FlexSearch index built in ${duration}ms`);
  }
  
  /**
   * Search documents with ranking
   */
  async search(query: string, options: DocSearchOptions = {}): Promise<DocSearchResult[]> {
    const limit = options.limit || 10;
    const library = options.library;
    const maxSections = options.maxSections || 3;
    
    // For multi-word queries, search each word separately
    // FlexSearch doesn't handle phrases well with forward tokenization
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    
    let searchResults: any[] = [];
    
    if (queryWords.length === 1) {
      // Single word search
      searchResults = await this.index.searchAsync(queryWords[0], {
        index: ['title', 'library', 'fullText'],
        limit: limit * 3,
        enrich: true
      });
    } else {
      // Multi-word search: search for each word and find intersection
      const allResults: Map<string, Set<string>> = new Map(); // field -> Set<docIds>
      
      for (const word of queryWords) {
        const wordResults = await this.index.searchAsync(word, {
          index: ['title', 'library', 'fullText'],
          limit: 100, // Get more results for intersection
          enrich: true
        });
        
        // Collect document IDs that match this word
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
      
      // Find documents that contain ALL query words (intersection)
      const docScores = new Map<string, number>();
      
      for (const [field, docIds] of allResults) {
        for (const docId of docIds) {
          // Check if this doc appears for all query words
          let wordCount = 0;
          for (const word of queryWords) {
            const doc = this.documents.get(docId);
            if (doc) {
              const searchText = `${doc.title} ${doc.library} ${doc.fullText}`.toLowerCase();
              if (searchText.includes(word)) {
                wordCount++;
              }
            }
          }
          
          // Give higher scores to docs that match more words
          if (wordCount > 0) {
            docScores.set(docId, (docScores.get(docId) || 0) + wordCount);
          }
        }
      }
      
      // Convert to FlexSearch result format, sorted by score
      const sortedDocs = Array.from(docScores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit * 3)
        .map(([docId]) => docId);
      
      if (sortedDocs.length > 0) {
        searchResults = [{
          field: 'fullText',
          result: sortedDocs
        }];
      }
    }
    
    const results: DocSearchResult[] = [];
    const seenDocs = new Set<string>();
    
    // FlexSearch with enrich:true returns array of field results
    // Each item is { field: string, result: Array<{id: string, doc: object}> }
    if (!Array.isArray(searchResults) || searchResults.length === 0) {
      return [];
    }
    
    // Process search results from all fields
    for (const fieldResult of searchResults) {
      if (!fieldResult || !fieldResult.result) {
        continue;
      }
      
      // fieldResult.result can be either array of IDs or array of enriched objects
      for (const item of fieldResult.result) {
        // Extract document ID (could be string or object with id property)
        const docId = typeof item === 'string' ? item : (item.id || item);
        
        if (seenDocs.has(docId as string)) continue;
        if (results.length >= limit) break;
        
        const doc = this.documents.get(docId as string);
        if (!doc) {
          continue;
        }
        
        // Apply library filter if specified
        if (library && !doc.library.includes(library)) continue;
        
        seenDocs.add(docId as string);
        
        // Find matching sections
        const matchedSections = this.findMatchingSections(doc, query, maxSections);
        
        // Calculate relevance score
        const score = this.calculateScore(doc, query, fieldResult.field as string);
        
        // Generate highlights
        const highlights = this.generateHighlights(doc, query, matchedSections);
        
        results.push({
          document: doc,
          score,
          matchedSections,
          highlights
        });
      }
      
      if (results.length >= limit) break;
    }
    
    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    
    return results.slice(0, limit);
  }
  
  /**
   * Search within a specific library
   */
  async searchByLibrary(query: string, library: string): Promise<DocSearchResult[]> {
    return this.search(query, { library, limit: 20 });
  }
  
  /**
   * Get a document by ID
   */
  getDocument(id: string): HtmlDocument | null {
    return this.documents.get(id) || null;
  }

  getAllDocumentIds(): string[] {
    return Array.from(this.documents.keys());
  }

  /**
   * Find sections in a document that match the query
   */
  private findMatchingSections(doc: HtmlDocument, query: string, maxSections: number): DocumentSection[] {
    const queryLower = query.toLowerCase();
    const queryTokens = queryLower.split(/\s+/);
    
    const scoredSections = doc.sections.map(section => {
      const searchText = `${section.heading} ${section.content} ${section.codeExamples.join(' ')}`.toLowerCase();
      
      let score = 0;
      
      // Bonus for exact phrase match
      if (searchText.includes(queryLower)) {
        score += 10;
      }
      
      // Score based on individual token matches
      for (const token of queryTokens) {
        if (searchText.includes(token)) {
          score += 1;
          // Bonus for heading matches
          if (section.heading.toLowerCase().includes(token)) {
            score += 2;
          }
        }
      }
      
      return { section, score };
    });
    
    // Return top N sections with matches
    return scoredSections
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSections)
      .map(s => s.section);
  }
  
  /**
   * Calculate relevance score (0-100)
   */
  private calculateScore(doc: HtmlDocument, query: string, matchedField: string): number {
    const queryLower = query.toLowerCase();
    let score = 50; // Base score
    
    const fullTextLower = doc.fullText.toLowerCase();
    
    // Big boost for exact phrase match in full text
    if (fullTextLower.includes(queryLower)) {
      score += 25;
    }
    
    // Boost for title match
    if (matchedField === 'title' || doc.title.toLowerCase().includes(queryLower)) {
      score += 30;
    }
    
    // Boost for library match
    if (matchedField === 'library' || doc.library.toLowerCase().includes(queryLower)) {
      score += 20;
    }
    
    // Boost for multiple query word matches in fullText
    const queryWords = queryLower.split(/\s+/);
    let wordMatches = 0;
    
    for (const word of queryWords) {
      if (fullTextLower.includes(word)) {
        wordMatches++;
      }
    }
    
    // Score based on percentage of words matched
    const matchPercentage = queryWords.length > 0 ? wordMatches / queryWords.length : 0;
    score += Math.floor(matchPercentage * 20);
    
    // Cap at 100
    return Math.min(score, 100);
  }
  
  /**
   * Generate text highlights for matched content
   */
  private generateHighlights(doc: HtmlDocument, query: string, matchedSections: DocumentSection[]): string[] {
    const highlights: string[] = [];
    const queryLower = query.toLowerCase();
    const maxHighlightLength = 150;
    
    for (const section of matchedSections.slice(0, 3)) {
      const text = section.content;
      const textLower = text.toLowerCase();
      const index = textLower.indexOf(queryLower);
      
      if (index !== -1) {
        // Extract context around the match
        const start = Math.max(0, index - 50);
        const end = Math.min(text.length, index + query.length + 100);
        let snippet = text.substring(start, end);
        
        if (start > 0) snippet = '...' + snippet;
        if (end < text.length) snippet = snippet + '...';
        
        highlights.push(snippet);
      } else {
        // Just use first part of section content
        let snippet = section.content.substring(0, maxHighlightLength);
        if (section.content.length > maxHighlightLength) {
          snippet += '...';
        }
        highlights.push(snippet);
      }
    }
    
    return highlights;
  }
  
  /**
   * Export index for caching (placeholder for now)
   */
  export(): string {
    // FlexSearch doesn't have built-in export, so we'll serialize the documents
    const data = {
      documents: Array.from(this.documents.values()),
      libraries: Array.from(this.libraryIndex.keys())
    };
    return JSON.stringify(data);
  }
  
  /**
   * Import index from cache (placeholder for now)
   */
  async import(data: string): Promise<void> {
    try {
      const parsed = JSON.parse(data);
      if (parsed.documents) {
        await this.buildIndex(parsed.documents);
      }
    } catch (error) {
      console.error('Error importing FlexSearch index:', error);
      throw error;
    }
  }
  
  /**
   * Get index statistics
   */
  getStats(): FlexSearchIndexStats {
    const libraries = Array.from(this.libraryIndex.keys());
    const totalSections = Array.from(this.documents.values())
      .reduce((sum, doc) => sum + doc.sections.length, 0);
    
    // Rough estimate of index size
    const indexSize = JSON.stringify(Array.from(this.documents.values())).length;
    
    return {
      totalDocuments: this.documents.size,
      totalSections,
      indexSize,
      libraries
    };
  }
  
  /**
   * Clear the index
   */
  clear(): void {
    this.documents.clear();
    this.libraryIndex.clear();
  }
}
