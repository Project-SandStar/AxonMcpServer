import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getLogger } from '../utils/logger';

/**
 * Configuration Sync Manager
 * 
 * Syncs VSCode settings with axon-config.json and .env.skyspark files
 */
export class ConfigSyncManager {
    private logger = getLogger();
    private mcpServerRoot: string;
    private axonConfigPath: string;
    private envSkySparkPath: string;
    private watcher?: vscode.FileSystemWatcher;

    constructor(private context: vscode.ExtensionContext) {
        // Determine MCP server root (sibling to extension directory)
        this.mcpServerRoot = path.join(context.extensionPath, '..');
        this.axonConfigPath = path.join(this.mcpServerRoot, 'axon-config.json');
        this.envSkySparkPath = path.join(this.mcpServerRoot, '.env.skyspark');
    }

    /**
     * Initialize: Load existing configs and watch for changes
     */
    async initialize(): Promise<void> {
        this.logger.info('Initializing ConfigSyncManager');

        try {
            // Load existing configs into VSCode settings
            await this.loadConfigsToVSCode();

            // Watch for VSCode settings changes
            this.context.subscriptions.push(
                vscode.workspace.onDidChangeConfiguration(e => {
                    if (e.affectsConfiguration('axon.mcp') || 
                        e.affectsConfiguration('axon.skyspark')) {
                        this.syncVSCodeToFiles();
                    }
                })
            );

            // Watch for file changes
            this.watchConfigFiles();

            this.logger.info('ConfigSyncManager initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize ConfigSyncManager', error as Error);
        }
    }

    /**
     * Load configurations from files into VSCode settings
     */
    private async loadConfigsToVSCode(): Promise<void> {
        try {
            // Load axon-config.json
            if (await this.fileExists(this.axonConfigPath)) {
                const axonConfig = await this.readJsonFile(this.axonConfigPath);
                await this.updateMcpSettings(axonConfig);
                this.logger.info('Loaded axon-config.json into VSCode settings');
            } else {
                this.logger.warn('axon-config.json not found, using VSCode defaults');
            }

            // Load .env.skyspark
            if (await this.fileExists(this.envSkySparkPath)) {
                const envConfig = await this.readEnvFile(this.envSkySparkPath);
                await this.updateSkySparkSettings(envConfig);
                this.logger.info('Loaded .env.skyspark into VSCode settings');
            } else {
                this.logger.warn('.env.skyspark not found, using VSCode defaults');
            }
        } catch (error) {
            this.logger.error('Error loading configs to VSCode', error as Error);
        }
    }

