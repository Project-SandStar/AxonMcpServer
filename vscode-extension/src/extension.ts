import * as vscode from 'vscode';
import { StateManager } from './core/StateManager';
import { initializeMcpClient, HttpMcpClient } from './mcp/HttpMcpClient';
import { registerLanguageFeatures } from './language';
import { StatusBarManager } from './ui/StatusBarManager';
import { initLogger, LogLevel } from './utils/logger';
import { getLogger } from './utils/logger';
import { getErrorHandler } from './utils/errorHandler';
import { WebViewPanelManager } from './webview/WebViewPanelManager';
import { initializeSessionManager } from './session/SessionManager';
import { SidebarProvider } from './sidebar/SidebarProvider';
import { McpExplorer } from './sidebar/McpExplorer';

/**
 * Global extension services
 */
let stateManager: StateManager;
let mcpClient: HttpMcpClient;
let statusBarManager: StatusBarManager;
let webViewPanelManager: WebViewPanelManager;

/**
 * Extension activation - called when extension is first activated
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Initialize logger
  const logger = initLogger(
    process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO
  );
  const errorHandler = getErrorHandler();

  logger.info('='.repeat(60));
  logger.info('Axon VSCode Extension Activating...');
  logger.info('='.repeat(60));

  try {
    // Initialize core services
    logger.info('Initializing core services...');

    stateManager = new StateManager(context);

    // Initialize MCP client (HTTP connection to running server)
    logger.info('Initializing MCP client...');
    mcpClient = initializeMcpClient();

    try {
      await mcpClient.initialize();
      stateManager.updateMcpServerStatus({
        isRunning: mcpClient.isConnected,
        lastHealthCheck: new Date()
      });
      logger.info(`MCP client ${mcpClient.isConnected ? 'connected' : 'disconnected'}`);
    } catch (error) {
      logger.warn('MCP server not available', error);
    }

    // Initialize status bar
    logger.info('Initializing status bar...');
    statusBarManager = new StatusBarManager(mcpClient, stateManager);

    // Initialize sidebar view
    logger.info('Initializing sidebar view...');
    const sidebarProvider = new SidebarProvider(context.extensionUri);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider('axon.sidebarView', sidebarProvider)
    );
    logger.info('Sidebar view initialized successfully');


    // Initialize webview panel manager
    logger.info('Initializing webview panel manager...');
    webViewPanelManager = new WebViewPanelManager(context);

    const sessionManager = initializeSessionManager(context);
    logger.info('Session manager initialized successfully');

    // Register disposables
    context.subscriptions.push(
      { dispose: () => stateManager.dispose() },
      { dispose: () => mcpClient.dispose() },
      { dispose: () => statusBarManager.dispose() },
      { dispose: () => webViewPanelManager.dispose() },
      { dispose: () => sessionManager.dispose() }
    );

    // Register commands
    logger.info('Registering commands...');
    registerCommands(context);

    // Register language features
    logger.info('Registering language features...');
    registerLanguageFeatures(context);

    // Show activation success
    logger.info('='.repeat(60));
    logger.info('Axon VSCode Extension Activated Successfully!');
    logger.info('='.repeat(60));

    vscode.window.setStatusBarMessage('$(check) Axon Extension Ready', 3000);

    // Show welcome message on first activation
    const hasShownWelcome = context.globalState.get<boolean>('hasShownWelcome');
    if (!hasShownWelcome) {
      showWelcomeMessage(context);
      await context.globalState.update('hasShownWelcome', true);
    }
  } catch (error) {
    logger.error('Extension activation failed', error as Error);
    errorHandler.handleError(error as Error, 'Extension Activation');
    throw error;
  }
}

/**
 * Extension deactivation - called when extension is deactivated
 */
export function deactivate(): void {
  const logger = getLogger();

  logger.info('='.repeat(60));
  logger.info('Axon VSCode Extension Deactivating...');
  logger.info('='.repeat(60));

  // Services are disposed via context.subscriptions
  logger.info('Axon VSCode Extension Deactivated');
}

/**
 * Register all extension commands
 */
