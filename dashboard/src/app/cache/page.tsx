'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Database, Trash2, RefreshCw } from 'lucide-react';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

export default function CachePage() {
  const queryClient = useQueryClient();

  const { data: caches, isLoading, refetch } = useQuery({
    queryKey: ['caches'],
    queryFn: api.getCaches,
  });

  const clearMutation = useMutation({
    mutationFn: (name?: string) => api.clearCache(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caches'] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  const totalSize = caches?.reduce((sum, c) => sum + c.size, 0) || 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cache</h1>
          <p className="text-gray-500">Manage cached index files</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            onClick={() => clearMutation.mutate(undefined)}
            disabled={clearMutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Clear All
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">Total Cache Files</p>
          <p className="text-3xl font-bold text-gray-900">{caches?.length || 0}</p>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">Total Size</p>
          <p className="text-3xl font-bold text-gray-900">{formatBytes(totalSize)}</p>
        </div>
      </div>

      {/* Cache Files */}
      <div className="rounded-xl bg-white shadow-sm overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">File</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Age</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {caches?.map((cache) => (
              <tr key={cache.name}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <Database className="h-5 w-5 text-gray-400" />
                    <span className="font-mono text-sm text-gray-900">{cache.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">{formatBytes(cache.size)}</td>
                <td className="px-6 py-4 text-sm text-gray-500">{formatAge(cache.age)}</td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => clearMutation.mutate(cache.name)}
                    disabled={clearMutation.isPending}
                    className="flex items-center gap-1 text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {(!caches || caches.length === 0) && (
          <div className="py-12 text-center text-gray-500">
            No cache files found
          </div>
        )}
      </div>
    </div>
  );
}
