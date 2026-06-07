/**
 * Language Registry - Axon Only
 *
 * Manages the tree-sitter Axon grammar with lazy loading.
 */

import { Parser, Language } from 'web-tree-sitter';
import type {
  SupportedLanguage,
  LanguageConfig,
  NodeTypeMappings
} from './types.js';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ============================================
// Axon Node Type Mappings
// ============================================

const axonMappings: NodeTypeMappings = {
  functionTypes: ['lambda', 'trailing_lambda_call'],
  classTypes: ['defcomp'],
  interfaceTypes: [],
  variableTypes: ['define_var'],
  importTypes: [],
  exportTypes: [],
  commentTypes: ['line_comment', 'block_comment'],
  callTypes: ['call_expr', 'dot_call', 'trap_call'],
  nameField: 'name',
  parametersField: 'params',
  bodyField: 'body'
};

// ============================================
// Language Registry Class
// ============================================

export class LanguageRegistry {
  private config: LanguageConfig;
  private parser: Parser | null = null;
  private initialized = false;
  private grammarsPath: string;

  constructor(grammarsPath?: string) {
    const currentDir = dirname(fileURLToPath(import.meta.url));

    if (grammarsPath) {
      this.grammarsPath = grammarsPath;
    } else {
      let grammarDir = resolve(currentDir, 'grammars');
      if (!existsSync(grammarDir)) {
        const projectRoot = resolve(currentDir, '..', '..', '..');
        grammarDir = resolve(projectRoot, 'src', 'parser', 'treeSitter', 'grammars');
      }
      this.grammarsPath = grammarDir;
    }

    this.config = {
      id: 'axon',
      name: 'Axon',
      extensions: ['axon'],
      wasmPath: resolve(this.grammarsPath, 'tree-sitter-axon.wasm'),
      loaded: false,
      nodeMappings: axonMappings
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await Parser.init();
      this.parser = new Parser();
      this.initialized = true;

      if (this.isGrammarAvailable()) {
        console.error('[tree-sitter] Axon grammar available');
      } else {
        console.error('[tree-sitter] WARNING: Axon grammar not found at', this.config.wasmPath);
      }
    } catch (error) {
      console.error(`[tree-sitter] Failed to initialize: ${error}`);
      throw error;
    }
  }

  async loadLanguage(): Promise<boolean> {
    if (this.config.loaded && this.config.language) {
      return true;
    }

    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.config.wasmPath || !existsSync(this.config.wasmPath)) {
      console.error(`[tree-sitter] Grammar not found: ${this.config.wasmPath}`);
      return false;
    }

    try {
      const language = await Language.load(this.config.wasmPath);
      this.config.language = language;
      this.config.loaded = true;
      console.error('[tree-sitter] Loaded Axon grammar');
      return true;
    } catch (error) {
      console.error(`[tree-sitter] Failed to load Axon grammar: ${error}`);
      return false;
    }
  }

  getLanguage(): LanguageConfig {
    return this.config;
  }

  getParser(): Parser | null {
    return this.parser;
  }

  isGrammarAvailable(): boolean {
    if (!this.config.wasmPath) return false;
    return existsSync(this.config.wasmPath);
  }

  getMappings(): NodeTypeMappings {
    return this.config.nodeMappings;
  }

  getGrammarsPath(): string {
    return this.grammarsPath;
  }
}

// ============================================
// Singleton Instance
// ============================================

let registryInstance: LanguageRegistry | null = null;

export function getLanguageRegistry(grammarsPath?: string): LanguageRegistry {
  if (!registryInstance) {
    registryInstance = new LanguageRegistry(grammarsPath);
  }
  return registryInstance;
}

export function resetLanguageRegistry(): void {
  registryInstance = null;
}
