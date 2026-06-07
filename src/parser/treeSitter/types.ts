/**
 * Tree-sitter Parser Types for Axon
 *
 * Simplified type definitions for Axon-only parsing.
 */

import type { Language } from 'web-tree-sitter';

// ============================================
// Language Configuration
// ============================================

export type SupportedLanguage = 'axon';

export interface LanguageConfig {
  id: SupportedLanguage;
  name: string;
  extensions: string[];
  wasmPath?: string;
  loaded: boolean;
  language?: Language;
  nodeMappings: NodeTypeMappings;
}

export interface NodeTypeMappings {
  functionTypes: string[];
  classTypes: string[];
  interfaceTypes: string[];
  variableTypes: string[];
  importTypes: string[];
  exportTypes: string[];
  commentTypes: string[];
  callTypes: string[];
  nameField: string;
  parametersField: string;
  bodyField: string;
}

// ============================================
// AST Node Types
// ============================================

export interface ASTLocation {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  startIndex: number;
  endIndex: number;
}

export interface ASTNode {
  type: string;
  text: string;
  location: ASTLocation;
  children: ASTNode[];
  parent?: ASTNode;
  fields: Record<string, ASTNode | ASTNode[] | undefined>;
}

// ============================================
// Extracted Code Structures
// ============================================

export interface ExtractedFunction {
  name: string;
  qualifiedName: string;
  signature: string;
  parameters: ExtractedParameter[];
  returnType?: string;
  documentation?: string;
  location: ASTLocation;
  containingType?: string;
  body?: string;
  calls: ExtractedCall[];
  source?: string;
}

export interface ExtractedParameter {
  name: string;
  type?: string;
  defaultValue?: string;
  isOptional: boolean;
}

export interface ExtractedCall {
  name: string;
  expression: string;
  target?: string;
  location: ASTLocation;
}

export interface ExtractedDefcomp {
  name: string;
  qualifiedName: string;
  documentation?: string;
  location: ASTLocation;
  cells: ExtractedDefcompCell[];
  source?: string;
}

export interface ExtractedDefcompCell {
  name: string;
  type?: string;
  meta: Record<string, unknown>;
  location: ASTLocation;
}

// ============================================
// Parsing Results
// ============================================

export interface ParsedFile {
  filePath: string;
  language: SupportedLanguage;
  success: boolean;
  errors: ParseError[];
  functions: ExtractedFunction[];
  defcomps: ExtractedDefcomp[];
  ast?: ASTNode;
  parseTime: number;
}

export interface ParseError {
  message: string;
  location: ASTLocation;
  type: 'syntax' | 'semantic' | 'warning' | 'info';
}

export interface ParseOptions {
  includeAST?: boolean;
  extractBodies?: boolean;
  extractCalls?: boolean;
  extractDocs?: boolean;
  maxFileSize?: number;
  timeout?: number;
}

export interface ParserEvents {
  onGrammarLoaded?: (language: SupportedLanguage) => void;
  onParseStart?: (filePath: string) => void;
  onParseComplete?: (result: ParsedFile) => void;
  onParseError?: (filePath: string, error: Error) => void;
}
