# SkySpark Axon VSCode Extension - Implementation Plan

## Executive Summary

This document outlines the comprehensive implementation plan for building a professional-grade VSCode extension for SkySpark Axon development. The extension will provide AI-powered code generation, intelligent language support, and deep SkySpark integration, leveraging patterns from Cline's architecture for robust state management and AI provider abstraction.

---

## Architecture Overview

### Core Principles

1. **Cline-Inspired State Management**: Centralized StateManager with observable patterns for reactive UI updates
2. **Provider Abstraction**: Flexible AI provider system supporting multiple models (Anthropic, OpenAI, etc.)
3. **Four-Level Caching**: Aggressive caching to minimize AI API costs
4. **MCP Integration**: Embedded axon-mcp-server for project intelligence
5. **Plan/Act Mode**: Two-phase AI generation for better code quality

### Technology Stack

```
Core Extension:
├── TypeScript 5.x (strict mode)
├── VSCode Extension API 1.84+
├── Node.js 18+
└── Webpack 5

Language Support:
├── VSCode Language Server Protocol
├── TextMate Grammar
└── Tree-sitter (future enhancement)

UI Layer:
├── React 18
├── VSCode Webview UI Toolkit
├── Zustand (state management)
└── Material-UI (optional)

AI Integration:
├── Anthropic SDK (Claude)
├── OpenAI SDK (GPT models)
└── Custom provider abstraction

MCP Integration:
├── JSON-RPC over stdio
├── Child process management
└── Message queue system

Caching:
├── LRU Cache (in-memory)
├── File system cache
├── SQLite (global cache)
└── Custom serialization

Testing:
├── Jest
├── VSCode Extension Tester
├── React Testing Library
└── GitHub Actions CI/CD
```

---

## Project Structure

```
axon-vscode-extension/
├── src/
│   ├── core/                          # Core extension logic
│   │   ├── StateManager.ts            # Central state management (Cline pattern)
│   │   ├── ApiHandler.ts              # Abstract AI provider interface
│   │   ├── ProviderManager.ts         # Manages AI provider instances
│   │   ├── ConfigManager.ts           # Extension configuration
│   │   └── SessionManager.ts          # Session lifecycle management
│   │
│   ├── providers/                     # AI provider implementations
│   │   ├── base/
│   │   │   └── BaseProvider.ts        # Abstract base class
│   │   ├── anthropic/
│   │   │   ├── AnthropicProvider.ts
│   │   │   └── claudeModels.ts
│   │   ├── openai/
│   │   │   ├── OpenAIProvider.ts
│   │   │   └── gptModels.ts
│   │   └── types.ts                   # Shared types
│   │
│   ├── mcp/                           # MCP server integration
│   │   ├── McpServerManager.ts        # Process lifecycle
│   │   ├── McpClient.ts               # JSON-RPC client
│   │   ├── MessageQueue.ts            # Request queuing
│   │   └── protocol.ts                # Protocol types
│   │
│   ├── cache/                         # Four-level caching system
│   │   ├── CacheManager.ts            # Main cache orchestrator
│   │   ├── levels/
│   │   │   ├── MemoryCache.ts         # L1: In-memory LRU
│   │   │   ├── SessionCache.ts        # L2: Session storage
│   │   │   ├── WorkspaceCache.ts      # L3: Workspace file cache
│   │   │   └── GlobalCache.ts         # L4: SQLite global cache
│   │   ├── CacheKey.ts                # Key generation strategy
│   │   └── statistics.ts              # Cache metrics
│   │
│   ├── language/                      # Language support features
│   │   ├── AxonLanguageClient.ts      # LSP client
│   │   ├── providers/
│   │   │   ├── CompletionProvider.ts
│   │   │   ├── HoverProvider.ts
│   │   │   ├── DefinitionProvider.ts
│   │   │   ├── CodeActionProvider.ts
│   │   │   └── CodeLensProvider.ts
│   │   ├── grammar/
│   │   │   └── axon.tmLanguage.json   # TextMate grammar
│   │   └── diagnostics/
│   │       └── AxonDiagnostics.ts
│   │
│   ├── commands/                      # Extension commands
│   │   ├── generation/
│   │   │   ├── generateFunction.ts
│   │   │   ├── optimizeQuery.ts
│   │   │   └── explainCode.ts
│   │   ├── refactor/
│   │   │   ├── extractFunction.ts
│   │   │   └── renameSymbol.ts
│   │   └── navigation/
│   │       └── goToDefinition.ts
│   │
│   ├── webview/                       # React webview applications
│   │   ├── project-manager/
│   │   │   ├── App.tsx
│   │   │   ├── components/
│   │   │   │   ├── ProjectTree.tsx
│   │   │   │   ├── SchemaViewer.tsx
│   │   │   │   ├── ConnectionManager.tsx
│   │   │   │   └── QueryRunner.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useVscodeApi.ts
│   │   │   │   └── useSchemaData.ts
│   │   │   └── store/
│   │   │       └── projectStore.ts
│   │   │
│   │   └── session-viewer/            # Session timeline UI
│   │       ├── App.tsx
│   │       └── components/
│   │
│   ├── generation/                    # AI code generation
│   │   ├── GenerationEngine.ts        # Main orchestrator
│   │   ├── PlanMode.ts                # Planning phase
│   │   ├── ActMode.ts                 # Execution phase
│   │   ├── ContextCollector.ts        # Context gathering
│   │   ├── templates/                 # Prompt templates
│   │   │   ├── functionGeneration.ts
│   │   │   ├── queryOptimization.ts
│   │   │   └── explanation.ts
│   │   └── validation/
│   │       └── GeneratedCodeValidator.ts
│   │
│   ├── integration/                   # SkySpark integration
│   │   ├── SkySparkClient.ts          # REST API client
│   │   ├── QueryExecutor.ts           # Query execution
│   │   ├── SchemaManager.ts           # Schema caching
│   │   └── types/
│   │       └── skysparkTypes.ts
│   │
│   ├── ui/                            # UI components
│   │   ├── StatusBarManager.ts        # Status bar items
│   │   ├── ProgressManager.ts         # Progress indicators
│   │   ├── NotificationManager.ts     # User notifications
│   │   └── DiffViewManager.ts         # Code diff viewer
│   │
│   ├── utils/                         # Utility functions
│   │   ├── logger.ts
│   │   ├── telemetry.ts
│   │   ├── errorHandler.ts
│   │   └── tokenCounter.ts
│   │
│   └── extension.ts                   # Extension entry point
│
├── tests/                             # Test suite
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
│
├── docs/                              # Documentation
│   ├── architecture.md
│   ├── getting-started.md
│   ├── api-reference.md
│   └── contributing.md
│
├── marketplace/                       # Marketplace assets
│   ├── README.md
│   ├── CHANGELOG.md
│   ├── icon.png
│   └── screenshots/
│
├── .vscode/                           # VSCode config
│   ├── launch.json
│   ├── tasks.json
│   └── settings.json
│
├── package.json                       # Extension manifest
├── tsconfig.json                      # TypeScript config
├── webpack.config.js                  # Build configuration
└── .github/
    └── workflows/
        ├── ci.yml
        └── release.yml
```