function registerCommands(context: vscode.ExtensionContext): void {
  const logger = getLogger();

  // Check Status command
  context.subscriptions.push(
    vscode.commands.registerCommand('axon.checkStatus', async () => {
      try {
        const status = await mcpClient.getServerStatus();
        const primaryProject = await mcpClient.getPrimaryProject();

        const items: string[] = [
          `MCP Server: ${mcpClient.isConnected ? 'Connected' : 'Disconnected'}`,
          `Status: ${status.status}`,
          primaryProject
            ? `Primary Project: ${primaryProject.instance}/${primaryProject.project}`
            : 'No primary project set'
        ];

        if (status.projectCount !== undefined) {
          items.push(`Projects: ${status.projectCount}`);
        }

        vscode.window.showInformationMessage(items.join(' | '));
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to get status: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  );

  // Connect to MCP Server command
  context.subscriptions.push(
    vscode.commands.registerCommand('axon.connectMcpServer', async () => {
      try {
        await mcpClient.initialize();
        if (mcpClient.isConnected) {
          vscode.window.showInformationMessage('Connected to MCP server');
        } else {
          vscode.window.showWarningMessage('Failed to connect to MCP server');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Connection failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  );

  // Search Examples command
  context.subscriptions.push(
    vscode.commands.registerCommand('axon.searchExamples', async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Search Axon code examples',
        placeHolder: 'e.g., readAll site'
      });

      if (!query) return;

      try {
        const results = await mcpClient.searchExamples(query);

        if (results.length === 0) {
          vscode.window.showInformationMessage('No examples found');
          return;
        }

        const items = results.map(r => ({
          label: r.name,
          description: r.description || r.category,
          detail: r.source?.substring(0, 100)
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select an example to view'
        });

        if (selected) {
          const example = results.find(r => r.name === selected.label);
          if (example?.source) {
            const doc = await vscode.workspace.openTextDocument({
              content: example.source,
              language: 'axon'
            });
            await vscode.window.showTextDocument(doc);
          }
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Search failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  );

  // Search Documentation command
  context.subscriptions.push(
    vscode.commands.registerCommand('axon.searchDocs', async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Search Axon documentation',
        placeHolder: 'e.g., date range functions'
      });

      if (!query) return;

      try {
        const results = await mcpClient.searchDocs(query);

        if (results.length === 0) {
          vscode.window.showInformationMessage('No documentation found');
          return;
        }

        const items = results.map(r => ({
          label: r.title,
          description: r.path,
          detail: r.content?.substring(0, 100)
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a doc to view'
        });

        if (selected) {
          vscode.window.showInformationMessage(`Selected: ${selected.label}`);
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Search failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  );

  // Switch Project command
  context.subscriptions.push(
    vscode.commands.registerCommand('axon.switchProject', async () => {
      try {
        const projects = await mcpClient.getProjects();

        if (projects.length === 0) {
          vscode.window.showWarningMessage('No projects available');
          return;
        }

        const items = projects.map(p => ({
          label: `${p.instance}/${p.project}`,
          description: p.url,
          instance: p.instance,
          project: p.project
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a project to switch to'
        });

        if (selected) {
          await mcpClient.setPrimaryProject(selected.instance, selected.project);
          vscode.window.showInformationMessage(`Switched to ${selected.label}`);
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to switch project: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  );

  // Open MCP Explorer command
  context.subscriptions.push(
    vscode.commands.registerCommand('axon.openMcpExplorer', () => {
      McpExplorer.createOrShow(context.extensionUri);
    })
  );

  // View Logs command
  context.subscriptions.push(
    vscode.commands.registerCommand('axon.viewLogs', async () => {
      try {
        const logs = await mcpClient.getStartupLogs();
        const doc = await vscode.workspace.openTextDocument({
          content: logs,
          language: 'log'
        });
        await vscode.window.showTextDocument(doc);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to get logs: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  );

  // Clear Cache command
  context.subscriptions.push(
    vscode.commands.registerCommand('axon.clearCaches', async () => {
      try {
        await mcpClient.clearCache();
        vscode.window.showInformationMessage('Cache cleared');
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to clear cache: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  );

  // Sync Functions command
  context.subscriptions.push(
    vscode.commands.registerCommand('axon.syncFunctions', async () => {
      const primaryProject = await mcpClient.getPrimaryProject();

      if (!primaryProject) {
        vscode.window.showWarningMessage('Please select a project first');
        return;
      }

      try {
        const result = await mcpClient.triggerSync(
          primaryProject.instance,
          primaryProject.project
        );
        vscode.window.showInformationMessage(
          `Sync complete: ${result.downloaded} downloaded, ${result.updated} updated, ${result.deleted} deleted`
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Sync failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  );

  // Open Dashboard command
  context.subscriptions.push(
    vscode.commands.registerCommand('axon.openDashboard', async () => {
      const config = vscode.workspace.getConfiguration('axon');
      const serverUrl = config.get<string>('server.url') || 'http://localhost:3847';

      // Open dashboard in browser
      const dashboardUrl = `${serverUrl}/dashboard`;
      vscode.env.openExternal(vscode.Uri.parse(dashboardUrl));
    })
  );

  logger.info('Commands registered successfully');
}

/**
 * Show welcome message on first activation
 */
function showWelcomeMessage(_context: vscode.ExtensionContext): void {
  const message = 'Welcome to Axon VSCode! Connect to your MCP server to start generating Axon code.';

  vscode.window.showInformationMessage(
    message,
    'Check Status',
    'Open Generation Panel'
  ).then(selection => {
    if (selection === 'Check Status') {
      vscode.commands.executeCommand('axon.checkStatus');
    } else if (selection === 'Open Generation Panel') {
      vscode.commands.executeCommand('axon.openGenerationPanel');
    }
  });
}
