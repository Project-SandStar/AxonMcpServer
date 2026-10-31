/**
 * "Sidecar sync login" per user (shared design with Fantom, ExpeDat, QuickBooks).
 *
 * The app's Users page is the one user list. Each user may have a sync login:
 * on/off, a write-only sync password, allowed roots. The app keeps the
 * receiver in step through the receiver admin API (Bearer = the receiver's
 * status token). The receiver keeps the Argon2 hash in receiver.toml; this app
 * never stores, logs or returns the sync password or a hash of it.
 *
 * Receiver admin API (fileSystemSideCar, crates/sidecar-receiver):
 *   GET    /v1/accounts                      {accounts: [{id, username, roots, allowed_roots, connected, last_seen_ms, last_login_ms, quic}], roots: [all root names]}
 *   POST   /v1/accounts                      add     {username, password, roots?}  (roots absent or [] = all roots)
 *   PUT    /v1/accounts/:username/roots      set allowed roots {roots}  ([] = all roots; password not touched)
 *   PUT    /v1/accounts/:username/password   set pw  {password}
 *   DELETE /v1/accounts/:username            remove  (409: the last account can not be removed)
 *
 * The receiver enforces `allowed_roots` per account (empty = all roots). The
 * app keeps its "allowed roots" and sends them to the receiver when a sync
 * login is saved and they differ. The receiver's `roots` are the roots mapped
 * or seen for that account; the top-level `roots` are all root names it knows.
 *
 * App routes (mounted under /admin, behind Basic Auth):
 *   GET    /admin/sidecar/accounts                read-only account list + linked user (any user)
 *   PUT    /admin/users/:username/sidecar-sync    {enabled, password?, roots?}  (admin)
 *   DELETE /admin/users/:username/sidecar-sync    turn off + remove the receiver account (admin)
 *   POST   /admin/sidecar/accounts/link           link receiver accounts to users by name (admin)
 */

import { Router, Request, Response, RequestHandler } from 'express';
import type { UserStore, UserPublic, SidecarSyncLogin } from './userStore.js';
import { receiverFetch } from './receiverFetch.js';

export interface ReceiverAccount {
  username: string;
  id?: string;
  roots?: string[];
  /** Roots the receiver lets this account use. Empty = all roots. Missing = older receiver. */
  allowed_roots?: string[];
  connected?: boolean;
  last_login_ms?: number | null;
  last_seen_ms?: number | null;
}

export class ReceiverAdminError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