---

## Implementation Phases

### Phase 1: Project Setup and Core Extension Infrastructure
**Duration**: 1 week  
**Priority**: Critical

#### Objectives
- Initialize VSCode extension project with TypeScript
- Establish core architecture patterns inspired by Cline
- Set up development environment and tooling

#### Key Tasks

**1.1 Project Initialization**
```bash
# Use Yeoman generator for VSCode extension
npm install -g yo generator-code
yo code

# Select TypeScript template
# Extension name: axon-vscode
# Identifier: axon-vscode
# Description: AI-powered SkySpark Axon development
```

**1.2 TypeScript Configuration**
```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "sourceMap": true,
    "outDir": "out",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "paths": {
      "@core/*": ["src/core/*"],
      "@providers/*": ["src/providers/*"],
      "@mcp/*": ["src/mcp/*"],
      "@cache/*": ["src/cache/*"],
      "@language/*": ["src/language/*"],
      "@utils/*": ["src/utils/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "out", "tests"]
}
```

**1.3 StateManager Implementation (Cline Pattern)**
```typescript
// src/core/StateManager.ts
import { EventEmitter } from 'events';
import * as vscode from 'vscode';

export interface ExtensionState {
  // Connection state
  connections: SkySparkConnection[];
  activeConnection?: string;
  
  // AI provider state
  activeProvider: ProviderType;
  providerConfig: ProviderConfiguration;
  
  // Session state
  currentSession?: GenerationSession;
  sessionHistory: SessionMetadata[];
  
  // Cache state
  cacheStats: CacheStatistics;
  
  // UI state
  isGenerating: boolean;
  progress?: ProgressInfo;
}

export class StateManager extends EventEmitter {
  private state: ExtensionState;
  private context: vscode.ExtensionContext;
  private persistenceTimeout?: NodeJS.Timeout;
  private readonly PERSISTENCE_DELAY_MS = 500;

  constructor(context: vscode.ExtensionContext) {
    super();
    this.context = context;
    this.state = this.loadState();
  }

  // State getters with type safety
  getState(): Readonly<ExtensionState> {
    return { ...this.state };
  }

  // Partial state updates with change notification
  updateState(updates: Partial<ExtensionState>): void {
    const oldState = { ...this.state };
    Object.assign(this.state, updates);
    
    this.emit('stateChange', this.state, oldState);
    this.schedulePersistence();
  }

  // Debounced persistence
  private schedulePersistence(): void {
    if (this.persistenceTimeout) {
      clearTimeout(this.persistenceTimeout);
    }
    
    this.persistenceTimeout = setTimeout(() => {
      this.persistState();
    }, this.PERSISTENCE_DELAY_MS);
  }

  // Save state to workspace storage
  private async persistState(): Promise<void> {
    try {
      await this.context.workspaceState.update('extensionState', this.state);
      this.emit('statePersisted');
    } catch (error) {
      this.emit('persistenceError', error);
    }
  }

  // Load state from workspace storage
  private loadState(): ExtensionState {
    const saved = this.context.workspaceState.get<ExtensionState>('extensionState');
    return saved || this.getDefaultState();
  }

  private getDefaultState(): ExtensionState {
    return {
      connections: [],
      activeProvider: 'anthropic',
      providerConfig: {},
      sessionHistory: [],
      cacheStats: { hits: 0, misses: 0, size: 0 },
      isGenerating: false
    };
  }

  dispose(): void {
    if (this.persistenceTimeout) {
      clearTimeout(this.persistenceTimeout);
    }
    this.persistState();
    this.removeAllListeners();
  }
}
```

