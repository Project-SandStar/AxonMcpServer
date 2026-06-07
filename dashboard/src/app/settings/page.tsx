'use client';

import { useState, useEffect } from 'react';
import ApiKeysPanel from '@/components/ApiKeysPanel';
import {
  Save, RefreshCw, Globe, FolderOpen, Server, Database,
  Search, HardDrive, Trash2, RotateCcw, Brain, Zap,
  Download, CheckCircle, Loader2, X, AlertTriangle,
} from 'lucide-react';
import { api, getApiBase, DatabaseInfo, ConfigSettings, SemanticSearchConfig, ModelStatus } from '@/lib/api';

const API_BASE = getApiBase();

// ─── Types ──────────────────────────────────────────────────────────────────

type SettingsGroup =
  | 'server'
  | 'paths'
  | 'skyspark'
  | 'cache'
  | 'search'
  | 'semantic'
  | 'apikeys'
  | 'database';

const GROUPS: { id: SettingsGroup; label: string; icon: string }[] = [
  { id: 'server',   label: 'Server',          icon: '🌐' },
  { id: 'paths',    label: 'Paths',           icon: '📁' },
  { id: 'skyspark', label: 'SkySpark Sync',   icon: '🔄' },
  { id: 'cache',    label: 'Cache',           icon: '💾' },
  { id: 'search',   label: 'Search',          icon: '🔍' },
  { id: 'semantic', label: 'Semantic Search', icon: '🧠' },
  { id: 'apikeys',  label: 'API Keys',        icon: '🔑' },
  { id: 'database', label: 'Database',        icon: '🗄️' },
];

// ─── Contextual Documentation ───────────────────────────────────────────────

