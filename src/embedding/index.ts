/**
 * Embedding Module - Vector search and semantic analysis
 */

// Embedding Service
export {
  EmbeddingService,
  getEmbeddingService,
  getDocsEmbeddingService,
  resetEmbeddingService,
  DEFAULT_MODEL,
  DEFAULT_DIMENSIONS,
  DEFAULT_DOCS_MODEL,
  DEFAULT_DOCS_DIMENSIONS,
} from './embeddingService.js';

// Model Manager
export {
  MODELS_DIR,
  KNOWN_MODELS,
  getModelStatus,
  getAllModelStatuses,
  downloadModel,
  type KnownModel,
  type ModelStatus,
  type ProgressCallback,
} from './modelManager.js';

// LanceDB Connection
export {
  getLanceConnection,
  getLanceTable,
  getDocsLanceTable,
  getLanceTableStats,
  closeLanceConnection,
  resetLanceTable,
  CODE_TABLE_NAME,
  DOCS_TABLE_NAME,
} from './lanceConnection.js';

// Vector Store
export {
  VectorStore,
  getVectorStore,
  resetVectorStore,
  type VectorSearchResult,
  type VectorSearchOptions,
} from './vectorStore.js';

// Docs Vector Store
export {
  DocsVectorStore,
  getDocsVectorStore,
  type DocsVectorSearchResult,
  type DocsVectorSearchOptions,
} from './docsVectorStore.js';

// Docs Embedding Pipeline
export {
  DocsEmbeddingPipeline,
  getDocsEmbeddingPipeline,
  type DocToEmbed,
  type EmbeddingPipelineResult,
} from './docsEmbeddingPipeline.js';

// Semantic Search Service
export {
  SemanticSearchService,
  getSemanticSearchService,
  resetSemanticSearchService,
  type SemanticSearchResult,
  type SemanticSearchOptions,
} from './semanticSearchService.js';