**1.4 Base ApiHandler Abstract Class**
```typescript
// src/core/ApiHandler.ts
export interface GenerationContext {
  task: string;
  codeContext?: string;
  schemaContext?: SchemaInfo;
  examples?: string[];
}

export interface GenerationPlan {
  steps: string[];
  estimatedTokens: number;
  confidence: number;
}

export interface GenerationResult {
  code: string;
  explanation?: string;
  tokensUsed: number;
  cost: number;
}

export abstract class ApiHandler {
  protected config: ProviderConfiguration;
  
  constructor(config: ProviderConfiguration) {
    this.config = config;
  }

  // Plan mode: Analyze task and create execution plan
  abstract planMode(context: GenerationContext): Promise<GenerationPlan>;
  
  // Act mode: Execute plan and generate code
  abstract actMode(plan: GenerationPlan, context: GenerationContext): Promise<GenerationResult>;
  
  // Streaming for real-time UI updates
  abstract stream(prompt: string): AsyncIterableIterator<string>;
  
  // Token counting and cost estimation
  abstract estimateCost(prompt: string): Promise<CostEstimate>;
  
  // Provider metadata
  abstract getProviderInfo(): ProviderInfo;
}
```

**1.5 Extension Activation**
```typescript
// src/extension.ts
import * as vscode from 'vscode';
import { StateManager } from './core/StateManager';
import { ProviderManager } from './core/ProviderManager';
import { McpServerManager } from './mcp/McpServerManager';
import { CacheManager } from './cache/CacheManager';
import { registerCommands } from './commands';
import { registerLanguageFeatures } from './language';

export async function activate(context: vscode.ExtensionContext) {
  console.log('Axon VSCode extension activating...');

  // Initialize core services
  const stateManager = new StateManager(context);
  const cacheManager = new CacheManager(context);
  const providerManager = new ProviderManager(stateManager);
  const mcpServer = new McpServerManager(context);

  // Store in context for access from commands
  context.subscriptions.push(
    { dispose: () => stateManager.dispose() },
    { dispose: () => cacheManager.dispose() },
    { dispose: () => providerManager.dispose() },
    { dispose: () => mcpServer.dispose() }
  );

  // Start MCP server
  try {
    await mcpServer.start();
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to start MCP server: ${error}`);
  }

  // Register commands
  registerCommands(context, {
    stateManager,
    cacheManager,
    providerManager,
    mcpServer
  });

  // Register language features
  registerLanguageFeatures(context, mcpServer);

  console.log('Axon VSCode extension activated successfully');
}

export function deactivate() {
  console.log('Axon VSCode extension deactivating...');
}
```

#### Testing Strategy
- Unit tests for StateManager state transitions
- Mock VSCode API for testing
- Integration tests for extension activation
- Memory leak tests for dispose patterns

#### Success Criteria
- [ ] Extension activates without errors
- [ ] StateManager persists state across reloads
- [ ] Base architecture supports future features
- [ ] All tests passing

---

### Phase 2: MCP Server Integration
**Duration**: 1 week  
**Priority**: Critical

#### Objectives
- Embed axon-mcp-server as child process
- Establish reliable JSON-RPC communication
- Implement health monitoring and auto-restart

#### Key Tasks

**2.1 McpServerManager Implementation**
```typescript
// src/mcp/McpServerManager.ts
import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { McpClient } from './McpClient';
import { MessageQueue } from './MessageQueue';

export class McpServerManager {
  private process: ChildProcess | null = null;
  private client: McpClient;
  private messageQueue: MessageQueue;
  private isStarting = false;
  private restartAttempts = 0;
  private readonly MAX_RESTART_ATTEMPTS = 3;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(private context: vscode.ExtensionContext) {
    this.client = new McpClient();
    this.messageQueue = new MessageQueue();
  }

  async start(): Promise<void> {
    if (this.process || this.isStarting) {
      return;
    }

    this.isStarting = true;

    try {
      // Determine server path (bundled or development)
      const serverPath = this.getServerPath();
      
      // Spawn server process
      this.process = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: 'production'
        }
      });

      // Set up communication
      this.client.connect(this.process.stdin!, this.process.stdout!);
      
      // Handle server output
      this.process.stderr?.on('data', (data) => {
        console.error(`[MCP Server Error]: ${data}`);
      });

      // Handle process exit
      this.process.on('exit', (code) => {
        this.handleProcessExit(code);
      });

      // Wait for server ready
      await this.waitForReady();
      
      // Start health monitoring
      this.startHealthCheck();
      
      this.isStarting = false;
      this.restartAttempts = 0;
      
      vscode.window.showInformationMessage('MCP Server started successfully');
    } catch (error) {
      this.isStarting = false;
      throw new Error(`Failed to start MCP server: ${error}`);
    }
  }

  async stop(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    this.client.disconnect();
  }

  async sendRequest<T>(method: string, params?: any): Promise<T> {
    if (!this.process) {
      throw new Error('MCP server not running');
    }

    return this.client.sendRequest<T>(method, params);
  }

  private getServerPath(): string {
    // In production, server is bundled with extension
    const bundledPath = path.join(this.context.extensionPath, 'dist', 'mcp-server', 'index.js');
    
    // In development, use source location
    const devPath = path.join(this.context.extensionPath, '..', 'axon-mcp-server', 'dist', 'index.js');
    
    return vscode.Uri.file(bundledPath).fsPath;
  }

  private async waitForReady(timeout = 10000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        await this.client.sendRequest('ping');
        return;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    throw new Error('Server failed to become ready');
  }

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.client.sendRequest('ping');
      } catch {
        console.error('[MCP Server] Health check failed, restarting...');
        await this.restart();
      }
    }, 30000); // Check every 30 seconds
  }

  private async handleProcessExit(code: number | null): Promise<void> {
    console.log(`[MCP Server] Process exited with code ${code}`);
    
    if (this.restartAttempts < this.MAX_RESTART_ATTEMPTS) {
      this.restartAttempts++;
      console.log(`[MCP Server] Attempting restart (${this.restartAttempts}/${this.MAX_RESTART_ATTEMPTS})`);
      
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before restart
      await this.start();
    } else {
      vscode.window.showErrorMessage('MCP Server crashed and could not be restarted');
    }
  }

  private async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  dispose(): void {
    this.stop();
  }
}
```

**2.2 JSON-RPC Client Implementation**
```typescript
// src/mcp/McpClient.ts
import { Transform, Writable, Readable } from 'stream';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export class McpClient {
  private stdin: Writable | null = null;
  private stdout: Readable | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private buffer = '';

  connect(stdin: Writable, stdout: Readable): void {
    this.stdin = stdin;
    this.stdout = stdout;

    // Parse JSON-RPC messages from stdout
    stdout.on('data', (chunk) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });
  }

  disconnect(): void {
    this.stdin = null;
    this.stdout = null;
    this.pendingRequests.clear();
  }

  async sendRequest<T>(method: string, params?: any): Promise<T> {
    if (!this.stdin) {
      throw new Error('Not connected');
    }

    const id = this.requestId++;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      
      const message = JSON.stringify(request) + '\n';
      this.stdin!.write(message);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 30000);
    });
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const response: JsonRpcResponse = JSON.parse(line);
          this.handleResponse(response);
        } catch (error) {
          console.error('[MCP Client] Failed to parse response:', line, error);
        }
      }
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      console.warn('[MCP Client] Received response for unknown request:', response.id);
      return;
    }

    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}
