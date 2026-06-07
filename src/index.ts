#!/usr/bin/env node
import 'dotenv/config';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { Application, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
  isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { FileScanner } from './scanner/fileScanner.js';
import { AxonParser } from './parser/axonParser.js';
import { AxonCodeIndex, AxonFunction, AxonCategory, SearchOptions } from './types/index.js';
import { PatternRepository } from './patterns/patternRepository.js';
import { CacheManager } from './cache/cacheManager.js';
import { SearchIndex } from './search/searchIndex.js';
import { AxonServerConfig, loadConfig, savePrimaryProject, PROJECT_ROOT } from './config/config.js';
import { FunctionUsageIndexer } from './search/functionUsageIndex.js';
import { UsageSearchOptions, CallGraphOptions, FunctionUsageStats } from './types/functionUsage.js';
import { OperatorIndex } from './search/operatorIndex.js';
import { AxonUsageScanner } from './scanner/axonUsageScanner.js';
import { RegexSearcher } from './search/regexSearch.js';
import { EnhancedAxonIndexer } from './indexer/enhancedAxonIndexer.js';
import { HtmlDocParser } from './parser/htmlDocParser.js';
import { FlexSearchDocIndex } from './search/flexSearchIndex.js';
import { FlexSearchFunctionIndex, FunctionSearchOptions } from './search/flexSearchFunctionIndex.js';
import { HtmlDocument, DocSearchOptions, DocSearchResult } from './types/documentation.js';

// New imports for validation and generation
import { HaystackSkySparkClient } from './skyspark/haystackClient.js';
import { SkySparkConfigManager } from './config/skysparkConfig.js';
import { TypedAxonGenerator } from './generation/typedAxonGenerator.js';
import { TemplateLoader } from './templates/templateLoader.js';
import { SemanticValidator } from './validation/semanticValidator.js';
import { BestPracticesChecker } from './validation/bestPracticesChecker.js';
import { PerformanceAnalyzer } from './validation/performanceAnalyzer.js';
import { ErrorRecovery } from './generation/errorRecovery.js';
import { FunctionSyncManagerEnhanced } from './sync/functionSyncManagerEnhanced.js';
import { createAdminRouter } from './admin/routes.js';
import { getUsageTracker } from './usage/usageTracker.js';
import { ServerStatus, InstanceInfo, ProjectInfo, CacheInfo } from './admin/types.js';
import { WorkflowManager } from './workflows/workflowManager.js';
import { WorkflowVectorIndex } from './workflows/workflowVectorIndex.js';
import { AxonOAuthProvider, TokenCleanupJob, renderAuthorizePage, renderErrorPage } from './auth/index.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { initUserStore, getUserStore } from './admin/userStore.js';
import { BackupManager } from './admin/backupManager.js';

class AxonMCPServer {
  private server: Server;
  private codeIndex: AxonCodeIndex;
  private scanner: FileScanner;
  private parser: AxonParser;
  private patternRepo: PatternRepository;
  private cacheManager: CacheManager;
  private searchIndex: SearchIndex;
  private functionUsageIndexer: FunctionUsageIndexer;
  private operatorIndex: OperatorIndex;
  private axonUsageScanner: AxonUsageScanner;
  private regexSearcher: RegexSearcher;
  private enhancedIndexer: EnhancedAxonIndexer;
  private htmlDocParser: HtmlDocParser;
  private flexSearchIndex: FlexSearchDocIndex;
  private flexSearchFunctionIndex: FlexSearchFunctionIndex;
  private config: AxonServerConfig;
  
  // New components for validation and generation
  private skysparkClient?: HaystackSkySparkClient;  // For MCP queries - always uses primaryContext
  private syncClient?: HaystackSkySparkClient;       // For sync operations - can switch between projects
  private configManager?: SkySparkConfigManager;
  private templateLoader: TemplateLoader;
  private axonGenerator: TypedAxonGenerator;
  private semanticValidator?: SemanticValidator;
  private bestPracticesChecker: BestPracticesChecker;
  private performanceAnalyzer: PerformanceAnalyzer;
  private errorRecovery: ErrorRecovery;
  private autoDiscoverProjects: boolean = false;
  private autoSyncFunctions: boolean = false;
  private syncConcurrency: number = 10;
  private functionVersioning: boolean = true;
  private maxVersions: number = 4;
  private functionSyncManager: FunctionSyncManagerEnhanced;
  private workflowManager: WorkflowManager;
  private workflowVectorIndex?: WorkflowVectorIndex;

  // Initialization state tracking
  private initializationComplete: boolean = false;
  private initializationPromise?: Promise<void>;

  // HTTP transport components (StreamableHTTP)
  private httpTransports: Map<string, StreamableHTTPServerTransport> = new Map();
  private httpSessions: Map<string, Server> = new Map();
  private expressApp?: Application;

  // Log buffer for dashboard
  private logBuffer: string[] = [];
  private readonly maxLogBuffer = 500;
  private startTime = Date.now();
  private usageTracker = getUsageTracker();

  // Primary project context - shared across all clients (VSCode, Dashboard, Claude Code, Cline)
  // This is separate from the sync client state - it tracks the user's chosen active project
  private primaryContext: {
    instance: string;
    project: string;
    url: string;
    setBy: 'vscode' | 'dashboard' | 'api' | 'startup';
    timestamp: Date;
  } | null = null;

  // Track which project is currently being synced (for dashboard display)
  private syncInProgress: {
    instance: string;
    project: string;
    startedAt: Date;
  } | null = null;

  // OAuth 2.1 components
  private oauthProvider?: AxonOAuthProvider;
  private tokenCleanupJob?: TokenCleanupJob;

  // Backup manager
  private backupManager?: BackupManager;

  // Prisma client (shared across OAuth, graph, etc.)
  private prisma?: any;

  constructor(configPath?: string) {
    this.config = loadConfig(configPath);
    
    this.server = new Server(
      {
        name: 'axon-code-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: { listChanged: true },
          resources: { listChanged: true },
        },
      }
    );

    this.scanner = new FileScanner(this.config);
    this.parser = new AxonParser();
    this.patternRepo = new PatternRepository();
    this.cacheManager = new CacheManager(this.config.cache?.directory);
    this.searchIndex = new SearchIndex();
    this.functionUsageIndexer = new FunctionUsageIndexer(this.scanner, this.config.cache?.directory);
    this.operatorIndex = new OperatorIndex();
    this.axonUsageScanner = new AxonUsageScanner();
    this.regexSearcher = new RegexSearcher();
    this.enhancedIndexer = new EnhancedAxonIndexer();
    this.htmlDocParser = new HtmlDocParser();
    this.flexSearchIndex = new FlexSearchDocIndex();
    this.flexSearchFunctionIndex = new FlexSearchFunctionIndex();
    this.codeIndex = {
      functions: new Map(),
      categories: new Map(),
      tags: new Map(),
      lastUpdated: new Date(),
    };
    
    // Initialize new components
    this.templateLoader = new TemplateLoader(path.join(PROJECT_ROOT, 'templates'));
    this.axonGenerator = new TypedAxonGenerator();
    this.bestPracticesChecker = new BestPracticesChecker();
    this.performanceAnalyzer = new PerformanceAnalyzer();
    this.errorRecovery = new ErrorRecovery();
    this.functionSyncManager = new FunctionSyncManagerEnhanced('proj', {
      enableVersioning: this.config.skyspark?.functionVersioning,
      maxVersions: this.config.skyspark?.maxVersions,
    });
    this.workflowManager = new WorkflowManager(path.join(PROJECT_ROOT, 'workflows'));

    // Try to initialize SkySpark client if configured
    this.initializeSkySparkClient();

    this.setupHandlers();
  }

  private setupHandlersForServer(server: Server) {
    this.setupHandlersOnServer(server);
  }

  private setupHandlers() {
    this.setupHandlersOnServer(this.server);
  }

  /**
   * Log a message and add to buffer for dashboard
   */
  private log(message: string): void {
    console.error(message);
    this.logBuffer.push(`[${new Date().toISOString()}] ${message}`);
    if (this.logBuffer.length > this.maxLogBuffer) {
      this.logBuffer.shift();
    }
  }

  /**
   * Get server status for admin dashboard
   */
  private getServerStatus(): ServerStatus {
    const memUsage = process.memoryUsage();

    return {
      status: this.initializationComplete ? 'running' : 'starting',
      uptime: Date.now() - this.startTime,
      memory: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
      },
      initialized: this.initializationComplete,
      version: '1.0.0',
      serverPath: path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'index.js'),
      port: parseInt(process.env.MCP_PORT || String(this.config.server?.port || 3847)),
      // Use primaryContext (user's chosen project) for activeInstance/activeProject
      activeInstance: this.primaryContext?.instance,
      activeProject: this.primaryContext?.project,
      stats: {
        instances: this.configManager?.getInstances().length || 0,
        projects: this.configManager?.getAllProjects().length || 0,
        functions: this.codeIndex.functions.size,
        docsIndexed: this.flexSearchIndex.getStats().totalDocuments,
        docsLibraries: this.flexSearchIndex.getStats().libraries.length,
        docsSections: this.flexSearchIndex.getStats().totalSections,
      },
    };
  }

  /**
   * Get instances for admin dashboard
   */
  private getInstancesInfo(): InstanceInfo[] {
    if (!this.configManager) return [];

    // Use primaryContext (user's chosen project) for isActive, not the sync client state
    const activeInstance = this.primaryContext?.instance;
    const activeProject = this.primaryContext?.project;
    const instances = this.configManager.getInstances();

    return instances.map((inst) => ({
      name: inst.name,
      host: inst.host,
      port: inst.port,
      protocol: inst.protocol,
      projectCount: (inst.projects || []).length,
      isActive: inst.name === activeInstance,
      projects: (inst.projects || []).map((proj) => ({
        project: proj.name,
        instance: inst.name,
        description: proj.description,
        isActive: inst.name === activeInstance && proj.name === activeProject,
      })),
    }));
  }

  /**
   * Get all projects for admin dashboard
   */
  private getProjectsInfo(): ProjectInfo[] {
    if (!this.configManager) return [];

    // Use primaryContext (user's chosen project) for isActive, not the sync client state
    const activeInstance = this.primaryContext?.instance;
    const activeProject = this.primaryContext?.project;
    const projects: ProjectInfo[] = [];

    for (const inst of this.configManager.getInstances()) {
      for (const proj of (inst.projects || [])) {
        // Try to read sync metadata from file if it exists
        let functionCount: number | undefined;
        let lastSync: string | undefined;
        try {
          const metaPath = this.functionSyncManager.getSyncMetadataPath(inst.name, proj.name);
          if (fs.existsSync(metaPath)) {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            functionCount = meta.functionCount;
            lastSync = meta.lastSync;
          }
        } catch { /* ignore */ }

        projects.push({
          project: proj.name,
          instance: inst.name,
          description: proj.description,
          functionCount,
          lastSync,
          isActive: inst.name === activeInstance && proj.name === activeProject,
          isSyncing: this.syncInProgress?.instance === inst.name && this.syncInProgress?.project === proj.name,
        });
      }
    }

    return projects;
  }

  /**
   * Get cache info for admin dashboard
   */
  private getCacheInfo(): CacheInfo[] {
    const cacheDir = this.config.cache?.directory || '.cache';
    const caches: CacheInfo[] = [];

    try {
      if (fs.existsSync(cacheDir)) {
        const entries = fs.readdirSync(cacheDir);
        for (const entry of entries) {
          const filePath = path.join(cacheDir, entry);
          const stats = fs.statSync(filePath);

          if (stats.isFile() && (entry.endsWith('.json') || entry.endsWith('.db'))) {
            caches.push({
              name: entry,
              path: filePath,
              size: stats.size,
              lastModified: stats.mtime.toISOString(),
              age: Date.now() - stats.mtime.getTime(),
            });
          } else if (stats.isDirectory() && entry.endsWith('.db')) {
            // LanceDB directories (e.g., axonvector.db/)
            const dirSize = this.getDirectorySize(filePath);
            caches.push({
              name: entry + '/',
              path: filePath,
              size: dirSize,
              lastModified: stats.mtime.toISOString(),
              age: Date.now() - stats.mtime.getTime(),
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to get cache info:', error);
    }

    return caches;
  }

  private getDirectorySize(dirPath: string): number {
    let totalSize = 0;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isFile()) {
          totalSize += fs.statSync(fullPath).size;
        } else if (entry.isDirectory()) {
          totalSize += this.getDirectorySize(fullPath);
        }
      }
    } catch { /* ignore permission errors */ }
    return totalSize;
  }

  /**
   * Create admin context for routes
   */
  private createAdminContext() {
    return {
      getServerStatus: () => this.getServerStatus(),
      getInstances: () => this.getInstancesInfo(),
      getInstance: (name: string) => this.getInstancesInfo().find((i) => i.name === name),
      getProjects: () => this.getProjectsInfo(),
      getCacheInfo: () => this.getCacheInfo(),
      clearCache: async (name?: string) => {
        if (name) {
          const cacheDir = this.config.cache?.directory || '.cache';
          const filePath = path.join(cacheDir, name);
          if (fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
              fs.rmSync(filePath, { recursive: true, force: true });
            } else {
              fs.unlinkSync(filePath);
            }
          }
          // If FlexSearch docs cache was cleared, rebuild the in-memory index
          if (name === 'flexsearch-docs.json' && this.config.docsPath) {
            console.error('📚 Documentation cache cleared, rebuilding FlexSearch index...');
            this.flexSearchIndex.clear();
            await this.buildFlexSearchIndex();
          }
        } else {
          // Clear all caches by removing all json files in cache dir
          this.cacheManager.clearProjectCache();
          // Also rebuild the FlexSearch index
          if (this.config.docsPath) {
            console.error('📚 All caches cleared, rebuilding FlexSearch index...');
            this.flexSearchIndex.clear();
            await this.buildFlexSearchIndex();
          }
        }
      },
      triggerSync: async (instance: string, project: string) => {
        if (!this.syncClient || !this.configManager) {
          throw new Error('SkySpark not configured');
        }
        // Use syncClient for sync operations - keeps skysparkClient on primaryContext
        this.syncClient.switchTo(instance, project);
        const result = await this.functionSyncManager.syncFunctions(
          this.syncClient,
          instance,
          project
        );
        return { downloaded: result.downloaded, updated: result.updated, deleted: result.deleted };
      },
      triggerDiscover: async (instanceName: string) => {
        return await this.runDiscoverWithProgress(instanceName);
      },
      triggerDiscoverWithProgress: async (
        instanceName: string,
        onLog: (entry: { level: 'info' | 'success' | 'error'; step: string; message: string; data?: any }) => void
      ) => {
        return await this.runDiscoverWithProgress(instanceName, onLog);
      },
      reloadConfig: () => {
        if (this.configManager) {
          this.configManager.reload();
        }
      },
      getLogBuffer: () => this.logBuffer,
      getPrimaryProject: () => {
        if (!this.primaryContext) {
          return null;
        }
        return {
          instance: this.primaryContext.instance,
          project: this.primaryContext.project,
          url: this.primaryContext.url,
          setBy: this.primaryContext.setBy,
          timestamp: this.primaryContext.timestamp.toISOString(),
        };
      },
      setPrimaryProject: async (instance: string, project: string, setBy: 'vscode' | 'dashboard' | 'api' | 'startup' = 'api') => {
        if (!this.skysparkClient || !this.configManager) {
          throw new Error('SkySpark not configured');
        }
        // Switch the shared client to get the URL
        this.skysparkClient.switchTo(instance, project);
        const config = this.skysparkClient.getCurrentConfig();

        // Update primary context with URL
        this.primaryContext = {
          instance,
          project,
          url: config.url,
          setBy,
          timestamp: new Date(),
        };

        // Persist to config file so it survives restarts
        savePrimaryProject(instance, project);

        console.error(`🎯 Primary project set via ${setBy}: ${instance}/${project}`);

        return {
          instance,
          project,
          url: config.url,
          setBy,
          timestamp: this.primaryContext.timestamp.toISOString(),
        };
      },
      configDir: path.join(PROJECT_ROOT, 'config'),
      cacheDir: this.config.cache?.directory || '.cache',
      getOAuthProvider: () => this.oauthProvider,
      getBackupManager: () => this.backupManager,
      getPrisma: () => this.prisma ?? null,
      searchDocs: async (query: string, options?: { limit?: number; library?: string }) => {
        return this.flexSearchIndex.search(query, options || {});
      },
      getDocsForEmbedding: () => {
        const stats = this.flexSearchIndex.getStats();
        const docs: Array<{ id: string; title: string; library: string; fullText: string }> = [];
        // Iterate all documents in the index
        for (const docId of this.flexSearchIndex.getAllDocumentIds()) {
          const doc = this.flexSearchIndex.getDocument(docId);
          if (doc) {
            docs.push({ id: doc.id, title: doc.title, library: doc.library, fullText: doc.fullText });
          }
        }
        return docs;
      },
      getDocsStats: () => {
        const stats = this.flexSearchIndex.getStats();
        return {
          totalDocuments: stats.totalDocuments,
          totalSections: stats.totalSections,
          libraries: stats.libraries,
        };
      },
      getWorkflowManager: () => this.workflowManager,
      getWorkflowVectorIndex: () => this.workflowVectorIndex,
    };
  }

  /**
   * Run instance discovery with optional progress callbacks. Used by both the
   * legacy `triggerDiscover` (which discards logs) and the streaming admin route.
   */
  private async runDiscoverWithProgress(
    instanceName: string,
    onLog?: (entry: { level: 'info' | 'success' | 'error'; step: string; message: string; data?: any }) => void
  ): Promise<{ projects: string[] }> {
    const log = (entry: { level: 'info' | 'success' | 'error'; step: string; message: string; data?: any }) => {
      if (onLog) onLog(entry);
    };

    log({ level: 'info', step: 'resolve', message: `Looking up instance config for "${instanceName}"…` });

    if (!this.configManager) {
      log({ level: 'error', step: 'resolve', message: 'SkySpark not configured (configManager missing)' });
      throw new Error('SkySpark not configured');
    }

    const instance = this.configManager.getInstance(instanceName)
      || this.configManager.findInstanceByName(instanceName);
    if (!instance) {
      log({ level: 'error', step: 'resolve', message: `Instance not found: ${instanceName}` });
      throw new Error(`Instance not found: ${instanceName}`);
    }

    const url = `${instance.protocol}://${instance.host}:${instance.port}`;
    log({
      level: 'success',
      step: 'resolve',
      message: `Resolved instance "${instance.name}" → ${url}`,
      data: { host: instance.host, port: instance.port, protocol: instance.protocol }
    });

    // TCP-level reachability probe — gives a clear "host unreachable" before auth.
    log({ level: 'info', step: 'tcp', message: `Probing TCP connectivity to ${instance.host}:${instance.port}…` });
    try {
      const net = await import('net');
      await new Promise<void>((resolve, reject) => {
        const sock = net.createConnection({ host: instance.host, port: instance.port });
        const timer = setTimeout(() => {
          sock.destroy();
          reject(new Error(`TCP connect timeout after 5s to ${instance.host}:${instance.port}`));
        }, 5000);
        sock.once('connect', () => {
          clearTimeout(timer);
          sock.destroy();
          resolve();
        });
        sock.once('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });
      log({ level: 'success', step: 'tcp', message: `TCP reachable: ${instance.host}:${instance.port}` });
    } catch (err: any) {
      log({ level: 'error', step: 'tcp', message: `TCP unreachable: ${err.message}` });
      throw new Error(`TCP unreachable: ${err.message}`);
    }

    const credentials = instance.username && instance.password
      ? { username: instance.username, password: instance.password, source: 'instance' }
      : (instance.projects || []).length > 0
      ? {
          username: (instance.projects || [])[0].username || 'su',
          password: (instance.projects || [])[0].password || 'su',
          source: 'first-project'
        }
      : { username: 'su', password: 'su', source: 'default' };

    // Use the built-in `sys` project for discovery — projs() works there on every
    // SkySpark instance, so we don't have to guess a real project name on a freshly
    // added connection. (Pattern from the SRE Sandstar client.)
    const discoveryProject = 'sys';

    log({
      level: 'info',
      step: 'auth',
      message: `Authenticating as "${credentials.username}" against the built-in "sys" project (creds source: ${credentials.source})…`,
      data: { username: credentials.username, project: discoveryProject, credsSource: credentials.source }
    });

    const tempClient = new HaystackSkySparkClient({
      host: instance.host,
      port: instance.port,
      protocol: instance.protocol,
      project: discoveryProject,
      username: credentials.username,
      password: credentials.password
    });

    log({ level: 'info', step: 'discover', message: `Calling projs() at ${url}/api/sys/evalAll…` });

    let projects: any[];
    try {
      projects = await tempClient.getAvailableProjectsWithMetadata();
    } catch (err: any) {
      log({ level: 'error', step: 'discover', message: `Discovery failed: ${err.message}`, data: { url: `${url}/api/${discoveryProject}/evalAll` } });
      throw err;
    }

    if (projects.length === 0) {
      log({
        level: 'error',
        step: 'discover',
        message: `projs() returned 0 projects. Common causes: invalid credentials, project "${discoveryProject}" does not exist on this instance, or the user lacks the projs permission.`
      });
    } else {
      log({
        level: 'success',
        step: 'discover',
        message: `Discovered ${projects.length} project(s): ${projects.map((p: any) => p.name).join(', ')}`,
        data: { count: projects.length }
      });
    }

    return { projects: projects.map((p: any) => p.name) };
  }

  private setupHandlersOnServer(server: Server) {
    // Handle tool listing
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'searchAxonExamples',
          description: 'Search for Axon code examples by keyword, category, or tags',
          inputSchema: {
            type: 'object',
            properties: {
              keyword: {
                type: 'string',
                description: 'Keyword to search for in function names, descriptions, and code',
              },
              category: {
                type: 'string',
                enum: Object.values(AxonCategory),
                description: 'Filter by category',
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by tags',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results to return (default: 10)',
              },
            },
          },
        },
        {
          name: 'searchAxonOperatorExamples',
          description: 'Search for Axon code examples using specific operators (>=, ==, +, etc.)',
          inputSchema: {
            type: 'object',
            properties: {
              operator: {
                type: 'string',
                description: 'Operator to search for (e.g., ">=" , "==", "+")',
              },
              operators: {
                type: 'array',
                items: { type: 'string' },
                description: 'Multiple operators (finds functions using ALL specified operators)',
              },
              category: {
                type: 'string',
                enum: Object.values(AxonCategory),
                description: 'Filter by category',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results to return (default: 10)',
              },
            },
          },
        },
        {
          name: 'searchAxonDocs',
          description: 'Search Axon documentation with AI-powered relevance ranking. Returns structured results with titles, sections, code examples, and context.',
          inputSchema: {
            type: 'object',
            properties: {
              keyword: {
                type: 'string',
                description: 'Search query (e.g., "task", "hisRead", "energy calculation")',
              },
              library: {
                type: 'string',
                description: 'Filter by library name (e.g., "lib-task", "lib-energy", "lib-his")',
              },
              includeContent: {
                type: 'boolean',
                description: 'Include full section content or just summaries (default: true)',
              },
              maxSections: {
                type: 'number',
                description: 'Maximum number of matched sections per document (default: 3)',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of documents to return (default: 10)',
              },
            },
          },
        },
        {
          name: 'listAxonCategories',
          description: 'List all available Axon code categories with counts',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'listWorkflows',
          description: 'List every loaded workflow with a short summary (id, title, description, category, tags, summary). Cheap discovery surface — call this before reading the full workflow:// resource.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'searchWorkflows',
          description: 'Search workflows by keyword/category/tag and (by default when query is set) semantic similarity. Returns the same shape as listWorkflows plus a relevance score.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Free-text query (matched against title/description/tags + semantic search if enabled).' },
              category: { type: 'string', description: 'Restrict to a single workflow category.' },
              tags: { type: 'array', items: { type: 'string' }, description: 'Require all of these tags.' },
              semantic: { type: 'boolean', description: 'Include vector semantic search results (default: true when query is set).' },
              limit: { type: 'number', description: 'Maximum results (default: 10).' },
            },
          },
        },
        {
          name: 'getWorkflowSummary',
          description: 'Return the cached short summary for a single workflow by id. Cheaper than reading the full workflow:// resource.',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Workflow id (matches the .md filename).' },
            },
            required: ['id'],
          },
        },
        {
          name: 'getAxonExample',
          description: 'Get a specific Axon example by function ID or name',
          inputSchema: {
            type: 'object',
            properties: {
              identifier: {
                type: 'string',
                description: 'Function ID or name',
              },
            },
            required: ['identifier'],
          },
        },
        {
          name: 'getAxonPattern',
          description: 'Get a common Axon pattern by ID or search keyword',
          inputSchema: {
            type: 'object',
            properties: {
              patternId: {
                type: 'string',
                description: 'Pattern ID (e.g., "energy-consumption-total")',
              },
              keyword: {
                type: 'string',
                description: 'Search keyword if pattern ID not provided',
              },
            },
          },
        },
        {
          name: 'listAxonPatterns',
          description: 'List all available Axon patterns or filter by category',
          inputSchema: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                description: 'Filter patterns by category (energy, hvac, meter, etc.)',
              },
            },
          },
        },
        {
          name: 'findFunctionUsage',
          description: 'Find all places where a specific function is called in the codebase (does not search for operators like >=, ==, etc.)',
          inputSchema: {
            type: 'object',
            properties: {
              functionName: {
                type: 'string',
                description: 'Name of the function to search for (e.g., "readAll", "commit"). For operators, use searchAxonExamples instead.',
              },
              includeContext: {
                type: 'boolean',
                description: 'Include surrounding code context (default: true)',
              },
              limit: {
                type: 'number',
                description: 'Maximum results to return (default: 20)',
              },
            },
            required: ['functionName'],
          },
        },
        {
          name: 'getFunctionExamples',
          description: 'Get real-world examples of how a function is used',
          inputSchema: {
            type: 'object',
            properties: {
              functionName: {
                type: 'string',
                description: 'Function name',
              },
              maxExamples: {
                type: 'number',
                description: 'Number of examples (default: 5)',
              },
              sortBy: {
                type: 'string',
                enum: ['relevance', 'complexity', 'file'],
                description: 'How to sort examples',
              },
            },
            required: ['functionName'],
          },
        },
        {
          name: 'getFunctionCallGraph',
          description: 'Show what functions call this function and what it calls',
          inputSchema: {
            type: 'object',
            properties: {
              functionName: {
                type: 'string',
                description: 'Function name',
              },
              depth: {
                type: 'number',
                description: 'How many levels deep to traverse (default: 1)',
              },
            },
            required: ['functionName'],
          },
        },
        {
          name: 'getFunctionUsageStats',
          description: 'Get statistics about function usage in the codebase',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'searchAxonRegex',
          description: 'Search Axon code using regular expressions. Returns at most `limit` matches (default 100, max 500). Common patterns can match thousands of lines — always tighten the pattern or paginate via `offset`/`limit` before raising the cap.',
          inputSchema: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                description: 'Regular expression pattern (e.g., "if.*do", "readAll\\(.*\\)")',
              },
              contextLines: {
                type: 'number',
                description: 'Number of context lines before/after match (default: 0 — one line per match). Raise only when you need surrounding context.',
              },
              format: {
                type: 'string',
                enum: ['text', 'json'],
                description: 'Output format (default: text). JSON includes pagination metadata.',
              },
              limit: {
                type: 'number',
                description: 'Maximum matches to return (default: 100, max: 500). The response always reports totalMatches and a truncated flag so you can paginate.',
              },
              offset: {
                type: 'number',
                description: 'Pagination offset (default: 0). Combine with limit to walk large result sets.',
              },
            },
            required: ['pattern'],
          },
        },
        {
          name: 'generateAxonCode',
          description: 'Generate Axon code from templates using natural language intent',
          inputSchema: {
            type: 'object',
            properties: {
              intent: {
                type: 'string',
                description: 'Natural language description of what you want to do',
              },
              templateId: {
                type: 'string',
                description: 'Specific template ID to use (optional)',
              },
              parameters: {
                type: 'object',
                description: 'Template parameters (optional)',
              },
              validate: {
                type: 'boolean',
                description: 'Validate generated code if SkySpark available (default: true)',
              },
            },
            required: ['intent'],
          },
        },
        {
          name: 'validateAxonCode',
          description: 'Validate Axon code with comprehensive analysis',
          inputSchema: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                description: 'Axon code to validate',
              },
              includeSemantics: {
                type: 'boolean',
                description: 'Include semantic validation if SkySpark available (default: true)',
              },
              includeBestPractices: {
                type: 'boolean',
                description: 'Include best practices check (default: true)',
              },
              includePerformance: {
                type: 'boolean',
                description: 'Include performance analysis (default: true)',
              },
              suggestFixes: {
                type: 'boolean',
                description: 'Suggest fixes for errors (default: true)',
              },
            },
            required: ['code'],
          },
        },
        {
          name: 'parseAxonAst',
          description: 'Parse Axon code into an Abstract Syntax Tree (AST) using SkySpark parseAst function. Returns the full AST structure for code analysis, transformation, and validation.',
          inputSchema: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                description: 'Axon code to parse into AST',
              },
            },
            required: ['code'],
          },
        },
        {
          name: 'queryHaystack',
          description: 'Query Haystack data using filters (requires SkySpark)',
          inputSchema: {
            type: 'object',
            properties: {
              filter: {
                type: 'string',
                description: 'Haystack filter expression (e.g., "site", "equip and ahu")',
              },
              select: {
                type: 'array',
                items: { type: 'string' },
                description: 'Columns to select (optional)',
              },
              limit: {
                type: 'number',
                description: 'Maximum rows to return (default: 100)',
              },
              format: {
                type: 'string',
                enum: ['json', 'zinc', 'csv'],
                description: 'Output format (default: json)',
              },
            },
            required: ['filter'],
          },
        },
        {
          name: 'listAxonTemplates',
          description: 'List available Axon code templates',
          inputSchema: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                description: 'Filter by category (energy, hvac, data, fault)',
              },
              search: {
                type: 'string',
                description: 'Search text in template names/descriptions',
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by template tags',
              },
            },
          },
        },
        {
          name: 'executeAxonCode',
          description: `Execute Axon code in SkySpark.

ROUTING: code runs against the ACTIVE project. The response includes 'activeProject' and 'url' so you can verify routing. Call getPrimaryProject first if unsure — wrong-project execution is the most common cause of duplicate or missing records.

The 'project' parameter is a PER-CALL override only. It does NOT change the active/primary project for subsequent calls. Format: "instance/project" (preferred, unambiguous) or just "project" (auto-resolved if unique across instances). Use setPrimaryProject to switch persistently.

For mutations (commit/diff/remove), strongly prefer setPrimaryProject + verify with getPrimaryProject, rather than relying on the override.`,
          inputSchema: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                description: 'Axon code to execute',
              },
              timeout: {
                type: 'number',
                description: 'Execution timeout in seconds (default: 30)',
              },
              project: {
                type: 'string',
                description: 'Per-call project override as "instance/project" or "project". Does NOT change the active project. Omit to use the current primary project.',
              },
            },
            required: ['code'],
          },
        },
        {
          name: 'listSkySparkProjects',
          description: 'List all available SkySpark instances and projects',
          inputSchema: {
            type: 'object',
            properties: {
              instanceName: {
                type: 'string',
                description: 'Filter by specific instance name (optional)',
              },
            },
          },
        },
        {
          name: 'switchSkySparkProject',
          description: `Switch the active SkySpark project context for subsequent operations. Use this when you need to work with a different project.

After switching, all executeAxonCode calls will use the new active project by default (unless project parameter is explicitly specified).

Instance name can be from filename (e.g., "demoInstance" for demoInstance.json) or JSON name field. If projectName omitted, uses default or first project.

Common workflow:
1. Use listSkySparkProjects to see available projects
2. Use switchSkySparkProject to change active project
3. Use executeAxonCode to query data (will use active project)`,
          inputSchema: {
            type: 'object',
            properties: {
              instanceName: {
                type: 'string',
                description: 'Instance name (filename or JSON name field, e.g., "demoInstance", "local")',
              },
              projectName: {
                type: 'string',
                description: 'Project name to switch to (e.g., "demo"). Optional - defaults to defaultProjName or first project',
              },
            },
            required: ['instanceName'],
          },
        },
        {
          name: 'discoverProjectFunctions',
          description: 'Discover all custom Axon functions in the current project',
          inputSchema: {
            type: 'object',
            properties: {
              includeSource: {
                type: 'boolean',
                description: 'Include full function source code (default: false)',
              },
              filter: {
                type: 'string',
                description: 'Filter functions by name pattern (optional)',
              },
            },
          },
        },
        {
          name: 'getProjectSchema',
          description: `Browse project data with pagination. Without entityType returns summary counts. With entityType browses actual records.

Examples:
- Get overview: {}
- Browse sites: {entityType: "site"}
- Browse AHU equips: {entityType: "equip", filter: "ahu"}
- Paginate points: {entityType: "point", offset: 100, limit: 100}`,
          inputSchema: {
            type: 'object',
            properties: {
              entityType: {
                type: 'string',
                description: 'Entity type to browse: site, equip, point, func, rule, etc. If omitted, returns summary counts.',
              },
              offset: {
                type: 'number',
                description: 'Starting index for pagination (default: 0)',
              },
              limit: {
                type: 'number',
                description: 'Max records to return, max 1000 (default: 100)',
              },
              filter: {
                type: 'string',
                description: 'Additional Axon filter expression (e.g., "ahu", "sensor")',
              },
            },
          },
        },
        {
          name: 'discoverInstanceProjects',
          description: 'Discover all projects from a SkySpark instance and update config',
          inputSchema: {
            type: 'object',
            properties: {
              instanceName: {
                type: 'string',
                description: 'Instance name to discover projects from',
              },
              updateConfig: {
                type: 'boolean',
                description: 'Update the instance config file with discovered projects (default: false)',
              },
              buildIndex: {
                type: 'boolean',
                description: 'Build function indexes for discovered projects (default: false)',
              },
            },
            required: ['instanceName'],
          },
        },
        {
          name: 'clearProjectCache',
          description: 'Clear the project function cache files to force a rebuild',
          inputSchema: {
            type: 'object',
            properties: {
              instanceName: {
                type: 'string',
                description: 'Instance name (e.g., "local", "demoInstance")',
              },
              projectName: {
                type: 'string',
                description: 'Project name to clear cache for',
              },
              clearAll: {
                type: 'boolean',
                description: 'Clear all project caches (default: false)',
              },
            },
          },
        },
        {
          name: 'setPrimaryProject',
          description: 'Set the primary active project. All evalAxon and commits will use this project. Called by VSCode extension or Dashboard when user selects a project.',
          inputSchema: {
            type: 'object',
            properties: {
              instanceName: {
                type: 'string',
                description: 'SkySpark instance name',
              },
              projectName: {
                type: 'string',
                description: 'Project name',
              },
            },
            required: ['instanceName', 'projectName'],
          },
        },
        {
          name: 'getPrimaryProject',
          description: `Get the currently active project (instance, project, URL). Returns where executeAxonCode and commitAxonFunction will route by default.

ALWAYS call this before any mutation (commitAxonFunction, commit/diff/remove via executeAxonCode) when you are not certain which project is active. Cheap, idempotent, no side effects.`,
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'commitAxonFunction',
          description: `Upsert an Axon function in the active project. If a func record with this name exists, it is UPDATED in place (same id); otherwise a new record is added. Keeps the last 10 source backups under proj/<instance>/<project>/.backups/<name>/ when overwriting.

Note: Folio enforces unique id, not unique name on func — this tool looks up the existing record by name and updates it. Do NOT pre-delete before calling; that's wasted work and pollutes history.

SAFETY: pass 'project' explicitly ("instance/project" or "project") to assert the expected target. If the explicit value does not match the active project, the call FAILS instead of committing to the wrong place. If 'project' is omitted, the response includes a warning — call getPrimaryProject first to confirm routing.

Response includes 'operation': "added" or "updated".`,
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Function name',
              },
              src: {
                type: 'string',
                description: 'Function source code',
              },
              doc: {
                type: 'string',
                description: 'Documentation string (optional)',
              },
              project: {
                type: 'string',
                description: 'Expected target project as "instance/project" or "project". If set and does not match the active project, the commit fails. Strongly recommended.',
              },
              appName: { type: 'string', description: 'Optional: appName tag to set on the func record (links func to an app).' },
              view: { type: 'string', description: 'Optional: view tag (String) to set on the func record. WARNING: view RECORDS use a trio src schema; commitAxonFunction is for func records only. Setting view here just adds a tag — it does not create a view record.' },
              dis: { type: 'string', description: 'Optional: human-readable display name (dis tag).' },
              icon: { type: 'string', description: 'Optional: icon name tag.' },
              order: { type: 'number', description: 'Optional: numeric sort order tag.' },
              extraTags: {
                type: 'object',
                description: 'Optional: arbitrary additional tags merged into the func record. Booleans → markers, numbers/strings → literals, objects → JSON-encoded strings.',
                additionalProperties: true,
              },
            },
            required: ['name', 'src'],
          },
        },
        // ============================================
        // Graph Analysis Tools
        // ============================================
        {
          name: 'getCallers',
          description: 'Find all functions that call a given function (who calls this?)',
          inputSchema: {
            type: 'object',
            properties: {
              functionName: { type: 'string', description: 'Name of the function to find callers for' },
              depth: { type: 'number', description: 'How many levels of callers to traverse (default: 1)' },
              limit: { type: 'number', description: 'Maximum results (default: 20)' },
            },
            required: ['functionName'],
          },
        },
        {
          name: 'getCallees',
          description: 'Find all functions that a given function calls (what does this call?)',
          inputSchema: {
            type: 'object',
            properties: {
              functionName: { type: 'string', description: 'Name of the function to find callees for' },
              depth: { type: 'number', description: 'How many levels of callees to traverse (default: 1)' },
              limit: { type: 'number', description: 'Maximum results (default: 20)' },
            },
            required: ['functionName'],
          },
        },
        {
          name: 'getCodeImpact',
          description: 'Analyze the blast radius of changing a function - what would be affected?',
          inputSchema: {
            type: 'object',
            properties: {
              functionName: { type: 'string', description: 'Function to analyze impact for' },
              depth: { type: 'number', description: 'How many levels deep to analyze (default: 3)' },
            },
            required: ['functionName'],
          },
        },
        {
          name: 'findCodePath',
          description: 'Find the call path between two functions',
          inputSchema: {
            type: 'object',
            properties: {
              fromFunction: { type: 'string', description: 'Starting function name' },
              toFunction: { type: 'string', description: 'Target function name' },
              maxDepth: { type: 'number', description: 'Maximum path length (default: 10)' },
            },
            required: ['fromFunction', 'toFunction'],
          },
        },
        {
          name: 'semanticCodeSearch',
          description: 'Search for code using natural language via vector embeddings',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Natural language search query' },
              limit: { type: 'number', description: 'Maximum results (default: 10)' },
              minScore: { type: 'number', description: 'Minimum similarity score 0-1 (default: 0.5)' },
              nodeType: { type: 'string', enum: ['function', 'defcomp', 'variable'], description: 'Filter by node type' },
            },
            required: ['query'],
          },
        },
        {
          name: 'findSimilarCode',
          description: 'Find functions similar to a given function using vector similarity',
          inputSchema: {
            type: 'object',
            properties: {
              functionName: { type: 'string', description: 'Function to find similar code for' },
              limit: { type: 'number', description: 'Maximum results (default: 10)' },
              minScore: { type: 'number', description: 'Minimum similarity score 0-1 (default: 0.5)' },
            },
            required: ['functionName'],
          },
        },
        {
          name: 'getGraphMetrics',
          description: 'Get caller/callee counts and centrality metrics for a function',
          inputSchema: {
            type: 'object',
            properties: {
              functionName: { type: 'string', description: 'Function to get metrics for' },
            },
            required: ['functionName'],
          },
        },
        {
          name: 'getMostCalledFunctions',
          description: 'Get the most frequently called functions (critical code paths)',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number', description: 'Maximum results (default: 20)' },
              nodeType: { type: 'string', enum: ['function', 'defcomp', 'variable'], description: 'Filter by node type' },
            },
          },
        },
        {
          name: 'getMostComplexFunctions',
          description: 'Get functions with the highest coupling (most connections)',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number', description: 'Maximum results (default: 20)' },
            },
          },
        },
        {
          name: 'buildProjectGraph',
          description: 'Build or rebuild the code graph index for Axon code',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: { type: 'string', description: 'Project name (default: uses code path)' },
              forceRebuild: { type: 'boolean', description: 'Force full rebuild (default: false)' },
            },
          },
        },
        {
          name: 'buildProjectEmbeddings',
          description: 'Generate vector embeddings for all code nodes in the graph',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: { type: 'string', description: 'Project name' },
              forceRebuild: { type: 'boolean', description: 'Regenerate all embeddings (default: false)' },
            },
          },
        },
        {
          name: 'getGraphStats',
          description: 'Get current graph index status (node/edge/vector counts)',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'detectCycles',
          description: 'Detect circular dependencies in the code graph',
          inputSchema: {
            type: 'object',
            properties: {
              maxLength: { type: 'number', description: 'Maximum cycle length to detect (default: 10)' },
            },
          },
        },
        {
          name: 'queryGraph',
          description: 'Query the code graph using a DSL (e.g., MATCH function WHERE name LIKE "read%" CALLERS)',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Graph query DSL string' },
            },
            required: ['query'],
          },
        },
        {
          name: 'findConstrainedPath',
          description: 'Find a path between functions with edge type constraints',
          inputSchema: {
            type: 'object',
            properties: {
              fromFunction: { type: 'string', description: 'Starting function name' },
              toFunction: { type: 'string', description: 'Target function name' },
              edgeTypes: { type: 'array', items: { type: 'string' }, description: 'Allowed edge types (default: all)' },
              maxDepth: { type: 'number', description: 'Maximum path length (default: 10)' },
            },
            required: ['fromFunction', 'toFunction'],
          },
        },
        {
          name: 'getStronglyConnectedComponents',
          description: 'Find groups of functions that form mutual recursion or tight coupling',
          inputSchema: {
            type: 'object',
            properties: {
              minSize: { type: 'number', description: 'Minimum component size (default: 2)' },
            },
          },
        },
        {
          name: 'getPageRank',
          description: 'Get function importance scores using PageRank algorithm',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number', description: 'Maximum results (default: 20)' },
            },
          },
        },
        {
          name: 'getBetweennessCentrality',
          description: 'Find bridge functions that connect different parts of the codebase',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number', description: 'Maximum results (default: 20)' },
            },
          },
        },
        {
          name: 'exportGraphVisualization',
          description: 'Export the code graph in DOT, JSON (D3/Cytoscape), or other visualization formats',
          inputSchema: {
            type: 'object',
            properties: {
              format: { type: 'string', enum: ['dot', 'json', 'd3', 'cytoscape'], description: 'Output format (default: json)' },
              functionName: { type: 'string', description: 'Center on a specific function (optional)' },
              depth: { type: 'number', description: 'Depth around center function (default: 2)' },
              includeEdgeLabels: { type: 'boolean', description: 'Include edge type labels (default: true)' },
            },
          },
        },
      ],
    }));

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Track the tool call
      const completeTracking = this.usageTracker.trackToolCall(
        name,
        (args as Record<string, unknown>) || {}
      );

      // Wait for initialization to complete before processing tool calls
      // This ensures indexes are ready but doesn't block ping/health checks
      if (!this.initializationComplete && this.initializationPromise) {
        console.error(`[Tool: ${name}] Waiting for initialization to complete...`);
        await this.initializationPromise;
        console.error(`[Tool: ${name}] Initialization complete, processing request`);
      }

      try {
        const result = await (async () => {
        switch (name) {
        case 'searchAxonExamples':
          return await this.searchExamples(args as SearchOptions);

        case 'searchAxonOperatorExamples':
          return await this.searchOperatorExamples(args);
        
        case 'searchAxonDocs':
          return await this.searchDocs(args);
        
        case 'listAxonCategories':
          return await this.listCategories();

        case 'listWorkflows':
          return await this.listWorkflowsTool();

        case 'searchWorkflows':
          return await this.searchWorkflowsTool(args);

        case 'getWorkflowSummary':
          if (!args || !args.id) {
            throw new McpError(ErrorCode.InvalidParams, 'Missing required parameter: id');
          }
          return await this.getWorkflowSummaryTool(args.id as string);

        case 'getAxonExample':
          if (!args || !args.identifier) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Missing required parameter: identifier'
            );
          }
          return await this.getExample(args.identifier as string);
        
        case 'getAxonPattern':
          return await this.getPattern(args);
        
        case 'listAxonPatterns':
          return await this.listPatterns(args);
        
        case 'findFunctionUsage':
          if (!args || !args.functionName) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Missing required parameter: functionName'
            );
          }
          return await this.findFunctionUsage(args as unknown as UsageSearchOptions);
        
        case 'getFunctionExamples':
          if (!args || !args.functionName) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Missing required parameter: functionName'
            );
          }
          return await this.getFunctionExamples(args);
        
        case 'getFunctionCallGraph':
          if (!args || !args.functionName) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Missing required parameter: functionName'
            );
          }
          return await this.getFunctionCallGraph(args as unknown as CallGraphOptions);
        
        case 'getFunctionUsageStats':
          return await this.getFunctionUsageStats();
        
        case 'searchAxonRegex':
          if (!args || !args.pattern) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Missing required parameter: pattern'
            );
          }
          return await this.searchWithRegex(args);
        
        case 'generateAxonCode':
          if (!args || !args.intent) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Missing required parameter: intent'
            );
          }
          return await this.generateCode(args);
        
        case 'validateAxonCode':
          if (!args || !args.code) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Missing required parameter: code'
            );
          }
          return await this.validateCode(args);

        case 'parseAxonAst':
          if (!args || !args.code) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Missing required parameter: code'
            );
          }
          return await this.parseAxonAst(args.code as string);

        case 'queryHaystack':
          if (!args || !args.filter) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Missing required parameter: filter'
            );
          }
          return await this.queryHaystack(args);
        
        case 'listAxonTemplates':
          return await this.listTemplates(args);
        
        case 'executeAxonCode':
          if (!args || !args.code) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Missing required parameter: code'
            );
          }
          return await this.executeCode(args);
        
        case 'listSkySparkProjects':
          return await this.listProjects(args);
        
        case 'switchSkySparkProject':
          if (!args || !args.instanceName) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Missing required parameter: instanceName'
            );
          }
          return await this.switchProject(args);
        
        case 'discoverProjectFunctions':
          return await this.discoverFunctions(args);
        
        case 'getProjectSchema':
          return await this.getProjectSchema(args);
        
        case 'discoverInstanceProjects':
          if (!args || !args.instanceName) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Missing required parameter: instanceName'
            );
          }
          return await this.discoverInstanceProjects(args);
        
        case 'clearProjectCache':
          return await this.clearProjectCache(args);

        case 'setPrimaryProject':
          if (!args || !args.instanceName || !args.projectName) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Missing required parameters: instanceName and projectName'
            );
          }
          return await this.setPrimaryProject(args as { instanceName: string; projectName: string });

        case 'getPrimaryProject':
          return await this.getPrimaryProject();

        case 'commitAxonFunction':
          if (!args || !args.name || !args.src) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Missing required parameters: name and src'
            );
          }
          return await this.commitAxonFunction(args as { name: string; src: string; doc?: string; project?: string; appName?: string; view?: string; dis?: string; icon?: string; order?: number; extraTags?: Record<string, any> });

        // ============================================
        // Graph Analysis Tool Handlers
        // ============================================
        case 'getCallers':
        case 'getCallees':
        case 'getCodeImpact':
        case 'findCodePath':
        case 'getGraphMetrics':
        case 'getMostCalledFunctions':
        case 'getMostComplexFunctions':
        case 'detectCycles':
        case 'queryGraph':
        case 'findConstrainedPath':
        case 'getStronglyConnectedComponents':
        case 'getPageRank':
        case 'getBetweennessCentrality':
        case 'exportGraphVisualization':
        case 'buildProjectGraph':
        case 'buildProjectEmbeddings':
        case 'getGraphStats':
        case 'semanticCodeSearch':
        case 'findSimilarCode':
          return await this.handleGraphTool(name, args || {});

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${name}`
          );
      }
        })();

        // Track successful completion
        completeTracking(true);
        return result;
      } catch (error) {
        // Track the failed tool call
        completeTracking(false, error instanceof Error ? error.message : String(error));
        throw error;
      }
    });

    // Handle resource listing
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      try {
        const workflows = this.workflowManager.getWorkflowList();

        return {
          resources: workflows.map(workflow => ({
            uri: workflow.uri,
            name: workflow.metadata.title,
            description: workflow.metadata.description,
            mimeType: 'text/markdown',
          })),
        };
      } catch (error: any) {
        console.error('Error listing resources:', error);
        return { resources: [] };
      }
    });

    // Handle resource reading
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      try {
        const { uri } = request.params;

        // Extract workflow ID from URI (format: workflow://id)
        const match = uri.match(/^workflow:\/\/(.+)$/);
        if (!match) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Invalid workflow URI: ${uri}`
          );
        }

        const workflowId = match[1];
        const workflow = this.workflowManager.getWorkflow(workflowId);

        if (!workflow) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Workflow not found: ${workflowId}`
          );
        }

        return {
          contents: [
            {
              uri: workflow.uri,
              mimeType: 'text/markdown',
              text: workflow.fullContent,
            },
          ],
        };
      } catch (error: any) {
        console.error('Error reading resource:', error);
        throw error;
      }
    });
  }

  private async searchExamples(options: SearchOptions) {
    const limit = options.limit || 10;

    // Use FlexSearch for better, faster, fuzzy search
    let results: AxonFunction[] = [];
    
    if (options.keyword) {
      // Use FlexSearch with advanced options
      const searchOptions: FunctionSearchOptions = {
        query: options.keyword,
        limit: limit,
        category: options.category,
        tags: options.tags,
        source: 'all', // Search both library and project functions
        fuzzy: true
      };
      
      const flexResults = await this.flexSearchFunctionIndex.search(searchOptions);
      
      // Extract functions from FlexSearch results
      // Exclude documentation examples - only include actual .axon files
      results = flexResults
        .map(r => r.function)
        .filter(f => !f.tags.includes('documentation'));
      
      if (results.length === 0) {
        // Track zero-result search
        this.usageTracker.trackSearch(options.keyword, 'searchAxonExamples', 0);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ count: 0, functions: [] }, null, 2)
          }]
        };
      }
    } else {
      // No keyword - return all functions matching filters
      for (const [id, func] of this.codeIndex.functions) {
        // EXCLUDE documentation examples
        if (func.tags.includes('documentation')) continue;

        let match = true;

        // Category filter
        if (options.category && func.category !== options.category) {
          match = false;
        }

        // Tag filter
        if (options.tags && options.tags.length > 0) {
          const hasAllTags = options.tags.every(tag => 
            func.tags.some(t => t.toLowerCase().includes(tag.toLowerCase()))
          );
          if (!hasAllTags) match = false;
        }

        if (match) {
          results.push(func);
          if (results.length >= limit) break;
        }
      }
    }

    // Also search for matching templates if keyword provided
    let templateSuggestions: any[] = [];
    if (options.keyword) {
      // Ensure templates are loaded
      if (this.templateLoader.getAllTemplates().length === 0) {
        await this.templateLoader.loadTemplates().catch(() => {});
      }
      
      // Find matching templates
      const templates = this.templateLoader.findTemplatesByIntent(options.keyword);
      templateSuggestions = templates.slice(0, 3).map(t => ({
        id: t.id,
        name: t.name,
        category: t.category,
        description: t.description,
        hint: `Use generateAxonCode with templateId: '${t.id}' to generate this code`
      }));
    }
    
    // Track search with result count
    if (options.keyword) {
      this.usageTracker.trackSearch(options.keyword, 'searchAxonExamples', results.length);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            count: results.length,
            functions: results.map(f => ({
              id: f.id,
              name: f.name,
              category: f.category,
              description: f.description,
              parameters: f.parameters,
              filePath: f.filePath,
              preview: f.sourceCode.substring(0, 200) + '...'
            })),
            templateSuggestions: templateSuggestions.length > 0 ? templateSuggestions : undefined
          }, null, 2)
        }
      ]
    };
  }

  private async searchDocs(options: any) {
    // Use FlexSearch if available and keyword is provided
    if (options.keyword && this.flexSearchIndex) {
      try {
        const searchOptions: DocSearchOptions = {
          keyword: options.keyword,
          library: options.library,
          includeContent: options.includeContent !== false,
          maxSections: options.maxSections || 3,
          limit: options.limit || 10
        };
        
        const searchResults = await this.flexSearchIndex.search(options.keyword, searchOptions);
        
        if (searchResults.length === 0) {
          // Track zero-result search
          this.usageTracker.trackSearch(options.keyword, 'searchAxonDocs', 0);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  count: 0,
                  message: 'No documentation found matching your query.',
                  suggestion: 'Try different keywords or use library filter (e.g., "lib-task", "lib-energy")'
                }, null, 2)
              }
            ]
          };
        }
        
        // Format results for both AI and dashboard consumption
        const formattedResults = searchResults.map(result => ({
          document: {
            id: result.document.id,
            title: result.document.title,
            library: result.document.library,
            filePath: result.document.filePath,
            sections: result.document.sections,
            fullText: result.document.fullText,
            url: result.document.url
          },
          score: result.score,
          matchedSections: result.matchedSections.map(section => ({
            id: section.id,
            heading: section.heading,
            level: section.level,
            content: searchOptions.includeContent ? section.content : section.content.substring(0, 200) + '...',
            codeExamples: section.codeExamples
          })),
          highlights: result.highlights || []
        }));
        
        // Track search with result count
        this.usageTracker.trackSearch(options.keyword, 'searchAxonDocs', searchResults.length);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                count: searchResults.length,
                query: options.keyword,
                library: options.library || 'all',
                results: formattedResults
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error('FlexSearch error, falling back to legacy search:', error);
        // Fall through to legacy search
      }
    }
    
    // Legacy search (fallback)
    const results: AxonFunction[] = [];
    const limit = options.limit || 10;
    const keyword = options.keyword?.toLowerCase();
    const sourcefile = options.sourcefile?.toLowerCase();

    // Search only documentation examples
    for (const [id, func] of this.codeIndex.functions) {
      // Only include documentation examples
      if (!func.tags.includes('documentation')) continue;

      let match = true;

      // Keyword search in code and description
      if (keyword) {
        const searchText = (func.sourceCode + ' ' + func.description + ' ' + func.name).toLowerCase();
        if (!searchText.includes(keyword)) {
          match = false;
        }
      }

      // Source file filter
      if (sourcefile && match) {
        const filename = path.basename(func.filePath).toLowerCase();
        if (!filename.includes(sourcefile)) {
          match = false;
        }
      }

      if (match) {
        results.push(func);
        if (results.length >= limit) break;
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            count: results.length,
            documentation_examples: results.map(f => ({
              id: f.id,
              sourceFile: path.basename(f.filePath),
              exampleName: f.name,
              description: f.description,
              code: f.sourceCode,
              tags: f.tags.filter(t => t !== 'documentation' && t !== 'example')
            }))
          }, null, 2)
        }
      ]
    };
  }

  private async searchOperatorExamples(options: any) {
    // Determine which operators to search for
    let operators: string[] = [];
    if (options.operator) {
      operators = [options.operator];
    } else if (options.operators && Array.isArray(options.operators)) {
      operators = options.operators;
    }

    if (operators.length === 0) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'No operator specified',
            message: 'Please provide either "operator" or "operators" parameter',
            supportedOperators: this.operatorIndex.getSupportedOperators()
          }, null, 2)
        }]
      };
    }

    // Search for functions using the operators
    const functionIds = operators.length === 1
      ? this.operatorIndex.searchOperator(operators[0], options.limit || 10)
      : this.operatorIndex.searchMultipleOperators(operators, options.limit || 10);

    // Get function details and apply category filter if needed
    const results: any[] = [];
    
    for (const id of functionIds) {
      const func = this.codeIndex.functions.get(id);
      if (!func) continue;
      
      // Apply category filter
      if (options.category && func.category !== options.category) continue;
      
      // Get operator usages for this function
      const operatorUsages = this.operatorIndex.getFunctionOperators(id)
        .filter(usage => operators.includes(usage.operator));
      
      results.push({
        id: func.id,
        name: func.name,
        category: func.category,
        description: func.description,
        filePath: func.filePath,
        operatorUsages: operatorUsages.map(usage => ({
          operator: usage.operator,
          line: usage.line,
          context: usage.context,
          surroundingCode: usage.surroundingCode
        }))
      });
      
      if (results.length >= (options.limit || 10)) break;
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          searchedOperators: operators,
          count: results.length,
          functions: results
        }, null, 2)
      }]
    };
  }

  private async listCategories() {
    const categoryCounts: Record<string, number> = {};

    for (const [category, functionIds] of this.codeIndex.categories) {
      categoryCounts[category] = functionIds.length;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            categories: categoryCounts,
            total: this.codeIndex.functions.size
          }, null, 2)
        }
      ]
    };
  }

  private async listWorkflowsTool() {
    const summaries = this.workflowManager.getAllSummaries();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          count: summaries.length,
          workflows: summaries.map(s => ({
            id: s.id,
            title: s.title,
            description: s.description,
            category: s.category,
            tags: s.tags,
            uri: s.uri,
            summary: s.summary,
            mode: s.mode,
            generatedAt: s.generatedAt,
          })),
        }, null, 2),
      }],
    };
  }

  private async searchWorkflowsTool(args: any) {
    const query: string | undefined = args?.query;
    const useSemantic: boolean = args?.semantic ?? Boolean(query);
    const limit: number = args?.limit ?? 10;

    let semanticHits: Array<{ id: string; score: number }> | undefined;
    if (useSemantic && query && this.workflowVectorIndex) {
      semanticHits = await this.workflowVectorIndex.semanticSearch(query, {
        limit: Math.max(limit * 2, 10),
        category: args?.category,
      });
    }

    const hits = this.workflowManager.searchSummaries(
      { query, category: args?.category, tags: args?.tags, limit },
      semanticHits,
    );

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          count: hits.length,
          workflows: hits.map(h => ({
            id: h.id,
            title: h.title,
            description: h.description,
            category: h.category,
            tags: h.tags,
            uri: h.uri,
            summary: h.summary,
            mode: h.mode,
            score: h.score,
          })),
        }, null, 2),
      }],
    };
  }

  private async getWorkflowSummaryTool(id: string) {
    const summary = this.workflowManager.getSummary(id);
    if (!summary) {
      throw new McpError(ErrorCode.InvalidRequest, `Workflow not found: ${id}`);
    }
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(summary, null, 2),
      }],
    };
  }

  private async getExample(identifier: string) {
    // Try by ID first
    let func = this.codeIndex.functions.get(identifier);
    
    // If not found, search by name
    if (!func) {
      for (const [id, f] of this.codeIndex.functions) {
        if (f.name.toLowerCase() === identifier.toLowerCase()) {
          func = f;
          break;
        }
      }
    }

    if (!func) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Function not found: ${identifier}`
      );
    }
    
    // Try to enrich with local source code from synced files
    if (func && func.tags.includes('skyspark-function')) {
      // Extract instance and project from tags
      const instanceTag = func.tags.find(t => t !== 'skyspark-function' && !func!.tags.includes(`${t}-function`));
      const projectTag = func.tags.find(t => t !== instanceTag && t !== 'skyspark-function' && !func!.tags.includes(`${t}-function`));
      
      if (instanceTag && projectTag) {
        func = await this.enrichFunctionWithLocalSource(func, instanceTag, projectTag);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            function: {
              id: func.id,
              name: func.name,
              category: func.category,
              description: func.description,
              documentation: func.documentation,
              parameters: func.parameters,
              tags: func.tags,
              filePath: func.filePath,
              sourceCode: func.sourceCode,
              examples: func.examples
            }
          }, null, 2)
        }
      ]
    };
  }

  private async getPattern(args: any) {
    let patterns: import('./types/index.js').AxonPattern[] = [];
    
    if (args.patternId) {
      const pattern = this.patternRepo.getPattern(args.patternId);
      if (pattern) {
        patterns = [pattern];
      }
    } else if (args.keyword) {
      patterns = this.patternRepo.searchPatterns(args.keyword);
    } else {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Either patternId or keyword must be provided'
      );
    }

    if (patterns.length === 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'No patterns found'
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            patterns: patterns.map(p => ({
              id: p.id,
              name: p.name,
              description: p.description,
              code: p.code,
              useCases: p.useCases,
              relatedFunctions: p.relatedFunctions
            }))
          }, null, 2)
        }
      ]
    };
  }

  private async listPatterns(args: any) {
    let patterns: import('./types/index.js').AxonPattern[] = [];
    
    if (args.category) {
      patterns = this.patternRepo.getPatternsByCategory(args.category);
    } else {
      patterns = this.patternRepo.getAllPatterns();
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            count: patterns.length,
            patterns: patterns.map(p => ({
              id: p.id,
              name: p.name,
              description: p.description,
              useCases: p.useCases
            }))
          }, null, 2)
        }
      ]
    };
  }

  private displayCacheSummary() {
    // Count functions by source type
    let axonFileCount = 0;
    let docExampleCount = 0;
    const fileTypes = new Map<string, number>();
    
    for (const [id, func] of this.codeIndex.functions) {
      if (func.tags.includes('documentation')) {
        docExampleCount++;
      } else {
        axonFileCount++;
      }
      
      const ext = path.extname(func.filePath).toLowerCase();
      fileTypes.set(ext, (fileTypes.get(ext) || 0) + 1);
    }
    
    console.error('\n┌────────────────────────────────────────────────────────────┐');
    console.error('│ Axon Code Index Summary                                      │');
    console.error('├─────────────────────────────┬──────────────────────────────┤');
    console.error('│ Feature                             │ Count                          │');
    console.error('├─────────────────────────────┼──────────────────────────────┤');
    console.error(`│ Total Functions                     │ ${String(this.codeIndex.functions.size).padEnd(30)} │`);
    console.error(`│   - From .axon files                │ ${String(axonFileCount).padEnd(30)} │`);
    console.error(`│   - From HTML docs                  │ ${String(docExampleCount).padEnd(30)} │`);
    console.error('├─────────────────────────────┼──────────────────────────────┤');
    console.error(`│ Categories                          │ ${String(this.codeIndex.categories.size).padEnd(30)} │`);
    console.error(`│ Unique Tags                         │ ${String(this.codeIndex.tags.size).padEnd(30)} │`);
    console.error('├─────────────────────────────┼──────────────────────────────┤');
    
    // Show file type breakdown
    console.error('│ Source File Types:                  │                                │');
    for (const [ext, count] of fileTypes) {
      console.error(`│   - ${ext.padEnd(30)} │ ${String(count).padEnd(30)} │`);
    }
    console.error('├─────────────────────────────┼──────────────────────────────┤');
    
    // Show category breakdown
    const sortedCategories = Array.from(this.codeIndex.categories.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 5);
    
    console.error('│ Top Categories:                     │                                │');
    for (const [category, funcs] of sortedCategories) {
      const catName = category.charAt(0).toUpperCase() + category.slice(1);
      console.error(`│   - ${catName.padEnd(30)} │ ${String(funcs.length).padEnd(30)} │`);
    }
    
    console.error('└─────────────────────────────┴──────────────────────────────┘\n');
  }

  private displaySearchIndexSummary(stats: any) {
    // Count indexed items by source
    let axonIndexed = 0;
    let docIndexed = 0;
    
    for (const [id, func] of this.codeIndex.functions) {
      if (func.tags.includes('documentation')) {
        docIndexed++;
      } else {
        axonIndexed++;
      }
    }
    
    console.error('\n┌────────────────────────────────────────────────────────────┐');
    console.error('│ Search Index Summary                                         │');
    console.error('├─────────────────────────────┬──────────────────────────────┤');
    console.error(`│ Unique Search Tokens                │ ${String(stats.tokenCount).padEnd(30)} │`);
    console.error(`│ Avg Functions per Token             │ ${stats.avgFunctionsPerToken.toFixed(2).padEnd(30)} │`);
    console.error('├─────────────────────────────┼──────────────────────────────┤');
    console.error('│ Indexed Content:                    │                                │');
    console.error(`│   - Axon code functions             │ ${String(axonIndexed).padEnd(30)} │`);
    console.error(`│   - Documentation examples          │ ${String(docIndexed).padEnd(30)} │`);
    console.error('├─────────────────────────────┼──────────────────────────────┤');
    console.error('│ Search Tools Available:             │                                │');
    console.error('│   - searchAxonExamples              │ Code files only                │');
    console.error('│   - searchAxonDocs                  │ HTML docs only                 │');
    console.error('└─────────────────────────────┴──────────────────────────────┘\n');
  }

  private displayFunctionUsageSummary(stats: FunctionUsageStats) {
    console.error('\n┌────────────────────────────────────────────────────────────┐');
    console.error('│ Function Usage Index Summary                                 │');
    console.error('├─────────────────────────────┬──────────────────────────────┤');
    console.error(`│ Total Function Calls Found          │ ${String(stats.totalUsages).padEnd(30)} │`);
    console.error(`│ Unique Functions Called             │ ${String(stats.totalFunctions).padEnd(30)} │`);
    console.error(`│ Built-in Functions                  │ ${String(stats.builtinFunctions.size).padEnd(30)} │`);
    console.error(`│ User-defined Functions              │ ${String(stats.userDefinedFunctions.size).padEnd(30)} │`);
    console.error(`│ Unused Functions                    │ ${String(stats.unusedFunctions.length).padEnd(30)} │`);
    console.error('├─────────────────────────────┼──────────────────────────────┤');
    
    // Show most used functions
    console.error('│ Most Used Functions:                │                                │');
    for (let i = 0; i < Math.min(5, stats.mostUsedFunctions.length); i++) {
      const func = stats.mostUsedFunctions[i];
      console.error(`│   ${String(i + 1)}. ${func.name.padEnd(27)} │ ${String(func.count + ' calls').padEnd(30)} │`);
    }
    
    console.error('└─────────────────────────────┴──────────────────────────────┘\n');
  }

  private displayOperatorIndexSummary() {
    const stats = this.operatorIndex.getStats();
    
    console.error('\n┌────────────────────────────────────────────────────────────┐');
    console.error('│ Operator Index Summary                                       │');
    console.error('├─────────────────────────────┬──────────────────────────────┤');
    console.error(`│ Total Operators Indexed             │ ${String(stats.totalOperators).padEnd(30)} │`);
    console.error(`│ Total Operator Usages               │ ${String(stats.totalUsages).padEnd(30)} │`);
    console.error('├─────────────────────────────┼──────────────────────────────┤');
    
    // Show most used operators
    console.error('│ Most Used Operators:                │                                │');
    for (let i = 0; i < Math.min(10, stats.mostUsedOperators.length); i++) {
      const op = stats.mostUsedOperators[i];
      console.error(`│   ${op.operator.padEnd(31)} │ ${String(op.count + ' usages').padEnd(30)} │`);
    }
    
    console.error('└─────────────────────────────┴──────────────────────────────┘\n');
  }

  private async buildFunctionUsageIndex() {
    const usageCacheValid = this.config.cache?.enabled && await this.functionUsageIndexer.loadCache();
    if (!usageCacheValid) {
      await this.functionUsageIndexer.buildIndex(this.codeIndex);
      if (this.config.cache?.enabled) {
        await this.functionUsageIndexer.saveCache();
      }
    }
    const usageStats = this.functionUsageIndexer.getStats();
    this.displayFunctionUsageSummary(usageStats);
  }

  /**
   * Build FlexSearch documentation index
   */
  private async buildFlexSearchIndex() {
    if (!this.config.docsPath) {
      console.error('⚠️  No docsPath configured, skipping FlexSearch documentation index');
      return;
    }

    // Check for cached index
    if (this.config.cache?.enabled) {
      const cacheValid = await this.cacheManager.isFlexSearchIndexValid(
        this.config.docsPath,
        this.config.cache?.maxAge || 86400000
      );

      if (cacheValid) {
        await this.loadFlexSearchIndexFromCache();
        return;
      }
    }

    console.error('\n📚 Building FlexSearch documentation index...');
    const startTime = Date.now();

    // Get all HTML files from docs path
    const htmlFiles = await this.scanner.scanForAxonFiles();
    const docFiles = htmlFiles.filter(f => 
      f.fileType === 'docs' && 
      f.codePath.endsWith('.html') &&
      path.basename(f.codePath) !== 'AxonUsage.html' // Skip AxonUsage, it's handled differently
    );

    if (docFiles.length === 0) {
      console.error('⚠️  No HTML documentation files found');
      return;
    }

    // Parse HTML documents with progress tracking
    const documents: HtmlDocument[] = [];
    let parsed = 0;
    let failed = 0;

    for (const fileInfo of docFiles) {
      try {
        const content = await this.scanner.readFileContents(fileInfo.codePath);
        const doc = this.htmlDocParser.parseDocument(content, fileInfo.codePath);
        
        if (doc) {
          documents.push(doc);
          parsed++;
          
          // Progress tracking every 100 files
          if (parsed % 100 === 0) {
            console.error(`   Parsed ${parsed}/${docFiles.length} HTML files...`);
          }
        }
      } catch (error) {
        failed++;
        if (failed <= 5) { // Only log first 5 errors
          console.error(`   ⚠️  Failed to parse ${path.basename(fileInfo.codePath)}`);
        }
      }
    }

    console.error(`   ✓ Parsed ${parsed} documents (${failed} failed)`);

    // Build FlexSearch index
    await this.flexSearchIndex.buildIndex(documents);

    // Display stats
    const stats = this.flexSearchIndex.getStats();
    this.displayFlexSearchIndexSummary(stats);

    // Save to cache
    if (this.config.cache?.enabled) {
      try {
        const indexData = this.flexSearchIndex.export();
        await this.cacheManager.saveFlexSearchIndex(indexData, this.config.docsPath);
      } catch (error) {
        console.error('⚠️  Failed to save FlexSearch index to cache:', error);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`   ✓ FlexSearch index built in ${duration}s`);
  }

  /**
   * Load FlexSearch index from cache
   */
  private async loadFlexSearchIndexFromCache() {
    if (!this.config.docsPath) return;

    try {
      const indexData = await this.cacheManager.loadFlexSearchIndex(this.config.docsPath);
      
      if (indexData) {
        await this.flexSearchIndex.import(indexData);
        const stats = this.flexSearchIndex.getStats();
        this.displayFlexSearchIndexSummary(stats);
        console.error('   ✓ FlexSearch documentation index loaded from cache');
      }
    } catch (error) {
      console.error('⚠️  Failed to load FlexSearch index from cache:', error);
    }
  }

  /**
   * Display FlexSearch index summary
   */
  private displayFlexSearchIndexSummary(stats: any) {
    console.error('\n┌────────────────────────────────────────────────────────────┐');
    console.error('│ FlexSearch Documentation Index                               │');
    console.error('├─────────────────────────────┬──────────────────────────────┤');
    console.error(`│ Total Documents Indexed             │ ${String(stats.totalDocuments).padEnd(30)} │`);
    console.error(`│ Total Sections                      │ ${String(stats.totalSections).padEnd(30)} │`);
    console.error(`│ Index Size (approx)                 │ ${(stats.indexSize / 1024 / 1024).toFixed(2).padEnd(27)} MB │`);
    console.error('├─────────────────────────────┼──────────────────────────────┤');
    console.error('│ Indexed Libraries:                  │                                │');
    
    for (let i = 0; i < Math.min(10, stats.libraries.length); i++) {
      const lib = stats.libraries[i];
      console.error(`│   - ${lib.padEnd(30)} │ ${' '.padEnd(30)} │`);
    }
    
    if (stats.libraries.length > 10) {
      console.error(`│   ... and ${stats.libraries.length - 10} more libraries`);
    }
    
    console.error('└─────────────────────────────┴──────────────────────────────┘\n');
  }

  private displayInitializationComplete(elapsedTime: string) {
    console.error('\n╔══════════════════════════════════════════════════════════════╗');
    console.error('║ ✓ Axon MCP Server Ready                                       ║');
    console.error(`║   Initialized in ${elapsedTime}s${' '.repeat(46 - elapsedTime.length)}║`);
    console.error('╚══════════════════════════════════════════════════════════════╝\n');
  }

  private async findFunctionUsage(options: UsageSearchOptions) {
    // Check if the search term is an operator
    const operators = new Set(['==', '!=', '>', '<', '>=', '<=', '+', '-', '*', '/', '%', '&&', '||', '!', '?:', '=>', '<<', '>>', '&', '|', '^', '~']);
    if (operators.has(options.functionName)) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Operator search not supported',
              message: `"${options.functionName}" is an operator, not a function. The findFunctionUsage tool only searches for function calls.`,
              suggestion: 'To search for operator usage, use the searchAxonExamples tool with the operator as a keyword.',
              example: {
                tool: 'searchAxonExamples',
                arguments: {
                  keyword: options.functionName,
                  limit: options.limit || 20
                }
              }
            }, null, 2)
          }
        ]
      };
    }
    
    const usages = this.functionUsageIndexer.findUsages(
      options.functionName, 
      options.limit || 20
    );
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            function: options.functionName,
            count: usages.length,
            usages: usages.map(u => ({
              file: u.file,
              line: u.line,
              context: u.context,
              arguments: u.arguments,
              isMethodCall: u.isMethodCall,
              receiver: u.receiver,
              functionType: u.functionType,
              surroundingContext: options.includeContext !== false ? u.surroundingLines : undefined
            }))
          }, null, 2)
        }
      ]
    };
  }

  private async getFunctionExamples(args: any) {
    const examples = this.functionUsageIndexer.getFunctionExamples(
      args.functionName,
      args.maxExamples || 5
    );
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            function: args.functionName,
            examples: examples.map(ex => ({
              file: ex.file,
              line: ex.line,
              complexity: ex.complexity,
              description: ex.description,
              code: ex.code
            }))
          }, null, 2)
        }
      ]
    };
  }

  private async getFunctionCallGraph(options: CallGraphOptions) {
    const graph = this.functionUsageIndexer.getCallGraph(
      options.functionName,
      options.depth || 1
    );
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            function: options.functionName,
            calledBy: graph.calledBy,
            calls: graph.calls,
            depth: options.depth || 1,
            graph: graph.graph ? Array.from(graph.graph.entries()).map(([k, v]) => [k, Array.from(v)]) : undefined
          }, null, 2)
        }
      ]
    };
  }

  private async getFunctionUsageStats() {
    const stats = this.functionUsageIndexer.getStats();
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            totalFunctions: stats.totalFunctions,
            totalUsages: stats.totalUsages,
            unusedFunctions: stats.unusedFunctions,
            mostUsedFunctions: stats.mostUsedFunctions,
            builtinFunctionsFound: stats.builtinFunctions.size,
            userDefinedFunctionsFound: stats.userDefinedFunctions.size
          }, null, 2)
        }
      ]
    };
  }

  private async searchWithRegex(args: any) {
    const { pattern, contextLines = 0, format = 'text', limit = 100, offset = 0 } = args;

    // Search using regex
    const allResults = this.regexSearcher.searchWithRegex(
      pattern,
      this.codeIndex.functions,
      contextLines
    );

    // Bound the response so common patterns don't blow the MCP token budget.
    // Callers can paginate with limit + offset; the response surfaces a truncation hint.
    const totalMatches = Array.isArray(allResults) ? allResults.length : 0;
    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const paged = Array.isArray(allResults)
      ? allResults.slice(safeOffset, safeOffset + safeLimit)
      : allResults;
    const truncated = totalMatches > safeOffset + safeLimit;

    if (format === 'json') {
      const body = this.regexSearcher.formatAsJson(paged, this.config.codePath);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              results: body,
              totalMatches,
              returned: Array.isArray(paged) ? paged.length : undefined,
              offset: safeOffset,
              limit: safeLimit,
              truncated,
              hint: truncated ? `Showing ${safeOffset + 1}-${safeOffset + safeLimit} of ${totalMatches}. Pass offset/limit to paginate, or tighten the pattern.` : undefined,
            }, null, 2)
          }
        ]
      };
    } else {
      const body = this.regexSearcher.formatResults(paged, this.config.codePath);
      const footer = truncated
        ? `\n\n--- Truncated: showed ${Array.isArray(paged) ? paged.length : 0} of ${totalMatches} matches (offset=${safeOffset}, limit=${safeLimit}). Re-run with a higher offset or a tighter pattern. ---`
        : '';
      return {
        content: [
          {
            type: 'text',
            text: body + footer
          }
        ]
      };
    }
  }
  
  private async generateCode(args: any) {
    const { intent, templateId, parameters, validate = true } = args;
    
    // Ensure templates are loaded
    if (this.templateLoader.getAllTemplates().length === 0) {
      await this.templateLoader.loadTemplates();
    }
    
    let template;
    let params = parameters || {};
    
    if (templateId) {
      // Use specific template
      template = this.templateLoader.getTemplate(templateId);
      if (!template) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Template '${templateId}' not found`
        );
      }
    } else {
      // Find template by intent
      const matches = this.templateLoader.findTemplatesByIntent(intent);
      if (matches.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'No matching templates found',
                suggestion: 'Try listing templates with listAxonTemplates to see available options'
              }, null, 2)
            }
          ]
        };
      }
      template = matches[0];
      
      // Extract parameters from intent if not provided
      if (Object.keys(params).length === 0) {
        params = this.axonGenerator.extractParametersFromIntent(template, intent);
      }
    }
    
    // Suggest missing parameters
    const suggestions = this.axonGenerator.suggestParameters(template, params);
    const mergedParams = { ...suggestions, ...params };
    
    try {
      // Generate code
      const result = this.axonGenerator.generate(template, mergedParams);
      
      // Validate if requested and SkySpark is available
      let validation = null;
      if (validate && this.skysparkClient) {
        validation = await this.skysparkClient.validateAxon(result.code);
      }
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              template: {
                id: template.id,
                name: template.name,
                description: template.description
              },
              parameters: mergedParams,
              generatedCode: result.code,
              warnings: result.warnings,
              alternatives: result.alternatives,
              validation: validation
            }, null, 2)
          }
        ]
      };
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Code generation failed: ${error.message}`
      );
    }
  }
  
  private async validateCode(args: any) {
    const {
      code,
      includeSemantics = true,
      includeBestPractices = true,
      includePerformance = true,
      suggestFixes = true
    } = args;
    
    const result: any = {};
    
    // Syntax validation (if SkySpark available)
    if (this.skysparkClient) {
      result.syntax = await this.skysparkClient.validateAxon(code);
      
      // If syntax is invalid and fixes requested
      if (!result.syntax.valid && suggestFixes) {
        result.fixes = this.errorRecovery.recover(code, result.syntax);
      }
      
      // Semantic validation
      if (includeSemantics && this.semanticValidator) {
        result.semantic = await this.semanticValidator.validate(code);
      }
    } else {
      result.syntax = { 
        valid: null, 
        error: 'SkySpark connection not available for syntax validation' 
      };
    }
    
    // Best practices check
    if (includeBestPractices) {
      result.bestPractices = this.bestPracticesChecker.check(code);
    }
    
    // Performance analysis
    if (includePerformance) {
      result.performance = this.performanceAnalyzer.analyze(code);
    }
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }

  /**
   * Parse Axon code into AST using SkySpark's parseAst function
   */
  private async parseAxonAst(code: string) {
    if (!this.skysparkClient) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'SkySpark connection not available. Configure SKYSPARK_* environment variables.'
      );
    }

    try {
      const ast = await this.skysparkClient.parseAst(code);

      if (!ast) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'Failed to parse code. parseAst may not be available on this SkySpark version.',
                code: code.substring(0, 200) + (code.length > 200 ? '...' : '')
              }, null, 2)
            }
          ]
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              ast: ast
            }, null, 2)
          }
        ]
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error.message,
              code: code.substring(0, 200) + (code.length > 200 ? '...' : '')
            }, null, 2)
          }
        ]
      };
    }
  }

  private async queryHaystack(args: any) {
    const { filter, select, limit = 100, format = 'json' } = args;

    if (!this.skysparkClient) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'SkySpark connection not available. Configure SKYSPARK_* environment variables.'
      );
    }

    try {
      // Ensure we're using the primary project for queries
      if (this.primaryContext) {
        const currentConfig = this.skysparkClient.getCurrentConfig();
        if (currentConfig.instance !== this.primaryContext.instance ||
            currentConfig.project !== this.primaryContext.project) {
          this.skysparkClient.switchTo(this.primaryContext.instance, this.primaryContext.project);
        }
      }

      // Execute query
      const grid = await this.skysparkClient.readAll(filter);
      
      // Apply limit
      let rows = Array.from(grid).slice(0, limit);
      
      // Format output
      let output;
      switch (format) {
        case 'zinc':
          output = grid.toZinc();
          break;
          
        case 'csv':
          // Simple CSV formatting
          const headers = Array.from(grid.getColumns()).map(col => (col as any).name || col.toString());
          const csvRows = rows.filter(row => row !== undefined).map(row => {
            return headers.map(h => {
              const val = row!.get(h);
              return val ? val.toString() : '';
            }).join(',');
          });
          output = [headers.join(','), ...csvRows].join('\n');
          break;
          
        default: { // json
          const cfg = this.skysparkClient.getCurrentConfig();
          output = {
            activeProject: `${cfg.instance}/${cfg.project}`,
            url: cfg.url,
            meta: {
              ver: '3.0',
              cols: Array.from(grid.getColumns()).map(col => ({ name: (col as any).name || col.toString() }))
            },
            rows: rows.filter(row => row !== undefined).map(row => {
              const obj: any = {};
              for (const col of grid.getColumns()) {
                const colName = (col as any).name || col.toString();
                const val = row!.get(colName);
                obj[colName] = val ? val.toJSON() : null;
              }
              return obj;
            })
          };
        }
      }
      
      return {
        content: [
          {
            type: 'text',
            text: typeof output === 'string' ? output : JSON.stringify(output, null, 2)
          }
        ]
      };
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Query failed: ${error.message}`
      );
    }
  }
  
  private async listTemplates(args: any) {
    const { category, search, tags } = args;
    
    // Ensure templates are loaded
    if (this.templateLoader.getAllTemplates().length === 0) {
      await this.templateLoader.loadTemplates();
    }
    
    // Search templates
    const templates = this.templateLoader.searchTemplates({
      category,
      tags,
      text: search
    });
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            count: templates.length,
            templates: templates.map(t => ({
              id: t.id,
              name: t.name,
              category: t.category,
              description: t.description,
              tags: t.tags,
              parameters: t.parameters.map(p => ({
                name: p.name,
                type: p.type,
                description: p.description,
                required: p.required !== false,
                default: p.default,
                examples: p.examples
              })),
              examples: t.examples?.map(e => ({
                name: e.name,
                params: e.params
              }))
            }))
          }, null, 2)
        }
      ]
    };
  }
  
  private async executeCode(args: any) {
    const { code, timeout = 30, project: projectOverride } = args;

    if (!this.skysparkClient) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'SkySpark connection not available. Configure SKYSPARK_* environment variables.'
      );
    }

    // Resolve the target project: explicit override first, then primaryContext, else current client state.
    let targetInstance: string | undefined;
    let targetProject: string | undefined;

    if (projectOverride) {
      if (typeof projectOverride !== 'string') {
        throw new McpError(ErrorCode.InvalidParams, 'project must be a string ("instance/project" or "project")');
      }
      if (projectOverride.includes('/')) {
        const [inst, proj] = projectOverride.split('/', 2);
        targetInstance = inst;
        targetProject = proj;
      } else if (this.configManager) {
        const matches = this.configManager.getAllProjects().filter(p => p.project === projectOverride);
        if (matches.length === 0) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Project not found: '${projectOverride}'. Use listSkySparkProjects to see available projects.`
          );
        }
        if (matches.length > 1) {
          const opts = matches.map(m => `${m.instance}/${m.project}`).join(', ');
          throw new McpError(
            ErrorCode.InvalidParams,
            `Ambiguous project '${projectOverride}'. Specify as instance/project. Matches: ${opts}`
          );
        }
        targetInstance = matches[0].instance;
        targetProject = matches[0].project;
      } else {
        targetProject = projectOverride;
      }
    } else if (this.primaryContext) {
      targetInstance = this.primaryContext.instance;
      targetProject = this.primaryContext.project;
    }

    const originalConfig = this.skysparkClient.getCurrentConfig();
    const needSwitch = !!(targetInstance && targetProject &&
      (originalConfig.instance !== targetInstance || originalConfig.project !== targetProject));

    try {
      if (needSwitch) {
        this.skysparkClient.switchTo(targetInstance!, targetProject!);
      }

      const activeConfig = this.skysparkClient.getCurrentConfig();
      const result = await this.skysparkClient.evalAxon(code);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              activeProject: `${activeConfig.instance}/${activeConfig.project}`,
              url: activeConfig.url,
              overrideUsed: !!projectOverride,
              note: projectOverride
                ? 'Per-call override; primary project unchanged. Use setPrimaryProject to switch persistently.'
                : undefined,
              result: result.toJSON(),
              zinc: result.toZinc(),
              type: result.constructor.name
            }, null, 2)
          }
        ]
      };
    } catch (error: any) {
      const validation = {
        valid: false,
        error: error.message,
        category: 'runtime_error' as any
      };
      const recovery = this.errorRecovery.recover(code, validation);
      const activeConfig = this.skysparkClient.getCurrentConfig();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              activeProject: `${activeConfig.instance}/${activeConfig.project}`,
              url: activeConfig.url,
              error: error.message,
              recovery: recovery
            }, null, 2)
          }
        ]
      };
    } finally {
      // Restore the original context so per-call overrides don't leak.
      if (needSwitch && originalConfig.instance && originalConfig.project) {
        try {
          this.skysparkClient.switchTo(originalConfig.instance, originalConfig.project);
        } catch (e: any) {
          console.error(`⚠️ Failed to restore project after override: ${e.message}`);
        }
      }
    }
  }
  
  private async listProjects(args: any) {
    if (!this.skysparkClient || !this.configManager) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'SkySpark not configured. Create config/local-skyspark.json or set SKYSPARK_HOST.'
      );
    }

    const { instanceName } = args;
    const projects = this.configManager.getAllProjects();
    const instances = this.configManager.getInstances();

    // Use primaryContext for current active project (the user's chosen project)
    const current = this.primaryContext
      ? { instance: this.primaryContext.instance, project: this.primaryContext.project, url: this.primaryContext.url }
      : this.skysparkClient.getCurrentConfig();

    // Filter by instance if requested
    const filtered = instanceName
      ? projects.filter(p => p.instance === instanceName)
      : projects;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            current: {
              instance: current.instance,
              project: current.project,
              url: current.url
            },
            instances: instances.map(inst => ({
              name: inst.name,
              host: inst.host,
              port: inst.port,
              protocol: inst.protocol,
              projectCount: (inst.projects || []).length
            })),
            projects: filtered.map(p => ({
              instance: p.instance,
              project: p.project,
              description: p.description
            })),
            total: filtered.length
          }, null, 2)
        }
      ]
    };
  }
  
  private async switchProject(args: any) {
    if (!this.skysparkClient || !this.configManager) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'SkySpark not configured. Create config files in the config/ directory.'
      );
    }

    const { instanceName, projectName } = args;

    try {
      // Use flexible instance lookup (supports both JSON name and filename)
      const activeConfig = this.configManager.switchToInstance(instanceName, projectName);
      this.skysparkClient.switchTo(activeConfig.instance.name, activeConfig.project.name);
      const config = this.skysparkClient.getCurrentConfig();

      // Clear in-memory cache for the new project (keeps file caches)
      this.cacheManager.clearProjectCache(activeConfig.instance.name, activeConfig.project.name);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              active: {
                instance: config.instance,
                project: config.project,
                url: config.url
              },
              message: `Switched to ${config.instance}/${config.project}`,
              note: projectName
                ? 'In-memory cache cleared for this project'
                : `Used default project. In-memory cache cleared.`
            }, null, 2)
          }
        ]
      };
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Failed to switch project: ${error.message}`
      );
    }
  }
  
  private async discoverFunctions(args: any) {
    if (!this.skysparkClient) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'SkySpark connection not available'
      );
    }
    
    const { includeSource = false, filter } = args;
    
    try {
      const grid = await this.skysparkClient.getProjectFunctions();
      const functions = [];
      
      for (const row of grid) {
        if (!row) continue;
        
        const name = row.get('name')?.toString();
        if (!name) continue;
        
        // Apply filter if provided
        if (filter && !name.includes(filter)) continue;
        
        const func: any = {
          name,
          signature: row.get('sig')?.toString(),
          doc: row.get('doc')?.toString(),
          module: row.get('mod')?.toString()
        };
        
        // Include source if requested
        if (includeSource) {
          func.source = await this.skysparkClient.getFunctionSource(name);
        }
        
        functions.push(func);
      }
      
      const config = this.skysparkClient.getCurrentConfig();
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              project: config.project,
              instance: config.instance,
              count: functions.length,
              functions
            }, null, 2)
          }
        ]
      };
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Failed to discover functions: ${error.message}`
      );
    }
  }
  
  private async getProjectSchema(args: any) {
    if (!this.skysparkClient) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'SkySpark connection not available'
      );
    }

    const { entityType, offset = 0, limit = 100, filter } = args;
    const config = this.skysparkClient.getCurrentConfig();

    try {
      // If no entityType specified, return summary counts
      if (!entityType) {
        const schema = await this.skysparkClient.getProjectSchema();
        const summary = Array.from(schema)
          .filter(row => row !== undefined)
          .map(row => ({
            type: row!.get('type')?.toString() || 'unknown',
            count: parseInt(row!.get('count')?.toString() || '0')
          }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              project: config.project,
              instance: config.instance,
              summary,
              total: summary.reduce((sum, e) => sum + e.count, 0),
              hint: "Use entityType param to browse records. Example: {entityType: 'site', limit: 10}"
            }, null, 2)
          }]
        };
      }

      // Browse specific entity type with pagination
      const result = await this.skysparkClient.queryEntities(entityType, {
        offset,
        limit: Math.min(limit, 1000),
        filter
      });

      // Convert HDict records to plain objects
      const records = result.records.map(row => {
        const obj: Record<string, unknown> = {};
        for (const key of row.keys) {
          const val = row.get(key);
          if (val !== undefined && val !== null) {
            obj[key] = val.toString();
          }
        }
        return obj;
      });

      const hasMore = offset + records.length < result.total;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            project: config.project,
            instance: config.instance,
            entityType,
            filter: filter || null,
            total: result.total,
            offset,
            limit,
            count: records.length,
            hasMore,
            nextOffset: hasMore ? offset + limit : null,
            records
          }, null, 2)
        }]
      };
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Failed to get project schema: ${error.message}`
      );
    }
  }
  
  private async discoverInstanceProjects(args: any) {
    if (!this.skysparkClient || !this.configManager) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'SkySpark not configured'
      );
    }
    
    const { instanceName, updateConfig = false, buildIndex = false } = args;
    
    try {
      // Get instance configuration
      const instance = this.configManager.getInstance(instanceName);
      if (!instance) {
        throw new Error(`Instance not found: ${instanceName}`);
      }
      
      // Temporarily switch to the instance to discover projects
      const currentConfig = this.skysparkClient.getCurrentConfig();
      const originalInstance = currentConfig.instance;
      const originalProject = currentConfig.project;
      
      // Get credentials (instance-level or first project)
      const credentials = instance.username && instance.password
        ? { username: instance.username, password: instance.password }
        : (instance.projects || []).length > 0
        ? { username: (instance.projects || [])[0].username || 'su', password: (instance.projects || [])[0].password || 'su' }
        : { username: 'su', password: 'su' };
      
      // Use defaultProjName, first project, or 'demo' for discovery
      const discoveryProject = instance.defaultProjName || ((instance.projects || []).length > 0 ? (instance.projects || [])[0].name : 'demo');
      
      // Create temporary client to connect to instance
      const tempClient = new HaystackSkySparkClient({
        host: instance.host,
        port: instance.port,
        protocol: instance.protocol,
        project: discoveryProject,
        username: credentials.username,
        password: credentials.password
      });
      
      // Discover projects with metadata
      const discoveredProjects = await tempClient.getAvailableProjectsWithMetadata();
      
      if (discoveredProjects.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                instance: instanceName,
                message: 'No projects discovered. May require admin privileges or instance might be unreachable.',
                hint: 'Ensure user has "su" or admin access, or manually add projects to config file.'
              }, null, 2)
            }
          ]
        };
      }
      
      // Create project list with descriptions based on metadata
      const newProjects = discoveredProjects.map(proj => {
        let description = proj.dis || proj.name;
        if (proj.type === 'remote') {
          description += ` (ArcBeam remote${proj.route ? ': ' + proj.route : ''})`;
        } else {
          description += ' (local)';
        }
        if (proj.routeStatus && proj.routeStatus !== 'ok') {
          description += ` [${proj.routeStatus}]`;
        }
        
        return {
          name: proj.name,
          description
          // Note: No username/password here - will use instance-level credentials
        };
      });
      
      // Update config if requested
      if (updateConfig) {
        this.configManager.updateInstanceProjects(instanceName, newProjects);
      }
      
      // Optionally build indexes for discovered projects
      const indexedProjects: string[] = [];
      const indexErrors: string[] = [];
      
      if (buildIndex) {
        console.error(`\n📚 Building indexes for discovered projects...`);
        for (const project of newProjects) {
          try {
            await this.buildProjectIndex(instanceName, project.name);
            indexedProjects.push(project.name);
          } catch (err: any) {
            const errorMsg = `Failed to index ${instanceName}/${project.name}: ${err.message}`;
            indexErrors.push(errorMsg);
            console.error(`  ⚠️  ${errorMsg}`);
          }
        }
      }
      
      // Restore original project
      if (originalInstance && originalProject) {
        this.skysparkClient.switchTo(originalInstance, originalProject);
      }
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              instance: instanceName,
              discovered: discoveredProjects.length,
              projects: newProjects,
              updated: updateConfig,
              indexed: buildIndex ? indexedProjects.length : undefined,
              indexedProjects: buildIndex ? indexedProjects : undefined,
              indexErrors: indexErrors.length > 0 ? indexErrors : undefined,
              message: updateConfig 
                ? `Config file updated with ${discoveredProjects.length} projects`
                : `Found ${discoveredProjects.length} projects (not saved yet)`,
              hint: updateConfig 
                ? (buildIndex ? 'Projects discovered, config updated, and indexes built' : 'You can now switch to any of these projects')
                : 'Set updateConfig=true to save these projects to the config file'
            }, null, 2)
          }
        ]
      };
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Failed to discover projects: ${error.message}`
      );
    }
  }
  
  private async clearProjectCache(args: any) {
    const { instanceName, projectName, clearAll = false } = args;
    
    try {
      if (clearAll) {
        // Clear all caches
        await this.cacheManager.clearCache();
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'All project caches cleared successfully',
                note: 'Function indexes will be rebuilt on next MCP server restart or project switch'
              }, null, 2)
            }
          ]
        };
      } else if (instanceName && projectName) {
        // Clear specific project cache
        await this.cacheManager.clearCache(instanceName, projectName);
        
        // Also clear in-memory cache for this project
        this.cacheManager.clearProjectCache(instanceName, projectName);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                instance: instanceName,
                project: projectName,
                message: `Cache cleared for ${instanceName}/${projectName}`,
                note: 'Function index will be rebuilt on next access to this project'
              }, null, 2)
            }
          ]
        };
      } else {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Either clearAll=true or both instanceName and projectName must be provided'
        );
      }
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Failed to clear cache: ${error.message}`
      );
    }
  }

  /**
   * Set the primary active project. All evalAxon and commits will use this project.
   */
  private async setPrimaryProject(args: { instanceName: string; projectName: string }) {
    const { instanceName, projectName } = args;

    if (!this.skysparkClient || !this.configManager) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'SkySpark client not initialized. Configure a SkySpark instance first.'
      );
    }

    try {
      // Switch the shared client to the new project
      this.skysparkClient.switchTo(instanceName, projectName);
      const config = this.skysparkClient.getCurrentConfig();

      // Update primary context with URL
      this.primaryContext = {
        instance: instanceName,
        project: projectName,
        url: config.url,
        setBy: 'api',
        timestamp: new Date(),
      };

      // Persist to config file so it survives restarts
      savePrimaryProject(instanceName, projectName);

      console.error(`🎯 Primary project set: ${instanceName}/${projectName}`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              instance: instanceName,
              project: projectName,
              url: config.url,
              timestamp: this.primaryContext.timestamp.toISOString(),
              message: `Primary project set to ${instanceName}/${projectName}. All evalAxon and commits will use this project. (Persisted to config)`,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Failed to set primary project: ${error.message}`
      );
    }
  }

  /**
   * Get the current primary project context.
   */
  private async getPrimaryProject() {
    if (!this.primaryContext) {
      // If no explicit primary context, use current client config
      if (this.skysparkClient) {
        const config = this.skysparkClient.getCurrentConfig();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                instance: config.instance,
                project: config.project,
                url: config.url,
                setBy: 'startup',
                timestamp: null,
                message: 'Using default project from startup configuration',
              }, null, 2),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'No primary project set',
              message: 'Use setPrimaryProject to set the active project, or configure a default in config files.',
            }, null, 2),
          },
        ],
      };
    }

    const config = this.skysparkClient?.getCurrentConfig();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            instance: this.primaryContext.instance,
            project: this.primaryContext.project,
            url: config?.url,
            setBy: this.primaryContext.setBy,
            timestamp: this.primaryContext.timestamp.toISOString(),
            message: `Primary project is ${this.primaryContext.instance}/${this.primaryContext.project}`,
          }, null, 2),
        },
      ],
    };
  }

  /**
   * Commit an Axon function to the primary project with backup support.
   */
  private async commitAxonFunction(args: { name: string; src: string; doc?: string; project?: string; appName?: string; view?: string; dis?: string; icon?: string; order?: number; extraTags?: Record<string, any> }) {
    const { name, src, doc, project: expectedProject, appName, view, dis, icon, order, extraTags } = args;

    if (!this.skysparkClient || !this.configManager) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'SkySpark client not initialized. Configure a SkySpark instance first.'
      );
    }

    const config = this.skysparkClient.getCurrentConfig();
    if (!config.instance || !config.project) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'No active project. Use setPrimaryProject to set one first.'
      );
    }

    // Assert expected project matches active routing — prevents wrong-project commits.
    let projectMismatchWarning: string | undefined;
    if (expectedProject) {
      let expectedInstance: string | undefined;
      let expectedProj: string;
      if (expectedProject.includes('/')) {
        [expectedInstance, expectedProj] = expectedProject.split('/', 2) as [string, string];
      } else {
        expectedProj = expectedProject;
      }
      const activeQualified = `${config.instance}/${config.project}`;
      const mismatch =
        (expectedInstance && expectedInstance !== config.instance) ||
        expectedProj !== config.project;
      if (mismatch) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Project mismatch: expected '${expectedProject}' but active project is '${activeQualified}'. ` +
          `Refusing to commit to the wrong project. Call setPrimaryProject('${expectedInstance ?? config.instance}', '${expectedProj}') and retry, ` +
          `or call getPrimaryProject to confirm intended routing.`
        );
      }
    } else {
      projectMismatchWarning =
        `'project' parameter not provided. Committing to '${config.instance}/${config.project}' inferred from active context. ` +
        `Pass 'project' explicitly on future calls to guard against wrong-project commits.`;
      console.error(`⚠️ commitAxonFunction without explicit project; using ${config.instance}/${config.project}`);
    }
    const backupDir = path.join('proj', config.instance, config.project, '.backups', name);

    try {
      // 1. Check if function exists and create backup
      let backedUp = false;
      let backupPath: string | null = null;

      try {
        const existing = await this.skysparkClient.getFunctionSource(name);
        if (existing) {
          // Create backup directory
          await fs.promises.mkdir(backupDir, { recursive: true });

          // Save backup with timestamp
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          backupPath = path.join(backupDir, `backup-${timestamp}.axon`);
          await fs.promises.writeFile(backupPath, existing);
          backedUp = true;

          // Keep only last 10 backups
          const backups = await fs.promises.readdir(backupDir);
          const sorted = backups.filter(f => f.startsWith('backup-')).sort().reverse();
          for (const old of sorted.slice(10)) {
            await fs.promises.unlink(path.join(backupDir, old));
          }
          console.error(`📦 Backed up existing ${name} to ${backupPath}`);
        }
      } catch (backupError: any) {
        // Function might not exist, which is fine
        console.error(`ℹ️ No existing function ${name} to backup: ${backupError.message}`);
      }

      // 2. Upsert the function: update existing record by name, or add new.
      // Folio enforces unique id, NOT unique name on func — without this lookup
      // every commit would create a duplicate. The whole upsert runs server-side
      // in one eval so add/update is atomic from our perspective.
      const escAxon = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
      const escapedSrc = escAxon(src);
      const escapedDoc = escAxon(doc || '');

      // Build the extra-tag fragment shared by add and update paths.
      // Stringify everything as Axon literals. Markers map to bare tag names.
      const extraPairs: string[] = [];
      const auxTags: Record<string, any> = { ...(extraTags || {}) };
      if (appName !== undefined) auxTags.appName = appName;
      if (view !== undefined) auxTags.view = view;
      if (dis !== undefined) auxTags.dis = dis;
      if (icon !== undefined) auxTags.icon = icon;
      if (order !== undefined) auxTags.order = order;
      for (const [k, v] of Object.entries(auxTags)) {
        if (v === null || v === undefined) continue;
        if (v === true) { extraPairs.push(k); continue; }                // marker
        if (typeof v === 'number' || typeof v === 'boolean') { extraPairs.push(`${k}:${v}`); continue; }
        if (typeof v === 'string') { extraPairs.push(`${k}:"${escAxon(v)}"`); continue; }
        // Fallback: JSON-stringify then escape as a string literal.
        extraPairs.push(`${k}:"${escAxon(JSON.stringify(v))}"`);
      }
      const extraFrag = extraPairs.length ? ', ' + extraPairs.join(', ') : '';

      // Axon `if` is an inline expression, not a block — `if (cond) thenExpr else elseExpr` (no `end`).
      // The previous block-style `if ... end` produced `Expected ), not end [eval:10]` on every call.
      const commitCode = `do
  existing: read(func and name=="${name}", false)
  if (existing == null) commit(diff(null, {func, name:"${name}", src:"${escapedSrc}", doc:"${escapedDoc}"${extraFrag}}, {add})) else commit(diff(existing, {src:"${escapedSrc}", doc:"${escapedDoc}"${extraFrag}}))
