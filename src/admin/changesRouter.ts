/**
 * Change hook for sidecar-receiver (fileSystemSideCar Task 8.4).
 *
 *   POST /admin/changes               body {"sidecar","root","paths":[...]}  (receiver hook body)
 *   POST /admin/changes/projects/:id  body {"paths":[...]}                   (direct, by Axon project id)
 *   GET  /admin/changes/projects/:id  queue status + last result
 *
 * Auth: `Authorization: Bearer <AXON_CHANGES_TOKEN>`. No token set = 503.
 * The work runs in a per-project queue; the response is 202.
 *
 * Root map (config/axon-changes.json, or AXON_CHANGES_CONFIG):
 *   {
 *     "mirrorDir": "/mirror",
 *     "roots": [
 *       { "sidecar": "mac-alper", "root": "BAS", "project": "mirror/BAS", "path": "/mirror/mac-alper/BAS" }
 *     ]
 *   }
 * "sidecar" is optional (any sidecar). "path" defaults to {mirrorDir}/{sidecar}/{root}.
 * A missing Axon project is created with that path; its first job is a full build.
 */

import { Router, Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { PrismaClient } from '../generated/prisma/index.js';
import { ChangeQueue } from '../graph/changeQueue.js';
import { updateProjectFiles, fullProjectBuild, type UpdateOptions } from '../graph/incrementalUpdater.js';

export interface RootMapEntry {
  sidecar?: string;
  root: string;
  project: string | number;
  path?: string;
}

export interface ChangesConfig {
  mirrorDir?: string;
  roots: RootMapEntry[];
}

export interface ChangesRouterOptions {
  getPrisma: () => Promise<PrismaClient>;
  token?: () => string | undefined;
  config?: () => ChangesConfig;
  update?: UpdateOptions;
}

const MAX_PATHS = 10000;

export function loadChangesConfig(configDir: string): ChangesConfig {
  const file = process.env.AXON_CHANGES_CONFIG || path.join(configDir, 'axon-changes.json');
  try {
    const cfg = JSON.parse(fs.readFileSync(file, 'utf-8')) as ChangesConfig;
    return { mirrorDir: cfg.mirrorDir, roots: Array.isArray(cfg.roots) ? cfg.roots : [] };
  } catch {
    return { roots: [] };
  }
}

function tokenOk(header: string | undefined, expected: string): boolean {
  if (!header || !header.startsWith('Bearer ')) return false;
  const a = crypto.createHash('sha256').update(header.slice(7).trim()).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function cleanPaths(body: unknown): string[] | null {
  const paths = (body as any)?.paths;
  if (!Array.isArray(paths) || paths.length > MAX_PATHS) return null;
  if (!paths.every(p => typeof p === 'string' && p.length > 0 && p.length < 4096)) return null;
  return [...new Set(paths as string[])];
}

export function createChangesRouter(opts: ChangesRouterOptions): { router: Router; queue: ChangeQueue } {
  const router = Router();
  const getToken = opts.token ?? (() => process.env.AXON_CHANGES_TOKEN);
  const getConfig: () => ChangesConfig = opts.config ?? (() => ({ roots: [] }));

  const queue = new ChangeQueue(async (projectId, paths) => {
    const prisma = await opts.getPrisma();
    const project = await prisma.axonProject.findUnique({ where: { id: projectId } });
    if (!project) throw new Error(`Project not found: ${projectId}`);
    const hasGraph = (await prisma.codeNode.count({ where: { projectId } })) > 0;
    const result = hasGraph
      ? await updateProjectFiles(prisma, project, paths, opts.update)
      : await fullProjectBuild(prisma, project, opts.update);
    await prisma.axonProject.update({ where: { id: projectId }, data: { lastIndexed: new Date() } });
    console.error(`[changes] project ${projectId} ${result.mode}: +${result.nodesAdded} -${result.nodesRemoved} nodes, ${result.embedded} vectors, ${result.durationMs}ms`);
    return result;
  });

  router.use((req: Request, res: Response, next: NextFunction) => {
    const expected = getToken();
    if (!expected) return res.status(503).json({ error: 'Change hook disabled: AXON_CHANGES_TOKEN not set' });
    if (!tokenOk(req.headers.authorization, expected)) {
      res.setHeader('WWW-Authenticate', 'Bearer');
      return res.status(401).json({ error: 'Invalid or missing bearer token' });
    }
    return next();
  });

  // Receiver hook body: {"sidecar","root","paths"}
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { sidecar, root } = req.body || {};
      const paths = cleanPaths(req.body);
      if (typeof root !== 'string' || !root || paths === null) {
        return res.status(400).json({ error: 'Body must be {"sidecar": string, "root": string, "paths": string[]}' });
      }
      const cfg = getConfig();
      const entry = cfg.roots.find(r => r.root === root && (!r.sidecar || r.sidecar === sidecar));
      if (!entry) return res.status(404).json({ error: `No Axon project mapped for root "${root}"` });

      const prisma = await opts.getPrisma();
      let project = typeof entry.project === 'number'
        ? await prisma.axonProject.findUnique({ where: { id: entry.project } })
        : await prisma.axonProject.findUnique({ where: { name: entry.project } });
      if (!project) {
        if (typeof entry.project === 'number') return res.status(404).json({ error: `Project not found: ${entry.project}` });
        const projPath = entry.path || path.join(cfg.mirrorDir || process.env.AXON_MIRROR_DIR || '/mirror', String(sidecar || ''), root);
        project = await prisma.axonProject.create({
          data: { name: entry.project, path: projPath, description: `Sidecar mirror ${sidecar || '*'}/${root}`, autoIndex: true },
        });
      }
      const status = queue.enqueue(project.id, paths);
      return res.status(202).json({ accepted: paths.length, projectName: project.name, ...status });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post('/projects/:id', async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id, 10);
      const paths = cleanPaths(req.body);
      if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });
      if (paths === null) return res.status(400).json({ error: 'Body must be {"paths": string[]}' });
      const prisma = await opts.getPrisma();
      const project = await prisma.axonProject.findUnique({ where: { id: projectId } });
      if (!project) return res.status(404).json({ error: 'Project not found' });
      return res.status(202).json({ accepted: paths.length, ...queue.enqueue(projectId, paths) });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get('/projects/:id', (req: Request, res: Response) => {
    const projectId = parseInt(req.params.id, 10);
    if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });
    return res.json({ ...queue.status(projectId), lastResult: queue.result(projectId) ?? null });
  });

  return { router, queue };
}
