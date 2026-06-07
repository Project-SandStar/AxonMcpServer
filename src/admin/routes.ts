/**
 * Admin API routes for the Axon MCP Server dashboard
 */

import { Router, Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { getUsageTracker } from '../usage/index.js';
import { ServerStatus, InstanceInfo, ProjectInfo, CacheInfo, AdminCredentials } from './types.js';
import { initUserStore, getUserStore, UserStore, User } from './userStore.js';
import { AxonOAuthProvider } from '../auth/oauthProvider.js';
import { BackupManager } from './backupManager.js';
import {
  TOOL_METADATA,
  getCoreTools,
  getDeferredTools,
  getToolsByCategory,
  getToolSearchStats,
  searchTools,
  searchToolsByRegex,
  generateMcpToolsetConfig,
  ToolCategory,
} from '../toolSearch/toolSearchConfig.js';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

// Types for injected dependencies
interface PrimaryProjectContext {
  instance: string;
  project: string;
  url?: string;
  setBy: 'vscode' | 'dashboard' | 'api' | 'startup';
  timestamp: string | null;
}

interface AdminContext {
  getServerStatus: () => ServerStatus;
  getInstances: () => InstanceInfo[];
  getInstance: (name: string) => InstanceInfo | undefined;
  getProjects: () => ProjectInfo[];
  getCacheInfo: () => CacheInfo[];
  clearCache: (name?: string) => Promise<void>;
  triggerSync: (instance: string, project: string) => Promise<{ downloaded: number; updated: number; deleted: number }>;
  triggerDiscover: (instance: string) => Promise<{ projects: string[] }>;
  triggerDiscoverWithProgress: (
    instance: string,
    onLog: (entry: { level: 'info' | 'success' | 'error'; step: string; message: string; data?: any }) => void
  ) => Promise<{ projects: string[] }>;
  getLogBuffer: () => string[];
  getPrimaryProject: () => PrimaryProjectContext | null;
  setPrimaryProject: (instance: string, project: string, setBy?: 'vscode' | 'dashboard' | 'api' | 'startup') => Promise<PrimaryProjectContext>;
  configDir: string;
  cacheDir: string;
  reloadConfig?: () => void;
  getOAuthProvider?: () => AxonOAuthProvider | undefined;
  getBackupManager?: () => BackupManager | undefined;
  getPrisma?: () => import('../generated/prisma/index.js').PrismaClient | null;
  searchDocs?: (query: string, options?: { limit?: number; library?: string }) => Promise<any[]>;
  getDocsForEmbedding?: () => Array<{ id: string; title: string; library: string; fullText: string }>;
  getDocsStats?: () => { totalDocuments: number; totalSections: number; libraries: string[] };
  getWorkflowManager?: () => import('../workflows/workflowManager.js').WorkflowManager;
  getWorkflowVectorIndex?: () => import('../workflows/workflowVectorIndex.js').WorkflowVectorIndex | undefined;
}

/**
 * Basic Auth middleware using UserStore
 */
function basicAuthWithUserStore(userStore: UserStore) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Axon MCP Admin"');
      return res.status(401).json({ error: 'Authentication required' });
    }

    const base64 = authHeader.split(' ')[1];
    const [username, password] = Buffer.from(base64, 'base64').toString().split(':');

    const user = userStore.authenticate(username, password);
    if (user) {
      req.user = user;
      return next();
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="Axon MCP Admin"');
    return res.status(401).json({ error: 'Invalid credentials' });
  };
}

/**
 * Require admin role middleware
 */
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return next();
}

/**
 * Create admin router with injected dependencies
 */
