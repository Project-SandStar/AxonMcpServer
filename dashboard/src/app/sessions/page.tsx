'use client';

import { useState, useEffect } from 'react';
import { Key, Trash2, RefreshCw, AlertCircle, CheckCircle, Monitor, Globe, Clock, User, Shield } from 'lucide-react';
import { getApiBase } from '@/lib/api';

const API_BASE = getApiBase();

interface OAuthSession {
  id: string;
  sessionId: string;
  clientId: string;
  clientName: string | null;
  userId: string | null;
  scope: string | null;
  createdAt: string;
  lastActivity: string;
  userAgent: string | null;
  ipAddress: string | null;
}

interface OAuthClient {
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  scope?: string;
  client_id_issued_at?: number;
}

function getAuthHeader(): string {
  const username = localStorage.getItem('admin_user') || 'admin';
  const password = localStorage.getItem('admin_pass') || 'admin';
  return 'Basic ' + btoa(`${username}:${password}`);
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function parseUserAgent(ua: string | null): { browser: string; os: string } {
  if (!ua) return { browser: 'Unknown', os: 'Unknown' };

  let browser = 'Unknown';
  let os = 'Unknown';

  // Detect browser
  if (ua.includes('Claude')) browser = 'Claude Code';
  else if (ua.includes('VSCode') || ua.includes('vscode')) browser = 'VS Code';
  else if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari')) browser = 'Safari';
  else if (ua.includes('Edge')) browser = 'Edge';

  // Detect OS
  if (ua.includes('Mac OS') || ua.includes('Macintosh')) os = 'macOS';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iOS') || ua.includes('iPhone')) os = 'iOS';

  return { browser, os };
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<OAuthSession[]>([]);
  const [clients, setClients] = useState<OAuthClient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'sessions' | 'clients'>('sessions');

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [sessionsRes, clientsRes] = await Promise.all([
        fetch(`${API_BASE}/admin/oauth/sessions`, {
          headers: { 'Authorization': getAuthHeader() },
        }),
        fetch(`${API_BASE}/admin/oauth/clients`, {
          headers: { 'Authorization': getAuthHeader() },
        }),
      ]);

      if (sessionsRes.ok) {
        const sessionsData = await sessionsRes.json();
        setSessions(Array.isArray(sessionsData) ? sessionsData : []);
      }

      if (clientsRes.ok) {
        const clientsData = await clientsRes.json();
        setClients(Array.isArray(clientsData) ? clientsData : []);
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRevokeSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to revoke this session? The client will need to re-authenticate.')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/admin/oauth/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': getAuthHeader(),
        },
      });

      if (response.ok) {
        setSuccessMessage('Session revoked successfully');
        fetchData();
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to revoke session');
      }
    } catch (err) {
      setError('Failed to revoke session');
    }
  };

  const handleDeleteClient = async (clientId: string) => {
    if (!confirm('Are you sure you want to delete this client? All associated sessions will be revoked.')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/admin/oauth/clients/${encodeURIComponent(clientId)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': getAuthHeader(),
        },
      });

      if (response.ok) {
        setSuccessMessage('Client deleted successfully');
        fetchData();
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to delete client');
      }
    } catch (err) {
      setError('Failed to delete client');
    }
  };

  const handleRevokeAllSessions = async () => {
    if (!confirm('Are you sure you want to revoke ALL active sessions? All clients will need to re-authenticate.')) {
      return;
    }

    try {
      let revokedCount = 0;
      for (const session of sessions) {
        const response = await fetch(`${API_BASE}/admin/oauth/sessions/${encodeURIComponent(session.sessionId)}`, {
          method: 'DELETE',
          headers: {
            'Authorization': getAuthHeader(),
          },
        });
        if (response.ok) revokedCount++;
      }

      setSuccessMessage(`Revoked ${revokedCount} session(s)`);
      fetchData();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError('Failed to revoke sessions');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">OAuth Sessions</h1>
          <p className="text-gray-500">Manage OAuth 2.1 sessions and registered clients</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchData}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          {sessions.length > 0 && (
            <button
              onClick={handleRevokeAllSessions}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4" />
              Revoke All
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-800">
          <AlertCircle className="h-5 w-5" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-600 hover:text-red-800">&times;</button>
        </div>
      )}

      {successMessage && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-green-800">
          <CheckCircle className="h-5 w-5" />
          {successMessage}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('sessions')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'sessions'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Active Sessions ({sessions.length})
          </button>
          <button
            onClick={() => setActiveTab('clients')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'clients'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Registered Clients ({clients.length})
          </button>
        </nav>
      </div>

      {activeTab === 'sessions' && (
        <div className="rounded-xl bg-white shadow-sm">
          {sessions.length === 0 ? (
            <div className="p-8 text-center">
              <Key className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-semibold text-gray-900">No active sessions</h3>
              <p className="mt-1 text-sm text-gray-500">
                Sessions will appear here when clients authenticate via OAuth.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scope</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Device</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Activity</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sessions.map((session) => {
                    const { browser, os } = parseUserAgent(session.userAgent);
                    return (
                      <tr key={session.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="rounded-lg bg-blue-100 p-2">
                              <Monitor className="h-4 w-4 text-blue-600" />
                            </div>
                            <div className="ml-3">
                              <div className="text-sm font-medium text-gray-900">
                                {session.clientName || 'Unknown Client'}
                              </div>
                              <div className="text-xs text-gray-500 font-mono">
                                {session.clientId.substring(0, 8)}...
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-400" />
                            <span className="text-sm text-gray-900">{session.userId || 'Unknown'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-wrap gap-1">
                            {(session.scope || '').split(' ').filter(Boolean).map((scope) => (
                              <span
                                key={scope}
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800"
                              >
                                <Shield className="h-3 w-3 mr-1" />
                                {scope}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{browser}</div>
                          <div className="text-xs text-gray-500">{os}</div>
                          {session.ipAddress && (
                            <div className="flex items-center gap-1 text-xs text-gray-400">
                              <Globe className="h-3 w-3" />
                              {session.ipAddress}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-1 text-sm text-gray-500">
                            <Clock className="h-4 w-4" />
                            {formatRelativeTime(session.createdAt)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-1 text-sm text-gray-500">
                            <Clock className="h-4 w-4" />
                            {formatRelativeTime(session.lastActivity)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <button
                            onClick={() => handleRevokeSession(session.sessionId)}
                            className="text-red-600 hover:text-red-800"
                            title="Revoke session"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'clients' && (
        <div className="rounded-xl bg-white shadow-sm">
          {clients.length === 0 ? (
            <div className="p-8 text-center">
              <Key className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-semibold text-gray-900">No registered clients</h3>
              <p className="mt-1 text-sm text-gray-500">
                Clients will be registered automatically when they initiate OAuth flow.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Redirect URIs</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scope</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Registered</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {clients.map((client) => (
                    <tr key={client.client_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="rounded-lg bg-green-100 p-2">
                            <Monitor className="h-4 w-4 text-green-600" />
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-gray-900">
                              {client.client_name || 'Unnamed Client'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                          {client.client_id}
                        </code>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          {client.redirect_uris.slice(0, 2).map((uri, i) => (
                            <code key={i} className="text-xs text-gray-600 truncate max-w-xs">
                              {uri}
                            </code>
                          ))}
                          {client.redirect_uris.length > 2 && (
                            <span className="text-xs text-gray-400">
                              +{client.redirect_uris.length - 2} more
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-600">{client.scope || 'None'}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">
                          {client.client_id_issued_at
                            ? new Date(client.client_id_issued_at * 1000).toLocaleDateString()
                            : 'Unknown'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button
                          onClick={() => handleDeleteClient(client.client_id)}
                          className="text-red-600 hover:text-red-800"
                          title="Delete client"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Info box */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
        <h3 className="text-sm font-medium text-blue-800 mb-2">About OAuth Sessions</h3>
        <p className="text-sm text-blue-700">
          OAuth 2.1 sessions are created when clients (like Claude Code) authenticate with your MCP server.
          Each session represents an active connection with granted permissions. Revoking a session will
          require the client to re-authenticate.
        </p>
      </div>
    </div>
  );
}
