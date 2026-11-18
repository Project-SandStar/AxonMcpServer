'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Copy, KeyRound, Plus, RefreshCw } from 'lucide-react';
import { api, type AccessKey, type AccessKeyWithSecret } from '@/lib/api';

const EXPIRY_CHOICES: Array<{ label: string; days: number | null }> = [
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '365 days', days: 365 },
  { label: 'Never', days: null },
];

export const formatWhen = (iso: string | null, never = 'Never') => (iso ? new Date(iso).toLocaleString() : never);

export function KeyStatusBadge({ status }: { status: AccessKey['status'] }) {
  const style = status === 'active'
    ? 'bg-green-100 text-green-700'
    : status === 'expired' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-700';
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>{status}</span>;
}

/**
 * Shows a new key one time, with a Copy button. The key text is in React
 * state only: it is not put in localStorage, the URL or a log.
 */
export function NewKeyBox({ made, onDone }: { made: AccessKeyWithSecret; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(made.key);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  };

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
      <div className="flex items-center gap-2 text-amber-900">
        <KeyRound className="h-5 w-5" />
        <p className="text-sm font-semibold">
          New access key for &quot;{made.username}&quot; ({made.name})
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={made.key}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="New access key"
          className="flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 font-mono text-sm"
        />
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {copyFailed && (
        <p className="text-xs text-red-700">The browser did not allow the copy. Select the key and copy it by hand.</p>
      )}
      <p className="text-sm text-amber-900">
        <strong>You cannot see this key again.</strong> Copy it now and give it to the developer. The developer pastes
        it in the IntelliJ plugin as the token, or sends it to /mcp as a Bearer token. If the key is lost, revoke it
        and make a new one.
      </p>
      <button
        type="button"
        onClick={onDone}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
      >
        I copied the key
      </button>
    </div>
  );
}

interface Props {
  username: string;
  /** Only an admin makes a key. */
  canCreate: boolean;
  /** False for a disabled user: no new key. */
  userEnabled?: boolean;
}

/** The access keys of one user: list, create (admin), show once, revoke. */
export function UserAccessKeys({ username, canCreate, userEnabled = true }: Props) {
  const [keys, setKeys] = useState<AccessKey[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [days, setDays] = useState<number | null>(365);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<AccessKeyWithSecret | null>(null);

  const load = useCallback(async () => {
    try {
      setKeys(await api.listUserKeys(username));
      setError(null);
    } catch (e) {
      setKeys([]);
      setError(e instanceof Error ? e.message : 'Failed to load the keys');
    }
  }, [username]);

  useEffect(() => {
    setKeys(null);
    setMade(null);
    load();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setMade(await api.createUserKey(username, { name: name.trim(), expiresInDays: days }));
      setName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create the key');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (key: AccessKey) => {
    if (!confirm(`Revoke the key "${key.name}" (${key.prefix})? Clients that use it lose access at once.`)) return;
    try {
      await api.revokeUserKey(username, key.id);
      if (made?.id === key.id) setMade(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke the key');
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {made && <NewKeyBox made={made} onDone={() => setMade(null)} />}

      {canCreate && (
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Key name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="For example: laptop IntelliJ"
              required
              maxLength={64}
              disabled={!userEnabled}
              className="w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Expires</label>
            <select
              value={days === null ? 'never' : String(days)}
              onChange={(e) => setDays(e.target.value === 'never' ? null : Number(e.target.value))}
              disabled={!userEnabled}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {EXPIRY_CHOICES.map((c) => (
                <option key={c.label} value={c.days === null ? 'never' : String(c.days)}>{c.label}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={busy || !userEnabled}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {busy ? 'Creating...' : 'Create key'}
          </button>
          {!userEnabled && <p className="text-xs text-gray-500">This user is disabled. Enable the user to make a key.</p>}
        </form>
      )}

      {keys === null ? (
        <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
      ) : keys.length === 0 ? (
        <p className="text-sm text-gray-500">
          No access keys. {canCreate ? 'Create one above.' : 'Ask an admin to make one for you.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Prefix</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Expires</th>
                <th className="px-3 py-2">Last used</th>
                <th className="px-3 py-2">Used from</th>
                <th className="px-3 py-2">State</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {keys.map((key) => (
                <tr key={key.id}>
                  <td className="px-3 py-2 font-medium text-gray-900">{key.name}</td>
                  <td className="px-3 py-2 font-mono text-gray-700">{key.prefix}</td>
                  <td className="px-3 py-2 text-gray-500">
                    {formatWhen(key.createdAt)}
                    {key.createdBy && <span className="text-xs text-gray-400"> by {key.createdBy}</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{formatWhen(key.expiresAt)}</td>
                  <td className="px-3 py-2 text-gray-500">{formatWhen(key.lastUsedAt)}</td>
                  <td className="px-3 py-2 text-gray-500">{key.lastUsedFrom === 'ide' ? 'IDE' : key.lastUsedFrom === 'mcp' ? 'MCP' : '-'}</td>
                  <td className="px-3 py-2"><KeyStatusBadge status={key.status} /></td>
                  <td className="px-3 py-2 text-right">
                    {key.status !== 'revoked' && (
                      <button
                        type="button"
                        onClick={() => revoke(key)}
                        className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