end`;
      await this.skysparkClient.evalAxon(commitCode);
      const operation = backedUp ? 'updated' : 'added';

      console.error(`✅ ${operation === 'added' ? 'Added' : 'Updated'} function ${name} in ${config.instance}/${config.project}`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              name,
              operation,
              instance: config.instance,
              project: config.project,
              backedUp,
              backupPath: backupPath,
              warning: projectMismatchWarning,
              message: `Function ${name} ${operation} in ${config.instance}/${config.project}`,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Failed to commit function: ${error.message}`
      );
    }
  }

  /**
   * Handle all graph analysis and semantic search tool calls
   */
  private async handleGraphTool(toolName: string, args: Record<string, unknown>) {
    try {
      // Initialize prisma on demand if not yet available (e.g., stdio mode)
      if (!this.prisma) {
        const { PrismaClient } = await import('./generated/prisma/client.js');
        const { PrismaBetterSqlite3 } = await import('@prisma/adapter-better-sqlite3');
        const cacheDir = path.join(PROJECT_ROOT, this.config.cache?.directory || '.cache');
        if (!fs.existsSync(cacheDir)) {
          fs.mkdirSync(cacheDir, { recursive: true });
        }
        const dbPath = path.join(cacheDir, 'usage.db');
        const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
        this.prisma = new PrismaClient({ adapter });
        await this.prisma.$connect();
      }

      // Lazy import and use singleton handler
      const { getGraphToolHandler } = await import('./graph/graphToolHandlers.js');
      const handler = getGraphToolHandler({ prisma: this.prisma });
      return await handler.handle(toolName, args);
    } catch (error: any) {
      // Provide helpful error if graph system is not initialized
      if (error.code === 'MODULE_NOT_FOUND' || error.message?.includes('Cannot find module')) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: 'Graph system not available',
              message: 'The graph analysis tools require building the code graph first. Run buildProjectGraph to initialize.',
              tool: toolName,
            }, null, 2),
          }],
        };
      }
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Graph tool error (${toolName}): ${error.message}`
      );
    }
  }

  private initializeSkySparkClient() {
    try {
      // Load config from axonMcpServer-config.json FIRST (before configPath logic)
      const appConfig = loadConfig();

      // Initialize ConfigManager with absolute path
      // Priority: Config file > ENV > Script location (PROJECT_ROOT) > Current working directory
      let configPath: string;

      // First check if config file specifies configDir
      if (appConfig.skyspark?.configDir) {
        // If configDir is relative, resolve it against the project root (not cwd)
        configPath = path.isAbsolute(appConfig.skyspark.configDir)
          ? appConfig.skyspark.configDir
          : path.resolve(PROJECT_ROOT, appConfig.skyspark.configDir);
      } else if (process.env.SKYSPARK_CONFIG_DIR) {
        configPath = path.resolve(process.env.SKYSPARK_CONFIG_DIR);
      } else {
        // Use project root resolved from script location (via config.ts)
        configPath = path.join(PROJECT_ROOT, 'config');
      }
      
      console.error(`📁 Config directory: ${configPath}`);
      console.error(`   Project root: ${PROJECT_ROOT}`);
      console.error(`   Working directory: ${process.cwd()}`);
      
      this.configManager = new SkySparkConfigManager(configPath);
      // Auto-pick up on-disk config edits (added/edited/removed connections)
      // without requiring a restart or a manual Refresh click.
      this.configManager.startWatching();

      // Push tools/list_changed so MCP clients (Claude Code v2.1+) re-discover
      // without a /mcp reconnect. SDK throws "Not connected" if no transport
      // is bound yet — swallow it so the watcher stays healthy.
      this.configManager.onReload(() => {
        this.server.sendToolListChanged().catch((err: any) => {
          console.error(`⚠️  sendToolListChanged failed: ${err?.message || err}`);
        });
      });

      // Check for settings from config file (fallback to env for backwards compat)
      this.autoDiscoverProjects = appConfig.skyspark?.autoDiscover ?? process.env.SKYSPARK_AUTO_DISCOVER === 'true';
      this.autoSyncFunctions = appConfig.skyspark?.autoSyncFunctions ?? process.env.SKYSPARK_AUTO_SYNC_FUNCTIONS === 'true';
      this.syncConcurrency = appConfig.skyspark?.syncConcurrency ?? parseInt(process.env.SKYSPARK_SYNC_CONCURRENCY || '10');
      this.functionVersioning = appConfig.skyspark?.functionVersioning ?? process.env.SKYSPARK_FUNCTION_VERSIONING === 'true';
      this.maxVersions = appConfig.skyspark?.maxVersions ?? parseInt(process.env.SKYSPARK_MAX_VERSIONS || '4');
      console.error(`🔍 Auto-discovery: ${this.autoDiscoverProjects ? 'ENABLED' : 'DISABLED'}`);
      console.error(`📥 Auto-sync functions: ${this.autoSyncFunctions ? 'ENABLED' : 'DISABLED'}`);
      if (this.autoDiscoverProjects) {
        console.error(`   Will discover projects from all instances on initialization`);
      }
      if (this.autoSyncFunctions) {
        console.error(`   Will sync function source files to proj/<instance>/<project>/func/`);
      }
      
      // Create clients with ConfigManager for multi-instance support
      // skysparkClient: for MCP queries (always uses primaryContext)
      // syncClient: for sync operations (can switch between projects independently)
      this.skysparkClient = new HaystackSkySparkClient(this.configManager);
      this.syncClient = new HaystackSkySparkClient(this.configManager);

      // Initialize semantic validator
      this.semanticValidator = new SemanticValidator(this.skysparkClient);

      // Check if there's a persisted primary project in config
      const savedPrimaryProject = appConfig.primaryProject;
      let activeInstance: string;
      let activeProject: string;

      if (savedPrimaryProject?.instance && savedPrimaryProject?.project) {
        // Use the persisted primary project
        activeInstance = savedPrimaryProject.instance;
        activeProject = savedPrimaryProject.project;
        this.skysparkClient.switchTo(activeInstance, activeProject);
        console.error(`📌 Restored primary project from config: ${activeInstance}/${activeProject}`);
      } else {
        // Fall back to default from skysparkClient
        const config = this.skysparkClient.getCurrentConfig();
        activeInstance = config.instance || '';
        activeProject = config.project || '';
      }

      const currentConfig = this.skysparkClient.getCurrentConfig();

      // Set initial primaryContext (the user's active project for queries/commits)
      this.primaryContext = {
        instance: activeInstance,
        project: activeProject,
        url: currentConfig.url || '',
        setBy: 'startup',
        timestamp: new Date(),
      };

      console.error('✅ SkySpark client initialized');
      console.error(`   Active: ${activeInstance} / ${activeProject}`);
      
      // Show instance count (detailed summary after auto-discovery)
      const instances = this.configManager.getInstances();
      const autoDiscoverMsg = this.autoDiscoverProjects ? ' (auto-discovery will run...)' : '';
      console.error(`   Instances: ${instances.length}${autoDiscoverMsg}`);
      
      // Don't show project counts yet if auto-discovery is enabled
      if (!this.autoDiscoverProjects) {
        for (const inst of instances) {
          console.error(`     - ${inst.name}: ${(inst.projects || []).length} projects`);
        }
      }
    } catch (error) {
      console.error('⚠️  Failed to initialize SkySpark client:', error);
      console.error('ℹ️  Create config/local-skyspark.json or set SKYSPARK_HOST environment variable.');
    }
  }

  /**
   * Background worker for project discovery and indexing
   */
  private async runBackgroundDiscovery(): Promise<void> {
    const bgStartTime = Date.now();
    
    try {
      console.error('[Background] 🚀 Starting project discovery and indexing...');
      const result = await this.discoverAndIndexAllProjects();
      
      const bgElapsed = ((Date.now() - bgStartTime) / 1000).toFixed(2);
      
      // Display comprehensive summary
      console.error('\n' + '='.repeat(60));
      console.error('📊 BACKGROUND INDEXING COMPLETE');
      console.error('='.repeat(60));
      console.error(`✅ Successfully indexed ${result.instances} instance(s), ${result.projects} project(s)`);
      console.error(`⏱️  Background indexing took ${bgElapsed}s`);
      console.error(`📊 Total functions available: ${this.getTotalFunctionCount()}`);
      
      // Show details for each instance
      const instances = this.configManager!.getInstances();
      for (const instance of instances) {
        const projects = this.configManager!.getAllProjects()
          .filter(p => p.instance === instance.name);
        console.error(`\n📦 ${instance.name} (${instance.host}:${instance.port}) - ${(instance.projects || []).length} projects`);
        for (const project of projects) {
          const cache = this.cacheManager.getProjectData<AxonCodeIndex>('index', instance.name, project.project);
          const funcCount = cache?.functions?.size || 0;
          console.error(`   └─ ${project.project}: ${funcCount} functions`);
        }
      }
      
      // Show any errors
      if (result.errors.length > 0) {
        console.error('\n⚠️  Warnings:');
        result.errors.forEach(err => console.error(`   - ${err}`));
      }
      
      console.error('='.repeat(60) + '\n');
    } catch (error: any) {
      console.error(`[Background] ❌ Auto-discovery failed: ${error.message}`);
    }
  }

  /**
   * Get total function count from cache manager
   */
  private getTotalFunctionCount(): number {
    let total = 0;
    const instances = this.configManager?.getInstances() || [];
    for (const instance of instances) {
      const projects = this.configManager?.getAllProjects().filter(p => p.instance === instance.name) || [];
      for (const project of projects) {
        const cache = this.cacheManager.getProjectData<AxonCodeIndex>('index', instance.name, project.project);
        total += cache?.functions?.size || 0;
      }
    }
    return total;
  }

  /**
   * Discover and index all projects from all configured instances
   */
  private async discoverAndIndexAllProjects(): Promise<{instances: number, projects: number, errors: string[]}> {
    const errors: string[] = [];
    let totalInstances = 0;
    let totalProjects = 0;
    let completedProjects = 0;
    
    if (!this.configManager || !this.skysparkClient) {
      throw new Error('SkySpark client not initialized');
    }
    
    // Get all configured instances
    const instances = this.configManager.getInstances();
    
    // Calculate total project count for progress
    const totalExpectedProjects = instances.reduce((sum, inst) => sum + (inst.projects || []).length, 0);
    
    for (const instance of instances) {
      try {
        console.error(`\n[Background] 🔍 Discovering projects for instance: ${instance.name}...`);
        totalInstances++;
        
        // Get credentials for this instance
        const credentials = instance.username && instance.password
          ? { username: instance.username, password: instance.password }
          : (instance.projects || []).length > 0 && (instance.projects || [])[0].username
          ? { username: (instance.projects || [])[0].username!, password: (instance.projects || [])[0].password! }
          : { username: 'su', password: 'su' };
        
        // Use defaultProjName, first project, or 'demo' to connect for discovery
        const discoveryProject = instance.defaultProjName || (instance.projects || [])[0]?.name || 'demo';
        if (instance.defaultProjName) {
          console.error(`[Background]   🎯 Using discovery project: ${instance.defaultProjName}`);
        }
        
        // Create temporary client for discovery
        const tempClient = new HaystackSkySparkClient({
          host: instance.host,
          port: instance.port,
          protocol: instance.protocol,
          project: discoveryProject,
          username: credentials.username,
          password: credentials.password
        });
        
        // Discover available projects
        const discoveredProjects = await tempClient.getAvailableProjects();
        
        if (discoveredProjects.length > 0) {
          // Update config with discovered projects, preserving credentials
          const newProjects = discoveredProjects.map(name => {
            // Check if project already exists in config
            const existingProject = (instance.projects || []).find(p => p.name === name);
            
            if (existingProject) {
              // Preserve existing project configuration
              return existingProject;
            } else {
              // New project - inherit credentials from instance level
              const project: any = {
                name,
                description: `Auto-discovered from ${instance.name}`
              };
              
              // Inherit instance-level credentials if available
              if (instance.username) {
                project.username = instance.username;
              }
              if (instance.password) {
                project.password = instance.password;
              }
              
              return project;
            }
          });
          
          this.configManager!.updateInstanceProjects(instance.name, newProjects);
          console.error(`[Background]   ✅ Discovered ${discoveredProjects.length} projects`);
          
          // Index each project with progress updates
          for (let i = 0; i < discoveredProjects.length; i++) {
            const projectName = discoveredProjects[i];
            try {
              // Track which project is currently syncing
              this.syncInProgress = {
                instance: instance.name,
                project: projectName,
                startedAt: new Date(),
              };

              const projectStartTime = Date.now();
              await this.buildProjectIndex(instance.name, projectName);
              const projectElapsed = ((Date.now() - projectStartTime) / 1000).toFixed(2);

              totalProjects++;
              completedProjects++;

              // Get function count for this project
              const cache = this.cacheManager.getProjectData<AxonCodeIndex>('index', instance.name, projectName);
              const funcCount = cache?.functions?.size || 0;

              // Calculate progress percentage
              const progress = totalExpectedProjects > 0
                ? ((completedProjects / totalExpectedProjects) * 100).toFixed(1)
                : '0.0';

              // Display progress update
              console.error(`[Background]   ✓ ${instance.name}/${projectName}: ${funcCount} functions (${completedProjects}/${totalExpectedProjects} = ${progress}%) [${projectElapsed}s]`);
            } catch (err: any) {
              completedProjects++;
              errors.push(`Failed to index ${instance.name}/${projectName}: ${err.message}`);
              console.error(`[Background]   ⚠️  Failed to index ${projectName}: ${err.message}`);
            } finally {
              // Clear sync in progress after each project
              this.syncInProgress = null;
            }
          }
        } else {
          console.error(`[Background]   ⚠️  No projects discovered (may require admin privileges)`);
          errors.push(`No projects discovered for ${instance.name}`);
        }
      } catch (err: any) {
        errors.push(`Failed to discover projects for ${instance.name}: ${err.message}`);
        console.error(`[Background]   ❌ Error: ${err.message}`);
      }
    }
    
    return { instances: totalInstances, projects: totalProjects, errors };
  }

  /**
   * Enrich function with source code from local file if available
   */
  private async enrichFunctionWithLocalSource(func: AxonFunction, instanceName: string, projectName: string): Promise<AxonFunction> {
    // Skip if source already exists
    if (func.sourceCode && func.sourceCode.length > 0) {
      return func;
    }
    
    // Try to load from local file
    const source = await this.functionSyncManager.getFunctionSource(instanceName, projectName, func.name);
    
    if (source) {
      return {
        ...func,
        sourceCode: source
      };
    }
    
    return func;
  }
  
  /**
   * Build index for a specific instance/project combination
   */
  private async buildProjectIndex(instanceName: string, projectName: string): Promise<void> {
    if (!this.skysparkClient || !this.configManager) {
      throw new Error('SkySpark client not initialized');
    }

    // Removed individual project logging - now done at completion in discoverAndIndexAllProjects
    
    // Check if we have a cached index for this project
    const cacheKey = `${instanceName}|${projectName}`;
    const cached = await this.cacheManager.loadCache(instanceName, projectName);
    
    if (cached && !this.autoSyncFunctions) {
      // Only use cache if auto-sync is disabled
      const funcCount = cached.functions.size;
      console.error(`    ✓ Using cached index (${funcCount} functions)`);
      // Store in memory cache
      this.cacheManager.setProjectData('index', cached, instanceName, projectName);
      return;
    } else if (cached && this.autoSyncFunctions) {
      // Use cached index for now, but will sync functions below
      const funcCount = cached.functions.size;
      console.error(`    ✓ Using cached index (${funcCount} functions)`);
      this.cacheManager.setProjectData('index', cached, instanceName, projectName);
      
      // Run function sync after using cache
      try {
        const concurrency = this.syncConcurrency;
        const funcDir = this.functionSyncManager.getProjectFunctionDir(instanceName, projectName);
        const metadataPath = this.functionSyncManager.getSyncMetadataPath(instanceName, projectName);
        
        let needsFullSync = false;
        try {
          await import('fs/promises').then(fs => fs.access(funcDir));
          await import('fs/promises').then(fs => fs.access(metadataPath));
          console.error(`    🔄 Smart syncing functions (checking for updates)...`);
        } catch {
          needsFullSync = true;
          console.error(`    📥 Initializing function sync (first time)...`);
        }
        
        // Use syncClient for sync operations
        this.syncClient!.switchTo(instanceName, projectName);
        const result = await this.functionSyncManager.syncFunctions(
          this.syncClient!,
          instanceName,
          projectName,
          {
            force: needsFullSync,
            silent: false,
            checkModTime: !needsFullSync,
            concurrency
          }
        );
        
        if (result.downloaded === 0 && result.updated === 0 && result.deleted === 0) {
          console.error(`    ✓ All functions up to date (${result.skipped} files)`);
        }
      } catch (err: any) {
        console.error(`    ⚠️  Failed to sync functions: ${err.message}`);
      }
      return;
    }
    
    // Try to build index from synced files first (if available)
    const funcDir = this.functionSyncManager.getProjectFunctionDir(instanceName, projectName);
    const fs = await import('fs/promises');
    
    let builtFromSynced = false;
    let functions: Map<string, AxonFunction> = new Map();
    let categories: Map<AxonCategory, string[]> = new Map();
    let tags: Map<string, string[]> = new Map();
    
    try {
      await fs.access(funcDir);
      
      // We have synced files - use them instead of querying SkySpark
      console.error(`    📁 Building index from synced files...`);
      
      const files = await fs.readdir(funcDir);
      const axonFiles = files.filter(f => f.endsWith('.axon'));
      
      for (const file of axonFiles) {
        const funcName = file.replace('.axon', '');
        const axonPath = path.join(funcDir, file);
        const trioPath = axonPath.replace('.axon', '.trio');
        
        try {
          // Read .axon file
          const content = await fs.readFile(axonPath, 'utf-8');
          
          // Read .trio file for metadata
          let trioMeta: any = {};
          try {
            const trioContent = await fs.readFile(trioPath, 'utf-8');
            trioMeta = this.parseTrioMetadata(trioContent);
          } catch {
            // No trio file, skip metadata
          }
          
          // Parse with enhanced indexer
          const parsedFuncs = await this.enhancedIndexer.parseAxonFile(axonPath, content);
          
          if (parsedFuncs.length > 0) {
            const func = parsedFuncs[0]; // Should be one function per file
            
            // Enhance with trio metadata
            if (trioMeta.dis) func.description = trioMeta.dis;
            if (trioMeta.help) func.documentation = trioMeta.help;
            if (trioMeta.doc && !func.documentation) func.documentation = trioMeta.doc;
            
            // Add tags from trio
            if (trioMeta.sparkRule) {
              func.tags.push('sparkRule', 'rule');
              func.category = AxonCategory.SPARK_ANALYSIS;
            }
            if (trioMeta.kpiRule) {
              func.tags.push('kpiRule', 'rule', 'kpi');
            }
            if (trioMeta.curRule) {
              func.tags.push('curRule', 'rule');
            }
            if (trioMeta.ruleOn) {
              func.tags.push('rule');
            }
            
            // Add instance/project tags
            func.tags.push(instanceName, projectName, 'skyspark-function');
            
            // Add to index
            functions.set(func.id, func);
            
            // Index by category
            if (!categories.has(func.category)) {
              categories.set(func.category, []);
            }
            categories.get(func.category)!.push(func.id);
            
            // Index by tags
            for (const tag of func.tags) {
              if (!tags.has(tag)) {
                tags.set(tag, []);
              }
              tags.get(tag)!.push(func.id);
            }
          }
        } catch (err: any) {
          console.error(`      ⚠️  Failed to parse ${funcName}: ${err.message}`);
        }
      }
      
      const index: AxonCodeIndex = {
        functions,
        categories,
        tags,
        lastUpdated: new Date()
      };
      
      // Cache the index
      await this.cacheManager.saveCache(index, `${instanceName}/${projectName}`, instanceName, projectName);
      this.cacheManager.setProjectData('index', index, instanceName, projectName);
      
      console.error(`    ✓ Indexed ${functions.size} functions from synced files`);
      builtFromSynced = true;
      
    } catch {
      // No synced files available - fall back to querying SkySpark
      console.error(`    📡 No synced files found, querying SkySpark...`);
    }
    
    // If we couldn't build from synced files, query SkySpark
    if (!builtFromSynced) {
      // Switch syncClient to the project (keeps skysparkClient on primaryContext)
      this.syncClient!.switchTo(instanceName, projectName);

      // Build new index from project functions
      const grid = await this.syncClient!.getProjectFunctions();
      
      // Reset maps for fresh data
      functions = new Map();
      categories = new Map();
      tags = new Map();
      
      for (const row of grid) {
        if (!row) continue;
        
        const name = row.get('name')?.toString();
        if (!name) continue;
        
        const sig = row.get('sig')?.toString() || '';
        const doc = row.get('doc')?.toString() || '';
        const module = row.get('mod')?.toString() || projectName;
        
        // Create function entry
        const funcId = crypto.createHash('md5').update(`${instanceName}:${projectName}:${name}`).digest('hex');
        const func: AxonFunction = {
          id: funcId,
          name,
          description: doc,
          documentation: sig,
          category: AxonCategory.UNCATEGORIZED,
          tags: [projectName, instanceName, 'skyspark-function', module],
          filePath: `${instanceName}/${projectName}`,
          sourceCode: '', // Don't fetch source during initial indexing
          lineNumber: 0
        };
        
        functions.set(funcId, func);
        
        // Index by category
        if (!categories.has(func.category)) {
          categories.set(func.category, []);
        }
        categories.get(func.category)!.push(funcId);
        
        // Index by tags
        for (const tag of func.tags) {
          if (!tags.has(tag)) {
            tags.set(tag, []);
          }
          tags.get(tag)!.push(funcId);
        }
      }
      
      const index: AxonCodeIndex = {
        functions,
        categories,
        tags,
        lastUpdated: new Date()
      };
      
      // Cache the index
      await this.cacheManager.saveCache(index, `${instanceName}/${projectName}`, instanceName, projectName);
      this.cacheManager.setProjectData('index', index, instanceName, projectName);
      
      console.error(`    ✓ Indexed ${functions.size} functions from SkySpark`);
    }
    
    const index: AxonCodeIndex = {
      functions,
      categories,
      tags,
      lastUpdated: new Date()
    };
    
    // Cache the index
    await this.cacheManager.saveCache(index, `${instanceName}/${projectName}`, instanceName, projectName);
    this.cacheManager.setProjectData('index', index, instanceName, projectName);
    
    console.error(`    ✓ Indexed ${functions.size} functions`);
    
    // Sync function source files if enabled
    if (this.autoSyncFunctions) {
      try {
        // Get concurrency from config
        const concurrency = this.syncConcurrency;
        
        // Check if folder and .sync-metadata.json exist
        const funcDir = this.functionSyncManager.getProjectFunctionDir(instanceName, projectName);
        const metadataPath = this.functionSyncManager.getSyncMetadataPath(instanceName, projectName);
        
        let needsFullSync = false;
        try {
          await import('fs/promises').then(fs => fs.access(funcDir));
          await import('fs/promises').then(fs => fs.access(metadataPath));
          // Both exist - use smart sync with mod time checking
          console.error(`    🔄 Smart syncing functions (checking for updates)...`);
        } catch {
          // Folder or metadata doesn't exist - needs full sync
          needsFullSync = true;
          console.error(`    📥 Initializing function sync (first time)...`);
        }
        
        // Always run sync on boot:
        // - If folder/metadata missing: downloads all functions
        // - If folder/metadata exists: only downloads changed functions (based on mod time)
        // Use syncClient to avoid interfering with primaryContext
        this.syncClient!.switchTo(instanceName, projectName);
        const result = await this.functionSyncManager.syncFunctions(
          this.syncClient!,
          instanceName,
          projectName,
          {
            force: needsFullSync,      // Force if first time
            silent: false,
            checkModTime: !needsFullSync,  // Check mod times if not first time
            concurrency
          }
        );
        
        // Show summary
        if (result.downloaded === 0 && result.updated === 0 && result.deleted === 0) {
          console.error(`    ✓ All functions up to date (${result.skipped} files)`);
        }
      } catch (err: any) {
        console.error(`    ⚠️  Failed to sync functions: ${err.message}`);
      }
    }
  }

  /**
   * Parse trio metadata from trio file content
   */
  private parseTrioMetadata(trioContent: string): any {
    const metadata: any = {};
    
    // Parse simple key:value pairs and markers
    const lines = trioContent.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines and src: block
      if (!trimmed || trimmed === 'src:') {
        continue;
      }
      
      // If line is indented, it's probably part of src block
      if (line.startsWith('  ')) {
        break; // Stop parsing when we hit the src block
      }
      
      // Check for marker tags (no value)
      if (!trimmed.includes(':')) {
        metadata[trimmed] = true;
        continue;
      }
      
      // Parse key:value pairs
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        const key = trimmed.substring(0, colonIndex).trim();
        let value = trimmed.substring(colonIndex + 1).trim();
        
        // Remove quotes if present
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.substring(1, value.length - 1);
        }
        
        metadata[key] = value || true;
      }
    }
    
    return metadata;
  }
  
  /**
   * Index synced functions from proj/ directory
   */
  private async indexSyncedFunctions(): Promise<void> {
    const projDir = 'proj';
    
    try {
      const fs = await import('fs/promises');
      await fs.access(projDir);
      
      console.error(`\n📂 Indexing synced functions from proj/ directory...`);
      
      let indexed = 0;
      let skipped = 0;
      
      // Recursively find all .axon files in proj/
      const findAxonFiles = async (dir: string): Promise<string[]> => {
        const files: string[] = [];
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory()) {
              files.push(...await findAxonFiles(fullPath));
            } else if (entry.isFile() && entry.name.endsWith('.axon')) {
              files.push(fullPath);
            }
          }
        } catch {
          // Ignore errors
        }
        return files;
      };
      
      const axonFiles = await findAxonFiles(projDir);
      
      if (axonFiles.length === 0) {
        console.error(`  ✓ No synced .axon files found`);
        return;
      }
      
      console.error(`  ✓ Found ${axonFiles.length} synced .axon files`);
      
      // Index each file
      for (const filePath of axonFiles) {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          
          // Also read corresponding .trio file for metadata
          const trioPath = filePath.replace('.axon', '.trio');
          let trioMeta: any = null;
          try {
            const trioContent = await fs.readFile(trioPath, 'utf-8');
            trioMeta = this.parseTrioMetadata(trioContent);
          } catch {
            // No trio file - that's okay
          }
          
          // Use enhanced indexer
          const functions = await this.enhancedIndexer.parseAxonFile(filePath, content);
          
          for (const func of functions) {
            // Check if already indexed (avoid duplicates)
            if (this.codeIndex.functions.has(func.id)) {
              skipped++;
              continue;
            }
            
            // Mark as synced function
            func.tags.push('synced', 'skyspark');
            
            // Add metadata from trio file
            if (trioMeta) {
              // Determine function type from trio markers
              if (trioMeta.sparkRule) {
                func.tags.push('sparkRule', 'rule');
                func.category = AxonCategory.SPARK_ANALYSIS;
              } else if (trioMeta.kpiRule) {
                func.tags.push('kpiRule', 'rule', 'kpi');
              } else if (trioMeta.curRule) {
                func.tags.push('curRule', 'rule');
              } else if (trioMeta.ruleOn) {
                func.tags.push('rule');
              }
              
              // Check if it's a defcomp
              if (content.includes('defcomp')) {
                func.tags.push('defcomp');
              }
              
              // Add description from trio if available
              if (trioMeta.dis && !func.description) {
                func.description = trioMeta.dis;
              }
              
              // Add help text if available
              if (trioMeta.help && !func.documentation) {
                func.documentation = trioMeta.help;
              }
              
              // Add doc if available
              if (trioMeta.doc) {
                if (!func.documentation) {
                  func.documentation = trioMeta.doc;
                } else if (!func.documentation.includes(trioMeta.doc)) {
                  func.documentation += '\n\n' + trioMeta.doc;
                }
              }
            }
            
            // Index the function
            this.codeIndex.functions.set(func.id, func);
            
            // Index by category
            if (!this.codeIndex.categories.has(func.category)) {
              this.codeIndex.categories.set(func.category, []);
            }
            this.codeIndex.categories.get(func.category)!.push(func.id);
            
            // Index by tags
            for (const tag of func.tags) {
              if (!this.codeIndex.tags.has(tag)) {
                this.codeIndex.tags.set(tag, []);
              }
              this.codeIndex.tags.get(tag)!.push(func.id);
            }
            
            indexed++;
          }
        } catch (error) {
          // Silently skip files that fail to parse
        }
      }
      
      if (indexed > 0) {
        console.error(`  ✓ Indexed ${indexed} synced functions (${skipped} duplicates skipped)`);
      } else {
        console.error(`  ✓ All synced functions already indexed`);
      }
    } catch {
      // proj/ directory doesn't exist - that's okay
    }
  }
  
  /**
   * Load all project-specific caches into the main code index
   */
  private async loadProjectCaches(): Promise<void> {
    const fs = await import('fs/promises');
    const cacheDir = this.config.cache?.directory || '.cache';
    
    try {
      const files = await fs.readdir(cacheDir);
      const projectCacheFiles = files.filter(f => 
        f.startsWith('axon-index-') && 
        f.endsWith('.json') &&
        f !== 'axon-index.json' // Skip main cache
      );
      
      if (projectCacheFiles.length === 0) {
        return; // No project caches to load
      }
      
      console.error(`\n📦 Loading project caches...`);
      console.error(`   Found ${projectCacheFiles.length} project cache files`);
      console.error(`   Current codeIndex size: ${this.codeIndex.functions.size} functions`);
      
      // Start log file
      let logLines: string[] = [];
      logLines.push(`Loading project caches at ${new Date().toISOString()}`);
      logLines.push(`Found ${projectCacheFiles.length} cache files`);
      logLines.push(`Initial codeIndex size: ${this.codeIndex.functions.size}`);
      logLines.push('');
      
      let loadedProjects = 0;
      let loadedFunctions = 0;
      let skippedInvalid = 0;
      
      for (const cacheFile of projectCacheFiles) {
        try {
          const cachePath = path.join(cacheDir, cacheFile);
          const cacheContent = await fs.readFile(cachePath, 'utf-8');
          const projectIndex = JSON.parse(cacheContent);
          
          // Extract instance/project from filename: axon-index-{instance}-{project}.json
          const match = cacheFile.match(/^axon-index-(.+)-(.+)\.json$/);
          if (!match) {
            console.error(`  ⚠️  Skipping ${cacheFile}: filename doesn't match pattern`);
            continue;
          }
          
          const [, instance, project] = match;
          console.error(`  📄 Processing ${cacheFile}: ${instance}/${project}`);
          logLines.push(`Processing: ${cacheFile} (${instance}/${project})`);
          
          // Merge functions into main index
          if (projectIndex.functions && Array.isArray(projectIndex.functions)) {
            console.error(`     Found ${projectIndex.functions.length} functions in cache`);
            logLines.push(`  Found ${projectIndex.functions.length} functions`);
            const sizeBefore = this.codeIndex.functions.size;
            let loadedFromThis = 0;
            let duplicateIds = 0;
            for (const funcEntry of projectIndex.functions) {
              if (Array.isArray(funcEntry) && funcEntry.length === 2) {
                let [funcId, func] = funcEntry;
                
                // Ensure func has required fields
                if (!func.name || !func.filePath) {
                  skippedInvalid++;
                  continue;
                }
                
                // Generate unique ID for proj functions by appending instance-project
                // This prevents collision with library functions
                const uniqueFuncId = `${funcId}-${instance}-${project}`;
                
                // Check if this ID already exists
                const existsBefore = this.codeIndex.functions.has(uniqueFuncId);
                if (existsBefore) duplicateIds++;
                funcId = uniqueFuncId;
                func.id = uniqueFuncId; // Update the function's ID too
                
                // Add project context tags if not already present
                if (!func.tags) func.tags = [];
                if (!func.tags.includes(instance)) func.tags.push(instance);
                if (!func.tags.includes(project)) func.tags.push(project);
                
                // Add to main index
                this.codeIndex.functions.set(funcId, func);
                loadedFunctions++;
                loadedFromThis++;
                
                // Index by category
                if (!this.codeIndex.categories.has(func.category)) {
                  this.codeIndex.categories.set(func.category, []);
                }
                this.codeIndex.categories.get(func.category)!.push(funcId);
                
                // Index by tags
                for (const tag of func.tags) {
                  if (!this.codeIndex.tags.has(tag)) {
                    this.codeIndex.tags.set(tag, []);
                  }
                  this.codeIndex.tags.get(tag)!.push(funcId);
                }
              }
            }
            const sizeAfter = this.codeIndex.functions.size;
            const actuallyAdded = sizeAfter - sizeBefore;
            console.error(`     ✅ Loaded ${loadedFromThis} functions from this project`);
            logLines.push(`  Loaded ${loadedFromThis} functions`);
            logLines.push(`  Duplicate IDs: ${duplicateIds} (overwrote existing)`);
            logLines.push(`  Actually added to index: ${actuallyAdded}`);
            logLines.push(`  Size before: ${sizeBefore}, after: ${sizeAfter}`);
            loadedProjects++;
          } else {
            console.error(`     ⚠️  No functions array found in cache`);
            logLines.push(`  ERROR: No functions array`);
          }
        } catch (error: any) {
          console.error(`  ⚠️  Failed to load ${cacheFile}:`, error.message);
          logLines.push(`  ERROR: ${error.message}`);
        }
        logLines.push('');
      }
      
      // Write log file
      logLines.push(`Final results:`);
      logLines.push(`- Projects loaded: ${loadedProjects}`);
      logLines.push(`- Functions loaded: ${loadedFunctions}`);
      logLines.push(`- Invalid skipped: ${skippedInvalid}`);
      logLines.push(`- Final codeIndex size: ${this.codeIndex.functions.size}`);
      await fs.writeFile('load-project-caches.log', logLines.join('\n'), 'utf-8').catch(() => {});
      
      if (loadedProjects > 0) {
        console.error(`  ✅ Loaded ${loadedFunctions} functions from ${loadedProjects} project caches`);
        console.error(`   Final codeIndex size: ${this.codeIndex.functions.size} functions`);
        if (skippedInvalid > 0) {
          console.error(`  ⚠️  Skipped ${skippedInvalid} invalid entries`);
        }
      }
    } catch (error: any) {
      console.error(`  ⚠️  Could not load project caches:`, error.message);
    }
  }
  
  async initialize() {
    const startTime = Date.now();
    console.error('\n╔══════════════════════════════════════════════════════════════╗');
    console.error('║           Axon MCP Server Initialization                     ║');
    console.error('╚══════════════════════════════════════════════════════════════╝\n');

    // Initialize cache
    await this.cacheManager.initialize();

    // Load workflow documentation
    console.error('\n📖 Loading workflow documentation...');
    await this.workflowManager.loadWorkflows();
    const workflowStats = this.workflowManager.getStatistics();
    console.error(`   ✅ Loaded ${workflowStats.totalWorkflows} workflow(s)`);
    if (workflowStats.totalWorkflows > 0) {
      console.error(`   Categories: ${Object.keys(workflowStats.byCategory).join(', ')}`);
    }

    // Vector index for semantic workflow search (own LanceDB table).
    this.workflowVectorIndex = new WorkflowVectorIndex(this.workflowManager);

    // Auto-pick up newly generated workflows without restarting the server.
    this.workflowManager.onReload(() => {
      const broadcast = (srv: Server) => {
        srv.sendResourceListChanged().catch(err => {
          console.error(`⚠️  Failed to send resources/listChanged: ${err?.message || err}`);
        });
      };
      broadcast(this.server);
      for (const sessionServer of this.httpSessions.values()) {
        broadcast(sessionServer);
      }

      this.workflowManager.pruneSummaryCache();
      // Background reindex; never block the watcher.
      setImmediate(() => {
        this.workflowVectorIndex?.reindexAll().catch(err => {
          console.error(`⚠️  Workflow vector reindex failed: ${err?.message || err}`);
        });
      });
    });
    this.workflowManager.startWatching();

    // Initial vector index — non-blocking so startup stays fast.
    setImmediate(() => {
      this.workflowVectorIndex?.reindexAll().catch(err => {
        console.error(`⚠️  Initial workflow vector index failed: ${err?.message || err}`);
      });
    });
    
    // Auto-discover and index all projects if enabled - but do it in background
    if (this.skysparkClient && this.configManager && this.autoDiscoverProjects) {
      console.error('\n🚀 Starting automatic project discovery and indexing in background...');
      console.error('   Server will be ready immediately while indexing continues.\n');
      
      // Start background discovery and indexing
      setImmediate(() => {
        this.runBackgroundDiscovery().catch(error => {
          console.error(`❌ Background discovery failed: ${error.message}`);
        });
      });
    } else if (this.skysparkClient && this.configManager) {
      // Just show current configuration without auto-discovery
      const config = this.skysparkClient.getCurrentConfig();
      const instances = this.configManager.getInstances();
      console.error(`📊 SkySpark: ${instances.length} instance(s) configured`);
      console.error(`   Active: ${config.instance} / ${config.project}`);
    }
    
    // Check for valid cache
    const cacheKey = `${this.config.codePath}|${this.config.docsPath || ''}`;
    const cacheEnabled = this.config.cache?.enabled;
    const cacheValid = cacheEnabled && await this.cacheManager.isValidCache(cacheKey, this.config.cache?.maxAge || 86400000);
    
    if (cacheValid) {
      console.error('📦 Loading from cache...');
      const cachedIndex = await this.cacheManager.loadCache();
      if (cachedIndex) {
        this.codeIndex = cachedIndex;
        
        // Display cache summary
        this.displayCacheSummary();
        
        // Build search index from cache
        this.searchIndex.buildIndex(this.codeIndex.functions);
        const searchStats = this.searchIndex.getStats();
        this.displaySearchIndexSummary(searchStats);
        
        // Build function usage index
        await this.buildFunctionUsageIndex();
        
        // Build operator index
        this.operatorIndex.buildIndex(this.codeIndex.functions);
        this.displayOperatorIndexSummary();
        
        // Build FlexSearch documentation index (not part of main cache)
        await this.buildFlexSearchIndex();
        
        // Load project-specific caches into main index
        await this.loadProjectCaches();
        
        // Build FlexSearch function index (replaces old token-based search)
        console.error('\n🔄 Building FlexSearch function index...');
        await this.flexSearchFunctionIndex.buildIndex(this.codeIndex.functions);
        const flexStats = this.flexSearchFunctionIndex.getStats();
        console.error(`   ✅ FlexSearch index built: ${flexStats.totalFunctions} functions (${flexStats.libraryFunctions} library, ${flexStats.projectFunctions} project)`);
        console.error(`   Categories: ${flexStats.categories.length}`);
        
        // Write debug info to file
        const fs = await import('fs/promises');
        const debugInfo = `Server initialized at: ${new Date().toISOString()}\nPath: CACHED\nFunctions loaded: ${this.codeIndex.functions.size}\nFlexSearch functions: ${flexStats.totalFunctions} (${flexStats.libraryFunctions} library, ${flexStats.projectFunctions} project)\n\nSample function names:\n${Array.from(this.codeIndex.functions.values()).slice(0, 20).map(f => `- ${f.name} (${f.filePath})`).join('\n')}`;
        await fs.writeFile('debug-index-state.txt', debugInfo, 'utf-8').catch(() => {});
        
        return;
      }
    }
    
    // Scan for Axon files
    const axonFiles = await this.scanner.scanForAxonFiles();
    console.error(`Found ${axonFiles.length} Axon files`);

    // Parse each file
    for (const fileInfo of axonFiles) {
      try {
        const content = await this.scanner.readFileContents(fileInfo.codePath);
        
        if (fileInfo.fileType === 'code' && fileInfo.codePath.endsWith('.axon')) {
          // Use enhanced indexer for richer metadata
          const functions = await this.enhancedIndexer.parseAxonFile(fileInfo.codePath, content);
          
          for (const func of functions) {
            // Index the function
            this.codeIndex.functions.set(func.id, func);
            
            // Index by category
            if (!this.codeIndex.categories.has(func.category)) {
              this.codeIndex.categories.set(func.category, []);
            }
            this.codeIndex.categories.get(func.category)!.push(func.id);
            
            // Index by tags
            for (const tag of func.tags) {
              if (!this.codeIndex.tags.has(tag)) {
                this.codeIndex.tags.set(tag, []);
              }
              this.codeIndex.tags.get(tag)!.push(func.id);
            }
          }
        } else if (fileInfo.fileType === 'docs' && fileInfo.codePath.endsWith('.html')) {
          // Check if this is AxonUsage.html for special handling
          if (path.basename(fileInfo.codePath) === 'AxonUsage.html') {
            console.error(`Processing AxonUsage.html with enhanced extraction...`);
            const functions = this.axonUsageScanner.extractAxonUsageExamples(content, fileInfo.codePath);
            
            for (const func of functions) {
              // Index the function
              this.codeIndex.functions.set(func.id, func);
              
              // Index by category
              if (!this.codeIndex.categories.has(func.category)) {
                this.codeIndex.categories.set(func.category, []);
              }
              this.codeIndex.categories.get(func.category)!.push(func.id);
              
              // Index by tags
              for (const tag of func.tags) {
                if (!this.codeIndex.tags.has(tag)) {
                  this.codeIndex.tags.set(tag, []);
                }
                this.codeIndex.tags.get(tag)!.push(func.id);
              }
            }
          } else {
            // Regular HTML file processing
            const codeBlocks = this.scanner.extractAxonFromHtml(content);
            
            // Process each code block as a separate example
            for (let i = 0; i < codeBlocks.length; i++) {
              const codeBlock = codeBlocks[i];
              const docName = path.basename(fileInfo.codePath, '.html') + `_example_${i + 1}`;
              const func: AxonFunction = {
                id: crypto.createHash('md5').update(fileInfo.codePath + i).digest('hex'),
                name: docName,
                filePath: fileInfo.codePath,
                sourceCode: codeBlock,
                category: AxonCategory.UNCATEGORIZED,
                tags: ['documentation', 'example', path.basename(fileInfo.codePath, '.html')],
                description: `Example from ${path.basename(fileInfo.codePath)}`,
                lineNumber: i + 1
              };
              
              // Try to categorize based on content
              const category = this.parser['categorizeFunction'](docName, codeBlock, func.tags);
              func.category = category;
              
              this.codeIndex.functions.set(func.id, func);
              
              // Index by category
              if (!this.codeIndex.categories.has(func.category)) {
                this.codeIndex.categories.set(func.category, []);
              }
              this.codeIndex.categories.get(func.category)!.push(func.id);
              
              // Index by tags
              for (const tag of func.tags) {
                if (!this.codeIndex.tags.has(tag)) {
                  this.codeIndex.tags.set(tag, []);
                }
                this.codeIndex.tags.get(tag)!.push(func.id);
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error processing ${fileInfo.codePath}:`, error);
      }
    }

    this.codeIndex.lastUpdated = new Date();
    
    // Index synced functions from proj/ directory if available
    await this.indexSyncedFunctions();
    
    // Load project-specific caches into main index
    await this.loadProjectCaches();
    
    // Display code index summary
    this.displayCacheSummary();
    
    // Build FlexSearch function index (replaces old token-based search)
    console.error('\n🔄 Building FlexSearch function index...');
    await this.flexSearchFunctionIndex.buildIndex(this.codeIndex.functions);
    const flexStats = this.flexSearchFunctionIndex.getStats();
    console.error(`   ✅ FlexSearch index built: ${flexStats.totalFunctions} functions (${flexStats.libraryFunctions} library, ${flexStats.projectFunctions} project)`);
    console.error(`   Categories: ${flexStats.categories.length}`);
    
    // Write debug info to file
    const fs = await import('fs/promises');
    const debugInfo = `Server initialized at: ${new Date().toISOString()}\nPath: FRESH BUILD\nFunctions loaded: ${this.codeIndex.functions.size}\nFlexSearch functions: ${flexStats.totalFunctions}\n\nSample function names:\n${Array.from(this.codeIndex.functions.values()).slice(0, 20).map(f => `- ${f.name} (${f.filePath})`).join('\n')}`;
    await fs.writeFile('debug-index-state.txt', debugInfo, 'utf-8').catch(() => {});
    
    // Build function usage index
    await this.buildFunctionUsageIndex();
    
    // Build operator index
    this.operatorIndex.buildIndex(this.codeIndex.functions);
    this.displayOperatorIndexSummary();
    
    // Build FlexSearch documentation index
    await this.buildFlexSearchIndex();
    
    // Save to cache
    if (this.config.cache?.enabled) {
      await this.cacheManager.saveCache(this.codeIndex, cacheKey);
    }
  }

  async run() {
    const startTime = Date.now();
    const transportMode = process.env.MCP_TRANSPORT || 'stdio';

    if (transportMode === 'sse' || transportMode === 'http') {
      // HTTP mode: Start HTTP server first, then initialize
      // Clients connect via /mcp endpoint using StreamableHTTP protocol
      await this.startHttpServer();
      console.error('\n✅ StreamableHTTP MCP Server started - clients can connect to /mcp');
      console.error('   Initialization starting...\n');

      // Run initialization
      this.initializationPromise = this.initialize().then(() => {
        this.initializationComplete = true;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        this.displayInitializationComplete(elapsed);
      }).catch((error) => {
        console.error('\n❌ Initialization error:', error);
        console.error('   Server will continue with partial functionality\n');
        this.initializationComplete = true;
        throw error;
      });

      // Keep the process alive
      await new Promise(() => {});
    } else {
      // STDIO mode: Connect transport FIRST so server can respond to pings immediately
      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      // Log that server is ready to accept requests (ping will work)
      console.error('\n✅ MCP Server (stdio) connected - ready to accept requests');
      console.error('   Initialization continuing in background...\n');

      // Run initialization in background (non-blocking for ping, but tools will wait)
      this.initializationPromise = this.initialize().then(() => {
        this.initializationComplete = true;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        this.displayInitializationComplete(elapsed);
      }).catch((error) => {
        console.error('\n❌ Initialization error:', error);
        console.error('   Server will continue with partial functionality\n');
        this.initializationComplete = true;
        throw error;
      });
    }
  }

  private async startHttpServer(): Promise<void> {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true })); // For OAuth form submissions
    // Port priority: MCP_PORT env var > config file > default (3847)
    const port = parseInt(process.env.MCP_PORT || String(this.config.server?.port || 3847));
    const issuerUrl = new URL(this.config.oauth?.issuerUrl || `http://localhost:${port}`);

    // Store references
    this.expressApp = app;

    // Initialize OAuth if enabled
    const oauthEnabled = this.config.oauth?.enabled !== false;
    if (oauthEnabled) {
      // Initialize Prisma client for OAuth
      const { PrismaClient } = await import('./generated/prisma/client.js');
      const { PrismaBetterSqlite3 } = await import('@prisma/adapter-better-sqlite3');
      const cacheDir = path.join(PROJECT_ROOT, this.config.cache?.directory || '.cache');
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      const dbPath = path.join(cacheDir, 'usage.db');
      const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
      const prisma = new PrismaClient({ adapter });
      await prisma.$connect();
      this.prisma = prisma;

      // Initialize user store for OAuth authentication
      const configDir = path.join(PROJECT_ROOT, 'config');
      const userStore = initUserStore(configDir);

      // Create OAuth provider
      const scopesSupported = this.config.oauth?.scopesSupported || ['mcp:read', 'mcp:write', 'mcp:admin'];
      this.oauthProvider = new AxonOAuthProvider(prisma, userStore, {
        accessTokenTtl: this.config.oauth?.accessTokenTtl,
        refreshTokenTtl: this.config.oauth?.refreshTokenTtl,
        scopesSupported,
      });

      // Start token cleanup job
      this.tokenCleanupJob = new TokenCleanupJob(prisma);
      this.tokenCleanupJob.start();

      // Initialize backup manager
      this.backupManager = new BackupManager(
        prisma,
        configDir,
        this.config.cache?.directory || '.cache'
      );

      // Add OAuth routes (well-known endpoints, /authorize, /token, /register, /revoke)
      app.use(mcpAuthRouter({
        provider: this.oauthProvider,
        issuerUrl,
        scopesSupported,
      }));

      // Handle authorization form submission (POST /oauth/login)
      app.post('/oauth/login', async (req: Request, res: Response) => {
        try {
          const { client_id, username, password, redirect_uri, code_challenge, scope, state } = req.body;

          if (!client_id || !username || !password || !redirect_uri || !code_challenge) {
            const html = renderErrorPage('Invalid Request', 'Missing required parameters');
            res.setHeader('Content-Type', 'text/html');
            return res.status(400).send(html);
          }

          // Process authorization
          const result = await this.oauthProvider!.processAuthorization(
            client_id,
            username,
            password,
            redirect_uri,
            code_challenge,
            scope || '',
            state,
            req.headers['user-agent'],
            req.ip || req.socket.remoteAddress
          );

          if (!result.success) {
            // Re-render authorization page with error
            const client = await this.oauthProvider!.clientsStore.getClient(client_id);
            if (!client) {
              const html = renderErrorPage('Invalid Client', 'The client ID is not registered');
              res.setHeader('Content-Type', 'text/html');
              return res.status(400).send(html);
            }
            const html = renderAuthorizePage({
              client,
              scopes: scope ? scope.split(' ') : [],
              state,
              codeChallenge: code_challenge,
              redirectUri: redirect_uri,
              error: result.error,
            });
            res.setHeader('Content-Type', 'text/html');
            return res.status(401).send(html);
          }

          // Redirect with authorization code
          const redirectUrl = new URL(redirect_uri);
          redirectUrl.searchParams.set('code', result.code);
          if (result.state) {
            redirectUrl.searchParams.set('state', result.state);
          }
          res.redirect(redirectUrl.toString());
        } catch (error) {
          console.error('Error processing authorization:', error);
          const html = renderErrorPage('Server Error', 'An unexpected error occurred');
          res.setHeader('Content-Type', 'text/html');
          res.status(500).send(html);
        }
      });

      console.error('🔐 OAuth 2.1 authentication enabled');
    }

    // Health check endpoint
    app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        initialized: this.initializationComplete,
        uptime: process.uptime(),
        functionsIndexed: this.codeIndex.functions.size,
        activeSessions: this.httpTransports.size
      });
    });

    // MCP endpoint - handles POST (messages), GET (SSE stream), DELETE (terminate)
    app.post('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      console.error(`POST /mcp - session: ${sessionId || 'new'}, body: ${JSON.stringify(req.body).substring(0, 200)}`);

      try {
        // Check for existing session
        if (sessionId && this.httpTransports.has(sessionId)) {
          const transport = this.httpTransports.get(sessionId)!;
          await transport.handleRequest(req, res, req.body);
          return;
        }

        // New session - must be initialize request
        if (!sessionId && isInitializeRequest(req.body)) {
          console.error('New session initialization request');

          // Create a NEW Server instance for this session
          const sessionServer = new Server(
            { name: 'axon-code-server', version: '1.0.0' },
            { capabilities: { tools: { listChanged: true }, resources: { listChanged: true } } }
          );

          // Set up handlers on this session's server
          this.setupHandlersForServer(sessionServer);

          // Create transport with session callbacks
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid: string) => {
              console.error(`Session initialized: ${sid}`);
              this.httpTransports.set(sid, transport);
              this.httpSessions.set(sid, sessionServer);
            }
          });

          // Handle session close
          transport.onclose = () => {
            const sid = [...this.httpTransports.entries()].find(([_, t]) => t === transport)?.[0];
            if (sid) {
              console.error(`Session closed: ${sid}`);
              this.httpTransports.delete(sid);
              this.httpSessions.delete(sid);
            }
          };

          // Connect server to transport
          await sessionServer.connect(transport);

          // Handle the initialize request
          await transport.handleRequest(req, res, req.body);
          return;
        }

        // Invalid request
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Bad Request: No valid session ID or not an initialize request'
          },
          id: null
        });
      } catch (error) {
        console.error('Error handling POST /mcp:', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null
          });
        }
      }
    });

    // GET /mcp - SSE stream for server-to-client notifications
    app.get('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      console.error(`GET /mcp - session: ${sessionId || 'none'}`);

      if (!sessionId || !this.httpTransports.has(sessionId)) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32600, message: 'Invalid or missing session ID' },
          id: null
        });
        return;
      }

      const transport = this.httpTransports.get(sessionId)!;
      await transport.handleRequest(req, res);
    });

    // DELETE /mcp - terminate session
    app.delete('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      console.error(`DELETE /mcp - session: ${sessionId || 'none'}`);

      if (!sessionId || !this.httpTransports.has(sessionId)) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32600, message: 'Invalid or missing session ID' },
          id: null
        });
        return;
      }

      const transport = this.httpTransports.get(sessionId)!;
      await transport.handleRequest(req, res);
    });

    // Admin API routes (protected by Basic Auth)
    const adminRouter = createAdminRouter(this.createAdminContext());
    app.use('/admin', adminRouter);

    // Serve dashboard static files (if built)
    const dashboardPath = path.join(PROJECT_ROOT, 'dashboard', 'out');
    if (fs.existsSync(dashboardPath)) {
      app.use('/dashboard', express.static(dashboardPath));
      // SPA fallback
      app.get('/dashboard{/*path}', (_req: Request, res: Response) => {
        res.sendFile(path.join(dashboardPath, 'index.html'));
      });
    }

    // Start HTTP server
    return new Promise((resolve) => {
      app.listen(port, () => {
        console.error(`🌐 StreamableHTTP MCP Server on http://localhost:${port}`);
        console.error(`   MCP endpoint: http://localhost:${port}/mcp`);
        console.error(`   Health check: http://localhost:${port}/health`);
        console.error(`   Admin API: http://localhost:${port}/admin`);
        if (oauthEnabled) {
          console.error(`   OAuth metadata: http://localhost:${port}/.well-known/oauth-authorization-server`);
          console.error(`   OAuth authorize: http://localhost:${port}/authorize`);
        }
        if (fs.existsSync(dashboardPath)) {
          console.error(`   Dashboard: http://localhost:${port}/dashboard`);
        }
        resolve();
      });
    });
  }

  /**
   * Get the OAuth provider (for admin routes)
   */
  getOAuthProvider(): AxonOAuthProvider | undefined {
    return this.oauthProvider;
  }
}

// Run the server
const configPath = process.argv[2]; // Optional config file path
const server = new AxonMCPServer(configPath);
server.run().catch(console.error);
