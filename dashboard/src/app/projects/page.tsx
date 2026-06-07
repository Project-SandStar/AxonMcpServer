'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FolderOpen, RefreshCw, Clock, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { ProjectSelector } from '@/components/ProjectSelector';

function formatDate(date: string | undefined): string {
  if (!date) return 'Never';
  return new Date(date).toLocaleString();
}

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState<string | null>(null);

  // Check if any project is syncing (from server) to enable auto-refresh
  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: api.getProjects,
    // Refresh every 2 seconds while any project is syncing
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasSyncing = data?.some((p: any) => p.isSyncing);
      return hasSyncing ? 2000 : false;
    },
  });

  const syncMutation = useMutation({
    mutationFn: ({ instance, project }: { instance: string; project: string }) =>
      api.syncProject(instance, project),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const handleSync = async (instance: string, project: string) => {
    setSyncing(`${instance}/${project}`);
    try {
      await syncMutation.mutateAsync({ instance, project });
    } finally {
      setSyncing(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Project Sync</h1>
          <p className="text-gray-500">All SkySpark projects and sync status</p>
        </div>
        <ProjectSelector />
      </div>

      <div className="rounded-xl bg-white shadow-sm overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Instance</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Functions</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Sync</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {projects?.map((project) => (
              <tr key={`${project.instance}/${project.project}`} className={project.isActive ? 'bg-blue-50' : ''}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <FolderOpen className="h-5 w-5 text-gray-400" />
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{project.project}</span>
                      {project.isActive && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                          Active
                        </span>
                      )}
                      {project.isSyncing && (
                        <span className="flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Syncing
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">{project.instance}</td>
                <td className="px-6 py-4 text-sm text-gray-900">{project.functionCount ?? '—'}</td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {formatDate(project.lastSync)}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => handleSync(project.instance, project.project)}
                    disabled={syncing === `${project.instance}/${project.project}`}
                    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${syncing === `${project.instance}/${project.project}` ? 'animate-spin' : ''}`} />
                    {syncing === `${project.instance}/${project.project}` ? 'Syncing...' : 'Sync'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {(!projects || projects.length === 0) && (
          <div className="py-12 text-center text-gray-500">
            No projects found
          </div>
        )}
      </div>
    </div>
  );
}
