/**
 * MCP Explorer - Panel for exploring and executing MCP server tools
 *
 * Features:
 * - Project selector (searchable combobox)
 * - Tool selector grouped by category
 * - Dynamic parameter inputs based on selected tool
 * - Execute button
 * - Results display with formatting
 */

import * as vscode from 'vscode';
import { getMcpClient, HttpMcpClient, ProjectInfo, PrimaryProjectContext } from '../mcp/HttpMcpClient';
import { getLogger } from '../utils/logger';
import { getNonce } from '../utils/getNonce';

// Tool definitions with their parameters
interface ToolParam {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  description: string;
  default?: string | number | boolean;
}

interface ToolDef {
  name: string;
  description: string;
  category: 'search' | 'retrieve' | 'skyspark' | 'execute';
  params: ToolParam[];
}

const MCP_TOOLS: ToolDef[] = [
  // Search tools
  {
    name: 'searchAxonExamples',
    description: 'Search Axon code examples by keyword',
    category: 'search',
    params: [
      { name: 'query', type: 'string', required: true, description: 'Search query' },
      { name: 'limit', type: 'number', required: false, description: 'Max results', default: 10 }
    ]
  },
  {
    name: 'searchAxonDocs',
    description: 'Search Axon documentation',
    category: 'search',
    params: [
      { name: 'query', type: 'string', required: true, description: 'Search query' },
      { name: 'limit', type: 'number', required: false, description: 'Max results', default: 10 }
    ]
  },
  {
    name: 'searchAxonOperatorExamples',
    description: 'Find examples using specific operators',
    category: 'search',
    params: [
      { name: 'operator', type: 'string', required: true, description: 'Operator (e.g., >=, ==, ->)' },
      { name: 'limit', type: 'number', required: false, description: 'Max results', default: 10 }
    ]
  },
  {
    name: 'searchAxonRegex',
    description: 'Search code with regex patterns',
    category: 'search',
    params: [
      { name: 'pattern', type: 'string', required: true, description: 'Regex pattern' },
      { name: 'limit', type: 'number', required: false, description: 'Max results', default: 10 }
    ]
  },
  {
    name: 'findFunctionUsage',
    description: 'Find where a function is used',
    category: 'search',
    params: [
      { name: 'functionName', type: 'string', required: true, description: 'Function name' }
    ]
  },
  {
    name: 'getFunctionExamples',
    description: 'Get usage examples for a function',
    category: 'search',
    params: [
      { name: 'functionName', type: 'string', required: true, description: 'Function name' },
      { name: 'limit', type: 'number', required: false, description: 'Max results', default: 5 }
    ]
  },
  {
    name: 'getFunctionCallGraph',
    description: 'Get call graph for a function',
    category: 'search',
    params: [
      { name: 'functionName', type: 'string', required: true, description: 'Function name' },
      { name: 'depth', type: 'number', required: false, description: 'Max depth', default: 2 }
    ]
  },
  {
    name: 'getFunctionUsageStats',
    description: 'Get usage statistics for functions',
    category: 'search',
    params: [
      { name: 'limit', type: 'number', required: false, description: 'Top N functions', default: 20 }
    ]
  },
  // Retrieve tools
  {
    name: 'getAxonExample',
    description: 'Get a specific Axon example by function ID or name',
    category: 'retrieve',
    params: [
      { name: 'identifier', type: 'string', required: true, description: 'Function ID or name' }
    ]
  },
  {
    name: 'getAxonPattern',
    description: 'Get a common Axon pattern by ID or search keyword',
    category: 'retrieve',
    params: [
      { name: 'patternId', type: 'string', required: false, description: 'Pattern ID (e.g., "energy-consumption-total")' },
      { name: 'keyword', type: 'string', required: false, description: 'Search keyword if pattern ID not provided' }
    ]
  },
  {
    name: 'listAxonPatterns',
    description: 'List all available code patterns',
    category: 'retrieve',
    params: []
  },
  {
    name: 'listAxonCategories',
    description: 'List all example categories',
    category: 'retrieve',
    params: []
  },
  {
    name: 'listAxonTemplates',
    description: 'List available code templates',
    category: 'retrieve',
    params: []
  },
  // SkySpark tools
  {
    name: 'listSkySparkProjects',
    description: 'List all SkySpark projects',
    category: 'skyspark',
    params: []
  },
  {
    name: 'discoverProjectFunctions',
    description: 'Discover functions in current project',
    category: 'skyspark',
    params: [
      { name: 'filter', type: 'string', required: false, description: 'Filter pattern' }
    ]
  },
  {
    name: 'getProjectSchema',
    description: 'Get schema for current project',
    category: 'skyspark',
    params: []
  },
  {
    name: 'queryHaystack',
    description: 'Execute Haystack query',
    category: 'skyspark',
    params: [
      { name: 'filter', type: 'string', required: true, description: 'Axon filter expression' },
      { name: 'limit', type: 'number', required: false, description: 'Max results', default: 100 }
    ]
  },
  // Execute tools
  {
    name: 'validateAxonCode',
    description: 'Validate Axon code syntax',
    category: 'execute',
    params: [
      { name: 'code', type: 'string', required: true, description: 'Axon code to validate' }
    ]
  },
  {
    name: 'executeAxonCode',
    description: 'Execute Axon code on SkySpark',
    category: 'execute',
    params: [
      { name: 'code', type: 'string', required: true, description: 'Axon code to execute' }
    ]
  },
  {
    name: 'clearProjectCache',
    description: 'Clear project cache',
    category: 'execute',
    params: []
  }
];

