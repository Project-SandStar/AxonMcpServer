import { readFileSync, writeFileSync, existsSync } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export interface SkysSparkFallback {
  host: string;
  port: number;
  project: string;
  username: string;
  password: string;
  protocol: string;
}

export interface SkysSparkSettings {
  home: string;
  configDir: string;
  format: string;
  autoDiscover: boolean;
  autoSyncFunctions: boolean;
  syncConcurrency: number;
  functionVersioning: boolean;
  maxVersions: number;
  fallback: SkysSparkFallback;
}

export interface PrimaryProjectConfig {
  instance: string;
  project: string;
}

export interface ServerSettings {
  // HTTP server port (default: 3847)
  port: number;
}

export interface OAuthSettings {
  // Enable OAuth 2.1 authentication (default: true)
  enabled: boolean;
  // Issuer URL (auto-derived from server.port if not set)
  issuerUrl?: string;
  // Allowed redirect URI patterns (supports * for port wildcard)
  allowedRedirectUris: string[];
  // Access token TTL in seconds (default: 3600 = 1 hour)
  accessTokenTtl: number;
  // Refresh token TTL in seconds (default: 2592000 = 30 days)
  refreshTokenTtl: number;
  // Supported OAuth scopes
  scopesSupported: string[];
}

export interface AxonServerConfig {
  // Server settings (port, etc.)
  server?: ServerSettings;

  // OAuth 2.1 authentication settings
  oauth?: OAuthSettings;

  // Path to the Axon code library
  codePath: string;

  // Path to documentation (can be same as codePath or different)
  docsPath?: string;

  // Persistent primary project (saved between boots)
  primaryProject?: PrimaryProjectConfig;

  // SkySpark settings (merged from .env.skyspark)
  skyspark?: SkysSparkSettings;

  // File patterns to include
  filePatterns?: {
    code?: string[];      // e.g., ['*.axon', '*.trio']
    docs?: string[];      // e.g., ['*.html', '*.md']
  };

  // Directories to exclude
  excludeDirs?: string[];

  // Cache settings
  cache?: {
    enabled?: boolean;
    maxAge?: number;      // Max age in milliseconds
    directory?: string;   // Cache directory path
  };

  // Search settings
  search?: {
    minTokenLength?: number;
    maxResults?: number;
  };

  // Function usage tracking settings
  functionUsageTracking?: {
    enabled?: boolean;
    excludePatterns?: string[];
    maxContextLines?: number;
    indexBuiltinFunctions?: boolean;
    cacheTimeout?: number;
  };

  // Semantic search settings (LanceDB + embeddings)
  semanticSearch?: SemanticSearchSettings;
}

export interface SemanticSearchSettings {
  /** Enable semantic search features (default: false) */
  enabled: boolean;
  /** Code embedding model (default: 'Xenova/all-MiniLM-L6-v2') */
  codeModel: string;
  /** Code embedding dimensions (default: 384) */
  codeDimensions: number;
  /** Docs embedding model (default: 'Xenova/jina-embeddings-v2-base-en') */
  docsModel: string;
  /** Docs embedding dimensions (default: 768) */
  docsDimensions: number;
  /** Number of ONNX threads (default: 2) */
  embeddingThreads: number;
  /** Batch size for embedding generation (default: 16) */
  embeddingBatchSize: number;
  /** Weight for graph score in combined ranking (default: 0.3) */
  graphWeight: number;
  /** Minimum similarity score threshold (default: 0.5) */
  minScore: number;
}

