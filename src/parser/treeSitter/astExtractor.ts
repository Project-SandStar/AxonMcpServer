/**
 * AST Extractor for Axon
 *
 * Extracts functions, defcomps, and call relationships
 * from tree-sitter Axon syntax trees.
 */

import type { Node } from 'web-tree-sitter';
import type { LanguageRegistry } from './languageRegistry.js';
import type {
  ASTLocation,
  ExtractedFunction,
  ExtractedParameter,
  ExtractedCall,
  ExtractedDefcomp,
  ExtractedDefcompCell,
  ParseOptions
} from './types.js';

// ============================================
// Extraction Result
// ============================================

export interface ExtractionResult {
  functions: ExtractedFunction[];
  defcomps: ExtractedDefcomp[];
}

// ============================================
// AST Extractor Class
// ============================================

export class ASTExtractor {
  private registry: LanguageRegistry;

  constructor(registry: LanguageRegistry) {
    this.registry = registry;
  }

  /**
   * Extract all code structures from Axon AST
   */
  extractAll(
    rootNode: Node,
    source: string,
    options: ParseOptions,
    filePath?: string
  ): ExtractionResult {
    const mappings = this.registry.getMappings();
    const functions = this.extractFunctions(rootNode, mappings, source, options, filePath);
    const defcomps = this.extractDefcomps(rootNode, source, options, filePath);

    return { functions, defcomps };
  }

  /**
   * Extract top-level Axon functions
   * In Axon, functions are typically: name : (params) => body
   * Which tree-sitter sees as define_var with a lambda value
   */
  private extractFunctions(
    rootNode: Node,
    mappings: { variableTypes: string[]; callTypes: string[] },
    source: string,
    options: ParseOptions,
    filePath?: string
  ): ExtractedFunction[] {
    const functions: ExtractedFunction[] = [];

    // Walk top-level nodes
    for (let i = 0; i < rootNode.childCount; i++) {
      const child = rootNode.child(i);
      if (!child) continue;

      if (child.type === 'define_var') {
        // Named function: name : (params) => body
        const func = this.extractDefineVarFunction(child, source, options);
        if (func) functions.push(func);
      } else if (child.type === 'lambda') {
        // Anonymous top-level lambda: () => do ... end
        // In synced Axon files, each file IS a function (name comes from filename)
        const func = this.extractLambdaFunction(child, source, options, filePath);
        if (func) functions.push(func);
      }
    }

    return functions;
  }

  /**
   * Extract function from define_var: name : (params) => body
   */
  private extractDefineVarFunction(
    node: Node,
    source: string,
    options: ParseOptions
  ): ExtractedFunction | null {
    // Get function name
    const nameNode = node.childForFieldName('name') ||
      this.findChildByType(node, 'identifier');
    if (!nameNode) return null;

    const name = nameNode.text;

    // Get the value (should be a lambda)
    const valueNode = node.childForFieldName('value') ||
      this.findChildByType(node, 'lambda');

    let parameters: ExtractedParameter[] = [];
    let body: string | undefined;
    let calls: ExtractedCall[] = [];

    if (valueNode?.type === 'lambda') {
      // Extract params from lambda
      const paramsNode = valueNode.childForFieldName('params') ||
        this.findChildByType(valueNode, 'params') ||
        this.findChildByType(valueNode, 'param_list');
      if (paramsNode) {
        parameters = this.extractParameters(paramsNode);
      }

      // Extract body
      const bodyNode = valueNode.childForFieldName('body') ||
        this.findChildByType(valueNode, 'do_block') ||
        this.findChildByType(valueNode, 'expr');
      if (bodyNode) {
        if (options.extractBodies) {
          body = bodyNode.text;
        }
        if (options.extractCalls) {
          calls = this.extractCalls(bodyNode);
        }
      }
    }

    const doc = options.extractDocs ? this.extractDocComment(node) : undefined;

    const signature = this.buildSignature(name, parameters);

    return {
      name,
      qualifiedName: name,
      signature,
      parameters,
      documentation: doc,
      location: this.getLocation(node),
      body,
      calls,
      source: node.text
    };
  }

