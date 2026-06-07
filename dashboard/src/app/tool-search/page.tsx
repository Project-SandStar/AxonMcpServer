'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ToolMetadata } from '@/lib/api';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

const CATEGORY_COLORS: Record<string, string> = {
  search: '#3B82F6',
  retrieval: '#10B981',
  execution: '#EF4444',
  generation: '#8B5CF6',
  validation: '#F59E0B',
  skyspark: '#06B6D4',
  project: '#EC4899',
  utility: '#84CC16',
};

export default function ToolSearchPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'bm25' | 'regex'>('bm25');
  const [showConfig, setShowConfig] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ['toolSearchStats'],
    queryFn: () => api.getToolSearchStats(),
  });

  const { data: metadata } = useQuery({
    queryKey: ['toolSearchMetadata'],
    queryFn: () => api.getToolSearchMetadata(),
  });

  const { data: config } = useQuery({
    queryKey: ['toolSearchConfig'],
    queryFn: () => api.getToolSearchConfig(),
  });

  const { data: coreTools } = useQuery({
    queryKey: ['coreTools'],
    queryFn: () => api.getCoreTools(),
  });

  const { data: searchResults } = useQuery({
    queryKey: ['toolSearch', searchQuery, searchType],
    queryFn: () =>
      searchType === 'bm25'
        ? api.searchTools(searchQuery, 10)
        : api.searchToolsByRegex(searchQuery, 10),
    enabled: searchQuery.length > 0,
  });

  // Transform data for charts
  const categoryData = stats?.byCategory
    ? Object.entries(stats.byCategory).map(([name, value]) => ({
        name,
        value,
        color: CATEGORY_COLORS[name] || '#888',
      }))
    : [];

  const tokenData = [
    { name: 'Core Tools', value: stats?.coreTokenCost || 0, color: '#10B981' },
    { name: 'Deferred (Saved)', value: stats?.tokenSavings || 0, color: '#E5E7EB' },
  ];

  const copyConfig = async () => {
    if (config?.exampleUsage) {
      await navigator.clipboard.writeText(JSON.stringify(config.exampleUsage, null, 2));
      setCopiedConfig(true);
      setTimeout(() => setCopiedConfig(false), 2000);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tool Search Configuration</h1>
        <p className="text-gray-500">
          Configure defer_loading for Anthropic&apos;s Tool Search Tool feature
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-4">
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">Total Tools</p>
          <p className="text-3xl font-bold text-gray-900">{stats?.totalTools || 0}</p>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">Core Tools</p>
          <p className="text-3xl font-bold text-green-600">{stats?.coreTools || 0}</p>
          <p className="text-xs text-gray-400">Always available</p>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">Deferred Tools</p>
          <p className="text-3xl font-bold text-blue-600">{stats?.deferredTools || 0}</p>
          <p className="text-xs text-gray-400">Loaded on-demand</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 p-6 shadow-sm text-white">
          <p className="text-sm text-green-100">Token Savings</p>
          <p className="text-3xl font-bold">{stats?.savingsPercent || 0}%</p>
          <p className="text-xs text-green-100">~{stats?.tokenSavings || 0} tokens saved</p>
        </div>
      </div>

      {/* Recommendation Banner */}
      {stats?.recommendation && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-blue-600 mr-3 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="text-sm font-medium text-blue-800">{stats.recommendation}</p>
              <p className="text-xs text-blue-600 mt-1">{stats.description}</p>
            </div>
          </div>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Category Distribution */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Tools by Category</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={80} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                />
                <Bar dataKey="value" name="Tools">
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Token Distribution */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Token Distribution</h2>
          <div className="h-64 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={tokenData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {tokenData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                  formatter={(value?: number) => [`${value ?? 0} tokens`, '']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <p className="text-center text-sm text-gray-500 mt-2">
            Total: {stats?.totalTokenCost || 0} tokens | Loaded: {stats?.coreTokenCost || 0} tokens
          </p>
        </div>
      </div>

      {/* Core Tools Section */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Core Tools (Always Available)</h2>
        <p className="text-sm text-gray-500 mb-4">
          These tools are loaded immediately when Claude connects. They should NOT be deferred.
        </p>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {coreTools?.details?.map((tool: ToolMetadata) => (
            <div key={tool.name} className="p-4 rounded-lg bg-green-50 border border-green-200">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-gray-900">{tool.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{tool.description}</p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                  {tool.tokenCost} tokens
                </span>
              </div>
              <div className="flex gap-1 mt-2 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                  {tool.category}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  tool.usageFrequency === 'high' ? 'bg-red-100 text-red-700' :
                  tool.usageFrequency === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {tool.usageFrequency} usage
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tool Search Demo */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Try Tool Search</h2>
        <p className="text-sm text-gray-500 mb-4">
          Test how Claude would search for tools using BM25 (natural language) or regex patterns.
        </p>
        <div className="flex gap-4 mb-4">
          <div className="flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchType === 'bm25' ? 'Search tools... (e.g., "validate code")' : 'Regex pattern... (e.g., "skyspark|project")'}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button
              onClick={() => setSearchType('bm25')}
              className={`px-4 py-2 text-sm ${searchType === 'bm25' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`}
            >
              BM25
            </button>
            <button
              onClick={() => setSearchType('regex')}
              className={`px-4 py-2 text-sm ${searchType === 'regex' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`}
            >
              Regex
            </button>
          </div>
        </div>
        {searchResults && searchResults.count > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-gray-500">Found {searchResults.count} tools:</p>
            {searchResults.results.map((tool) => (
              <div key={tool.name} className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-900">{tool.name}</p>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    tool.core ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {tool.core ? 'Core' : 'Deferred'}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1">{tool.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Configuration Section */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">API Configuration</h2>
            <p className="text-sm text-gray-500">
              Copy this configuration to use with Claude&apos;s MCP connector
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
            >
              {showConfig ? 'Hide' : 'Show'} Config
            </button>
            <button
              onClick={copyConfig}
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              {copiedConfig ? 'Copied!' : 'Copy Config'}
            </button>
          </div>
        </div>

        {config && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200">
              <p className="text-sm font-medium text-yellow-800">Required Beta Headers</p>
              <code className="text-xs text-yellow-700 font-mono">{config.combinedHeader}</code>
            </div>

            {showConfig && (
              <pre className="p-4 rounded-lg bg-gray-900 text-gray-100 text-sm overflow-x-auto">
                {JSON.stringify(config.exampleUsage, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* All Tools Table */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">All Tools</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-500">Tool Name</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Category</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Usage</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Tokens</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Status</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">SkySpark</th>
              </tr>
            </thead>
            <tbody>
              {metadata?.tools?.map((tool: ToolMetadata) => (
                <tr key={tool.name} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium text-gray-900">{tool.name}</td>
                  <td className="py-3 px-4">
                    <span
                      className="text-xs px-2 py-1 rounded-full"
                      style={{ backgroundColor: `${CATEGORY_COLORS[tool.category]}20`, color: CATEGORY_COLORS[tool.category] }}
                    >
                      {tool.category}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      tool.usageFrequency === 'high' ? 'bg-red-100 text-red-700' :
                      tool.usageFrequency === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {tool.usageFrequency}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-500">{tool.tokenCost}</td>
                  <td className="py-3 px-4">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      tool.core ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {tool.core ? 'Core' : 'Deferred'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {tool.requiresSkySpark && (
                      <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700">
                        Required
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