// Default configuration
const defaultConfig: AxonServerConfig = {
  server: {
    port: 3847
  },
  oauth: {
    enabled: true,
    allowedRedirectUris: [
      'http://localhost:*',
      'http://127.0.0.1:*',
    ],
    accessTokenTtl: 3600,       // 1 hour
    refreshTokenTtl: 2592000,   // 30 days
    scopesSupported: ['mcp:read', 'mcp:write', 'mcp:admin'],
  },
  codePath: '/Users/<user>/Code/axon_library_2025/axon-library',
  docsPath: '/Users/<user>/Code/axon_library_2025/docs',
  skyspark: {
    home: '/Users/<user>/skyspark/skyspark-3.1.8',
    configDir: 'config',
    format: 'zinc',
    autoDiscover: true,
    autoSyncFunctions: true,
    syncConcurrency: 10,
    functionVersioning: true,
    maxVersions: 4,
    fallback: {
      host: 'localhost',
      port: 8080,
      project: 'demo',
      username: 'su',
      password: 'su',
      protocol: 'http'
    }
  },
  filePatterns: {
    code: ['*.axon', '*.trio'],
    docs: ['*.html', '*.md', '**/docHaxall/*.html']
  },
  excludeDirs: ['node_modules', '.git', 'dist', 'build', '.cache'],
  cache: {
    enabled: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    directory: '.cache'
  },
  search: {
    minTokenLength: 2,
    maxResults: 10
  },
  functionUsageTracking: {
    enabled: true,
    excludePatterns: ['test/**', 'backup/**'],
    maxContextLines: 5,
    indexBuiltinFunctions: true,
    cacheTimeout: 3600000 // 1 hour
  },
  semanticSearch: {
    enabled: false,
    codeModel: 'Xenova/all-MiniLM-L6-v2',
    codeDimensions: 384,
    docsModel: 'Xenova/jina-embeddings-v2-base-en',
    docsDimensions: 768,
    embeddingThreads: 2,
    embeddingBatchSize: 16,
    graphWeight: 0.3,
    minScore: 0.5
  }
};

// Config file path - resolve relative to the project root (one level up from dist/)
// This ensures the config is found even when process.cwd() is a different directory
// (e.g., when Claude Code spawns the server via stdio from another project)
function resolveProjectRoot(): string {
  // 1. Try resolving from script location (most reliable for stdio spawning)
  //    This file compiles to: dist/config/config.js
  //    So project root = two levels up from the script directory.
  //    We look for package.json as the definitive project root marker,
  //    since dist/ also contains a config/ subdirectory (compiled TS files).
  try {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    let candidate = scriptDir;
    for (let i = 0; i < 5; i++) {
      if (existsSync(path.join(candidate, 'package.json'))) {
        return candidate;
      }
      const parent = path.dirname(candidate);
      if (parent === candidate) break; // reached filesystem root
      candidate = parent;
    }
    // If no package.json found, assume project root is 2 levels up from dist/config/
    return path.resolve(scriptDir, '..', '..');
  } catch {
    // import.meta.url resolution failed, fall through
  }

  // 2. Fallback: try process.cwd() (works when running from the project directory)
  return process.cwd();
}

const PROJECT_ROOT = resolveProjectRoot();
const CONFIG_FILE = path.join(PROJECT_ROOT, 'config', 'axonMcpServer-config.json');

// Mutable config singleton
let currentConfig: AxonServerConfig = { ...defaultConfig };

function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceVal = source[key];
    const targetVal = target[key];
    if (sourceVal !== undefined) {
      if (typeof sourceVal === 'object' && sourceVal !== null && !Array.isArray(sourceVal) &&
          typeof targetVal === 'object' && targetVal !== null && !Array.isArray(targetVal)) {
        result[key] = deepMerge(targetVal, sourceVal as any);
      } else {
        result[key] = sourceVal as T[keyof T];
      }
    }
  }
  return result;
}

export function loadConfig(configPath?: string): AxonServerConfig {
  const filePath = configPath || CONFIG_FILE;

  if (existsSync(filePath)) {
    try {
      const configContent = readFileSync(filePath, 'utf-8');
      const userConfig = JSON.parse(configContent);
      currentConfig = deepMerge(defaultConfig, userConfig);
      console.error(`[Config] Loaded from ${filePath}`);
    } catch (error) {
      console.error(`[Config] Failed to load from ${filePath}, using defaults:`, error);
      currentConfig = { ...defaultConfig };
    }
  } else {
    console.error(`[Config] Config file not found at ${filePath}, using defaults`);
    currentConfig = { ...defaultConfig };
  }

  return currentConfig;
}

export function reloadConfig(): AxonServerConfig {
  console.error('[Config] Reloading configuration...');
  return loadConfig();
}

export function getConfig(): AxonServerConfig {
  return currentConfig;
}

/**
 * Save the primary project to the config file (persists between boots)
 */
export function savePrimaryProject(instance: string, project: string): void {
  try {
    currentConfig.primaryProject = { instance, project };
    writeFileSync(CONFIG_FILE, JSON.stringify(currentConfig, null, 2));
    console.error(`[Config] Saved primary project: ${instance}/${project}`);
  } catch (error) {
    console.error('[Config] Failed to save primary project:', error);
  }
}

// Export for backwards compatibility and reuse
export { defaultConfig, PROJECT_ROOT };