  /**
   * Extract function from standalone top-level lambda.
   * In synced Axon projects, each file contains a single anonymous function body
   * like `() => do ... end`. The function name comes from the filename.
   */
  private extractLambdaFunction(
    node: Node,
    source: string,
    options: ParseOptions,
    filePath?: string
  ): ExtractedFunction | null {
    // Derive name from the file path (e.g., "addEnumPoints.axon" -> "addEnumPoints")
    let name = '<anonymous>';
    if (filePath) {
      const parts = filePath.replace(/\\/g, '/').split('/');
      const fileName = parts[parts.length - 1] || '';
      name = fileName.replace(/\.axon$/i, '');
    }

    const parameters: ExtractedParameter[] = [];
    const paramsNode = node.childForFieldName('params') ||
      this.findChildByType(node, 'params') ||
      this.findChildByType(node, 'param_list');
    if (paramsNode) {
      parameters.push(...this.extractParameters(paramsNode));
    }

    let body: string | undefined;
    let calls: ExtractedCall[] = [];

    const bodyNode = node.childForFieldName('body') ||
      this.findChildByType(node, 'do_block') ||
      this.findChildByType(node, 'expr');
    if (bodyNode) {
      if (options.extractBodies) {
        body = bodyNode.text;
      }
      if (options.extractCalls) {
        calls = this.extractCalls(bodyNode);
      }
    }

    const doc = options.extractDocs ? this.extractDocComment(node) : undefined;
    const signature = this.buildSignature(name, parameters);

    return {
      name,
      qualifiedName: name,
      signature,
      parameters,
      documentation: doc,
      location: this.getLocation(node),
      body,
      calls,
      source: node.text
    };
  }

  /**
   * Extract defcomp definitions
   */
  private extractDefcomps(
    rootNode: Node,
    source: string,
    options: ParseOptions,
    filePath?: string
  ): ExtractedDefcomp[] {
    const defcomps: ExtractedDefcomp[] = [];

    this.traverseNodes(rootNode, ['defcomp'], (node) => {
      const defcomp = this.extractDefcomp(node, source, options, filePath);
      if (defcomp) defcomps.push(defcomp);
    });

    return defcomps;
  }

  /**
   * Extract a single defcomp
   */
  private extractDefcomp(
    node: Node,
    source: string,
    options: ParseOptions,
    filePath?: string
  ): ExtractedDefcomp | null {
    const nameNode = node.childForFieldName('name') ||
      this.findChildByType(node, 'identifier');

    let name: string;
    if (nameNode) {
      name = nameNode.text;
    } else if (filePath) {
      // Derive name from filename (e.g., "ahuCoolAndHeatExample.axon" -> "ahuCoolAndHeatExample")
      const parts = filePath.replace(/\\/g, '/').split('/');
      const fileName = parts[parts.length - 1] || '';
      name = fileName.replace(/\.axon$/i, '');
    } else {
      return null;
    }
    const doc = options.extractDocs ? this.extractDocComment(node) : undefined;

    // Extract cells (slots)
    const cells: ExtractedDefcompCell[] = [];
    const bodyNode = node.childForFieldName('body') ||
      this.findChildByType(node, 'defcomp_body');

    // If no explicit body node, the cells may be direct children of the defcomp
    const cellParent = bodyNode || node;
    for (let i = 0; i < cellParent.namedChildCount; i++) {
      const cellNode = cellParent.namedChild(i);
      if (!cellNode) continue;

      if (cellNode.type === 'define_var' || cellNode.type === 'defcomp_cell' || cellNode.type === 'cell_def') {
        const cellName = cellNode.childForFieldName('name') ||
          this.findChildByType(cellNode, 'identifier');
        if (cellName) {
          cells.push({
            name: cellName.text,
            location: this.getLocation(cellNode),
            meta: {}
          });
        }
      }
    }

    return {
      name,
      qualifiedName: name,
      documentation: doc,
      location: this.getLocation(node),
      cells,
      source: node.text
    };
  }

