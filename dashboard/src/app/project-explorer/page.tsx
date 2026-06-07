'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, GraphProject } from '@/lib/api';
import {
  FolderOpen,
  RefreshCw,
  GitBranch,
  Database,
  Box,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  PlayCircle,
} from 'lucide-react';
import { useState, useCallback } from 'react';

function StatusBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        active
          ? 'bg-green-100 text-green-700'
          : 'bg-gray-100 text-gray-500'
      }`}
    >
      {active ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <XCircle className="h-3 w-3" />
      )}
      {label}
    </span>
  );
}

function ProjectDetail({ project }: { project: GraphProject }) {
  const queryClient = useQueryClient();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['graphProjectStats', project.id],
    queryFn: () => api.getGraphProjectStats(project.id),
  });

  const buildGraphMutation = useMutation({
    mutationFn: () => api.buildGraph(project.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['graphProjects'] });
      queryClient.invalidateQueries({ queryKey: ['graphProjectStats', project.id] });
    },
  });

  const buildEmbeddingsMutation = useMutation({
    mutationFn: () => api.buildEmbeddings(project.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['graphProjects'] });
      queryClient.invalidateQueries({ queryKey: ['graphProjectStats', project.id] });
    },
  });

  if (statsLoading) {
    return (
      <div className="border-t border-gray-100 bg-gray-50 px-6 py-4">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading project details...
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-100 bg-gray-50 px-6 py-4 space-y-4">
      {/* Build Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => buildGraphMutation.mutate()}
          disabled={buildGraphMutation.isPending || buildEmbeddingsMutation.isPending}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {buildGraphMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GitBranch className="h-4 w-4" />
          )}
          {buildGraphMutation.isPending ? 'Building Graph...' : 'Build Graph'}
        </button>
        <button
          onClick={() => buildEmbeddingsMutation.mutate()}
          disabled={buildGraphMutation.isPending || buildEmbeddingsMutation.isPending || !project.hasGraph}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          title={!project.hasGraph ? 'Build graph first' : ''}
        >
          {buildEmbeddingsMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Database className="h-4 w-4" />
          )}
          {buildEmbeddingsMutation.isPending ? 'Building Embeddings...' : 'Build Embeddings'}
        </button>
      </div>

      {/* Build Results */}
      {buildGraphMutation.isSuccess && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
          Graph built: {buildGraphMutation.data.nodesCreated} nodes, {buildGraphMutation.data.edgesCreated} edges
          in {buildGraphMutation.data.durationMs}ms
          {buildGraphMutation.data.errors.length > 0 && (
            <span className="text-yellow-700"> ({buildGraphMutation.data.errors.length} errors)</span>
          )}
        </div>
      )}
      {buildGraphMutation.isError && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {buildGraphMutation.error instanceof Error ? buildGraphMutation.error.message : 'Build failed'}
        </div>
      )}
      {buildEmbeddingsMutation.isSuccess && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
          Embeddings built: {buildEmbeddingsMutation.data.embedded} vectors stored
          {buildEmbeddingsMutation.data.message && ` - ${buildEmbeddingsMutation.data.message}`}
        </div>
      )}
      {buildEmbeddingsMutation.isError && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {buildEmbeddingsMutation.error instanceof Error ? buildEmbeddingsMutation.error.message : 'Build failed'}
        </div>
      )}

      {/* Stats Grid */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-3">
          {/* Graph Stats */}
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h4 className="mb-2 text-sm font-medium text-gray-700">Graph</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Nodes</span>
                <span className="font-medium text-gray-900">{stats.graph.nodeCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Edges</span>
                <span className="font-medium text-gray-900">{stats.graph.edgeCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Unresolved</span>
                <span className="font-medium text-gray-900">{stats.graph.unresolvedCount}</span>
              </div>
            </div>
            {Object.keys(stats.graph.nodesByType).length > 0 && (
              <div className="mt-3 border-t border-gray-100 pt-2">
                <p className="mb-1 text-xs text-gray-400">By type:</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(stats.graph.nodesByType).map(([type, count]) => (
                    <span key={type} className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
                      {type}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Vector Stats */}
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h4 className="mb-2 text-sm font-medium text-gray-700">Vectors</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Embeddings</span>
                <span className="font-medium text-gray-900">{stats.vectors.count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Coverage</span>
                <span className="font-medium text-gray-900">{stats.vectors.coverage}%</span>
              </div>
            </div>
            {/* Coverage bar */}
            <div className="mt-3">
              <div className="h-2 w-full rounded-full bg-gray-200">
                <div
                  className="h-2 rounded-full bg-purple-500 transition-all"
                  style={{ width: `${Math.min(stats.vectors.coverage, 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Build History */}
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h4 className="mb-2 text-sm font-medium text-gray-700">Recent Builds</h4>
            {!Array.isArray(stats.buildHistory) || stats.buildHistory.length === 0 ? (
              <p className="text-sm text-gray-400">No builds yet</p>
            ) : (
              <div className="space-y-2">
                {stats.buildHistory.slice(0, 3).map((build) => (
                  <div key={build.id} className="text-xs text-gray-500">
                    <span className="font-medium text-gray-700">{build.nodesCreated}n/{build.edgesCreated}e</span>
                    {' in '}
                    {build.buildTimeMs < 1000 ? `${build.buildTimeMs}ms` : `${(build.buildTimeMs / 1000).toFixed(1)}s`}
                    <br />
                    <span className="text-gray-400">{new Date(build.builtAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectExplorerPage() {
  const [expandedProject, setExpandedProject] = useState<number | null>(null);
  const [registerStatus, setRegisterStatus] = useState<{ type: 'success' | 'error' | 'loading'; message: string } | null>(null);
  const [buildAllState, setBuildAllState] = useState<{
    type: 'graph' | 'embeddings';
    current: number;
    total: number;
    currentProject: string;
    results: { project: string; success: boolean; detail: string }[];
  } | null>(null);

  const queryClient = useQueryClient();

  const { data: projects, isLoading, error, refetch } = useQuery({
    queryKey: ['graphProjects'],
    queryFn: api.getGraphProjects,
  });

  const buildAllGraph = useCallback(async () => {
    if (!projects || projects.length === 0 || buildAllState) return;
    const results: { project: string; success: boolean; detail: string }[] = [];
    setBuildAllState({ type: 'graph', current: 0, total: projects.length, currentProject: projects[0].name, results });
    for (let i = 0; i < projects.length; i++) {
      const p = projects[i];
      setBuildAllState(prev => prev ? { ...prev, current: i, currentProject: p.name } : prev);
      try {
        const res = await api.buildGraph(p.id);
        results.push({ project: p.name, success: true, detail: `${res.nodesCreated}n/${res.edgesCreated}e` });
      } catch (e: any) {
        results.push({ project: p.name, success: false, detail: e.message || 'Failed' });
      }
      setBuildAllState(prev => prev ? { ...prev, current: i + 1, results: [...results] } : prev);
    }
    queryClient.invalidateQueries({ queryKey: ['graphProjects'] });
    setTimeout(() => setBuildAllState(null), 8000);
  }, [projects, buildAllState, queryClient]);

  const buildAllEmbeddings = useCallback(async () => {
    if (!projects || projects.length === 0 || buildAllState) return;
    const results: { project: string; success: boolean; detail: string }[] = [];
    setBuildAllState({ type: 'embeddings', current: 0, total: projects.length, currentProject: projects[0].name, results });
    for (let i = 0; i < projects.length; i++) {
      const p = projects[i];
      setBuildAllState(prev => prev ? { ...prev, current: i, currentProject: p.name } : prev);
      try {
        const res = await api.buildEmbeddings(p.id);
        results.push({ project: p.name, success: true, detail: `${res.embedded} vectors` });
      } catch (e: any) {
        results.push({ project: p.name, success: false, detail: e.message || 'Failed' });
      }
      setBuildAllState(prev => prev ? { ...prev, current: i + 1, results: [...results] } : prev);
    }
    queryClient.invalidateQueries({ queryKey: ['graphProjects'] });
    setTimeout(() => setBuildAllState(null), 8000);
  }, [projects, buildAllState, queryClient]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Project Explorer</h1>
          <p className="text-gray-500">Manage project graphs and embeddings</p>
        </div>
        <div className="rounded-xl bg-red-50 p-6">
          <p className="font-medium text-red-800">Failed to load projects</p>
          <p className="mt-1 text-sm text-red-600">{error instanceof Error ? error.message : 'Unknown error'}</p>
          <button
            onClick={() => refetch()}
            className="mt-3 flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const totalNodes = projects?.reduce((sum, p) => sum + p.nodeCount, 0) || 0;
  const totalEdges = projects?.reduce((sum, p) => sum + p.edgeCount, 0) || 0;
  const totalVectors = projects?.reduce((sum, p) => sum + p.vectorCount, 0) || 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Project Explorer</h1>
          <p className="text-gray-500">Manage project graphs and embeddings</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={buildAllGraph}
            disabled={!!buildAllState || !projects || projects.length === 0}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            title="Build graph for all projects"
          >
            {buildAllState?.type === 'graph' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GitBranch className="h-4 w-4" />
            )}
            Build All Graphs
          </button>
          <button
            onClick={buildAllEmbeddings}
            disabled={!!buildAllState || !projects || projects.length === 0}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            title="Build embeddings for all projects"
          >
            {buildAllState?.type === 'embeddings' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Database className="h-4 w-4" />
            )}
            Build All Embeddings
          </button>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Build All Progress Banner */}
      {buildAllState && (
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
              {buildAllState.type === 'graph' ? (
                <GitBranch className="h-4 w-4 text-blue-600" />
              ) : (
                <Database className="h-4 w-4 text-purple-600" />
              )}
              Building {buildAllState.type === 'graph' ? 'graphs' : 'embeddings'} for all projects
            </div>
            <span className="text-sm text-gray-500">
              {buildAllState.current}/{buildAllState.total}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200 mb-2">
            <div
              className={`h-2 rounded-full transition-all ${
                buildAllState.type === 'graph' ? 'bg-blue-500' : 'bg-purple-500'
              }`}
              style={{ width: `${(buildAllState.current / buildAllState.total) * 100}%` }}
            />
          </div>
          {buildAllState.current < buildAllState.total && (
            <p className="text-xs text-gray-500">
              <Loader2 className="inline h-3 w-3 animate-spin mr-1" />
              Processing: {buildAllState.currentProject}
            </p>
          )}
          {buildAllState.results.length > 0 && (
            <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
              {buildAllState.results.map((r, i) => (
                <div key={i} className={`text-xs flex items-center gap-1 ${r.success ? 'text-green-700' : 'text-red-600'}`}>
                  {r.success ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <XCircle className="h-3 w-3 shrink-0" />}
                  <span className="font-medium">{r.project}</span>
                  <span className="text-gray-400">-</span>
                  <span>{r.detail}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      <div className="grid gap-6 md:grid-cols-4">
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">Projects</p>
          <p className="text-3xl font-bold text-gray-900">{projects?.length || 0}</p>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Box className="h-4 w-4 text-blue-500" />
            <p className="text-sm text-gray-500">Total Nodes</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">{totalNodes.toLocaleString()}</p>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <ArrowRight className="h-4 w-4 text-purple-500" />
            <p className="text-sm text-gray-500">Total Edges</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">{totalEdges.toLocaleString()}</p>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-green-500" />
            <p className="text-sm text-gray-500">Total Vectors</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">{totalVectors.toLocaleString()}</p>
        </div>
      </div>

      {/* Project List */}
      <div className="rounded-xl bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_80px_120px_100px_160px] bg-gray-50 px-6 py-3">
          <span className="text-xs font-medium text-gray-500 uppercase">Project</span>
          <span className="text-xs font-medium text-gray-500 uppercase">Funcs</span>
          <span className="text-xs font-medium text-gray-500 uppercase">Graph</span>
          <span className="text-xs font-medium text-gray-500 uppercase">Vectors</span>
          <span className="text-xs font-medium text-gray-500 uppercase">Status</span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-100">
          {projects?.map((project) => (
            <div key={project.id}>
              <button
                onClick={() => setExpandedProject(expandedProject === project.id ? null : project.id)}
                className="grid w-full grid-cols-[1fr_80px_120px_100px_160px] items-center px-6 py-4 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {expandedProject === project.id ? (
                    <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                  )}
                  <FolderOpen className="h-5 w-5 text-gray-400 shrink-0" />
                  <div>
                    <span className="font-medium text-gray-900">{project.name}</span>
                    {project.description && (
                      <p className="text-xs text-gray-500">{project.description}</p>
                    )}
                  </div>
                </div>
                <span className="text-sm text-gray-900">{project.functionCount}</span>
                <span className="text-sm text-gray-500">
                  {project.nodeCount > 0 ? `${project.nodeCount}n / ${project.edgeCount}e` : '--'}
                </span>
                <span className="text-sm text-gray-500">
                  {project.vectorCount > 0 ? project.vectorCount.toLocaleString() : '--'}
                </span>
                <div className="flex gap-2">
                  <StatusBadge active={project.hasGraph} label="Graph" />
                  <StatusBadge active={project.hasVectors} label="Vectors" />
                </div>
              </button>
              {expandedProject === project.id && (
                <ProjectDetail project={project} />
              )}
            </div>
          ))}
        </div>

        {(!projects || projects.length === 0) && (
          <div className="py-12 text-center">
            <p className="text-gray-500 mb-4">No Axon projects registered yet.</p>
            {registerStatus && (
              <div className={`mx-auto max-w-md rounded-lg px-4 py-3 mb-4 ${
                registerStatus.type === 'success' ? 'bg-green-50 text-green-800' :
                registerStatus.type === 'error' ? 'bg-red-50 text-red-800' :
                'bg-blue-50 text-blue-800'
              }`}>
                {registerStatus.type === 'loading' && <Loader2 className="inline h-4 w-4 animate-spin mr-2" />}
                {registerStatus.message}
              </div>
            )}
            <button
              onClick={async () => {
                setRegisterStatus({ type: 'loading', message: 'Scanning proj/ directory for synced projects...' });
                try {
                  const result = await api.registerProjects();
                  setRegisterStatus({ type: 'success', message: `Registered ${result.totalProjects} projects with ${result.totalFunctions} total functions.` });
                  refetch();
                } catch (e: any) {
                  setRegisterStatus({ type: 'error', message: `Failed: ${e.message}` });
                }
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Database className="h-4 w-4" />
              Register Projects from Synced Data
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
