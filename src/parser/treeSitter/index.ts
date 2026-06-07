/**
 * Tree-sitter Parser Module for Axon
 */

// Types
export type {
  SupportedLanguage,
  LanguageConfig,
  NodeTypeMappings,
  ASTLocation,
  ASTNode,
  ExtractedFunction,
  ExtractedParameter,
  ExtractedCall,
  ExtractedDefcomp,
  ExtractedDefcompCell,
  ParsedFile,
  ParseError,
  ParseOptions,
  ParserEvents
} from './types.js';

// Language Registry
export {
  LanguageRegistry,
  getLanguageRegistry,
  resetLanguageRegistry
} from './languageRegistry.js';

// AST Extractor
export { ASTExtractor, type ExtractionResult } from './astExtractor.js';

// Main Parser
export {
  TreeSitterParser,
  getTreeSitterParser,
  resetTreeSitterParser
} from './treeSitterParser.js';