  /**
   * Extract function calls from a body node
   */
  private extractCalls(bodyNode: Node): ExtractedCall[] {
    const calls: ExtractedCall[] = [];
    const callTypes = ['call_expr', 'dot_call', 'trap_call'];

    this.traverseNodes(bodyNode, callTypes, (node) => {
      const call = this.extractCallInfo(node);
      if (call) calls.push(call);
    });

    return calls;
  }

  /**
   * Extract info from a single call node
   */
  private extractCallInfo(node: Node): ExtractedCall | null {
    let name: string | undefined;
    let target: string | undefined;

    if (node.type === 'dot_call') {
      // obj.method() or obj.method
      const objectNode = node.namedChild(0);
      const methodNode = node.namedChild(1);
      target = objectNode?.text;
      name = methodNode?.text;
    } else if (node.type === 'call_expr') {
      // funcName(args)
      const funcNode = node.childForFieldName('function') ||
        node.namedChild(0);
      if (funcNode?.type === 'identifier') {
        name = funcNode.text;
      } else {
        name = funcNode?.text;
      }
    } else if (node.type === 'trap_call') {
      // obj->method
      const objectNode = node.namedChild(0);
      const methodNode = node.namedChild(1);
      target = objectNode?.text;
      name = methodNode?.text;
    }

    if (!name) return null;

    return {
      name,
      expression: node.text,
      target,
      location: this.getLocation(node)
    };
  }

  /**
   * Extract parameters from a param list
   */
  private extractParameters(paramsNode: Node): ExtractedParameter[] {
    const params: ExtractedParameter[] = [];

    for (let i = 0; i < paramsNode.namedChildCount; i++) {
      const paramNode = paramsNode.namedChild(i);
      if (!paramNode) continue;

      if (paramNode.type === ',' || paramNode.type === '(' || paramNode.type === ')') {
        continue;
      }

      let name: string | undefined;
      let defaultValue: string | undefined;

      const nameNode = paramNode.childForFieldName('name') ||
        this.findChildByType(paramNode, 'identifier');
      if (nameNode) {
        name = nameNode.text;
      } else if (paramNode.type === 'identifier') {
        name = paramNode.text;
      }

      if (!name) continue;

      const valueNode = paramNode.childForFieldName('value') ||
        this.findChildByType(paramNode, 'default_value');
      if (valueNode) {
        defaultValue = valueNode.text.replace(/^=\s*/, '');
      }

      params.push({
        name,
        isOptional: !!defaultValue,
        defaultValue
      });
    }

    return params;
  }

  /**
   * Extract doc comment preceding a node
   */
  private extractDocComment(node: Node): string | undefined {
    let prev = node.previousSibling;

    while (prev) {
      if (prev.type === 'line_comment' || prev.type === 'block_comment') {
        const text = prev.text;
        if (text.startsWith('/**') || text.startsWith('//')) {
          return this.cleanDocComment(text);
        }
      }
      if (prev.type !== 'line_comment' && prev.type !== 'block_comment') {
        break;
      }
      prev = prev.previousSibling;
    }

    return undefined;
  }

  private cleanDocComment(text: string): string {
    return text
      .replace(/^\/\*\*?\s*/m, '')
      .replace(/\s*\*\/$/m, '')
      .replace(/^\s*\*\s?/gm, '')
      .replace(/^\/\/\s*/gm, '')
      .trim();
  }

  /**
   * Build function signature
   */
  private buildSignature(name: string, params: ExtractedParameter[]): string {
    const paramsStr = params.map(p => {
      let str = p.name;
      if (p.defaultValue) str += ` = ${p.defaultValue}`;
      return str;
    }).join(', ');

    return `${name}(${paramsStr})`;
  }

  /**
   * Traverse nodes matching types
   */
  private traverseNodes(
    node: Node,
    types: string[],
    callback: (node: Node) => void
  ): void {
    if (types.includes(node.type)) {
      callback(node);
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.traverseNodes(child, types, callback);
      }
    }
  }

  /**
   * Find first child by type
   */
  private findChildByType(node: Node, type: string): Node | undefined {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child?.type === type) return child;
    }
    return undefined;
  }

  /**
   * Get location from node
   */
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
}
