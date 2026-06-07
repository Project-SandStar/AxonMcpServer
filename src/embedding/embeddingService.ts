/**
 * Embedding Service - Local embeddings using @huggingface/transformers
 *
 * Runs entirely locally with no external API calls.
 * Default model: all-MiniLM-L6-v2 (384 dimensions)
 */

type Pipeline = (texts: string[], options?: { pooling: string; normalize: boolean }) => Promise<{ data: Float32Array }>;

// ============================================
// Constants
// ============================================

export const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2';
export const DEFAULT_DIMENSIONS = 384;
export const DEFAULT_DOCS_MODEL = 'Xenova/jina-embeddings-v2-base-en';
export const DEFAULT_DOCS_DIMENSIONS = 768;

const MAX_TOKENS = 256;
const ESTIMATED_CHARS_PER_TOKEN = 4;
const MAX_CHARS = MAX_TOKENS * ESTIMATED_CHARS_PER_TOKEN;

// ============================================
// Embedding Service Class
// ============================================

export class EmbeddingService {
  private pipeline: Pipeline | null = null;
  private modelName: string;
  private dimensions: number;
  private threads: number;
  private batchSize: number;
  private initPromise: Promise<void> | null = null;

  constructor(modelName: string = DEFAULT_MODEL, dimensions: number = DEFAULT_DIMENSIONS, options?: { threads?: number; batchSize?: number }) {
    this.modelName = modelName;
    this.dimensions = dimensions;
    this.threads = options?.threads ?? parseInt(process.env.EMBEDDING_THREADS || '2', 10);
    this.batchSize = options?.batchSize ?? parseInt(process.env.EMBEDDING_BATCH_SIZE || '16', 10);
  }

  async initialize(): Promise<void> {
    if (this.pipeline) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInitialize();
    await this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    console.error(`[embedding] Loading model: ${this.modelName}`);

    try {
      const { pipeline, env } = await import('@huggingface/transformers');
      const { MODELS_DIR } = await import('./modelManager.js');
      env.cacheDir = MODELS_DIR;

      if (!process.env.OMP_NUM_THREADS) {
        process.env.OMP_NUM_THREADS = String(this.threads);
      }

      this.pipeline = await pipeline('feature-extraction', this.modelName, {
        dtype: 'q8',
        cache_dir: MODELS_DIR,
      } as any) as unknown as Pipeline;

      console.error(`[embedding] Model loaded successfully`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[embedding] Failed to load model: ${errMsg}`);
      throw new Error(`Embedding service initialization failed: ${errMsg}`);
    }
  }

  async embed(text: string): Promise<Float32Array> {
    await this.initialize();
    if (!this.pipeline) throw new Error('Embedding pipeline not initialized');

    const processedText = this.preprocessText(text);
    const output = await this.pipeline([processedText], { pooling: 'mean', normalize: true });
    return new Float32Array(output.data);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    await this.initialize();
    if (!this.pipeline) throw new Error('Embedding pipeline not initialized');

    const processedTexts = texts.map(t => this.preprocessText(t));
    const embeddings: Float32Array[] = [];

    for (let i = 0; i < processedTexts.length; i += this.batchSize) {
      const batch = processedTexts.slice(i, i + this.batchSize);
      const output = await this.pipeline(batch, { pooling: 'mean', normalize: true });

      for (let j = 0; j < batch.length; j++) {
        const start = j * this.dimensions;
        embeddings.push(new Float32Array(output.data.slice(start, start + this.dimensions)));
      }
    }

    return embeddings;
  }

  async embedCode(code: string, context?: {
    signature?: string;
    documentation?: string;
  }): Promise<Float32Array> {
    let text = '';
    if (context?.signature) text += context.signature + ' ';
    if (context?.documentation) {
      const firstSentence = context.documentation.split(/[.!?]/)[0];
      text += firstSentence + ' ';
    }
    text += this.truncateCode(code);
    return this.embed(text);
  }

  private preprocessText(text: string): string {
    if (!text) return '';
    let processed = text.replace(/\s+/g, ' ').trim();
    if (processed.length > MAX_CHARS) processed = processed.substring(0, MAX_CHARS);
    return processed;
  }

  private truncateCode(code: string): string {
    if (!code) return '';
    let processed = code.replace(/\/\/.*$/gm, '');
    processed = processed.replace(/\/\*[\s\S]*?\*\//g, '');
    processed = processed.replace(/\s+/g, ' ').trim();
    if (processed.length > MAX_CHARS / 2) processed = processed.substring(0, MAX_CHARS / 2);
    return processed;
  }

  cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const mag = Math.sqrt(normA) * Math.sqrt(normB);
    return mag === 0 ? 0 : dot / mag;
  }

  getModelName(): string { return this.modelName; }
  getDimensions(): number { return this.dimensions; }
  isReady(): boolean { return this.pipeline !== null; }
}

// ============================================
// Factory Functions
// ============================================

let serviceInstance: EmbeddingService | null = null;
let docsServiceInstance: EmbeddingService | null = null;

function readSemanticConfig(): Record<string, any> {
  try {
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(process.cwd(), 'config', 'axonMcpServer-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return config.semanticSearch || {};
    }
  } catch { /* ignore */ }
  return {};
}

export function getEmbeddingService(): EmbeddingService {
  if (!serviceInstance) {
    const cfg = readSemanticConfig();
    const model = process.env.EMBEDDING_MODEL || cfg.codeModel || undefined;
    const dims = process.env.EMBEDDING_DIMENSIONS ? parseInt(process.env.EMBEDDING_DIMENSIONS) : cfg.codeDimensions || undefined;
    const threads = process.env.EMBEDDING_THREADS ? parseInt(process.env.EMBEDDING_THREADS) : cfg.embeddingThreads || 2;
    const batchSize = process.env.EMBEDDING_BATCH_SIZE ? parseInt(process.env.EMBEDDING_BATCH_SIZE) : cfg.embeddingBatchSize || 16;
    serviceInstance = new EmbeddingService(model, dims, { threads, batchSize });
  }
  return serviceInstance;
}

export function getDocsEmbeddingService(): EmbeddingService {
  if (!docsServiceInstance) {
    const cfg = readSemanticConfig();
    const model = process.env.DOCS_EMBEDDING_MODEL || cfg.docsModel || DEFAULT_DOCS_MODEL;
    const dims = process.env.DOCS_EMBEDDING_DIMENSIONS ? parseInt(process.env.DOCS_EMBEDDING_DIMENSIONS) : cfg.docsDimensions || DEFAULT_DOCS_DIMENSIONS;
    const threads = process.env.EMBEDDING_THREADS ? parseInt(process.env.EMBEDDING_THREADS) : cfg.embeddingThreads || 2;
    const batchSize = process.env.EMBEDDING_BATCH_SIZE ? parseInt(process.env.EMBEDDING_BATCH_SIZE) : cfg.embeddingBatchSize || 16;
    docsServiceInstance = new EmbeddingService(model, dims, { threads, batchSize });
  }
  return docsServiceInstance;
}

export function resetEmbeddingService(): void {
  serviceInstance = null;
  docsServiceInstance = null;
}
