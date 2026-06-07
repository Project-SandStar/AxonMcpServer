'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FileText, RefreshCw, Download } from 'lucide-react';
import { useState } from 'react';

export default function LogsPage() {
  const [filter, setFilter] = useState('');

  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ['startupLog'],
    queryFn: api.getStartupLog,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const filteredLines = logs
    ?.split('\n')
    .filter((line) => filter === '' || line.toLowerCase().includes(filter.toLowerCase()))
    || [];

  const downloadLogs = () => {
    const blob = new Blob([logs || ''], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'axon-mcp-server.log';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Logs</h1>
          <p className="text-gray-500">Server startup and runtime logs</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            onClick={downloadLogs}
            disabled={!logs}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Download
          </button>
        </div>
      </div>

      {/* Filter */}
      <input
        type="text"
        placeholder="Filter logs..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

      {/* Log Viewer */}
      <div className="flex-1 min-h-0 rounded-xl bg-gray-900 p-4 shadow-sm overflow-auto">
        {isLoading ? (
          <div className="text-gray-400">Loading logs...</div>
        ) : (
          <pre className="font-mono text-xs text-gray-300 whitespace-pre-wrap">
            {filteredLines.map((line, i) => (
              <div
                key={i}
                className={`py-0.5 ${
                  line.includes('error') || line.includes('Error')
                    ? 'text-red-400'
                    : line.includes('warn') || line.includes('Warning')
                    ? 'text-yellow-400'
                    : line.includes('✅')
                    ? 'text-green-400'
                    : ''
                }`}
              >
                {line}
              </div>
            ))}
            {filteredLines.length === 0 && (
              <div className="text-gray-500">No logs found</div>
            )}
          </pre>
        )}
      </div>
    </div>
  );
}
