import * as vscode from 'vscode';
import * as path from 'path';
import { 
    ToWebViewMessage, 
    FromWebViewMessage,
    MessageFactory,
    isFromWebViewMessage,
    isSendPromptMessage,
    isApplyCodeMessage,
    isCancelStreamMessage,
    ChatConfig
} from './MessageProtocol';
import { getLogger } from '../utils/logger';

/**
 * Manages the WebView panel for interactive AI chat
 * 
 * Features:
 * - Panel lifecycle management (create, show, hide, dispose)
 * - Bidirectional message passing
 * - State persistence across panel reloads
 * - Resource loading (HTML, CSS, JS)
 * - Security (CSP, nonce generation)
 */
export class WebViewPanelManager implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private context: vscode.ExtensionContext;
    private logger = getLogger();
    private messageHandlers: Map<string, (message: FromWebViewMessage) => void | Promise<void>> = new Map();

    /**
     * Singleton instance tracking
     */
    private static instance: WebViewPanelManager | undefined;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        WebViewPanelManager.instance = this;
    }

    /**
     * Get the singleton instance
     */
    static getInstance(): WebViewPanelManager | undefined {
        return WebViewPanelManager.instance;
    }

    /**
     * Create or show the WebView panel
     */
    createOrShow(): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If panel already exists, just reveal it
        if (this.panel) {
            this.panel.reveal(column);
            this.logger.debug('WebView panel revealed');
            return;
        }

        // Create new panel
        this.panel = vscode.window.createWebviewPanel(
            'axonChat',
            'Axon AI Assistant',
            column || vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'media'))
                ]
            }
        );

        // Set icon
        this.panel.iconPath = {
            light: vscode.Uri.file(path.join(this.context.extensionPath, 'resources', 'icon-light.svg')),
            dark: vscode.Uri.file(path.join(this.context.extensionPath, 'resources', 'icon-dark.svg'))
        };

        // Set HTML content
        this.panel.webview.html = this.getHtmlContent(this.panel.webview);

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(
            message => this.handleWebViewMessage(message),
            null,
            this.disposables
        );

        // Handle panel disposal
        this.panel.onDidDispose(
            () => this.dispose(),
            null,
            this.disposables
        );

        // Handle visibility changes
        this.panel.onDidChangeViewState(
            e => {
                if (e.webviewPanel.visible) {
                    this.logger.debug('WebView panel became visible');
                    // Restore state if needed
                    this.sendConfig();
                }
            },
            null,
            this.disposables
        );

        this.logger.info('WebView panel created');

        // Send initial config
        setTimeout(() => this.sendConfig(), 100);
    }

    /**
     * Register a message handler for a specific message type
     */
    onMessage(type: string, handler: (message: FromWebViewMessage) => void | Promise<void>): void {
        this.messageHandlers.set(type, handler);
    }

    /**
     * Send a message to the WebView
     */
    sendMessage(message: ToWebViewMessage): boolean {
        if (!this.panel) {
            this.logger.warn('Cannot send message: WebView panel not initialized');
            return false;
        }

        try {
            this.panel.webview.postMessage(message);
            this.logger.debug(`Sent message to WebView: ${message.type}`);
            return true;
        } catch (error) {
            this.logger.error('Failed to send message to WebView', error as Error);
            return false;
        }
    }

    /**
     * Send system notification to WebView
     */
    sendSystemMessage(level: 'info' | 'warning' | 'error', message: string): void {
        this.sendMessage(MessageFactory.systemMessage(level, message));
    }

    /**
     * Send current configuration to WebView
     */
    private sendConfig(): void {
        const config = vscode.workspace.getConfiguration('axon.chat');
        const chatConfig: ChatConfig = {
            enabled: config.get('enabled', true),
            streamingEnabled: config.get('streamingEnabled', true),
            maxHistorySize: config.get('maxHistorySize', 50),
            autoSave: config.get('autoSave', true),
            theme: config.get('theme', 'auto'),
            showTimestamps: config.get('showTimestamps', true),
            showLineNumbers: config.get('showLineNumbers', true),
            syntaxHighlighting: config.get('syntaxHighlighting', true),
            confirmBeforeApply: config.get('confirmBeforeApply', true)
        };

        this.sendMessage({
            type: 'configUpdated',
            config: chatConfig
        });
    }

    /**
     * Handle incoming messages from WebView
     */
    private async handleWebViewMessage(message: any): Promise<void> {
        if (!isFromWebViewMessage(message)) {
            this.logger.warn('Received invalid message from WebView', message);
            return;
        }

        this.logger.debug(`Received message from WebView: ${message.type}`);

        // Call registered handler if exists
        const handler = this.messageHandlers.get(message.type);
        if (handler) {
            try {
                await handler(message);
            } catch (error) {
                this.logger.error(`Error in message handler for ${message.type}`, error as Error);
                this.sendSystemMessage('error', `Error processing ${message.type}: ${(error as Error).message}`);
            }
        } else {
            this.logger.warn(`No handler registered for message type: ${message.type}`);
        }
    }

    /**
     * Get the HTML content for the WebView
     */
    private getHtmlContent(webview: vscode.Webview): string {
        // Generate nonce for security
        const nonce = this.getNonce();

        // Get URIs for resources
        const mediaPath = vscode.Uri.file(
            path.join(this.context.extensionPath, 'src', 'webview', 'media')
        );

        const cssUri = webview.asWebviewUri(
            vscode.Uri.file(path.join(mediaPath.fsPath, 'chat.css'))
        );
        
        const jsUri = webview.asWebviewUri(
            vscode.Uri.file(path.join(mediaPath.fsPath, 'chat.js'))
        );

        // For now, return a simple HTML structure
        // We'll create the actual UI files next
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="
        default-src 'none';
        style-src ${webview.cspSource} 'unsafe-inline';
        script-src 'nonce-${nonce}';
        img-src ${webview.cspSource} https: data:;
        font-src ${webview.cspSource};
    ">
    <link href="${cssUri}" rel="stylesheet">
    <title>Axon AI Assistant</title>
</head>
<body>
    <div id="app">
        <div class="header">
            <h1>🤖 Axon AI Assistant</h1>
            <div class="header-actions">
                <button id="new-session" title="New Session">
                    <span>✨ New</span>
                </button>
                <button id="clear-session" title="Clear History">
                    <span>🗑️ Clear</span>
                </button>
            </div>
        </div>

        <div class="messages-container" id="messages">
            <div class="welcome-message">
                <h2>Welcome to Axon AI Assistant!</h2>
                <p>Start a conversation to generate Axon code, get explanations, or optimize your functions.</p>
                <div class="quick-actions">
                    <button class="quick-action" data-prompt="Generate a function to read points from the database">
                        📊 Generate Function
                    </button>
                    <button class="quick-action" data-prompt="Explain the code in my current file">
                        💡 Explain Code
                    </button>
                    <button class="quick-action" data-prompt="Optimize the selected code">
                        ⚡ Optimize Code
                    </button>
                </div>
            </div>
        </div>

        <div class="input-container">
            <div class="input-wrapper">
                <textarea 
                    id="message-input" 
                    placeholder="Type your message... (Cmd/Ctrl+Enter to send)"
                    rows="3"
                ></textarea>
                <button id="send-button" title="Send message (Cmd/Ctrl+Enter)">
                    <span>Send</span>
                </button>
            </div>
            <div class="status-bar">
                <span id="status-text">Ready</span>
                <span id="stats"></span>
            </div>
        </div>
    </div>

    <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
    }

    /**
     * Generate a random nonce for CSP
     */
    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    /**
     * Check if panel is visible
     */
    isVisible(): boolean {
        return this.panel?.visible ?? false;
    }

    /**
     * Check if panel exists
     */
    exists(): boolean {
        return this.panel !== undefined;
    }

    /**
     * Hide the panel
     */
    hide(): void {
        if (this.panel) {
            // Note: VSCode doesn't have a direct hide method
            // The panel stays in the background when not active
            this.logger.debug('WebView panel hidden (backgrounded)');
        }
    }

    /**
     * Dispose the panel and clean up resources
     */
    dispose(): void {
        this.logger.info('Disposing WebView panel');

        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }

        // Dispose all event listeners
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }

        // Clear message handlers
        this.messageHandlers.clear();

        // Clear singleton instance
        WebViewPanelManager.instance = undefined;
    }

    /**
     * Get the underlying webview for advanced operations
     */
    getWebview(): vscode.Webview | undefined {
        return this.panel?.webview;
    }

    /**
     * Update the panel title
     */
    setTitle(title: string): void {
        if (this.panel) {
            this.panel.title = title;
        }
    }

    /**
     * Save panel state
     */
    async saveState(state: any): Promise<void> {
        await this.context.workspaceState.update('axonChatPanelState', state);
        this.logger.debug('Panel state saved');
    }

    /**
     * Load panel state
     */
    async loadState(): Promise<any> {
        const state = this.context.workspaceState.get('axonChatPanelState');
        this.logger.debug('Panel state loaded');
        return state;
    }

    /**
     * Clear saved state
     */
    async clearState(): Promise<void> {
        await this.context.workspaceState.update('axonChatPanelState', undefined);
        this.logger.debug('Panel state cleared');
    }
}

/**
 * Helper to get the global panel manager instance
 */
export function getPanelManager(): WebViewPanelManager | undefined {
    return WebViewPanelManager.getInstance();
}
