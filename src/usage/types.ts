/**
 * Usage tracking types for the Axon MCP Server dashboard
 */

export interface ToolUsageEvent {
  tool: string;
  timestamp: string;
  sessionId?: string;
  duration?: number;
  success: boolean;
  errorMessage?: string;
  params?: Record<string, unknown>;
}

export interface SearchEvent {
  query: string;
  tool: string;
  timestamp: string;
  sessionId?: string;
  resultCount: number;
  duration?: number;
}

export interface SessionEvent {
  sessionId: string;
  action: 'start' | 'end';
  timestamp: string;
  duration?: number;
  requestCount?: number;
}

export interface UsageStats {
  totalToolCalls: number;
  totalSearches: number;
  totalSessions: number;
  activeSessions: number;
  toolUsage: Record<string, number>;
  topSearches: Array<{ query: string; count: number }>;
  recentActivity: ToolUsageEvent[];
  periodStart: string;
  periodEnd: string;
}

export interface DailyStats {
  date: string;
  toolCalls: number;
  searches: number;
  sessions: number;
  uniqueTools: number;
}

export interface UsageData {
  version: number;
  lastUpdated: string;
  toolEvents: ToolUsageEvent[];
  searchEvents: SearchEvent[];
  sessionEvents: SessionEvent[];
  dailyStats: DailyStats[];
}

export const USAGE_DATA_VERSION = 1;
