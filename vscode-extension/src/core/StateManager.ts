import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { ExtensionState, McpServerStatus, ProviderType } from '../types';
import { getLogger } from '../utils/logger';

/**
 * State Manager for centralized state management across the extension
 * Implements observable pattern with debounced persistence
 */
export class StateManager extends EventEmitter {
  private state: ExtensionState;
  private context: vscode.ExtensionContext;
  private persistenceTimeout?: NodeJS.Timeout;
  private readonly PERSISTENCE_DELAY_MS = 500;
  private logger = getLogger();

  constructor(context: vscode.ExtensionContext) {
    super();
    this.context = context;
    this.state = this.loadState();
    this.logger.info('StateManager initialized');
  }

  /**
   * Get the current state (readonly copy)
   */
  getState(): Readonly<ExtensionState> {
    return { ...this.state };
  }

  /**
   * Update state with partial updates
   * Emits 'stateChange' event with new and old state
   */
  updateState(updates: Partial<ExtensionState>): void {
    const oldState = { ...this.state };
    Object.assign(this.state, updates);
    
    this.logger.debug('State updated', { updates });
    this.emit('stateChange', this.state, oldState);
    this.schedulePersistence();
  }

  /**
   * Get MCP server status
   */
  getMcpServerStatus(): McpServerStatus {
    return { ...this.state.mcpServerStatus };
  }

  /**
   * Update MCP server status
   */
  updateMcpServerStatus(status: Partial<McpServerStatus>): void {
    this.updateState({
      mcpServerStatus: {
        ...this.state.mcpServerStatus,
        ...status
      }
    });
  }

  /**
   * Get active provider type
   */
  getActiveProvider(): ProviderType {
    return this.state.activeProvider;
  }

  /**
   * Set active provider
   */
  setActiveProvider(provider: ProviderType): void {
    this.updateState({ activeProvider: provider });
  }

  /**
   * Get provider configuration
   */
  getProviderConfig(): Readonly<typeof this.state.providerConfig> {
    return { ...this.state.providerConfig };
  }

  /**
   * Update provider configuration
   */
  updateProviderConfig(config: Partial<typeof this.state.providerConfig>): void {
    this.updateState({
      providerConfig: {
        ...this.state.providerConfig,
        ...config
      }
    });
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): Readonly<typeof this.state.cacheStats> {
    return { ...this.state.cacheStats };
  }

  /**
   * Update cache statistics
   */
  updateCacheStats(stats: Partial<typeof this.state.cacheStats>): void {
    const updated = {
      ...this.state.cacheStats,
      ...stats
    };
    
    // Calculate hit rate
    const total = updated.hits + updated.misses;
    if (total > 0) {
      updated.hitRate = (updated.hits / total) * 100;
    }
    
    this.updateState({ cacheStats: updated });
  }

  /**
   * Get active SkySpark connection
   */
  getActiveConnection() {
    if (!this.state.activeConnectionId) {
      return null;
    }
    return this.state.connections.find(
      conn => conn.id === this.state.activeConnectionId
    ) || null;
  }

  /**
   * Add or update a SkySpark connection
   */
  saveConnection(connection: typeof this.state.connections[0]): void {
    const connections = [...this.state.connections];
    const index = connections.findIndex(c => c.id === connection.id);
    
    if (index >= 0) {
      connections[index] = connection;
    } else {
      connections.push(connection);
    }
    
    this.updateState({ connections });
  }

  /**
   * Set active connection
   */
  setActiveConnection(connectionId: string): void {
    this.updateState({ activeConnectionId: connectionId });
  }

  /**
   * Schedule persistence with debouncing
   */
  private schedulePersistence(): void {
    if (this.persistenceTimeout) {
      clearTimeout(this.persistenceTimeout);
    }
    
    this.persistenceTimeout = setTimeout(() => {
      this.persistState();
    }, this.PERSISTENCE_DELAY_MS);
  }

  /**
   * Persist state to workspace storage
   */
  private async persistState(): Promise<void> {
    try {
      // Don't persist sensitive data or runtime state
      const stateToPersist = {
        ...this.state,
        providerConfig: {
          ...this.state.providerConfig,
          apiKey: undefined // API keys stored in SecretStorage
        },
        currentSession: undefined, // Don't persist active session
        isGenerating: false,
        progress: undefined
      };
      
      await this.context.workspaceState.update('extensionState', stateToPersist);
      this.logger.debug('State persisted successfully');
      this.emit('statePersisted');
    } catch (error) {
      this.logger.error('Failed to persist state', error as Error);
      this.emit('persistenceError', error);
    }
  }

  /**
   * Load state from workspace storage
   */
  private loadState(): ExtensionState {
    try {
      const saved = this.context.workspaceState.get<Partial<ExtensionState>>('extensionState');
      const defaultState = this.getDefaultState();
      
      if (saved) {
        this.logger.info('Loaded state from storage');
        return { ...defaultState, ...saved };
      }
      
      this.logger.info('Using default state');
      return defaultState;
    } catch (error) {
      this.logger.error('Failed to load state, using defaults', error as Error);
      return this.getDefaultState();
    }
  }

  /**
   * Get default state
   */
  private getDefaultState(): ExtensionState {
    return {
      connections: [],
      activeConnectionId: undefined,
      activeProvider: 'anthropic',
      providerConfig: {
        provider: 'anthropic'
      },
      sessionHistory: [],
      mcpServerStatus: {
        isRunning: false
      },
      cacheStats: {
        hits: 0,
        misses: 0,
        size: 0,
        hitRate: 0,
        costSavings: 0
      },
      isGenerating: false
    };
  }

  /**
   * Reset state to defaults
   */
  async reset(): Promise<void> {
    this.state = this.getDefaultState();
    await this.persistState();
    this.emit('stateReset');
    this.logger.info('State reset to defaults');
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    if (this.persistenceTimeout) {
      clearTimeout(this.persistenceTimeout);
    }
    
    // Immediate final persistence
    this.context.workspaceState.update('extensionState', this.state);
    this.removeAllListeners();
    this.logger.info('StateManager disposed');
  }
}
