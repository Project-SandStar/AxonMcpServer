/**
 * HTTP client for communicating with the Axon MCP Server
 *
 * This replaces the bundled MCP server approach with direct HTTP API calls
 * to a running MCP server instance.
 */

import * as vscode from 'vscode';
import { getLogger } from '../utils/logger';

// Response types from MCP server
export interface ProjectInfo {
  instance: string;
  project: string;
  url?: string;
  functionCount?: number;
  lastSync?: string;
}

export interface PrimaryProjectContext {
  instance: string;
  project: string;
  url?: string;
  setBy: 'vscode' | 'dashboard' | 'api' | 'startup';
  timestamp: string | null;
}

export interface ServerStatus {
  status: 'running' | 'stopped' | 'error';
  uptime?: number;
  version?: string;
  primaryProject?: PrimaryProjectContext;
  instances?: string[];
  projectCount?: number;
}

export interface GenerationRequest {
  prompt: string;
  type: GenerationType;
  context?: string;
}

export interface GenerationResult {
  code: string;
  explanation?: string;
  functionName?: string;
}

export interface CommitResult {
  success: boolean;
  message: string;
  backupPath?: string;
}

export interface SearchResult {
  name: string;
  source?: string;
  description?: string;
  category?: string;
  score?: number;
}

export interface DocSearchResult {
  title: string;
  path: string;
  content?: string;
  score?: number;
}

export type GenerationType =
  | 'sparkRule'
  | 'kpiRule'
  | 'importScript'
  | 'taskScript'
  | 'jobScript'
  | 'skysparkApp'
  | 'function'
  | 'general';

/**
 * HTTP client for Axon MCP Server communication
 */
export class HttpMcpClient {
  private baseUrl: string;
  private credentials: { username: string; password: string };
  private logger = getLogger();
  private _isConnected: boolean = false;
  private _lastError: string | null = null;

  // MCP session management
  private mcpSessionId: string | null = null;
  private mcpSessionInitialized: boolean = false;

  // Event emitters
  private _onConnectionChange = new vscode.EventEmitter<boolean>();
  readonly onConnectionChange = this._onConnectionChange.event;

  private _onProjectChange = new vscode.EventEmitter<PrimaryProjectContext | null>();
  readonly onProjectChange = this._onProjectChange.event;