```

**2.3 Integration with Extension Commands**
```typescript
// Example: Search functions via MCP
async function searchAxonFunctions(query: string): Promise<FunctionInfo[]> {
  const mcpServer = getMcpServerInstance();
  
  const results = await mcpServer.sendRequest<{ functions: FunctionInfo[] }>(
    'searchAxonDocs',
    { keyword: query, limit: 20 }
  );
  
  return results.functions;
}
```

#### Testing Strategy
- Unit tests for JSON-RPC serialization
- Integration tests with mock server process
- Stress tests for concurrent requests
- Restart behavior tests

#### Success Criteria
- [ ] MCP server starts and responds to requests
- [ ] Auto-restart works on crash
- [ ] Health monitoring detects issues
- [ ] Clean shutdown on extension deactivation

---

### Phase 3: Four-Level Caching System
**Duration**: 1 week  
**Priority**: High

#### Objectives
- Implement multi-level caching to minimize AI costs
- Create sophisticated cache key generation
- Build cache statistics and monitoring

#### Key Tasks

**3.1 Cache Architecture**
```typescript
// src/cache/CacheManager.ts
export interface CacheEntry<T> {
  key: string;
  value: T;
  timestamp: number;
  ttl: number;
  metadata: {
    modelId: string;
    contextHash: string;
    schemaVersion: string;
  };
}

export class CacheManager {
  private l1Memory: MemoryCache;          // L1: In-memory LRU
  private l2Session: SessionCache;        // L2: Session storage
  private l3Workspace: WorkspaceCache;    // L3: Workspace files
  private l4Global: GlobalCache;          // L4: SQLite global

  constructor(private context: vscode.ExtensionContext) {
    this.l1Memory = new MemoryCache(100);
    this.l2Session = new SessionCache(context.workspaceState);
    this.l3Workspace = new WorkspaceCache(context);
    this.l4Global = new GlobalCache(context.globalStoragePath);
  }

  async get<T>(key: string): Promise<T | null> {
    // Try each level in order
    let result = await this.l1Memory.get<T>(key);
    if (result) {
      this.updateStats('l1', 'hit');
      return result;
    }

    result = await this.l2Session.get<T>(key);
    if (result) {
      this.updateStats('l2', 'hit');
      await this.l1Memory.set(key, result); // Promote to L1
      return result;
    }

    result = await this.l3Workspace.get<T>(key);
    if (result) {
      this.updateStats('l3', 'hit');
      await this.l1Memory.set(key, result);
      await this.l2Session.set(key, result);
      return result;
    }

    result = await this.l4Global.get<T>(key);
    if (result) {
      this.updateStats('l4', 'hit');
      await this.l1Memory.set(key, result);
      await this.l2Session.set(key, result);
      await this.l3Workspace.set(key, result);
      return result;
    }

    this.updateStats('all', 'miss');
    return null;
  }

  async set<T>(key: string, value: T, metadata: CacheMetadata): Promise<void> {
    const entry: CacheEntry<T> = {
      key,
      value,
      timestamp: Date.now(),
      ttl: this.calculateTTL(metadata),
      metadata
    };

    // Write to all levels
    await Promise.all([
      this.l1Memory.set(key, entry),
      this.l2Session.set(key, entry),
      this.l3Workspace.set(key, entry),
      this.l4Global.set(key, entry)
    ]);
  }

  async invalidate(pattern: string | RegExp): Promise<void> {
    await Promise.all([
      this.l1Memory.invalidate(pattern),
      this.l2Session.invalidate(pattern),
      this.l3Workspace.invalidate(pattern),
      this.l4Global.invalidate(pattern)
    ]);
  }

  getStatistics(): CacheStatistics {
    return {
      l1: this.l1Memory.getStats(),
      l2: this.l2Session.getStats(),
      l3: this.l3Workspace.getStats(),
      l4: this.l4Global.getStats(),
      overall: this.calculateOverallStats()
    };
  }

  private calculateTTL(metadata: CacheMetadata): number {
    // Different TTLs based on content type
    if (metadata.type === 'schema') return 7 * 24 * 60 * 60 * 1000; // 7 days
    if (metadata.type === 'generation') return 24 * 60 * 60 * 1000; // 1 day
    return 60 * 60 * 1000; // 1 hour default
  }

