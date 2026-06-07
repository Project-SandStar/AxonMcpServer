'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Server, FolderOpen, Code, FileText, Activity } from 'lucide-react';
import { ProjectSelector } from '@/components/ProjectSelector';

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatCard({
  title,
  value,
  icon: Icon,
  subtitle,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  subtitle?: string;
}) {
  return (
    <div className="rounded-xl bg-white p-6 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="rounded-lg bg-blue-100 p-3">
          <Icon className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: status, isLoading, error } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
  });

  const { data: usage } = useQuery({
    queryKey: ['usage'],
    queryFn: () => api.getUsage(7),
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 font-medium">Failed to connect to server</p>
          <p className="text-sm text-gray-500 mt-1">Make sure the MCP server is running</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">Axon MCP Server Overview</p>
        </div>
        <ProjectSelector />
      </div>

      {/* Status Banner */}
      <div
        className={`rounded-xl p-4 ${
          status?.status === 'running'
            ? 'bg-green-100 text-green-800'
            : status?.status === 'starting'
            ? 'bg-yellow-100 text-yellow-800'
            : 'bg-red-100 text-red-800'
        }`}
      >
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          <span className="font-medium">
            Server {status?.status === 'running' ? 'Running' : status?.status}
          </span>
          {status?.activeInstance && (
            <span className="text-sm">
              — Active: {status.activeInstance}/{status.activeProject}
            </span>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Instances"
          value={status?.stats.instances || 0}
          icon={Server}
        />
        <StatCard
          title="Projects"
          value={status?.stats.projects || 0}
          icon={FolderOpen}
        />
        <StatCard
          title="Functions Indexed"
          value={status?.stats.functions || 0}
          icon={Code}
        />
        <StatCard
          title="Docs Indexed"
          value={status?.stats.docsIndexed || 0}
          icon={FileText}
        />
      </div>

      {/* System Info */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">System</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500">Uptime</span>
              <span className="font-medium">{formatUptime(status?.uptime || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Memory Used</span>
              <span className="font-medium">
                {formatBytes(status?.memory.used || 0)} / {formatBytes(status?.memory.total || 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Memory %</span>
              <span className="font-medium">{status?.memory.percentage || 0}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Version</span>
              <span className="font-medium">{status?.version}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Usage (7 days)</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500">Tool Calls</span>
              <span className="font-medium">{usage?.totalToolCalls || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Searches</span>
              <span className="font-medium">{usage?.totalSearches || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Sessions</span>
              <span className="font-medium">{usage?.totalSessions || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Active Sessions</span>
              <span className="font-medium">{usage?.activeSessions || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      {usage?.recentActivity && usage.recentActivity.length > 0 && (
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Recent Activity</h2>
          <div className="space-y-2">
            {usage.recentActivity.slice(0, 10).map((activity, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div className="flex items-center gap-3">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      activity.success ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  />
                  <span className="font-medium text-gray-700">{activity.tool}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  {activity.duration && <span>{activity.duration}ms</span>}
                  <span>{new Date(activity.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
