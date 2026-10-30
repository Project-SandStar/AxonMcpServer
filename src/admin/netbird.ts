/**
 * "NetBird" admin API: lets an admin join this server to the NetBird network.
 *
 * Mounted under /admin/netbird, behind the admin Basic Auth (admin role only).
 *
 *   GET    /admin/netbird        settings + live status (never the full key)
 *   PUT    /admin/netbird        body {setupKey?, hostname?, managementUrl?, wireguardPort?, enabled?,
 *                                      https?: {enabled?, domain?, cloudflareToken?, email?}}
 *   DELETE /admin/netbird/key    remove the key and set enabled=false
 *   DELETE /admin/netbird/https-token  remove the Cloudflare token
 *
 * The Caddy sidecar (docker/caddy-entrypoint.sh) reads the https part and writes
 * <ctl>/caddy-status.json. The setup key and the token are never returned or logged.
 *
 * The settings go to <ctl>/config.json (mode 600). <ctl> is a Docker volume that
 * the NetBird sidecar container also mounts (docker/netbird-entrypoint.sh). That
 * script runs `netbird up` when config.json changes and writes
 * `netbird status --json` to <ctl>/status.json every 10 s.
 *
 * <ctl> = NETBIRD_CTL_DIR (default /netbird-ctl). If that folder is missing (local
 * dev, no NetBird container), settings go to <cacheDir>/netbird-ctl and the API
 * reports configured=false. That folder is a sub folder, so backups (top-level
 * cache files only) never pick up the key.
 */

import express, { Router, Request, Response, RequestHandler } from 'express';
import * as fs from 'fs';
import * as path from 'path';

export const DEFAULT_MANAGEMENT_URL = 'https://vpn.bas.co:443';
export const DEFAULT_HOSTNAME = 'axon';
export const DEFAULT_HTTPS_DOMAIN = 'vpn.bas.co';
const STATUS_MAX_AGE_MS = 60_000;

export interface HttpsConfig {
  enabled: boolean;
  domain: string;
  cloudflareToken: string;
  email: string;
}

/** Key order matters: docker/netbird-entrypoint.sh reads top-level fields with sed. */
export interface NetbirdConfig {
  setupKey: string;
  hostname: string;
  managementUrl: string;
  wireguardPort: number;
  enabled: boolean;
  https: HttpsConfig;
  updatedAt: string;
}

export interface CaddyStatus {
  running: boolean;
  certificate: { names: string[]; notAfter: string | null } | null;
  error: string | null;
  updatedAt: string;
  stale: boolean;
}

export interface HttpsReply {
  enabled: boolean;
  domain: string;
  email: string;
  hasToken: boolean;
  tokenHint: string | null;
  address: string;
  status: CaddyStatus | null;
}

export interface NetbirdStatus {
  connected: boolean;
  fqdn: string | null;
  ip: string | null;
  peersConnected: number;
  peersTotal: number;
  updatedAt: string;
  stale: boolean;
}

export interface NetbirdReply {
  configured: boolean;
  enabled: boolean;
  hostname: string;
  managementUrl: string;
  hasKey: boolean;
  keyHint: string | null;
  wireguardPort: number;
  status: NetbirdStatus | null;
  https: HttpsReply;
}

// ============================================
// Files
// ============================================

export function netbirdCtlDir(cacheDir: string): { dir: string; configured: boolean } {
  const dir = process.env.NETBIRD_CTL_DIR || '/netbird-ctl';
  try {
    if (fs.statSync(dir).isDirectory()) return { dir, configured: true };
  } catch { /* missing */ }
  return { dir: path.join(path.resolve(cacheDir), 'netbird-ctl'), configured: false };
}

export function readNetbirdConfig(dir: string): NetbirdConfig {
  const base: NetbirdConfig = {
    setupKey: '',
    hostname: DEFAULT_HOSTNAME,
    managementUrl: DEFAULT_MANAGEMENT_URL,
    wireguardPort: 0,
    enabled: false,
    https: { enabled: false, domain: DEFAULT_HTTPS_DOMAIN, cloudflareToken: '', email: '' },
    updatedAt: '',
  };
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf-8'));
    const h = raw.https && typeof raw.https === 'object' ? raw.https : {};
    return {
      setupKey: typeof raw.setupKey === 'string' ? raw.setupKey : '',
      hostname: typeof raw.hostname === 'string' && raw.hostname ? raw.hostname : base.hostname,
      managementUrl: typeof raw.managementUrl === 'string' && raw.managementUrl ? raw.managementUrl : base.managementUrl,
      wireguardPort: validWireguardPort(raw.wireguardPort) ? raw.wireguardPort : 0,
      enabled: raw.enabled === true,
      https: {
        enabled: h.enabled === true,
        domain: typeof h.domain === 'string' && DOMAIN_RE.test(h.domain) ? h.domain : DEFAULT_HTTPS_DOMAIN,
        cloudflareToken: typeof h.cloudflareToken === 'string' ? h.cloudflareToken : '',
        email: typeof h.email === 'string' ? h.email : '',
      },
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
    };
  } catch {
    return base;
  }
}

