import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface SkySparKConfig {
    name: string;
    host: string;
    port: number;
    protocol: 'http' | 'https';
    username?: string;
    password?: string;
    defaultProjName?: string;
    projects: Array<{
        name: string;
        username?: string;
        password?: string;
        description?: string;
    }>;
}

export class ConfigEditorPanel {
    public static currentPanel: ConfigEditorPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _configDir: string;
    private _currentFile: string | undefined;

    public static createOrShow(extensionUri: vscode.Uri, configDir: string) {
        const column = vscode.ViewColumn.One;

        if (ConfigEditorPanel.currentPanel) {
            ConfigEditorPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'axonConfigEditor',
            'Axon Config Editor',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        ConfigEditorPanel.currentPanel = new ConfigEditorPanel(panel, extensionUri, configDir);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, configDir: string) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._configDir = configDir;

        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'loadConfigs':
                        this._sendConfigList();
                        return;
                    case 'loadConfig':
                        this._loadConfig(message.file);
                        return;
                    case 'saveConfig':
                        this._saveConfig(message.file, message.data);
                        return;
                    case 'createConfig':
                        this._createConfig(message.name);
                        return;
                    case 'deleteConfig':
                        this._deleteConfig(message.file);
                        return;
                    case 'testConnection':
                        this._testConnection(message.data);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    private async _sendConfigList() {
        try {
            const files = fs.readdirSync(this._configDir)
                .filter(f => f.endsWith('.json') && !f.endsWith('.backup'));
            
            this._panel.webview.postMessage({
                command: 'configList',
                files: files
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load config files: ${error}`);
        }
    }

    private async _loadConfig(file: string) {
        try {
            const filePath = path.join(this._configDir, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const config = JSON.parse(content);
            
            this._currentFile = file;
            this._panel.webview.postMessage({
                command: 'configLoaded',
                file: file,
                data: config
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load config: ${error}`);
        }
    }

    private async _saveConfig(file: string, data: SkySparKConfig) {
        try {
            const filePath = path.join(this._configDir, file);
            
            // Create backup
            if (fs.existsSync(filePath)) {
                const backupPath = `${filePath}.backup`;
                fs.copyFileSync(filePath, backupPath);
            }

            // Validate JSON structure
            this._validateConfig(data);

            // Save with proper formatting
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
            
            vscode.window.showInformationMessage(`Config saved: ${file}`);
            this._panel.webview.postMessage({
                command: 'saved',
                file: file
            });
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to save config: ${error.message}`);
            this._panel.webview.postMessage({
                command: 'saveError',
                error: error.message
            });
        }
    }

    private _validateConfig(config: SkySparKConfig) {
        if (!config.name || typeof config.name !== 'string') {
            throw new Error('Config must have a valid "name" field');
        }
        if (!config.host || typeof config.host !== 'string') {
            throw new Error('Config must have a valid "host" field');
        }
        if (!config.port || typeof config.port !== 'number') {
            throw new Error('Config must have a valid "port" field');
        }
        if (!['http', 'https'].includes(config.protocol)) {
            throw new Error('Protocol must be "http" or "https"');
        }
        if (!Array.isArray(config.projects)) {
            throw new Error('Config must have a "projects" array');
        }
    }

    private async _createConfig(name: string) {
        try {
            const fileName = `${name}.json`;
            const filePath = path.join(this._configDir, fileName);
            
            if (fs.existsSync(filePath)) {
                vscode.window.showErrorMessage(`Config file already exists: ${fileName}`);
                return;
            }

            const newConfig: SkySparKConfig = {
                name: name,
                host: 'localhost',
                port: 8080,
                protocol: 'http',
                username: '',
                password: '',
                projects: []
            };

            fs.writeFileSync(filePath, JSON.stringify(newConfig, null, 2), 'utf8');
            
            vscode.window.showInformationMessage(`Created new config: ${fileName}`);
            this._sendConfigList();
            this._loadConfig(fileName);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create config: ${error}`);
        }
    }

    private async _deleteConfig(file: string) {
        try {
            const answer = await vscode.window.showWarningMessage(
                `Are you sure you want to delete ${file}?`,
                'Yes',
                'No'
            );

            if (answer !== 'Yes') {
                return;
            }

            const filePath = path.join(this._configDir, file);
            fs.unlinkSync(filePath);
            
            vscode.window.showInformationMessage(`Deleted config: ${file}`);
            this._sendConfigList();
            this._panel.webview.postMessage({
                command: 'configDeleted',
                file: file
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete config: ${error}`);
        }
    }

    private async _testConnection(config: SkySparKConfig) {
        try {
            const url = `${config.protocol}://${config.host}:${config.port}/api/demo/about`;
            
            vscode.window.showInformationMessage(
                `Testing connection to: ${url}\n(Connection testing requires MCP server running)`
            );

            // TODO: Implement actual connection test via MCP server
            this._panel.webview.postMessage({
                command: 'testResult',
                success: true,
                message: 'Connection test feature coming soon'
            });
        } catch (error: any) {
            this._panel.webview.postMessage({
                command: 'testResult',
                success: false,
                message: error.message
            });
        }
    }

    private _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Axon Config Editor</title>
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
            background-color: var(--vscode-editor-background);
            padding: 20px;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            display: grid;
            grid-template-columns: 250px 1fr;
            gap: 20px;
        }

        .sidebar {
            border-right: 1px solid var(--vscode-panel-border);
            padding-right: 20px;
        }

        .sidebar h2 {
            font-size: 16px;
            margin-bottom: 15px;
            color: var(--vscode-foreground);
        }

        .config-list {
            list-style: none;
        }

        .config-item {
            padding: 8px 12px;
            margin-bottom: 4px;
            cursor: pointer;
            border-radius: 4px;
            transition: background-color 0.2s;
        }

        .config-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .config-item.active {
            background-color: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }

        .editor-area {
            padding-left: 20px;
        }

        .editor-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .editor-header h1 {
            font-size: 20px;
        }

        .button-group {
            display: flex;
            gap: 8px;
        }

        button {
            padding: 6px 14px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
            cursor: pointer;
            font-size: 13px;
        }

        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        button.danger {
            background-color: #d73a49;
        }

        button.danger:hover {
            background-color: #cb2431;
        }

        .form-group {
            margin-bottom: 20px;
        }

        .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
        }

        label {
            display: block;
            margin-bottom: 6px;
            font-weight: 500;
            font-size: 13px;
        }

        input, select {
            width: 100%;
            padding: 6px 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            font-size: 13px;
        }

        input:focus, select:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }

        .projects-section {
            margin-top: 30px;
        }

        .projects-section h3 {
            font-size: 16px;
            margin-bottom: 15px;
        }

        .project-card {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 15px;
            margin-bottom: 12px;
        }

        .project-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }

        .project-name {
            font-weight: 600;
            font-size: 14px;
        }

        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: var(--vscode-descriptionForeground);
        }

        .empty-state h2 {
            font-size: 18px;
            margin-bottom: 10px;
        }

        .status-message {
            padding: 10px;
            margin-bottom: 15px;
            border-radius: 4px;
            display: none;
        }

        .status-message.success {
            background-color: rgba(46, 160, 67, 0.2);
            border: 1px solid #2ea043;
        }

        .status-message.error {
            background-color: rgba(215, 58, 73, 0.2);
            border: 1px solid #d73a49;
        }

        .new-config-form {
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px solid var(--vscode-panel-border);
        }

        .inline-form {
            display: flex;
            gap: 8px;
            margin-top: 8px;
        }

        .inline-form input {
            flex: 1;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="sidebar">
            <h2>Configuration Files</h2>
            <ul class="config-list" id="configList">
                <li class="empty-state" style="padding: 20px 0;">Loading...</li>
            </ul>
            <div class="new-config-form">
                <button onclick="showNewConfigForm()" class="secondary" style="width: 100%;">+ New Config</button>
                <div class="inline-form" id="newConfigForm" style="display: none;">
                    <input type="text" id="newConfigName" placeholder="config-name">
                    <button onclick="createNewConfig()">Create</button>
                </div>
            </div>
        </div>

        <div class="editor-area">
            <div id="emptyState" class="empty-state">
                <h2>No Config Selected</h2>
                <p>Select a configuration file from the sidebar to edit</p>
            </div>

            <div id="editorContent" style="display: none;">
                <div class="editor-header">
                    <h1 id="currentFileName">Config Editor</h1>
                    <div class="button-group">
                        <button onclick="testConnection()">Test Connection</button>
                        <button onclick="saveConfig()">Save</button>
                        <button onclick="deleteConfig()" class="danger">Delete</button>
                    </div>
                </div>

                <div id="statusMessage" class="status-message"></div>

                <form id="configForm">
                    <div class="form-group">
                        <div class="form-row">
                            <div>
                                <label for="configName">Configuration Name</label>
                                <input type="text" id="configName" required>
                            </div>
                            <div>
                                <label for="protocol">Protocol</label>
                                <select id="protocol">
                                    <option value="http">HTTP</option>
                                    <option value="https">HTTPS</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div class="form-group">
                        <div class="form-row">
                            <div>
                                <label for="host">Host</label>
                                <input type="text" id="host" required>
                            </div>
                            <div>
                                <label for="port">Port</label>
                                <input type="number" id="port" required>
                            </div>
                        </div>
                    </div>

                    <div class="form-group">
                        <div class="form-row">
                            <div>
                                <label for="username">Username</label>
                                <input type="text" id="username">
                            </div>
                            <div>
                                <label for="password">Password</label>
                                <input type="password" id="password">
                            </div>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="defaultProjName">Default Project Name (Optional)</label>
                        <input type="text" id="defaultProjName">
                    </div>

                    <div class="projects-section">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                            <h3>Projects</h3>
                            <button type="button" onclick="addProject()" class="secondary">+ Add Project</button>
                        </div>
                        <div id="projectsList"></div>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentFile = null;
        let currentConfig = null;

        // Request initial config list
        vscode.postMessage({ command: 'loadConfigs' });

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'configList':
                    displayConfigList(message.files);
                    break;
                case 'configLoaded':
                    loadConfigIntoForm(message.file, message.data);
                    break;
                case 'saved':
                    showStatus('Configuration saved successfully!', 'success');
                    break;
                case 'saveError':
                    showStatus('Error saving: ' + message.error, 'error');
                    break;
                case 'configDeleted':
                    document.getElementById('editorContent').style.display = 'none';
                    document.getElementById('emptyState').style.display = 'block';
                    break;
                case 'testResult':
                    showStatus(message.message, message.success ? 'success' : 'error');
                    break;
            }
        });

        function displayConfigList(files) {
            const list = document.getElementById('configList');
            list.innerHTML = '';
            
            if (files.length === 0) {
                list.innerHTML = '<li class="empty-state" style="padding: 20px 0;">No configs found</li>';
                return;
            }

            files.forEach(file => {
                const li = document.createElement('li');
                li.className = 'config-item';
                li.textContent = file;
                li.onclick = () => selectConfig(file);
                list.appendChild(li);
            });
        }

        function selectConfig(file) {
            currentFile = file;
            vscode.postMessage({ command: 'loadConfig', file });
            
            document.querySelectorAll('.config-item').forEach(item => {
                item.classList.remove('active');
                if (item.textContent === file) {
                    item.classList.add('active');
                }
            });
        }

        function loadConfigIntoForm(file, config) {
            currentFile = file;
            currentConfig = config;
            
            document.getElementById('emptyState').style.display = 'none';
            document.getElementById('editorContent').style.display = 'block';
            document.getElementById('currentFileName').textContent = file;
            
            document.getElementById('configName').value = config.name || '';
            document.getElementById('host').value = config.host || '';
            document.getElementById('port').value = config.port || 8080;
            document.getElementById('protocol').value = config.protocol || 'http';
            document.getElementById('username').value = config.username || '';
            document.getElementById('password').value = config.password || '';
            document.getElementById('defaultProjName').value = config.defaultProjName || '';
            
            renderProjects(config.projects || []);
        }

        function renderProjects(projects) {
            const container = document.getElementById('projectsList');
            container.innerHTML = '';
            
            if (projects.length === 0) {
                container.innerHTML = '<p style="color: var(--vscode-descriptionForeground); padding: 20px 0; text-align: center;">No projects configured</p>';
                return;
            }

            projects.forEach((project, index) => {
                const card = document.createElement('div');
                card.className = 'project-card';
                card.innerHTML = \`
                    <div class="project-header">
                        <div class="project-name">\${project.name}</div>
                        <button type="button" onclick="removeProject(\${index})" class="danger" style="padding: 4px 10px; font-size: 12px;">Remove</button>
                    </div>
                    <div class="form-group">
                        <label>Description</label>
                        <input type="text" value="\${project.description || ''}" onchange="updateProject(\${index}, 'description', this.value)">
                    </div>
                    <div class="form-row">
                        <div>
                            <label>Username</label>
                            <input type="text" value="\${project.username || ''}" onchange="updateProject(\${index}, 'username', this.value)">
                        </div>
                        <div>
                            <label>Password</label>
                            <input type="password" value="\${project.password || ''}" onchange="updateProject(\${index}, 'password', this.value)">
                        </div>
                    </div>
                \`;
                container.appendChild(card);
            });
        }

        function addProject() {
            const name = prompt('Enter project name:');
            if (!name) return;
            
            if (!currentConfig.projects) {
                currentConfig.projects = [];
            }
            
            currentConfig.projects.push({
                name: name,
                description: '',
                username: '',
                password: ''
            });
            
            renderProjects(currentConfig.projects);
        }

        function removeProject(index) {
            if (confirm('Remove this project?')) {
                currentConfig.projects.splice(index, 1);
                renderProjects(currentConfig.projects);
            }
        }

        function updateProject(index, field, value) {
            currentConfig.projects[index][field] = value;
        }

        function saveConfig() {
            if (!currentFile) return;
            
            const data = {
                name: document.getElementById('configName').value,
                host: document.getElementById('host').value,
                port: parseInt(document.getElementById('port').value),
                protocol: document.getElementById('protocol').value,
                username: document.getElementById('username').value,
                password: document.getElementById('password').value,
                projects: currentConfig.projects || []
            };

            const defaultProj = document.getElementById('defaultProjName').value;
            if (defaultProj) {
                data.defaultProjName = defaultProj;
            }
            
            vscode.postMessage({ command: 'saveConfig', file: currentFile, data });
        }

        function deleteConfig() {
            if (!currentFile) return;
            vscode.postMessage({ command: 'deleteConfig', file: currentFile });
        }

        function testConnection() {
            const data = {
                name: document.getElementById('configName').value,
                host: document.getElementById('host').value,
                port: parseInt(document.getElementById('port').value),
                protocol: document.getElementById('protocol').value,
                username: document.getElementById('username').value,
                password: document.getElementById('password').value
            };
            vscode.postMessage({ command: 'testConnection', data });
        }

        function showStatus(message, type) {
            const statusEl = document.getElementById('statusMessage');
            statusEl.textContent = message;
            statusEl.className = 'status-message ' + type;
            statusEl.style.display = 'block';
            
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 5000);
        }

        function showNewConfigForm() {
            const form = document.getElementById('newConfigForm');
            form.style.display = form.style.display === 'none' ? 'flex' : 'none';
        }

        function createNewConfig() {
            const name = document.getElementById('newConfigName').value.trim();
            if (!name) {
                alert('Please enter a config name');
                return;
            }
            vscode.postMessage({ command: 'createConfig', name });
            document.getElementById('newConfigName').value = '';
            document.getElementById('newConfigForm').style.display = 'none';
        }
    </script>
</body>
</html>`;
    }

    public dispose() {
        ConfigEditorPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}
