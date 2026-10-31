'use client';

import { useState, useEffect } from 'react';
import { Users, Plus, Trash2, Shield, User, Key, RefreshCw, AlertCircle, CheckCircle, FolderSync, Link2 } from 'lucide-react';
import { getApiBase } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

const API_BASE = getApiBase();

interface UserInfo {
  id: string;
  username: string;
  role: 'admin' | 'user';
  createdAt: string;
  lastLogin?: string;
  dashboardLogin?: boolean;
  sidecarSync?: { enabled: boolean; roots: string[]; linkedAt?: string };
}

interface ReceiverAccount {
  username: string;
  roots?: string[];
  allowed_roots?: string[];
  connected?: boolean;
  last_login_ms?: number | null;
  last_seen_ms?: number | null;
  user: string | null;
}

interface AccountsReply {
  configured: boolean;
  accounts: ReceiverAccount[];
  /** Every root name the receiver knows. */
  roots?: string[];
  message?: string;
  error?: string;
}

interface SyncForm {
  username: string;
  enabled: boolean;
  password: string;
  roots: string;
  hasAccount: boolean;
}

export default function UsersPage() {
  const { username: currentUser, getAuthHeader } = useAuth();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [currentUserInfo, setCurrentUserInfo] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // New user form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');
  const [isCreating, setIsCreating] = useState(false);

  // Password change
  const [changingPasswordFor, setChangingPasswordFor] = useState<string | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');

  // Sidecar sync login
  const [accounts, setAccounts] = useState<AccountsReply | null>(null);
  const [syncForm, setSyncForm] = useState<SyncForm | null>(null);
  const [isSavingSync, setIsSavingSync] = useState(false);

  const isAdmin = currentUserInfo?.role === 'admin';

  const fetchAccounts = async () => {
    try {
      const r = await fetch(`${API_BASE}/admin/sidecar/accounts`, { headers: { 'Authorization': getAuthHeader() } });
      setAccounts(r.ok ? await r.json() : { configured: true, accounts: [], error: `API error: ${r.status}` });
    } catch {
      setAccounts({ configured: true, accounts: [], error: 'Failed to reach the server' });
    }
  };

  const accountFor = (username: string) =>
    accounts?.accounts.find(a => a.username.toLowerCase() === username.toLowerCase());

  const parseRoots = (v: string) => v.split(',').map(r => r.trim()).filter(Boolean);

  // Root names to choose from: the receiver's list plus each account's roots
  const rootChoices = (): string[] => {
    const set = new Set<string>(accounts?.roots ?? []);
    for (const a of accounts?.accounts ?? []) for (const r of [...(a.roots ?? []), ...(a.allowed_roots ?? [])]) set.add(r);
    for (const r of parseRoots(syncForm?.roots ?? '')) set.add(r);
    return [...set].sort((a, b) => a.localeCompare(b));
  };

  const toggleRoot = (name: string, on: boolean) => {
    if (!syncForm) return;
    const list = parseRoots(syncForm.roots).filter(r => r !== name);
    if (on) list.push(name);
    setSyncForm({ ...syncForm, roots: list.join(', ') });
  };

  const openSync = (user: UserInfo) => {
    const acc = accountFor(user.username);
    setSyncForm({
      username: user.username,
      enabled: user.sidecarSync?.enabled ?? true,
      password: '',
      roots: (user.sidecarSync?.roots ?? acc?.allowed_roots ?? acc?.roots ?? []).join(', '),
      hasAccount: !!acc,
    });
  };

  const sendSync = async (method: 'PUT' | 'DELETE', body?: unknown) => {
    if (!syncForm) return;
    setIsSavingSync(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(syncForm.username)}/sidecar-sync`, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': getAuthHeader() },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setError(data.error || 'Failed to save the sync login'); return; }
      setSuccessMessage(method === 'DELETE' ? `Sync login of "${syncForm.username}" removed` : `Sync login of "${syncForm.username}" saved`);
      setSyncForm(null);
      fetchUsers();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch {
      setError('Failed to save the sync login');
    } finally {
      setIsSavingSync(false);
    }
  };

  const saveSync = (e: React.FormEvent) => {
    e.preventDefault();
    if (!syncForm) return;
    const roots = parseRoots(syncForm.roots);
    sendSync('PUT', { enabled: syncForm.enabled, roots, ...(syncForm.password ? { password: syncForm.password } : {}) });
  };

  const linkAccounts = async () => {
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/admin/sidecar/accounts/link`, { method: 'POST', headers: { 'Authorization': getAuthHeader() } });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setError(data.error || 'Failed to link receiver accounts'); return; }
      const n = (data.linked?.length ?? 0) + (data.created?.length ?? 0);
      setSuccessMessage(n ? `Linked ${n} receiver account(s)` : 'All receiver accounts are already linked');
      fetchUsers();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch {
      setError('Failed to link receiver accounts');
    }
  };

  const fetchUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch current user info
      const meResponse = await fetch(`${API_BASE}/admin/users/me`, {
        headers: { 'Authorization': getAuthHeader() },
      });
      if (meResponse.ok) {
        const me = await meResponse.json();
        setCurrentUserInfo(me);

        // Only fetch all users if admin
        if (me.role === 'admin') {
          const usersResponse = await fetch(`${API_BASE}/admin/users`, {
            headers: { 'Authorization': getAuthHeader() },
          });
          if (usersResponse.ok) {
            const usersData = await usersResponse.json();
            setUsers(usersData);
          }
          fetchAccounts();
        } else {
          // Non-admin only sees themselves
          setUsers([me]);
        }
      } else {
        setError('Failed to fetch user info');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': getAuthHeader(),
        },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          role: newRole,
        }),
      });

      if (response.ok) {
        setSuccessMessage(`User "${newUsername}" created successfully`);
        setShowCreateForm(false);
        setNewUsername('');
        setNewPassword('');
        setNewRole('user');
        fetchUsers();
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to create user');
      }
    } catch (err) {
      setError('Failed to create user');
    } finally {
      setIsCreating(false);
    }
  };

  const handleChangePassword = async (username: string) => {
    if (!newPasswordInput || newPasswordInput.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/admin/users/${username}/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': getAuthHeader(),
        },
        body: JSON.stringify({ password: newPasswordInput }),
      });

      if (response.ok) {
        setSuccessMessage('Password updated successfully');
        setChangingPasswordFor(null);
        setNewPasswordInput('');

        // If user changed their own password, update localStorage
        if (username === currentUser) {
          localStorage.setItem('admin_pass', newPasswordInput);
        }

        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to update password');
      }
    } catch (err) {
      setError('Failed to update password');
    }
  };

  const handleChangeRole = async (username: string, newRole: 'admin' | 'user') => {
    try {
      const response = await fetch(`${API_BASE}/admin/users/${username}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': getAuthHeader(),
        },
        body: JSON.stringify({ role: newRole }),
      });

      if (response.ok) {
        setSuccessMessage(`Role updated to "${newRole}"`);
        fetchUsers();
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to update role');
      }
    } catch (err) {
      setError('Failed to update role');
    }
  };

  const handleDeleteUser = async (username: string) => {
    if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/admin/users/${username}`, {
        method: 'DELETE',
        headers: {
          'Authorization': getAuthHeader(),
        },
      });

      if (response.ok) {
        setSuccessMessage(`User "${username}" deleted`);
        fetchUsers();
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to delete user');
      }
    } catch (err) {
      setError('Failed to delete user');
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
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-500">Manage dashboard users and permissions</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchUsers}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Add User
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

      {/* Current User Info */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-lg bg-blue-100 p-2">
            <User className="h-5 w-5 text-blue-600" />
          </div>
          <h2 className="text-lg font-semibold">Your Account</h2>
        </div>
        {currentUserInfo && (
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-gray-500">Username</p>
              <p className="font-medium">{currentUserInfo.username}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Role</p>
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                currentUserInfo.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
              }`}>
                <Shield className="h-3 w-3" />
                {currentUserInfo.role}
              </span>
            </div>
            <div>
              <p className="text-sm text-gray-500">Last Login</p>
              <p className="font-medium">{currentUserInfo.lastLogin ? new Date(currentUserInfo.lastLogin).toLocaleString() : 'Never'}</p>
            </div>
          </div>
        )}
        <div className="mt-4 pt-4 border-t">
          {changingPasswordFor === currentUserInfo?.username ? (
            <div className="flex items-center gap-2">
              <input
                type="password"
                placeholder="New password"
                value={newPasswordInput}
                onChange={(e) => setNewPasswordInput(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={() => handleChangePassword(currentUserInfo!.username)}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                Save
              </button>
              <button
                onClick={() => { setChangingPasswordFor(null); setNewPasswordInput(''); }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setChangingPasswordFor(currentUserInfo?.username || null)}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
            >
              <Key className="h-4 w-4" />
              Change Password
            </button>
          )}
        </div>
      </div>

      {/* Create User Form */}
      {showCreateForm && (
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-lg bg-green-100 p-2">
              <Plus className="h-5 w-5 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold">Create New User</h2>
          </div>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="Enter username"
                  required
                  minLength={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                  minLength={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'admin' | 'user')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isCreating}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isCreating ? 'Creating...' : 'Create User'}
              </button>
              <button
                type="button"
                onClick={() => { setShowCreateForm(false); setNewUsername(''); setNewPassword(''); }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users List (Admin only) */}
      {isAdmin && users.length > 0 && (
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-lg bg-purple-100 p-2">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
            <h2 className="text-lg font-semibold">All Users</h2>
            <span className="ml-auto text-sm text-gray-500">{users.length} users</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Login</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sidecar sync login</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className={user.username === currentUser ? 'bg-blue-50' : ''}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-400" />
                        <span className="font-medium text-gray-900">{user.username}</span>
                        {user.username === currentUser && (
                          <span className="text-xs text-blue-600">(you)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <select
                        value={user.role}
                        onChange={(e) => handleChangeRole(user.username, e.target.value as 'admin' | 'user')}
                        disabled={user.username === currentUser}
                        className={`text-xs rounded-full px-2 py-1 border-0 ${
                          user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                        } ${user.username === currentUser ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}
                      {user.dashboardLogin === false && <p className="text-xs text-gray-400">Dashboard login off</p>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      {(() => {
                        const acc = accountFor(user.username);
                        if (!user.sidecarSync?.enabled) return <span className="text-gray-400">Off</span>;
                        return (
                          <div>
                            <span className={`mr-2 inline-block h-2 w-2 rounded-full ${acc?.connected ? 'bg-green-500' : 'bg-gray-400'}`} />
                            <span className="text-gray-700">{acc ? (acc.connected ? 'Connected' : 'Not connected') : 'Not on receiver'}</span>
                            <p className="text-xs text-gray-500">
                              Last login {acc?.last_login_ms ? new Date(acc.last_login_ms).toLocaleString() : 'never'}
                              {' · '}Roots {user.sidecarSync.roots.length ? user.sidecarSync.roots.join(', ') : 'all'}
                            </p>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        {changingPasswordFor === user.username ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="password"
                              placeholder="New password"
                              value={newPasswordInput}
                              onChange={(e) => setNewPasswordInput(e.target.value)}
                              className="w-32 rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                            <button
                              onClick={() => handleChangePassword(user.username)}
                              className="p-1 text-green-600 hover:text-green-800"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => { setChangingPasswordFor(null); setNewPasswordInput(''); }}
                              className="p-1 text-gray-400 hover:text-gray-600"
                            >
                              &times;
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => setChangingPasswordFor(user.username)}
                              className="p-1 text-gray-400 hover:text-blue-600"
                              title="Change password"
                            >
                              <Key className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => openSync(user)}
                              className="p-1 text-gray-400 hover:text-blue-600"
                              title="Sidecar sync login"
                            >
                              <FolderSync className="h-4 w-4" />
                            </button>
                            {user.username !== currentUser && (
                              <button
                                onClick={() => handleDeleteUser(user.username)}
                                className="p-1 text-gray-400 hover:text-red-600"
                                title="Delete user"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sidecar sync login (Admin only) */}
      {isAdmin && (
        <div className="rounded-xl bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-teal-100 p-2">
              <FolderSync className="h-5 w-5 text-teal-600" />
            </div>
            <h2 className="text-lg font-semibold">Sidecar sync login</h2>
            {accounts?.configured && (
              <button
                onClick={linkAccounts}
                className="ml-auto flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                title="Link receiver accounts to users with the same name"
              >
                <Link2 className="h-4 w-4" />
                Link receiver accounts
              </button>
            )}
          </div>
          <p className="text-sm text-gray-500">
            A user with a sync login can send folders from a sidecar to this server. The sync password is separate from the
            dashboard password. It is write-only: the receiver keeps it, this server does not. Click the
            <FolderSync className="mx-1 inline h-4 w-4" />button in the user list to change a login.
          </p>
          {accounts && !accounts.configured && (
            <p className="text-sm text-gray-500">Receiver not set up (SIDECAR_RECEIVER_URL, SIDECAR_RECEIVER_TOKEN).</p>
          )}
          {accounts?.error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
              <AlertCircle className="h-4 w-4" /> {accounts.error}
            </div>
          )}
          {accounts?.configured && accounts.accounts.some(a => !a.user) && (
            <p className="text-sm text-amber-700">
              Receiver accounts without a user: {accounts.accounts.filter(a => !a.user).map(a => a.username).join(', ')}.
              Click &quot;Link receiver accounts&quot; to add them as users (dashboard login off).
            </p>
          )}

          {syncForm && (
            <form onSubmit={saveSync} className="space-y-4 rounded-lg border border-gray-200 p-4">
              <h3 className="font-medium text-gray-900">Sync login for &quot;{syncForm.username}&quot;</h3>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={syncForm.enabled}
                  onChange={(e) => setSyncForm({ ...syncForm, enabled: e.target.checked })}
                />
                Sync login on
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sync password</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={syncForm.password}
                    onChange={(e) => setSyncForm({ ...syncForm, password: e.target.value })}
                    placeholder={syncForm.hasAccount ? 'Empty = keep the current password' : 'At least 8 characters'}
                    minLength={8}
                    disabled={!syncForm.enabled}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Allowed roots</label>
                  {rootChoices().length > 0 ? (
                    <div className="space-y-1 rounded-lg border border-gray-300 px-3 py-2">
                      {rootChoices().map(name => (
                        <label key={name} className="flex items-center gap-2 text-sm font-mono text-gray-700">
                          <input
                            type="checkbox"
                            checked={parseRoots(syncForm.roots).includes(name)}
                            onChange={(e) => toggleRoot(name, e.target.checked)}
                            disabled={!syncForm.enabled}
                          />
                          {name}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={syncForm.roots}
                      onChange={(e) => setSyncForm({ ...syncForm, roots: e.target.value })}
                      placeholder="Comma list, empty = all roots"
                      disabled={!syncForm.enabled}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
                    />
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    {parseRoots(syncForm.roots).length ? `Only: ${parseRoots(syncForm.roots).join(', ')}` : 'None selected = all roots'}.
                    The receiver allows only these roots for this login.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isSavingSync}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSavingSync ? 'Saving...' : 'Save'}
                </button>
                {syncForm.hasAccount && (
                  <button
                    type="button"
                    disabled={isSavingSync}
                    onClick={() => { if (confirm(`Remove the sync login of "${syncForm.username}" from the receiver?`)) sendSync('DELETE'); }}
                    className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Remove sync login
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSyncForm(null)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Non-admin message */}
      {!isAdmin && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-gray-600">
          <p className="text-sm">Only administrators can manage other users.</p>
        </div>
      )}
    </div>
  );
}
