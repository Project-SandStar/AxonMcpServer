import * as vscode from 'vscode';
import { getLogger } from '../utils/logger';
import { ProviderType } from '../types';

/**
 * Configuration Manager for handling extension settings and secrets
 */
export class ConfigManager {
  private context: vscode.ExtensionContext;
  private logger = getLogger();
  private static readonly SECRET_KEY_PREFIX = 'axon.secret';

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.logger.info('ConfigManager initialized');
  }

  /**
   * Get workspace configuration
   */
  private getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('axon');
  }

  /**
   * Get AI provider type
   */
  getAIProvider(): ProviderType {
    return this.getConfig().get<ProviderType>('ai.provider', 'anthropic');
  }

  /**
   * Get AI plan model
   */
  getPlanModel(): string {
    return this.getConfig().get('ai.planModel', 'claude-3-5-haiku-20241022');
  }

  /**
   * Get AI act model
   */
  getActModel(): string {
    return this.getConfig().get('ai.actModel', 'claude-sonnet-4-20250514');
  }

  /**
   * Get AI thinking budget (tokens)
   */
  getThinkingBudget(): number {
    return this.getConfig().get('ai.thinkingBudget', 10000);
  }

  /**
   * Get API key from secret storage (or settings as fallback)
   */
  async getAPIKey(provider?: ProviderType): Promise<string | undefined> {
    const providerType = provider || this.getAIProvider();
    
    // First, try to get from secure secret storage
    const key = `${ConfigManager.SECRET_KEY_PREFIX}.${providerType}.apiKey`;
    const secretKey = await this.context.secrets.get(key);
    
    if (secretKey) {
      return secretKey;
    }
    
    // Fallback to settings (for backward compatibility or manual configuration)
    const settingsKey = this.getConfig().get<string>('ai.apiKey');
    if (settingsKey && settingsKey.trim().length > 0) {
      this.logger.info('Using API key from settings (consider moving to secure storage)');
      return settingsKey;
    }
    
    return undefined;
  }

  /**
   * Store API key in secret storage
   */
  async setAPIKey(apiKey: string, provider?: ProviderType): Promise<void> {
    const providerType = provider || this.getAIProvider();
    const key = `${ConfigManager.SECRET_KEY_PREFIX}.${providerType}.apiKey`;
    await this.context.secrets.store(key, apiKey);
    this.logger.info(`API key stored for provider: ${providerType}`);
  }

  /**
   * Delete API key from secret storage
   */
  async deleteAPIKey(provider?: ProviderType): Promise<void> {
    const providerType = provider || this.getAIProvider();
    const key = `${ConfigManager.SECRET_KEY_PREFIX}.${providerType}.apiKey`;
    await this.context.secrets.delete(key);
    this.logger.info(`API key deleted for provider: ${providerType}`);
  }

  /**
   * Check if API key is configured
   */
  async hasAPIKey(provider?: ProviderType): Promise<boolean> {
    const apiKey = await this.getAPIKey(provider);
    return !!apiKey && apiKey.length > 0;
  }

  /**
   * Get SkySpark host URL
   */
  getSkySparkHost(): string | undefined {
    return this.getConfig().get<string>('skyspark.host');
  }

  /**
   * Set SkySpark host URL
   */
  async setSkySparkHost(host: string): Promise<void> {
    await this.getConfig().update('skyspark.host', host, vscode.ConfigurationTarget.Workspace);
  }

  /**
   * Get SkySpark project name
   */
  getSkySparkProject(): string | undefined {
    return this.getConfig().get<string>('skyspark.project');
  }

  /**
   * Set SkySpark project name
   */
  async setSkySparkProject(project: string): Promise<void> {
    await this.getConfig().update('skyspark.project', project, vscode.ConfigurationTarget.Workspace);
  }

  /**
   * Get SkySpark username
   */
  getSkySparkUsername(): string | undefined {
    return this.getConfig().get<string>('skyspark.username');
  }

  /**
   * Set SkySpark username
   */
  async setSkySparkUsername(username: string): Promise<void> {
    await this.getConfig().update('skyspark.username', username, vscode.ConfigurationTarget.Workspace);
  }

  /**
   * Get SkySpark password from secret storage
   */
  async getSkySparkPassword(): Promise<string | undefined> {
    const key = `${ConfigManager.SECRET_KEY_PREFIX}.skyspark.password`;
    return await this.context.secrets.get(key);
  }

  /**
   * Store SkySpark password in secret storage
   */
  async setSkySparkPassword(password: string): Promise<void> {
    const key = `${ConfigManager.SECRET_KEY_PREFIX}.skyspark.password`;
    await this.context.secrets.store(key, password);
    this.logger.info('SkySpark password stored');
  }

  /**
   * Delete SkySpark password from secret storage
   */
  async deleteSkySparkPassword(): Promise<void> {
    const key = `${ConfigManager.SECRET_KEY_PREFIX}.skyspark.password`;
    await this.context.secrets.delete(key);
  }

  /**
   * Check if SkySpark is configured
   */
  isSkySparkConfigured(): boolean {
    const host = this.getSkySparkHost();
    const project = this.getSkySparkProject();
    const username = this.getSkySparkUsername();
    return !!(host && project && username);
  }

  /**
   * Get MCP enabled status
   */
  isMCPEnabled(): boolean {
    return this.getConfig().get('mcp.enabled', true);
  }

  /**
   * Listen for configuration changes
   */
  onConfigChange(callback: (e: vscode.ConfigurationChangeEvent) => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('axon')) {
        callback(e);
      }
    });
  }
}
