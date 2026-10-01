'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type AuthClientState, type McpSession } from '@/lib/api';
import {
  Server, Plus, Trash2, Edit2, Save, X, RefreshCw,
  ChevronDown, ChevronRight, FolderOpen, Check, AlertCircle,
  Plug, Download, Loader2, KeyRound, Users, Unplug
} from 'lucide-react';

interface Project {
  name: string;
  description?: string;
  username?: string;
  password?: string;
}

interface Connection {
  name: string;
  host: string;
  port: number;
  protocol: 'http' | 'https';
  username: string;
  password: string;
  defaultProjName?: string;
  projects: Project[];
}

const emptyConnection: Connection = {
  name: '',
  host: 'localhost',
  port: 8080,
  protocol: 'http',
  username: 'su',
  password: 'su',
  defaultProjName: '',
  projects: []
};

const emptyProject: Project = {
  name: '',
  description: '',
  username: '',
  password: ''
};

const authStateStyles: Record<AuthClientState, string> = {
  connected: 'bg-green-100 text-green-700',
  idle: 'bg-gray-100 text-gray-600',
  down: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
};

function AuthStateChip({ state }: { state: AuthClientState }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${authStateStyles[state] ?? authStateStyles.idle}`}>
      {state}
    </span>
  );
}

// Group sessions by logged-in user; sessions without a user go under "Anonymous".
function groupSessionsByUser(sessions: McpSession[]): Array<{ key: string; label: string; sessions: McpSession[] }> {
  const groups = new Map<string, { key: string; label: string; sessions: McpSession[] }>();
  for (const s of sessions) {
    const key = s.userId || '';
    if (!groups.has(key)) groups.set(key, { key, label: s.userId ? (s.username || s.userId) : 'Anonymous', sessions: [] });
    groups.get(key)!.sessions.push(s);
  }
  // Named users first (by label), Anonymous last
  return [...groups.values()].sort((a, b) => (a.key ? 0 : 1) - (b.key ? 0 : 1) || a.label.localeCompare(b.label));
}

function timeAgo(iso?: string): string {
  if (!iso) return '—';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (Number.isNaN(seconds)) return '—';
  if (seconds < 60) return `${seconds} s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}