export interface ReceiverAdminOptions {
  url?: () => string | undefined;
  token?: () => string | undefined;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class ReceiverAdminClient {
  private url: () => string | undefined;
  private token: () => string | undefined;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;

  constructor(opts: ReceiverAdminOptions = {}) {
    this.url = opts.url ?? (() => process.env.SIDECAR_RECEIVER_URL);
    this.token = opts.token ?? (() => process.env.SIDECAR_RECEIVER_TOKEN);
    this.timeoutMs = opts.timeoutMs ?? 5000;
    this.fetchImpl = opts.fetchImpl ?? receiverFetch;
  }

  configured(): boolean {
    return !!(this.url()?.trim() && this.token());
  }

  private async call(method: string, path: string, body?: unknown): Promise<any> {
    const url = this.url()?.trim();
    const token = this.token();
    if (!url || !token) throw new ReceiverAdminError('Receiver not set up (SIDECAR_RECEIVER_URL, SIDECAR_RECEIVER_TOKEN)', 503);
    let res: globalThis.Response;
    try {
      res = await this.fetchImpl(`${url.replace(/\/+$/, '')}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const e = err as Error;
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw new ReceiverAdminError(`Receiver did not reply in ${this.timeoutMs / 1000} s`, 504);
      throw new ReceiverAdminError(`Receiver not reachable: ${e?.message || String(err)}`, 502);
    }
    const text = await res.text();
    let data: any = undefined;
    try { data = text ? JSON.parse(text) : undefined; } catch { data = undefined; }
    if (!res.ok) {
      // Never echo the request body; the reply text from the receiver has no secrets.
      const msg = (data && (data.error || data.message)) || text.slice(0, 200) || res.statusText;
      throw new ReceiverAdminError(`Receiver replied ${res.status}: ${msg}`, res.status);
    }
    return data;
  }

  async list(): Promise<ReceiverAccount[]> {
    return (await this.listAll()).accounts;
  }

  /** Accounts plus every root name the receiver knows (top-level "roots"). */
  async listAll(): Promise<{ accounts: ReceiverAccount[]; roots: string[] }> {
    const data = await this.call('GET', '/v1/accounts');
    const arr = Array.isArray(data) ? data : Array.isArray(data?.accounts) ? data.accounts : [];
    const accounts = arr.map((a: any) => normalizeAccount(a)).filter((a: ReceiverAccount) => !!a.username);
    const roots = Array.isArray(data?.roots) ? data.roots.filter((r: unknown) => typeof r === 'string' && r) : [];
    return { accounts, roots };
  }

  /** Adds an account. Roots are sent only when not empty (absent = all roots). */
  async add(username: string, password: string, roots: string[] = []): Promise<void> {
    await this.call('POST', '/v1/accounts', { username, password, ...(roots.length ? { roots } : {}) });
  }

  /** Sets the allowed roots ([] = all roots). Does not touch the password. */
  async setRoots(username: string, roots: string[]): Promise<void> {
    await this.call('PUT', `/v1/accounts/${encodeURIComponent(username)}/roots`, { roots });
  }

  async setPassword(username: string, password: string): Promise<void> {
    await this.call('PUT', `/v1/accounts/${encodeURIComponent(username)}/password`, { password });
  }

  async remove(username: string): Promise<void> {
    await this.call('DELETE', `/v1/accounts/${encodeURIComponent(username)}`);
  }
}

/** Keeps only known, non-secret fields of a receiver account. */
export function normalizeAccount(a: any): ReceiverAccount {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    username: String(a?.username ?? a?.id ?? ''),
    ...(a?.id !== undefined ? { id: String(a.id) } : {}),
    ...(Array.isArray(a?.roots) ? { roots: a.roots.map(String) } : {}),
    ...(Array.isArray(a?.allowed_roots) ? { allowed_roots: a.allowed_roots.map(String) } : {}),
    ...(typeof a?.connected === 'boolean' ? { connected: a.connected } : {}),
    last_login_ms: num(a?.last_login_ms),
    last_seen_ms: num(a?.last_seen_ms),
  };
}

// Same rule as the receiver (valid_username): 1-64 of letters, digits, '.', '_', '-'
const USERNAME_RE = /^[A-Za-z0-9._-]{1,64}$/;
const ROOT_RE = /^[^/\\]+$/;

export function cleanRoots(v: unknown): string[] | string {
  if (v === undefined || v === null) return [];
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : null;
  if (!list) return '"roots" must be a list of root names';
  const out: string[] = [];
  for (const r of list) {
    const s = typeof r === 'string' ? r.trim() : '';
    if (!s) continue;
    if (!ROOT_RE.test(s) || s === '.' || s === '..') return `Root "${s}" must be a folder name (no "/" or "\\")`;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

/** Same roots, any order. */
export function sameRoots(a: string[], b: string[]): boolean {
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every(r => y.has(r));
}

/** All root names the receiver knows: top-level list plus each account's roots. */
export function knownRoots(top: string[], accounts: ReceiverAccount[]): string[] {
  const out = new Set<string>(top);
  for (const a of accounts) for (const r of [...(a.roots ?? []), ...(a.allowed_roots ?? [])]) out.add(r);
  return [...out].sort((p, q) => p.localeCompare(q));
}

export interface LinkResult {
  linked: string[];
  created: string[];
  alreadyLinked: string[];
}

/**
 * Links receiver accounts to app users by username. A missing user is made as
 * a viewer ("user" role) with dashboard login off. Never changes a password.
 */
export async function linkReceiverAccounts(store: UserStore, receiver: ReceiverAdminClient): Promise<LinkResult> {
  const result: LinkResult = { linked: [], created: [], alreadyLinked: [] };
  const accounts = await receiver.list();
  const now = new Date().toISOString();
  for (const acc of accounts) {
    const name = acc.username.toLowerCase();
    const user = store.getUser(name);
    // The receiver's allowed roots (empty = all); an older receiver only has the seen roots
    const sync: SidecarSyncLogin = { enabled: true, roots: acc.allowed_roots ?? acc.roots ?? [], linkedAt: now };
    if (!user) {
      if (store.createSyncOnlyUser(name, sync)) result.created.push(name);
    } else if (user.sidecarSync?.enabled) {
      result.alreadyLinked.push(name);
    } else {
      store.setSidecarSync(name, sync);
      result.linked.push(name);
    }
  }
  return result;
}

/**
 * Link receiver accounts once at start (best effort). Retries while the
 * receiver is not reachable. Never changes a password.
 */
export function scheduleAutoLink(store: UserStore, receiver: ReceiverAdminClient, delays = [5000, 60000, 300000, 900000]): void {
  let i = 0;
  const run = async () => {
    if (!receiver.configured()) return;
    try {
      const r = await linkReceiverAccounts(store, receiver);
      if (r.created.length || r.linked.length) {
        console.error(`[SidecarAccounts] linked receiver accounts: ${[...r.linked, ...r.created].join(', ')}`);
      }
    } catch (err) {
      if (++i < delays.length) setTimeout(run, delays[i]).unref();
      else console.error(`[SidecarAccounts] auto link failed: ${errText(err)}`);
    }
  };
  setTimeout(run, delays[0]).unref();
}

export interface SidecarAccountsRouterOptions {
  userStore: UserStore;
  requireAdmin: RequestHandler;
  receiver?: ReceiverAdminClient;
}

function errStatus(err: unknown): number {
  return err instanceof ReceiverAdminError && err.status && err.status >= 400 ? (err.status >= 500 ? 502 : err.status) : 500;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Routes for /admin/users/:username/sidecar-sync. */
export function createUserSyncRouter(opts: SidecarAccountsRouterOptions): Router {
  const router = Router();
  const store = opts.userStore;
  const receiver = opts.receiver ?? new ReceiverAdminClient();

  router.put('/:username/sidecar-sync', opts.requireAdmin, async (req: Request, res: Response) => {
    const username = String(req.params.username || '').toLowerCase();
    const user = store.getUser(username);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'This username can not be a sync login (1-64 of letters, digits, ".", "_", "-")' });

    const b = (req.body ?? {}) as Record<string, unknown>;
    const enabled = b.enabled !== false;
    const roots = cleanRoots(b.roots ?? user.sidecarSync?.roots);
    if (typeof roots === 'string') return res.status(400).json({ error: roots });
    const password = typeof b.password === 'string' ? b.password : '';
    if (password && password.length < 8) return res.status(400).json({ error: 'Sync password must be at least 8 characters' });

    try {
      if (!enabled) {
        if (user.sidecarSync?.enabled) await removeIfThere(receiver, username);
        store.setSidecarSync(username, { enabled: false, roots });
        return res.json({ user: store.getUser(username) });
      }

      const accounts = await receiver.list();
      const acc = accounts.find(a => a.username.toLowerCase() === username);
      if (!acc) {
        if (!password) return res.status(400).json({ error: 'Set a sync password to turn on the sync login' });
        await receiver.add(username, password, roots);
      } else {
        if (password) await receiver.setPassword(acc.username, password);
        if (!sameRoots(roots, acc.allowed_roots ?? [])) await receiver.setRoots(acc.username, roots);
      }
      store.setSidecarSync(username, { enabled: true, roots, linkedAt: user.sidecarSync?.linkedAt || new Date().toISOString() });
      return res.json({ user: store.getUser(username) });
    } catch (err) {
      return res.status(errStatus(err)).json({ error: errText(err) });
    }
  });

  router.delete('/:username/sidecar-sync', opts.requireAdmin, async (req: Request, res: Response) => {
    const username = String(req.params.username || '').toLowerCase();
    const user = store.getUser(username);
    if (!user) return res.status(404).json({ error: 'User not found' });
    try {
      await removeIfThere(receiver, username);
      store.setSidecarSync(username, undefined);
      return res.json({ user: store.getUser(username) });
    } catch (err) {
      return res.status(errStatus(err)).json({ error: errText(err) });
    }
  });

  return router;
}

async function removeIfThere(receiver: ReceiverAdminClient, username: string): Promise<void> {
  const accounts = await receiver.list();
  const acc = accounts.find(a => a.username.toLowerCase() === username);
  if (acc) await receiver.remove(acc.username);
}

export interface AccountRow extends ReceiverAccount {
  user: string | null;
  dashboardLogin: boolean | null;
}

/** Routes for /admin/sidecar/accounts (read-only list) and /link. */
export function createSidecarAccountsRouter(opts: SidecarAccountsRouterOptions): Router {
  const router = Router();
  const store = opts.userStore;
  const receiver = opts.receiver ?? new ReceiverAdminClient();

  router.get('/', async (_req: Request, res: Response) => {
    if (!receiver.configured()) return res.json({ configured: false, accounts: [], roots: [], message: 'Receiver not set up' });
    try {
      const users = new Map<string, UserPublic>(store.getAllUsers().map(u => [u.username, u]));
      const all = await receiver.listAll();
      const accounts: AccountRow[] = all.accounts.map(a => {
        const u = users.get(a.username.toLowerCase());
        return { ...a, user: u ? u.username : null, dashboardLogin: u ? u.dashboardLogin : null };
      });
      return res.json({ configured: true, accounts, roots: knownRoots(all.roots, all.accounts) });
    } catch (err) {
      return res.json({ configured: true, accounts: [], roots: [], error: errText(err) });
    }
  });

  router.post('/link', opts.requireAdmin, async (_req: Request, res: Response) => {
    try {
      return res.json(await linkReceiverAccounts(store, receiver));
    } catch (err) {
      return res.status(errStatus(err)).json({ error: errText(err) });
    }
  });

  return router;
}
