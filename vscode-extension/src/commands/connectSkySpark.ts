import * as vscode from 'vscode';
import { ConfigManager } from '../core/ConfigManager';
import { StateManager } from '../core/StateManager';
import { getLogger } from '../utils/logger';
import { getErrorHandler } from '../utils/errorHandler';

/**
 * Connect to SkySpark command
 */
export async function connectSkySparkCommand(
  configManager: ConfigManager,
  stateManager: StateManager
): Promise<void> {
  const logger = getLogger();
  const errorHandler = getErrorHandler();

  logger.info('Connect to SkySpark command started');

  try {
    // Step 1: Enter host URL
    const host = await vscode.window.showInputBox({
      title: 'SkySpark Host URL',
      prompt: 'Enter SkySpark server URL',
      placeHolder: 'http://localhost:8080 or https://your-server.com',
      value: configManager.getSkySparkHost() || 'http://localhost:8080',
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Host URL is required';
        }
        if (!value.startsWith('http://') && !value.startsWith('https://')) {
          return 'URL must start with http:// or https://';
        }
        return null;
      }
    });

    if (!host) {
      return;
    }

    // Step 2: Enter project name
    const project = await vscode.window.showInputBox({
      title: 'SkySpark Project',
      prompt: 'Enter SkySpark project name',
      placeHolder: 'demo',
      value: configManager.getSkySparkProject() || '',
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Project name is required';
        }
        return null;
      }
    });

    if (!project) {
      return;
    }

    // Step 3: Enter username
    const username = await vscode.window.showInputBox({
      title: 'SkySpark Username',
      prompt: 'Enter your SkySpark username',
      placeHolder: 'su',
      value: configManager.getSkySparkUsername() || '',
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Username is required';
        }
        return null;
      }
    });

    if (!username) {
      return;
    }

    // Step 4: Enter password
    const password = await vscode.window.showInputBox({
      title: 'SkySpark Password',
      prompt: 'Enter your SkySpark password',
      password: true,
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Password is required';
        }
        return null;
      }
    });

    if (!password) {
      return;
    }

    // Step 5: Save configuration
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Connecting to SkySpark',
        cancellable: false
      },
      async (progress) => {
        progress.report({ message: 'Saving configuration...' });
        
        await configManager.setSkySparkHost(host);
        await configManager.setSkySparkProject(project);
        await configManager.setSkySparkUsername(username);
        await configManager.setSkySparkPassword(password);

        // Create connection record in state
        const connectionId = `${host}-${project}`;
        stateManager.saveConnection({
          id: connectionId,
          name: `${project} @ ${host}`,
          host,
          project,
          username,
          isActive: true,
          lastConnected: new Date()
        });
        stateManager.setActiveConnection(connectionId);

        // TODO: Test connection when SkySpark client is implemented in Phase 9
        progress.report({ message: 'Connection saved' });
        
        return true;
      }
    );

    // Success
    logger.info('SkySpark connection configured successfully');
    vscode.window.showInformationMessage(
      '✓ SkySpark connection configured!',
      'OK'
    );
  } catch (error) {
    logger.error('Failed to configure SkySpark connection', error as Error);
    errorHandler.handleError(error as Error, 'Connect to SkySpark');
  }
}
