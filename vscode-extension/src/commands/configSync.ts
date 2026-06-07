import * as vscode from 'vscode';
import { ConfigSyncManager } from '../core/ConfigSyncManager';
import { getLogger } from '../utils/logger';

let configSyncManager: ConfigSyncManager | null = null;

/**
 * Initialize the ConfigSyncManager
 */
export function initializeConfigSync(context: vscode.ExtensionContext): ConfigSyncManager {
    if (!configSyncManager) {
        configSyncManager = new ConfigSyncManager(context);
    }
    return configSyncManager;
}

/**
 * Get ConfigSyncManager instance
 */
export function getConfigSyncManager(): ConfigSyncManager | null {
    return configSyncManager;
}

/**
 * Command to view configuration sync status
 */
export async function configSyncStatusCommand(): Promise<void> {
    const logger = getLogger();
    
    try {
        if (!configSyncManager) {
            vscode.window.showErrorMessage('Configuration sync not initialized');
            return;
        }

        const status = await configSyncManager.getStatus();

        const statusMessage = [
            '**Configuration Sync Status**',
            '',
            `**axon-config.json**`,
            `- Status: ${status.axonConfigExists ? '✅ Found' : '❌ Not Found'}`,
            `- Path: \`${status.axonConfigPath}\``,
            '',
            `**. env.skyspark**`,
            `- Status: ${status.envSkySparkExists ? '✅ Found' : '❌ Not Found'}`,
            `- Path: \`${status.envSkySparkPath}\``,
            '',
            'Settings are automatically synced between VSCode and these files.',
            'Edit via: **Settings → Axon**'
        ].join('\n');

        vscode.window.showInformationMessage(
            statusMessage,
            { modal: false },
            'Open Settings',
            'Sync Now'
        ).then(async (selection) => {
            if (selection === 'Open Settings') {
                await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:axon');
            } else if (selection === 'Sync Now') {
                await configSyncManager!.forceSyncToFiles();
            }
        });

        logger.info('Configuration sync status displayed');

    } catch (error) {
        logger.error('Error showing config sync status', error as Error);
        vscode.window.showErrorMessage(`Failed to show status: ${(error as Error).message}`);
    }
}

/**
 * Command to force sync VSCode settings to files
 */
export async function syncConfigToFilesCommand(): Promise<void> {
    const logger = getLogger();
    
    try {
        if (!configSyncManager) {
            vscode.window.showErrorMessage('Configuration sync not initialized');
            return;
        }

        await configSyncManager.forceSyncToFiles();
        logger.info('Forced configuration sync to files');

    } catch (error) {
        logger.error('Error syncing config to files', error as Error);
        vscode.window.showErrorMessage(`Failed to sync: ${(error as Error).message}`);
    }
}

/**
 * Command to force sync files to VSCode settings
 */
export async function syncConfigFromFilesCommand(): Promise<void> {
    const logger = getLogger();
    
    try {
        if (!configSyncManager) {
            vscode.window.showErrorMessage('Configuration sync not initialized');
            return;
        }

        await configSyncManager.forceSyncFromFiles();
        logger.info('Forced configuration sync from files');

    } catch (error) {
        logger.error('Error syncing config from files', error as Error);
        vscode.window.showErrorMessage(`Failed to sync: ${(error as Error).message}`);
    }
}

/**
 * Command to open configuration quick picker
 */
export async function quickConfigCommand(): Promise<void> {
    const logger = getLogger();
    
    try {
        const options = [
            {
                label: '$(file-code) MCP: Code Path',
                description: 'Path to Axon library code directory',
                setting: 'axon.mcp.codePath'
            },
            {
                label: '$(book) MCP: Docs Path',
                description: 'Path to Axon documentation directory',
                setting: 'axon.mcp.docsPath'
            },
            {
                label: '$(server) SkySpark: Installation',
                description: 'Path to SkySpark installation directory',
                setting: 'axon.skyspark.home'
            },
            {
                label: '$(folder) SkySpark: Config Directory',
                description: 'Path to SkySpark JSON config files',
                setting: 'axon.skyspark.configDir'
            },
            {
                label: '$(globe) SkySpark: Host',
                description: 'SkySpark server hostname',
                setting: 'axon.skyspark.host'
            },
            {
                label: '$(archive) SkySpark: Project',
                description: 'SkySpark project name',
                setting: 'axon.skyspark.project'
            },
            {
                label: '$(person) SkySpark: Username',
                description: 'SkySpark username',
                setting: 'axon.skyspark.username'
            },
            {
                label: '$(sync) Sync Status',
                description: 'View configuration sync status',
                action: 'status'
            },
            {
                label: '$(settings) All Settings',
                description: 'Open all Axon settings',
                action: 'all'
            }
        ];

        const selected = await vscode.window.showQuickPick(options, {
            placeHolder: 'Select a configuration to edit',
            matchOnDescription: true
        });

        if (!selected) {
            return;
        }

        if ('action' in selected) {
            if (selected.action === 'status') {
                await configSyncStatusCommand();
            } else if (selected.action === 'all') {
                await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:axon');
            }
        } else if ('setting' in selected) {
            await vscode.commands.executeCommand('workbench.action.openSettings', selected.setting);
        }

        logger.info('Quick config executed');

    } catch (error) {
        logger.error('Error in quick config', error as Error);
        vscode.window.showErrorMessage(`Failed to open config: ${(error as Error).message}`);
    }
}
