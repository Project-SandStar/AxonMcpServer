'use client';

import { useState, useEffect } from 'react';
import { Key, RefreshCw, Trash2, AlertCircle, CheckCircle, Plug, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';

type KeyInfo = {
  name: string;
  present: boolean;
  source: 'db' | 'env' | null;
  last4: string | null;
  updatedAt: string | null;
};

const FRIENDLY_NAMES: Record<string, string> = {
  anthropic: 'Anthropic API key',
};

export interface ApiKeysPanelProps {
  showHeader?: boolean;
}

export default function ApiKeysPanel({ showHeader = true }: ApiKeysPanelProps) {
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [busyName, setBusyName] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const flash = (msg: string, isErr = false) => {
    if (isErr) { setError(msg); setSuccess(null); }
    else { setSuccess(msg); setError(null); }
    setTimeout(() => { setError(null); setSuccess(null); }, 4000);
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await api.listKeys();
      setKeys(list);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load keys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const save = async (name: string) => {
    if (!editValue.trim()) return;
    setBusyName(name);
    try {
      await api.setKey(name, editValue.trim());
      setEditingName(null);
      setEditValue('');
      await refresh();
      flash(`Saved ${name}`);
    } catch (e: any) {
      flash(e?.message ?? 'Save failed', true);
    } finally {
      setBusyName(null);
    }
  };

  const remove = async (name: string) => {
    if (!confirm(`Remove the ${name} key from the database? (Env fallback will still apply if set.)`)) return;
    setBusyName(name);
    try {
      await api.deleteKey(name);
      await refresh();
      flash(`Removed ${name}`);
    } catch (e: any) {
      flash(e?.message ?? 'Remove failed', true);
    } finally {
      setBusyName(null);
    }
  };

  const test = async (name: string) => {
    setBusyName(name);
    setTestResult(prev => ({ ...prev, [name]: { ok: false, msg: '…' } }));
    try {
      const r = await api.testKey(name);
      const msg = r.ok ? `OK · ${r.latencyMs}ms · ${r.model}` : `Failed · ${r.error ?? 'unknown error'}`;
      setTestResult(prev => ({ ...prev, [name]: { ok: !!r.ok, msg } }));
    } catch (e: any) {
      setTestResult(prev => ({ ...prev, [name]: { ok: false, msg: `Error · ${e?.message ?? e}` } }));
    } finally {
      setBusyName(null);
    }
  };

  return (
    <div className="space-y-4">
      {showHeader && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Key className="h-6 w-6 text-amber-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
              <p className="text-gray-500">Stored in DB override environment variables · encrypted at rest with AES-256-GCM</p>
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-800">
          <AlertCircle className="h-5 w-5" /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-green-800">
          <CheckCircle className="h-5 w-5" /> {success}
        </div>
      )}

      <div className="space-y-3">
        {keys.map(k => {
          const tr = testResult[k.name];
          return (
            <div key={k.name} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-gray-900">{FRIENDLY_NAMES[k.name] ?? k.name}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-600">
                    {k.present ? (
                      <>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium uppercase ${
                          k.source === 'db' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {k.source}
                        </span>
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono">••••{k.last4}</code>
                        {k.updatedAt && <span className="text-gray-500">· updated {new Date(k.updatedAt).toLocaleString()}</span>}
                      </>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 font-medium uppercase text-gray-700">not set</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => { setEditingName(k.name); setEditValue(''); }}
                    disabled={busyName === k.name}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {k.source === 'db' ? 'Update' : 'Set'}
                  </button>
                  <button
                    onClick={() => test(k.name)}
                    disabled={busyName === k.name || !k.present}
                    className="inline-flex items-center gap-1 rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:bg-gray-300"
                  >
                    <Plug className="h-3.5 w-3.5" /> Test
                  </button>
                  {k.source === 'db' && (
                    <button
                      onClick={() => remove(k.name)}
                      disabled={busyName === k.name}
                      className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  )}
                </div>
              </div>

              {editingName === k.name && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    type="password"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    placeholder={`Paste ${k.name} key`}
                    className="flex-1 min-w-[200px] rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                  <button
                    onClick={() => save(k.name)}
                    disabled={!editValue.trim() || busyName === k.name}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >Save</button>
                  <button
                    onClick={() => { setEditingName(null); setEditValue(''); }}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >Cancel</button>
                </div>
              )}

              {tr && (
                <div className={`mt-2 inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs ${
                  tr.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                }`}>
                  <ShieldCheck className="h-3.5 w-3.5" /> {tr.msg}
                </div>
              )}
            </div>
          );
        })}
        {keys.length === 0 && !loading && (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">No keys configured.</div>
        )}
      </div>
    </div>
  );
}