    /**
     * Sync VSCode settings to configuration files
     */
    private async syncVSCodeToFiles(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration();

            // Sync MCP settings to axon-config.json
            const axonConfig = {
                codePath: config.get('axon.mcp.codePath', ''),
                docsPath: config.get('axon.mcp.docsPath', ''),
                filePatterns: {
                    code: ['**/*.axon', '**/*.trio'],
                    docs: ['**/*.html', '**/*.md', '**/docHaxall/*.html']
                },
                excludeDirs: ['node_modules', '.git', 'dist', 'build', '.cache', 'temp'],
                cache: {
                    enabled: config.get('axon.mcp.cache.enabled', true),
                    maxAge: config.get('axon.mcp.cache.maxAge', 86400000),
                    directory: '.cache'
                },
                search: {
                    minTokenLength: 2,
                    maxResults: config.get('axon.mcp.search.maxResults', 20)
                }
            };

            await this.writeJsonFile(this.axonConfigPath, axonConfig);
            this.logger.info('Synced VSCode settings to axon-config.json');

            // Sync SkySpark settings to .env.skyspark
            const envLines = [
                '# SkySpark Configuration for Local Instance',
                '# This file is automatically synced with VSCode settings',
                '# Edit via: VSCode Settings → Axon → SkySpark',
                '',
                `SKYSPARK_CONFIG_DIR=${config.get('axon.skyspark.configDir', '')}`,
                '',
                '# Fallback configuration (only used if no JSON config files found)',
                `SKYSPARK_HOST=${config.get('axon.skyspark.host', 'localhost')}`,
                `SKYSPARK_PORT=${config.get('axon.skyspark.port', 8080)}`,
                `SKYSPARK_PROJECT=${config.get('axon.skyspark.project', '')}`,
                `SKYSPARK_USERNAME=${config.get('axon.skyspark.username', '')}`,
                `SKYSPARK_PASSWORD=${config.get('axon.skyspark.password', '')}`,
                `SKYSPARK_PROTOCOL=${config.get('axon.skyspark.protocol', 'http')}`,
                `SKYSPARK_FORMAT=${config.get('axon.skyspark.format', 'zinc')}`,
                '',
                '# Automatic Project Discovery',
                `SKYSPARK_AUTO_DISCOVER=${config.get('axon.skyspark.autoDiscover', true)}`,
                '',
                '# Automatic Function Sync',
                `SKYSPARK_AUTO_SYNC_FUNCTIONS=${config.get('axon.skyspark.autoSyncFunctions', true)}`,
                '',
                '# Function Sync Concurrency',
                `SKYSPARK_SYNC_CONCURRENCY=${config.get('axon.skyspark.syncConcurrency', 10)}`,
                '',
                '# Function Versioning',
                `SKYSPARK_FUNCTION_VERSIONING=${config.get('axon.skyspark.functionVersioning', true)}`,
                `SKYSPARK_MAX_VERSIONS=${config.get('axon.skyspark.maxVersions', 4)}`,
                '',
                '# SkySpark Installation',
                `SKYSPARK_HOME=${config.get('axon.skyspark.home', '')}`
            ];

            await fs.writeFile(this.envSkySparkPath, envLines.join('\n'), 'utf-8');
            this.logger.info('Synced VSCode settings to .env.skyspark');

        } catch (error) {
            this.logger.error('Error syncing VSCode to files', error as Error);
        }
    }

    /**
     * Update MCP settings in VSCode
     */
    private async updateMcpSettings(config: any): Promise<void> {
        const vscodeConfig = vscode.workspace.getConfiguration();

        if (config.codePath) {
            await vscodeConfig.update('axon.mcp.codePath', config.codePath, vscode.ConfigurationTarget.Global);
        }
        if (config.docsPath) {
            await vscodeConfig.update('axon.mcp.docsPath', config.docsPath, vscode.ConfigurationTarget.Global);
        }
        if (config.cache) {
            await vscodeConfig.update('axon.mcp.cache.enabled', config.cache.enabled, vscode.ConfigurationTarget.Global);
            await vscodeConfig.update('axon.mcp.cache.maxAge', config.cache.maxAge, vscode.ConfigurationTarget.Global);
        }
        if (config.search) {
            await vscodeConfig.update('axon.mcp.search.maxResults', config.search.maxResults, vscode.ConfigurationTarget.Global);
        }
    }

    /**
     * Update SkySpark settings in VSCode
     */
    private async updateSkySparkSettings(config: Record<string, string>): Promise<void> {
        const vscodeConfig = vscode.workspace.getConfiguration();

        const mapping: Record<string, string> = {
            'SKYSPARK_CONFIG_DIR': 'axon.skyspark.configDir',
            'SKYSPARK_HOST': 'axon.skyspark.host',
            'SKYSPARK_PORT': 'axon.skyspark.port',
            'SKYSPARK_PROJECT': 'axon.skyspark.project',
            'SKYSPARK_USERNAME': 'axon.skyspark.username',
            'SKYSPARK_PROTOCOL': 'axon.skyspark.protocol',
            'SKYSPARK_FORMAT': 'axon.skyspark.format',
            'SKYSPARK_AUTO_DISCOVER': 'axon.skyspark.autoDiscover',
            'SKYSPARK_AUTO_SYNC_FUNCTIONS': 'axon.skyspark.autoSyncFunctions',
            'SKYSPARK_SYNC_CONCURRENCY': 'axon.skyspark.syncConcurrency',
            'SKYSPARK_FUNCTION_VERSIONING': 'axon.skyspark.functionVersioning',
            'SKYSPARK_MAX_VERSIONS': 'axon.skyspark.maxVersions',
            'SKYSPARK_HOME': 'axon.skyspark.home'
        };

        for (const [envKey, settingKey] of Object.entries(mapping)) {
            if (config[envKey] !== undefined) {
                let value: any = config[envKey];

                // Convert to appropriate types
                if (value === 'true') value = true;
                else if (value === 'false') value = false;
                else if (!isNaN(Number(value)) && envKey.includes('PORT') || envKey.includes('CONCURRENCY') || envKey.includes('VERSIONS')) {
                    value = Number(value);
                }

                await vscodeConfig.update(settingKey, value, vscode.ConfigurationTarget.Global);
            }
        }
    }

    /**
     * Watch configuration files for external changes
     */
    private watchConfigFiles(): void {
        const pattern = new vscode.RelativePattern(
            this.mcpServerRoot,
            '{axon-config.json,.env.skyspark}'
        );

        this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

        this.watcher.onDidChange(async (uri) => {
            this.logger.info(`Config file changed: ${uri.fsPath}`);
            await this.loadConfigsToVSCode();
            vscode.window.showInformationMessage(
                'Configuration file changed - VSCode settings updated'
            );
        });

        this.context.subscriptions.push(this.watcher);
    }

    /**
     * Read JSON file
     */
    private async readJsonFile(filePath: string): Promise<any> {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    }

    /**
     * Write JSON file
     */
    private async writeJsonFile(filePath: string, data: any): Promise<void> {
        const content = JSON.stringify(data, null, 2);
        await fs.writeFile(filePath, content, 'utf-8');
    }

    /**
     * Read .env file into key-value pairs
     */
    private async readEnvFile(filePath: string): Promise<Record<string, string>> {
        const content = await fs.readFile(filePath, 'utf-8');
        const config: Record<string, string> = {};

        content.split('\n').forEach(line => {
            line = line.trim();
            if (line && !line.startsWith('#')) {
                const [key, ...valueParts] = line.split('=');
                if (key && valueParts.length > 0) {
                    config[key.trim()] = valueParts.join('=').trim();
                }
            }
        });

        return config;
    }

    /**
     * Check if file exists
     */
    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get current configuration status
     */
    async getStatus(): Promise<{
        axonConfigExists: boolean;
        envSkySparkExists: boolean;
        axonConfigPath: string;
        envSkySparkPath: string;
    }> {
        return {
            axonConfigExists: await this.fileExists(this.axonConfigPath),
            envSkySparkExists: await this.fileExists(this.envSkySparkPath),
            axonConfigPath: this.axonConfigPath,
            envSkySparkPath: this.envSkySparkPath
        };
    }

    /**
     * Force sync from VSCode to files
     */
    async forceSyncToFiles(): Promise<void> {
        await this.syncVSCodeToFiles();
        vscode.window.showInformationMessage('✅ Configuration synced to files');
    }

    /**
     * Force sync from files to VSCode
     */
    async forceSyncFromFiles(): Promise<void> {
        await this.loadConfigsToVSCode();
        vscode.window.showInformationMessage('✅ Configuration loaded from files');
    }

    /**
     * Dispose
     */
    dispose(): void {
        if (this.watcher) {
            this.watcher.dispose();
        }
    }
}