  dispose(): void {
    this.l1Memory.clear();
    this.l2Session.flush();
    this.l3Workspace.flush();
    this.l4Global.close();
  }
}
```

**3.2 Cache Key Generation Strategy**
```typescript
// src/cache/CacheKey.ts
import * as crypto from 'crypto';

export class CacheKeyGenerator {
  static generateKey(context: GenerationContext): string {
    const components = [
      context.task,
      context.modelId,
      context.provider,
      this.hashObject(context.schemaContext),
      this.hashObject(context.codeContext)
    ];

    const combined = components.join('|');
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  static generateSchemaKey(schemaInfo: SchemaInfo): string {
    return `schema:${schemaInfo.projectId}:${schemaInfo.version}`;
  }

  static generateQueryKey(query: string, options: QueryOptions): string {
    const hash = crypto.createHash('sha256')
      .update(query)
      .update(JSON.stringify(options))
      .digest('hex');
    return `query:${hash}`;
  }

  private static hashObject(obj: any): string {
    if (!obj) return 'null';
    return crypto.createHash('sha256')
      .update(JSON.stringify(obj))
      .digest('hex')
      .substring(0, 16);
  }
}
```

**3.3 Cache Statistics Dashboard**
```typescript
// Display cache stats in status bar
const cacheStats = cacheManager.getStatistics();
const hitRate = (cacheStats.overall.hits / (cacheStats.overall.hits + cacheStats.overall.misses)) * 100;
const costSavings = cacheStats.overall.hits * AVERAGE_API_COST;

statusBarItem.text = `$(database) Cache: ${hitRate.toFixed(1)}% | Saved: $${costSavings.toFixed(2)}`;
```

#### Testing Strategy
- Unit tests for each cache level
- Performance benchmarks for cache operations
- Hit rate analysis with real-world patterns
- Cache invalidation tests

#### Success Criteria
- [ ] All cache levels functioning
- [ ] Cache hit rate >60% after warmup
- [ ] Cache persistence across restarts
- [ ] Cost savings measurable and displayed

---

### Phase 4: AI Provider Abstraction Layer
**Duration**: 2 weeks  
**Priority**: Critical

#### Objectives
- Implement flexible provider system
- Support plan/act mode generation
- Integrate multiple AI models

#### Key Tasks

**4.1 Provider Interface Implementation**
```typescript
// src/providers/base/BaseProvider.ts
export abstract class BaseProvider implements ApiHandler {
  protected config: ProviderConfiguration;
  protected tokenCounter: TokenCounter;
  protected costCalculator: CostCalculator;

  constructor(config: ProviderConfiguration) {
    this.config = config;
    this.tokenCounter = new TokenCounter(config.modelId);
    this.costCalculator = new CostCalculator(config.modelId);
  }

  async planMode(context: GenerationContext): Promise<GenerationPlan> {
    // Build plan-mode prompt
    const prompt = this.buildPlanPrompt(context);
    
    // Use cheaper model for planning
    const response = await this.callModel(prompt, 'plan');
    
    // Parse structured plan
    return this.parsePlan(response);
  }

  async actMode(plan: GenerationPlan, context: GenerationContext): Promise<GenerationResult> {
    // Build act-mode prompt with plan
    const prompt = this.buildActPrompt(plan, context);
    
    // Use more powerful model for generation
    const response = await this.callModel(prompt, 'act');
    
    // Parse and validate generated code
    return {
      code: this.extractCode(response),
      explanation: this.extractExplanation(response),
      tokensUsed: this.tokenCounter.count(response),
      cost: this.costCalculator.calculate(response)
    };
  }

  async *stream(prompt: string): AsyncIterableIterator<string> {
    const stream = await this.getStreamingResponse(prompt);
    
    for await (const chunk of stream) {
      yield chunk;
    }
  }

  // Abstract methods to be implemented by specific providers
  protected abstract callModel(prompt: string, mode: 'plan' | 'act'): Promise<string>;
  protected abstract getStreamingResponse(prompt: string): AsyncIterableIterator<string>;
  
  protected abstract buildPlanPrompt(context: GenerationContext): string;
  protected abstract buildActPrompt(plan: GenerationPlan, context: GenerationContext): string;
  
  abstract getProviderInfo(): ProviderInfo;
}
```

**4.2 Anthropic Provider Implementation**
```typescript
// src/providers/anthropic/AnthropicProvider.ts
import Anthropic from '@anthropic-ai/sdk';

export class AnthropicProvider extends BaseProvider {
  private client: Anthropic;

  constructor(config: AnthropicConfiguration) {
    super(config);
    this.client = new Anthropic({
      apiKey: config.apiKey
    });
  }

  protected async callModel(prompt: string, mode: 'plan' | 'act'): Promise<string> {
    const modelId = mode === 'plan' 
      ? 'claude-3-haiku-20240307'    // Faster, cheaper for planning
      : 'claude-sonnet-4-20250514';  // More capable for generation

    const message = await this.client.messages.create({
      model: modelId,
      max_tokens: mode === 'plan' ? 1000 : 4000,
      messages: [{
        role: 'user',
        content: prompt
      }],
      system: this.getSystemPrompt(mode)
    });

    return message.content[0].text;
  }

  protected async *getStreamingResponse(prompt: string): AsyncIterableIterator<string> {
    const stream = await this.client.messages.stream({
      model: this.config.modelId,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
      system: this.getSystemPrompt('act')
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        yield chunk.delta.text;
      }
    }
  }

