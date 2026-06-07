'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

export default function UsagePage() {
  const { data: usage } = useQuery({
    queryKey: ['usage', 30],
    queryFn: () => api.getUsage(30),
  });

  const { data: dailyStats } = useQuery({
    queryKey: ['dailyStats', 30],
    queryFn: () => api.getDailyStats(30),
  });

  const { data: toolUsage } = useQuery({
    queryKey: ['toolUsage', 30],
    queryFn: () => api.getToolUsage(30),
  });

  const { data: searchAnalytics } = useQuery({
    queryKey: ['searchAnalytics', 30],
    queryFn: () => api.getSearchAnalytics(30),
  });

  // Transform tool usage for pie chart
  const toolChartData = toolUsage
    ? Object.entries(toolUsage)
        .map(([name, value]) => ({ name: name.replace('search', '').replace('Axon', ''), value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8)
    : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Usage Analytics</h1>
        <p className="text-gray-500">Last 30 days of activity</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-6 md:grid-cols-4">
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">Total Tool Calls</p>
          <p className="text-3xl font-bold text-gray-900">{usage?.totalToolCalls || 0}</p>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">Total Searches</p>
          <p className="text-3xl font-bold text-gray-900">{usage?.totalSearches || 0}</p>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">Total Sessions</p>
          <p className="text-3xl font-bold text-gray-900">{usage?.totalSessions || 0}</p>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">Active Sessions</p>
          <p className="text-3xl font-bold text-blue-600">{usage?.activeSessions || 0}</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Daily Activity Chart */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Daily Activity</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyStats || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                  labelFormatter={(value) => new Date(value).toLocaleDateString()}
                />
                <Line type="monotone" dataKey="toolCalls" stroke="#3B82F6" strokeWidth={2} dot={false} name="Tool Calls" />
                <Line type="monotone" dataKey="searches" stroke="#10B981" strokeWidth={2} dot={false} name="Searches" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tool Usage Pie Chart */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Tool Usage Distribution</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={toolChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {toolChartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Search Analytics */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Popular Searches */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Popular Searches</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={(searchAnalytics?.popular || []).slice(0, 10)}
                layout="vertical"
                margin={{ left: 80 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis dataKey="query" type="category" tick={{ fontSize: 12 }} width={75} />
                <Tooltip />
                <Bar dataKey="count" fill="#3B82F6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Zero Result Searches */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Zero Result Searches</h2>
          {searchAnalytics?.zeroResults && searchAnalytics.zeroResults.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {searchAnalytics.zeroResults.map((query, i) => (
                <div
                  key={i}
                  className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  {query}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No zero-result searches</p>
          )}
        </div>
      </div>

      {/* Top Searches Table */}
      {usage?.topSearches && usage.topSearches.length > 0 && (
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Top Search Terms</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-3 text-left text-sm font-medium text-gray-500">Query</th>
                  <th className="py-3 text-right text-sm font-medium text-gray-500">Count</th>
                </tr>
              </thead>
              <tbody>
                {usage.topSearches.map((search, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-3 text-sm text-gray-900">{search.query}</td>
                    <td className="py-3 text-right text-sm font-medium text-gray-900">{search.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
