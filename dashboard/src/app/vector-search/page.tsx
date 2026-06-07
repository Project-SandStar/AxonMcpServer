'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, type VectorSearchResult } from '@/lib/api';
import {
  Search,
  Sparkles,
  ChevronDown,
  FileText,
  ArrowUpDown,
  Phone,
  PhoneOutgoing,
} from 'lucide-react';

const NODE_TYPE_COLORS: Record<string, string> = {
  function: 'bg-green-100 text-green-800',
  defcomp: 'bg-blue-100 text-blue-800',
  variable: 'bg-purple-100 text-purple-800',
};

export default function VectorSearchPage() {
  const [query, setQuery] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>();
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const resultLimit = 20;
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowProjectDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch projects for the filter dropdown
  const { data: projects } = useQuery({
    queryKey: ['graphProjects'],
    queryFn: api.getGraphProjects,
  });

  // Fetch vector stats
  const { data: vectorStats } = useQuery({
    queryKey: ['vectorStats'],
    queryFn: api.getVectorStats,
  });

  // Semantic search mutation
  const searchMutation = useMutation({
    mutationFn: (searchQuery?: string) =>
      api.vectorSearch(searchQuery || query, selectedProjectId, resultLimit),
  });

  const selectedProject = useMemo(
    () => projects?.find((p) => p.id === selectedProjectId),
    [projects, selectedProjectId]
  );

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    if (!projectSearch) return projects;
    const lower = projectSearch.toLowerCase();
    return projects.filter((p) => p.name.toLowerCase().includes(lower));
  }, [projects, projectSearch]);

  const handleSearch = () => {
    if (!query.trim()) return;
    searchMutation.mutate(query);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Vector Search</h1>
        <p className="text-gray-500">
          Search code using natural language via semantic embeddings
        </p>
      </div>

      {/* Stats Summary */}
      {vectorStats && (
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">Code Vectors</p>
            <p className="text-2xl font-bold text-gray-900">
              {vectorStats.codeVectors.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">Doc Vectors</p>
            <p className="text-2xl font-bold text-gray-900">
              {vectorStats.docsVectors.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">Total Nodes</p>
            <p className="text-2xl font-bold text-gray-900">
              {vectorStats.totalNodes.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">Coverage</p>
            <p className="text-2xl font-bold text-gray-900">
              {vectorStats.coveragePercent}%
            </p>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row">
          {/* Project Filter */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowProjectDropdown(!showProjectDropdown)}
              className="flex h-11 min-w-[200px] items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm"
            >
              <span className={selectedProject ? 'text-gray-900' : 'text-gray-500'}>
                {selectedProject ? selectedProject.name : 'All Projects'}
              </span>
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </button>
            {showProjectDropdown && (
              <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-lg border border-gray-200 bg-white shadow-lg">
                <div className="border-b p-2">
                  <input
                    type="text"
                    placeholder="Filter projects..."
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                    className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                    autoFocus
                  />
                </div>
                <div className="max-h-60 overflow-y-auto p-1">
                  <button
                    onClick={() => {
                      setSelectedProjectId(undefined);
                      setShowProjectDropdown(false);
                      setProjectSearch('');
                    }}
                    className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                      !selectedProjectId ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700'
                    }`}
                  >
                    All Projects
                  </button>
                  {filteredProjects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedProjectId(p.id);
                        setShowProjectDropdown(false);
                        setProjectSearch('');
                      }}
                      className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                        selectedProjectId === p.id ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700'
                      }`}
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="ml-2 text-xs text-gray-400">
                        {p.vectorCount}/{p.nodeCount}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Describe what you're looking for... e.g. 'temperature setpoint calculation'"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-11 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Search Button */}
          <button
            onClick={handleSearch}
            disabled={searchMutation.isPending || !query.trim()}
            className="flex h-11 items-center gap-2 rounded-lg bg-indigo-600 px-6 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {searchMutation.isPending ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Searching...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Search
              </>
            )}
          </button>
        </div>

        {/* Suggestions */}
        {!searchMutation.data && !searchMutation.isPending && (
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="text-xs text-gray-400">Try:</span>
            {[
              'temperature setpoint control',
              'error handling patterns',
              'HVAC equipment scheduling',
              'database query operations',
              'alarm threshold logic',
              'energy meter calculations',
            ].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => {
                  setQuery(suggestion);
                  searchMutation.mutate(suggestion);
                }}
                className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      {searchMutation.isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Search failed: {searchMutation.error instanceof Error ? searchMutation.error.message : 'Unknown error'}
        </div>
      )}

      {searchMutation.data && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {searchMutation.data.results.length} results for &ldquo;{query}&rdquo;
              {selectedProject && ` in ${selectedProject.name}`}
            </p>
          </div>

          {searchMutation.data.results.length === 0 ? (
            <div className="rounded-xl bg-white p-12 text-center shadow-sm">
              <Search className="mx-auto h-10 w-10 text-gray-300" />
              <p className="mt-3 text-gray-500">No results found</p>
              <p className="mt-1 text-sm text-gray-400">
                Try a different query or build embeddings for your projects first
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {searchMutation.data.results.map((result) => (
                <ResultCard
                  key={result.nodeId}
                  result={result}
                  expanded={expandedResult === result.nodeId}
                  onToggle={() =>
                    setExpandedResult(
                      expandedResult === result.nodeId ? null : result.nodeId
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!searchMutation.data && !searchMutation.isPending && !searchMutation.isError && (
        <div className="rounded-xl bg-white p-12 text-center shadow-sm">
          <Sparkles className="mx-auto h-12 w-12 text-indigo-300" />
          <p className="mt-4 text-lg font-medium text-gray-700">Semantic Code Search</p>
          <p className="mt-2 max-w-md mx-auto text-sm text-gray-500">
            Search your Axon codebase using natural language. Describe what you&apos;re looking for
            and the system will find the most relevant functions using vector similarity.
          </p>
          {vectorStats && vectorStats.codeVectors === 0 && (
            <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-700 max-w-md mx-auto">
              No vectors found. Build embeddings for your projects in the{' '}
              <a href="/project-explorer" className="font-medium underline">
                Project Explorer
              </a>{' '}
              first.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultCard({
  result,
  expanded,
  onToggle,
}: {
  result: VectorSearchResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  const scorePercent = Math.round(result.score * 100);
  const typeClass = NODE_TYPE_COLORS[result.nodeType] || 'bg-gray-100 text-gray-700';

  return (
    <div className="rounded-xl bg-white shadow-sm overflow-hidden">
      {/* Summary Row */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-gray-50"
      >
        {/* Score Bar */}
        <div className="flex flex-col items-center gap-1 w-14 shrink-0">
          <span className="text-sm font-bold text-gray-900">{scorePercent}%</span>
          <div className="h-1.5 w-full rounded-full bg-gray-100">
            <div
              className="h-full rounded-full"
              style={{
                width: `${scorePercent}%`,
                backgroundColor:
                  scorePercent >= 70
                    ? '#22c55e'
                    : scorePercent >= 40
                      ? '#eab308'
                      : '#ef4444',
              }}
            />
          </div>
        </div>

        {/* Type Badge */}
        <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${typeClass}`}>
          {result.nodeType}
        </span>

        {/* Name + Path */}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-gray-900">{result.name}</p>
          <p className="truncate text-xs text-gray-400 font-mono">{result.qualifiedName}</p>
        </div>

        {/* Graph Context */}
        {result.graphContext && (
          <div className="hidden sm:flex items-center gap-3 text-xs text-gray-400 shrink-0">
            <span className="flex items-center gap-1" title="Callers">
              <Phone className="h-3 w-3" />
              {result.graphContext.callerCount}
            </span>
            <span className="flex items-center gap-1" title="Callees">
              <PhoneOutgoing className="h-3 w-3" />
              {result.graphContext.calleeCount}
            </span>
          </div>
        )}

        {/* Expand */}
        <ChevronDown
          className={`h-4 w-4 text-gray-400 transition-transform shrink-0 ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Expanded Detail */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-4">
          {/* Metadata */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-2">
              <FileText className="mt-0.5 h-4 w-4 text-gray-400 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">File</p>
                <p className="text-sm text-gray-700 font-mono break-all">{result.filePath}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <ArrowUpDown className="mt-0.5 h-4 w-4 text-gray-400 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Line</p>
                <p className="text-sm text-gray-700">{result.lineStart}</p>
              </div>
            </div>
          </div>

          {/* Signature */}
          {result.signature && (
            <div>
              <p className="mb-1 text-xs font-medium text-gray-400">Signature</p>
              <pre className="overflow-x-auto rounded-lg bg-gray-50 p-3 text-sm text-gray-800 font-mono">
                {result.signature}
              </pre>
            </div>
          )}

          {/* Documentation */}
          {result.documentation && (
            <div>
              <p className="mb-1 text-xs font-medium text-gray-400">Documentation</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{result.documentation}</p>
            </div>
          )}

          {/* Source Code */}
          {result.source && (
            <div>
              <p className="mb-1 text-xs font-medium text-gray-400">Source</p>
              <pre className="max-h-64 overflow-auto rounded-lg bg-gray-900 p-3 text-sm text-green-400 font-mono">
                {result.source}
              </pre>
            </div>
          )}

          {/* Scores */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Combined Score:</span>
              <span className="font-medium text-gray-900">{(result.score * 100).toFixed(1)}%</span>
            </div>
            {result.graphContext && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Callers:</span>
                  <span className="font-medium text-gray-900">{result.graphContext.callerCount}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Callees:</span>
                  <span className="font-medium text-gray-900">{result.graphContext.calleeCount}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
