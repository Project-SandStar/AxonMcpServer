/**
 * Docs Embedding Pipeline - Batch embed documentation with incremental support
 */

import { getDocsEmbeddingService } from './embeddingService.js';
import { DocsVectorStore, getDocsVectorStore } from './docsVectorStore.js';

export interface DocToEmbed {
  id: string;
  title: string;
  library: string;
  fullText: string;
}

export interface EmbeddingPipelineResult {
  total: number;
  embedded: number;
  skipped: number;
  errors: number;
  durationMs: number;
}

export class DocsEmbeddingPipeline {
  private vectorStore: DocsVectorStore;

  constructor(vectorStore?: DocsVectorStore) {
    this.vectorStore = vectorStore || getDocsVectorStore();
  }

  async embedDocs(docs: DocToEmbed[]): Promise<EmbeddingPipelineResult> {
    const startTime = Date.now();
    const embeddingService = getDocsEmbeddingService();
    let embedded = 0;
    let errors = 0;

    const batchSize = 16;
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = docs.slice(i, i + batchSize);

      try {
        const texts = batch.map(doc => {
          let text = doc.title;
          if (doc.fullText) text += ' ' + doc.fullText;
          return text;
        });

        const embeddings = await embeddingService.embedBatch(texts);

        const items = batch.map((doc, j) => ({
          docId: doc.id,
          embedding: embeddings[j],
          library: doc.library,
          title: doc.title,
        }));

        await this.vectorStore.storeEmbeddings(items);
        embedded += batch.length;

        if ((i + batchSize) % 100 === 0 || i + batchSize >= docs.length) {
          console.error(`[docs-embedding] Progress: ${Math.min(i + batchSize, docs.length)}/${docs.length}`);
        }
      } catch (error) {
        console.error(`[docs-embedding] Batch error: ${error}`);
        errors += batch.length;
      }
    }

    return {
      total: docs.length,
      embedded,
      skipped: 0,
      errors,
      durationMs: Date.now() - startTime,
    };
  }
}

let pipelineInstance: DocsEmbeddingPipeline | null = null;

export function getDocsEmbeddingPipeline(): DocsEmbeddingPipeline {
  if (!pipelineInstance) pipelineInstance = new DocsEmbeddingPipeline();
  return pipelineInstance;
}