export default function ConnectionsPage() {
  const queryClient = useQueryClient();
  const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedConnections, setExpandedConnections] = useState<Set<string>>(new Set());
  const [editingProject, setEditingProject] = useState<{ connName: string; index: number; project: Project } | null>(null);
  const [isAddingProject, setIsAddingProject] = useState<string | null>(null);
  const [newProject, setNewProject] = useState<Project>(emptyProject);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [syncingProjects, setSyncingProjects] = useState<Set<string>>(new Set());
  const [reauthingProjects, setReauthingProjects] = useState<Set<string>>(new Set());
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [connectLog, setConnectLog] = useState<Array<{ level: string; step?: string; message: string; ts?: string }>>([]);
  const [showConnectLog, setShowConnectLog] = useState(false);
  const [busySessions, setBusySessions] = useState<Set<string>>(new Set());

  // Active MCP sessions and pooled SkySpark logins
  const { data: sessions = [], refetch: refetchSessions } = useQuery({
    queryKey: ['mcp-sessions'],
    queryFn: api.getSessions,
    refetchInterval: 5000,
  });
  const { data: authClients = [] } = useQuery({
    queryKey: ['auth-clients'],
    queryFn: api.getAuthClients,
    refetchInterval: 5000,
  });

  // Fetch all connection files
  const { data: configs, isLoading, refetch } = useQuery({
    queryKey: ['configs'],
    queryFn: api.getConfigs,
  });

  // Filter to only show connection files (exclude axonMcpServer-config.json)
  const connectionFiles = configs?.filter(c =>
    c.name.endsWith('.json') &&
    c.name !== 'axonMcpServer-config.json' &&
    c.name !== 'admin.json'
  ) || [];

  // Fetch selected connection content
  const { data: connectionData } = useQuery({
    queryKey: ['config', selectedConnection],
    queryFn: () => selectedConnection ? api.getConfig(selectedConnection) : null,
    enabled: !!selectedConnection,
  });

  const connection = connectionData?.content as Connection | undefined;

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: ({ name, content }: { name: string; content: Connection }) =>
      api.updateConfig(name, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configs'] });
      queryClient.invalidateQueries({ queryKey: ['config', selectedConnection] });
      // Backend reloads its in-memory instance list on PUT; refresh anything
      // derived from it so the projects dropdown picks up the change immediately.
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['instances'] });
      queryClient.invalidateQueries({ queryKey: ['status'] });
      setMessage({ type: 'success', text: 'Connection saved successfully' });
      setTimeout(() => setMessage(null), 3000);
    },
    onError: (error) => {
      setMessage({ type: 'error', text: `Failed to save: ${error}` });
    }
  });

  // Delete mutation (we'll create a new file with empty content or use a delete endpoint)
  const deleteMutation = useMutation({
    mutationFn: async (name: string) => {
      // For now, we'll need to add a delete endpoint. Using a workaround.
      const apiBase = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}` : 'http://localhost:3847';
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || apiBase}/admin/config/${name}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Basic ' + btoa(`${localStorage.getItem('admin_user') || 'admin'}:${localStorage.getItem('admin_pass') || 'admin'}`)
        }
      });
      if (!response.ok) throw new Error('Delete failed');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configs'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['instances'] });
      queryClient.invalidateQueries({ queryKey: ['status'] });
      setSelectedConnection(null);
      setMessage({ type: 'success', text: 'Connection deleted' });
      setTimeout(() => setMessage(null), 3000);
    },
    onError: () => {
      setMessage({ type: 'error', text: 'Failed to delete connection' });
    }
  });

  // Discover projects from SkySpark instance using the NDJSON stream so the
  // user sees a live "connecting / authenticating / listing projects" log.
  const handleConnect = async () => {
    if (!connection || !selectedConnection) return;
    setIsDiscovering(true);
    setShowConnectLog(true);
    setConnectLog([{ level: 'info', step: 'init', message: `Connecting to ${connection.protocol}://${connection.host}:${connection.port}…`, ts: new Date().toISOString() }]);
    try {
      const result = await api.discoverProjectsStream(connection.name, (entry) => {
        if (entry.type === 'log') {
          setConnectLog(prev => [...prev, { level: entry.level, step: entry.step, message: entry.message, ts: entry.ts }]);
        } else if (entry.type === 'done') {
          setConnectLog(prev => [...prev, {
            level: entry.success ? 'success' : 'error',
            step: 'done',
            message: entry.success
              ? `Discovery complete — ${(entry.projects || []).length} project(s) returned`
              : `Discovery failed: ${entry.error}`,
            ts: entry.ts
          }]);
        }
      });

      if (!result.success) {
        setMessage({ type: 'error', text: `Failed to connect: ${result.error || 'Unknown error'}` });
        setTimeout(() => setMessage(null), 8000);
        return;
      }

      const discoveredNames = result.projects || [];
      const existingNames = new Set(connection.projects.map(p => p.name));
      const newProjects: Project[] = discoveredNames
        .filter((name: string) => !existingNames.has(name))
        .map((name: string) => ({ name, description: `Auto-discovered from ${connection.name}` }));

      if (newProjects.length > 0) {
        const updatedConnection: Connection = {
          ...connection,
          projects: [...connection.projects, ...newProjects]
        };
        await api.updateConfig(selectedConnection, updatedConnection);
        queryClient.invalidateQueries({ queryKey: ['configs'] });
        queryClient.invalidateQueries({ queryKey: ['config', selectedConnection] });
        setMessage({ type: 'success', text: `Discovered ${newProjects.length} new project(s): ${newProjects.map(p => p.name).join(', ')}` });
      } else if (discoveredNames.length > 0) {
        setMessage({ type: 'success', text: `All ${discoveredNames.length} projects already listed` });
      } else {
        setMessage({ type: 'error', text: 'No projects found on this instance' });
      }
      setTimeout(() => setMessage(null), 5000);
    } catch (error: any) {
      const msg = error?.message || String(error);
      setConnectLog(prev => [...prev, { level: 'error', step: 'fatal', message: msg, ts: new Date().toISOString() }]);
      setMessage({ type: 'error', text: `Failed to connect: ${msg}` });
    } finally {
      setIsDiscovering(false);
    }
  };

  // Sync a project's axon functions
  const handleSyncProject = async (projectName: string) => {
    if (!connection) return;
    setSyncingProjects(prev => new Set(prev).add(projectName));
    try {
      const result = await api.syncProject(connection.name, projectName);
      setMessage({ type: 'success', text: `Synced "${projectName}": ${result.downloaded} downloaded, ${result.updated} updated, ${result.deleted} deleted` });
      setTimeout(() => setMessage(null), 5000);
    } catch (error) {
      setMessage({ type: 'error', text: `Failed to sync "${projectName}": ${error}` });
    } finally {
      setSyncingProjects(prev => {
        const next = new Set(prev);
        next.delete(projectName);
        return next;
      });
    }
  };

  const handleReauthProject = async (projectName: string) => {
    if (!connection) return;
    setReauthingProjects(prev => new Set(prev).add(projectName));
    try {
      const result = await api.reauthenticateProject(connection.name, projectName);
      setMessage({ type: 'success', text: `${result.message} (${result.durationMs} ms)` });
      setTimeout(() => setMessage(null), 5000);
    } catch (error) {
      setMessage({ type: 'error', text: `Failed to reauthenticate "${projectName}": ${error}` });
    } finally {
      setReauthingProjects(prev => {
        const next = new Set(prev);
        next.delete(projectName);
        return next;
      });
    }
  };

  const runSessionAction = async (sessionId: string, action: () => Promise<string>, failure: string) => {
    setBusySessions(prev => new Set(prev).add(sessionId));
    try {
      setMessage({ type: 'success', text: await action() });
      setTimeout(() => setMessage(null), 5000);
    } catch (error) {
      setMessage({ type: 'error', text: `${failure}: ${error}` });
    } finally {
      setBusySessions(prev => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }
  };

  const handleSessionReauth = (sessionId: string, instance: string, project: string) =>
    runSessionAction(sessionId, async () => {
      const result = await api.reauthenticateProject(instance, project);
      return `${result.message} (${result.durationMs} ms)`;
    }, `Failed to reauthenticate "${instance}/${project}"`);

  const handleSessionDisconnect = (sessionId: string) =>
    runSessionAction(sessionId, async () => {
      await api.disconnectSession(sessionId);
      await refetchSessions();
      return `Disconnected session ${sessionId.slice(0, 8)}`;
    }, `Failed to disconnect session ${sessionId.slice(0, 8)}`);

  const toggleExpanded = (name: string) => {
    const newExpanded = new Set(expandedConnections);
    if (newExpanded.has(name)) {
      newExpanded.delete(name);
    } else {
      newExpanded.add(name);
    }
    setExpandedConnections(newExpanded);
  };

  const handleCreateConnection = () => {
    setIsCreating(true);
    setEditingConnection({ ...emptyConnection });
    setSelectedConnection(null);
  };

  const handleEditConnection = () => {
    if (connection) {
      setEditingConnection({ ...connection });
    }
  };

  const handleSaveConnection = () => {
    if (!editingConnection) return;

    const fileName = isCreating
      ? `${editingConnection.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-skyspark.json`
      : selectedConnection!;

    saveMutation.mutate({ name: fileName, content: editingConnection });
    setEditingConnection(null);
    setIsCreating(false);
    if (isCreating) {
      setSelectedConnection(fileName);
    }
  };

  const handleCancelEdit = () => {
    setEditingConnection(null);
    setIsCreating(false);
  };

  const handleDeleteConnection = () => {
    if (!selectedConnection) return;
    if (confirm('Are you sure you want to delete this connection?')) {
      deleteMutation.mutate(selectedConnection);
    }
  };

  const handleAddProject = (connName: string) => {
    setIsAddingProject(connName);
    setNewProject({ ...emptyProject });
  };

  const handleSaveNewProject = () => {
    if (!connection || !selectedConnection || !newProject.name) return;

    const updatedConnection: Connection = {
      ...connection,
      projects: [...connection.projects, newProject]
    };

    saveMutation.mutate({ name: selectedConnection, content: updatedConnection });
    setIsAddingProject(null);
    setNewProject(emptyProject);
  };

  const handleEditProject = (connName: string, index: number) => {
    if (!connection) return;
    setEditingProject({ connName, index, project: { ...connection.projects[index] } });
  };

  const handleSaveProject = () => {
    if (!editingProject || !connection || !selectedConnection) return;

    const updatedProjects = [...connection.projects];
    updatedProjects[editingProject.index] = editingProject.project;

    const updatedConnection: Connection = {
      ...connection,
      projects: updatedProjects
    };

    saveMutation.mutate({ name: selectedConnection, content: updatedConnection });
    setEditingProject(null);
  };

  const handleDeleteProject = (index: number) => {
    if (!connection || !selectedConnection) return;
    if (!confirm('Delete this project?')) return;

    const updatedConnection: Connection = {
      ...connection,
      projects: connection.projects.filter((_, i) => i !== index)
    };

    saveMutation.mutate({ name: selectedConnection, content: updatedConnection });
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Connections</h1>
          <p className="text-gray-500">Manage SkySpark server connections</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              try { await api.reloadConfig(); } catch { /* tolerate older servers */ }
              queryClient.invalidateQueries({ queryKey: ['configs'] });
              queryClient.invalidateQueries({ queryKey: ['projects'] });
              queryClient.invalidateQueries({ queryKey: ['instances'] });
              queryClient.invalidateQueries({ queryKey: ['status'] });
              await refetch();
            }}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            onClick={handleCreateConnection}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add Connection
          </button>
        </div>
      </div>

      {message && (
        <div className={`flex items-center gap-2 rounded-lg px-4 py-3 ${
          message.type === 'success'
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.type === 'success' ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      {/* Logged-in users and their MCP sessions */}
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Users className="h-4 w-4 text-gray-500" />
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Logged-in users</h2>
          <span className="text-xs text-gray-400">({sessions.length} session{sessions.length === 1 ? '' : 's'})</span>
        </div>
        {sessions.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No active MCP sessions</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                  <th className="py-2 pr-4 font-medium">Session</th>
                  <th className="py-2 pr-4 font-medium">App</th>
                  <th className="py-2 pr-4 font-medium">Project</th>
                  <th className="py-2 pr-4 font-medium">Connected since</th>
                  <th className="py-2 pr-4 font-medium">Last activity</th>
                  <th className="py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              {groupSessionsByUser(sessions).map((group) => (
                <tbody key={group.key || 'anonymous'}>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <td colSpan={6} className="py-2 px-2 text-sm font-medium text-gray-800" title={group.key || undefined}>
                      {group.label}
                      <span className="ml-2 text-xs font-normal text-gray-500">
                        {group.sessions.length} session{group.sessions.length === 1 ? '' : 's'}
                      </span>
                    </td>
                  </tr>
                  {group.sessions.map((s) => {
                    const busy = busySessions.has(s.sessionId);
                    const hasProject = Boolean(s.instance && s.project);
                    return (
                      <tr key={s.sessionId} className="border-b border-gray-100 last:border-0">
                        <td className="py-2 pr-4 pl-4 font-mono text-xs text-gray-700" title={s.sessionId}>{s.sessionId.slice(0, 8)}</td>
                        <td className="py-2 pr-4 font-mono text-xs text-gray-700" title={s.clientId}>{s.clientId ? s.clientId.slice(0, 8) : '—'}</td>
                        <td className="py-2 pr-4 text-gray-700">{hasProject ? `${s.instance}/${s.project}` : 'default'}</td>
                        <td className="py-2 pr-4 text-gray-500" title={s.createdAt}>{new Date(s.createdAt).toLocaleString()}</td>
                        <td className="py-2 pr-4 text-gray-500" title={s.lastActivity}>{timeAgo(s.lastActivity)}</td>
                        <td className="py-2 text-right">
                          <div className="inline-flex gap-2">
                            <button
                              onClick={() => hasProject && handleSessionReauth(s.sessionId, s.instance!, s.project!)}
                              disabled={!hasProject || busy}
                              title={hasProject ? 'Log in to SkySpark again' : 'Session has no project'}
                              className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                              Reauthenticate
                            </button>
                            <button
                              onClick={() => handleSessionDisconnect(s.sessionId)}
                              disabled={busy}
                              className="flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Unplug className="h-3 w-3" />
                              Disconnect
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
        )}

        {authClients.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">SkySpark logins</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                    <th className="py-2 pr-4 font-medium">Server</th>
                    <th className="py-2 pr-4 font-medium">Username</th>
                    <th className="py-2 pr-4 font-medium">State</th>
                    <th className="py-2 pr-4 font-medium">Last OK</th>
                    <th className="py-2 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {authClients.map((c) => (
                    <tr key={`${c.baseUrl}|${c.username}`} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs text-gray-700">{c.baseUrl}</td>
                      <td className="py-2 pr-4 text-gray-700">{c.username}</td>
                      <td className="py-2 pr-4"><AuthStateChip state={c.state} /></td>
                      <td className="py-2 pr-4 text-gray-500" title={c.okAt}>{timeAgo(c.okAt)}</td>
                      <td className="py-2 text-xs text-red-600 truncate max-w-xs" title={c.error}>{c.error || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Connection List */}
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-sm font-medium text-gray-500 uppercase tracking-wide">Connections</h2>
          <div className="space-y-2">
            {connectionFiles.map((config) => (
              <button
                key={config.name}
                onClick={() => {
                  setSelectedConnection(config.name);
                  setEditingConnection(null);
                  setIsCreating(false);
                }}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors ${
                  selectedConnection === config.name
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-gray-700 hover:bg-gray-50 border border-transparent'
                }`}
              >
                <Server className="h-5 w-5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{config.name.replace('-skyspark.json', '').replace('.json', '')}</p>
                  <p className="text-xs text-gray-500 truncate">{config.name}</p>
                </div>
              </button>
            ))}
            {connectionFiles.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No connections configured</p>
            )}
          </div>
        </div>

        {/* Connection Details / Editor */}
        <div className="lg:col-span-2 space-y-6">
          {/* New Connection Form */}
          {isCreating && editingConnection && (
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">New Connection</h2>
                <div className="flex gap-2">
                  <button onClick={handleCancelEdit} className="p-2 text-gray-400 hover:text-gray-600">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <ConnectionForm
                connection={editingConnection}
                onChange={setEditingConnection}
                onSave={handleSaveConnection}
                onCancel={handleCancelEdit}
                isSaving={saveMutation.isPending}
              />
            </div>
          )}

          {/* Selected Connection View */}
          {selectedConnection && connection && !isCreating && (
            <>
              {/* Connection Info Card */}
              <div className="rounded-xl bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-blue-100 p-2">
                      <Server className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">{connection.name}</h2>
                      <p className="text-sm text-gray-500">
                        {connection.protocol}://{connection.host}:{connection.port}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleConnect}
                      disabled={isDiscovering}
                      className="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {isDiscovering ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plug className="h-4 w-4" />
                      )}
                      {isDiscovering ? 'Connecting...' : 'Connect'}
                    </button>
                    <button
                      onClick={handleEditConnection}
                      className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <Edit2 className="h-4 w-4" />
                      Edit
                    </button>
                    <button
                      onClick={handleDeleteConnection}
                      className="flex items-center gap-2 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                </div>

                {(showConnectLog || connectLog.length > 0) && (
                  <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50">
                    <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
                      <span className="text-sm font-medium text-gray-700">
                        Connection Log {isDiscovering && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConnectLog([])}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >Clear</button>
                        <button
                          onClick={() => { setShowConnectLog(false); setConnectLog([]); }}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >Hide</button>
                      </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-3 font-mono text-xs leading-relaxed">
                      {connectLog.length === 0 ? (
                        <span className="text-gray-400">Waiting for connection events…</span>
                      ) : (
                        connectLog.map((line, i) => {
                          const color =
                            line.level === 'error' ? 'text-red-600' :
                            line.level === 'success' ? 'text-green-700' :
                            'text-gray-700';
                          const time = line.ts ? new Date(line.ts).toLocaleTimeString() : '';
                          return (
                            <div key={i} className={color}>
                              <span className="text-gray-400">{time}</span>
                              {line.step && <span className="ml-2 text-gray-500">[{line.step}]</span>}
                              <span className="ml-2">{line.message}</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {editingConnection ? (
                  <ConnectionForm
                    connection={editingConnection}
                    onChange={setEditingConnection}
                    onSave={handleSaveConnection}
                    onCancel={handleCancelEdit}
                    isSaving={saveMutation.isPending}
                  />
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Username</p>
                      <p className="font-medium">{connection.username}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Default Project</p>
                      <p className="font-medium">{connection.defaultProjName || '-'}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Projects List */}
              <div className="rounded-xl bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Projects ({connection.projects.length})</h2>
                  <button
                    onClick={() => handleAddProject(connection.name)}
                    className="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
                  >
                    <Plus className="h-4 w-4" />
                    Add Project
                  </button>
                </div>

                {/* Add Project Form */}
                {isAddingProject === connection.name && (
                  <div className="mb-4 p-4 rounded-lg bg-green-50 border border-green-200">
                    <h3 className="font-medium mb-3">New Project</h3>
                    <div className="grid gap-3 md:grid-cols-2">
                      <input
                        type="text"
                        placeholder="Project name"
                        value={newProject.name}
                        onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        placeholder="Description (optional)"
                        value={newProject.description || ''}
                        onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        placeholder="Username (optional, uses connection default)"
                        value={newProject.username || ''}
                        onChange={(e) => setNewProject({ ...newProject, username: e.target.value })}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                      <input
                        type="password"
                        placeholder="Password (optional)"
                        value={newProject.password || ''}
                        onChange={(e) => setNewProject({ ...newProject, password: e.target.value })}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={handleSaveNewProject}
                        disabled={!newProject.name || saveMutation.isPending}
                        className="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        <Save className="h-4 w-4" />
                        Save
                      </button>
                      <button
                        onClick={() => setIsAddingProject(null)}
                        className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {connection.projects.map((project, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100"
                    >
                      {editingProject?.index === index ? (
                        <div className="flex-1 grid gap-2 md:grid-cols-4">
                          <input
                            type="text"
                            value={editingProject.project.name}
                            onChange={(e) => setEditingProject({
                              ...editingProject,
                              project: { ...editingProject.project, name: e.target.value }
                            })}
                            className="rounded border border-gray-300 px-2 py-1 text-sm"
                          />
                          <input
                            type="text"
                            value={editingProject.project.description || ''}
                            onChange={(e) => setEditingProject({
                              ...editingProject,
                              project: { ...editingProject.project, description: e.target.value }
                            })}
                            placeholder="Description"
                            className="rounded border border-gray-300 px-2 py-1 text-sm"
                          />
                          <div className="flex gap-1">
                            <button
                              onClick={handleSaveProject}
                              className="p-1 text-green-600 hover:text-green-700"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setEditingProject(null)}
                              className="p-1 text-gray-400 hover:text-gray-600"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-3">
                            <FolderOpen className="h-4 w-4 text-gray-400" />
                            <div>
                              <p className="font-medium text-gray-900">{project.name}</p>
                              {project.description && (
                                <p className="text-xs text-gray-500">{project.description}</p>
                              )}
                            </div>
                            {connection.defaultProjName === project.name && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">default</span>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleSyncProject(project.name)}
                              disabled={syncingProjects.has(project.name)}
                              className="p-2 text-gray-400 hover:text-green-600 disabled:opacity-50"
                              title="Sync functions"
                            >
                              {syncingProjects.has(project.name) ? (
                                <Loader2 className="h-4 w-4 animate-spin text-green-600" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              onClick={() => handleReauthProject(project.name)}
                              disabled={reauthingProjects.has(project.name)}
                              className="p-2 text-gray-400 hover:text-amber-600 disabled:opacity-50"
                              title="Reauthenticate (fresh SkySpark login)"
                            >
                              {reauthingProjects.has(project.name) ? (
                                <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                              ) : (
                                <KeyRound className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              onClick={() => handleEditProject(connection.name, index)}
                              className="p-2 text-gray-400 hover:text-gray-600"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteProject(index)}
                              className="p-2 text-gray-400 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                  {connection.projects.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">No projects configured</p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Empty State */}
          {!selectedConnection && !isCreating && (
            <div className="rounded-xl bg-white p-12 shadow-sm text-center">
              <Server className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h2 className="text-lg font-medium text-gray-900 mb-2">No connection selected</h2>
              <p className="text-gray-500 mb-4">Select a connection from the list or create a new one</p>
              <button
                onClick={handleCreateConnection}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Add Connection
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Connection Form Component
function ConnectionForm({
  connection,
  onChange,
  onSave,
  onCancel,
  isSaving
}: {
  connection: Connection;
  onChange: (c: Connection) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Connection Name</label>
          <input
            type="text"
            value={connection.name}
            onChange={(e) => onChange({ ...connection, name: e.target.value })}
            placeholder="e.g., production, staging"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Protocol</label>
          <select
            value={connection.protocol}
            onChange={(e) => onChange({ ...connection, protocol: e.target.value as 'http' | 'https' })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="http">HTTP</option>
            <option value="https">HTTPS</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Host</label>
          <input
            type="text"
            value={connection.host}
            onChange={(e) => onChange({ ...connection, host: e.target.value })}
            placeholder="localhost or hostname"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
          <input
            type="number"
            value={connection.port}
            onChange={(e) => onChange({ ...connection, port: parseInt(e.target.value) || 8080 })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
          <input
            type="text"
            value={connection.username}
            onChange={(e) => onChange({ ...connection, username: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password"
            value={connection.password}
            onChange={(e) => onChange({ ...connection, password: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Default Project</label>
          <input
            type="text"
            value={connection.defaultProjName || ''}
            onChange={(e) => onChange({ ...connection, defaultProjName: e.target.value })}
            placeholder="Project to use by default"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="flex gap-2 pt-4 border-t">
        <button
          onClick={onSave}
          disabled={!connection.name || !connection.host || isSaving}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {isSaving ? 'Saving...' : 'Save Connection'}
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
