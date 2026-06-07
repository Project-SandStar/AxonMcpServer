import * as vscode from 'vscode';

/**
 * Log levels for the extension
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

/**
 * Logger class for consistent logging throughout the extension
 */
export class Logger {
  private outputChannel: vscode.OutputChannel;
  private logLevel: LogLevel;

  constructor(name: string = 'Axon VSCode', logLevel: LogLevel = LogLevel.INFO) {
    this.outputChannel = vscode.window.createOutputChannel(name);
    this.logLevel = logLevel;
  }

  /**
   * Log a debug message
   */
  debug(message: string, ...args: any[]): void {
    if (this.logLevel <= LogLevel.DEBUG) {
      this.log('DEBUG', message, ...args);
    }
  }

  /**
   * Log an info message
   */
  info(message: string, ...args: any[]): void {
    if (this.logLevel <= LogLevel.INFO) {
      this.log('INFO', message, ...args);
    }
  }

  /**
   * Log a warning message
   */
  warn(message: string, ...args: any[]): void {
    if (this.logLevel <= LogLevel.WARN) {
      this.log('WARN', message, ...args);
    }
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error, ...args: any[]): void {
    if (this.logLevel <= LogLevel.ERROR) {
      const errorMessage = error ? `${message}: ${error.message}\n${error.stack}` : message;
      this.log('ERROR', errorMessage, ...args);
    }
  }

  /**
   * Internal log method
   */
  private log(level: string, message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level}] ${message}`;
    
    this.outputChannel.appendLine(formattedMessage);
    
    if (args.length > 0) {
      this.outputChannel.appendLine(JSON.stringify(args, null, 2));
    }

    // Also log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(formattedMessage, ...args);
    }
  }

  /**
   * Show the output channel
   */
  show(): void {
    this.outputChannel.show();
  }

  /**
   * Clear the output channel
   */
  clear(): void {
    this.outputChannel.clear();
  }

  /**
   * Dispose of the output channel
   */
  dispose(): void {
    this.outputChannel.dispose();
  }
}

// Singleton logger instance
let loggerInstance: Logger | null = null;

/**
 * Get the singleton logger instance
 */
export function getLogger(): Logger {
  if (!loggerInstance) {
    loggerInstance = new Logger();
  }
  return loggerInstance;
}

/**
 * Initialize the logger with a specific log level
 */
export function initLogger(logLevel: LogLevel = LogLevel.INFO): Logger {
  loggerInstance = new Logger('Axon VSCode', logLevel);
  return loggerInstance;
}
