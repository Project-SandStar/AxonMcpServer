'use client';

import { useState, useEffect, useMemo } from 'react';
import { Workflow as WorkflowIcon, RefreshCw, Sparkles, AlertCircle, CheckCircle, Pencil, Save, X, Eye, Code } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '@/lib/api';

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?/;

function splitFrontmatter(raw: string): { meta: string; body: string } {
  const m = raw.match(FRONTMATTER_RE);
  if (!m) return { meta: '', body: raw };
  return { meta: m[1].trim(), body: raw.slice(m[0].length).trimStart() };
}

type WorkflowSummary = {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  uri: string;
  summary: string;
  mode: 'local' | 'claude';
  generatedAt: string;
  sourceMtime: number;
  model?: string;
};

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [claudeAvailable, setClaudeAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkRegenerating, setBulkRegenerating] = useState(false);
  const [reindexing, setReindexing] = useState(false);

  // Editor modal state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [editorOriginal, setEditorOriginal] = useState('');
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorView, setEditorView] = useState<'split' | 'edit' | 'preview'>('split');

  const flash = (msg: string, isErr = false) => {
    if (isErr) { setError(msg); setSuccess(null); }
    else { setSuccess(msg); setError(null); }
    setTimeout(() => { setError(null); setSuccess(null); }, 4000);
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await api.listWorkflows();
      setWorkflows(data.workflows);
      setClaudeAvailable(data.claudeAvailable);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load workflows');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const regenerateOne = async (id: string, provider: 'local' | 'claude') => {
    setBusyId(id);
    try {
      await api.summarizeWorkflow(id, provider);
      await refresh();
      flash(`Regenerated (${provider}) summary for ${id}`);
    } catch (e: any) {
      flash(e?.message ?? 'Regenerate failed', true);
    } finally {
      setBusyId(null);
    }
  };

  const regenerateAll = async () => {
    setBulkRegenerating(true);
    try {
      const r = await api.regenerateAllWorkflows();
      await refresh();
      flash(`Regenerated ${r.regenerated} local summary(ies)`);
    } catch (e: any) {
      flash(e?.message ?? 'Bulk regenerate failed', true);
    } finally {
      setBulkRegenerating(false);
    }
  };

  const reindex = async () => {
    setReindexing(true);
    try {
      const r = await api.reindexWorkflows();
      flash(`Reindexed ${r.embedded} workflow(s) in ${r.durationMs}ms`);
    } catch (e: any) {
      flash(e?.message ?? 'Reindex failed', true);
    } finally {
      setReindexing(false);
    }
  };

  const openEditor = async (id: string) => {
    setEditingId(id);
    setEditorContent('');
    setEditorOriginal('');
    setEditorLoading(true);
    try {
      const r = await api.getWorkflow(id);
      setEditorContent(r.fullContent);
      setEditorOriginal(r.fullContent);
    } catch (e: any) {
      flash(e?.message ?? 'Failed to load workflow', true);
      setEditingId(null);
    } finally {
      setEditorLoading(false);
    }
  };

  const closeEditor = () => {
    if (editorContent !== editorOriginal && !confirm('Discard unsaved changes?')) return;
    setEditingId(null);
    setEditorContent('');
    setEditorOriginal('');
  };

  const saveEditor = async () => {
    if (!editingId) return;
    setEditorSaving(true);
    try {
      await api.saveWorkflow(editingId, editorContent);
      setEditorOriginal(editorContent);
      await refresh();
      flash(`Saved ${editingId}.md`);
      setEditingId(null);
    } catch (e: any) {
      flash(e?.message ?? 'Save failed', true);
    } finally {
      setEditorSaving(false);
    }
  };

  const dirty = editorContent !== editorOriginal;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <WorkflowIcon className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
            <p className="text-gray-500">{workflows.length} loaded · click a row to edit the markdown</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            onClick={regenerateAll}
            disabled={bulkRegenerating}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${bulkRegenerating ? 'animate-spin' : ''}`} /> Regenerate all (local)
          </button>
          <button
            onClick={reindex}
            disabled={reindexing}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            <Sparkles className={`h-4 w-4 ${reindexing ? 'animate-pulse' : ''}`} /> Reindex semantic search
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-800">
          <AlertCircle className="h-5 w-5" /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-green-800">
          <CheckCircle className="h-5 w-5" /> {success}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Title</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Category</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Tags</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Mode</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Generated</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {workflows.map(w => (
              <tr
                key={w.id}
                onClick={() => openEditor(w.id)}
                className="cursor-pointer hover:bg-blue-50/50"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Pencil className="h-3.5 w-3.5 text-gray-400" />
                    <div>
                      <div className="font-medium text-gray-900">{w.title}</div>
                      <div className="text-xs text-gray-500 font-mono">{w.id}</div>
                      <div className="mt-1 text-xs text-gray-600 line-clamp-2 max-w-xl">{w.summary}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">{w.category}</span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600 max-w-xs">
                  {w.tags.slice(0, 4).join(', ')}{w.tags.length > 4 ? '…' : ''}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    w.mode === 'claude' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {w.mode}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {new Date(w.generatedAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => regenerateOne(w.id, 'claude')}
                    disabled={busyId === w.id || !claudeAvailable}
                    title={!claudeAvailable ? 'Set the Anthropic API key in Settings → API Keys to enable.' : 'Regenerate this workflow’s summary using Claude.'}
                    className="inline-flex items-center gap-1 rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:bg-gray-300"
                  >
                    <Sparkles className="h-3 w-3" /> Summarize with Claude
                  </button>
                </td>
              </tr>
            ))}
            {workflows.length === 0 && !loading && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-500">No workflows found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex h-[90vh] w-full max-w-6xl flex-col rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div className="flex items-center gap-3">
                <Pencil className="h-5 w-5 text-blue-600" />
                <div>
                  <div className="font-semibold text-gray-900">{editingId}.md</div>
                  {dirty && <div className="text-xs text-amber-600">unsaved changes</div>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-md border border-gray-300 overflow-hidden">
                  <button
                    onClick={() => setEditorView('edit')}
                    className={`px-3 py-1.5 text-xs flex items-center gap-1 ${editorView === 'edit' ? 'bg-gray-100 text-gray-900' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  ><Code className="h-3 w-3" /> Edit</button>
                  <button
                    onClick={() => setEditorView('split')}
                    className={`px-3 py-1.5 text-xs ${editorView === 'split' ? 'bg-gray-100 text-gray-900' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >Split</button>
                  <button
                    onClick={() => setEditorView('preview')}
                    className={`px-3 py-1.5 text-xs flex items-center gap-1 ${editorView === 'preview' ? 'bg-gray-100 text-gray-900' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  ><Eye className="h-3 w-3" /> Preview</button>
                </div>
                <button
                  onClick={saveEditor}
                  disabled={editorSaving || !dirty}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300"
                >
                  <Save className="h-4 w-4" /> {editorSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={closeEditor}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <X className="h-4 w-4" /> Close
                </button>
              </div>
            </div>

            {editorLoading ? (
              <div className="flex flex-1 items-center justify-center text-gray-500">
                <RefreshCw className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="flex flex-1 overflow-hidden">
                {(editorView === 'edit' || editorView === 'split') && (
                  <textarea
                    value={editorContent}
                    onChange={e => setEditorContent(e.target.value)}
                    spellCheck={false}
                    className={`${editorView === 'split' ? 'w-1/2 border-r border-gray-200' : 'w-full'} h-full resize-none bg-gray-50 p-4 font-mono text-sm text-gray-900 focus:outline-none`}
                  />
                )}
                {(editorView === 'preview' || editorView === 'split') && (() => {
                  const { meta, body } = splitFrontmatter(editorContent);
                  return (
                    <div className={`${editorView === 'split' ? 'w-1/2' : 'w-full'} h-full overflow-auto bg-white p-6`}>
                      {meta && (
                        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Frontmatter</div>
                          <pre className="font-mono text-xs text-gray-800 whitespace-pre-wrap m-0">{meta}</pre>
                        </div>
                      )}
                      <article className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-code:text-pink-600 prose-pre:bg-gray-900 prose-pre:text-gray-100">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
                      </article>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