  protected buildPlanPrompt(context: GenerationContext): string {
    return `
You are an expert Axon developer. Analyze this task and create a structured plan.

Task: ${context.task}

${context.codeContext ? `Current Code Context:\n${context.codeContext}` : ''}

${context.schemaContext ? `Schema Context:\n${JSON.stringify(context.schemaContext, null, 2)}` : ''}

Create a plan with:
1. Required steps
2. Functions/queries needed
3. Estimated complexity
4. Potential challenges

Format as JSON:
{
  "steps": ["step1", "step2", ...],
  "requirements": ["req1", "req2", ...],
  "complexity": "low|medium|high",
  "challenges": ["challenge1", ...]
}
`;
  }

  protected buildActPrompt(plan: GenerationPlan, context: GenerationContext): string {
    return `
You are an expert Axon developer. Implement the following plan.

Plan:
${JSON.stringify(plan, null, 2)}

Task: ${context.task}

${context.schemaContext ? `Available Schema:\n${this.formatSchema(context.schemaContext)}` : ''}

${context.examples ? `Example Patterns:\n${context.examples.join('\n\n')}` : ''}

Generate complete, working Axon code with:
- Clear function signatures
- Comprehensive error handling
- Performance optimization
- Inline documentation

Format as:
\`\`\`axon
// Your code here
\`\`\`

Then provide a brief explanation of the implementation.
`;
  }

  getProviderInfo(): ProviderInfo {
    return {
      id: 'anthropic',
      name: 'Anthropic',
      models: ['claude-sonnet-4-20250514', 'claude-3-haiku-20240307'],
      supportsStreaming: true,
      supportsPlanMode: true,
      costPerToken: {
        plan: 0.00025,
        act: 0.003
      }
    };
  }

  private getSystemPrompt(mode: 'plan' | 'act'): string {
    if (mode === 'plan') {
      return 'You are an expert software architect specializing in Axon/SkySpark. Your role is to analyze requirements and create detailed implementation plans.';
    } else {
      return `You are an expert Axon developer. You write clean, efficient, and well-documented Axon code following best practices:

1. Use functional programming patterns
2. Leverage grid operations efficiently
3. Handle errors gracefully
4. Document complex logic
5. Optimize for SkySpark performance

Always generate complete, production-ready code.`;
    }
  }
}
```

**4.3 OpenAI Provider Implementation**
```typescript
// src/providers/openai/OpenAIProvider.ts
import OpenAI from 'openai';

export class OpenAIProvider extends BaseProvider {
  private client: OpenAI;

  constructor(config: OpenAIConfiguration) {
    super(config);
    this.client = new OpenAI({
      apiKey: config.apiKey
    });
  }

