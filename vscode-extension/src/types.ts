/**
 * Shared types and interfaces for the extension
 */

/**
 * AI Provider types
 */
export type ProviderType = 'anthropic' | 'openai';

export interface ProviderConfiguration {
  provider: ProviderType;
  apiKey?: string;
  planModel?: string;
  actModel?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ProviderInfo {
  id: ProviderType;
  name: string;
  models: string[];
  supportsStreaming: boolean;
  supportsPlanMode: boolean;
  costPerToken: {
    plan: number;
    act: number;
  };
}

/**
 * Generation context and results
 */
export interface GenerationContext {
  task: string;
  codeContext?: string;
  schemaContext?: SchemaInfo;
  examples?: string[];
  tags?: string[];
  category?: string;
}

export interface GenerationPlan {
  steps: string[];
  requirements: string[];
  complexity: 'low' | 'medium' | 'high';
  estimatedTokens: number;
  confidence: number;
  challenges?: string[];
}

export interface GenerationResult {
  code: string;
  explanation?: string;
  tokensUsed: number;
  cost: number;
  quality?: number;
  warnings?: string[];
}

export interface CostEstimate {
  tokens: number;
  cost: number;
  model: string;
}

/**
 * SkySpark types
 */
export interface SkySparkConnection {
  id: string;
  name: string;
  host: string;
  project: string;
  username: string;
  isActive: boolean;
  lastConnected?: Date;
}

export interface SchemaInfo {
  projectId: string;
  version: string;
  tags: TagDefinition[];
  connectorTags?: Record<string, string>;
  namingPatterns?: Record<string, string>;
}

export interface TagDefinition {
  name: string;
  kind: string;
  doc?: string;
  is?: string[];
}

/**
 * MCP Server types
 */
export interface McpServerStatus {
  isRunning: boolean;
  pid?: number;
  uptime?: number;
  lastHealthCheck?: Date;
  version?: string;
}

export interface McpRequest {
  id: number;
  method: string;
  params?: any;
  timestamp: Date;
}

export interface McpResponse {
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * Extension state types
 */
export interface ExtensionState {
  // Connection state
  connections: SkySparkConnection[];
  activeConnectionId?: string;
  
  // AI provider state
  activeProvider: ProviderType;
  providerConfig: ProviderConfiguration;
  
  // Session state
  currentSession?: GenerationSession;
  sessionHistory: SessionMetadata[];
  
  // MCP state
  mcpServerStatus: McpServerStatus;
  
  // Cache state
  cacheStats: CacheStatistics;
  
  // UI state
  isGenerating: boolean;
  progress?: ProgressInfo;
}

export interface GenerationSession {
  id: string;
  startTime: Date;
  task: string;
  context: GenerationContext;
  plan?: GenerationPlan;
  results: GenerationResult[];
  status: 'planning' | 'generating' | 'testing' | 'completed' | 'failed';
  iterations: number;
}

export interface SessionMetadata {
  id: string;
  startTime: Date;
  endTime?: Date;
  task: string;
  status: string;
  tokensUsed: number;
  cost: number;
}

export interface CacheStatistics {
  hits: number;
  misses: number;
  size: number;
  hitRate?: number;
  costSavings?: number;
}

export interface ProgressInfo {
  message: string;
  percentage: number;
  cancellable: boolean;
}

/**
 * Command result types
 */
export interface CommandResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Validation types
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
  line?: number;
  column?: number;
}

export interface ValidationWarning {
  code: string;
  message: string;
  line?: number;
  column?: number;
}