/** One key per line: docker/netbird-entrypoint.sh reads it with sed (no jq in the image). */
export function writeNetbirdConfig(dir: string, cfg: NetbirdConfig): void {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'config.json');
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
  try { fs.chmodSync(tmp, 0o600); } catch { /* ignore */ }
  fs.renameSync(tmp, file);
}

/** Reads status.json (raw `netbird status --json`). Null if missing or bad. */
export function readNetbirdStatus(dir: string, now = Date.now()): NetbirdStatus | null {
  const file = path.join(dir, 'status.json');
  try {
    const stat = fs.statSync(file);
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const ip = typeof raw.netbirdIp === 'string' && raw.netbirdIp ? raw.netbirdIp.split('/')[0] : null;
    const fqdn = typeof raw.fqdn === 'string' && raw.fqdn ? raw.fqdn : null;
    const stale = now - stat.mtimeMs > STATUS_MAX_AGE_MS;
    return {
      connected: !stale && raw.management?.connected === true && !!ip,
      fqdn,
      ip,
      peersConnected: Number(raw.peers?.connected) || 0,
      peersTotal: Number(raw.peers?.total) || 0,
      updatedAt: new Date(stat.mtimeMs).toISOString(),
      stale,
    };
  } catch {
    return null;
  }
}

/** Reads caddy-status.json (written by docker/caddy-entrypoint.sh). Null if missing or bad. */
export function readCaddyStatus(dir: string, now = Date.now()): CaddyStatus | null {
  const file = path.join(dir, 'caddy-status.json');
  try {
    const stat = fs.statSync(file);
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const stale = now - stat.mtimeMs > STATUS_MAX_AGE_MS;
    const c = raw.certificate && typeof raw.certificate === 'object' ? raw.certificate : null;
    return {
      running: !stale && raw.running === true,
      certificate: c ? {
        names: Array.isArray(c.names) ? c.names.filter((n: unknown): n is string => typeof n === 'string') : [],
        notAfter: typeof c.notAfter === 'string' && c.notAfter ? c.notAfter : null,
      } : null,
      error: typeof raw.error === 'string' && raw.error ? raw.error : null,
      updatedAt: new Date(stat.mtimeMs).toISOString(),
      stale,
    };
  } catch {
    return null;
  }
}

// ============================================
// Validation
// ============================================

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,200}$/;
const EMAIL_RE = /^[^\s@"'\\]+@[^\s@"'\\]+\.[^\s@"'\\]+$/;

export function validWireguardPort(p: unknown): p is number {
  return typeof p === 'number' && Number.isInteger(p) && p >= 0 && p <= 65535;
}

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const KEY_RE = /^[A-Za-z0-9._~+=-]{1,256}$/;

export interface NetbirdUpdate {
  setupKey?: string;
  hostname?: string;
  managementUrl?: string;
  wireguardPort?: number;
  enabled?: boolean;
  https?: Partial<HttpsConfig>;
}

