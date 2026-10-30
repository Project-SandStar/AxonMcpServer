'use client';

// NetBird + HTTPS + Advanced. Settings page, tab "NetBird" (/dashboard/settings/#netbird).
// Server: src/admin/netbird.ts (GET/PUT /admin/netbird, DELETE /admin/netbird/key, /admin/netbird/https-token).

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiBase } from '@/lib/api';
import { Network, RefreshCw, Save, Trash2, AlertCircle, CheckCircle, Lock } from 'lucide-react';

interface NetbirdStatus {
  connected: boolean;
  fqdn: string | null;
  ip: string | null;
  peersConnected: number;
  peersTotal: number;
  updatedAt: string;
  stale: boolean;
}

interface CaddyStatus {
  running: boolean;
  certificate: { names: string[]; notAfter: string | null } | null;
  error: string | null;
  updatedAt: string;
  stale: boolean;
}

interface NetbirdReply {
  configured: boolean;
  enabled: boolean;
  hostname: string;
  managementUrl: string;
  hasKey: boolean;
  keyHint: string | null;
  wireguardPort: number;
  status: NetbirdStatus | null;
  https: {
    enabled: boolean;
    domain: string;
    email: string;
    hasToken: boolean;
    tokenHint: string | null;
    address: string;
    status: CaddyStatus | null;
  };
}