export class McpExplorer {
  public static readonly viewType = 'axon.mcpExplorer';

  private static _instance: McpExplorer | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _mcpClient: HttpMcpClient;
  private readonly _logger = getLogger();
  private _disposables: vscode.Disposable[] = [];
  private _projects: ProjectInfo[] = [];
  private _primaryProject: PrimaryProjectContext | null = null;
  private _mcpSessionId: string | null = null;

  public static createOrShow(extensionUri: vscode.Uri): void {
    if (McpExplorer._instance) {
      McpExplorer._instance._panel.reveal(vscode.ViewColumn.Two);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      McpExplorer.viewType,
      'MCP Explorer',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri]
      }
    );

    McpExplorer._instance = new McpExplorer(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._mcpClient = getMcpClient();

    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'refresh':
            await this._loadProjects();
            break;

          case 'setProject':
            await this._setProject(message.instance, message.project);
            break;

          case 'execute':
            await this._executeTool(message.tool, message.params);
            break;
        }
      },
      null,
      this._disposables
    );

    this._mcpClient.onProjectChange(project => {
      this._primaryProject = project;
      this._updateWebview();
    });

    this._loadProjects();
  }

  public dispose(): void {
    McpExplorer._instance = undefined;
    this._mcpSessionId = null;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private async _loadProjects(): Promise<void> {
    try {
      await this._mcpClient.initialize();
      this._projects = await this._mcpClient.getProjects();
      this._primaryProject = await this._mcpClient.getPrimaryProject();
      this._updateWebview();
    } catch (error) {
      this._logger.error('Failed to load projects', error as Error);
      this._postMessage({
        type: 'error',
        message: 'Failed to connect to MCP server. Is it running?'
      });
      this._postMessage({
        type: 'update',
        projects: [],
        primaryProject: null,
        isConnected: false
      });
    }
  }

  private async _setProject(instance: string, project: string): Promise<void> {
    try {
      this._primaryProject = await this._mcpClient.setPrimaryProject(instance, project);
      this._updateWebview();
      vscode.window.showInformationMessage(`Switched to project: ${instance}/${project}`);
    } catch (error) {
      this._logger.error('Failed to set project', error as Error);
      vscode.window.showErrorMessage('Failed to switch project');
    }
  }

  private async _executeTool(toolName: string, params: Record<string, unknown>): Promise<void> {
    this._postMessage({ type: 'executing', isExecuting: true });

    try {
      // Call MCP tool via the HTTP endpoint
      const result = await this._callMcpTool(toolName, params);

      this._postMessage({
        type: 'result',
        tool: toolName,
        result: result
      });
    } catch (error) {
      this._logger.error(`Failed to execute tool ${toolName}`, error as Error);
      this._postMessage({
        type: 'error',
        message: `Execution failed: ${error instanceof Error ? error.message : String(error)}`
      });
    } finally {
      this._postMessage({ type: 'executing', isExecuting: false });
    }
  }

  /**
   * Ensure we have an active MCP session, initializing if needed
   */
  private async _ensureMcpSession(): Promise<string> {
    if (this._mcpSessionId) {
      return this._mcpSessionId;
    }

    const config = vscode.workspace.getConfiguration('axon');
    const baseUrl = config.get<string>('server.url') || 'http://localhost:3847';
    const url = `${baseUrl}/mcp`;

    // Send initialize request to get a session ID
    const initRequest = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'axon-vscode-mcp-explorer',
          version: '1.0.0'
        }
      }
    };

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
      throw new Error(`Failed to initialize MCP session: HTTP ${response.status}: ${errorText}`);
    }

    // Get session ID from response header
    const sessionId = response.headers.get('mcp-session-id');
    if (!sessionId) {
      throw new Error('MCP server did not return a session ID');
    }

    this._mcpSessionId = sessionId;
    this._logger.info(`MCP session initialized: ${sessionId}`);

    // Send initialized notification
    const initializedNotification = {
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    };

    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'mcp-session-id': sessionId
      },
      body: JSON.stringify(initializedNotification)
    });

    return sessionId;
  }

  private async _callMcpTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const config = vscode.workspace.getConfiguration('axon');
    const baseUrl = config.get<string>('server.url') || 'http://localhost:3847';
    const url = `${baseUrl}/mcp`;

    // Ensure we have a session
    const sessionId = await this._ensureMcpSession();

    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'mcp-session-id': sessionId
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const errorText = await response.text();
      // If session expired, clear it and retry once
      if (response.status === 400 && errorText.includes('session')) {
        this._mcpSessionId = null;
        return this._callMcpTool(toolName, args);
      }
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    // Parse SSE response format
    const text = await response.text();
    const result = this._parseSSEResponse(text);

    if (result.error) {
      throw new Error(result.error.message);
    }

    const content = result.result?.content?.[0]?.text;
    if (content) {
      try {
        return JSON.parse(content);
      } catch {
        return content;
      }
    }

    return result.result;
  }

  /**
   * Parse Server-Sent Events (SSE) response format
   */
  private _parseSSEResponse(text: string): { result?: { content?: Array<{ text?: string }> }; error?: { message: string } } {
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
          this._logger.warn(`Failed to parse SSE data: ${data.substring(0, 100)}`);
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

  private _updateWebview(): void {
    this._postMessage({
      type: 'update',
      projects: this._projects,
      primaryProject: this._primaryProject,
      isConnected: this._mcpClient.isConnected
    });
  }

  private _postMessage(message: unknown): void {
    this._panel.webview.postMessage(message);
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();

    // Group tools by category
    const toolsByCategory = {
      search: MCP_TOOLS.filter(t => t.category === 'search'),
      retrieve: MCP_TOOLS.filter(t => t.category === 'retrieve'),
      skyspark: MCP_TOOLS.filter(t => t.category === 'skyspark'),
      execute: MCP_TOOLS.filter(t => t.category === 'execute')
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>MCP Explorer</title>
  <style>
    :root {
      --container-padding: 12px;
      --input-padding: 8px;
      --border-radius: 4px;
    }

    body {
      padding: var(--container-padding);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
    }

    .section {
      margin-bottom: 16px;
    }

    .section-title {
      font-weight: 600;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }

    .status-connected { background: var(--vscode-testing-iconPassed); }
    .status-disconnected { background: var(--vscode-testing-iconFailed); }

    select, input, textarea {
      width: 100%;
      padding: var(--input-padding);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: var(--border-radius);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: inherit;
      font-size: inherit;
      box-sizing: border-box;
    }

    select {
      cursor: pointer;
    }

    textarea {
      min-height: 80px;
      resize: vertical;
      font-family: var(--vscode-editor-font-family, monospace);
    }

    select:focus, input:focus, textarea:focus {
      outline: 1px solid var(--vscode-focusBorder);
      border-color: var(--vscode-focusBorder);
    }

    /* Project search combobox */
    .project-search-container {
      position: relative;
      display: flex;
      width: 100%;
    }

    .project-search {
      flex: 1;
      padding: var(--input-padding);
      padding-right: 32px;
    }

    .project-search::placeholder {
      color: var(--vscode-input-placeholderForeground);
    }

    .dropdown-toggle {
      position: absolute;
      right: 1px;
      top: 1px;
      bottom: 1px;
      width: 28px;
      background: var(--vscode-input-background);
      border: none;
      border-left: 1px solid var(--vscode-input-border);
      border-radius: 0 3px 3px 0;
      cursor: pointer;
      color: var(--vscode-foreground);
      font-size: 10px;
      opacity: 0.7;
    }

    .dropdown-toggle:hover {
      opacity: 1;
      background: var(--vscode-list-hoverBackground);
    }

    .project-list {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      max-height: 200px;
      overflow-y: auto;
      background: var(--vscode-dropdown-background, var(--vscode-input-background));
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-input-border));
      border-top: none;
      border-radius: 0 0 var(--border-radius) var(--border-radius);
      z-index: 100;
      display: none;
    }

    .project-list.visible { display: block; }

    .project-item {
      padding: var(--input-padding) 12px;
      cursor: pointer;
    }

    .project-item:hover, .project-item.highlighted {
      background: var(--vscode-list-hoverBackground);
    }

    .project-item.selected {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }

    .project-item .match {
      font-weight: bold;
      color: var(--vscode-textLink-foreground);
    }

    .no-results {
      padding: var(--input-padding) 12px;
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }

    button {
      width: 100%;
      padding: var(--input-padding);
      border-radius: var(--border-radius);
      cursor: pointer;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      font-weight: 500;
    }

    button:hover { background: var(--vscode-button-hoverBackground); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }

    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    button.secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .tool-description {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
    }

    .param-group {
      margin-bottom: 12px;
    }

    .param-label {
      display: block;
      margin-bottom: 4px;
      font-size: 0.9em;
    }

    .param-label .required {
      color: var(--vscode-errorForeground);
    }

    .param-hint {
      font-size: 0.8em;
      color: var(--vscode-descriptionForeground);
      margin-top: 2px;
    }

    .results-container {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: var(--border-radius);
      max-height: 400px;
      overflow: auto;
      position: relative;
    }

    .results-header {
      padding: 8px 12px;
      background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
      border-bottom: 1px solid var(--vscode-panel-border);
      font-weight: 600;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .results-content {
      padding: 12px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.5;
    }

    /* Syntax highlighting for JSON */
    .json-key { color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe); }
    .json-string { color: var(--vscode-symbolIcon-stringForeground, #ce9178); }
    .json-number { color: var(--vscode-symbolIcon-numberForeground, #b5cea8); }
    .json-boolean { color: var(--vscode-symbolIcon-booleanForeground, #569cd6); }
    .json-null { color: var(--vscode-symbolIcon-nullForeground, #569cd6); }

    .copy-btn {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      font-size: 12px;
      border-radius: 3px;
      transition: all 0.15s ease;
    }

    .copy-btn:hover {
      transform: scale(1.02);
    }

    .copy-btn.copied {
      background: var(--vscode-testing-iconPassed) !important;
      color: white !important;
    }

    .copy-icon::before { content: "📋"; font-size: 11px; }
    .copied .copy-icon::before { content: "✓"; }

    .error-message {
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-inputValidation-errorForeground);
      padding: 8px;
      border-radius: var(--border-radius);
      margin-top: 8px;
    }

    .loading {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--vscode-descriptionForeground);
      padding: 12px;
    }

    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid var(--vscode-progressBar-background);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .hidden { display: none; }

    .project-info {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
    }

    optgroup {
      font-weight: 600;
      color: var(--vscode-foreground);
    }
  </style>
</head>
<body>
  <!-- Connection Status -->
  <div class="section">
    <div class="section-title">
      <span class="status-indicator" id="connectionStatus"></span>
      <span id="connectionText">Connecting...</span>
      <button id="refreshBtn" style="width: auto; padding: 4px 8px; margin-left: auto;">Refresh</button>
    </div>
  </div>

  <!-- Project Selection -->
  <div class="section">
    <div class="section-title">Project</div>
    <div class="project-search-container">
      <input type="text" id="projectSearch" class="project-search" placeholder="Type to search or click ▼" autocomplete="off">
      <button id="dropdownToggle" class="dropdown-toggle" title="Show all projects">▼</button>
      <div id="projectList" class="project-list"></div>
    </div>
    <div class="project-info" id="projectInfo"></div>
  </div>

  <!-- Tool Selection -->
  <div class="section">
    <div class="section-title">MCP Tool</div>
    <select id="toolSelect">
      <option value="">Select a tool...</option>
      <optgroup label="Search">
        ${toolsByCategory.search.map(t => `<option value="${t.name}">${t.name}</option>`).join('')}
      </optgroup>
      <optgroup label="Retrieve">
        ${toolsByCategory.retrieve.map(t => `<option value="${t.name}">${t.name}</option>`).join('')}
      </optgroup>
      <optgroup label="SkySpark">
        ${toolsByCategory.skyspark.map(t => `<option value="${t.name}">${t.name}</option>`).join('')}
      </optgroup>
      <optgroup label="Execute">
        ${toolsByCategory.execute.map(t => `<option value="${t.name}">${t.name}</option>`).join('')}
      </optgroup>
    </select>
    <div class="tool-description" id="toolDescription"></div>
  </div>

  <!-- Dynamic Parameters -->
  <div class="section" id="paramsSection" style="display: none;">
    <div class="section-title">Parameters</div>
    <div id="paramsContainer"></div>
  </div>

  <!-- Execute Button -->
  <div class="section">
    <button id="executeBtn" disabled>Execute</button>
    <div class="loading hidden" id="loadingIndicator">
      <div class="spinner"></div>
      <span>Executing...</span>
    </div>
  </div>

  <!-- Results -->
  <div class="section" id="resultsSection" style="display: none;">
    <div class="results-container">
      <div class="results-header">
        <span id="resultsTitle">Results</span>
        <button id="copyResultsBtn" class="secondary copy-btn" style="width: auto;"><span class="copy-icon"></span> Copy</button>
      </div>
      <div class="results-content" id="resultsContent"></div>
    </div>
  </div>

  <div class="error-message hidden" id="errorMessage"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // Tool definitions
    const TOOLS = ${JSON.stringify(MCP_TOOLS)};

    // State
    let allProjects = [];
    let currentProject = null;
    let highlightedIndex = -1;
    let currentResult = null;

    // Elements
    const connectionStatus = document.getElementById('connectionStatus');
    const connectionText = document.getElementById('connectionText');
    const refreshBtn = document.getElementById('refreshBtn');
    const projectSearch = document.getElementById('projectSearch');
    const dropdownToggle = document.getElementById('dropdownToggle');
    const projectList = document.getElementById('projectList');
    const projectInfo = document.getElementById('projectInfo');
    const toolSelect = document.getElementById('toolSelect');
    const toolDescription = document.getElementById('toolDescription');
    const paramsSection = document.getElementById('paramsSection');
    const paramsContainer = document.getElementById('paramsContainer');
    const executeBtn = document.getElementById('executeBtn');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const resultsSection = document.getElementById('resultsSection');
    const resultsTitle = document.getElementById('resultsTitle');
    const resultsContent = document.getElementById('resultsContent');
    const copyResultsBtn = document.getElementById('copyResultsBtn');
    const errorMessage = document.getElementById('errorMessage');

    // Project search functions
    function filterProjects(query) {
      if (!query) return allProjects;
      const lowerQuery = query.toLowerCase();
      return allProjects.filter(p => {
        const fullName = (p.instance + '/' + p.project).toLowerCase();
        return fullName.includes(lowerQuery);
      });
    }

    function renderProjectList(projects, query) {
      projectList.innerHTML = '';
      highlightedIndex = -1;

      if (projects.length === 0) {
        projectList.innerHTML = '<div class="no-results">No matching projects</div>';
        projectList.classList.add('visible');
        return;
      }

      projects.forEach((p, index) => {
        const item = document.createElement('div');
        item.className = 'project-item';
        item.dataset.instance = p.instance;
        item.dataset.project = p.project;

        const fullName = p.instance + '/' + p.project;

        if (query) {
          const lowerName = fullName.toLowerCase();
          const lowerQuery = query.toLowerCase();
          const matchIndex = lowerName.indexOf(lowerQuery);
          if (matchIndex >= 0) {
            item.innerHTML =
              fullName.substring(0, matchIndex) +
              '<span class="match">' + fullName.substring(matchIndex, matchIndex + query.length) + '</span>' +
              fullName.substring(matchIndex + query.length);
          } else {
            item.textContent = fullName;
          }
        } else {
          item.textContent = fullName;
        }

        if (currentProject && p.instance === currentProject.instance && p.project === currentProject.project) {
          item.classList.add('selected');
        }

        item.addEventListener('click', () => selectProject(p));
        item.addEventListener('mouseenter', () => {
          highlightedIndex = index;
          updateHighlight();
        });

        projectList.appendChild(item);
      });

      projectList.classList.add('visible');
    }

    function updateHighlight() {
      const items = document.querySelectorAll('.project-item');
      items.forEach((item, index) => {
        item.classList.toggle('highlighted', index === highlightedIndex);
      });
    }

    function selectProject(project) {
      projectSearch.value = project.instance + '/' + project.project;
      projectList.classList.remove('visible');
      currentProject = project;
      updateExecuteButton();

      vscode.postMessage({
        type: 'setProject',
        instance: project.instance,
        project: project.project
      });
    }

    function hideProjectList() {
      projectList.classList.remove('visible');
      highlightedIndex = -1;
    }

    // Tool selection
    function onToolSelect() {
      const toolName = toolSelect.value;
      const tool = TOOLS.find(t => t.name === toolName);

      if (!tool) {
        toolDescription.textContent = '';
        paramsSection.style.display = 'none';
        updateExecuteButton();
        return;
      }

      toolDescription.textContent = tool.description;

      // Render parameters
      if (tool.params.length > 0) {
        paramsContainer.innerHTML = '';
        tool.params.forEach(param => {
          const group = document.createElement('div');
          group.className = 'param-group';

          const label = document.createElement('label');
          label.className = 'param-label';
          label.innerHTML = param.name + (param.required ? ' <span class="required">*</span>' : '');

          let input;
          if (param.name === 'code' || param.name === 'filter') {
            input = document.createElement('textarea');
          } else {
            input = document.createElement('input');
            input.type = param.type === 'number' ? 'number' : 'text';
          }
          input.id = 'param-' + param.name;
          input.dataset.param = param.name;
          input.dataset.type = param.type;
          input.dataset.required = param.required;
          if (param.default !== undefined) {
            input.value = param.default;
            input.placeholder = 'Default: ' + param.default;
          }
          input.addEventListener('input', updateExecuteButton);

          const hint = document.createElement('div');
          hint.className = 'param-hint';
          hint.textContent = param.description;

          group.appendChild(label);
          group.appendChild(input);
          group.appendChild(hint);
          paramsContainer.appendChild(group);
        });
        paramsSection.style.display = 'block';
      } else {
        paramsSection.style.display = 'none';
      }

      updateExecuteButton();
    }

    function updateExecuteButton() {
      const toolName = toolSelect.value;
      if (!toolName) {
        executeBtn.disabled = true;
        return;
      }

      const tool = TOOLS.find(t => t.name === toolName);
      if (!tool) {
        executeBtn.disabled = true;
        return;
      }

      // Check required params
      let allFilled = true;
      tool.params.forEach(param => {
        if (param.required) {
          const input = document.getElementById('param-' + param.name);
          if (!input || !input.value.trim()) {
            allFilled = false;
          }
        }
      });

      executeBtn.disabled = !allFilled;
    }

    function executeSelectedTool() {
      const toolName = toolSelect.value;
      const tool = TOOLS.find(t => t.name === toolName);
      if (!tool) return;

      const params = {};
      tool.params.forEach(param => {
        const input = document.getElementById('param-' + param.name);
        if (input && input.value) {
          if (param.type === 'number') {
            params[param.name] = parseInt(input.value, 10);
          } else if (param.type === 'boolean') {
            params[param.name] = input.value === 'true';
          } else {
            params[param.name] = input.value;
          }
        }
      });

      vscode.postMessage({
        type: 'execute',
        tool: toolName,
        params: params
      });
    }

    // Event listeners
    refreshBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'refresh' });
    });

    projectSearch.addEventListener('input', (e) => {
      const query = e.target.value;
      const filtered = filterProjects(query);
      renderProjectList(filtered, query);
    });

    projectSearch.addEventListener('focus', () => {
      const query = projectSearch.value;
      if (currentProject && query === currentProject.instance + '/' + currentProject.project) {
        renderProjectList(allProjects, '');
      } else {
        renderProjectList(filterProjects(query), query);
      }
    });

    projectSearch.addEventListener('keydown', (e) => {
      const filtered = filterProjects(projectSearch.value);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlightedIndex = Math.min(highlightedIndex + 1, filtered.length - 1);
        updateHighlight();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlightedIndex = Math.max(highlightedIndex - 1, 0);
        updateHighlight();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filtered.length) {
          selectProject(filtered[highlightedIndex]);
        } else if (filtered.length > 0) {
          selectProject(filtered[0]);
        }
      } else if (e.key === 'Escape') {
        hideProjectList();
        projectSearch.blur();
      }
    });

    dropdownToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (projectList.classList.contains('visible')) {
        hideProjectList();
      } else {
        renderProjectList(allProjects, '');
        projectSearch.focus();
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.project-search-container')) {
        hideProjectList();
      }
    });

    toolSelect.addEventListener('change', onToolSelect);

    executeBtn.addEventListener('click', executeSelectedTool);

    copyResultsBtn.addEventListener('click', () => {
      if (currentResult) {
        navigator.clipboard.writeText(JSON.stringify(currentResult, null, 2));
        // Visual feedback
        copyResultsBtn.classList.add('copied');
        copyResultsBtn.innerHTML = '<span class="copy-icon"></span> Copied!';
        setTimeout(() => {
          copyResultsBtn.classList.remove('copied');
          copyResultsBtn.innerHTML = '<span class="copy-icon"></span> Copy';
        }, 1500);
      }
    });

    // Syntax highlight JSON
    function syntaxHighlight(json) {
      if (typeof json !== 'string') {
        json = JSON.stringify(json, null, 2);
      }
      // Escape HTML
      json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return json.replace(
        /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
        function(match) {
          let cls = 'json-number';
          if (/^"/.test(match)) {
            if (/:$/.test(match)) {
              cls = 'json-key';
            } else {
              cls = 'json-string';
            }
          } else if (/true|false/.test(match)) {
            cls = 'json-boolean';
          } else if (/null/.test(match)) {
            cls = 'json-null';
          }
          return '<span class="' + cls + '">' + match + '</span>';
        }
      );
    }

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;

      switch (message.type) {
        case 'update':
          allProjects = message.projects || [];
          currentProject = message.primaryProject;

          if (message.isConnected) {
            connectionStatus.className = 'status-indicator status-connected';
            connectionText.textContent = 'Connected';
          } else {
            connectionStatus.className = 'status-indicator status-disconnected';
            connectionText.textContent = 'Disconnected';
          }

          if (allProjects.length > 0) {
            projectSearch.placeholder = 'Type to search or click ▼';
            if (currentProject) {
              projectSearch.value = currentProject.instance + '/' + currentProject.project;
              projectInfo.textContent = 'Set by: ' + currentProject.setBy +
                (currentProject.timestamp ? ' at ' + new Date(currentProject.timestamp).toLocaleString() : '');
            }
          } else {
            projectSearch.placeholder = 'No projects available';
            projectInfo.textContent = '';
          }
          break;

        case 'executing':
          executeBtn.disabled = message.isExecuting;
          loadingIndicator.classList.toggle('hidden', !message.isExecuting);
          if (message.isExecuting) {
            errorMessage.classList.add('hidden');
          }
          break;

        case 'result':
          currentResult = message.result;
          resultsTitle.textContent = message.tool + ' Results';
          resultsContent.innerHTML = syntaxHighlight(message.result);
          resultsSection.style.display = 'block';
          errorMessage.classList.add('hidden');
          break;

        case 'error':
          errorMessage.textContent = message.message;
          errorMessage.classList.remove('hidden');
          resultsSection.style.display = 'none';
          break;
      }
    });

    // Initial request
    vscode.postMessage({ type: 'refresh' });
  </script>
</body>
</html>`;
  }
}
