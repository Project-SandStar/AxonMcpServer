/**
 * Types for HTML documentation parsing and FlexSearch integration
 */

export interface DocumentSection {
  id: string;
  heading: string;
  level: number; // 1, 2, 3 for h1, h2, h3
  content: string;
  codeExamples: string[];
}

export interface HtmlDocument {
  id: string;
  title: string;
  library: string; // e.g., "lib-task", "lib-energy"
  filePath: string;
  sections: DocumentSection[];
  fullText: string; // Combined text for indexing
  url?: string; // Optional file:// URL
}

export interface DocSearchOptions {
  keyword?: string;
  library?: string; // Filter by library name
  includeContent?: boolean; // Include full content or just summaries
  maxSections?: number; // Limit sections per result
  limit?: number; // Maximum results to return
}

export interface DocSearchResult {
  document: HtmlDocument;
  score: number; // Relevance score (0-100)
  matchedSections: DocumentSection[]; // Sections that matched the query
  highlights?: string[]; // Text snippets with matches highlighted
}

export interface FlexSearchIndexStats {
  totalDocuments: number;
  totalSections: number;
  indexSize: number; // Approximate memory size in bytes
  libraries: string[]; // List of all indexed libraries
}