  constructor() {
    const config = vscode.workspace.getConfiguration('axon');
    this.baseUrl = config.get<string>('server.url') || 'http://localhost:3847';
    this.credentials = {
      username: config.get<string>('server.username') || 'admin',
      password: config.get<string>('server.password') || 'admin'
    };

    // Listen for config changes
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('axon.server')) {
        this.updateConfig();
      }
    });
  }

  private updateConfig(): void {
    const config = vscode.workspace.getConfiguration('axon');
    this.baseUrl = config.get<string>('server.url') || 'http://localhost:3847';
    this.credentials = {
      username: config.get<string>('server.username') || 'admin',
      password: config.get<string>('server.password') || 'admin'
    };
    // Reset MCP session when config changes
    this.mcpSessionId = null;
    this.mcpSessionInitialized = false;
    this.logger.info(`MCP server URL updated to: ${this.baseUrl}`);
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  get lastError(): string | null {
    return this._lastError;
  }

  /**
   * Get Basic Auth header
   */
  private getAuthHeader(): string {
    const encoded = Buffer.from(`${this.credentials.username}:${this.credentials.password}`).toString('base64');
    return `Basic ${encoded}`;
  }

  /**
   * Make an HTTP request to the admin API
   */
  private async adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/admin${path}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
          ...options.headers
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return await response.json() as T;
    } catch (error) {
      this._lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * Initialize MCP session with the server
   * Must be called before making any tool calls
   */
  private async initializeMcpSession(): Promise<void> {
    if (this.mcpSessionInitialized && this.mcpSessionId) {
      return; // Already initialized
    }

    const url = `${this.baseUrl}/mcp`;

    // MCP initialize request
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'axon-vscode-extension',
          version: '1.0.0'
        }
      }
    };

    this.logger.info('Initializing MCP session...');

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        },
        body: JSON.stringify(initRequest)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MCP init failed: HTTP ${response.status}: ${errorText}`);
      }

      // Get session ID from response header
      const sessionId = response.headers.get('mcp-session-id');
      if (sessionId) {
        this.mcpSessionId = sessionId;
        this.logger.info(`MCP session established: ${sessionId}`);
      }

      // Parse response to verify success
      const text = await response.text();
      const result = this.parseSSEResponse(text);

      if (result.error) {
        throw new Error(`MCP init error: ${result.error.message}`);
      }

      // Send initialized notification
      await this.sendInitializedNotification();

      this.mcpSessionInitialized = true;
      this.logger.info('MCP session fully initialized');
    } catch (error) {
      this.mcpSessionId = null;
      this.mcpSessionInitialized = false;
      throw error;
    }
  }

  /**
   * Send the initialized notification after successful initialize
   */
  private async sendInitializedNotification(): Promise<void> {
    if (!this.mcpSessionId) {
      return;
    }

    const url = `${this.baseUrl}/mcp`;
    const notification = {
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    };

    try {
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'mcp-session-id': this.mcpSessionId
        },
        body: JSON.stringify(notification)
      });
    } catch (error) {
      this.logger.warn('Failed to send initialized notification', error as Error);
    }
  }

  /**
   * Call an MCP tool via the streaming HTTP endpoint
   *
   * The StreamableHTTP transport returns responses in SSE format:
   *   event: message
   *   data: {...json response...}
   */
  private async callMcpTool<T>(toolName: string, args: Record<string, unknown> = {}): Promise<T> {
    // Ensure MCP session is initialized
    await this.initializeMcpSession();

    const url = `${this.baseUrl}/mcp`;

    // Build JSON-RPC request
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    };

    // Include session ID if we have one
    if (this.mcpSessionId) {
      headers['mcp-session-id'] = this.mcpSessionId;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        const errorText = await response.text();
        // If session expired, reset and retry
        if (response.status === 400 && errorText.includes('session')) {
          this.mcpSessionId = null;
          this.mcpSessionInitialized = false;
          return this.callMcpTool<T>(toolName, args);
        }
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      // Parse SSE response format
      const text = await response.text();
      const result = this.parseSSEResponse(text);

      if (result.error) {
        throw new Error(result.error.message);
      }

      // Extract content from MCP response
      const content = result.result?.content?.[0]?.text;
      if (content) {
        return JSON.parse(content) as T;
      }

      return result.result as T;
    } catch (error) {
      this._lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * Parse Server-Sent Events (SSE) response format
   * Format:
   *   event: message
   *   data: {...json...}
   */
  private parseSSEResponse(text: string): { result?: { content?: Array<{ text?: string }> }; error?: { message: string } } {
    // Split into events
    const events = text.split('\n\n').filter(e => e.trim());

    for (const event of events) {
      const lines = event.split('\n');
      let eventType = '';
      let data = '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventType = line.substring(6).trim();
        } else if (line.startsWith('data:')) {
          data = line.substring(5).trim();
        }
      }

      // Look for message events with data
      if (eventType === 'message' && data) {
        try {
          return JSON.parse(data);
        } catch {
          this.logger.warn(`Failed to parse SSE data: ${data.substring(0, 100)}`);
        }
      }
    }

    // If no SSE format found, try parsing the whole text as JSON (fallback)
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Failed to parse response: ${text.substring(0, 200)}`);
    }
  }

  /**
   * Initialize connection to MCP server
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing connection to MCP server...');

    try {
      const status = await this.getServerStatus();
      this._isConnected = status.status === 'running';
      this._lastError = null;
      this._onConnectionChange.fire(this._isConnected);

      this.logger.info(`MCP server connection ${this._isConnected ? 'established' : 'failed'}`);
    } catch (error) {
      this._isConnected = false;
      this._lastError = error instanceof Error ? error.message : String(error);
      this._onConnectionChange.fire(false);
      this.logger.error('Failed to connect to MCP server', error as Error);
    }
  }

  /**
   * Get server status from admin API
   */
  async getServerStatus(): Promise<ServerStatus> {
    return this.adminRequest<ServerStatus>('/status');
  }

  /**
   * Get list of all projects
   */
  async getProjects(): Promise<ProjectInfo[]> {
    return this.adminRequest<ProjectInfo[]>('/projects');
  }

  /**
   * Get primary project context
   */
  async getPrimaryProject(): Promise<PrimaryProjectContext | null> {
    try {
      const result = await this.adminRequest<PrimaryProjectContext | { error: string }>('/primary-project');
      if ('error' in result) {
        return null;
      }
      return result;
    } catch {
      return null;
    }
  }

  /**
   * Set primary project
   */
  async setPrimaryProject(instance: string, project: string): Promise<PrimaryProjectContext> {
    const result = await this.adminRequest<PrimaryProjectContext>('/primary-project', {
      method: 'POST',
      body: JSON.stringify({ instance, project, setBy: 'vscode' })
    });

    this._onProjectChange.fire(result);
    return result;
  }

  /**
   * Search Axon code examples
   */
  async searchExamples(query: string, limit: number = 10): Promise<SearchResult[]> {
    return this.callMcpTool<SearchResult[]>('searchAxonExamples', { query, limit });
  }

  /**
   * Search Axon documentation
   */
  async searchDocs(query: string, limit: number = 10): Promise<DocSearchResult[]> {
    return this.callMcpTool<DocSearchResult[]>('searchAxonDocs', { query, limit });
  }

  /**
   * Generate Axon code using AI
   */
  async generateCode(request: GenerationRequest): Promise<GenerationResult> {
    // Map generation type to MCP tool parameters
    const typeMapping: Record<GenerationType, string> = {
      sparkRule: 'spark-rule',
      kpiRule: 'kpi-rule',
      importScript: 'import-script',
      taskScript: 'task-script',
      jobScript: 'job-script',
      skysparkApp: 'skyspark-app',
      function: 'function',
      general: 'general'
    };

    return this.callMcpTool<GenerationResult>('generateAxonCode', {
      description: request.prompt,
      type: typeMapping[request.type] || 'general',
      context: request.context
    });
  }

  /**
   * Execute Axon code on SkySpark
   */
  async executeAxon(code: string): Promise<unknown> {
    return this.callMcpTool('executeAxonCode', { code });
  }

  /**
   * Commit an Axon function to SkySpark
   */
  async commitFunction(name: string, src: string, doc?: string): Promise<CommitResult> {
    return this.callMcpTool<CommitResult>('commitAxonFunction', { name, src, doc });
  }

  /**
   * Get cache information
   */
  async getCacheInfo(): Promise<unknown[]> {
    return this.adminRequest<unknown[]>('/cache');
  }

  /**
   * Clear cache
   */
  async clearCache(name?: string): Promise<void> {
    await this.adminRequest('/cache/clear', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
  }

  /**
   * Trigger function sync for a project
   */
  async triggerSync(instance: string, project: string): Promise<{ downloaded: number; updated: number; deleted: number }> {
    return this.adminRequest(`/projects/${instance}/${project}/sync`, {
      method: 'POST'
    });
  }

  /**
   * Get startup logs
   */
  async getStartupLogs(): Promise<string> {
    const url = `${this.baseUrl}/admin/logs/startup`;
    const response = await fetch(url, {
      headers: {
        'Authorization': this.getAuthHeader()
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.text();
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this._onConnectionChange.dispose();
    this._onProjectChange.dispose();
  }
}

// Singleton instance
let mcpClientInstance: HttpMcpClient | null = null;

export function getMcpClient(): HttpMcpClient {
  if (!mcpClientInstance) {
    mcpClientInstance = new HttpMcpClient();
  }
  return mcpClientInstance;
}

export function initializeMcpClient(): HttpMcpClient {
  mcpClientInstance = new HttpMcpClient();
  return mcpClientInstance;
}
