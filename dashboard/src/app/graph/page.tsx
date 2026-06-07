'use client';

import { useQuery } from '@tanstack/react-query';
import { api, GraphNode, GraphProject, GraphNodeDetails, GraphVisualizationData } from '@/lib/api';
import {
  GitBranch, Box, ArrowRight, Database, RefreshCw, Search,
  Download, Target, X, FileText, Loader2, ChevronDown, FolderOpen,
} from 'lucide-react';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

// ============================================
// Types for force simulation
// ============================================

interface SimNode {
  id: string;
  name: string;
  nodeType: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  isFocal: boolean;
}

interface SimEdge {
  source: string;
  target: string;
  edgeType: string;
}

// ============================================
// Constants
// ============================================

const NODE_COLORS: Record<string, string> = {
  function: '#3b82f6',
  defcomp: '#8b5cf6',
  variable: '#f59e0b',
  default: '#6b7280',
};

const EDGE_COLORS: Record<string, string> = {
  calls: '#94a3b8',
  contains: '#c084fc',
};

// ============================================
// Helpers
// ============================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString();
}

// ============================================
// Force-directed SVG graph component
// ============================================

function GraphCanvas({
  data,
  selectedNodeId,
  onNodeClick,
  edgeTypeFilter,
}: {
  data: GraphVisualizationData;
  selectedNodeId: string | null;
  onNodeClick: (nodeId: string) => void;
  edgeTypeFilter: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<SimEdge[]>([]);
  const [, forceRender] = useState(0);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [dragging, setDragging] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const animRef = useRef<number>(0);
  const draggingRef = useRef<string | null>(null);

  // Keep draggingRef in sync
  useEffect(() => { draggingRef.current = dragging; }, [dragging]);

  // Initialize nodes and edges from data
  useEffect(() => {
    const centerX = 400;
    const centerY = 300;
    const nodeCount = data.nodes.length;
    // Scale radius with node count for better spread
    const baseRadius = Math.max(200, Math.sqrt(nodeCount) * 40);

    const simNodes: SimNode[] = data.nodes.map((n, i) => {
      const angle = (2 * Math.PI * i) / nodeCount;
      const radius = baseRadius + Math.random() * baseRadius * 0.5;
      return {
        id: n.id,
        name: n.name,
        nodeType: n.nodeType,
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        color: n.color || NODE_COLORS[n.nodeType] || NODE_COLORS.default,
        isFocal: n.id === data.metadata.focalNodeId,
      };
    });

    const simEdges: SimEdge[] = data.edges.map(e => ({
      source: e.source,
      target: e.target,
      edgeType: e.edgeType,
    }));

    nodesRef.current = simNodes;
    edgesRef.current = simEdges;
    setTransform({ x: 0, y: 0, scale: 1 });
    forceRender(c => c + 1);

    // Run force simulation
    let running = true;
    let temperature = 1.0;
    const nodeMap = new Map(simNodes.map(n => [n.id, n]));
    // Scale repulsion with node count
    const repulsionStrength = Math.max(8000, nodeCount * 200);
    const idealEdgeLength = Math.max(100, Math.sqrt(nodeCount) * 20);

    const step = () => {
      if (!running || temperature < 0.001) return;

      // Repulsion between all nodes (Coulomb's law)
      for (let i = 0; i < simNodes.length; i++) {
        for (let j = i + 1; j < simNodes.length; j++) {
          const a = simNodes[i];
          const b = simNodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distSq = dx * dx + dy * dy;
          const dist = Math.sqrt(distSq) || 1;
          const force = repulsionStrength / distSq;
          const fx = (dx / dist) * force * temperature;
          const fy = (dy / dist) * force * temperature;
          a.vx -= fx;
          a.vy -= fy;
          b.vx += fx;
          b.vy += fy;
        }
      }

      // Attraction along edges (Hooke's law)
      for (const edge of simEdges) {
        const a = nodeMap.get(edge.source);
        const b = nodeMap.get(edge.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - idealEdgeLength) * 0.03 * temperature;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }

      // Center gravity (weak)
      for (const node of simNodes) {
        node.vx += (centerX - node.x) * 0.002 * temperature;
        node.vy += (centerY - node.y) * 0.002 * temperature;
      }

      // Update positions with velocity damping
      for (const node of simNodes) {
        if (node.id === draggingRef.current) continue;
        node.vx *= 0.8;
        node.vy *= 0.8;
        // Clamp velocity
        const maxV = 20;
        node.vx = Math.max(-maxV, Math.min(maxV, node.vx));
        node.vy = Math.max(-maxV, Math.min(maxV, node.vy));
        node.x += node.vx;
        node.y += node.vy;
      }

      temperature *= 0.993;
      forceRender(c => c + 1);
      animRef.current = requestAnimationFrame(step);
    };

    animRef.current = requestAnimationFrame(step);

    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [data]);

  const nodes = nodesRef.current;
  const edges = edgesRef.current;

  const filteredEdges = edgeTypeFilter === 'all'
    ? edges
    : edges.filter(e => e.edgeType === edgeTypeFilter);

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Attach wheel listener as non-passive via useEffect to allow preventDefault
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setTransform(t => ({
        ...t,
        scale: Math.max(0.1, Math.min(5, t.scale * delta)),
      }));
    };
    svg.addEventListener('wheel', handler, { passive: false });
    return () => svg.removeEventListener('wheel', handler);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as SVGElement).tagName === 'line') {
      setPanning(true);
      panStart.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
    }
  }, [transform.x, transform.y]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (panning) {
      setTransform(t => ({
        ...t,
        x: e.clientX - panStart.current.x,
        y: e.clientY - panStart.current.y,
      }));
    }
    if (dragging) {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = (e.clientX - rect.left - transform.x) / transform.scale;
      const y = (e.clientY - rect.top - transform.y) / transform.scale;
      const node = nodesRef.current.find(n => n.id === dragging);
      if (node) {
        node.x = x;
        node.y = y;
        node.vx = 0;
        node.vy = 0;
        forceRender(c => c + 1);
      }
    }
  }, [panning, dragging, transform.x, transform.y, transform.scale]);

  const handleMouseUp = useCallback(() => {
    setPanning(false);
    setDragging(null);
  }, []);

  return (
    <svg
      ref={svgRef}
      className="w-full h-full cursor-grab active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
        </marker>
        <marker
          id="arrowhead-contains"
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="#c084fc" />
        </marker>
      </defs>
      <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
        {/* Edges */}
        {filteredEdges.map((edge, i) => {
          const source = nodeMap.get(edge.source);
          const target = nodeMap.get(edge.target);
          if (!source || !target) return null;
          const color = EDGE_COLORS[edge.edgeType] || EDGE_COLORS.calls;
          return (
            <line
              key={`${edge.source}-${edge.target}-${i}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke={color}
              strokeWidth={1.5}
              markerEnd={edge.edgeType === 'contains' ? 'url(#arrowhead-contains)' : 'url(#arrowhead)'}
              opacity={0.6}
            />
          );
        })}
        {/* Nodes */}
        {nodes.map(node => {
          const isSelected = node.id === selectedNodeId;
          const radius = node.isFocal ? 12 : 8;
          return (
            <g
              key={node.id}
              className="cursor-pointer"
              onMouseDown={(e) => {
                e.stopPropagation();
                setDragging(node.id);
              }}
              onClick={(e) => {
                e.stopPropagation();
                onNodeClick(node.id);
              }}
            >
              <circle
                cx={node.x}
                cy={node.y}
                r={radius + (isSelected ? 4 : 0)}
                fill={isSelected ? '#fbbf24' : 'transparent'}
                stroke={isSelected ? '#f59e0b' : 'transparent'}
                strokeWidth={2}
              />
              <circle
                cx={node.x}
                cy={node.y}
                r={radius}
                fill={node.color}
                stroke="white"
                strokeWidth={2}
              />
              <text
                x={node.x}
                y={node.y + radius + 14}
                textAnchor="middle"
                fontSize={10}
                fill="#374151"
                fontFamily="monospace"
              >
                {node.name}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

// ============================================
// Node Details Panel
// ============================================

function NodeDetailsPanel({
  nodeId,
  onClose,
  onNavigate,
}: {
  nodeId: string;
  onClose: () => void;
  onNavigate: (nodeId: string) => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['graphNodeDetails', nodeId],
    queryFn: () => api.getGraphNodeDetails(nodeId),
  });

  return (
    <div className="absolute right-0 top-0 h-full w-80 overflow-y-auto border-l border-gray-200 bg-white shadow-lg">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">Node Details</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 px-4 py-8 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading...
        </div>
      )}

      {error && (
        <div className="px-4 py-4 text-sm text-red-600">
          Failed to load details
        </div>
      )}

      {data && (
        <div className="space-y-4 p-4">
          {/* Name & Type */}
          <div>
            <p className="font-mono text-sm font-bold text-gray-900">{data.node.name}</p>
            <span
              className="mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: (NODE_COLORS[data.node.nodeType] || NODE_COLORS.default) + '20',
                color: NODE_COLORS[data.node.nodeType] || NODE_COLORS.default,
              }}
            >
              {data.node.nodeType}
            </span>
          </div>

          {/* Signature */}
          {data.node.signature && (
            <div>
              <p className="mb-1 text-xs text-gray-500">Signature</p>
              <p className="rounded bg-gray-50 px-2 py-1 font-mono text-xs text-gray-700">{data.node.signature}</p>
            </div>
          )}

          {/* File */}
          <div>
            <p className="mb-1 text-xs text-gray-500">File</p>
            <div className="flex items-center gap-1 text-xs text-gray-600">
              <FileText className="h-3 w-3" />
              <span className="font-mono">{data.node.filePath.split('/').pop()}:{data.node.lineStart}</span>
            </div>
          </div>

          {/* Documentation */}
          {data.node.documentation && (
            <div>
              <p className="mb-1 text-xs text-gray-500">Documentation</p>
              <p className="text-xs text-gray-600">{data.node.documentation.slice(0, 200)}</p>
            </div>
          )}

          {/* Callers */}
          <div>
            <p className="mb-2 text-xs font-medium text-gray-500">
              Callers ({data.callers.length})
            </p>
            {data.callers.length === 0 ? (
              <p className="text-xs text-gray-400">No callers found</p>
            ) : (
              <div className="space-y-1">
                {data.callers.map(caller => (
                  <button
                    key={caller.id}
                    onClick={() => onNavigate(caller.id)}
                    className="w-full rounded px-2 py-1 text-left text-xs hover:bg-blue-50"
                  >
                    <span className="font-mono font-medium text-blue-600">{caller.name}</span>
                    <span className="ml-1 text-gray-400">{caller.filePath.split('/').pop()}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Callees */}
          <div>
            <p className="mb-2 text-xs font-medium text-gray-500">
              Callees ({data.callees.length})
            </p>
            {data.callees.length === 0 ? (
              <p className="text-xs text-gray-400">No callees found</p>
            ) : (
              <div className="space-y-1">
                {data.callees.map(callee => (
                  <button
                    key={callee.id}
                    onClick={() => onNavigate(callee.id)}
                    className="w-full rounded px-2 py-1 text-left text-xs hover:bg-blue-50"
                  >
                    <span className="font-mono font-medium text-blue-600">{callee.name}</span>
                    <span className="ml-1 text-gray-400">{callee.filePath.split('/').pop()}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Main Page Component
// ============================================

type GraphType = 'subgraph' | 'callers' | 'callees' | 'impact' | 'project';

const GRAPH_TYPE_LABELS: Record<GraphType, string> = {
  subgraph: 'Subgraph (Both)',
  callers: 'Callers',
  callees: 'Callees',
  impact: 'Impact Analysis',
  project: 'Full Project',
};

export default function GraphPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'explorer'>('overview');
  const [buildSearchQuery, setBuildSearchQuery] = useState('');
  const [focalNodeId, setFocalNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [edgeTypeFilter, setEdgeTypeFilter] = useState('all');
  const [graphDepth, setGraphDepth] = useState(2);
  const [graphType, setGraphType] = useState<GraphType>('subgraph');
  const [actionStatus, setActionStatus] = useState<{ type: string; message: string; isError?: boolean } | null>(null);

  // Project selector state
  const [selectedProject, setSelectedProject] = useState<GraphProject | null>(null);
  const [projectSearch, setProjectSearch] = useState('');
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);

  // Node selector state
  const [nodeSearch, setNodeSearch] = useState('');
  const [showNodeDropdown, setShowNodeDropdown] = useState(false);
  const [nodeTypeFilter, setNodeTypeFilter] = useState<string>('all');

  // Stats query
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useQuery({
    queryKey: ['graphStats'],
    queryFn: api.getGraphStats,
  });

  // Projects for dropdown
  const { data: projects } = useQuery({
    queryKey: ['graphProjects'],
    queryFn: api.getGraphProjects,
  });

  // Filtered projects for dropdown
  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    if (!projectSearch.trim()) return projects;
    const q = projectSearch.toLowerCase();
    return projects.filter(p => p.name.toLowerCase().includes(q));
  }, [projects, projectSearch]);

  // All nodes for selected project (fetched once, filtered client-side)
  const { data: projectNodes, isLoading: nodesLoading } = useQuery({
    queryKey: ['projectNodes', selectedProject?.id],
    queryFn: () => api.searchGraphNodes('*', 500, selectedProject!.id),
    enabled: !!selectedProject && showNodeDropdown,
    staleTime: 30_000,
  });

  // Filtered nodes for dropdown
  const filteredNodes = useMemo(() => {
    if (!projectNodes) return [];
    let results = projectNodes;
    if (nodeTypeFilter !== 'all') {
      results = results.filter(n => n.nodeType === nodeTypeFilter);
    }
    if (nodeSearch.trim()) {
      const q = nodeSearch.toLowerCase();
      results = results.filter(n => n.name.toLowerCase().includes(q) || n.qualifiedName.toLowerCase().includes(q));
    }
    return results.slice(0, 100);
  }, [projectNodes, nodeSearch, nodeTypeFilter]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-dropdown="project"]')) setShowProjectDropdown(false);
      if (!target.closest('[data-dropdown="node"]')) setShowNodeDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Determine what to visualize
  const vizId = graphType === 'project' && selectedProject ? String(selectedProject.id) : focalNodeId;
  const vizEnabled = graphType === 'project' ? !!selectedProject : !!focalNodeId;

  // Graph visualization data
  const { data: vizData, isLoading: vizLoading, error: vizError } = useQuery({
    queryKey: ['graphViz', vizId, graphDepth, graphType],
    queryFn: () => api.getGraphVisualization(vizId!, graphDepth, 200, graphType),
    enabled: vizEnabled,
  });

  // Impact analysis
  const { data: impactData } = useQuery({
    queryKey: ['graphImpact', selectedNodeId],
    queryFn: () => api.getGraphImpact(selectedNodeId!),
    enabled: !!selectedNodeId,
  });

  const handleNodeSelect = (node: GraphNode) => {
    setFocalNodeId(node.id);
    setSelectedNodeId(null);
    setNodeSearch(node.name);
    setShowNodeDropdown(false);
  };

  const handleNodeClick = (nodeId: string) => {
    setSelectedNodeId(nodeId === selectedNodeId ? null : nodeId);
  };

  const handleNavigate = (nodeId: string) => {
    setFocalNodeId(nodeId);
    setSelectedNodeId(null);
  };

  const handleProjectSelect = (project: GraphProject) => {
    setSelectedProject(project);
    setProjectSearch(project.name);
    setShowProjectDropdown(false);
    // Reset node selection when project changes
    setFocalNodeId(null);
    setSelectedNodeId(null);
    setNodeSearch('');
  };

  const handleExport = (format: 'json' | 'dot') => {
    if (!vizData) return;
    const content = format === 'json'
      ? JSON.stringify(vizData, null, 2)
      : `// Export as DOT not available in client - use /admin/graph/visualize/${vizId}?format=dot&graphType=${graphType}`;
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `graph-${(vizId || 'export').slice(0, 8)}.${format === 'json' ? 'json' : 'dot'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Loading state for overview
  if (activeTab === 'overview' && statsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Graph Viewer</h1>
          <p className="text-gray-500">Code graph visualization and analysis</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'overview'
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('explorer')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'explorer'
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
            }`}
          >
            Explorer
          </button>
        </div>
      </div>

      {/* ============================================ */}
      {/* Overview Tab */}
      {/* ============================================ */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          {statsError ? (
            <div className="rounded-xl bg-red-50 p-6">
              <p className="font-medium text-red-800">Failed to load graph stats</p>
              <p className="mt-1 text-sm text-red-600">{statsError instanceof Error ? statsError.message : 'Unknown error'}</p>
              <button
                onClick={() => refetchStats()}
                className="mt-3 flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-blue-100 p-2"><Box className="h-5 w-5 text-blue-600" /></div>
                    <div>
                      <p className="text-sm text-gray-500">Code Nodes</p>
                      <p className="text-2xl font-bold text-gray-900">{stats?.nodeCount?.toLocaleString() || 0}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-purple-100 p-2"><ArrowRight className="h-5 w-5 text-purple-600" /></div>
                    <div>
                      <p className="text-sm text-gray-500">Code Edges</p>
                      <p className="text-2xl font-bold text-gray-900">{stats?.edgeCount?.toLocaleString() || 0}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-green-100 p-2"><Database className="h-5 w-5 text-green-600" /></div>
                    <div>
                      <p className="text-sm text-gray-500">Vectors</p>
                      <p className="text-2xl font-bold text-gray-900">{stats?.vectorCount?.toLocaleString() || 0}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-amber-100 p-2"><GitBranch className="h-5 w-5 text-amber-600" /></div>
                    <div>
                      <p className="text-sm text-gray-500">Projects</p>
                      <p className="text-2xl font-bold text-gray-900">{stats?.projectCount || 0}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Status */}
              {actionStatus && (
                <div className={`rounded-lg px-4 py-3 ${
                  actionStatus.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' :
                  actionStatus.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
                  'bg-blue-50 text-blue-800 border border-blue-200'
                }`}>
                  {actionStatus.type === 'loading' && <Loader2 className="inline h-4 w-4 animate-spin mr-2" />}
                  {actionStatus.message}
                </div>
              )}

              {/* Getting Started - shown when no data */}
              {stats && stats.nodeCount === 0 && (
                <div className="rounded-xl bg-white p-8 shadow-sm border border-dashed border-gray-300">
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">Get Started</h2>
                  <p className="text-sm text-gray-500 mb-6">
                    No graph data yet. Register your synced projects, then build the code graph and embeddings.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={async () => {
                        setActionStatus({ type: 'loading', message: 'Registering projects from proj/ directory...' });
                        try {
                          const result = await api.registerProjects();
                          setActionStatus({ type: 'success', message: `Registered ${result.totalProjects} projects with ${result.totalFunctions} functions.` });
                          refetchStats();
                        } catch (e: any) {
                          setActionStatus({ type: 'error', message: `Failed: ${e.message}` });
                        }
                      }}
                      className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      <Database className="h-4 w-4" />
                      1. Register Projects
                    </button>
                    <button
                      onClick={async () => {
                        setActionStatus({ type: 'loading', message: 'Building graph for all projects... This may take a moment.' });
                        try {
                          const projects = await api.getGraphProjects();
                          let totalNodes = 0, totalEdges = 0;
                          for (const p of projects) {
                            try {
                              const result = await api.buildGraph(p.id);
                              totalNodes += result.nodesCreated || 0;
                              totalEdges += result.edgesCreated || 0;
                            } catch { /* skip failed */ }
                          }
                          setActionStatus({ type: 'success', message: `Built graph: ${totalNodes} nodes, ${totalEdges} edges across ${projects.length} projects.` });
                          refetchStats();
                        } catch (e: any) {
                          setActionStatus({ type: 'error', message: `Failed: ${e.message}` });
                        }
                      }}
                      className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-700"
                    >
                      <GitBranch className="h-4 w-4" />
                      2. Build Graph
                    </button>
                    <button
                      onClick={async () => {
                        setActionStatus({ type: 'loading', message: 'Building embeddings for all projects... This may take a while.' });
                        try {
                          const projects = await api.getGraphProjects();
                          let totalEmbedded = 0;
                          for (const p of projects) {
                            try {
                              const result = await api.buildEmbeddings(p.id);
                              totalEmbedded += result.embedded || 0;
                            } catch { /* skip failed */ }
                          }
                          setActionStatus({ type: 'success', message: `Generated ${totalEmbedded} embeddings.` });
                          refetchStats();
                        } catch (e: any) {
                          setActionStatus({ type: 'error', message: `Failed: ${e.message}` });
                        }
                      }}
                      className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700"
                    >
                      <Target className="h-4 w-4" />
                      3. Build Embeddings
                    </button>
                  </div>
                </div>
              )}

              {/* Vector Breakdown */}
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-xl bg-white p-6 shadow-sm">
                  <h2 className="mb-4 text-lg font-semibold text-gray-900">Code Vectors</h2>
                  <p className="text-3xl font-bold text-blue-600">{stats?.codeVectors?.toLocaleString() || 0}</p>
                  <p className="mt-1 text-sm text-gray-500">Function embeddings in LanceDB</p>
                </div>
                <div className="rounded-xl bg-white p-6 shadow-sm">
                  <h2 className="mb-4 text-lg font-semibold text-gray-900">Docs Vectors</h2>
                  <p className="text-3xl font-bold text-green-600">{stats?.docsVectors?.toLocaleString() || 0}</p>
                  <p className="mt-1 text-sm text-gray-500">Documentation embeddings in LanceDB</p>
                </div>
              </div>

              {/* Build History */}
              <div className="rounded-xl bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                  <h2 className="text-lg font-semibold text-gray-900">Build History</h2>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={buildSearchQuery}
                      onChange={(e) => setBuildSearchQuery(e.target.value)}
                      placeholder="Filter by project..."
                      className="rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Instance</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nodes</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Edges</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Build Time</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Built At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(stats?.buildStats?.filter(
                      s => !buildSearchQuery || (s.project || '').toLowerCase().includes(buildSearchQuery.toLowerCase()) || (s.instance || '').toLowerCase().includes(buildSearchQuery.toLowerCase())
                    ) || []).map(build => (
                      <tr key={build.id}>
                        <td className="px-6 py-4"><span className="font-medium text-gray-900">{build.project}</span></td>
                        <td className="px-6 py-4 text-sm text-gray-500">{build.instance}</td>
                        <td className="px-6 py-4 text-sm text-gray-900">{(build.nodesCreated ?? 0).toLocaleString()}</td>
                        <td className="px-6 py-4 text-sm text-gray-900">{(build.edgesCreated ?? 0).toLocaleString()}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">{formatDuration(build.buildTimeMs ?? 0)}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">{build.builtAt ? formatDate(build.builtAt) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(!stats?.buildStats || stats.buildStats.length === 0) && (
                  <div className="py-12 text-center text-gray-500">No graph builds recorded yet</div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ============================================ */}
      {/* Explorer Tab */}
      {/* ============================================ */}
      {activeTab === 'explorer' && (
        <div className="space-y-4">
          {/* Controls Row 1: Project & Graph Type */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-3">
            {/* Project Selector */}
            <div className="relative" data-dropdown="project">
              <label className="mb-1 block text-xs font-medium text-gray-500">Project</label>
              <div className="relative">
                <FolderOpen className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={projectSearch}
                  onChange={(e) => { setProjectSearch(e.target.value); setShowProjectDropdown(true); }}
                  onFocus={() => setShowProjectDropdown(true)}
                  placeholder="Select project..."
                  className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-8 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {selectedProject && (
                  <button
                    onClick={() => { setSelectedProject(null); setProjectSearch(''); setFocalNodeId(null); setNodeSearch(''); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {showProjectDropdown && (
                  <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto">
                    <div className="sticky top-0 bg-gray-50 px-3 py-1.5 text-xs text-gray-500 border-b">
                      {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}
                    </div>
                    {filteredProjects.map(p => (
                      <button
                        key={p.id}
                        onClick={() => handleProjectSelect(p)}
                        className={`w-full border-b border-gray-50 px-3 py-2 text-left hover:bg-blue-50 last:border-0 ${
                          selectedProject?.id === p.id ? 'bg-blue-50' : ''
                        }`}
                      >
                        <span className="text-sm font-medium text-gray-900">{p.name}</span>
                        <span className="ml-2 text-xs text-gray-400">{p.nodeCount}n / {p.edgeCount}e</span>
                      </button>
                    ))}
                    {filteredProjects.length === 0 && (
                      <div className="px-3 py-3 text-sm text-gray-400">No projects found</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Graph Type */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Graph Type</label>
              <select
                value={graphType}
                onChange={(e) => setGraphType(e.target.value as GraphType)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                {Object.entries(GRAPH_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {/* Depth */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Depth</label>
              <select
                value={graphDepth}
                onChange={(e) => setGraphDepth(parseInt(e.target.value, 10))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                {[1, 2, 3, 4, 5].map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Edge Filter */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Edges</label>
              <select
                value={edgeTypeFilter}
                onChange={(e) => setEdgeTypeFilter(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="all">All</option>
                <option value="calls">Calls</option>
                <option value="contains">Contains</option>
              </select>
            </div>
          </div>

          {/* Controls Row 2: Node Selector (hidden for project graph type) */}
          {graphType !== 'project' && (
            <div className="flex gap-3">
              {/* Node Type Filter */}
              <div>
                <select
                  value={nodeTypeFilter}
                  onChange={(e) => setNodeTypeFilter(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="all">All types</option>
                  <option value="function">Functions</option>
                  <option value="defcomp">Defcomps</option>
                  <option value="variable">Variables</option>
                </select>
              </div>

              {/* Node Search */}
              <div className="relative flex-1" data-dropdown="node">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={nodeSearch}
                  onChange={(e) => { setNodeSearch(e.target.value); setShowNodeDropdown(true); }}
                  onFocus={() => setShowNodeDropdown(true)}
                  placeholder={selectedProject ? "Search functions..." : "Select a project first..."}
                  disabled={!selectedProject}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-8 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                />
                {focalNodeId && (
                  <button
                    onClick={() => { setFocalNodeId(null); setNodeSearch(''); setSelectedNodeId(null); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {showNodeDropdown && selectedProject && (
                  <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-64 overflow-y-auto">
                    {nodesLoading ? (
                      <div className="flex items-center gap-2 px-4 py-3 text-sm text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading nodes...
                      </div>
                    ) : (
                      <>
                        <div className="sticky top-0 bg-gray-50 px-3 py-1.5 text-xs text-gray-500 border-b">
                          {filteredNodes.length} node{filteredNodes.length !== 1 ? 's' : ''}
                          {projectNodes && filteredNodes.length < projectNodes.length ? ` of ${projectNodes.length}` : ''}
                        </div>
                        {filteredNodes.map(node => (
                          <button
                            key={node.id}
                            onClick={() => handleNodeSelect(node)}
                            className={`w-full border-b border-gray-50 px-3 py-2 text-left hover:bg-blue-50 last:border-0 ${
                              focalNodeId === node.id ? 'bg-blue-50' : ''
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block rounded px-1.5 py-0.5 text-xs font-medium"
                                style={{
                                  backgroundColor: (NODE_COLORS[node.nodeType] || NODE_COLORS.default) + '20',
                                  color: NODE_COLORS[node.nodeType] || NODE_COLORS.default,
                                }}
                              >
                                {node.nodeType}
                              </span>
                              <span className="font-mono text-sm font-medium text-gray-900">{node.name}</span>
                            </div>
                            <p className="mt-0.5 text-xs text-gray-400 font-mono">{node.filePath.split('/').pop()}:{node.lineStart}</p>
                          </button>
                        ))}
                        {filteredNodes.length === 0 && (
                          <div className="px-3 py-3 text-sm text-gray-400">No nodes found</div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Export buttons */}
              {vizData && (
                <div className="flex gap-1 items-end">
                  <button
                    onClick={() => handleExport('json')}
                    className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Download className="h-3 w-3" /> JSON
                  </button>
                  <button
                    onClick={() => handleExport('dot')}
                    className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Download className="h-3 w-3" /> DOT
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Impact Analysis Bar */}
          {impactData && selectedNodeId && (
            <div className="rounded-lg bg-amber-50 px-4 py-3">
              <div className="flex items-center gap-2 text-sm">
                <Target className="h-4 w-4 text-amber-600" />
                <span className="font-medium text-amber-800">Impact Analysis:</span>
                <span className="text-amber-700">
                  {impactData.directCallers} direct callers, {impactData.transitiveCallers} transitive callers
                </span>
                <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  Score: {typeof impactData.impactScore === 'number' ? impactData.impactScore.toFixed(2) : impactData.impactScore}
                </span>
              </div>
            </div>
          )}

          {/* Graph Visualization */}
          <div className="relative rounded-xl bg-white shadow-sm overflow-hidden" style={{ height: '600px' }}>
            {!vizEnabled ? (
              <div className="flex h-full flex-col items-center justify-center text-gray-400">
                <GitBranch className="mb-4 h-12 w-12" />
                {!selectedProject ? (
                  <>
                    <p className="text-lg font-medium">Select a project to begin</p>
                    <p className="mt-1 text-sm">Choose a project from the dropdown above</p>
                  </>
                ) : graphType === 'project' ? (
                  <>
                    <p className="text-lg font-medium">Ready to visualize project graph</p>
                    <p className="mt-1 text-sm">Click above to load the full project graph for {selectedProject.name}</p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-medium">Select a function to visualize</p>
                    <p className="mt-1 text-sm">Search for a function in {selectedProject.name}</p>
                  </>
                )}
              </div>
            ) : vizLoading ? (
              <div className="flex h-full items-center justify-center">
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading graph...
                </div>
              </div>
            ) : vizError ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <p className="font-medium text-red-600">Failed to load graph</p>
                  <p className="mt-1 text-sm text-red-500">{vizError instanceof Error ? vizError.message : 'Unknown error'}</p>
                </div>
              </div>
            ) : vizData ? (
              <>
                <GraphCanvas
                  data={vizData}
                  selectedNodeId={selectedNodeId}
                  onNodeClick={handleNodeClick}
                  edgeTypeFilter={edgeTypeFilter}
                />
                {/* Legend */}
                <div className="absolute bottom-4 left-4 flex gap-4 rounded-lg bg-white/90 px-3 py-2 text-xs shadow-sm">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: NODE_COLORS.function }} />
                    function
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: NODE_COLORS.defcomp }} />
                    defcomp
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: NODE_COLORS.variable }} />
                    variable
                  </span>
                </div>
                {/* Node count */}
                <div className="absolute bottom-4 right-4 rounded-lg bg-white/90 px-3 py-2 text-xs text-gray-500 shadow-sm">
                  {vizData.metadata.nodeCount} nodes, {vizData.metadata.edgeCount} edges
                </div>
                {/* Node details panel */}
                {selectedNodeId && (
                  <NodeDetailsPanel
                    nodeId={selectedNodeId}
                    onClose={() => setSelectedNodeId(null)}
                    onNavigate={handleNavigate}
                  />
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
