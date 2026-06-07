/**
 * Usage tracking service for MCP tool calls
 * Provides methods to track tool usage, searches, and sessions
 */

import { getUsageStore, UsageStore } from './usageStore.js';
import { ToolUsageEvent, SearchEvent, SessionEvent } from './types.js';

// Search-related tool names
const SEARCH_TOOLS = [
  'searchAxonExamples',
  'searchAxonOperatorExamples',
  'searchAxonDocs',
  'searchAxonRegex',
  'findFunctionUsage',
  'getFunctionExamples',
];

export class UsageTracker {
  private store: UsageStore;
  private activeSessions: Map<string, { startTime: number; requestCount: number }> = new Map();

  constructor(baseDir?: string) {
    this.store = getUsageStore(baseDir);
  }

  /**
   * Track a tool call - returns a completion callback
   */
  trackToolCall(
    tool: string,
    params: Record<string, unknown>,
    sessionId?: string
  ): (success?: boolean, errorMessage?: string) => void {
    const startTime = Date.now();

    // Update session request count
    if (sessionId) {
      const session = this.activeSessions.get(sessionId);
      if (session) {
        session.requestCount++;
      }
    }

    // Return a function to call when the tool completes
    return (success: boolean = true, errorMessage?: string) => {
      const duration = Date.now() - startTime;

      const event: ToolUsageEvent = {
        tool,
        timestamp: new Date().toISOString(),
        sessionId,
        duration,
        success,
        errorMessage,
        params: this.sanitizeParams(params),
      };

      // Fire and forget - don't block on DB write
      this.store.recordToolUsage(event).catch((err) => {
        console.error('[UsageTracker] Failed to record tool usage:', err);
      });

      // Also track as search if it's a search tool
      if (SEARCH_TOOLS.includes(tool) && params.query) {
        const searchEvent: SearchEvent = {
          query: String(params.query),
          tool,
          timestamp: event.timestamp,
          sessionId,
          resultCount: 0, // Will be updated by caller if available
          duration,
        };
        this.store.recordSearch(searchEvent).catch((err) => {
          console.error('[UsageTracker] Failed to record search:', err);
        });
      }
    };
  }

  /**
   * Track a search with result count
   */
  trackSearch(
    query: string,
    tool: string,
    resultCount: number,
    sessionId?: string,
    duration?: number
  ): void {
    const event: SearchEvent = {
      query,
      tool,
      timestamp: new Date().toISOString(),
      sessionId,
      resultCount,
      duration,
    };
    // Fire and forget
    this.store.recordSearch(event).catch((err) => {
      console.error('[UsageTracker] Failed to record search:', err);
    });
  }

  /**
   * Track session start
   */
  trackSessionStart(sessionId: string): void {
    this.activeSessions.set(sessionId, {
      startTime: Date.now(),
      requestCount: 0,
    });

    const event: SessionEvent = {
      sessionId,
      action: 'start',
      timestamp: new Date().toISOString(),
    };
    this.store.recordSession(event).catch((err) => {
      console.error('[UsageTracker] Failed to record session start:', err);
    });
  }

  /**
   * Track session end
   */
  trackSessionEnd(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    const duration = session ? Date.now() - session.startTime : undefined;
    const requestCount = session?.requestCount;

    this.activeSessions.delete(sessionId);

    const event: SessionEvent = {
      sessionId,
      action: 'end',
      timestamp: new Date().toISOString(),
      duration,
      requestCount,
    };
    this.store.recordSession(event).catch((err) => {
      console.error('[UsageTracker] Failed to record session end:', err);
    });
  }

  /**
   * Get current active session count
   */
  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Get usage stats for dashboard
   */
  async getStats(days?: number) {
    return this.store.getStats(days);
  }

  /**
   * Get daily stats for charts
   */
  async getDailyStats(days?: number) {
    return this.store.getDailyStats(days);
  }

  /**
   * Get tool usage breakdown
   */
  async getToolUsage(days?: number) {
    return this.store.getToolUsage(days);
  }

  /**
   * Get search analytics
   */
  async getSearchAnalytics(days?: number) {
    return this.store.getSearchAnalytics(days);
  }

  /**
   * Export all data
   */
  async exportData() {
    return this.store.exportData();
  }

  /**
   * Get database info (path, size, record counts)
   */
  async getDatabaseInfo() {
    return this.store.getDatabaseInfo();
  }

  /**
   * Clear all usage data (keeps database file)
   */
  async clearData(): Promise<void> {
    await this.store.clear();
  }

  /**
   * Reset database - delete file and reinitialize (complete reset)
   */
  async resetDatabase(): Promise<void> {
    // Clear active sessions since we're resetting
    this.activeSessions.clear();
    await this.store.resetDatabase();
  }

  /**
   * Flush data to disk
   */
  async flush(): Promise<void> {
    await this.store.flush();
  }

  /**
   * Sanitize params to remove sensitive data
   */
  private sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = ['password', 'token', 'secret', 'auth', 'credential'];

    for (const [key, value] of Object.entries(params)) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.length > 200) {
        sanitized[key] = value.substring(0, 200) + '...';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}

// Singleton instance
let instance: UsageTracker | null = null;

export function getUsageTracker(baseDir?: string): UsageTracker {
  if (!instance) {
    instance = new UsageTracker(baseDir);
  }
  return instance;
}