async function request<T>(endpoint: string, method = 'GET', body?: unknown): Promise<T> {
  const username = localStorage.getItem('admin_user') || 'admin';
  const password = localStorage.getItem('admin_pass') || 'admin';
  const res = await fetch(`${getApiBase()}/admin/netbird${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa(`${username}:${password}`) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `API error: ${res.status}`);
  return data as T;
}

function Pill({ text, cls }: { text: string; cls: string }) {
  return <span className={`rounded-full px-3 py-1 text-sm font-medium ${cls}`}>{text}</span>;
}

function StatusBadge({ data }: { data: NetbirdReply }) {
  if (!data.configured) return <Pill text="Container missing" cls="bg-amber-100 text-amber-800" />;
  if (data.status?.connected) return <Pill text="Connected" cls="bg-green-100 text-green-800" />;
  return <Pill text="Not connected" cls="bg-gray-100 text-gray-700" />;
}

function HttpsBadge({ data }: { data: NetbirdReply }) {
  const h = data.https;
  if (!h.enabled) return <Pill text="Off" cls="bg-gray-100 text-gray-700" />;
  if (!h.status) return <Pill text="Caddy container missing" cls="bg-amber-100 text-amber-800" />;
  if (h.status.running && h.status.certificate) return <Pill text="Running" cls="bg-green-100 text-green-800" />;
  if (h.status.running) return <Pill text="Getting certificate" cls="bg-blue-100 text-blue-800" />;
  return <Pill text="Waiting" cls="bg-amber-100 text-amber-800" />;
}

function Switch({ on, set, disabled, label }: { on: boolean; set: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <label className="flex items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={() => set(!on)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-blue-600' : 'bg-gray-300'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </label>
  );
}

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm';
const labelCls = 'mb-1 block text-sm font-medium text-gray-700';

export default function NetbirdPanel() {
  const queryClient = useQueryClient();
  const [setupKey, setSetupKey] = useState('');
  const [hostname, setHostname] = useState('axon');
  const [managementUrl, setManagementUrl] = useState('https://vpn.bas.co:443');
  const [wireguardPort, setWireguardPort] = useState('0');
  const [enabled, setEnabled] = useState(false);
  const [httpsOn, setHttpsOn] = useState(false);
  const [domain, setDomain] = useState('vpn.bas.co');
  const [cfToken, setCfToken] = useState('');
  const [email, setEmail] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const q = useQuery({
    queryKey: ['netbird'],
    queryFn: () => request<NetbirdReply>(''),
    refetchInterval: 10000,
  });

  const fill = (v: NetbirdReply) => {
    setHostname(v.hostname);
    setManagementUrl(v.managementUrl);
    setEnabled(v.enabled);
    setWireguardPort(String(v.wireguardPort ?? 0));
    setHttpsOn(v.https.enabled);
    setDomain(v.https.domain);
    setEmail(v.https.email);
  };

  // Fill the form once from the server
  useEffect(() => {
    if (q.data && !loaded) {
      fill(q.data);
      setLoaded(true);
    }
  }, [q.data, loaded]);

  const onSaved = (data: NetbirdReply, text: string) => {
    queryClient.setQueryData(['netbird'], data);
    fill(data);
    setSetupKey('');
    setCfToken('');
    setMessage({ ok: true, text });
  };
  const onFail = (e: Error) => setMessage({ ok: false, text: e.message });

  const save = useMutation({
    mutationFn: () => request<NetbirdReply>('', 'PUT', {
      ...(setupKey.trim() ? { setupKey: setupKey.trim() } : {}),
      hostname: hostname.trim(),
      managementUrl: managementUrl.trim(),
      wireguardPort: Number(wireguardPort.trim() || '0'),
      enabled,
      https: {
        enabled: httpsOn,
        domain: domain.trim(),
        email: email.trim(),
        ...(cfToken.trim() ? { cloudflareToken: cfToken.trim() } : {}),
      },
    }),
    onSuccess: (d) => onSaved(d, 'Saved. The containers pick up the change in about 10 seconds.'),
    onError: onFail,
  });

  const removeKey = useMutation({
    mutationFn: () => request<NetbirdReply>('/key', 'DELETE'),
    onSuccess: (d) => onSaved(d, 'Key removed. NetBird is off.'),
    onError: onFail,
  });

  const removeToken = useMutation({
    mutationFn: () => request<NetbirdReply>('/https-token', 'DELETE'),
    onSuccess: (d) => onSaved(d, 'Cloudflare token removed.'),
    onError: onFail,
  });

  const d = q.data;
  const st = d?.status;
  const hs = d?.https.status;
  const canEnable = !!setupKey.trim() || !!d?.hasKey;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b pb-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <Network className="h-5 w-5" /> NetBird
        </h3>
        <button
          onClick={() => q.refetch()}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className={`h-4 w-4 ${q.isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {message && (
        <div className={`flex items-center gap-2 rounded-lg p-4 text-sm ${message.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.ok ? <CheckCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          {message.text}
        </div>
      )}

      {q.error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800">{(q.error as Error).message}</div>
      )}

      {/* Status */}
      <div className="space-y-4 rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900">NetBird</span>
          {d && <StatusBadge data={d} />}
        </div>
        {d && !d.configured && (
          <p className="text-sm text-amber-700">
            NetBird container not configured. You can still save the settings; they take effect when the container runs.
          </p>
        )}
        {d?.configured && st?.connected && (
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-gray-500">Name</dt><dd className="font-mono text-gray-900">{st.fqdn || '–'}</dd></div>
            <div><dt className="text-gray-500">NetBird IP</dt><dd className="font-mono text-gray-900">{st.ip || '–'}</dd></div>
            <div><dt className="text-gray-500">Peers</dt><dd className="text-gray-900">{st.peersConnected} of {st.peersTotal} connected</dd></div>
          </dl>
        )}
        {d?.configured && !st?.connected && (
          <p className="text-sm text-gray-600">
            {d.enabled && d.hasKey ? 'Waiting for NetBird to connect.' : 'NetBird is off. Paste a setup key and turn it on.'}
          </p>
        )}
        <div className="flex items-center justify-between border-t pt-4">
          <span className="text-sm font-semibold text-gray-900">HTTPS</span>
          {d && <HttpsBadge data={d} />}
        </div>
        {d?.https.enabled && (
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-gray-500">Address</dt><dd className="font-mono text-gray-900">{d.https.address}</dd></div>
            <div>
              <dt className="text-gray-500">Certificate</dt>
              <dd className="font-mono text-gray-900">
                {hs?.certificate
                  ? <>{hs.certificate.names.join(', ') || '–'}{hs.certificate.notAfter && <> · expires {new Date(hs.certificate.notAfter).toLocaleDateString()}</>}</>
                  : 'none yet'}
              </dd>
            </div>
          </dl>
        )}
        {d?.https.enabled && hs?.error && (
          <p className="break-all rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Last error: {hs.error}</p>
        )}
      </div>

      {/* Settings */}
      <div className="space-y-5">
        <p className="text-sm text-gray-500">
          Make a setup key in the NetBird admin (Setup Keys), paste it here, then Save. The service will appear
          as <span className="font-mono">{hostname || 'axon'}.vpn.bas.co</span>.
        </p>

        <div>
          <label className={labelCls}>Setup key</label>
          <input
            type="password"
            autoComplete="off"
            value={setupKey}
            onChange={(e) => setSetupKey(e.target.value)}
            placeholder={d?.hasKey ? 'Paste a new key to replace the saved one' : 'Paste the setup key'}
            className={inputCls}
          />
          {d?.hasKey && <p className="mt-1 text-xs text-gray-500">Key saved, ends in {d.keyHint}</p>}
        </div>

        <div>
          <label className={labelCls}>Hostname</label>
          <input type="text" value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="axon" className={inputCls} />
          <p className="mt-1 text-xs text-gray-500">Letters a-z, digits and &quot;-&quot;. Up to 63 characters.</p>
        </div>

        <div>
          <label className={labelCls}>Management URL</label>
          <input type="text" value={managementUrl} onChange={(e) => setManagementUrl(e.target.value)} className={inputCls} />
        </div>

        <Switch on={enabled} set={setEnabled} disabled={!enabled && !canEnable} label="Enable NetBird" />

        {/* HTTPS */}
        <div className="space-y-5 border-t pt-5">
          <h4 className="flex items-center gap-2 font-semibold text-gray-900"><Lock className="h-4 w-4" /> HTTPS</h4>
          <p className="text-sm text-gray-500">
            Serves this server as <span className="font-mono">https://{hostname || 'axon'}.{domain || 'vpn.bas.co'}</span> on
            the NetBird IP. The certificate comes from Let&apos;s Encrypt; Caddy proves the name with a Cloudflare DNS record.
          </p>
          <Switch on={httpsOn} set={setHttpsOn} label="Enable HTTPS" />
          <div>
            <label className={labelCls}>Domain</label>
            <input type="text" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="vpn.bas.co" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Cloudflare API token</label>
            <input
              type="password"
              autoComplete="off"
              value={cfToken}
              onChange={(e) => setCfToken(e.target.value)}
              placeholder={d?.https.hasToken ? 'Leave empty to keep the saved token' : 'Paste the token'}
              className={inputCls}
            />
            <p className="mt-1 text-xs text-gray-500">
              {d?.https.hasToken ? `Token saved, ends in ${d.https.tokenHint}` : 'No token saved'}.
              Make it in Cloudflare with the &quot;Edit zone DNS&quot; template, for the bas.co zone only.
            </p>
          </div>
          <div>
            <label className={labelCls}>Email (optional)</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Let's Encrypt account email" className={inputCls} />
          </div>
        </div>

        {/* Advanced */}
        <details className="border-t pt-5">
          <summary className="cursor-pointer text-sm font-medium text-gray-700">Advanced</summary>
          <div className="mt-3">
            <label className={labelCls}>WireGuard port</label>
            <input
              type="number"
              min={0}
              max={65535}
              value={wireguardPort}
              onChange={(e) => setWireguardPort(e.target.value)}
              className={inputCls}
            />
            <p className="mt-1 text-xs text-gray-500">0 = NetBird picks a free port. Change it only when two peers clash.</p>
          </div>
        </details>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Save
          </button>
          <button
            onClick={() => { if (confirm('Remove the setup key and turn NetBird off?')) removeKey.mutate(); }}
            disabled={!d?.hasKey || removeKey.isPending}
            className="flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Remove key
          </button>
          <button
            onClick={() => { if (confirm('Remove the Cloudflare token?')) removeToken.mutate(); }}
            disabled={!d?.https.hasToken || removeToken.isPending}
            className="flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Remove token
          </button>
        </div>
      </div>
    </div>
  );
}