const DOCS: Record<SettingsGroup, { title: string; content: React.ReactNode }> = {
  server: {
    title: 'Server Configuration',
    content: (
      <div className="space-y-3 text-sm text-gray-600">
        <p>Controls the HTTP server that hosts both the MCP endpoint and the admin dashboard.</p>
        <div className="bg-gray-50 p-3 rounded-md space-y-1">
          <p className="font-medium text-gray-700">Port</p>
          <p>The TCP port the server listens on. Default is <code className="bg-gray-100 px-1 rounded text-xs">3847</code>.</p>
          <p className="text-xs text-amber-600">Changing the port requires a server restart.</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-md space-y-1">
          <p className="font-medium text-gray-700">Endpoints</p>
          <ul className="text-xs space-y-0.5 list-disc list-inside">
            <li><code className="bg-gray-100 px-1 rounded">/mcp</code> - MCP protocol endpoint</li>
            <li><code className="bg-gray-100 px-1 rounded">/dashboard</code> - Admin UI</li>
            <li><code className="bg-gray-100 px-1 rounded">/admin</code> - REST API</li>
            <li><code className="bg-gray-100 px-1 rounded">/authorize</code> - OAuth flow</li>
          </ul>
        </div>
      </div>
    ),
  },
  paths: {
    title: 'File System Paths',
    content: (
      <div className="space-y-3 text-sm text-gray-600">
        <p>Directories the server scans for Axon code and documentation files.</p>
        <div className="bg-gray-50 p-3 rounded-md space-y-1">
          <p className="font-medium text-gray-700">Code Path</p>
          <p>Directory containing <code className="bg-gray-100 px-1 rounded text-xs">.axon</code> and <code className="bg-gray-100 px-1 rounded text-xs">.trio</code> files. These are parsed and indexed for search, code examples, and pattern matching.</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-md space-y-1">
          <p className="font-medium text-gray-700">Docs Path</p>
          <p>Directory containing HTML documentation (e.g. SkySpark docHaxall). Indexed using FlexSearch with Algolia-like relevance scoring.</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-md space-y-1">
          <p className="font-medium text-gray-700">SkySpark Home</p>
          <p>Root installation directory of SkySpark. Used for discovering config files and connecting to instances.</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 p-2 rounded-md text-xs text-blue-700">
          Changes to paths trigger a full re-index on save. First index build may take 30-60 seconds.
        </div>
      </div>
    ),
  },
  skyspark: {
    title: 'SkySpark Synchronization',
    content: (
      <div className="space-y-3 text-sm text-gray-600">
        <p>Controls how the server discovers and syncs function source code from SkySpark instances.</p>
        <div className="bg-gray-50 p-3 rounded-md space-y-1">
          <p className="font-medium text-gray-700">Auto Discover</p>
          <p>On startup, automatically detect all projects in configured SkySpark instances.</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-md space-y-1">
          <p className="font-medium text-gray-700">Auto Sync Functions</p>
          <p>Download function source code from discovered projects. Synced functions are stored in <code className="bg-gray-100 px-1 rounded text-xs">proj/</code> organized by instance/project.</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-md space-y-1">
          <p className="font-medium text-gray-700">Concurrency</p>
          <p>Number of parallel API calls during sync. Higher values sync faster but increase load on SkySpark.</p>
          <ul className="text-xs space-y-0.5 mt-1">
            <li>1-3: Conservative (production servers)</li>
            <li>5-10: Balanced (default)</li>
            <li>15-20: Aggressive (local dev)</li>
          </ul>
        </div>
        <div className="bg-gray-50 p-3 rounded-md space-y-1">
          <p className="font-medium text-gray-700">Function Versioning</p>
          <p>Keep backup copies when functions change. Managed by <code className="bg-gray-100 px-1 rounded text-xs">BackupManager</code>.</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-md space-y-1">
          <p className="font-medium text-gray-700">Fallback Connection</p>
          <p>Used when no JSON config files exist in <code className="bg-gray-100 px-1 rounded text-xs">config/</code>. Connects to a single SkySpark instance with these credentials.</p>
        </div>
      </div>
    ),
  },
  cache: {
    title: 'Cache Settings',
    content: (
      <div className="space-y-3 text-sm text-gray-600">
        <p>Controls caching of parsed indexes and search results for faster subsequent access.</p>
        <div className="bg-gray-50 p-3 rounded-md space-y-1">
          <p className="font-medium text-gray-700">Cached Files</p>
          <ul className="text-xs space-y-0.5 list-disc list-inside">
            <li><code className="bg-gray-100 px-1 rounded">axon-index.json</code> - Parsed Axon functions</li>
            <li><code className="bg-gray-100 px-1 rounded">flexsearch-docs.json</code> - FlexSearch doc index</li>
            <li><code className="bg-gray-100 px-1 rounded">function-usage.json</code> - Function call graph</li>
          </ul>
        </div>
        <div className="bg-gray-50 p-3 rounded-md space-y-1">
          <p className="font-medium text-gray-700">Max Age</p>
          <p>Time in milliseconds before a cache entry expires. Default is 24 hours (86,400,000 ms).</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-md space-y-1">
          <p className="font-medium text-gray-700">Directory</p>
          <p>Where cache files are stored. Relative to project root. Default: <code className="bg-gray-100 px-1 rounded text-xs">.cache</code></p>
        </div>
      </div>
    ),
  },
  search: {
    title: 'Keyword Search',
    content: (
      <div className="space-y-3 text-sm text-gray-600">
        <p>Settings for the token-based keyword search engine used by <code className="bg-gray-100 px-1 rounded text-xs">searchAxonExamples</code> and related tools.</p>
        <div className="bg-gray-50 p-3 rounded-md space-y-1">
          <p className="font-medium text-gray-700">Min Token Length</p>
          <p>Minimum characters a search token must have to be indexed. Shorter tokens create more noise.</p>
          <ul className="text-xs space-y-0.5 mt-1">
            <li>1: Very granular (includes single chars)</li>
            <li>2: Balanced (default, catches &quot;if&quot;, &quot;do&quot;)</li>
            <li>3-5: Stricter (fewer matches)</li>
          </ul>
        </div>
        <div className="bg-gray-50 p-3 rounded-md space-y-1">
          <p className="font-medium text-gray-700">Max Results</p>
          <p>Maximum number of results returned per search query. Applies to all MCP search tools.</p>
        </div>
      </div>
    ),
  },
  semantic: {
    title: 'Semantic AI Search',
    content: (
      <div className="space-y-3 text-sm text-gray-600">
        <p>Vector-based semantic search using local embedding models and LanceDB for approximate nearest neighbor (ANN) queries.</p>
        <div className="bg-gray-50 p-3 rounded-md space-y-1">
          <p className="font-medium text-gray-700">How It Works</p>
          <p>Code and docs are converted into vector embeddings. Searches find semantically similar content even without exact keyword matches.</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-md space-y-1">
          <p className="font-medium text-gray-700">Code Model</p>
          <p><code className="bg-gray-100 px-1 rounded text-xs">all-MiniLM-L6-v2</code> (384 dimensions) - Fast, good for code signatures and function names.</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-md space-y-1">
          <p className="font-medium text-gray-700">Docs Model</p>
          <p><code className="bg-gray-100 px-1 rounded text-xs">jina-embeddings-v2-base-en</code> (768 dimensions) - Better for natural language documentation.</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-md space-y-1">
          <p className="font-medium text-gray-700">Graph Weight</p>
          <p>Balance between vector similarity and code graph relevance in combined ranking.</p>
          <ul className="text-xs space-y-0.5 mt-1">
            <li>0.0 — Pure vector similarity</li>
            <li>0.3 — Default (slight graph boost)</li>
            <li>0.5 — Equal weight</li>
            <li>1.0 — Pure graph relevance</li>
          </ul>
        </div>
        <div className="bg-gray-50 p-3 rounded-md space-y-1">
          <p className="font-medium text-gray-700">Min Score</p>
          <p>Similarity threshold for filtering results.</p>
          <ul className="text-xs space-y-0.5 mt-1">
            <li>0.3 — Very permissive</li>
            <li>0.5 — Balanced (default)</li>
            <li>0.7 — Strict</li>
            <li>0.9 — Near-exact only</li>
          </ul>
        </div>
        <div className="bg-blue-50 border border-blue-200 p-2 rounded-md text-xs text-blue-700">
          Models are downloaded on first use (~80MB total). Stored in <code className="bg-blue-100 px-1 rounded">.cache/models/</code>.
        </div>
      </div>
    ),
  },
  database: {
    title: 'Usage Database',
    content: (
      <div className="space-y-3 text-sm text-gray-600">
        <p>SQLite database managed by Prisma for tracking tool usage, search analytics, and session data.</p>
        <div className="bg-gray-50 p-3 rounded-md space-y-1">
          <p className="font-medium text-gray-700">What&apos;s Tracked</p>
          <ul className="text-xs space-y-0.5 list-disc list-inside">
            <li>Tool invocations (which tools, when, duration)</li>
            <li>Search queries (popular terms, zero-result queries)</li>
            <li>Session events (connections, disconnections)</li>
            <li>Daily aggregated statistics</li>
          </ul>
        </div>
        <div className="bg-gray-50 p-3 rounded-md space-y-1">
          <p className="font-medium text-gray-700">Clear All Data</p>
          <p>Removes all records but keeps the database file and schema intact.</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 p-2 rounded-md text-xs text-amber-700">
          <strong>Delete &amp; Reset</strong> drops the entire database file and recreates it. This is irreversible.
        </div>
      </div>
    ),
  },
  apikeys: {
    title: 'API Keys',
    content: (
      <div className="space-y-3 text-sm text-gray-600">
        <p>Provider credentials needed by features that call external services (e.g. <strong>Summarize with Claude</strong> on the Workflows page).</p>
        <div className="bg-gray-50 p-3 rounded-md space-y-1">
          <p className="font-medium text-gray-700">Anthropic API key</p>
          <p>Used by the workflow AI summarizer. Stored encrypted at rest with AES-256-GCM. A DB value overrides the <code className="bg-gray-100 px-1 rounded text-xs">ANTHROPIC_API_KEY</code> env var.</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 p-2 rounded-md text-xs text-blue-700">
          The standalone <a href="/api-keys" className="underline">API Keys</a> page offers the same controls.
        </div>
      </div>
    ),
  },
};

