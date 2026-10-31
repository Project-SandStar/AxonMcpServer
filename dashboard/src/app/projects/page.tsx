'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, SyncAllStatus } from '@/lib/api';
import { FolderOpen, RefreshCw, Clock, Loader2, Square, Info, AlertCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ProjectSelector } from '@/components/ProjectSelector';

function formatDate(date: string | undefined | null): string {
  if (!date) return 'Never';
  return new Date(date).toLocaleString();
}

function SyncAllPanel({ s, onCancel, cancelling }: { s: SyncAllStatus; onCancel: () => void; cancelling: boolean }) {
  if (s.state === 'idle') return null;
  const running = s.state === 'running';
  const pct = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
  const failed = s.items.filter((i) => i.state === 'failed');
  const skipped = s.items.filter((i) => i.state === 'skipped').length;
  return (
    <div className="rounded-xl bg-white p-6 shadow-sm space-y-3" data-testid="sync-all-panel">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          {running ? 'Sync all is running' : s.state === 'cancelled' ? 'Sync all was cancelled' : 'Sync all is done'}
        </h2>
        {running && (
          <button
            onClick={onCancel}
            disabled={cancelling || s.cancelRequested}
            className="flex items-center gap-2 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            <Square className="h-4 w-4" />
            {s.cancelRequested ? 'Stops after this project' : 'Cancel'}
          </button>
        )}
      </div>
      <p className="text-sm text-gray-700">
        {s.completed} of {s.total} done
        {s.failed > 0 && <span className="text-red-600">, {s.failed} failed</span>}
        {skipped > 0 && <span className="text-gray-500">, {skipped} not started</span>}
        {running && s.current && (
          <> — now <span className="font-mono">{s.current.instance}/{s.current.project}</span></>
        )}
      </p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div className={`h-2 ${s.failed ? 'bg-amber-500' : 'bg-blue-600'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-500">
        Started {formatDate(s.startedAt)}{s.startedBy ? ` by ${s.startedBy}` : ''}
        {s.finishedAt && `, ended ${formatDate(s.finishedAt)}`}
      </p>
      {failed.length > 0 && (
        <ul className="space-y-1 text-sm">
          {failed.map((f) => (
            <li key={`${f.instance}/${f.project}`} className="flex gap-2 text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span className="font-mono">{f.instance}/{f.project}</span>
              <span className="text-red-600">{f.error}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: api.getMe, retry: false });
  const isAdmin = me?.role === 'admin';

  const syncAll = useQuery({
    queryKey: ['sync-all'],
    queryFn: api.getSyncAll,
    refetchInterval: (q) => (q.state.data?.state === 'running' ? 2000 : false),
  });
  const allRunning = syncAll.data?.state === 'running';

  // Check if any project is syncing (from server) to enable auto-refresh
  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: api.getProjects,
    // Refresh every 2 seconds while any project is syncing
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasSyncing = data?.some((p: any) => p.isSyncing);
      return hasSyncing || allRunning ? 2000 : false;
    },
  });

  // Refresh the list when a sync-all run ends
  const lastState = useRef<string | undefined>(undefined);
  useEffect(() => {
    const st = syncAll.data?.state;
    if (lastState.current === 'running' && st && st !== 'running') {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    }
    lastState.current = st;
  }, [syncAll.data?.state, queryClient]);

  const syncMutation = useMutation({
    mutationFn: ({ instance, project }: { instance: string; project: string }) =>
      api.syncProject(instance, project),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const startAll = useMutation({
    mutationFn: api.startSyncAll,
    onSuccess: (data) => {
      setError(null);
      queryClient.setQueryData(['sync-all'], data);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err: Error) => {
      setError(err.message);
      queryClient.invalidateQueries({ queryKey: ['sync-all'] });
    },
  });

  const cancelAll = useMutation({
    mutationFn: api.cancelSyncAll,
    onSuccess: (data) => queryClient.setQueryData(['sync-all'], data),
    onError: (err: Error) => setError(err.message),
  });

  const handleSync = async (instance: string, project: string) => {
    setSyncing(`${instance}/${project}`);
    setError(null);
    try {
      await syncMutation.mutateAsync({ instance, project });
    } catch (err) {
      setError(`Sync ${instance}/${project} failed: ${(err as Error).message}`);
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

  const count = projects?.length ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Project Sync</h1>
          <p className="text-gray-500">All SkySpark projects and sync status</p>
        </div>
        <div className="flex items-start gap-3">
          {isAdmin && (
            <button
              onClick={() => startAll.mutate()}
              disabled={allRunning || startAll.isPending || count === 0 || !!syncing}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              title="Sync every project below, one after another"
            >
              <RefreshCw className={`h-4 w-4 ${allRunning ? 'animate-spin' : ''}`} />
              {allRunning ? 'Sync all running...' : `Sync all (${count})`}
            </button>
          )}
          <ProjectSelector />
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>Sync pulls functions from the SkySpark server into Axon on basws42. It does not send them to your computer.</span>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="h-5 w-5" /> {error}
        </div>
      )}

      {syncAll.data && (
        <SyncAllPanel s={syncAll.data} onCancel={() => cancelAll.mutate()} cancelling={cancelAll.isPending} />
      )}

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
            {projects?.map((project) => {
              const key = `${project.instance}/${project.project}`;
              const item = syncAll.data?.items.find((i) => `${i.instance}/${i.project}` === key);
              const busy = syncing === key || !!project.isSyncing;
              return (
                <tr key={key} className={project.isActive ? 'bg-blue-50' : ''}>
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
                        {allRunning && item?.state === 'waiting' && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Waiting</span>
                        )}
                        {item?.state === 'failed' && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700" title={item.error}>Failed</span>
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
                      disabled={busy || allRunning}
                      className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
                    >
                      <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
                      {busy ? 'Syncing...' : 'Sync'}
                    </button>
                  </td>
                </tr>
              );
            })}
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
