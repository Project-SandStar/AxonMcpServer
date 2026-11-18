/**
 * Admin routes for user access keys, the disabled flag and the access record.
 *
 *   POST   /admin/users/:username/keys        make a key (admin)
 *   GET    /admin/users/:username/keys        list (admin, or the user's own)
 *   DELETE /admin/users/:username/keys/:id    revoke (admin, or the user's own)
 *   PUT    /admin/users/:username/disabled    disable or enable a user (admin)
 *   GET    /admin/access/keys                 every key (admin)
 *   GET    /admin/access/audit?limit=100      the access record (admin)
 *
 * All of them are behind the dashboard's Basic auth: a key never works on
 * /admin. The key text is in the reply of POST only. No reply holds the hash.
 */
import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import type { UserStore } from './userStore.js';
import type { KeyInfo } from '../auth/userKeys.js';
import type { AccessAuditRow } from '../auth/accessAudit.js';

/** The key store calls these routes use (a test passes a fake). */
export interface KeyStoreLike {
  create(input: { userId: string; name: string; expiresAt?: Date | null; createdBy?: string | null }): Promise<{ row: KeyInfo; key: string }>;
  listForUser(userId: string): Promise<KeyInfo[]>;
  listAll(): Promise<KeyInfo[]>;
  revoke(id: string, userId: string, by: string | null): Promise<KeyInfo | null>;
}

export interface UserKeysRouterOptions {
  userStore: Pick<UserStore, 'getUser' | 'getUserById' | 'setDisabled'>;
  requireAdmin: RequestHandler;
  getKeys: () => KeyStoreLike | undefined;
  getAudit?: () => { list(limit?: number): Promise<AccessAuditRow[]> } | undefined;
  now?: () => number;
}

export const MAX_KEY_DAYS = 3650;
const DAY_MS = 24 * 60 * 60 * 1000;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** A key as the dashboard sees it. It has no key text and no hash. */
export function keyRow(key: KeyInfo, username: string | null) {
  return {
    id: key.id,
    username,
    name: key.name,
    prefix: key.prefix,
    createdAt: iso(key.createdAt),
    createdBy: key.createdBy,
    expiresAt: iso(key.expiresAt),
    lastUsedAt: iso(key.lastUsedAt),
    lastUsedFrom: key.lastUsedFrom,
    revokedAt: iso(key.revokedAt),
    status: key.status,
  };
}