// ─── Styling Constants ──────────────────────────────────────────────────────

const inputClass = 'w-full rounded-md border border-gray-300 py-2 px-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const helpClass = 'mt-1 text-xs text-gray-500';

// ─── Default Semantic Config ────────────────────────────────────────────────

const DEFAULT_SEMANTIC: SemanticSearchConfig = {
  enabled: false,
  codeModel: 'Xenova/all-MiniLM-L6-v2',
  codeDimensions: 384,
  docsModel: 'Xenova/jina-embeddings-v2-base-en',
  docsDimensions: 768,
  embeddingThreads: 2,
  embeddingBatchSize: 16,
  graphWeight: 0.3,
  minScore: 0.5,
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeGroup, setActiveGroup] = useState<SettingsGroup>('server');
  const [config, setConfig] = useState<ConfigSettings | null>(null);
  const [semantic, setSemantic] = useState<SemanticSearchConfig>(DEFAULT_SEMANTIC);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbAction, setDbAction] = useState<'clearing' | 'resetting' | null>(null);
  const [models, setModels] = useState<ModelStatus[]>([]);
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);

  // ─── Fetch ──────────────────────────────────────────────────────────

  const fetchAll = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [cfg, sem, modelData] = await Promise.all([
        api.getSettings(),
        api.getSemanticSearchConfig().catch(() => DEFAULT_SEMANTIC),
        api.getModels().catch(() => ({ models: [], knownModels: [] })),
      ]);
      setConfig(cfg);
      setSemantic({ ...DEFAULT_SEMANTIC, ...sem });
      setModels(modelData.models);
      setHasChanges(false);
    } catch (err) {
      setError(`Failed to load settings: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDbInfo = async () => {
    setDbLoading(true);
    try {
      setDbInfo(await api.getDatabaseInfo());
    } catch { /* ignore */ }
    finally { setDbLoading(false); }
  };

  useEffect(() => { fetchAll(); fetchDbInfo(); }, []);

  // ─── Save ───────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!config) return;
    setIsSaving(true);
    setError(null);
    try {
      await Promise.all([
        api.updateSettings(config),
        api.updateSemanticSearchConfig(semantic),
      ]);
      setSuccessMessage('Settings saved and reloaded');
      setHasChanges(false);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(`Failed to save: ${err}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Updaters ───────────────────────────────────────────────────────

  const u = <T extends object, K extends keyof T>(obj: T, set: (v: T) => void, key: K, val: T[K]) => {
    set({ ...obj, [key]: val } as T);
    setHasChanges(true);
  };

  const updateConfig = <K extends keyof ConfigSettings>(k: K, v: ConfigSettings[K]) => {
    if (config) u(config, setConfig, k, v);
  };

  const updateSkyspark = (k: string, v: unknown) => {
    if (!config) return;
    setConfig({ ...config, skyspark: { ...config.skyspark, [k]: v } });
    setHasChanges(true);
  };

  const updateFallback = (k: string, v: unknown) => {
    if (!config) return;
    setConfig({ ...config, skyspark: { ...config.skyspark, fallback: { ...config.skyspark.fallback, [k]: v } } });
    setHasChanges(true);
  };

  const updateCache = (k: string, v: unknown) => {
    if (!config) return;
    setConfig({ ...config, cache: { ...config.cache, [k]: v } });
    setHasChanges(true);
  };

  const updateSearch = (k: string, v: unknown) => {
    if (!config) return;
    setConfig({ ...config, search: { ...config.search, [k]: v } });
    setHasChanges(true);
  };

  const updateServer = (k: string, v: unknown) => {
    if (!config) return;
    setConfig({ ...config, server: { ...(config.server || { port: 3847 }), [k]: v } });
    setHasChanges(true);
  };

  const updateSemantic = (k: keyof SemanticSearchConfig, v: unknown) => {
    setSemantic(prev => ({ ...prev, [k]: v }));
    setHasChanges(true);
  };

  // ─── Model Actions ─────────────────────────────────────────────────

  const handleDownloadModel = async (modelId: string) => {
    setDownloadingModel(modelId);
    try {
      await api.downloadModel(modelId);
      // Refresh model statuses
      const modelData = await api.getModels().catch(() => ({ models: [], knownModels: [] }));
      setModels(modelData.models);
      setSuccessMessage(`Model ${modelId.split('/').pop()} downloaded`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(`Download failed: ${err}`);
    } finally {
      setDownloadingModel(null);
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    if (!confirm(`Delete model ${modelId.split('/').pop()}? You can re-download it later.`)) return;
    try {
      await api.deleteModel(modelId);
      const modelData = await api.getModels().catch(() => ({ models: [], knownModels: [] }));
      setModels(modelData.models);
      setSuccessMessage(`Model ${modelId.split('/').pop()} deleted`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(`Delete failed: ${err}`);
    }
  };

  // ─── DB Actions ─────────────────────────────────────────────────────

  const handleClearData = async () => {
    if (!confirm('Clear all usage data? This cannot be undone.')) return;
    setDbAction('clearing');
    try {
      await api.clearUsageData();
      setSuccessMessage('Usage data cleared');
      setTimeout(() => setSuccessMessage(null), 3000);
      await fetchDbInfo();
    } catch (err) { setError(`Failed: ${err}`); }
    finally { setDbAction(null); }
  };

  const handleResetDatabase = async () => {
    if (!confirm('Delete and recreate the database? All usage history will be lost.')) return;
    setDbAction('resetting');
    try {
      await api.resetDatabase();
      setSuccessMessage('Database reset');
      setTimeout(() => setSuccessMessage(null), 3000);
      await fetchDbInfo();
    } catch (err) { setError(`Failed: ${err}`); }
    finally { setDbAction(null); }
  };

  const formatBytes = (b: number) => {
    if (b === 0) return '0 B';
    const k = 1024, s = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + s[i];
  };

  // ─── Toggle ─────────────────────────────────────────────────────────

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only peer" />
      <div className="w-11 h-6 bg-gray-300 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
    </label>
  );

  // ─── Section Renderers ──────────────────────────────────────────────

  const renderServer = () => config && (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Server Configuration</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelClass}>HTTP Port</label>
          <input type="number" value={config.server?.port || 3847} onChange={e => updateServer('port', parseInt(e.target.value) || 3847)} min="1024" max="65535" className={inputClass} />
          <p className={helpClass}>Requires restart after change</p>
        </div>
        <div className="flex items-center p-3 rounded-lg bg-gray-50">
          <div>
            <p className="text-sm font-medium text-gray-900">Current URL</p>
            <p className="text-sm text-blue-600 font-mono">{typeof window !== 'undefined' ? window.location.origin : `http://localhost:${config.server?.port || 3847}`}</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderPaths = () => config && (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">File System Paths</h3>
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Code Path</label>
          <input type="text" value={config.codePath} onChange={e => updateConfig('codePath', e.target.value)} className={`${inputClass} font-mono text-xs`} />
          <p className={helpClass}>Directory with .axon and .trio files</p>
        </div>
        <div>
          <label className={labelClass}>Docs Path</label>
          <input type="text" value={config.docsPath} onChange={e => updateConfig('docsPath', e.target.value)} className={`${inputClass} font-mono text-xs`} />
          <p className={helpClass}>Directory with HTML documentation</p>
        </div>
        <div>
          <label className={labelClass}>SkySpark Home</label>
          <input type="text" value={config.skyspark.home} onChange={e => updateSkyspark('home', e.target.value)} className={`${inputClass} font-mono text-xs`} />
          <p className={helpClass}>SkySpark installation directory</p>
        </div>
      </div>
    </div>
  );

  const renderSkyspark = () => config && (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">SkySpark Sync</h3>
      {/* Toggles */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
          <div><p className="font-medium text-gray-900">Auto Discover</p><p className="text-xs text-gray-500">Discover projects on startup</p></div>
          <Toggle checked={config.skyspark.autoDiscover} onChange={v => updateSkyspark('autoDiscover', v)} />
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
          <div><p className="font-medium text-gray-900">Auto Sync Functions</p><p className="text-xs text-gray-500">Download source code</p></div>
          <Toggle checked={config.skyspark.autoSyncFunctions} onChange={v => updateSkyspark('autoSyncFunctions', v)} />
        </div>
      </div>
      {/* Numbers */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelClass}>Sync Concurrency</label>
          <input type="number" value={config.skyspark.syncConcurrency} onChange={e => updateSkyspark('syncConcurrency', parseInt(e.target.value) || 10)} min="1" max="20" className={inputClass} />
          <p className={helpClass}>Parallel downloads (1-20)</p>
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
          <div><p className="font-medium text-gray-900">Function Versioning</p><p className="text-xs text-gray-500">Keep backup copies</p></div>
          <Toggle checked={config.skyspark.functionVersioning} onChange={v => updateSkyspark('functionVersioning', v)} />
        </div>
      </div>
      {config.skyspark.functionVersioning && (
        <div className="w-1/2">
          <label className={labelClass}>Max Versions</label>
          <input type="number" value={config.skyspark.maxVersions} onChange={e => updateSkyspark('maxVersions', parseInt(e.target.value) || 4)} min="1" max="10" className={inputClass} />
          <p className={helpClass}>Versions to keep per function</p>
        </div>
      )}
      {/* Fallback */}
      <div className="border-t pt-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Fallback Connection</h4>
        <p className="text-xs text-gray-500 mb-3">Used only if no config JSON files found</p>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className={labelClass}>Host</label>
            <input type="text" value={config.skyspark.fallback.host} onChange={e => updateFallback('host', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Port</label>
            <input type="number" value={config.skyspark.fallback.port} onChange={e => updateFallback('port', parseInt(e.target.value) || 8080)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Protocol</label>
            <select value={config.skyspark.fallback.protocol} onChange={e => updateFallback('protocol', e.target.value)} className={inputClass}>
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Project</label>
            <input type="text" value={config.skyspark.fallback.project} onChange={e => updateFallback('project', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Username</label>
            <input type="text" value={config.skyspark.fallback.username} onChange={e => updateFallback('username', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Password</label>
            <input type="password" value={config.skyspark.fallback.password} onChange={e => updateFallback('password', e.target.value)} className={inputClass} />
          </div>
        </div>
      </div>
    </div>
  );

  const renderCache = () => config && (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Cache</h3>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
          <div><p className="font-medium text-gray-900">Enabled</p><p className="text-xs text-gray-500">Enable file caching</p></div>
          <Toggle checked={config.cache.enabled} onChange={v => updateCache('enabled', v)} />
        </div>
        <div>
          <label className={labelClass}>Max Age (hours)</label>
          <input type="number" value={Math.round(config.cache.maxAge / 3600000)} onChange={e => updateCache('maxAge', (parseInt(e.target.value) || 24) * 3600000)} min="1" max="720" className={inputClass} />
          <p className={helpClass}>{(config.cache.maxAge / 3600000).toFixed(1)} hours</p>
        </div>
        <div>
          <label className={labelClass}>Directory</label>
          <input type="text" value={config.cache.directory} onChange={e => updateCache('directory', e.target.value)} className={`${inputClass} font-mono text-xs`} />
        </div>
      </div>
    </div>
  );

  const renderSearch = () => config && (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Keyword Search</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelClass}>Min Token Length</label>
          <input type="number" value={config.search.minTokenLength} onChange={e => updateSearch('minTokenLength', parseInt(e.target.value) || 2)} min="1" max="5" className={inputClass} />
          <p className={helpClass}>Minimum characters for indexed tokens</p>
        </div>
        <div>
          <label className={labelClass}>Max Results</label>
          <input type="number" value={config.search.maxResults} onChange={e => updateSearch('maxResults', parseInt(e.target.value) || 10)} min="5" max="100" className={inputClass} />
          <p className={helpClass}>Maximum results per search query</p>
        </div>
      </div>
    </div>
  );

  const ModelCard = ({ category, selectedModel, onSelect, onDimensionsChange }: {
    category: 'code' | 'docs';
    selectedModel: string;
    onSelect: (modelId: string, dimensions: number) => void;
    onDimensionsChange: (dims: number) => void;
  }) => {
    const categoryModels = models.filter(m => m.category === category);
    const selectedStatus = models.find(m => m.modelId === selectedModel);
    const isSelected = (id: string) => id === selectedModel;

    return (
      <div className="space-y-2">
        {categoryModels.length === 0 ? (
          <div className="text-sm text-gray-500 italic p-3 bg-gray-50 rounded-lg">
            Loading model info...
          </div>
        ) : (
          categoryModels.map(model => {
            const isDownloading = downloadingModel === model.modelId;
            const active = isSelected(model.modelId);
            return (
              <div
                key={model.modelId}
                className={`rounded-lg border p-3 transition-colors cursor-pointer ${
                  active
                    ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
                onClick={() => {
                  if (model.dimensions > 0) {
                    onSelect(model.modelId, model.dimensions);
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    {active && <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                    <span className="text-sm font-medium text-gray-900 truncate">{model.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {model.downloaded ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteModel(model.modelId); }}
                          className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                          title="Delete model"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : isDownloading ? (
                      <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDownloadModel(model.modelId); }}
                        className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition-colors"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                  <span>{model.dimensions}d</span>
                  <span>{model.estimatedSize}</span>
                  {model.downloaded && model.sizeOnDisk > 0 && (
                    <span>{formatBytes(model.sizeOnDisk)} on disk</span>
                  )}
                </div>
                {isDownloading && (
                  <div className="mt-2">
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '60%' }} />
                    </div>
                    <p className="text-xs text-blue-600 mt-1">Downloading...</p>
                  </div>
                )}
              </div>
            );
          })
        )}
        {!selectedStatus?.downloaded && selectedStatus && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            <p className="text-xs text-amber-700">Selected model is not downloaded. Download it before building embeddings.</p>
          </div>
        )}
      </div>
    );
  };

  const renderSemantic = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Semantic Search</h3>
      {/* Master toggle */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50">
        <div className="flex items-center gap-3">
          <Brain className="h-5 w-5 text-blue-600" />
          <div>
            <p className="font-medium text-gray-900">Enable Semantic Search</p>
            <p className="text-xs text-gray-500">Vector-based AI search for code and documentation</p>
          </div>
        </div>
        <Toggle checked={semantic.enabled} onChange={v => updateSemantic('enabled', v)} />
      </div>
      {/* Models */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Embedding Models</h4>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Code Embeddings</p>
            <ModelCard
              category="code"
              selectedModel={semantic.codeModel}
              onSelect={(id, dims) => { updateSemantic('codeModel', id); updateSemantic('codeDimensions', dims); }}
              onDimensionsChange={(dims) => updateSemantic('codeDimensions', dims)}
            />
          </div>
          <div className="space-y-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Documentation Embeddings</p>
            <ModelCard
              category="docs"
              selectedModel={semantic.docsModel}
              onSelect={(id, dims) => { updateSemantic('docsModel', id); updateSemantic('docsDimensions', dims); }}
              onDimensionsChange={(dims) => updateSemantic('docsDimensions', dims)}
            />
          </div>
        </div>
      </div>
      {/* Sliders */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-gray-700">Search Tuning</h4>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm text-gray-700">Graph Weight</label>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-sm font-mono text-gray-700">{semantic.graphWeight.toFixed(2)}</span>
          </div>
          <input type="range" min="0" max="1" step="0.05" value={semantic.graphWeight} onChange={e => updateSemantic('graphWeight', parseFloat(e.target.value))} className="w-full accent-blue-600" />
          <div className="flex justify-between text-xs text-gray-400 mt-0.5"><span>0 (text only)</span><span>1 (graph only)</span></div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm text-gray-700">Minimum Score</label>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-sm font-mono text-gray-700">{semantic.minScore.toFixed(2)}</span>
          </div>
          <input type="range" min="0" max="1" step="0.05" value={semantic.minScore} onChange={e => updateSemantic('minScore', parseFloat(e.target.value))} className="w-full accent-blue-600" />
          <div className="flex justify-between text-xs text-gray-400 mt-0.5"><span>0 (show all)</span><span>1 (exact match)</span></div>
        </div>
      </div>
      {/* Performance */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><Zap className="h-4 w-4" /> Performance</h4>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>Embedding Threads</label>
            <input type="number" min="1" max="16" value={semantic.embeddingThreads} onChange={e => updateSemantic('embeddingThreads', parseInt(e.target.value) || 2)} className={inputClass} />
            <p className={helpClass}>Parallel embedding workers</p>
          </div>
          <div>
            <label className={labelClass}>Batch Size</label>
            <input type="number" min="1" max="128" value={semantic.embeddingBatchSize} onChange={e => updateSemantic('embeddingBatchSize', parseInt(e.target.value) || 16)} className={inputClass} />
            <p className={helpClass}>Items per embedding batch</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderDatabase = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Usage Database</h3>
      {dbInfo ? (
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Database Path</label>
            <input type="text" value={dbInfo.path} readOnly className={`${inputClass} bg-gray-50 text-gray-600`} />
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-lg bg-gray-50 p-3 text-center">
              <p className="text-xl font-bold text-gray-900">{formatBytes(dbInfo.sizeBytes)}</p>
              <p className="text-xs text-gray-500">Size</p>
            </div>
            <div className="rounded-lg bg-blue-50 p-3 text-center">
              <p className="text-xl font-bold text-blue-600">{dbInfo.recordCounts.toolEvents.toLocaleString()}</p>
              <p className="text-xs text-gray-500">Tool Events</p>
            </div>
            <div className="rounded-lg bg-green-50 p-3 text-center">
              <p className="text-xl font-bold text-green-600">{dbInfo.recordCounts.searchEvents.toLocaleString()}</p>
              <p className="text-xs text-gray-500">Searches</p>
            </div>
            <div className="rounded-lg bg-purple-50 p-3 text-center">
              <p className="text-xl font-bold text-purple-600">{dbInfo.recordCounts.sessionEvents.toLocaleString()}</p>
              <p className="text-xs text-gray-500">Sessions</p>
            </div>
            <div className="rounded-lg bg-orange-50 p-3 text-center">
              <p className="text-xl font-bold text-orange-600">{dbInfo.recordCounts.dailyStats.toLocaleString()}</p>
              <p className="text-xs text-gray-500">Daily Stats</p>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleClearData} disabled={dbAction !== null} className="flex items-center gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-2 text-sm font-medium text-yellow-700 hover:bg-yellow-100 disabled:opacity-50">
              <Trash2 className="h-4 w-4" />
              {dbAction === 'clearing' ? 'Clearing...' : 'Clear All Data'}
            </button>
            <button onClick={handleResetDatabase} disabled={dbAction !== null} className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50">
              <RotateCcw className="h-4 w-4" />
              {dbAction === 'resetting' ? 'Resetting...' : 'Delete & Reset'}
            </button>
            <button onClick={fetchDbInfo} disabled={dbLoading} className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${dbLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          {dbLoading ? (
            <div className="flex items-center justify-center gap-2">
              <RefreshCw className="h-5 w-5 animate-spin" /> Loading...
            </div>
          ) : 'Failed to load database info'}
        </div>
      )}
    </div>
  );

  const renderApiKeys = () => <ApiKeysPanel />;

  const renderContent = () => {
    switch (activeGroup) {
      case 'server': return renderServer();
      case 'paths': return renderPaths();
      case 'skyspark': return renderSkyspark();
      case 'cache': return renderCache();
      case 'search': return renderSearch();
      case 'semantic': return renderSemantic();
      case 'apikeys': return renderApiKeys();
      case 'database': return renderDatabase();
    }
  };

  // ─── Loading / Error ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // ─── Layout ─────────────────────────────────────────────────────────

  const doc = DOCS[activeGroup];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-500">Manage all server configuration in one place</p>
        </div>
        <button
          onClick={fetchAll}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Reload
        </button>
      </div>

      {/* Toasts */}
      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>}
      {successMessage && <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">{successMessage}</div>}
      {hasChanges && !error && !successMessage && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800">You have unsaved changes</div>
      )}

      {/* 3-pane layout */}
      <div className="flex gap-4">
        {/* Left: Category Nav */}
        <div className="w-48 shrink-0">
          <div className="bg-white rounded-xl shadow-sm p-2 sticky top-4 space-y-1">
            {GROUPS.map(g => (
              <button
                key={g.id}
                onClick={() => setActiveGroup(g.id)}
                className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-left transition-colors ${
                  activeGroup === g.id
                    ? 'bg-blue-50 text-blue-700 border-l-2 border-blue-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="text-base">{g.icon}</span>
                {g.label}
              </button>
            ))}
            {/* Save button */}
            <div className="pt-3 border-t mt-2">
              <button
                onClick={handleSave}
                disabled={isSaving || !hasChanges}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isSaving ? 'Saving...' : 'Save All'}
              </button>
            </div>
          </div>
        </div>

        {/* Middle: Controls */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-xl shadow-sm p-6">
            {renderContent()}
          </div>
        </div>

        {/* Right: Documentation */}
        <div className="w-72 shrink-0 hidden lg:block">
          <div className="bg-white rounded-xl shadow-sm p-5 sticky top-4 max-h-[calc(100vh-8rem)] overflow-y-auto">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{doc.title}</h3>
            {doc.content}
          </div>
        </div>
      </div>
    </div>
  );
}
