/**
 * Tree-sitter Parser for Axon
 *
 * Main parser wrapper that uses tree-sitter to parse Axon source code
 * into structured AST representations.
 */

import { Parser, Tree, Node } from 'web-tree-sitter';
import { LanguageRegistry, getLanguageRegistry } from './languageRegistry.js';
import type {
  ASTNode,
  ASTLocation,
  ParsedFile,
  ParseOptions,
  ParseError,
  ParserEvents
} from './types.js';
import { ASTExtractor } from './astExtractor.js';

const DEFAULT_OPTIONS: ParseOptions = {
  includeAST: false,
  extractBodies: true,
  extractCalls: true,
  extractDocs: true,
  maxFileSize: 1024 * 1024,
  timeout: 30000
};

// ============================================
// Tree-sitter Parser Class
// ============================================

export class TreeSitterParser {
  private registry: LanguageRegistry;
  private extractor: ASTExtractor;
  private events: ParserEvents;

  constructor(registry?: LanguageRegistry, events: ParserEvents = {}) {
    this.registry = registry || getLanguageRegistry();
    this.extractor = new ASTExtractor(this.registry);
    this.events = events;
  }

  async initialize(): Promise<void> {
    await this.registry.initialize();
    console.error('[tree-sitter] TreeSitterParser initialized');
  }

  /**
   * Parse an Axon source file
   */
  async parseFile(
    filePath: string,
    source: string,
    options: ParseOptions = {}
  ): Promise<ParsedFile> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();

    this.events.onParseStart?.(filePath);

    // Check file size
    if (source.length > (opts.maxFileSize || DEFAULT_OPTIONS.maxFileSize!)) {
      return this.createErrorResult(
        filePath,
        `File too large: ${source.length} bytes`,
        startTime
      );
    }

    // Load Axon grammar
    const loaded = await this.registry.loadLanguage();
    if (!loaded) {
      return this.createErrorResult(
        filePath,
        'Axon grammar not available',
        startTime
      );
    }

    try {
      const result = await this.parseWithTimeout(
        source,
        opts.timeout || DEFAULT_OPTIONS.timeout!
      );

      if (!result) {
        return this.createErrorResult(filePath, 'Parse timeout exceeded', startTime);
      }

      const { tree } = result;

      // Convert to AST if requested
      const ast = opts.includeAST
        ? this.convertToASTNode(tree.rootNode)
        : undefined;

      // Extract errors
      const errors = this.extractErrors(tree.rootNode);

      // Extract code structures (pass filePath so lambdas can derive names from filename)
      const extracted = this.extractor.extractAll(tree.rootNode, source, opts, filePath);

      const parsedFile: ParsedFile = {
        filePath,
        language: 'axon',
        success: errors.filter(e => e.type === 'syntax').length === 0,
        errors,
        functions: extracted.functions,
        defcomps: extracted.defcomps,
        ast,
        parseTime: Date.now() - startTime
      };

      tree.delete();
      this.events.onParseComplete?.(parsedFile);

      return parsedFile;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[tree-sitter] Parse error for ${filePath}: ${errorMessage}`);
      this.events.onParseError?.(filePath, error as Error);
      return this.createErrorResult(filePath, errorMessage, startTime);
    }
  }

  /**
   * Parse multiple files
   */
  async parseFiles(
    files: Array<{ path: string; source: string }>,
    options: ParseOptions = {}
  ): Promise<ParsedFile[]> {
    const results: ParsedFile[] = [];
    for (const file of files) {
      const result = await this.parseFile(file.path, file.source, options);
      results.push(result);
    }
    return results;
  }

  /**
   * Parse source string directly
   */
  async parseSource(
    source: string,
    options: ParseOptions = {}
  ): Promise<ParsedFile> {
    return this.parseFile('<source>.axon', source, options);
  }

  /**
   * Get raw tree-sitter tree
   */
  async getRawTree(source: string): Promise<Tree | null> {
    const loaded = await this.registry.loadLanguage();
    if (!loaded) return null;

    const parser = this.registry.getParser();
    if (!parser) return null;

    const config = this.registry.getLanguage();
    if (!config.language) return null;

    parser.setLanguage(config.language);
    return parser.parse(source);
  }

  private async parseWithTimeout(
    source: string,
    timeoutMs: number
  ): Promise<{ tree: Tree; parser: Parser } | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        console.error('[tree-sitter] Parse timeout');
        resolve(null);
      }, timeoutMs);

      try {
        const parser = this.registry.getParser();
        if (!parser) {
          clearTimeout(timer);
          resolve(null);
          return;
        }

        const config = this.registry.getLanguage();
        if (!config.language) {
          clearTimeout(timer);
          resolve(null);
          return;
        }

        parser.setLanguage(config.language);
        const tree = parser.parse(source);

        clearTimeout(timer);
        if (!tree) {
          resolve(null);
          return;
        }
        resolve({ tree, parser });
      } catch (error) {
        clearTimeout(timer);
        throw error;
      }
    });
  }

  private convertToASTNode(node: Node, parent?: ASTNode): ASTNode {
    const astNode: ASTNode = {
      type: node.type,
      text: node.text,
      location: this.getLocation(node),
      children: [],
      parent,
      fields: {}
    };

    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child) {
        astNode.children.push(this.convertToASTNode(child, astNode));
      }
    }

    return astNode;
  }

  private extractErrors(rootNode: Node, maxErrors: number = 20): ParseError[] {
    const errors: ParseError[] = [];
    const seenLocations = new Set<string>();

    const traverse = (node: Node) => {
      if (errors.length >= maxErrors) return;

      if (node.type === 'ERROR' || node.isMissing) {
        const locKey = `${node.startPosition.row}:${node.startPosition.column}`;
        if (!seenLocations.has(locKey)) {
          seenLocations.add(locKey);
          const preview = node.text.substring(0, 30).replace(/\n/g, ' ');
          errors.push({
            message: node.isMissing
              ? `Missing: expected ${node.type}`
              : `Syntax error: unexpected token "${preview}"`,
            location: this.getLocation(node),
            type: 'syntax'
          });
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) traverse(child);
      }
    };

    traverse(rootNode);
    return errors;
  }

  private getLocation(node: Node): ASTLocation {
    return {
      startLine: node.startPosition.row + 1,
      startColumn: node.startPosition.column,
      endLine: node.endPosition.row + 1,
      endColumn: node.endPosition.column,
      startIndex: node.startIndex,
      endIndex: node.endIndex
    };
  }

  private createErrorResult(
    filePath: string,
    message: string,
    startTime: number
  ): ParsedFile {
    return {
      filePath,
      language: 'axon',
      success: false,
      errors: [{
        message,
        location: { startLine: 1, startColumn: 0, endLine: 1, endColumn: 0, startIndex: 0, endIndex: 0 },
        type: 'syntax'
      }],
      functions: [],
      defcomps: [],
      parseTime: Date.now() - startTime
    };
  }

  isGrammarAvailable(): boolean {
    return this.registry.isGrammarAvailable();
  }
}

// ============================================
// Factory Function
// ============================================

let parserInstance: TreeSitterParser | null = null;

export async function getTreeSitterParser(
  events?: ParserEvents
): Promise<TreeSitterParser> {
  if (!parserInstance) {
    parserInstance = new TreeSitterParser(undefined, events);
    await parserInstance.initialize();
  }
  return parserInstance;
}

export function resetTreeSitterParser(): void {
  parserInstance = null;
}