const noStore = (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

const NOT_READY = { error: 'Key store is not ready' };

/** Routes under /admin/users. */
export function createUserKeysRouter(opts: UserKeysRouterOptions): Router {
  const router = Router();
  const store = opts.userStore;
  const now = opts.now ?? Date.now;
  const nameOf = (req: Request) => String(req.params.username || '').toLowerCase();
  const isAdmin = (req: Request) => req.user?.role === 'admin';
  const isSelf = (req: Request, username: string) => req.user?.username === username;

  router.post('/:username/keys', noStore, opts.requireAdmin, async (req: Request, res: Response) => {
    const keys = opts.getKeys();
    if (!keys) return res.status(503).json(NOT_READY);
    const user = store.getUser(nameOf(req));
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.disabled) return res.status(409).json({ error: 'User is disabled' });

    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 1 || name.length > 64) {
      return res.status(400).json({ error: 'name must be 1 to 64 characters' });
    }
    const days = body.expiresInDays;
    let expiresAt: Date | null = null;
    if (days !== undefined && days !== null) {
      if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > MAX_KEY_DAYS) {
        return res.status(400).json({ error: `expiresInDays must be a whole number from 1 to ${MAX_KEY_DAYS}, or null` });
      }
      expiresAt = new Date(now() + days * DAY_MS);
    }

    try {
      const made = await keys.create({ userId: user.id, name, expiresAt, createdBy: req.user?.username ?? null });
      console.error(`[keys] ${req.user?.username} made key ${made.row.prefix} for ${user.username}`);
      // The only reply that ever holds the key text.
      return res.status(201).json({ ...keyRow(made.row, user.username), key: made.key });
    } catch (error) {
      console.error(`[keys] Could not make a key: ${error instanceof Error ? error.message : error}`);
      return res.status(500).json({ error: 'Failed to create the key' });
    }
  });

  router.get('/:username/keys', noStore, async (req: Request, res: Response) => {
    const username = nameOf(req);
    if (!isAdmin(req) && !isSelf(req, username)) {
      return res.status(403).json({ error: 'Cannot list keys of other users' });
    }
    const keys = opts.getKeys();
    if (!keys) return res.status(503).json(NOT_READY);
    const user = store.getUser(username);
    if (!user) return res.status(404).json({ error: 'User not found' });
    try {
      const rows = await keys.listForUser(user.id);
      return res.json({ keys: rows.map(k => keyRow(k, user.username)) });
    } catch (error) {
      console.error(`[keys] Could not list keys: ${error instanceof Error ? error.message : error}`);
      return res.status(500).json({ error: 'Failed to list the keys' });
    }
  });

  router.delete('/:username/keys/:id', noStore, async (req: Request, res: Response) => {
    const username = nameOf(req);
    if (!isAdmin(req) && !isSelf(req, username)) {
      return res.status(403).json({ error: 'Cannot revoke keys of other users' });
    }
    const keys = opts.getKeys();
    if (!keys) return res.status(503).json(NOT_READY);
    const user = store.getUser(username);
    // No user, no key of this user: the same reply.
    if (!user) return res.status(404).json({ error: 'Key not found' });
    try {
      const row = await keys.revoke(String(req.params.id), user.id, req.user?.username ?? null);
      if (!row) return res.status(404).json({ error: 'Key not found' });
      console.error(`[keys] ${req.user?.username} revoked key ${row.prefix} of ${user.username}`);
      return res.json({ success: true, key: keyRow(row, user.username) });
    } catch (error) {
      console.error(`[keys] Could not revoke a key: ${error instanceof Error ? error.message : error}`);
      return res.status(500).json({ error: 'Failed to revoke the key' });
    }
  });

  router.put('/:username/disabled', noStore, opts.requireAdmin, (req: Request, res: Response) => {
    const username = nameOf(req);
    const disabled = (req.body ?? {}).disabled;
    if (typeof disabled !== 'boolean') {
      return res.status(400).json({ error: 'disabled must be true or false' });
    }
    if (disabled && isSelf(req, username)) {
      return res.status(400).json({ error: 'Cannot disable yourself' });
    }
    if (!store.getUser(username)) return res.status(404).json({ error: 'User not found' });
    if (!store.setDisabled(username, disabled)) {
      return res.status(400).json({ error: 'Cannot disable the last admin who can log in' });
    }
    console.error(`[keys] ${req.user?.username} ${disabled ? 'disabled' : 'enabled'} the user ${username}`);
    return res.json({ user: store.getUser(username) });
  });

  return router;
}

/** Routes under /admin/access: every key and the access record (admin only). */
export function createAccessRouter(opts: UserKeysRouterOptions): Router {
  const router = Router();
  router.use(noStore, opts.requireAdmin);

  router.get('/keys', async (_req: Request, res: Response) => {
    const keys = opts.getKeys();
    if (!keys) return res.status(503).json(NOT_READY);
    try {
      const rows = await keys.listAll();
      return res.json({
        // username is null when the user was deleted
        keys: rows.map(k => keyRow(k, opts.userStore.getUserById(k.userId)?.username ?? null)),
      });
    } catch (error) {
      console.error(`[keys] Could not list keys: ${error instanceof Error ? error.message : error}`);
      return res.status(500).json({ error: 'Failed to list the keys' });
    }
  });

  router.get('/audit', async (req: Request, res: Response) => {
    const audit = opts.getAudit?.();
    if (!audit) return res.status(503).json({ error: 'Access record is not ready' });
    try {
      const rows = await audit.list(Number(req.query.limit) || 100);
      return res.json({
        events: rows.map(r => ({
          id: r.id,
          at: r.at.toISOString(),
          source: r.source,
          action: r.action,
          status: r.status,
          username: r.username,
          keyPrefix: r.keyPrefix,
          instance: r.instance,
          project: r.project,
          name: r.name,
        })),
      });
    } catch (error) {
      console.error(`[audit] Could not read the access record: ${error instanceof Error ? error.message : error}`);
      return res.status(500).json({ error: 'Failed to read the access record' });
    }
  });

  return router;
}

/**
 * A 'readonly' user can only read the admin API. Two changes stay open: the
 * user's own password and the revoke of the user's own key.
 * `req.path` here is the path below /admin.
 */
export function readonlyGuard(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'readonly' || req.method === 'GET' || req.method === 'HEAD') return next();
  const me = encodeURIComponent(req.user.username);
  const path = req.path.toLowerCase().replace(/\/+$/, '');
  const ownPassword = req.method === 'PUT' && path === `/users/${me}/password`;
  const ownKey = req.method === 'DELETE' && path.startsWith(`/users/${me}/keys/`) && path.split('/').length === 5;
  if (ownPassword || ownKey) return next();
  return res.status(403).json({ error: 'Your user is read-only' });
}
