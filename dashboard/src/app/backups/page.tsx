'use client';

import { useState, useEffect } from 'react';
import {
  Archive,
  Download,
  Upload,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  RotateCcw,
  HardDrive,
  Calendar,
  FileArchive
} from 'lucide-react';

const API_BASE = typeof window !== 'undefined'
  ? `${window.location.protocol}//${window.location.host}`
  : 'http://localhost:3847';

interface BackupInfo {
  filename: string;
  filepath: string;
  size: number;
  createdAt: string;
  metadata?: {
    version: string;
    createdAt: string;
    serverVersion: string;
    description?: string;
    contents: {
      users: number;
      oauthClients: number;
      oauthSessions: number;
      configFiles: number;
      cacheFiles: number;
    };
  };
}

function getAuthHeader(): string {
  const username = localStorage.getItem('admin_user') || 'admin';
  const password = localStorage.getItem('admin_pass') || 'admin';
  return 'Basic ' + btoa(`${username}:${password}`);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString();
}

export default function BackupsPage() {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [description, setDescription] = useState('');

  const fetchBackups = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE}/admin/backups`, {
        headers: {
          'Authorization': getAuthHeader(),
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch backups');
      }

      const data = await response.json();
      setBackups(data);
      setError(null);
    } catch (err) {
      setError('Failed to load backups');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const createBackup = async () => {
    try {
      setIsCreating(true);
      setError(null);
      setSuccess(null);

      const response = await fetch(`${API_BASE}/admin/backups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': getAuthHeader(),
        },
        body: JSON.stringify({ description: description || undefined }),
      });

      if (!response.ok) {
        throw new Error('Failed to create backup');
      }

      const data = await response.json();
      setSuccess(`Backup created successfully: ${data.backup.filename}`);
      setDescription('');
      fetchBackups();
    } catch (err) {
      setError('Failed to create backup');
      console.error(err);
    } finally {
      setIsCreating(false);
    }
  };

  const downloadBackup = (filename: string) => {
    const url = `${API_BASE}/admin/backups/${encodeURIComponent(filename)}/download`;
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);

    // Fetch and create blob URL
    fetch(url, {
      headers: {
        'Authorization': getAuthHeader(),
      },
    })
      .then(response => response.blob())
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        link.href = blobUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      })
      .catch(err => {
        setError('Failed to download backup');
        console.error(err);
      });
  };

  const restoreBackup = async (filename: string) => {
    if (!confirm(`Are you sure you want to restore from "${filename}"?\n\nThis will:\n- Replace all users and OAuth data\n- Replace all configuration files\n- Restore cached data\n\nThe server will need to be restarted after restoration.`)) {
      return;
    }

    try {
      setIsRestoring(filename);
      setError(null);
      setSuccess(null);

      const response = await fetch(`${API_BASE}/admin/backups/${encodeURIComponent(filename)}/restore`, {
        method: 'POST',
        headers: {
          'Authorization': getAuthHeader(),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to restore backup');
      }

      setSuccess(data.message);
      fetchBackups();
    } catch (err: any) {
      setError(err.message || 'Failed to restore backup');
      console.error(err);
    } finally {
      setIsRestoring(null);
    }
  };

  const deleteBackup = async (filename: string) => {
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) {
      return;
    }

    try {
      setError(null);
      setSuccess(null);

      const response = await fetch(`${API_BASE}/admin/backups/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': getAuthHeader(),
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete backup');
      }

      setSuccess('Backup deleted successfully');
      fetchBackups();
    } catch (err) {
      setError('Failed to delete backup');
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Backup & Restore</h1>
          <p className="text-gray-500 mt-1">
            Export and import server configuration, users, OAuth data, and cache
          </p>
        </div>
        <button
          onClick={fetchBackups}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          title="Refresh"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-red-800">Error</h3>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-green-800">Success</h3>
            <p className="text-green-700 text-sm">{success}</p>
          </div>
        </div>
      )}

      {/* Create Backup Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Archive className="w-5 h-5" />
          Create New Backup
        </h2>
        <div className="flex gap-4">
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description (e.g., 'Before major update')"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={createBackup}
            disabled={isCreating}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isCreating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Create Backup
              </>
            )}
          </button>
        </div>
        <p className="text-sm text-gray-500 mt-3">
          Backup includes: Users, OAuth clients & sessions, all config files, server settings, and cached data.
        </p>
      </div>

      {/* Backups List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FileArchive className="w-5 h-5" />
            Available Backups
          </h2>
        </div>

        {isLoading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
            <p className="text-gray-500">Loading backups...</p>
          </div>
        ) : backups.length === 0 ? (
          <div className="p-8 text-center">
            <Archive className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No backups found</p>
            <p className="text-sm text-gray-400 mt-1">Create your first backup using the form above</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {backups.map((backup) => (
              <div key={backup.filename} className="p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <FileArchive className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">{backup.filename}</h3>
                      <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                        <span className="flex items-center gap-1">
                          <HardDrive className="w-4 h-4" />
                          {formatFileSize(backup.size)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {formatDate(backup.createdAt)}
                        </span>
                      </div>
                      {backup.metadata?.description && (
                        <p className="text-sm text-gray-600 mt-1">{backup.metadata.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => downloadBackup(backup.filename)}
                      className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                      title="Download backup"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => restoreBackup(backup.filename)}
                      disabled={isRestoring !== null}
                      className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-50"
                      title="Restore from backup"
                    >
                      {isRestoring === backup.filename ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-5 h-5" />
                      )}
                    </button>
                    <button
                      onClick={() => deleteBackup(backup.filename)}
                      className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      title="Delete backup"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-medium text-blue-900 mb-2">Backup Contents</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>Users and password hashes (from users.json)</li>
          <li>OAuth clients, sessions, and tokens</li>
          <li>SkySpark connection configurations</li>
          <li>Server settings (axonMcpServer-config.json)</li>
          <li>Cached search indexes and function data</li>
        </ul>
        <p className="text-sm text-blue-700 mt-3">
          <strong>Note:</strong> After restoring a backup, you must restart the server for changes to take effect.
        </p>
      </div>
    </div>
  );
}