export function createAdminRouter(context: AdminContext): Router {
  const router = Router();
  const userStore = initUserStore(context.configDir);
  const usageTracker = getUsageTracker();

  // Shared Prisma client for graph/admin routes - created lazily with proper adapter
  let _adminPrisma: any = null;
  const getOrCreatePrisma = async () => {
    if (!_adminPrisma) {
      const { PrismaClient } = await import('../generated/prisma/index.js');
      const { PrismaBetterSqlite3 } = await import('@prisma/adapter-better-sqlite3');
      const cacheDir = path.resolve(context.cacheDir);
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      const dbPath = path.join(cacheDir, 'usage.db');
      const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
      _adminPrisma = new PrismaClient({ adapter });
      await _adminPrisma.$connect();
    }
    return _adminPrisma;
  };

  // Apply Basic Auth to all admin routes
  router.use(basicAuthWithUserStore(userStore));

  // ============================================
  // Root endpoint - API index
  // ============================================

  // Pretty-print JSON for all admin routes
  router.use((_req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    res.json = (data: any) => {
      res.type('application/json');
      return res.send(JSON.stringify(data, null, 2));
    };
    next();
  });

  router.get('/', (_req: Request, res: Response) => {
    res.json({
      name: 'Axon MCP Admin API',
      version: '1.0.0',
      endpoints: {
        status: {
          'GET /admin/status': 'Server status and stats'
        },
        'primary-project': {
          'GET /admin/primary-project': 'Get current primary project',
          'POST /admin/primary-project': 'Set primary project (for Dashboard sync)'
        },
        instances: {
          'GET /admin/instances': 'List all instances',
          'GET /admin/instances/:name': 'Get instance details'
        },
        projects: {
          'GET /admin/projects': 'List all projects',
          'POST /admin/projects/:instance/:project/sync': 'Trigger function sync',
          'POST /admin/projects/:instance/discover': 'Discover projects'
        },
        cache: {
          'GET /admin/cache': 'Cache info',
          'POST /admin/cache/clear': 'Clear cache'
        },
        logs: {
          'GET /admin/logs': 'Real-time log stream (SSE)',
          'GET /admin/logs/startup': 'Startup log file'
        },
        usage: {
          'GET /admin/usage': 'Usage statistics',
          'GET /admin/usage/tools': 'Tool usage breakdown',
          'GET /admin/usage/searches': 'Search analytics',
          'GET /admin/usage/daily': 'Daily stats',
          'GET /admin/usage/export': 'Export all usage data'
        },
        config: {
          'GET /admin/config': 'List config files',
          'GET /admin/config/:name': 'Read config file',
          'PUT /admin/config/:name': 'Update config file'
        },
        users: {
          'GET /admin/users': 'List all users',
          'GET /admin/users/me': 'Get current user',
          'POST /admin/users': 'Create a new user (admin only)',
          'PUT /admin/users/:username/password': 'Update user password',
          'PUT /admin/users/:username/role': 'Update user role (admin only)',
          'DELETE /admin/users/:username': 'Delete a user (admin only)'
        },
        oauth: {
          'GET /admin/oauth/sessions': 'List all OAuth sessions',
          'DELETE /admin/oauth/sessions/:id': 'Revoke an OAuth session',
          'GET /admin/oauth/clients': 'List all registered OAuth clients',
          'DELETE /admin/oauth/clients/:id': 'Delete an OAuth client'
        },
        settings: {
          'GET /admin/settings': 'Get all settings',
          'PUT /admin/settings': 'Update settings (admin only)',
          'GET /admin/settings/semantic-search': 'Get semantic search config',
          'PUT /admin/settings/semantic-search': 'Update semantic search config (admin only)'
        },
        graph: {
          'GET /admin/graph/stats': 'Overall graph and vector stats',
          'GET /admin/graph/projects': 'List all Axon projects with graph/vector status',
          'GET /admin/graph/projects/:id/stats': 'Get project graph stats (nodes, edges, vectors)',
          'POST /admin/graph/projects/register': 'Auto-register projects from proj/ directory',
          'POST /admin/graph/projects/:id/build-graph': 'Build code graph for a project',
          'POST /admin/graph/projects/:id/build-embeddings': 'Build embeddings for a project',
          'GET /admin/graph/nodes/search?q=name': 'Search graph nodes by name',
          'GET /admin/graph/nodes/:id': 'Get node details with callers/callees',
          'GET /admin/graph/visualize/:id': 'Get subgraph around a node (format=json|dot|d3|cytoscape)',
          'GET /admin/graph/impact/:id': 'Impact analysis for a node',
          'GET /admin/graph/export/:projectId': 'Export project graph (format=json|dot)',
        },
        models: {
          'GET /admin/models': 'List available embedding models with download status',
          'POST /admin/models/download': 'Download a model by modelId (body: { modelId })',
          'DELETE /admin/models/:modelId': 'Delete a downloaded model',
        },
        workflows: {
          'GET /admin/workflows': 'List all workflows with summary + claudeAvailable flag',
          'GET /admin/workflows/:id': 'Get workflow details, summary, and full markdown',
          'PUT /admin/workflows/:id': 'Save edited workflow markdown {content: string}',
          'POST /admin/workflows/regenerate-all': 'Bulk regenerate local summaries',
          'POST /admin/workflows/:id/summarize': 'Regenerate summary {provider: "local"|"claude"}',
          'POST /admin/workflows/reindex': 'Force-reindex all workflows in vector store',
        },
        keys: {
          'GET /admin/keys': 'List API keys (presence/source/last4 only)',
          'PUT /admin/keys/:name': 'Set/update an API key {value: string}',
          'DELETE /admin/keys/:name': 'Delete an API key from the DB',
          'POST /admin/keys/:name/test': 'Verify the key against the provider',
        },
        toolSearch: {
          'GET /admin/tool-search': 'Get all tool metadata with categories and keywords',
          'GET /admin/tool-search/stats': 'Get tool search statistics and token savings',
          'GET /admin/tool-search/config': 'Get recommended mcp_toolset config for defer_loading',
          'GET /admin/tool-search/core': 'Get list of core tools (should NOT be deferred)',
          'GET /admin/tool-search/deferred': 'Get list of tools that should be deferred',
          'GET /admin/tool-search/category/:category': 'Get tools by category',
          'GET /admin/tool-search/search?q=query': 'Search tools by keyword (BM25-style)',
          'GET /admin/tool-search/search?regex=pattern': 'Search tools by regex pattern'
        }
      },
      dashboard: '/dashboard'
    });
  });

  // ============================================
  // Status endpoints
  // ============================================

  router.get('/status', (_req: Request, res: Response) => {
    try {
      const status = context.getServerStatus();
      res.json(status);
    } catch (error) {
      console.error('[Admin] Failed to get server status:', error);
      res.status(500).json({ error: 'Failed to get server status', details: String(error) });
    }
  });

  // ============================================
  // User Management endpoints
  // ============================================

  // Get current user
  router.get('/users/me', (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    res.json({
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      createdAt: req.user.createdAt,
      lastLogin: req.user.lastLogin,
    });
  });

  // List all users (admin only)
  router.get('/users', requireAdmin, (_req: Request, res: Response) => {
    try {
      const users = userStore.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get users' });
    }
  });

  // Create a new user (admin only)
  router.post('/users', requireAdmin, (req: Request, res: Response) => {
    try {
      const { username, password, role } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }

      if (username.length < 3) {
        return res.status(400).json({ error: 'Username must be at least 3 characters' });
      }

      if (password.length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters' });
      }

      if (userStore.userExists(username)) {
        return res.status(409).json({ error: 'User already exists' });
      }

      const user = userStore.createUser(username, password, role || 'user');
      if (!user) {
        return res.status(500).json({ error: 'Failed to create user' });
      }

      res.status(201).json(user);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create user' });
    }
  });

  // Update user password (user can update own, admin can update any)
  router.put('/users/:username/password', (req: Request, res: Response) => {
    try {
      const { username } = req.params;
      const { password } = req.body;

      // Users can only change their own password, admins can change any
      if (req.user?.role !== 'admin' && req.user?.username !== username) {
        return res.status(403).json({ error: 'Cannot change password for other users' });
      }

      if (!password || password.length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters' });
      }

      const success = userStore.updatePassword(username, password);
      if (!success) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ success: true, message: 'Password updated' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update password' });
    }
  });

  // Update user role (admin only)
  router.put('/users/:username/role', requireAdmin, (req: Request, res: Response) => {
    try {
      const { username } = req.params;
      const { role } = req.body;

      if (!role || !['admin', 'user'].includes(role)) {
        return res.status(400).json({ error: 'Role must be "admin" or "user"' });
      }

      // Prevent demoting self if last admin
      if (req.user?.username === username && role === 'user') {
        const admins = userStore.getAllUsers().filter(u => u.role === 'admin');
        if (admins.length <= 1) {
          return res.status(400).json({ error: 'Cannot demote the last admin' });
        }
      }

      const success = userStore.updateRole(username, role);
      if (!success) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ success: true, message: 'Role updated' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update role' });
    }
  });

  // Delete a user (admin only)
  router.delete('/users/:username', requireAdmin, (req: Request, res: Response) => {
    try {
      const { username } = req.params;

      // Prevent deleting self
      if (req.user?.username === username) {
        return res.status(400).json({ error: 'Cannot delete yourself' });
      }

      const success = userStore.deleteUser(username);
      if (!success) {
        return res.status(400).json({ error: 'User not found or cannot delete the last admin' });
      }

      res.json({ success: true, message: 'User deleted' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });

  // ============================================
  // Primary Project endpoints (for VSCode/Dashboard sync)
  // ============================================

  router.get('/primary-project', (_req: Request, res: Response) => {
    try {
      const primaryProject = context.getPrimaryProject();
      if (!primaryProject) {
        return res.json({
          error: 'No primary project set',
          message: 'Use POST /admin/primary-project or setPrimaryProject MCP tool to set one'
        });
      }
      res.json(primaryProject);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get primary project' });
    }
  });

  router.post('/primary-project', async (req: Request, res: Response) => {
    try {
      const { instance, project, setBy } = req.body;
      if (!instance || !project) {
        return res.status(400).json({ error: 'Missing required fields: instance, project' });
      }

      // Accept setBy from request, default to 'api' for backwards compatibility
      const source = setBy || 'api';
      const result = await context.setPrimaryProject(instance, project, source);
      res.json({
        success: true,
        ...result,
        message: `Primary project set to ${instance}/${project}`
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to set primary project', details: error.message });
    }
  });

  // ============================================
  // Instance endpoints
  // ============================================

  router.get('/instances', (_req: Request, res: Response) => {
    try {
      const instances = context.getInstances();
      res.json(instances);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get instances' });
    }
  });

  router.get('/instances/:name', (req: Request, res: Response) => {
    try {
      const instance = context.getInstance(req.params.name);
      if (!instance) {
        return res.status(404).json({ error: 'Instance not found' });
      }
      res.json(instance);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get instance' });
    }
  });

  // ============================================
  // Project endpoints
  // ============================================

  router.get('/projects', (_req: Request, res: Response) => {
    try {
      const projects = context.getProjects();
      res.json(projects);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get projects' });
    }
  });

  router.post('/projects/:instance/:project/sync', async (req: Request, res: Response) => {
    try {
      const result = await context.triggerSync(req.params.instance, req.params.project);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to trigger sync', details: String(error) });
    }
  });

  router.post('/projects/:instance/discover', async (req: Request, res: Response) => {
    try {
      const result = await context.triggerDiscover(req.params.instance);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to trigger discovery', details: String(error) });
    }
  });

  // NDJSON-streamed discovery — emits one JSON entry per line so the dashboard
  // can show a live connect/auth/discover log instead of a generic 500.
  router.post('/projects/:instance/discover-stream', async (req: Request, res: Response) => {
    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    // Flush headers immediately so the client opens its reader.
    if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders();

    const writeLine = (obj: any) => {
      res.write(JSON.stringify(obj) + '\n');
    };

    writeLine({ type: 'log', level: 'info', step: 'start', message: `Starting discovery for instance "${req.params.instance}"`, ts: new Date().toISOString() });

    try {
      const result = await context.triggerDiscoverWithProgress(req.params.instance, (entry) => {
        writeLine({ type: 'log', ...entry, ts: new Date().toISOString() });
      });
      writeLine({ type: 'done', success: true, projects: result.projects, ts: new Date().toISOString() });
    } catch (error: any) {
      writeLine({
        type: 'done',
        success: false,
        error: error?.message || String(error),
        ts: new Date().toISOString()
      });
    } finally {
      res.end();
    }
  });

  // ============================================
  // Cache endpoints
  // ============================================

  router.get('/cache', (_req: Request, res: Response) => {
    try {
      const caches = context.getCacheInfo();
      res.json(caches);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get cache info' });
    }
  });

  router.post('/cache/clear', async (req: Request, res: Response) => {
    try {
      const { name } = req.body || {};
      await context.clearCache(name);
      res.json({ success: true, cleared: name || 'all' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to clear cache' });
    }
  });

  // ============================================
  // Log endpoints
  // ============================================

  router.get('/logs', (req: Request, res: Response) => {
    // SSE stream for real-time logs
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send recent logs first
    const logs = context.getLogBuffer();
    for (const log of logs) {
      res.write(`data: ${JSON.stringify({ message: log, timestamp: new Date().toISOString() })}\n\n`);
    }

    // Keep connection alive
    const interval = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 30000);

    req.on('close', () => {
      clearInterval(interval);
    });
  });

  router.get('/logs/startup', (_req: Request, res: Response) => {
    try {
      const logPath = '/tmp/axon-mcp-server.log';
      if (fs.existsSync(logPath)) {
        const logs = fs.readFileSync(logPath, 'utf-8');
        res.type('text/plain').send(logs);
      } else {
        res.status(404).json({ error: 'Startup log not found' });
      }
    } catch (error) {
      res.status(500).json({ error: 'Failed to read startup log' });
    }
  });

  // ============================================
  // Usage endpoints
  // ============================================

  router.get('/usage', async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const stats = await usageTracker.getStats(days);
      res.json(stats);
    } catch (error) {
      console.error('[Admin] Failed to get usage stats:', error);
      res.status(500).json({ error: 'Failed to get usage stats', details: String(error) });
    }
  });

  router.get('/usage/tools', async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const usage = await usageTracker.getToolUsage(days);
      res.json(usage);
    } catch (error) {
      console.error('[Admin] Failed to get tool usage:', error);
      res.status(500).json({ error: 'Failed to get tool usage', details: String(error) });
    }
  });

  router.get('/usage/searches', async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const analytics = await usageTracker.getSearchAnalytics(days);
      res.json(analytics);
    } catch (error) {
      console.error('[Admin] Failed to get search analytics:', error);
      res.status(500).json({ error: 'Failed to get search analytics', details: String(error) });
    }
  });

  router.get('/usage/daily', async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const stats = await usageTracker.getDailyStats(days);
      res.json(stats);
    } catch (error) {
      console.error('[Admin] Failed to get daily stats:', error);
      res.status(500).json({ error: 'Failed to get daily stats', details: String(error) });
    }
  });

  router.get('/usage/export', async (_req: Request, res: Response) => {
    try {
      const data = await usageTracker.exportData();
      res.setHeader('Content-Disposition', 'attachment; filename=usage-data.json');
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: 'Failed to export usage data' });
    }
  });

  // Get database info (path, size, record counts)
  router.get('/usage/database', async (_req: Request, res: Response) => {
    try {
      const info = await usageTracker.getDatabaseInfo();
      res.json(info);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get database info' });
    }
  });

  // Clear all usage data (keeps database file)
  router.post('/usage/clear', async (_req: Request, res: Response) => {
    try {
      await usageTracker.clearData();
      res.json({ success: true, message: 'Usage data cleared' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to clear usage data' });
    }
  });

  // Reset database - delete file and reinitialize
  router.post('/usage/reset', async (_req: Request, res: Response) => {
    try {
      await usageTracker.resetDatabase();
      res.json({ success: true, message: 'Database reset complete' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to reset database' });
    }
  });

  // ============================================
  // Config endpoints
  // ============================================

  // Files that are not SkySpark connection configs (handled by /admin/settings)
  const excludedConfigFiles = ['axonMcpServer-config.json', 'admin.json'];

  router.get('/config', (_req: Request, res: Response) => {
    try {
      const configFiles = fs.readdirSync(context.configDir)
        .filter(f => f.endsWith('.json') && !excludedConfigFiles.includes(f))
        .map(f => ({
          name: f,
          path: path.join(context.configDir, f),
        }));
      res.json(configFiles);
    } catch (error) {
      res.status(500).json({ error: 'Failed to list config files' });
    }
  });

  router.get('/config/:name', (req: Request, res: Response) => {
    try {
      const filePath = path.join(context.configDir, req.params.name);
      if (!fs.existsSync(filePath) || !req.params.name.endsWith('.json')) {
        return res.status(404).json({ error: 'Config file not found' });
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      res.json({ name: req.params.name, content: JSON.parse(content) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to read config file' });
    }
  });

  router.put('/config/:name', (req: Request, res: Response) => {
    try {
      const filePath = path.join(context.configDir, req.params.name);
      if (!req.params.name.endsWith('.json')) {
        return res.status(400).json({ error: 'Invalid config file name' });
      }

      // Backup existing file
      if (fs.existsSync(filePath)) {
        const backupPath = filePath + '.backup';
        fs.copyFileSync(filePath, backupPath);
      }

      // Write new content
      fs.writeFileSync(filePath, JSON.stringify(req.body.content, null, 2));

      // Reload the in-memory instance list so the projects dropdown picks up the
      // change without requiring a server restart.
      if (context.reloadConfig) context.reloadConfig();

      res.json({ success: true, name: req.params.name, reloaded: !!context.reloadConfig });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update config file' });
    }
  });

  router.delete('/config/:name', (req: Request, res: Response) => {
    try {
      const filePath = path.join(context.configDir, req.params.name);
      if (!req.params.name.endsWith('.json')) {
        return res.status(400).json({ error: 'Invalid config file name' });
      }
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Config file not found' });
      }

      // Create backup before deleting
      const backupPath = filePath + '.deleted';
      fs.copyFileSync(filePath, backupPath);

      // Delete the file
      fs.unlinkSync(filePath);

      if (context.reloadConfig) context.reloadConfig();

      res.json({ success: true, name: req.params.name, reloaded: !!context.reloadConfig });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete config file' });
    }
  });

  // Manual reload endpoint — used by the dashboard's Refresh buttons and as a
  // safety net for cases where config files are edited on disk directly.
  router.post('/config/reload', (_req: Request, res: Response) => {
    try {
      if (!context.reloadConfig) {
        return res.status(501).json({ error: 'reloadConfig not wired in this server' });
      }
      context.reloadConfig();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to reload config', details: error?.message || String(error) });
    }
  });

  // ============================================
  // Settings endpoints (axonMcpServer-config.json)
  // ============================================

  const settingsFile = path.join(context.configDir, 'axonMcpServer-config.json');

  router.get('/settings', (_req: Request, res: Response) => {
    try {
      if (!fs.existsSync(settingsFile)) {
        return res.status(404).json({ error: 'Settings file not found' });
      }
      const content = fs.readFileSync(settingsFile, 'utf-8');
      res.json(JSON.parse(content));
    } catch (error) {
      res.status(500).json({ error: 'Failed to read settings' });
    }
  });

  router.put('/settings', (req: Request, res: Response) => {
    try {
      // Backup existing file
      if (fs.existsSync(settingsFile)) {
        const backupPath = settingsFile + '.backup';
        fs.copyFileSync(settingsFile, backupPath);
      }

      // Write new content
      fs.writeFileSync(settingsFile, JSON.stringify(req.body, null, 2));

      // Reload config if reloadConfig function is available
      if (context.reloadConfig) {
        context.reloadConfig();
      }

      res.json({ success: true, message: 'Settings saved and reloaded' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  // ============================================
  // OAuth Session Management endpoints
  // ============================================

  // List all OAuth sessions
  router.get('/oauth/sessions', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const oauthProvider = context.getOAuthProvider?.();
      if (!oauthProvider) {
        return res.json({ sessions: [], message: 'OAuth is not enabled' });
      }

      const sessions = await oauthProvider.getSessions();
      res.json(sessions);
    } catch (error) {
      console.error('[Admin] Failed to get OAuth sessions:', error);
      res.status(500).json({ error: 'Failed to get OAuth sessions' });
    }
  });

  // Revoke an OAuth session
  router.delete('/oauth/sessions/:sessionId', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const oauthProvider = context.getOAuthProvider?.();

      if (!oauthProvider) {
        return res.status(400).json({ error: 'OAuth is not enabled' });
      }

      const success = await oauthProvider.revokeSession(sessionId);
      if (success) {
        res.json({ success: true, message: 'Session revoked' });
      } else {
        res.status(404).json({ error: 'Session not found' });
      }
    } catch (error) {
      console.error('[Admin] Failed to revoke OAuth session:', error);
      res.status(500).json({ error: 'Failed to revoke session' });
    }
  });

  // List all OAuth clients
  router.get('/oauth/clients', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const oauthProvider = context.getOAuthProvider?.();
      if (!oauthProvider) {
        return res.json({ clients: [], message: 'OAuth is not enabled' });
      }

      // Get all clients from the clients store
      const clientsStore = oauthProvider.clientsStore as any;
      if (clientsStore.getAllClients) {
        const clients = await clientsStore.getAllClients();
        res.json(clients);
      } else {
        res.json({ clients: [], message: 'Client listing not supported' });
      }
    } catch (error) {
      console.error('[Admin] Failed to get OAuth clients:', error);
      res.status(500).json({ error: 'Failed to get OAuth clients' });
    }
  });

  // Delete an OAuth client
  router.delete('/oauth/clients/:clientId', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params;
      const oauthProvider = context.getOAuthProvider?.();

      if (!oauthProvider) {
        return res.status(400).json({ error: 'OAuth is not enabled' });
      }

      // First revoke all sessions for this client
      await oauthProvider.revokeAllSessionsForClient(clientId);

      // Delete the client
      const clientsStore = oauthProvider.clientsStore as any;
      if (clientsStore.deleteClient) {
        const success = await clientsStore.deleteClient(clientId);
        if (success) {
          res.json({ success: true, message: 'Client deleted and all sessions revoked' });
        } else {
          res.status(404).json({ error: 'Client not found' });
        }
      } else {
        res.status(400).json({ error: 'Client deletion not supported' });
      }
    } catch (error) {
      console.error('[Admin] Failed to delete OAuth client:', error);
      res.status(500).json({ error: 'Failed to delete client' });
    }
  });

  // ============================================
  // Backup Management endpoints
  // ============================================

  // List all backups
  router.get('/backups', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const backupManager = context.getBackupManager?.();
      if (!backupManager) {
        return res.status(500).json({ error: 'Backup manager not available' });
      }

      const backups = backupManager.listBackups();
      res.json(backups);
    } catch (error) {
      console.error('[Admin] Failed to list backups:', error);
      res.status(500).json({ error: 'Failed to list backups' });
    }
  });

  // Create a new backup
  router.post('/backups', requireAdmin, async (req: Request, res: Response) => {
    try {
      const backupManager = context.getBackupManager?.();
      if (!backupManager) {
        return res.status(500).json({ error: 'Backup manager not available' });
      }

      const { description } = req.body;
      const backup = await backupManager.createBackup(description);
      res.json({ success: true, backup });
    } catch (error) {
      console.error('[Admin] Failed to create backup:', error);
      res.status(500).json({ error: 'Failed to create backup' });
    }
  });

  // Download a backup file
  router.get('/backups/:filename/download', requireAdmin, (req: Request, res: Response) => {
    try {
      const backupManager = context.getBackupManager?.();
      if (!backupManager) {
        return res.status(500).json({ error: 'Backup manager not available' });
      }

      const { filename } = req.params;
      const filepath = backupManager.getBackupPath(filename);

      if (!filepath) {
        return res.status(404).json({ error: 'Backup file not found' });
      }

      res.download(filepath, filename);
    } catch (error) {
      console.error('[Admin] Failed to download backup:', error);
      res.status(500).json({ error: 'Failed to download backup' });
    }
  });

  // Restore from a backup
  router.post('/backups/:filename/restore', requireAdmin, async (req: Request, res: Response) => {
    try {
      const backupManager = context.getBackupManager?.();
      if (!backupManager) {
        return res.status(500).json({ error: 'Backup manager not available' });
      }

      const { filename } = req.params;
      const result = await backupManager.restoreBackup(filename);

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('[Admin] Failed to restore backup:', error);
      res.status(500).json({ error: 'Failed to restore backup' });
    }
  });

  // Delete a backup
  router.delete('/backups/:filename', requireAdmin, (req: Request, res: Response) => {
    try {
      const backupManager = context.getBackupManager?.();
      if (!backupManager) {
        return res.status(500).json({ error: 'Backup manager not available' });
      }

      const { filename } = req.params;
      const success = backupManager.deleteBackup(filename);

      if (success) {
        res.json({ success: true, message: 'Backup deleted' });
      } else {
        res.status(404).json({ error: 'Backup file not found' });
      }
    } catch (error) {
      console.error('[Admin] Failed to delete backup:', error);
      res.status(500).json({ error: 'Failed to delete backup' });
    }
  });

  // Upload and import a backup
  router.post('/backups/import', requireAdmin, async (req: Request, res: Response) => {
    try {
      const backupManager = context.getBackupManager?.();
      if (!backupManager) {
        return res.status(500).json({ error: 'Backup manager not available' });
      }

      // For file upload, we need to handle multipart form data
      // The file should be sent as 'backup' field
      // For now, if a filename is provided in body, restore from existing backup
      const { filename } = req.body;

      if (filename) {
        const result = await backupManager.restoreBackup(filename);
        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } else {
        res.status(400).json({ error: 'No backup file specified' });
      }
    } catch (error) {
      console.error('[Admin] Failed to import backup:', error);
      res.status(500).json({ error: 'Failed to import backup' });
    }
  });

  // ============================================
  // Settings endpoints
  // ============================================

  router.get('/settings', async (_req: Request, res: Response) => {
    try {
      const { getConfig } = await import('../config/config.js');
      const config = getConfig();
      res.json({
        semanticSearch: config.semanticSearch || {},
        server: config.server || {},
        cache: config.cache || {},
        search: config.search || {},
        functionUsageTracking: config.functionUsageTracking || {},
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to load settings' });
    }
  });

  router.put('/settings', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { getConfig, reloadConfig } = await import('../config/config.js');
      const updates = req.body;

      // Read current config file
      const configPath = path.join(context.configDir, 'axonMcpServer-config.json');
      let currentFileConfig: Record<string, any> = {};
      if (fs.existsSync(configPath)) {
        currentFileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }

      // Merge updates
      Object.assign(currentFileConfig, updates);
      fs.writeFileSync(configPath, JSON.stringify(currentFileConfig, null, 2));

      // Reload config
      reloadConfig();

      res.json({ success: true, settings: getConfig() });
    } catch (error) {
      console.error('[Admin] Failed to save settings:', error);
      res.status(500).json({ error: 'Failed to save settings' });
    }
  });

  router.get('/settings/semantic-search', async (_req: Request, res: Response) => {
    try {
      const { getConfig } = await import('../config/config.js');
      const config = getConfig();
      res.json(config.semanticSearch || {
        enabled: false,
        codeModel: 'Xenova/all-MiniLM-L6-v2',
        codeDimensions: 384,
        docsModel: 'Xenova/jina-embeddings-v2-base-en',
        docsDimensions: 768,
        embeddingThreads: 2,
        embeddingBatchSize: 16,
        graphWeight: 0.3,
        minScore: 0.5
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to load semantic search settings' });
    }
  });

  router.put('/settings/semantic-search', requireAdmin, async (req: Request, res: Response) => {
    try {
      const updates = req.body;
      const configPath = path.join(context.configDir, 'axonMcpServer-config.json');
      let currentFileConfig: Record<string, any> = {};
      if (fs.existsSync(configPath)) {
        currentFileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }

      currentFileConfig.semanticSearch = {
        ...(currentFileConfig.semanticSearch || {}),
        ...updates
      };
      fs.writeFileSync(configPath, JSON.stringify(currentFileConfig, null, 2));

      const { reloadConfig } = await import('../config/config.js');
      reloadConfig();

      res.json({ success: true, semanticSearch: currentFileConfig.semanticSearch });
    } catch (error) {
      console.error('[Admin] Failed to save semantic search settings:', error);
      res.status(500).json({ error: 'Failed to save semantic search settings' });
    }
  });

  // ============================================
  // Graph & Project endpoints
  // ============================================

  router.get('/graph/stats', async (_req: Request, res: Response) => {
    try {
      const prisma = await getOrCreatePrisma();
      const nodeCount = await prisma.codeNode.count();
      const edgeCount = await prisma.codeEdge.count();
      const projectCount = await prisma.axonProject.count();
      const rawBuildStats = await prisma.graphBuildStats.findMany({
        orderBy: { lastBuildAt: 'desc' },
      });

      // Get project names for build stats
      const projectIds = rawBuildStats.map((s: any) => s.projectId);
      const projects = projectIds.length > 0 ? await prisma.axonProject.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, name: true },
      }) : [];
      const projectMap = new Map(projects.map((p: any) => [p.id, p.name]));

      // Try to get LanceDB stats
      let vectorStats = { code: { rows: 0 }, docs: { rows: 0 } };
      try {
        const { getLanceTableStats } = await import('../embedding/lanceConnection.js');
        vectorStats = await getLanceTableStats();
      } catch { /* LanceDB not initialized */ }

      res.json({
        nodeCount,
        edgeCount,
        projectCount,
        vectorCount: vectorStats.code.rows + vectorStats.docs.rows,
        codeVectors: vectorStats.code.rows,
        docsVectors: vectorStats.docs.rows,
        buildStats: rawBuildStats.map((bs: any) => ({
          id: bs.id,
          project: projectMap.get(bs.projectId) || `Project ${bs.projectId}`,
          instance: '',
          nodesCreated: bs.nodeCount || 0,
          edgesCreated: bs.edgeCount || 0,
          buildTimeMs: bs.buildDurationMs || 0,
          builtAt: bs.lastBuildAt?.toISOString() || bs.createdAt?.toISOString() || new Date().toISOString(),
        })),
      });
    } catch (error: any) {
      console.error('[Admin] Failed to get graph stats:', error?.message || error);
      res.status(500).json({ error: 'Failed to get graph stats', details: error?.message || String(error) });
    }
  });

  // List all Axon projects with graph/vector build status
  router.get('/graph/projects', async (_req: Request, res: Response) => {
    try {
      const prisma = await getOrCreatePrisma();
      const projects = await prisma.axonProject.findMany({
        orderBy: { name: 'asc' },
      });

      // Get node/edge counts per project
      const projectStats = await Promise.all(projects.map(async (p: any) => {
        const nodeCount = await prisma.codeNode.count({ where: { projectId: p.id } });
        const edgeCount = await prisma.codeEdge.count({
          where: { source: { projectId: p.id } },
        });

        // Get vector count for this project
        let vectorCount = 0;
        try {
          const { getLanceTable } = await import('../embedding/lanceConnection.js');
          const table = await getLanceTable();
          vectorCount = await table.countRows(`project_id = ${p.id}`);
        } catch { /* LanceDB not available */ }

        return {
          id: p.id,
          name: p.name,
          path: p.path,
          description: p.description,
          functionCount: p.functionCount,
          lastIndexed: p.lastIndexed,
          autoIndex: p.autoIndex,
          nodeCount,
          edgeCount,
          vectorCount,
          hasGraph: nodeCount > 0,
          hasVectors: vectorCount > 0,
        };
      }));

      res.json(projectStats);
    } catch (error) {
      console.error('[Admin] Failed to list graph projects:', error);
      res.status(500).json({ error: 'Failed to list projects' });
    }
  });

  // Get detailed stats for a specific project
  router.get('/graph/projects/:id/stats', async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id, 10);
      if (isNaN(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
      }

      const prisma = await getOrCreatePrisma();
      const project = await prisma.axonProject.findUnique({ where: { id: projectId } });
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const nodeCount = await prisma.codeNode.count({ where: { projectId } });
      const edgeCount = await prisma.codeEdge.count({
        where: { source: { projectId } },
      });
      const unresolvedCount = await prisma.unresolvedRef.count({ where: { projectId } });

      // Node type breakdown
      const nodesByType = await prisma.codeNode.groupBy({
        by: ['nodeType'],
        where: { projectId },
        _count: true,
      });

      // Edge type breakdown
      const edgesByType = await prisma.codeEdge.groupBy({
        by: ['edgeType'],
        where: { source: { projectId } },
        _count: true,
      });

      // Build stats (return as array for frontend compatibility)
      const buildStats = await prisma.graphBuildStats.findMany({
        where: { projectId },
        orderBy: { lastBuildAt: 'desc' },
      });

      // Vector count
      let vectorCount = 0;
      try {
        const { getLanceTable } = await import('../embedding/lanceConnection.js');
        const table = await getLanceTable();
        vectorCount = await table.countRows(`project_id = ${projectId}`);
      } catch { /* LanceDB not available */ }

      res.json({
        project: {
          id: project.id,
          name: project.name,
          path: project.path,
          functionCount: project.functionCount,
          lastIndexed: project.lastIndexed,
        },
        graph: {
          nodeCount,
          edgeCount,
          unresolvedCount,
          nodesByType: Object.fromEntries(nodesByType.map((n: any) => [n.nodeType, n._count])),
          edgesByType: Object.fromEntries(edgesByType.map((e: any) => [e.edgeType, e._count])),
        },
        vectors: {
          count: vectorCount,
          coverage: nodeCount > 0 ? Math.round((vectorCount / nodeCount) * 100) : 0,
        },
        buildHistory: buildStats.map((bs: any) => ({
          id: bs.id,
          project: project.name,
          instance: '',
          nodesCreated: bs.nodeCount,
          edgesCreated: bs.edgeCount,
          buildTimeMs: bs.buildDurationMs || 0,
          builtAt: bs.lastBuildAt?.toISOString() || bs.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      console.error('[Admin] Failed to get project stats:', error);
      res.status(500).json({ error: 'Failed to get project stats' });
    }
  });

  // Auto-register projects from the synced proj/ directory
  router.post('/graph/projects/register', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const prisma = await getOrCreatePrisma();
      const projDir = path.join(path.resolve(context.configDir, '..'), 'proj');
      const registered: Array<{ name: string; instance: string; path: string; functionCount: number }> = [];

      if (!fs.existsSync(projDir)) {
        return res.json({ registered: [], message: 'No proj/ directory found' });
      }

      // Scan proj/<instance>/<project>/func/ for .axon files
      for (const instance of fs.readdirSync(projDir, { withFileTypes: true })) {
        if (!instance.isDirectory()) continue;
        const instanceDir = path.join(projDir, instance.name);
        for (const project of fs.readdirSync(instanceDir, { withFileTypes: true })) {
          if (!project.isDirectory()) continue;
          const funcDir = path.join(instanceDir, project.name, 'func');
          if (!fs.existsSync(funcDir)) continue;

          const axonFiles = fs.readdirSync(funcDir).filter(f => f.endsWith('.axon'));
          if (axonFiles.length === 0) continue;

          const projectName = `${instance.name}/${project.name}`;
          const projectPath = funcDir;

          // Upsert: create or update
          await prisma.axonProject.upsert({
            where: { name: projectName },
            create: {
              name: projectName,
              path: projectPath,
              description: `Auto-registered from proj/${instance.name}/${project.name}`,
              functionCount: axonFiles.length,
              autoIndex: true,
            },
            update: {
              path: projectPath,
              functionCount: axonFiles.length,
            },
          });

          registered.push({
            name: projectName,
            instance: instance.name,
            path: projectPath,
            functionCount: axonFiles.length,
          });
        }
      }

      res.json({
        registered,
        totalProjects: registered.length,
        totalFunctions: registered.reduce((sum, p) => sum + p.functionCount, 0),
      });
    } catch (error) {
      console.error('[Admin] Failed to register projects:', error);
      res.status(500).json({ error: `Failed to register projects: ${error instanceof Error ? error.message : String(error)}` });
    }
  });

  // Build graph for a project
  router.post('/graph/projects/:id/build-graph', requireAdmin, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id, 10);
      if (isNaN(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
      }

      const prisma = await getOrCreatePrisma();
      const project = await prisma.axonProject.findUnique({ where: { id: projectId } });
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Scan for .axon files and read their content
      const axonFiles: Array<{ path: string; source: string }> = [];
      const scanDir = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else if (entry.name.endsWith('.axon')) {
            axonFiles.push({ path: fullPath, source: fs.readFileSync(fullPath, 'utf-8') });
          }
        }
      };
      scanDir(project.path);

      // Parse files with tree-sitter
      const { getTreeSitterParser } = await import('../parser/treeSitter/index.js');
      const parser = await getTreeSitterParser();
      const parsedFiles = await parser.parseFiles(axonFiles);

      // Build graph
      const { GraphBuilder } = await import('../graph/graphBuilder.js');
      const builder = new GraphBuilder(prisma, projectId);
      const result = await builder.buildFromFiles(parsedFiles);

      res.json({
        success: result.success,
        projectId,
        projectName: project.name,
        nodesCreated: result.nodeCount,
        edgesCreated: result.edgeCount,
        unresolvedCount: result.unresolvedCount,
        durationMs: result.durationMs,
        errors: result.errors,
      });
    } catch (error) {
      console.error('[Admin] Failed to build graph:', error);
      res.status(500).json({ error: `Failed to build graph: ${error instanceof Error ? error.message : String(error)}` });
    }
  });

  // Build embeddings for a project
  router.post('/graph/projects/:id/build-embeddings', requireAdmin, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id, 10);
      if (isNaN(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
      }

      const prisma = await getOrCreatePrisma();
      const project = await prisma.axonProject.findUnique({ where: { id: projectId } });
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Get all code nodes for this project
      const nodes = await prisma.codeNode.findMany({
        where: { projectId },
        select: { id: true, name: true, qualifiedName: true, signature: true, documentation: true },
      });

      if (nodes.length === 0) {
        return res.json({
          success: true,
          projectId,
          projectName: project.name,
          embedded: 0,
          message: 'No code nodes found. Build graph first.',
        });
      }

      // Initialize embedding service and vector store
      const { getEmbeddingService } = await import('../embedding/embeddingService.js');
      const embeddingService = getEmbeddingService();
      await embeddingService.initialize();

      const { VectorStore } = await import('../embedding/vectorStore.js');
      const vectorStore = new VectorStore(prisma, embeddingService);

      // Generate embeddings for all nodes
      const texts = nodes.map((n: any) => {
        const parts = [n.name];
        if (n.signature) parts.push(n.signature);
        if (n.documentation) parts.push(n.documentation);
        return parts.join(' ');
      });

      const embeddings = await embeddingService.embedBatch(texts);

      // Store embeddings
      const items = nodes.map((n: any, i: number) => ({
        nodeId: n.id,
        embedding: embeddings[i],
      }));
      const stored = await vectorStore.storeEmbeddings(items);

      res.json({
        success: true,
        projectId,
        projectName: project.name,
        totalNodes: nodes.length,
        embedded: stored,
      });
    } catch (error) {
      console.error('[Admin] Failed to build embeddings:', error);
      res.status(500).json({ error: `Failed to build embeddings: ${error instanceof Error ? error.message : String(error)}` });
    }
  });

  // ============================================
  // Graph Visualization endpoints
  // ============================================

  // Search graph nodes by name
  router.get('/graph/nodes/search', async (req: Request, res: Response) => {
    try {
      const query = String(req.query.q || '');
      const limit = Math.min(parseInt(String(req.query.limit || '20'), 10), 100);
      const projectIdParam = req.query.projectId ? parseInt(String(req.query.projectId), 10) : undefined;

      if (!query) {
        return res.json([]);
      }

      const prisma = await getOrCreatePrisma();
      const where: any = {};

      // Support wildcard '*' to list all nodes for a project
      if (query !== '*') {
        where.name = { contains: query };
      }
      if (projectIdParam) {
        where.projectId = projectIdParam;
      }

      const nodes = await prisma.codeNode.findMany({
        where,
        select: {
          id: true,
          name: true,
          qualifiedName: true,
          nodeType: true,
          filePath: true,
          lineStart: true,
          signature: true,
          projectId: true,
        },
        take: limit,
        orderBy: { name: 'asc' },
      });
      res.json(nodes);
    } catch (error) {
      console.error('[Admin] Failed to search nodes:', error);
      res.status(500).json({ error: 'Failed to search nodes' });
    }
  });

  // Get node details with callers and callees
  router.get('/graph/nodes/:id', async (req: Request, res: Response) => {
    try {
      const nodeId = req.params.id;

      const prisma = await getOrCreatePrisma();
      const node = await prisma.codeNode.findUnique({
        where: { id: nodeId },
      });
      if (!node) {
        return res.status(404).json({ error: 'Node not found' });
      }

      const { GraphQueryManager } = await import('../graph/graphQueryManager.js');
      const queryManager = new GraphQueryManager(prisma);

      const callers = await queryManager.getCallers(nodeId, 1);
      const callees = await queryManager.getCallees(nodeId, 1);

      res.json({
        node,
        callers,
        callees,
      });
    } catch (error) {
      console.error('[Admin] Failed to get node details:', error);
      res.status(500).json({ error: 'Failed to get node details' });
    }
  });

  // Get subgraph for visualization (nodes + edges around a focal node)
  // Supports graphType: subgraph (default), callers, callees, impact, project
  router.get('/graph/visualize/:id', async (req: Request, res: Response) => {
    try {
      const nodeId = req.params.id;
      const depth = Math.min(parseInt(String(req.query.depth || '2'), 10), 5);
      const format = String(req.query.format || 'json') as 'json' | 'dot' | 'd3' | 'cytoscape';
      const maxNodes = Math.min(parseInt(String(req.query.maxNodes || '200'), 10), 500);
      const graphType = String(req.query.graphType || 'subgraph') as 'subgraph' | 'callers' | 'callees' | 'impact' | 'project';

      const prisma = await getOrCreatePrisma();
      const { GraphVisualizationService } = await import('../graph/graphVisualization.js');
      const vizService = new GraphVisualizationService(prisma);

      const exportOpts = { format, maxNodes, includeMetadata: true, colorScheme: 'type' as const };
      let result: string;

      switch (graphType) {
        case 'callers':
          result = await vizService.exportCallerGraph(nodeId, depth, exportOpts);
          break;
        case 'callees':
          result = await vizService.exportCalleeGraph(nodeId, depth, exportOpts);
          break;
        case 'impact':
          result = await vizService.exportImpactGraph(nodeId, depth, exportOpts);
          break;
        case 'project':
          // nodeId is actually projectId for project graph
          result = await vizService.exportProjectGraph(parseInt(nodeId, 10), exportOpts);
          break;
        default:
          result = await vizService.exportSubgraph(nodeId, depth, exportOpts);
          break;
      }

      if (format === 'dot') {
        res.type('text/plain').send(result);
      } else {
        res.json(JSON.parse(result));
      }
    } catch (error) {
      console.error('[Admin] Failed to visualize graph:', error);
      res.status(500).json({ error: `Failed to visualize graph: ${error instanceof Error ? error.message : String(error)}` });
    }
  });

  // Get impact analysis for a node
  router.get('/graph/impact/:id', async (req: Request, res: Response) => {
    try {
      const nodeId = req.params.id;
      const maxDepth = Math.min(parseInt(String(req.query.maxDepth || '5'), 10), 10);

      const prisma = await getOrCreatePrisma();
      const { GraphQueryManager } = await import('../graph/graphQueryManager.js');
      const queryManager = new GraphQueryManager(prisma);
      const impact = await queryManager.getImpact(nodeId, maxDepth);

      res.json(impact);
    } catch (error) {
      console.error('[Admin] Failed to get impact analysis:', error);
      res.status(500).json({ error: 'Failed to get impact analysis' });
    }
  });

  // Export project graph
  router.get('/graph/export/:projectId', async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      if (isNaN(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
      }
      const format = String(req.query.format || 'json') as 'json' | 'dot' | 'd3' | 'cytoscape';
      const maxNodes = Math.min(parseInt(String(req.query.maxNodes || '500'), 10), 1000);

      const prisma = await getOrCreatePrisma();
      const { GraphVisualizationService } = await import('../graph/graphVisualization.js');
      const vizService = new GraphVisualizationService(prisma);

      const result = await vizService.exportProjectGraph(projectId, {
        format,
        maxNodes,
        includeMetadata: true,
        colorScheme: 'type',
      });

      if (format === 'dot') {
        res.type('text/plain').send(result);
      } else {
        res.json(JSON.parse(result));
      }
    } catch (error) {
      console.error('[Admin] Failed to export graph:', error);
      res.status(500).json({ error: 'Failed to export graph' });
    }
  });

  // ============================================
  // Tool Search endpoints (for Anthropic's Tool Search Tool feature)
  // https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool
  // ============================================

  /**
   * Get all tool metadata
   */
  router.get('/tool-search', (_req: Request, res: Response) => {
    res.json({
      tools: TOOL_METADATA,
      totalTools: TOOL_METADATA.length,
      categories: [...new Set(TOOL_METADATA.map(t => t.category))],
    });
  });

  /**
   * Get tool search statistics and token savings
   */
  router.get('/tool-search/stats', (_req: Request, res: Response) => {
    const stats = getToolSearchStats();
    res.json({
      ...stats,
      description: `Using defer_loading saves ~${stats.tokenSavings} tokens (${stats.savingsPercent}% reduction)`,
      recommendation: stats.totalTools > 20
        ? 'With 27 tools, tool search is highly recommended for better accuracy'
        : 'Tool search is optional but can improve context efficiency',
    });
  });

  /**
   * Get recommended mcp_toolset config for Claude's MCP connector
   */
  router.get('/tool-search/config', (req: Request, res: Response) => {
    const serverName = (req.query.serverName as string) || 'axon-mcp';
    const config = generateMcpToolsetConfig(serverName);

    res.json({
      description: 'Use this configuration with Claude API mcp_servers parameter',
      requiredBetaHeaders: [
        'advanced-tool-use-2025-11-20',
        'mcp-client-2025-11-20',
      ],
      combinedHeader: 'advanced-tool-use-2025-11-20,mcp-client-2025-11-20',
      toolSearchTool: {
        type: 'tool_search_tool_bm25_20251119',
        name: 'tool_search_tool_bm25',
        description: 'BM25 variant uses natural language queries (recommended)',
      },
      toolSearchToolRegex: {
        type: 'tool_search_tool_regex_20251119',
        name: 'tool_search_tool_regex',
        description: 'Regex variant for precise pattern matching',
      },
      mcp_toolset: config,
      exampleUsage: {
        model: 'claude-sonnet-4-5',
        betas: ['advanced-tool-use-2025-11-20', 'mcp-client-2025-11-20'],
        max_tokens: 2048,
        mcp_servers: [
          {
            type: 'url',
            url: 'https://your-server.com/mcp',
            name: serverName,
            authorization_token: 'YOUR_OAUTH_TOKEN',
          },
        ],
        tools: [
          {
            type: 'tool_search_tool_bm25_20251119',
            name: 'tool_search_tool_bm25',
          },
          config,
        ],
      },
    });
  });

  /**
   * Get core tools (should NOT be deferred)
   */
  router.get('/tool-search/core', (_req: Request, res: Response) => {
    const coreToolNames = getCoreTools();
    const coreTools = TOOL_METADATA.filter(t => t.core);

    res.json({
      description: 'These tools should NOT be deferred - always available immediately',
      count: coreTools.length,
      tools: coreToolNames,
      details: coreTools,
    });
  });

  /**
   * Get deferred tools (should be loaded on-demand)
   */
  router.get('/tool-search/deferred', (_req: Request, res: Response) => {
    const deferredToolNames = getDeferredTools();
    const deferredTools = TOOL_METADATA.filter(t => !t.core);

    res.json({
      description: 'These tools should be deferred - loaded on-demand via tool search',
      count: deferredTools.length,
      tools: deferredToolNames,
      details: deferredTools,
    });
  });

  /**
   * Get tools by category
   */
  router.get('/tool-search/category/:category', (req: Request, res: Response) => {
    const category = req.params.category as ToolCategory;
    const validCategories = ['search', 'retrieval', 'execution', 'generation', 'validation', 'skyspark', 'project', 'utility'];

    if (!validCategories.includes(category)) {
      return res.status(400).json({
        error: 'Invalid category',
        validCategories,
      });
    }

    const tools = getToolsByCategory(category);
    res.json({
      category,
      count: tools.length,
      tools,
    });
  });

  /**
   * Search tools by keyword or regex
   */
  router.get('/tool-search/search', (req: Request, res: Response) => {
    const query = req.query.q as string;
    const regex = req.query.regex as string;
    const limit = parseInt(req.query.limit as string) || 5;

    if (!query && !regex) {
      return res.status(400).json({
        error: 'Either q (keyword) or regex (pattern) query parameter required',
        examples: [
          '/admin/tool-search/search?q=search code examples',
          '/admin/tool-search/search?regex=skyspark|project',
          '/admin/tool-search/search?q=validate&limit=3',
        ],
      });
    }

    let results;
    let searchType;

    if (regex) {
      results = searchToolsByRegex(regex, limit);
      searchType = 'regex';
    } else {
      results = searchTools(query, limit);
      searchType = 'bm25';
    }

    res.json({
      searchType,
      query: query || regex,
      count: results.length,
      results: results.map(t => ({
        name: t.name,
        description: t.description,
        category: t.category,
        keywords: t.keywords,
        core: t.core,
      })),
      toolReferences: results.map(t => ({
        type: 'tool_reference',
        tool_name: t.name,
      })),
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Documentation Search (FlexSearch + Vector combined)
  // ═══════════════════════════════════════════════════════════════════════════

  router.post('/docs/search', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { query, limit = 20, library } = req.body;
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'query is required' });
      }

      const maxResults = Math.min(parseInt(String(limit), 10) || 20, 50);

      // 1. FlexSearch keyword results
      let flexResults: any[] = [];
      if (context.searchDocs) {
        flexResults = await context.searchDocs(query, { limit: maxResults, library });
      }

      // 2. Docs vector semantic results
      let vectorResults: Array<{ docId: string; score: number }> = [];
      try {
        const { getDocsVectorStore } = await import('../embedding/docsVectorStore.js');
        const docsStore = getDocsVectorStore();
        const count = await docsStore.count();
        if (count > 0) {
          vectorResults = await docsStore.searchByText(query, { library, limit: maxResults, minScore: 0.3 });
        }
      } catch { /* docs vectors not available */ }

      // 3. Merge and de-duplicate
      const merged = new Map<string, {
        document: any;
        flexScore: number;
        vectorScore: number;
        combinedScore: number;
        matchedSections: any[];
        highlights: string[];
        sources: string[];
      }>();

      // Add FlexSearch results
      for (const r of flexResults) {
        const docId = r.document?.id;
        if (!docId) continue;
        merged.set(docId, {
          document: r.document,
          flexScore: r.score || 0,
          vectorScore: 0,
          combinedScore: r.score || 0,
          matchedSections: r.matchedSections || [],
          highlights: r.highlights || [],
          sources: ['flexsearch'],
        });
      }

      // Add/merge vector results
      for (const vr of vectorResults) {
        const existing = merged.get(vr.docId);
        if (existing) {
          existing.vectorScore = Math.round(vr.score * 100);
          existing.combinedScore = Math.round(existing.flexScore * 0.6 + existing.vectorScore * 0.4);
          existing.sources.push('vector');
        } else {
          // Vector-only result: try to get document info from FlexSearch
          let document: any = null;
          if (context.searchDocs) {
            // Look up the document by searching for it
            // The docId should match a FlexSearch document ID
          }
          if (context.getDocsForEmbedding) {
            const allDocs = context.getDocsForEmbedding();
            const doc = allDocs.find(d => d.id === vr.docId);
            if (doc) {
              document = { id: doc.id, title: doc.title, library: doc.library, filePath: '', sections: [], fullText: '' };
            }
          }
          if (document) {
            merged.set(vr.docId, {
              document,
              flexScore: 0,
              vectorScore: Math.round(vr.score * 100),
              combinedScore: Math.round(vr.score * 100 * 0.4),
              matchedSections: [],
              highlights: [],
              sources: ['vector'],
            });
          }
        }
      }

      // Sort by combined score
      const results = Array.from(merged.values())
        .sort((a, b) => b.combinedScore - a.combinedScore)
        .slice(0, maxResults);

      res.json({
        results,
        meta: {
          query,
          flexCount: flexResults.length,
          vectorCount: vectorResults.length,
          mergedCount: results.length,
        },
      });
    } catch (error: any) {
      console.error('[Admin] Docs search failed:', error?.message || error);
      res.status(500).json({ error: 'Docs search failed', details: error?.message || String(error) });
    }
  });

  router.post('/docs/build-embeddings', requireAdmin, async (req: Request, res: Response) => {
    try {
      if (!context.getDocsForEmbedding) {
        return res.status(400).json({ error: 'Documentation index not available' });
      }

      const docs = context.getDocsForEmbedding();
      if (docs.length === 0) {
        return res.json({ success: true, embedded: 0, message: 'No documents found. Build FlexSearch index first.' });
      }

      const { getDocsEmbeddingPipeline } = await import('../embedding/docsEmbeddingPipeline.js');
      const pipeline = getDocsEmbeddingPipeline();
      const result = await pipeline.embedDocs(docs);

      res.json({
        success: true,
        total: result.total,
        embedded: result.embedded,
        errors: result.errors,
        durationMs: result.durationMs,
      });
    } catch (error: any) {
      console.error('[Admin] Docs embedding failed:', error?.message || error);
      res.status(500).json({ error: 'Docs embedding failed', details: error?.message || String(error) });
    }
  });

  router.get('/docs/stats', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const flexStats = context.getDocsStats?.() || { totalDocuments: 0, totalSections: 0, libraries: [] };

      let docsVectors = 0;
      try {
        const { getLanceTableStats } = await import('../embedding/lanceConnection.js');
        const stats = await getLanceTableStats();
        docsVectors = stats.docs.rows;
      } catch { /* LanceDB not initialized */ }

      res.json({
        flexSearch: {
          documents: flexStats.totalDocuments,
          sections: flexStats.totalSections,
          libraries: flexStats.libraries,
        },
        vectors: {
          count: docsVectors,
          coverage: flexStats.totalDocuments > 0
            ? ((docsVectors / flexStats.totalDocuments) * 100).toFixed(1)
            : '0',
        },
      });
    } catch (error: any) {
      console.error('[Admin] Docs stats failed:', error?.message || error);
      res.status(500).json({ error: 'Failed to get docs stats', details: error?.message || String(error) });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Vector / Semantic Search
  // ═══════════════════════════════════════════════════════════════════════════

  router.post('/vectors/search', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { query, projectId, limit = 20, minScore = 0.3 } = req.body;
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'query is required' });
      }

      const prisma = await getOrCreatePrisma();
      const { getSemanticSearchService } = await import('../embedding/semanticSearchService.js');
      const searchService = getSemanticSearchService(prisma);

      const results = await searchService.searchCode(query, {
        projectId: projectId ? parseInt(String(projectId), 10) : undefined,
        limit: Math.min(parseInt(String(limit), 10) || 20, 50),
        minScore: parseFloat(String(minScore)) || 0.3,
        includeGraphContext: true,
        graphWeight: 0.3,
      });

      res.json({ results });
    } catch (error: any) {
      console.error('[Admin] Vector search failed:', error?.message || error);
      res.status(500).json({ error: 'Vector search failed', details: error?.message || String(error) });
    }
  });

  router.get('/vectors/stats', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const prisma = await getOrCreatePrisma();
      const totalNodes = await prisma.codeNode.count();

      let codeVectors = 0;
      let docsVectors = 0;
      try {
        const { getLanceTableStats } = await import('../embedding/lanceConnection.js');
        const stats = await getLanceTableStats();
        codeVectors = stats.code.rows;
        docsVectors = stats.docs.rows;
      } catch { /* LanceDB not initialized */ }

      // Get per-project vector counts
      const projects = await prisma.axonProject.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });

      const projectStats = await Promise.all(projects.map(async (p: any) => {
        const nodeCount = await prisma.codeNode.count({ where: { projectId: p.id } });
        let vectorCount = 0;
        try {
          const { getLanceTable } = await import('../embedding/lanceConnection.js');
          const table = await getLanceTable();
          vectorCount = await table.countRows(`project_id = ${p.id}`);
        } catch { /* ignore */ }
        return { id: p.id, name: p.name, nodeCount, vectorCount };
      }));

      res.json({
        totalVectors: codeVectors + docsVectors,
        codeVectors,
        docsVectors,
        totalNodes,
        coveragePercent: totalNodes > 0 ? ((codeVectors / totalNodes) * 100).toFixed(1) : '0',
        projects: projectStats,
      });
    } catch (error: any) {
      console.error('[Admin] Vector stats failed:', error?.message || error);
      res.status(500).json({ error: 'Failed to get vector stats', details: error?.message || String(error) });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Embedding Model Management
  // ═══════════════════════════════════════════════════════════════════════════

  router.get('/models', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const { getAllModelStatuses, KNOWN_MODELS } = await import('../embedding/modelManager.js');
      const statuses = getAllModelStatuses();
      res.json({
        models: statuses,
        knownModels: KNOWN_MODELS,
      });
    } catch (error: any) {
      console.error('[Admin] Failed to get model statuses:', error?.message || error);
      res.status(500).json({ error: 'Failed to get model statuses', details: error?.message || String(error) });
    }
  });

  router.post('/models/download', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { modelId } = req.body;
      if (!modelId || typeof modelId !== 'string') {
        return res.status(400).json({ error: 'modelId is required' });
      }

      const { downloadModel, getModelStatus } = await import('../embedding/modelManager.js');

      // Check if already downloaded
      const status = getModelStatus(modelId);
      if (status.downloaded) {
        return res.json({ success: true, message: 'Model already downloaded', status });
      }

      // Start download (this may take a while)
      console.error(`[Admin] Starting model download: ${modelId}`);
      await downloadModel(modelId, (progress) => {
        if (progress.status === 'downloading' && progress.progress !== undefined) {
          console.error(`[Admin] Download ${modelId}: ${progress.progress}% ${progress.file || ''}`);
        }
      });

      const finalStatus = getModelStatus(modelId);
      console.error(`[Admin] Model download complete: ${modelId}`);
      res.json({ success: true, message: 'Model downloaded successfully', status: finalStatus });
    } catch (error: any) {
      console.error('[Admin] Failed to download model:', error?.message || error);
      res.status(500).json({ error: 'Failed to download model', details: error?.message || String(error) });
    }
  });

  router.delete('/models/:org/:model', requireAdmin, async (req: Request, res: Response) => {
    try {
      const modelId = `${req.params.org}/${req.params.model}`;
      const { MODELS_DIR } = await import('../embedding/modelManager.js');
      const modelPath = path.join(MODELS_DIR, modelId);

      if (!fs.existsSync(modelPath)) {
        return res.status(404).json({ error: 'Model not found on disk' });
      }

      fs.rmSync(modelPath, { recursive: true, force: true });
      console.error(`[Admin] Deleted model: ${modelId}`);
      res.json({ success: true, message: `Model ${modelId} deleted` });
    } catch (error: any) {
      console.error('[Admin] Failed to delete model:', error?.message || error);
      res.status(500).json({ error: 'Failed to delete model', details: error?.message || String(error) });
    }
  });

  // ============================================
  // Workflow endpoints
  // ============================================

  router.get('/workflows', async (_req: Request, res: Response) => {
    try {
      const wm = context.getWorkflowManager?.();
      if (!wm) return res.status(503).json({ error: 'Workflow manager not available' });
      const { getAnthropicApiKey } = await import('./secretsStore.js');
      const claudeAvailable = (await getAnthropicApiKey()) !== null;
      const summaries = wm.getAllSummaries();
      res.json({
        count: summaries.length,
        claudeAvailable,
        workflows: summaries,
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to list workflows', details: error?.message || String(error) });
    }
  });

  router.get('/workflows/:id', async (req: Request, res: Response) => {
    try {
      const wm = context.getWorkflowManager?.();
      if (!wm) return res.status(503).json({ error: 'Workflow manager not available' });
      const workflow = wm.getWorkflow(req.params.id);
      if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
      const summary = wm.getSummary(req.params.id);
      res.json({
        workflow: {
          id: workflow.metadata.id,
          title: workflow.metadata.title,
          description: workflow.metadata.description,
          category: workflow.metadata.category,
          tags: workflow.metadata.tags,
          version: workflow.metadata.version,
          uri: workflow.uri,
          mtimeMs: workflow.mtimeMs,
        },
        summary,
        fullContent: workflow.fullContent,
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to get workflow', details: error?.message || String(error) });
    }
  });

  router.put('/workflows/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const wm = context.getWorkflowManager?.();
      if (!wm) return res.status(503).json({ error: 'Workflow manager not available' });
      const content = req.body?.content;
      if (typeof content !== 'string' || !content.trim()) {
        return res.status(400).json({ error: 'Missing or empty "content" in body' });
      }
      const updated = await wm.saveWorkflow(req.params.id, content);
      if (!updated) return res.status(404).json({ error: 'Workflow not found' });
      const summary = wm.getSummary(req.params.id);
      // Trigger background reindex (non-blocking).
      const idx = context.getWorkflowVectorIndex?.();
      if (idx) {
        idx.reindexOne(req.params.id).catch((err: any) => {
          console.error(`[Admin] reindexOne failed: ${err?.message || err}`);
        });
      }
      res.json({ workflow: updated, summary });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to save workflow', details: error?.message || String(error) });
    }
  });

  router.post('/workflows/regenerate-all', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const wm = context.getWorkflowManager?.();
      if (!wm) return res.status(503).json({ error: 'Workflow manager not available' });
      const result = wm.regenerateAllLocal();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to regenerate summaries', details: error?.message || String(error) });
    }
  });

  router.post('/workflows/:id/summarize', requireAdmin, async (req: Request, res: Response) => {
    try {
      const wm = context.getWorkflowManager?.();
      if (!wm) return res.status(503).json({ error: 'Workflow manager not available' });
      const provider = (req.body?.provider === 'claude') ? 'claude' : 'local';
      const summary = await wm.regenerateSummary(req.params.id, provider);
      if (!summary) return res.status(404).json({ error: 'Workflow not found' });
      res.json(summary);
    } catch (error: any) {
      const isMissingKey = error?.name === 'AnthropicNotConfiguredError';
      res.status(isMissingKey ? 503 : 500).json({
        error: isMissingKey ? 'Anthropic API key not configured' : 'Failed to summarize',
        details: error?.message || String(error),
      });
    }
  });

  router.post('/workflows/reindex', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const idx = context.getWorkflowVectorIndex?.();
      if (!idx) return res.status(503).json({ error: 'Workflow vector index not available' });
      const result = await idx.reindexAll();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to reindex workflows', details: error?.message || String(error) });
    }
  });

  // ============================================
  // API Key management
  // ============================================

  router.get('/keys', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const { initSecretsStore } = await import('./secretsStore.js');
      const store = initSecretsStore(getOrCreatePrisma, context.cacheDir);
      const list = await store.listSecrets();
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to list keys', details: error?.message || String(error) });
    }
  });

  router.put('/keys/:name', requireAdmin, async (req: Request, res: Response) => {
    try {
      const value = (req.body?.value ?? '').toString().trim();
      if (!value) return res.status(400).json({ error: 'Missing or empty "value" in body' });
      const { initSecretsStore } = await import('./secretsStore.js');
      const store = initSecretsStore(getOrCreatePrisma, context.cacheDir);
      await store.setSecret(req.params.name, value);
      const list = await store.listSecrets();
      res.json(list.find(s => s.name === req.params.name) ?? { name: req.params.name, present: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to set key', details: error?.message || String(error) });
    }
  });

  router.delete('/keys/:name', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { initSecretsStore } = await import('./secretsStore.js');
      const store = initSecretsStore(getOrCreatePrisma, context.cacheDir);
      const removed = await store.deleteSecret(req.params.name);
      const list = await store.listSecrets();
      res.json({ removed, current: list.find(s => s.name === req.params.name) ?? null });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete key', details: error?.message || String(error) });
    }
  });

  router.post('/keys/:name/test', requireAdmin, async (req: Request, res: Response) => {
    try {
      if (req.params.name !== 'anthropic') {
        return res.status(400).json({ error: `Test not implemented for key '${req.params.name}'` });
      }
      const { initSecretsStore } = await import('./secretsStore.js');
      initSecretsStore(getOrCreatePrisma, context.cacheDir);
      const { testAnthropicKey } = await import('../workflows/summaryGenerator.js');
      const result = await testAnthropicKey();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to test key', details: error?.message || String(error) });
    }
  });

  return router;
}
