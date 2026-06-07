/**
 * Usage data persistence layer using Prisma + SQLite
 * Stores usage data to .cache/usage.db
 */

import * as path from 'path';
import * as fs from 'fs';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient, ToolEvent as PrismaToolEvent, SearchEvent as PrismaSearchEvent, SessionEvent as PrismaSessionEvent, DailyStats as PrismaDailyStats } from '../generated/prisma/client.js';
import { getConfig } from '../config/config.js';
import {
  UsageData,
  ToolUsageEvent,
  SearchEvent,
  SessionEvent,
  DailyStats,
  UsageStats,
  USAGE_DATA_VERSION,
} from './types.js';

const MAX_DAILY_STATS = 90; // Keep 90 days of daily stats
const DEFAULT_CACHE_DIR = '.cache';
const DB_FILE = 'usage.db';

export class UsageStore {
  private prisma: InstanceType<typeof PrismaClient>;
  private initialized = false;

  private dbPath: string;

  constructor(baseDir: string = process.cwd()) {
    // Get cache directory from config or use default
    const config = getConfig();
    const cacheDir = path.join(baseDir, config.cache?.directory || DEFAULT_CACHE_DIR);

    // Ensure cache directory exists
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    this.dbPath = path.join(cacheDir, DB_FILE);

    // Create better-sqlite3 adapter with file URL
    const adapter = new PrismaBetterSqlite3({ url: `file:${this.dbPath}` });

    // Create Prisma client with adapter
    this.prisma = new PrismaClient({ adapter });
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.prisma.$connect();
      this.initialized = true;
    }
  }

  /**
   * Force immediate save (for graceful shutdown)
   */
  async flush(): Promise<void> {
    await this.prisma.$disconnect();
    this.initialized = false;
  }

  /**
   * Record a tool usage event
   */
  async recordToolUsage(event: ToolUsageEvent): Promise<void> {
    await this.ensureInitialized();

    await this.prisma.toolEvent.create({
      data: {
        toolName: event.tool,
        timestamp: new Date(event.timestamp),
        durationMs: event.duration,
        success: event.success,
        error: event.errorMessage,
        params: event.params ? JSON.stringify(event.params) : null,
      },
    });

    await this.updateDailyStats(event.timestamp, 'toolCall');
  }

  /**
   * Record a search event
   */
  async recordSearch(event: SearchEvent): Promise<void> {
    await this.ensureInitialized();

    await this.prisma.searchEvent.create({
      data: {
        query: event.query,
        toolName: event.tool,
        timestamp: new Date(event.timestamp),
        resultCount: event.resultCount,
        durationMs: event.duration,
      },
    });

    await this.updateDailyStats(event.timestamp, 'search');
  }

  /**
   * Record a session event
   */
  async recordSession(event: SessionEvent): Promise<void> {
    await this.ensureInitialized();

    await this.prisma.sessionEvent.create({
      data: {
        sessionId: event.sessionId,
        action: event.action,
        timestamp: new Date(event.timestamp),
        durationMs: event.duration,
        requestCount: event.requestCount,
      },
    });

    if (event.action === 'start') {
      await this.updateDailyStats(event.timestamp, 'session');
    }
  }

  private async updateDailyStats(
    timestamp: string,
    type: 'toolCall' | 'search' | 'session'
  ): Promise<void> {
    const date = timestamp.split('T')[0];

    // Upsert daily stats
    const existing = await this.prisma.dailyStats.findUnique({
      where: { date },
    });

    if (existing) {
      const update: { toolCalls?: number; searches?: number; sessions?: number } = {};
      switch (type) {
        case 'toolCall':
          update.toolCalls = existing.toolCalls + 1;
          break;
        case 'search':
          update.searches = existing.searches + 1;
          break;
        case 'session':
          update.sessions = existing.sessions + 1;
          break;
      }
      await this.prisma.dailyStats.update({
        where: { date },
        data: update,
      });
    } else {
      await this.prisma.dailyStats.create({
        data: {
          date,
          toolCalls: type === 'toolCall' ? 1 : 0,
          searches: type === 'search' ? 1 : 0,
          sessions: type === 'session' ? 1 : 0,
          uniqueTools: 0,
        },
      });

      // Clean up old daily stats
      await this.cleanupOldDailyStats();
    }
  }

  private async cleanupOldDailyStats(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_DAILY_STATS);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    await this.prisma.dailyStats.deleteMany({
      where: { date: { lt: cutoffStr } },
    });
  }

  /**
   * Get usage statistics for the dashboard
   */
  async getStats(days: number = 7): Promise<UsageStats> {
    await this.ensureInitialized();

    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - days);
    const now = new Date();

    // Get tool events
    const toolEvents = await this.prisma.toolEvent.findMany({
      where: { timestamp: { gte: periodStart } },
      orderBy: { timestamp: 'desc' },
    });

    // Get search events
    const searchEvents = await this.prisma.searchEvent.findMany({
      where: { timestamp: { gte: periodStart } },
    });

    // Get session events
    const sessionEvents = await this.prisma.sessionEvent.findMany({
      where: { timestamp: { gte: periodStart } },
    });

    // Calculate tool usage counts
    const toolUsage: Record<string, number> = {};
    for (const event of toolEvents) {
      toolUsage[event.toolName] = (toolUsage[event.toolName] || 0) + 1;
    }

    // Calculate search term counts
    const searchCounts: Record<string, number> = {};
    for (const event of searchEvents) {
      const query = event.query.toLowerCase().trim();
      if (query) {
        searchCounts[query] = (searchCounts[query] || 0) + 1;
      }
    }

    const topSearches = Object.entries(searchCounts)
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // Count active sessions
    const sessionStarts = new Set(
      sessionEvents.filter((e: PrismaSessionEvent) => e.action === 'start').map((e: PrismaSessionEvent) => e.sessionId)
    );
    const sessionEnds = new Set(
      sessionEvents.filter((e: PrismaSessionEvent) => e.action === 'end').map((e: PrismaSessionEvent) => e.sessionId)
    );
    const activeSessions = [...sessionStarts].filter(
      (id) => !sessionEnds.has(id)
    ).length;

    // Convert recent activity to ToolUsageEvent format
    const recentActivity: ToolUsageEvent[] = toolEvents.slice(0, 50).map((e: PrismaToolEvent) => ({
      tool: e.toolName,
      timestamp: e.timestamp.toISOString(),
      duration: e.durationMs ?? undefined,
      success: e.success,
      errorMessage: e.error ?? undefined,
      params: e.params ? JSON.parse(e.params) : undefined,
    }));

    return {
      totalToolCalls: toolEvents.length,
      totalSearches: searchEvents.length,
      totalSessions: sessionStarts.size,
      activeSessions,
      toolUsage,
      topSearches,
      recentActivity,
      periodStart: periodStart.toISOString(),
      periodEnd: now.toISOString(),
    };
  }

  /**
   * Get daily statistics for charts
   */
  async getDailyStats(days: number = 30): Promise<DailyStats[]> {
    await this.ensureInitialized();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const stats = await this.prisma.dailyStats.findMany({
      where: { date: { gte: cutoffStr } },
      orderBy: { date: 'asc' },
    });

    return stats.map((s: PrismaDailyStats) => ({
      date: s.date,
      toolCalls: s.toolCalls,
      searches: s.searches,
      sessions: s.sessions,
      uniqueTools: s.uniqueTools,
    }));
  }

  /**
   * Get tool usage breakdown
   */
  async getToolUsage(days: number = 7): Promise<Record<string, number>> {
    await this.ensureInitialized();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const grouped = await this.prisma.toolEvent.groupBy({
      by: ['toolName'],
      where: { timestamp: { gte: cutoff } },
      _count: { toolName: true },
    });

    const usage: Record<string, number> = {};
    for (const item of grouped) {
      usage[item.toolName] = item._count.toolName;
    }
    return usage;
  }

  /**
   * Get search analytics
   */
  async getSearchAnalytics(
    days: number = 7
  ): Promise<{ popular: Array<{ query: string; count: number }>; zeroResults: string[] }> {
    await this.ensureInitialized();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    // Get all search events in period
    const searchEvents = await this.prisma.searchEvent.findMany({
      where: { timestamp: { gte: cutoff } },
    });

    const counts: Record<string, number> = {};
    const zeroResults: Set<string> = new Set();

    for (const event of searchEvents) {
      const query = event.query.toLowerCase().trim();
      if (query) {
        counts[query] = (counts[query] || 0) + 1;
        if (event.resultCount === 0) {
          zeroResults.add(query);
        }
      }
    }

    const popular = Object.entries(counts)
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

    return { popular, zeroResults: [...zeroResults] };
  }

  /**
   * Export all data for download
   */
  async exportData(): Promise<UsageData> {
    await this.ensureInitialized();

    const toolEvents = await this.prisma.toolEvent.findMany({
      orderBy: { timestamp: 'desc' },
    });

    const searchEvents = await this.prisma.searchEvent.findMany({
      orderBy: { timestamp: 'desc' },
    });

    const sessionEvents = await this.prisma.sessionEvent.findMany({
      orderBy: { timestamp: 'desc' },
    });

    const dailyStats = await this.prisma.dailyStats.findMany({
      orderBy: { date: 'desc' },
    });

    return {
      version: USAGE_DATA_VERSION,
      lastUpdated: new Date().toISOString(),
      toolEvents: toolEvents.map((e: PrismaToolEvent) => ({
        tool: e.toolName,
        timestamp: e.timestamp.toISOString(),
        duration: e.durationMs ?? undefined,
        success: e.success,
        errorMessage: e.error ?? undefined,
        params: e.params ? JSON.parse(e.params) : undefined,
      })),
      searchEvents: searchEvents.map((e: PrismaSearchEvent) => ({
        query: e.query,
        tool: e.toolName,
        timestamp: e.timestamp.toISOString(),
        resultCount: e.resultCount,
        duration: e.durationMs ?? undefined,
      })),
      sessionEvents: sessionEvents.map((e: PrismaSessionEvent) => ({
        sessionId: e.sessionId,
        action: e.action as 'start' | 'end',
        timestamp: e.timestamp.toISOString(),
        duration: e.durationMs ?? undefined,
        requestCount: e.requestCount ?? undefined,
      })),
      dailyStats: dailyStats.map((s: PrismaDailyStats) => ({
        date: s.date,
        toolCalls: s.toolCalls,
        searches: s.searches,
        sessions: s.sessions,
        uniqueTools: s.uniqueTools,
      })),
    };
  }

  /**
   * Clear all usage data
   */
  async clear(): Promise<void> {
    await this.ensureInitialized();

    await this.prisma.toolEvent.deleteMany();
    await this.prisma.searchEvent.deleteMany();
    await this.prisma.sessionEvent.deleteMany();
    await this.prisma.dailyStats.deleteMany();
  }

  /**
   * Get database path for display/debugging
   */
  getDatabasePath(): string {
    return this.dbPath;
  }

  /**
   * Get database info (size, record counts)
   */
  async getDatabaseInfo(): Promise<{
    path: string;
    sizeBytes: number;
    recordCounts: {
      toolEvents: number;
      searchEvents: number;
      sessionEvents: number;
      dailyStats: number;
    };
  }> {
    await this.ensureInitialized();

    let sizeBytes = 0;
    try {
      const stats = fs.statSync(this.dbPath);
      sizeBytes = stats.size;
    } catch {
      // File may not exist yet
    }

    const [toolEvents, searchEvents, sessionEvents, dailyStats] = await Promise.all([
      this.prisma.toolEvent.count(),
      this.prisma.searchEvent.count(),
      this.prisma.sessionEvent.count(),
      this.prisma.dailyStats.count(),
    ]);

    return {
      path: this.dbPath,
      sizeBytes,
      recordCounts: {
        toolEvents,
        searchEvents,
        sessionEvents,
        dailyStats,
      },
    };
  }

  /**
   * Reset database - delete file and reinitialize
   */
  async resetDatabase(): Promise<void> {
    // Disconnect first
    await this.prisma.$disconnect();
    this.initialized = false;

    // Delete the database file if it exists
    if (fs.existsSync(this.dbPath)) {
      fs.unlinkSync(this.dbPath);
    }

    // Reconnect - this will recreate the database
    await this.ensureInitialized();
  }
}

// Singleton instance
let instance: UsageStore | null = null;

export function getUsageStore(baseDir?: string): UsageStore {
  if (!instance) {
    instance = new UsageStore(baseDir);
  }
  return instance;
}

/**
 * Reset the singleton instance (use after resetDatabase if needed)
 */
export function resetUsageStoreInstance(): void {
  if (instance) {
    instance.flush().catch(() => {});
  }
  instance = null;
}
