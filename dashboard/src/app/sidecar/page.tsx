'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiBase } from '@/lib/api';
import { FolderSync, RefreshCw, Plus, Pencil, Trash2, Hammer, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

// ============================================
// Types (server: src/admin/sidecarSync.ts)
// ============================================

interface QueueInfo {
  projectId: number;
  running: boolean;
  pending: number;
  runningFull: boolean;
  fullPending: boolean;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
}

interface SidecarLink {
  index: number;
  sidecar?: string;
  root: string;
  project: string | number;
  path?: string;
  resolvedPath: string;
  projectId: number | null;
  projectName: string | null;
  lastIndexed: string | null;
  nodeCount: number;
  queue: QueueInfo | null;
  lastResult: { mode?: string; nodesAdded?: number; nodesRemoved?: number; durationMs?: number; errors?: string[]; error?: string } | null;
}

interface LinksReply {
  configFile: string;
  mirrorDir: string;
  links: SidecarLink[];
  settings: { changesToken: 'set' | 'not set'; receiverUrl: string | null; receiverToken: 'set' | 'not set' };
}

interface ReceiverRoot {
  name: string;
  files?: number;
  bytes?: number;
  last_path?: string | null;
  last_change_ms?: number | null;
  hook?: { ok: boolean; last_ms?: number | null; error?: string | null } | null;
}

interface StatusReply {
  configured: boolean;
  ok: boolean;
  message?: string;
  error?: string;
  fetchedAtMs?: number;
  stale?: boolean;
  data?: {
    version?: string;
    uptime_s?: number;
    sidecars: Array<{ id: string; connected: boolean; last_seen_ms?: number | null; roots: ReceiverRoot[] }>;
    recent: Array<{ ts_ms: number; sidecar: string; root: string; path: string; op: string; size?: number }>;
    errors: Array<{ ts_ms: number; sidecar: string; root?: string; message: string }>;
  };
}

interface LinkForm {
  sidecar: string;
  root: string;
  project: string;
  path: string;
}

// ============================================
// API
// ============================================

async function request<T>(endpoint: string, method = 'GET', body?: unknown): Promise<T> {
  const username = localStorage.getItem('admin_user') || 'admin';
  const password = localStorage.getItem('admin_pass') || 'admin';
  const res = await fetch(`${getApiBase()}/admin/sidecar${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa(`${username}:${password}`) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `API error: ${res.status}`);
  return data as T;
}

function toBody(f: LinkForm) {
  const project = /^\d+$/.test(f.project.trim()) ? Number(f.project.trim()) : f.project.trim();
  return { sidecar: f.sidecar.trim() || undefined, root: f.root.trim(), project, path: f.path.trim() || undefined };
}

// ============================================
// Helpers
// ============================================

function formatTime(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return 'Never';
  return new Date(value).toLocaleString();
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SetBadge({ label, value }: { label: string; value: 'set' | 'not set' }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-gray-700">
      {label}
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${value === 'set' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
        {value}
      </span>
    </span>
  );
}

function QueueCell({ link }: { link: SidecarLink }) {
  const q = link.queue;
  if (!q) return <span className="text-gray-400">No project yet</span>;
  if (q.running) {
    return (
      <span className="inline-flex items-center gap-1 text-blue-700">
        <Loader2 className="h-4 w-4 animate-spin" />
        {q.runningFull ? 'Full rebuild' : 'Updating'}
        {q.pending > 0 && ` (+${q.pending} waiting)`}
        {q.fullPending && ' (rebuild waiting)'}
      </span>
    );
  }
  return <span className="text-gray-500">Idle</span>;
}

function ResultCell({ link }: { link: SidecarLink }) {
  const r = link.lastResult;
  if (!r) return <span className="text-gray-400">–</span>;
  if (r.error) return <span className="text-red-600">{r.error}</span>;
  const errs = r.errors?.length ?? 0;
  return (
    <span className={errs ? 'text-amber-700' : 'text-gray-700'}>
      {r.mode}: +{r.nodesAdded ?? 0} / -{r.nodesRemoved ?? 0} nodes, {r.durationMs ?? 0} ms
      {errs > 0 && `, ${errs} errors`}
    </span>
  );
}

const EMPTY: LinkForm = { sidecar: '', root: '', project: '', path: '' };

// ============================================
// Page
// ============================================

export default function SidecarSyncPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<LinkForm>(EMPTY);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const links = useQuery({
    queryKey: ['sidecar-links'],
    queryFn: () => request<LinksReply>('/links'),
    // Poll faster while a job runs
    refetchInterval: (q) => (q.state.data?.links.some(l => l.queue?.running) ? 2000 : 10000),
  });

  const status = useQuery({
    queryKey: ['sidecar-status'],
    queryFn: () => request<StatusReply>('/status'),
    refetchInterval: 15000,
  });

  const done = (text: string) => {
    setMessage({ ok: true, text });
    queryClient.invalidateQueries({ queryKey: ['sidecar-links'] });
  };
  const failed = (err: Error) => setMessage({ ok: false, text: err.message });

  const save = useMutation({
    mutationFn: () => editIndex === null
      ? request('/links', 'POST', toBody(form))
      : request(`/links/${editIndex}`, 'PUT', toBody(form)),
    onSuccess: () => {
      done(editIndex === null ? 'Link added' : 'Link saved');
      setShowForm(false);
      setEditIndex(null);
      setForm(EMPTY);
    },
    onError: failed,
  });

  const remove = useMutation({
    mutationFn: (index: number) => request(`/links/${index}`, 'DELETE'),
    onSuccess: () => done('Link removed'),
    onError: failed,
  });

  const rebuild = useMutation({
    mutationFn: (projectId: number) => request(`/projects/${projectId}/rebuild`, 'POST', {}),
    onSuccess: () => done('Full rebuild started'),
    onError: failed,
  });

  const startEdit = (l: SidecarLink) => {
    setEditIndex(l.index);
    setForm({ sidecar: l.sidecar || '', root: l.root, project: String(l.project), path: l.path || '' });
    setShowForm(true);
  };

  const startAdd = () => {
    setEditIndex(null);
    setForm(EMPTY);
    setShowForm(true);
  };

  const s = status.data;
  const settings = links.data?.settings;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sidecar sync</h1>
          <p className="text-gray-500">Root-to-project links, change queue and sidecar status</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { links.refetch(); status.refetch(); }}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            onClick={startAdd}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add link
          </button>
        </div>
      </div>

      {message && (
        <div className={`flex items-center gap-2 rounded-lg p-4 text-sm ${message.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.ok ? <CheckCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          {message.text}
        </div>
      )}

      {/* Settings */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Settings</h2>
        {settings ? (
          <div className="flex flex-wrap gap-6">
            <SetBadge label="AXON_CHANGES_TOKEN" value={settings.changesToken} />
            <span className="text-sm text-gray-700">
              SIDECAR_RECEIVER_URL <span className="font-mono text-gray-500">{settings.receiverUrl || 'not set'}</span>
            </span>
            <SetBadge label="SIDECAR_RECEIVER_TOKEN" value={settings.receiverToken} />
            <span className="text-sm text-gray-700">
              Root map <span className="font-mono text-gray-500">{links.data?.configFile}</span>
            </span>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Loading...</p>
        )}
      </div>

      {/* Add / edit form */}
      {showForm && (
        <form
          onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
          className="rounded-xl bg-white p-6 shadow-sm space-y-4"
        >
          <h2 className="text-lg font-semibold text-gray-900">{editIndex === null ? 'Add link' : 'Edit link'}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {([
              ['sidecar', 'Sidecar id', 'Empty = any sidecar'],
              ['root', 'Root name', 'For example BAS'],
              ['project', 'Axon project (name or id)', 'A missing name is created'],
              ['path', 'Path', `Empty = ${links.data?.mirrorDir || '/mirror'}/{sidecar}/{root}`],
            ] as const).map(([key, label, hint]) => (
              <label key={key} className="block">
                <span className="text-sm font-medium text-gray-700">{label}</span>
                <input
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  placeholder={hint}
                  required={key === 'root' || key === 'project'}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                />
              </label>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={save.isPending}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditIndex(null); }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Links */}
      <div className="rounded-xl bg-white shadow-sm overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sidecar / root</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Queue</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last update</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last result</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {links.isLoading && (
              <tr><td colSpan={6} className="px-6 py-4 text-sm text-gray-500">Loading...</td></tr>
            )}
            {links.error && (
              <tr><td colSpan={6} className="px-6 py-4 text-sm text-red-600">{(links.error as Error).message}</td></tr>
            )}
            {links.data?.links.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-4 text-sm text-gray-500">No links yet</td></tr>
            )}
            {links.data?.links.map((l) => (
              <tr key={l.index}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <FolderSync className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="font-mono text-sm text-gray-900">{l.sidecar || '*'}/{l.root}</p>
                      <p className="font-mono text-xs text-gray-500">{l.resolvedPath}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-700">
                  {l.projectName ?? String(l.project)}
                  <p className="text-xs text-gray-500">{l.projectId ? `id ${l.projectId}, ${l.nodeCount} nodes` : 'Created on first change'}</p>
                </td>
                <td className="px-6 py-4 text-sm"><QueueCell link={l} /></td>
                <td className="px-6 py-4 text-sm text-gray-500">{formatTime(l.queue?.lastFinishedAt ?? l.lastIndexed)}</td>
                <td className="px-6 py-4 text-sm"><ResultCell link={l} /></td>
                <td className="px-6 py-4">
                  <div className="flex gap-3">
                    <button onClick={() => startEdit(l)} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
                      <Pencil className="h-4 w-4" /> Edit
                    </button>
                    <button
                      onClick={() => l.projectId && rebuild.mutate(l.projectId)}
                      disabled={!l.projectId || rebuild.isPending || !!l.queue?.runningFull}
                      className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 disabled:opacity-40"
                    >
                      <Hammer className="h-4 w-4" /> Rebuild
                    </button>
                    <button
                      onClick={() => { if (confirm(`Remove link ${l.sidecar || '*'}/${l.root}?`)) remove.mutate(l.index); }}
                      disabled={remove.isPending}
                      className="flex items-center gap-1 text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" /> Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Receiver status */}
      <div className="rounded-xl bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Sidecar status</h2>
          {s?.fetchedAtMs && <span className="text-xs text-gray-500">Fetched {formatTime(s.fetchedAtMs)}{s.stale ? ' (last good result)' : ''}</span>}
        </div>
        {status.isLoading && <p className="text-sm text-gray-500">Loading...</p>}
        {status.error && <p className="text-sm text-red-600">{(status.error as Error).message}</p>}
        {s && !s.configured && <p className="text-sm text-gray-500">{s.message}</p>}
        {s?.error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            <AlertCircle className="h-4 w-4" /> {s.error}
          </div>
        )}
        {s?.data && (
          <>
            <p className="text-sm text-gray-500">Receiver {s.data.version ?? '?'}, up {Math.round((s.data.uptime_s ?? 0) / 60)} min</p>
            {s.data.sidecars.length === 0 && <p className="text-sm text-gray-500">No sidecar sends to Axon</p>}
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sidecar</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Root</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Files</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Last change</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Hook</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {s.data.sidecars.flatMap((sc) => sc.roots.map((r) => (
                  <tr key={`${sc.id}/${r.name}`}>
                    <td className="px-4 py-2 text-sm">
                      <span className={`mr-2 inline-block h-2 w-2 rounded-full ${sc.connected ? 'bg-green-500' : 'bg-gray-400'}`} />
                      <span className="font-mono text-gray-900">{sc.id}</span>
                      <span className="ml-2 text-xs text-gray-500">{sc.connected ? 'connected' : `last seen ${formatTime(sc.last_seen_ms)}`}</span>
                    </td>
                    <td className="px-4 py-2 font-mono text-sm text-gray-700">{r.name}</td>
                    <td className="px-4 py-2 text-sm text-gray-500">{r.files ?? 0} ({formatBytes(r.bytes)})</td>
                    <td className="px-4 py-2 text-sm text-gray-500">
                      {formatTime(r.last_change_ms)}
                      {r.last_path && <p className="font-mono text-xs">{r.last_path}</p>}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {!r.hook ? <span className="text-gray-400">–</span>
                        : r.hook.ok ? <span className="text-green-700">OK {formatTime(r.hook.last_ms)}</span>
                        : <span className="text-red-600">{r.hook.error || 'Failed'}</span>}
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>

            {s.data.recent.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-gray-700">Recent files</h3>
                <ul className="max-h-64 overflow-y-auto divide-y divide-gray-100 text-sm">
                  {s.data.recent.slice(0, 50).map((e, i) => (
                    <li key={i} className="flex gap-4 py-1">
                      <span className="w-44 text-gray-500">{formatTime(e.ts_ms)}</span>
                      <span className="w-16 text-gray-700">{e.op}</span>
                      <span className="font-mono text-gray-900">{e.sidecar}/{e.root}/{e.path}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {s.data.errors.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-gray-700">Errors</h3>
                <ul className="divide-y divide-gray-100 text-sm">
                  {s.data.errors.map((e, i) => (
                    <li key={i} className="flex gap-4 py-1 text-red-700">
                      <span className="w-44 text-gray-500">{formatTime(e.ts_ms)}</span>
                      <span className="font-mono">{e.sidecar}{e.root ? `/${e.root}` : ''}</span>
                      <span>{e.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