/** Checks a PUT body. Returns the clean update or an error message. */
export function validateNetbirdUpdate(body: unknown): NetbirdUpdate | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: NetbirdUpdate = {};

  if (b.setupKey !== undefined) {
    if (typeof b.setupKey !== 'string' || !b.setupKey.trim()) return '"setupKey" must not be empty';
    const key = b.setupKey.trim();
    if (!KEY_RE.test(key)) return '"setupKey" has characters that are not allowed';
    out.setupKey = key;
  }

  if (b.hostname !== undefined) {
    const h = typeof b.hostname === 'string' ? b.hostname.trim().toLowerCase() : '';
    if (!HOSTNAME_RE.test(h)) return '"hostname" must be 1-63 characters: a-z, 0-9 and "-" (not at the start or end)';
    out.hostname = h;
  }

  if (b.managementUrl !== undefined) {
    const u = typeof b.managementUrl === 'string' ? b.managementUrl.trim() : '';
    let parsed: URL;
    try { parsed = new URL(u); } catch { return '"managementUrl" must be a https URL'; }
    if (parsed.protocol !== 'https:' || !parsed.hostname || /["'\s\\]/.test(u)) return '"managementUrl" must be a https URL';
    out.managementUrl = u;
  }

  if (b.wireguardPort !== undefined) {
    if (!validWireguardPort(b.wireguardPort)) return '"wireguardPort" must be a whole number from 0 to 65535 (0 = NetBird picks)';
    out.wireguardPort = b.wireguardPort;
  }

  if (b.enabled !== undefined) {
    if (typeof b.enabled !== 'boolean') return '"enabled" must be true or false';
    out.enabled = b.enabled;
  }

  if (b.https !== undefined) {
    if (!b.https || typeof b.https !== 'object' || Array.isArray(b.https)) return '"https" must be an object';
    const h = b.https as Record<string, unknown>;
    const o: Partial<HttpsConfig> = {};
    if (h.enabled !== undefined) {
      if (typeof h.enabled !== 'boolean') return '"https.enabled" must be true or false';
      o.enabled = h.enabled;
    }
    if (h.domain !== undefined) {
      const dom = typeof h.domain === 'string' ? h.domain.trim().toLowerCase() : '';
      if (!DOMAIN_RE.test(dom)) return '"https.domain" must be a DNS name like vpn.bas.co';
      o.domain = dom;
    }
    if (h.cloudflareToken !== undefined) {
      const t = typeof h.cloudflareToken === 'string' ? h.cloudflareToken.trim() : '';
      if (!TOKEN_RE.test(t)) return '"https.cloudflareToken" must be 20-200 characters: letters, digits, "-" and "_"';
      o.cloudflareToken = t;
    }
    if (h.email !== undefined) {
      const e = typeof h.email === 'string' ? h.email.trim() : null;
      if (e === null || (e !== '' && !EMAIL_RE.test(e))) return '"https.email" must be empty or a valid address';
      o.email = e;
    }
    out.https = o;
  }

  return out;
}

// ============================================
// Router
// ============================================

function reply(dir: string, configured: boolean): NetbirdReply {
  const cfg = readNetbirdConfig(dir);
  return {
    configured,
    enabled: cfg.enabled,
    hostname: cfg.hostname,
    managementUrl: cfg.managementUrl,
    hasKey: !!cfg.setupKey,
    keyHint: cfg.setupKey ? cfg.setupKey.slice(-4) : null,
    wireguardPort: cfg.wireguardPort,
    status: configured ? readNetbirdStatus(dir) : null,
    https: {
      enabled: cfg.https.enabled,
      domain: cfg.https.domain,
      email: cfg.https.email,
      hasToken: !!cfg.https.cloudflareToken,
      tokenHint: cfg.https.cloudflareToken ? cfg.https.cloudflareToken.slice(-4) : null,
      address: `https://${cfg.hostname}.${cfg.https.domain}`,
      status: configured ? readCaddyStatus(dir) : null,
    },
  };
}

function nextUpdatedAt(prev: string): string {
  let now = new Date().toISOString();
  // The entrypoint acts when updatedAt changes, so never write the same value twice.
  if (now === prev) now = new Date(Date.parse(prev) + 1).toISOString();
  return now;
}

export function createNetbirdRouter(opts: { cacheDir: string; requireAdmin: RequestHandler }): Router {
  const router = Router();
  router.use(express.json());
  router.use(opts.requireAdmin);

  router.get('/', (_req: Request, res: Response) => {
    const { dir, configured } = netbirdCtlDir(opts.cacheDir);
    res.json(reply(dir, configured));
  });

  router.put('/', (req: Request, res: Response) => {
    const update = validateNetbirdUpdate(req.body);
    if (typeof update === 'string') return res.status(400).json({ error: update });

    const { dir, configured } = netbirdCtlDir(opts.cacheDir);
    const cur = readNetbirdConfig(dir);
    const next: NetbirdConfig = {
      setupKey: update.setupKey ?? cur.setupKey,
      hostname: update.hostname ?? cur.hostname,
      managementUrl: update.managementUrl ?? cur.managementUrl,
      wireguardPort: update.wireguardPort ?? cur.wireguardPort,
      enabled: update.enabled ?? cur.enabled,
      https: { ...cur.https, ...(update.https ?? {}) },
      updatedAt: nextUpdatedAt(cur.updatedAt),
    };
    if (next.enabled && !next.setupKey) {
      return res.status(400).json({ error: 'Paste a setup key before you enable NetBird' });
    }
    try {
      writeNetbirdConfig(dir, next);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to save NetBird settings', details: error?.code || 'write error' });
    }
    console.error(`[netbird] settings saved (hostname=${next.hostname}, enabled=${next.enabled}, key=${next.setupKey ? 'set' : 'not set'}, wireguardPort=${next.wireguardPort}, https=${next.https.enabled}, token=${next.https.cloudflareToken ? 'set' : 'not set'})`);
    return res.json(reply(dir, configured));
  });

  router.delete('/https-token', (_req: Request, res: Response) => {
    const { dir, configured } = netbirdCtlDir(opts.cacheDir);
    const cur = readNetbirdConfig(dir);
    try {
      writeNetbirdConfig(dir, { ...cur, https: { ...cur.https, cloudflareToken: '' }, updatedAt: nextUpdatedAt(cur.updatedAt) });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to remove Cloudflare token', details: error?.code || 'write error' });
    }
    console.error('[netbird] Cloudflare token removed');
    return res.json(reply(dir, configured));
  });

  router.delete('/key', (_req: Request, res: Response) => {
    const { dir, configured } = netbirdCtlDir(opts.cacheDir);
    const cur = readNetbirdConfig(dir);
    try {
      writeNetbirdConfig(dir, { ...cur, setupKey: '', enabled: false, updatedAt: nextUpdatedAt(cur.updatedAt) });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to remove NetBird key', details: error?.code || 'write error' });
    }
    console.error('[netbird] key removed, NetBird disabled');
    return res.json(reply(dir, configured));
  });

  return router;
}
