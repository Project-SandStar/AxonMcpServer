'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type DocsSearchResultItem } from '@/lib/api';
import {
  Search,
  FileText,
  Book,
  Code,
  ChevronRight,
  Trash2,
  Sparkles,
  Zap,
  Database,
  Loader2,
} from 'lucide-react';

function highlightMatch(text: string, query: string): string {
  if (!query) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '<mark class="bg-yellow-200 rounded px-0.5">$1</mark>');
}

function SourceBadge({ sources }: { sources: string[] }) {
  const hasFlex = sources.includes('flexsearch');
  const hasVector = sources.includes('vector');

  if (hasFlex && hasVector) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
        <Zap className="h-3 w-3" />
        Both
      </span>
    );
  }
  if (hasVector) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
        <Sparkles className="h-3 w-3" />
        Semantic
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
      <Search className="h-3 w-3" />
      Keyword
    </span>
  );
}

export default function DocsViewer() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<DocsSearchResultItem | null>(null);

  // Stats
  const { data: docsStats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['docsStats'],
    queryFn: api.getDocsStats,
  });

  // Combined search mutation
  const searchMutation = useMutation({
    mutationFn: (query: string) => api.searchDocs(query, 20),
  });

  // Build docs embeddings mutation
  const buildMutation = useMutation({
    mutationFn: api.buildDocsEmbeddings,
    onSuccess: () => refetchStats(),
  });

  // Clear cache
  const clearMutation = useMutation({
    mutationFn: () => api.clearCache('flexsearch-docs.json'),
    onSuccess: () => {
      refetchStats();
      queryClient.invalidateQueries({ queryKey: ['caches'] });
    },
  });

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    searchMutation.mutate(searchQuery);
    setSelectedDoc(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleSuggestion = (term: string) => {
    setSearchQuery(term);
    searchMutation.mutate(term);
    setSelectedDoc(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documentation Search</h1>
          <p className="text-gray-500">
            Search Axon documentation with FlexSearch + semantic vectors
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => buildMutation.mutate()}
            disabled={buildMutation.isPending}
            className="flex items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
          >
            {buildMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {buildMutation.isPending ? 'Embedding...' : 'Build Doc Vectors'}
          </button>
          <button
            onClick={() => clearMutation.mutate()}
            disabled={clearMutation.isPending}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Clear Cache
          </button>
        </div>
      </div>

      {/* Status messages */}
      {buildMutation.isSuccess && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Embedded {buildMutation.data.embedded} documents in {(buildMutation.data.durationMs / 1000).toFixed(1)}s
          {buildMutation.data.errors > 0 && ` (${buildMutation.data.errors} errors)`}
        </div>
      )}
      {buildMutation.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Failed to build embeddings: {buildMutation.error instanceof Error ? buildMutation.error.message : 'Unknown error'}
        </div>
      )}
      {clearMutation.isSuccess && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Documentation cache cleared. Index will rebuild on next search.
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2"><FileText className="h-5 w-5 text-blue-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Documents</p>
              <p className="text-2xl font-bold text-gray-900">
                {statsLoading ? '...' : (docsStats?.flexSearch.documents ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2"><Book className="h-5 w-5 text-green-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Libraries</p>
              <p className="text-2xl font-bold text-gray-900">
                {statsLoading ? '...' : (docsStats?.flexSearch.libraries.length ?? 0)}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-100 p-2"><Code className="h-5 w-5 text-purple-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Sections</p>
              <p className="text-2xl font-bold text-gray-900">
                {statsLoading ? '...' : (docsStats?.flexSearch.sections ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-100 p-2"><Database className="h-5 w-5 text-indigo-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Doc Vectors</p>
              <p className="text-2xl font-bold text-gray-900">
                {statsLoading ? '...' : (docsStats?.vectors.count ?? 0).toLocaleString()}
              </p>
              {docsStats && docsStats.vectors.count > 0 && (
                <p className="text-xs text-gray-400">{docsStats.vectors.coverage}% coverage</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search documentation... (e.g., 'point history', 'connector', 'spark rule')"
              className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-4 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searchMutation.isPending || !searchQuery.trim()}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {searchMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Search
          </button>
        </div>

        {/* Quick suggestions */}
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-sm text-gray-500">Try:</span>
          {['point', 'hisRead', 'connector', 'spark rule', 'schedule', 'energy'].map(term => (
            <button
              key={term}
              onClick={() => handleSuggestion(term)}
              className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200"
            >
              {term}
            </button>
          ))}
        </div>
      </div>

      {/* Search error */}
      {searchMutation.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Search failed: {searchMutation.error instanceof Error ? searchMutation.error.message : 'Unknown error'}
        </div>
      )}

      {/* Results */}
      {searchMutation.data && (
        <div>
          {/* Result meta */}
          <div className="mb-3 flex items-center gap-4 text-sm text-gray-500">
            <span>{searchMutation.data.meta.mergedCount} results</span>
            <span className="flex items-center gap-1">
              <Search className="h-3 w-3" /> {searchMutation.data.meta.flexCount} keyword
            </span>
            <span className="flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> {searchMutation.data.meta.vectorCount} semantic
            </span>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Results List */}
            <div className="rounded-xl bg-white shadow-sm">
              <div className="border-b border-gray-200 px-6 py-4">
                <h2 className="text-lg font-semibold text-gray-900">Results</h2>
              </div>
              <div className="max-h-[600px] overflow-auto">
                {searchMutation.data.results.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">No results found</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {searchMutation.data.results.map((result, index) => (
                      <button
                        key={result.document?.id || index}
                        onClick={() => setSelectedDoc(result)}
                        className={`w-full px-6 py-4 text-left hover:bg-gray-50 ${
                          selectedDoc?.document?.id === result.document?.id ? 'bg-blue-50' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 shrink-0 text-blue-600" />
                              <h3
                                className="truncate font-medium text-gray-900"
                                dangerouslySetInnerHTML={{
                                  __html: highlightMatch(result.document?.title || '', searchQuery),
                                }}
                              />
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                                {result.document?.library}
                              </span>
                              <SourceBadge sources={result.sources} />
                            </div>
                            {result.highlights?.[0] && (
                              <p
                                className="mt-2 line-clamp-2 text-sm text-gray-600"
                                dangerouslySetInnerHTML={{
                                  __html: highlightMatch(result.highlights[0], searchQuery),
                                }}
                              />
                            )}
                          </div>
                          <div className="flex flex-col items-end shrink-0">
                            <span className="text-sm font-medium text-blue-600">
                              {result.combinedScore}%
                            </span>
                            {result.sources.length > 1 && (
                              <div className="mt-1 text-xs text-gray-400">
                                K:{result.flexScore} S:{result.vectorScore}
                              </div>
                            )}
                            <ChevronRight className="mt-1 h-4 w-4 text-gray-400" />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Document Preview */}
            <div className="rounded-xl bg-white shadow-sm">
              <div className="border-b border-gray-200 px-6 py-4">
                <h2 className="text-lg font-semibold text-gray-900">Preview</h2>
              </div>
              <div className="max-h-[600px] overflow-auto p-6">
                {selectedDoc ? (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">{selectedDoc.document?.title}</h3>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="inline-flex items-center rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                          <Book className="mr-1 h-3 w-3" />
                          {selectedDoc.document?.library}
                        </span>
                        <SourceBadge sources={selectedDoc.sources} />
                        <span className="text-sm text-gray-500">
                          Score: {selectedDoc.combinedScore}%
                        </span>
                      </div>
                    </div>

                    {/* Score breakdown */}
                    {selectedDoc.sources.length > 1 && (
                      <div className="flex gap-4 rounded-lg bg-gray-50 p-3 text-sm">
                        <div>
                          <span className="text-gray-400">Keyword:</span>{' '}
                          <span className="font-medium">{selectedDoc.flexScore}%</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Semantic:</span>{' '}
                          <span className="font-medium">{selectedDoc.vectorScore}%</span>
                        </div>
                      </div>
                    )}

                    {/* Matched Sections */}
                    {selectedDoc.matchedSections?.length > 0 && (
                      <div className="space-y-4">
                        <h4 className="font-medium text-gray-700">Matched Sections</h4>
                        {selectedDoc.matchedSections.map((section, i) => (
                          <div key={i} className="rounded-lg border border-gray-200 p-4">
                            <h5 className="font-medium text-gray-900">{section.heading}</h5>
                            {section.content && (
                              <p
                                className="mt-2 text-sm text-gray-600"
                                dangerouslySetInnerHTML={{
                                  __html: highlightMatch(
                                    section.content.substring(0, 300) + (section.content.length > 300 ? '...' : ''),
                                    searchQuery
                                  ),
                                }}
                              />
                            )}
                            {section.codeExamples?.length > 0 && (
                              <div className="mt-3 space-y-2">
                                {section.codeExamples.slice(0, 2).map((code, j) => (
                                  <pre key={j} className="overflow-x-auto rounded bg-gray-900 p-3 text-sm text-gray-100">
                                    <code>{code}</code>
                                  </pre>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* All Sections */}
                    {selectedDoc.document?.sections?.length > 0 && (
                      <div className="space-y-4">
                        <h4 className="font-medium text-gray-700">All Sections</h4>
                        {selectedDoc.document.sections.map((section, i) => (
                          <div key={i} className="border-l-2 border-gray-200 pl-4">
                            <h5 className="text-sm font-medium text-gray-700">{section.heading}</h5>
                            {section.codeExamples?.length > 0 && (
                              <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                                <Code className="h-3 w-3" />
                                {section.codeExamples.length} code example{section.codeExamples.length !== 1 ? 's' : ''}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* File Path */}
                    {selectedDoc.document?.filePath && (
                      <div className="mt-6 rounded-lg bg-gray-50 p-4">
                        <p className="text-xs text-gray-500">File Path</p>
                        <p className="mt-1 break-all font-mono text-sm text-gray-700">
                          {selectedDoc.document.filePath}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                    <FileText className="h-12 w-12" />
                    <p className="mt-2">Select a document to preview</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty state - no search yet */}
      {!searchMutation.data && !searchMutation.isPending && (
        <div className="rounded-xl bg-white p-12 text-center shadow-sm">
          <Search className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 text-lg font-medium text-gray-700">Search Documentation</p>
          <p className="mt-2 max-w-md mx-auto text-sm text-gray-500">
            Results combine FlexSearch keyword matching with semantic vector similarity for the best results.
            {docsStats && docsStats.vectors.count === 0 && (
              <span className="block mt-2 text-amber-600">
                Click &ldquo;Build Doc Vectors&rdquo; to enable semantic search alongside keyword search.
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
