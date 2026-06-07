import * as vscode from 'vscode';
import { getNonce } from '../utils/getNonce';
import { getMcpClient, ProjectInfo, PrimaryProjectContext } from '../mcp/HttpMcpClient';

export class SidebarProvider implements vscode.WebviewViewProvider {
  _view?: vscode.WebviewView;
  _doc?: vscode.TextDocument;
  private _currentProject: PrimaryProjectContext | null = null;
  private _projects: ProjectInfo[] = [];

  constructor(private readonly _extensionUri: vscode.Uri) {
    // Listen for project changes from the MCP client
    const mcpClient = getMcpClient();
    mcpClient.onProjectChange((project) => {
      this._currentProject = project;
      this._updateProjectDisplay();
    });
  }

  private async _loadProjectData(): Promise<void> {
    try {
      const mcpClient = getMcpClient();
      this._projects = await mcpClient.getProjects();
      this._currentProject = await mcpClient.getPrimaryProject();
      this._updateProjectDisplay();
    } catch {
      // Server not available yet
    }
  }

  private _updateProjectDisplay(): void {
    if (this._view) {
      this._view.webview.postMessage({
        type: 'updateProject',
        currentProject: this._currentProject,
        projects: this._projects
      });
    }
  }

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Load project data after view is ready
    this._loadProjectData();

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      try {
        switch (data.type) {
          case 'switchProject': {
            if (data.instance && data.project) {
              const mcpClient = getMcpClient();
              await mcpClient.setPrimaryProject(data.instance, data.project);
              this._currentProject = await mcpClient.getPrimaryProject();
              this._updateProjectDisplay();
              vscode.window.showInformationMessage(`Switched to ${data.instance}/${data.project}`);
            }
            break;
          }
          case 'refreshProjects': {
            await this._loadProjectData();
            break;
          }
          case 'openMcpExplorer': {
            await vscode.commands.executeCommand('axon.openMcpExplorer');
            break;
          }
          case 'openDashboard': {
            await vscode.commands.executeCommand('axon.openDashboard');
            break;
          }
          case 'openSettings': {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'axon.server');
            break;
          }
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Command failed: ${error}`);
      }
    });
  }

  public revive(panel: vscode.WebviewView) {
    this._view = panel;
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Axon</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            padding: 16px;
        }

        h1 {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        h2 {
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .section {
            margin-bottom: 20px;
        }

        .project-selector {
            display: flex;
            gap: 8px;
            align-items: center;
        }

        .project-search-container {
            flex: 1;
            position: relative;
            display: flex;
        }

        .project-search {
            flex: 1;
            padding: 8px 12px;
            padding-right: 32px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-size: 13px;
            outline: none;
            box-sizing: border-box;
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

        .project-search:hover {
            border-color: var(--vscode-focusBorder);
        }

        .project-search:focus {
            border-color: var(--vscode-focusBorder);
        }

        .project-search::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }

        .project-list {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            max-height: 200px;
            overflow-y: auto;
            background-color: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-top: none;
            border-radius: 0 0 4px 4px;
            z-index: 100;
            display: none;
        }

        .project-list.visible {
            display: block;
        }

        .project-item {
            padding: 8px 12px;
            cursor: pointer;
            font-size: 13px;
        }

        .project-item:hover,
        .project-item.highlighted {
            background-color: var(--vscode-list-hoverBackground);
        }

        .project-item.selected {
            background-color: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }

        .project-item .match {
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }

        .no-results {
            padding: 8px 12px;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }

        .icon-button {
            padding: 6px 10px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            line-height: 1;
        }

        .icon-button:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .project-status {
            margin-top: 8px;
            padding: 6px 10px;
            background-color: var(--vscode-editor-background);
            border-radius: 4px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .project-status.connected {
            border-left: 3px solid #2ea043;
        }

        .project-status.disconnected {
            border-left: 3px solid #d29922;
        }

        .project-status:empty {
            display: none;
        }

        .divider {
            height: 1px;
            background-color: var(--vscode-panel-border);
            margin: 16px 0;
        }

        .link-button {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            text-decoration: none;
            width: 100%;
        }

        .link-button:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
    </style>
</head>
<body>
    <h1>Axon MCP</h1>

    <div class="section">
        <h2>Project</h2>
        <div class="project-selector">
            <div class="project-search-container">
                <input type="text" id="projectSearch" class="project-search" placeholder="Type to search or click ▼" autocomplete="off">
                <button id="dropdownToggle" class="dropdown-toggle" title="Show all projects">▼</button>
                <div id="projectList" class="project-list"></div>
            </div>
            <button id="refreshProjects" class="icon-button" title="Refresh projects">
                ↻
            </button>
        </div>
        <div id="projectStatus" class="project-status"></div>
    </div>

    <div class="divider"></div>

    <div class="section">
        <h2>Tools</h2>
        <button id="openMcpExplorer" class="link-button">
            MCP Explorer
        </button>
    </div>

    <div class="divider"></div>

    <div class="section">
        <h2>Links</h2>
        <button id="openDashboard" class="link-button">
            Open Dashboard
        </button>
    </div>

    <div class="divider"></div>

    <div class="section">
        <h2>Settings</h2>
        <button id="openSettings" class="link-button">
            Server Credentials
        </button>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        let allProjects = [];
        let currentProject = null;
        let highlightedIndex = -1;

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'updateProject':
                    allProjects = message.projects || [];
                    currentProject = message.currentProject;
                    updateProjectUI(currentProject, allProjects);
                    break;
            }
        });

        function updateProjectUI(current, projects) {
            const searchInput = document.getElementById('projectSearch');
            const status = document.getElementById('projectStatus');

            if (!searchInput) return;

            if (!projects || projects.length === 0) {
                searchInput.placeholder = 'No projects available';
                searchInput.value = '';
                status.textContent = 'Connect to MCP server to see projects';
                status.className = 'project-status disconnected';
                return;
            }

            searchInput.placeholder = 'Type to search or click ▼';

            // Update status and input value
            if (current) {
                searchInput.value = current.instance + '/' + current.project;
                status.textContent = 'Active: ' + current.instance + '/' + current.project;
                status.className = 'project-status connected';
            } else {
                searchInput.value = '';
                status.textContent = 'No project selected';
                status.className = 'project-status disconnected';
            }
        }

        function filterProjects(query) {
            if (!query) return allProjects;
            const lowerQuery = query.toLowerCase();
            return allProjects.filter(p => {
                const fullName = (p.instance + '/' + p.project).toLowerCase();
                return fullName.includes(lowerQuery);
            });
        }

        function renderProjectList(projects, query) {
            const list = document.getElementById('projectList');
            if (!list) return;

            list.innerHTML = '';
            highlightedIndex = -1;

            if (projects.length === 0) {
                list.innerHTML = '<div class="no-results">No matching projects</div>';
                list.classList.add('visible');
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

                list.appendChild(item);
            });

            list.classList.add('visible');
        }

        function updateHighlight() {
            const items = document.querySelectorAll('.project-item');
            items.forEach((item, index) => {
                item.classList.toggle('highlighted', index === highlightedIndex);
            });
        }

        function selectProject(project) {
            const searchInput = document.getElementById('projectSearch');
            const list = document.getElementById('projectList');

            searchInput.value = project.instance + '/' + project.project;
            list.classList.remove('visible');

            vscode.postMessage({
                type: 'switchProject',
                instance: project.instance,
                project: project.project
            });
        }

        function hideList() {
            const list = document.getElementById('projectList');
            if (list) {
                list.classList.remove('visible');
                highlightedIndex = -1;
            }
        }

        // Add event listeners
        document.addEventListener('DOMContentLoaded', () => {
            const searchInput = document.getElementById('projectSearch');
            const dropdownToggle = document.getElementById('dropdownToggle');
            const list = document.getElementById('projectList');

            // Search input events
            searchInput?.addEventListener('input', (e) => {
                const query = e.target.value;
                const filtered = filterProjects(query);
                renderProjectList(filtered, query);
            });

            searchInput?.addEventListener('focus', () => {
                const query = searchInput.value;
                // If input matches current project, show all; otherwise filter
                if (currentProject && query === currentProject.instance + '/' + currentProject.project) {
                    renderProjectList(allProjects, '');
                } else {
                    const filtered = filterProjects(query);
                    renderProjectList(filtered, query);
                }
            });

            searchInput?.addEventListener('keydown', (e) => {
                const items = document.querySelectorAll('.project-item');
                const filtered = filterProjects(searchInput.value);

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
                    hideList();
                    searchInput.blur();
                }
            });

            // Dropdown toggle
            dropdownToggle?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (list?.classList.contains('visible')) {
                    hideList();
                } else {
                    renderProjectList(allProjects, '');
                    searchInput?.focus();
                }
            });

            // Click outside to close
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.project-search-container')) {
                    hideList();
                }
            });

            document.getElementById('refreshProjects')?.addEventListener('click', () => {
                vscode.postMessage({ type: 'refreshProjects' });
            });

            document.getElementById('openMcpExplorer')?.addEventListener('click', () => {
                vscode.postMessage({ type: 'openMcpExplorer' });
            });

            document.getElementById('openDashboard')?.addEventListener('click', () => {
                vscode.postMessage({ type: 'openDashboard' });
            });

            document.getElementById('openSettings')?.addEventListener('click', () => {
                vscode.postMessage({ type: 'openSettings' });
            });
        });
    </script>
</body>
</html>`;
  }
}