  protected async callModel(prompt: string, mode: 'plan' | 'act'): Promise<string> {
    const modelId = mode === 'plan'
      ? 'gpt-3.5-turbo'    // Cheaper for planning
      : 'gpt-4-turbo';     // More capable for generation

    const completion = await this.client.chat.completions.create({
      model: modelId,
      messages: [
        { role: 'system', content: this.getSystemPrompt(mode) },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: mode === 'plan' ? 1000 : 4000
    });

    return completion.choices[0].message.content || '';
  }

  protected async *getStreamingResponse(prompt: string): AsyncIterableIterator<string> {
    const stream = await this.client.chat.completions.create({
      model: this.config.modelId,
      messages: [
        { role: 'system', content: this.getSystemPrompt('act') },
        { role: 'user', content: prompt }
      ],
      stream: true,
      temperature: 0.3
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }

  // Similar implementations of buildPlanPrompt, buildActPrompt, etc.
  // ...
}
```

**4.4 Provider Manager**
```typescript
// src/core/ProviderManager.ts
export class ProviderManager {
  private providers: Map<string, ApiHandler> = new Map();
  private activeProvider: ApiHandler | null = null;

  constructor(private stateManager: StateManager) {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    const state = this.stateManager.getState();
    
    // Initialize configured providers
    if (state.providerConfig.anthropic?.apiKey) {
      const provider = new AnthropicProvider(state.providerConfig.anthropic);
      this.providers.set('anthropic', provider);
    }

    if (state.providerConfig.openai?.apiKey) {
      const provider = new OpenAIProvider(state.providerConfig.openai);
      this.providers.set('openai', provider);
    }

    // Set active provider
    this.activeProvider = this.providers.get(state.activeProvider) || null;
  }

  getActiveProvider(): ApiHandler | null {
    return this.activeProvider;
  }

  setActiveProvider(providerId: string): void {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`);
    }
    
    this.activeProvider = provider;
    this.stateManager.updateState({ activeProvider: providerId });
  }

  listProviders(): ProviderInfo[] {
    return Array.from(this.providers.values()).map(p => p.getProviderInfo());
  }

  dispose(): void {
    this.providers.clear();
    this.activeProvider = null;
  }
}
```

#### Testing Strategy
- Mock API responses for unit tests
- Integration tests with actual APIs (optional, gated)
- Token counting accuracy tests
- Cost calculation verification
- Plan/act mode workflow tests

#### Success Criteria
- [ ] Multiple providers supported
- [ ] Plan/act mode working correctly
- [ ] Streaming responses functional
- [ ] Cost tracking accurate

---

### Phase 5-12: Remaining Phases

Due to length constraints, the remaining phases (5-12) follow similar detailed structures covering:

- **Phase 5**: Axon Language Server Protocol Implementation
- **Phase 6**: React-based Project Management UI
- **Phase 7**: **Interactive Code Generation & Refinement** ⭐ (See detailed workflow below)
- **Phase 8**: Session Management
- **Phase 9**: Advanced SkySpark Integration (Live Eval, Testing, Debugging)
- **Phase 10**: Testing Infrastructure
- **Phase 11**: Documentation
- **Phase 12**: Release Preparation

Each phase includes:
- Detailed objectives and key tasks
- Code examples and architecture
- Testing strategies
- Success criteria

---

## ⭐ Interactive Code Generation - The Killer Feature

### What Makes This Different?

Unlike traditional code generators that produce static output, this extension creates an **iterative refinement loop** that:

1. **Understands Context** - Queries your actual SkySpark project schema via MCP
2. **Generates Initial Code** - Using AI with rich context from your project
3. **Tests Automatically** - Executes code in SkySpark using eval API
4. **Analyzes Errors** - AI analyzes error messages and suggests fixes
5. **Refines Iteratively** - Applies fixes and re-tests until 90%+ working
6. **User-Guided** - You can request specific improvements at any step

### Real-World Example: BACnet Device Import

**User Request:**
> "Write me an axon function that imports all bacnet devices through job or skyspark task. Learn the grid of bacnet from schema saved to io. Read device names like ahu, rtu, vav and import all points with correct connector tags."

**Extension Response:**
```
[Progress: 10%] Analyzing requirements...
  - Identified: BACnet connector integration
  - Complexity: High
  - Estimated functions: 8-10

[Progress: 30%] Gathering context from MCP...
  - Found 15 BACnet examples
  - Retrieved project schema (127 tags)
  - Analyzed device naming patterns
  - Located 5 similar import functions

[Progress: 50%] Generating code...
  - Main import function: importBacnetDevicesFromSchema()
  - Helper functions: 7
  - Error handling: Comprehensive
  - Documentation: Complete

[Progress: 70%] Testing in SkySpark (dry-run)...
  - Test: ✅ PASSED
  - Devices parsed: 3 (AHU, RTU, VAV)
  - Points discovered: 47
  - No errors detected

[Progress: 100%] Code ready for review!
  Quality Score: 92%
  Functions: 8
  Lines: 214
  Cost: $0.087 (3 cache hits saved $0.24)
```

### Workflow Architecture

```typescript
// Phase 7 Implementation Preview
class InteractiveGenerator {
  async generateWithRefinement(userRequest: string): Promise<GeneratedCode> {
    // 1. Plan Mode (cheap model)
    const plan = await this.analyzIntent(userRequest);
    
    // 2. Context Gathering (MCP)
    const context = await this.gatherContext(plan);
    
    // 3. Act Mode (powerful model)
    const code = await this.generateCode(plan, context);
    
    // 4. Auto-test loop
    let iteration = 0;
    while (iteration < MAX_ITERATIONS) {
      const testResult = await this.executeInSkySpark(code);
      
      if (testResult.success && testResult.quality > THRESHOLD) {
        break; // 90%+ working!
      }
      
      // AI analyzes errors and suggests fixes
      const fixes = await this.analyzErrorsAndFix(testResult.errors, code);
      
      // User can review/modify fixes
      const approved = await this.showDiffAndConfirm(code, fixes);
      if (approved) {
        code = fixes;
        iteration++;
      } else {
        break; // User wants manual control
      }
    }
    
    return code;
  }
}
```

### Key Capabilities

#### 1. Schema-Aware Generation
```typescript
// Extension queries actual project structure
const schema = await mcpServer.getProjectSchema({
  projectId: currentProject,
  filter: { tags: ['bacnet', 'connector'] }
});

// AI uses real tag definitions, not assumptions
const prompt = `
Generate BACnet import using these ACTUAL tags:
${JSON.stringify(schema.connectorTags)}

Existing devices follow pattern:
${schema.namingPatterns.ahu}
`;
```

#### 2. Live Execution & Error Recovery
```typescript
// Execute generated code in SkySpark
const result = await skysparkApi.eval(`
  ${generatedCode}
  
  // Test with dry-run
  importBacnetDevices(schemaIo, conn, {dryRun: true})
`);

if (result.error) {
  // AI analyzes actual error and fixes
  const fix = await ai.fixError(result.error, generatedCode);
  // Re-test automatically
}
```

#### 3. User-Guided Refinement
```typescript
// After initial generation, user can request changes
user: "Add error handling for offline devices"
  ↓
ai: Modifies code, preserves working parts
  ↓
automaticTest: Validates changes work
  ↓
user: "Perfect! Save to project"
```

### Success Metrics

**Target: 90% Working Code, 10% Manual Fixes**

#### Typical Generation Quality:
- **First generation:** 60-70% working (context-aware, but untested)
- **After 1st auto-fix:** 80-85% working (syntax fixed, basic logic working)
- **After 2-3 iterations:** 90-95% working (edge cases handled, robust)
- **Manual fixes:** 5-10% (business-specific logic, custom rules)

#### What Users Need to Fix (The 10%):
- Project-specific business rules
- Custom validation logic  
- Performance optimizations for their data volume
- Integration with other custom systems

#### Cost Analysis:
**Typical Session:**
```
Generation Request: BACnet Import Function
├─ Plan Mode (GPT-3.5):         $0.002
├─ Context Gathering (cached):  $0.000
├─ Act Mode (Claude Sonnet):    $0.085
├─ Error Fix #1:                $0.012
├─ Error Fix #2:                $0.008
└─ Total Cost:                  $0.107

Cache Savings: $0.240 (3 similar queries cached)
Net Cost: $0.107
Time Saved: ~2-3 hours of manual coding
```

### Implementation Details

See `/docs/INTERACTIVE_GENERATION_WORKFLOW.md` for complete implementation details including:
- Full code examples for all 6 phases
- Error recovery strategies
- Session management
- Quality checking algorithms
- User interface flows

---

---

## Development Timeline

### Sprint Schedule (Agile 2-week sprints)

| Sprint | Phases | Duration | Deliverables |
|--------|--------|----------|--------------|
| 1-2 | Phase 1-2 | 2 weeks | Core infrastructure + MCP integration |
| 3 | Phase 3 | 1 week | Caching system complete |
| 4-5 | Phase 4 | 2 weeks | AI provider system functional |
| 6-7 | Phase 5 | 2 weeks | Language features working |
| 8-9 | Phase 6 | 2 weeks | Project UI complete |
| 10 | Phase 7 | 1 week | Code generation commands |
| 11 | Phase 8 | 1 week | Session management |
| 12-13 | Phase 9 | 2 weeks | Advanced features |
| 14 | Phase 10 | 1 week | Testing complete |
| 15 | Phase 11 | 1 week | Documentation done |
| 16 | Phase 12 | 1 week | Release ready |

**Total Duration**: ~16 weeks (4 months)

---

## Testing Strategy

### Test Coverage Goals
- Unit tests: >80% coverage
- Integration tests: Critical paths covered
- E2E tests: Main user workflows
- Performance tests: Regression prevention

### Testing Tools
```json
{
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "@types/node": "^20.0.0",
    "@types/vscode": "^1.84.0",
    "@vscode/test-electron": "^2.3.0",
    "jest": "^29.5.0",
    "ts-jest": "^29.1.0",
    "vscode-test": "^1.6.1"
  }
}
```

### Test Structure
```
tests/
├── unit/
│   ├── core/
│   │   ├── StateManager.test.ts
│   │   └── ApiHandler.test.ts
│   ├── providers/
│   │   ├── AnthropicProvider.test.ts
│   │   └── OpenAIProvider.test.ts
│   └── cache/
│       └── CacheManager.test.ts
├── integration/
│   ├── mcp/
│   │   └── McpServerIntegration.test.ts
│   └── commands/
│       └── GenerationCommands.test.ts
└── e2e/
    └── scenarios/
        ├── FirstTimeSetup.test.ts
        └── GenerateFunction.test.ts
```

---

## Documentation Plan

### User Documentation
1. **Getting Started Guide**
   - Installation
   - Configuration
   - First project setup

2. **Feature Documentation**
   - Code generation
   - Language support
   - Project management
   - Caching system

3. **Tutorial Videos**
   - Quick start (5 min)
   - Deep dive features (15 min)
   - Advanced workflows (20 min)

### Developer Documentation
1. **Architecture Overview**
   - System design
   - Component interaction
   - Extension points

2. **API Reference**
   - Public APIs
   - Extension commands
   - Configuration options

3. **Contributing Guide**
   - Development setup
   - Testing guidelines
   - Pull request process

---

## Release Strategy

### Version Numbering
- Semantic versioning: MAJOR.MINOR.PATCH
- Pre-release: 0.x.x (beta)
- Production: 1.0.0+

### Release Process
1. Code freeze
2. Final testing
3. Documentation review
4. Marketplace assets preparation
5. Package and publish
6. Announcement
7. Monitor feedback

### Post-Release
- Bug fix releases: Within 1 week if critical
- Feature releases: Monthly cadence
- Security patches: Immediate

---

## Risk Mitigation

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| MCP server instability | High | Health monitoring, auto-restart, fallback modes |
| AI API rate limits | Medium | Aggressive caching, queue management |
| VSCode API changes | Low | Lock to stable API version, monitor deprecations |
| Performance issues | Medium | Profiling, optimization, async operations |

### Project Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Scope creep | High | Strict MVP definition, phase gating |
| Timeline slippage | Medium | Regular sprint reviews, priority adjustments |
| Resource constraints | Low | Modular architecture, community involvement |

---

## Success Metrics

### Technical Metrics
- Extension activation time: <2 seconds
- MCP response time: <500ms (p95)
- Cache hit rate: >60%
- Memory footprint: <100MB

### User Metrics
- Installation count: Track from marketplace
- Active users: Daily/weekly active
- Feature usage: Telemetry data
- User satisfaction: Ratings and reviews

### Quality Metrics
- Test coverage: >80%
- Bug reports: <5 per month after 1.0
- Code quality: Passing linting
- Documentation: 100% API coverage

---

## Conclusion

This implementation plan provides a comprehensive roadmap for building a production-ready VSCode extension for SkySpark Axon development. By leveraging architectural patterns from Cline and implementing sophisticated features like four-level caching and AI-powered generation, the extension will significantly enhance developer productivity in the SkySpark ecosystem.

The phased approach allows for incremental delivery while maintaining high quality standards through comprehensive testing and documentation. The estimated 4-month timeline balances ambition with practicality, focusing first on core features before expanding to advanced capabilities.

---

## Next Steps

1. **Review and Approval**: Review this plan with stakeholders
2. **Environment Setup**: Set up development environment
3. **Sprint 0**: Initialize project, configure tooling
4. **Sprint 1**: Begin Phase 1 implementation
5. **Weekly Reviews**: Track progress against plan

---

## References

- [Cline Source Code](https://github.com/cline/cline)
- [VSCode Extension API](https://code.visualstudio.com/api)
- [Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [TypeScript Documentation](https://www.typescriptlang.org/)
- [React Documentation](https://react.dev/)

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-10  
**Author**: AI Assistant  
**Status**: Draft for Review
