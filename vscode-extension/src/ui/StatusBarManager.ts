import * as vscode from 'vscode';
import { HttpMcpClient } from '../mcp/HttpMcpClient';
import { StateManager } from '../core/StateManager';
import { getLogger } from '../utils/logger';

/**
 * Status Bar Manager for MCP server connection status display
 */
export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;
  private logger = getLogger();
  private updateInterval?: NodeJS.Timeout;

  constructor(
    private mcpClient: HttpMcpClient,
    private stateManager: StateManager
  ) {
    // Create status bar item (left side, high priority)
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );

    this.statusBarItem.command = 'axon.checkStatus';
    this.updateStatus();

    // Listen for connection changes
    this.mcpClient.onConnectionChange(() => {
      this.updateStatus();
    });

    // Listen for project changes
    this.mcpClient.onProjectChange((project) => {
      if (project) {
        this.showSuccess(`Switched to ${project.project}`, 2000);
      }
      this.updateStatus();
    });

    // Listen for state changes
    this.stateManager.on('stateChange', () => {
      this.updateStatus();
    });

    // Update every 10 seconds
    this.updateInterval = setInterval(() => {
      this.updateStatus();
    }, 10000);

    this.statusBarItem.show();
    this.logger.info('StatusBarManager initialized');
  }

  /**
   * Update status bar display
   */
  private async updateStatus(): Promise<void> {
    const isConnected = this.mcpClient.isConnected;

    if (isConnected) {
      try {
        const primaryProject = await this.mcpClient.getPrimaryProject();

        if (primaryProject) {
          this.statusBarItem.text = `$(database) ${primaryProject.project}`;
          this.statusBarItem.tooltip = `Connected to MCP Server\nProject: ${primaryProject.instance}/${primaryProject.project}\nClick to check status`;
        } else {
          this.statusBarItem.text = '$(plug) MCP Connected';
          this.statusBarItem.tooltip = 'Connected to MCP Server\nNo project selected\nClick to check status';
        }
        this.statusBarItem.backgroundColor = undefined;
      } catch {
        this.statusBarItem.text = '$(plug) MCP Connected';
        this.statusBarItem.tooltip = 'Connected to MCP Server\nClick to check status';
        this.statusBarItem.backgroundColor = undefined;
      }
    } else {
      this.statusBarItem.text = '$(debug-disconnect) MCP Disconnected';
      this.statusBarItem.tooltip = `MCP Server Disconnected\n${this.mcpClient.lastError || 'Click to check status'}`;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
    }
  }

  /**
   * Show error status
   */
  showError(message: string): void {
    this.statusBarItem.text = '$(alert) MCP Error';
    this.statusBarItem.tooltip = `MCP Server Error: ${message}\nClick to retry`;
    this.statusBarItem.backgroundColor = new vscode.ThemeColor(
      'statusBarItem.errorBackground'
    );
  }

  /**
   * Show success message briefly
   */
  showSuccess(message: string, duration: number = 3000): void {
    const originalText = this.statusBarItem.text;
    const originalTooltip = this.statusBarItem.tooltip;
    const originalBg = this.statusBarItem.backgroundColor;

    this.statusBarItem.text = `$(check) ${message}`;
    this.statusBarItem.tooltip = message;
    this.statusBarItem.backgroundColor = undefined;

    setTimeout(() => {
      this.statusBarItem.text = originalText;
      this.statusBarItem.tooltip = originalTooltip;
      this.statusBarItem.backgroundColor = originalBg;
    }, duration);
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.statusBarItem.dispose();
    this.logger.info('StatusBarManager disposed');
  }
}
