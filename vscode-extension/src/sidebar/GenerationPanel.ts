/**
 * Generation Panel - Editor area webview panel for Axon code generation
 *
 * Opens in the editor area (right side) like Cline/Claude Code extensions.
 *
 * Features:
 * - Project dropdown (populated from MCP server, syncs with Dashboard)
 * - Generation type selector
 * - Prompt input
 * - Generate button
 * - Code preview with syntax highlighting
 * - Commit button
 */

import * as vscode from 'vscode';
import { getMcpClient, HttpMcpClient, ProjectInfo, PrimaryProjectContext, GenerationType } from '../mcp/HttpMcpClient';
import { getLogger } from '../utils/logger';
import { getNonce } from '../utils/getNonce';

export class GenerationPanel {
  public static readonly viewType = 'axon.generationPanel';

  private static _instance: GenerationPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _mcpClient: HttpMcpClient;
  private readonly _logger = getLogger();
  private _disposables: vscode.Disposable[] = [];
  private _projects: ProjectInfo[] = [];
  private _primaryProject: PrimaryProjectContext | null = null;
  private _generatedCode: string = '';
  private _generatedFunctionName: string = '';

  public static createOrShow(extensionUri: vscode.Uri): void {
    // If we already have a panel, show it in the right column
    if (GenerationPanel._instance) {
      GenerationPanel._instance._panel.reveal(vscode.ViewColumn.Two);
      return;
    }

    // Always open in the second column (right side)
    const panel = vscode.window.createWebviewPanel(
      GenerationPanel.viewType,
      'Axon Generation',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri]
      }
    );

    GenerationPanel._instance = new GenerationPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._mcpClient = getMcpClient();

    // Set the webview's initial html content
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'refresh':
            await this._loadProjects();
            break;

          case 'setProject':
            await this._setProject(message.instance, message.project);
            break;

          case 'generate':
            await this._generateCode(message.prompt, message.generationType);
            break;

          case 'commit':
            await this._commitCode();
            break;

          case 'copyCode':
            await vscode.env.clipboard.writeText(this._generatedCode);
            vscode.window.showInformationMessage('Code copied to clipboard');
            break;

          case 'insertCode':
            await this._insertCodeToEditor();
            break;
        }
      },
      null,
      this._disposables
    );

    // Listen for project changes
    this._mcpClient.onProjectChange(project => {
      this._primaryProject = project;
      this._updateWebview();
    });

    // Initial load
    this._loadProjects();
  }

  public dispose(): void {
    GenerationPanel._instance = undefined;

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
      // Re-initialize connection status
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
      // Ensure webview shows disconnected state
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

  private async _generateCode(prompt: string, generationType: string): Promise<void> {
    if (!prompt.trim()) {
      vscode.window.showWarningMessage('Please enter a prompt');
      return;
    }

    if (!this._primaryProject) {
      vscode.window.showWarningMessage('Please select a project first');
      return;
    }

    this._postMessage({ type: 'generating', isGenerating: true });

    try {
      const result = await this._mcpClient.generateCode({
        prompt,
        type: generationType as GenerationType
      });

      this._generatedCode = result.code;
      this._generatedFunctionName = result.functionName || '';

      this._postMessage({
        type: 'generated',
        code: result.code,
        explanation: result.explanation,
        functionName: result.functionName
      });
    } catch (error) {
      this._logger.error('Failed to generate code', error as Error);
      this._postMessage({
        type: 'error',
        message: `Generation failed: ${error instanceof Error ? error.message : String(error)}`
      });
    } finally {
      this._postMessage({ type: 'generating', isGenerating: false });
    }
  }

  private async _commitCode(): Promise<void> {
    if (!this._generatedCode) {
      vscode.window.showWarningMessage('No code to commit');
      return;
    }

    // Prompt for function name if not available
    let functionName = this._generatedFunctionName;
    if (!functionName) {
      const input = await vscode.window.showInputBox({
        prompt: 'Enter function name',
        placeHolder: 'myFunction',
        validateInput: (value) => {
          if (!value) return 'Function name is required';
          if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(value)) {
            return 'Function name must start with a letter and contain only alphanumeric characters';
          }
          return null;
        }
      });

      if (!input) return;
      functionName = input;
    }

    // Confirm commit
    const confirm = await vscode.window.showWarningMessage(
      `Commit function "${functionName}" to ${this._primaryProject?.instance}/${this._primaryProject?.project}?`,
      { modal: true },
      'Commit'
    );

    if (confirm !== 'Commit') return;

    try {
      const result = await this._mcpClient.commitFunction(
        functionName,
        this._generatedCode
      );

      if (result.success) {
        vscode.window.showInformationMessage(`Function "${functionName}" committed successfully`);
        if (result.backupPath) {
          this._logger.info(`Backup created at: ${result.backupPath}`);
        }
      } else {
        vscode.window.showErrorMessage(`Commit failed: ${result.message}`);
      }
    } catch (error) {
      this._logger.error('Failed to commit code', error as Error);
      vscode.window.showErrorMessage(`Commit failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async _insertCodeToEditor(): Promise<void> {
    if (!this._generatedCode) {
      vscode.window.showWarningMessage('No code to insert');
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      // Create a new document
      const doc = await vscode.workspace.openTextDocument({
        content: this._generatedCode,
        language: 'axon'
      });
      await vscode.window.showTextDocument(doc);
    } else {
      // Insert at cursor
      await editor.edit(editBuilder => {
        editBuilder.insert(editor.selection.active, this._generatedCode);
      });
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

    const generationTypes = [
      { value: 'sparkRule', label: 'Spark Rule', description: 'SkySpark rule that runs on data changes' },
      { value: 'kpiRule', label: 'KPI Rule', description: 'Key Performance Indicator calculation rule' },
      { value: 'importScript', label: 'Import Script', description: 'Data import and transformation script' },
      { value: 'taskScript', label: 'Task Script', description: 'Scheduled or triggered task' },
      { value: 'jobScript', label: 'Job Script', description: 'Background job processor' },
      { value: 'skysparkApp', label: 'SkySpark App', description: 'View Framework application' },
      { value: 'function', label: 'Function', description: 'Reusable Axon function' },
      { value: 'general', label: 'General', description: 'General Axon code' }
    ];

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Axon Generation</title>
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

    .status-connected {
      background: var(--vscode-testing-iconPassed);
    }

    .status-disconnected {
      background: var(--vscode-testing-iconFailed);
    }

    select, input, textarea {
      width: 100%;
      padding: var(--input-padding);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border, #ccc));
      border-radius: var(--border-radius);
      background: var(--vscode-input-background, var(--vscode-editor-background, #fff));
      color: var(--vscode-input-foreground, var(--vscode-foreground, #000));
      font-family: inherit;
      font-size: inherit;
      box-sizing: border-box;
      -webkit-appearance: none;
      appearance: none;
    }

    select {
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M2 4l4 4 4-4z'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 8px center;
      padding-right: 28px;
      cursor: pointer;
    }

    .project-search-container {
      position: relative;
      display: flex;
      width: 100%;
    }

    .project-search {
      flex: 1;
      padding: var(--input-padding);
      padding-right: 32px;
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border, #ccc));
      border-radius: var(--border-radius);
      background: var(--vscode-input-background, var(--vscode-editor-background, #fff));
      color: var(--vscode-input-foreground, var(--vscode-foreground, #000));
      font-family: inherit;
      font-size: inherit;
      box-sizing: border-box;
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

    .project-list.visible {
      display: block;
    }

    .project-item {
      padding: var(--input-padding) 12px;
      cursor: pointer;
    }

    .project-item:hover,
    .project-item.highlighted {
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
      font-family: inherit;
      font-size: inherit;
      box-sizing: border-box;
    }

    select:focus, input:focus, textarea:focus {
      outline: 1px solid var(--vscode-focusBorder, #007acc);
      border-color: var(--vscode-focusBorder, #007acc);
    }

    select:hover, input:hover, textarea:hover {
      border-color: var(--vscode-input-border, var(--vscode-focusBorder, #999));
    }

    textarea {
      min-height: 100px;
      resize: vertical;
      background-image: none;
    }

    button {
      cursor: pointer;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 10px;
      font-weight: 500;
    }

    button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    button.secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .button-group {
      display: flex;
      gap: 8px;
    }

    .button-group button {
      flex: 1;
    }

    .code-preview {
      background: var(--vscode-editor-background, #f5f5f5);
      border: 1px solid var(--vscode-panel-border, var(--vscode-input-border, #ccc));
      border-radius: var(--border-radius);
      padding: 12px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      white-space: pre-wrap;
      overflow-x: auto;
      max-height: 300px;
      overflow-y: auto;
    }

    .code-preview:empty::before {
      content: 'Generated code will appear here...';
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }

    .explanation {
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-textBlockQuote-border);
      padding: 8px 12px;
      margin-top: 8px;
      font-size: 0.9em;
    }

    .error-message {
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-inputValidation-errorForeground);
      padding: 8px;
      border-radius: var(--border-radius);
      margin-top: 8px;
    }

    .project-info {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
    }

    .loading {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--vscode-descriptionForeground);
    }

    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid var(--vscode-progressBar-background);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .type-description {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
    }

    .hidden {
      display: none;
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

  <!-- Generation Type -->
  <div class="section">
    <div class="section-title">Generation Type</div>
    <select id="typeSelect">
      ${generationTypes.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
    </select>
    <div class="type-description" id="typeDescription">${generationTypes[0].description}</div>
  </div>

  <!-- Prompt Input -->
  <div class="section">
    <div class="section-title">Describe what you want to create</div>
    <textarea id="promptInput" placeholder="E.g., Create a spark rule that calculates daily energy consumption for all meters..."></textarea>
  </div>

  <!-- Generate Button -->
  <div class="section">
    <button id="generateBtn" disabled>Generate Code</button>
    <div class="loading hidden" id="loadingIndicator">
      <div class="spinner"></div>
      <span>Generating...</span>
    </div>
  </div>

  <!-- Code Preview -->
  <div class="section" id="codeSection">
    <div class="section-title">Generated Code</div>
    <div class="code-preview" id="codePreview"></div>
    <div class="explanation hidden" id="explanation"></div>
    <div class="error-message hidden" id="errorMessage"></div>
  </div>

  <!-- Action Buttons -->
  <div class="section hidden" id="actionButtons">
    <div class="button-group">
      <button id="copyBtn" class="secondary">Copy</button>
      <button id="insertBtn" class="secondary">Insert</button>
      <button id="commitBtn">Commit</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // State
    let allProjects = [];
    let currentProject = null;
    let highlightedIndex = -1;

    // Elements
    const connectionStatus = document.getElementById('connectionStatus');
    const connectionText = document.getElementById('connectionText');
    const refreshBtn = document.getElementById('refreshBtn');
    const projectSearch = document.getElementById('projectSearch');
    const dropdownToggle = document.getElementById('dropdownToggle');
    const projectList = document.getElementById('projectList');
    const projectInfo = document.getElementById('projectInfo');
    const typeSelect = document.getElementById('typeSelect');
    const typeDescription = document.getElementById('typeDescription');
    const promptInput = document.getElementById('promptInput');
    const generateBtn = document.getElementById('generateBtn');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const codePreview = document.getElementById('codePreview');
    const explanation = document.getElementById('explanation');
    const errorMessage = document.getElementById('errorMessage');
    const actionButtons = document.getElementById('actionButtons');
    const copyBtn = document.getElementById('copyBtn');
    const insertBtn = document.getElementById('insertBtn');
    const commitBtn = document.getElementById('commitBtn');

    // Type descriptions
    const typeDescriptions = ${JSON.stringify(Object.fromEntries(generationTypes.map(t => [t.value, t.description])))};

    // Project search/filter functions
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
        item.dataset.index = index;

        const fullName = p.instance + '/' + p.project;

        // Highlight matching text
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

        // Mark current project
        if (currentProject &&
          p.instance === currentProject.instance &&
          p.project === currentProject.project) {
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
      updateGenerateButton();

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

    // Event listeners
    refreshBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'refresh' });
    });

    // Project search events
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
        const filtered = filterProjects(query);
        renderProjectList(filtered, query);
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
        } else if (filtered.length === 1) {
          selectProject(filtered[0]);
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

    // Click outside to close
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.project-search-container')) {
        hideProjectList();
      }
    });

    typeSelect.addEventListener('change', () => {
      typeDescription.textContent = typeDescriptions[typeSelect.value] || '';
    });

    promptInput.addEventListener('input', updateGenerateButton);

    generateBtn.addEventListener('click', () => {
      vscode.postMessage({
        type: 'generate',
        prompt: promptInput.value,
        generationType: typeSelect.value
      });
    });

    copyBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'copyCode' });
    });

    insertBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'insertCode' });
    });

    commitBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'commit' });
    });

    function updateGenerateButton() {
      const hasProject = currentProject || projectSearch.value.includes('/');
      generateBtn.disabled = !promptInput.value.trim() || !hasProject;
    }

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;

      switch (message.type) {
        case 'update':
          updateUI(message);
          break;

        case 'generating':
          generateBtn.disabled = message.isGenerating;
          loadingIndicator.classList.toggle('hidden', !message.isGenerating);
          if (message.isGenerating) {
            errorMessage.classList.add('hidden');
          }
          break;

        case 'generated':
          codePreview.textContent = message.code;
          if (message.explanation) {
            explanation.textContent = message.explanation;
            explanation.classList.remove('hidden');
          } else {
            explanation.classList.add('hidden');
          }
          errorMessage.classList.add('hidden');
          actionButtons.classList.remove('hidden');
          break;

        case 'error':
          errorMessage.textContent = message.message;
          errorMessage.classList.remove('hidden');
          actionButtons.classList.add('hidden');
          break;
      }
    });

    function updateUI(data) {
      // Connection status
      if (data.isConnected) {
        connectionStatus.className = 'status-indicator status-connected';
        connectionText.textContent = 'Connected';
      } else {
        connectionStatus.className = 'status-indicator status-disconnected';
        connectionText.textContent = 'Disconnected';
      }

      // Store projects
      allProjects = data.projects || [];
      currentProject = data.primaryProject;

      // Projects
      if (allProjects.length > 0) {
        projectSearch.placeholder = 'Type to search or click ▼';

        // Set primary project if available
        if (currentProject) {
          projectSearch.value = currentProject.instance + '/' + currentProject.project;
          projectInfo.textContent = 'Set by: ' + currentProject.setBy +
            (currentProject.timestamp ? ' at ' + new Date(currentProject.timestamp).toLocaleString() : '');
        } else {
          projectSearch.value = '';
          projectInfo.textContent = '';
        }
      } else {
        projectSearch.placeholder = 'No projects available';
        projectSearch.value = '';
        projectInfo.textContent = '';
      }

      updateGenerateButton();
    }

    // Initial request
    vscode.postMessage({ type: 'refresh' });
  </script>
</body>
</html>`;
  }
}
