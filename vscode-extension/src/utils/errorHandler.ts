import * as vscode from 'vscode';
import { getLogger } from './logger';

/**
 * Custom error class for extension-specific errors
 */
export class AxonExtensionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'AxonExtensionError';
  }
}

/**
 * Error codes used throughout the extension
 */
export enum ErrorCode {
  MCP_SERVER_START_FAILED = 'MCP_SERVER_START_FAILED',
  MCP_SERVER_COMMUNICATION_ERROR = 'MCP_SERVER_COMMUNICATION_ERROR',
  MCP_SERVER_TIMEOUT = 'MCP_SERVER_TIMEOUT',
  AI_PROVIDER_NOT_CONFIGURED = 'AI_PROVIDER_NOT_CONFIGURED',
  AI_PROVIDER_API_ERROR = 'AI_PROVIDER_API_ERROR',
  AI_PROVIDER_AUTHENTICATION_ERROR = 'AI_PROVIDER_AUTHENTICATION_ERROR',
  SKYSPARK_CONNECTION_ERROR = 'SKYSPARK_CONNECTION_ERROR',
  SKYSPARK_AUTHENTICATION_ERROR = 'SKYSPARK_AUTHENTICATION_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Error handler class for consistent error handling throughout the extension
 */
export class ErrorHandler {
  private logger = getLogger();

  /**
   * Handle an error and show appropriate user message
   */
  handleError(error: Error | AxonExtensionError, context?: string): void {
    const contextMessage = context ? `[${context}] ` : '';
    
    this.logger.error(`${contextMessage}${error.message}`, error);

    // Determine user-friendly message
    let userMessage = error.message;
    let showDetails = false;

    if (error instanceof AxonExtensionError) {
      userMessage = this.getUserFriendlyMessage(error.code, error.message);
      showDetails = true;
    }

    // Show error to user
    if (showDetails) {
      vscode.window.showErrorMessage(
        `${contextMessage}${userMessage}`,
        'Show Details',
        'Dismiss'
      ).then(selection => {
        if (selection === 'Show Details') {
          this.logger.show();
        }
      });
    } else {
      vscode.window.showErrorMessage(`${contextMessage}${userMessage}`);
    }
  }

  /**
   * Handle an error silently (log only, no user notification)
   */
  handleErrorSilent(error: Error, context?: string): void {
    const contextMessage = context ? `[${context}] ` : '';
    this.logger.error(`${contextMessage}${error.message}`, error);
  }

  /**
   * Wrap an async function with error handling
   */
  async withErrorHandling<T>(
    fn: () => Promise<T>,
    context?: string,
    silent: boolean = false
  ): Promise<T | null> {
    try {
      return await fn();
    } catch (error) {
      if (silent) {
        this.handleErrorSilent(error as Error, context);
      } else {
        this.handleError(error as Error, context);
      }
      return null;
    }
  }

  /**
   * Create an AxonExtensionError with a specific code
   */
  createError(code: ErrorCode, message: string, details?: any): AxonExtensionError {
    return new AxonExtensionError(message, code, details);
  }

  /**
   * Get a user-friendly message for an error code
   */
  private getUserFriendlyMessage(code: string, originalMessage: string): string {
    const messages: Record<string, string> = {
      [ErrorCode.MCP_SERVER_START_FAILED]: 
        'Failed to start MCP server. Please check the extension logs for details.',
      [ErrorCode.MCP_SERVER_COMMUNICATION_ERROR]: 
        'Failed to communicate with MCP server. It may have crashed.',
      [ErrorCode.MCP_SERVER_TIMEOUT]: 
        'MCP server operation timed out.',
      [ErrorCode.AI_PROVIDER_NOT_CONFIGURED]: 
        'AI provider is not configured. Please set your API key in settings.',
      [ErrorCode.AI_PROVIDER_API_ERROR]: 
        'AI provider API error. Please check your API key and try again.',
      [ErrorCode.AI_PROVIDER_AUTHENTICATION_ERROR]: 
        'AI provider authentication failed. Please check your API key.',
      [ErrorCode.SKYSPARK_CONNECTION_ERROR]: 
        'Failed to connect to SkySpark. Please check your connection settings.',
      [ErrorCode.SKYSPARK_AUTHENTICATION_ERROR]: 
        'SkySpark authentication failed. Please check your credentials.',
      [ErrorCode.CONFIGURATION_ERROR]: 
        'Configuration error. Please check your extension settings.',
      [ErrorCode.VALIDATION_ERROR]: 
        'Validation error: ' + originalMessage,
      [ErrorCode.UNKNOWN_ERROR]: 
        'An unknown error occurred: ' + originalMessage
    };

    return messages[code] || originalMessage;
  }
}

// Singleton error handler instance
let errorHandlerInstance: ErrorHandler | null = null;

/**
 * Get the singleton error handler instance
 */
export function getErrorHandler(): ErrorHandler {
  if (!errorHandlerInstance) {
    errorHandlerInstance = new ErrorHandler();
  }
  return errorHandlerInstance;
}
