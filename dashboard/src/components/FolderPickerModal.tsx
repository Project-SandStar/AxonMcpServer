'use client';

// Server folder picker. Server: src/admin/fsBrowser.ts (GET /admin/fs/dirs?path=).
// Lists folders on the server disk, inside the allowed roots only.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, DirListing, DirHint } from '@/lib/api';
import { Folder, FolderOpen, ArrowUp, X, Loader2, AlertCircle, RefreshCw, Check } from 'lucide-react';

const HINT_LABEL: Record<DirHint, { text: string; cls: string }> = {
  skysparkDocRoot: { text: 'SkySpark docs', cls: 'bg-purple-100 text-purple-700' },
  docLibrary: { text: 'Doc library', cls: 'bg-indigo-100 text-indigo-700' },
  axonProject: { text: 'Axon project', cls: 'bg-green-100 text-green-700' },
  skysparkInstance: { text: 'Instance', cls: 'bg-amber-100 text-amber-700' },
};

export function HintBadge({ hint }: { hint?: DirHint }) {
  if (!hint) return null;
  const h = HINT_LABEL[hint];
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${h.cls}`}>{h.text}</span>;
}

interface Props {
  open: boolean;
  initialPath?: string;
  title?: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

export default function FolderPickerModal({ open, initialPath, title = 'Choose a server folder', onSelect, onClose }: Props) {
  const [data, setData] = useState<DirListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const load = useCallback(async (p?: string, fallback = false) => {
    setLoading(true);
    setError(null);
    setFilter('');
    try {
      setData(await api.listDirs(p));
    } catch (e: any) {
      if (fallback && p) {
        // The typed path is outside the roots or missing: open the first root instead
        try {
          setData(await api.listDirs());
        } catch (e2: any) {
          setError(e2.message || 'Failed to list folder');
        }
      } else {
        setError(e.message || 'Failed to list folder');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load(initialPath?.trim() || undefined, true);
  }, [open, initialPath, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const crumbs = useMemo(() => {
    if (!data) return [];
    const root = data.roots.filter(r => data.path === r || data.path.startsWith(r.endsWith('/') ? r : r + '/'))
      .sort((a, b) => b.length - a.length)[0];
    if (!root) return [{ name: data.path, path: data.path }];
    const rest = data.path.slice(root.length).split('/').filter(Boolean);
    const out = [{ name: root, path: root }];
    let acc = root;
    for (const part of rest) {
      acc = acc.endsWith('/') ? acc + part : acc + '/' + part;
      out.push({ name: part, path: acc });
    }
    return out;
  }, [data]);

  const entries = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (data?.entries ?? []).filter(e => !f || e.name.toLowerCase().includes(f));
  }, [data, filter]);

  if (!open || typeof document === 'undefined') return null;

  // Portal: keeps the modal out of any parent <label> or <form> (Enter in the filter must not submit it)
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl"
        onMouseDown={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 border-b px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-500">Root</span>
            <select
              value={crumbs[0]?.path ?? ''}
              onChange={e => load(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1 font-mono text-xs text-gray-900 focus:border-blue-500 focus:outline-none"
            >
              {(data?.roots ?? []).map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <button
              type="button"
              onClick={() => data?.parent && load(data.parent)}
              disabled={!data?.parent || loading}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              <ArrowUp className="h-3.5 w-3.5" /> Up
            </button>
            <button
              type="button"
              onClick={() => load(data?.path)}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1 font-mono text-xs">
            {crumbs.map((c, i) => (
              <span key={c.path} className="flex items-center gap-1">
                {i > 0 && <span className="text-gray-400">/</span>}
                <button type="button" onClick={() => load(c.path)} className="rounded px-1 text-blue-600 hover:bg-blue-50">
                  {c.name}
                </button>
              </span>
            ))}
          </div>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter folders"
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="min-h-[200px] flex-1 overflow-y-auto px-2 py-2">
          {loading && (
            <div className="flex items-center justify-center py-10 text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          )}
          {!loading && error && (
            <div className="m-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </div>
          )}
          {!loading && !error && entries.length === 0 && (
            <p className="py-10 text-center text-sm text-gray-500">{filter ? 'No folder matches the filter' : 'No sub-folders'}</p>
          )}
          {!loading && !error && entries.map(e => (
            <button
              key={e.path}
              type="button"
              onClick={() => load(e.path)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm text-gray-800 hover:bg-gray-100"
            >
              <Folder className="h-4 w-4 shrink-0 text-blue-500" />
              <span className="truncate font-mono text-xs">{e.name}</span>
              <HintBadge hint={e.hint} />
            </button>
          ))}
          {!loading && data?.truncated && (
            <p className="px-3 py-2 text-xs text-amber-700">List cut at {data.entries.length} folders. Use the filter or open a sub-folder.</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
          <div className="flex min-w-0 items-center gap-2 text-xs text-gray-600">
            <FolderOpen className="h-4 w-4 shrink-0 text-gray-400" />
            <span className="truncate font-mono">{data?.path ?? ''}</span>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="button"
              disabled={!data || loading}
              onClick={() => { if (data) { onSelect(data.path); onClose(); } }}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Check className="h-4 w-4" /> Select this folder
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
