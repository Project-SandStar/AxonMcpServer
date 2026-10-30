/**
 * "NetBird" admin API: validation, key never returned, keyHint, delete, status file.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import {
  createNetbirdRouter,
  validateNetbirdUpdate,
  readNetbirdStatus,
  readCaddyStatus,
  validWireguardPort,
  DEFAULT_HOSTNAME,
  DEFAULT_MANAGEMENT_URL,
} from '../admin/netbird';

const KEY = 'A1B2C3D4-E5F6-7890-ABCD-EF12345678wxyz';
const TOKEN = 'cfTokenSecretValue_0123456789-abcd';

let tmp: string;
let ctl: string;
let server: Server;
let base: string;
let role = 'admin';
const oldEnv = process.env.NETBIRD_CTL_DIR;

async function call(method: string, url: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text, json: JSON.parse(text) };
}

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'netbird-test-'));
  ctl = path.join(tmp, 'ctl');
  fs.mkdirSync(ctl);
  process.env.NETBIRD_CTL_DIR = ctl;
  const app = express();
  const requireAdmin = (_req: Request, res: Response, next: NextFunction) =>
    role === 'admin' ? next() : res.status(403).json({ error: 'Admin access required' });
  app.use('/admin/netbird', createNetbirdRouter({ cacheDir: path.join(tmp, 'cache'), requireAdmin }));
  server = await new Promise<Server>(r => { const s = app.listen(0, () => r(s)); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise(r => server.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
  if (oldEnv === undefined) delete process.env.NETBIRD_CTL_DIR;
  else process.env.NETBIRD_CTL_DIR = oldEnv;
});

beforeEach(() => {
  role = 'admin';
  for (const f of fs.readdirSync(ctl)) fs.rmSync(path.join(ctl, f), { force: true });
});

describe('validateNetbirdUpdate', () => {
  it('accepts a good body', () => {
    expect(validateNetbirdUpdate({ setupKey: ' abc ', hostname: 'Axon-1', managementUrl: 'https://vpn.bas.co:443', enabled: true }))
      .toEqual({ setupKey: 'abc', hostname: 'axon-1', managementUrl: 'https://vpn.bas.co:443', enabled: true });
  });
  it('accepts an empty body', () => {
    expect(validateNetbirdUpdate({})).toEqual({});
  });
  it.each([
    [{ hostname: '' }, 'hostname'],
    [{ hostname: '-axon' }, 'hostname'],
    [{ hostname: 'axon-' }, 'hostname'],
    [{ hostname: 'ax.on' }, 'hostname'],
    [{ hostname: 'ax_on' }, 'hostname'],
    [{ hostname: 'a'.repeat(64) }, 'hostname'],
    [{ managementUrl: 'http://vpn.bas.co' }, 'managementUrl'],
    [{ managementUrl: 'not a url' }, 'managementUrl'],
    [{ setupKey: '' }, 'setupKey'],
    [{ setupKey: '   ' }, 'setupKey'],
    [{ setupKey: 'a b' }, 'setupKey'],
    [{ setupKey: 'a"b' }, 'setupKey'],
    [{ enabled: 'yes' }, 'enabled'],
  ])('rejects %j', (body, field) => {
    const r = validateNetbirdUpdate(body);
    expect(typeof r).toBe('string');
    expect(r).toContain(field);
  });
  it('accepts a 63 char hostname', () => {
    expect(validateNetbirdUpdate({ hostname: 'a'.repeat(63) })).toEqual({ hostname: 'a'.repeat(63) });
  });
});

describe('NetBird API', () => {
  it('GET gives defaults when nothing is saved', async () => {
    const r = await call('GET', '/admin/netbird');
    expect(r.status).toBe(200);
    expect(r.json).toEqual({
      configured: true, enabled: false, hostname: DEFAULT_HOSTNAME, managementUrl: DEFAULT_MANAGEMENT_URL,
      hasKey: false, keyHint: null, wireguardPort: 0, status: null,
      https: {
        enabled: false, domain: 'vpn.bas.co', email: '', hasToken: false, tokenHint: null,
        address: 'https://axon.vpn.bas.co', status: null,
      },
    });
  });

  it('PUT saves wireguardPort and https, never returns the token', async () => {
    await call('PUT', '/admin/netbird', { setupKey: KEY, enabled: true });
    const r = await call('PUT', '/admin/netbird', {
      wireguardPort: 51831,
      https: { enabled: true, domain: 'VPN.bas.co', cloudflareToken: TOKEN, email: 'ops@bas.co' },
    });
    expect(r.status).toBe(200);
    expect(r.text).not.toContain(TOKEN);
    expect(r.text).not.toContain(KEY);
    expect(r.json).toMatchObject({
      wireguardPort: 51831,
      https: { enabled: true, domain: 'vpn.bas.co', email: 'ops@bas.co', hasToken: true, tokenHint: 'abcd', address: 'https://axon.vpn.bas.co' },
    });
    const raw = fs.readFileSync(path.join(ctl, 'config.json'), 'utf-8');
    expect(JSON.parse(raw)).toMatchObject({ setupKey: KEY, wireguardPort: 51831, https: { enabled: true, cloudflareToken: TOKEN } });
    // The netbird entrypoint reads top-level fields with sed at a 2-space indent.
    expect(raw).toMatch(/^  "wireguardPort": 51831,$/m);
    expect(raw).toMatch(/^    "enabled": true,$/m);
    // Saving without the token keeps it.
    await call('PUT', '/admin/netbird', { https: { enabled: false } });
    expect(JSON.parse(fs.readFileSync(path.join(ctl, 'config.json'), 'utf-8')).https.cloudflareToken).toBe(TOKEN);
    expect((await call('GET', '/admin/netbird')).text).not.toContain(TOKEN);
  });

  it('DELETE /https-token removes only the token', async () => {
    await call('PUT', '/admin/netbird', { setupKey: KEY, https: { enabled: true, cloudflareToken: TOKEN } });
    const r = await call('DELETE', '/admin/netbird/https-token');
    expect(r.status).toBe(200);
    expect(r.json.https).toMatchObject({ hasToken: false, tokenHint: null, enabled: true });
    expect(r.json.hasKey).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(ctl, 'config.json'), 'utf-8')).https.cloudflareToken).toBe('');
  });

  it('PUT rejects bad wireguardPort and https input', async () => {
    for (const body of [
      { wireguardPort: -1 }, { wireguardPort: 65536 }, { wireguardPort: 1.5 }, { wireguardPort: '51820' },
      { https: 'on' }, { https: { enabled: 'yes' } }, { https: { domain: 'bad domain' } }, { https: { domain: 'localhost' } },
      { https: { cloudflareToken: 'short' } }, { https: { cloudflareToken: 'has space in it 0123456789' } },
      { https: { email: 'nope' } },
    ]) {
      expect((await call('PUT', '/admin/netbird', body)).status).toBe(400);
    }
    expect(fs.existsSync(path.join(ctl, 'config.json'))).toBe(false);
  });

  it('GET reads caddy-status.json from the Caddy container', async () => {
    fs.writeFileSync(path.join(ctl, 'caddy-status.json'), JSON.stringify({
      running: true, certificate: { names: ['axon.vpn.bas.co'], notAfter: '2027-01-28T00:00:00Z' }, error: null,
    }));
    const r = await call('GET', '/admin/netbird');
    expect(r.json.https.status).toMatchObject({
      running: true, certificate: { names: ['axon.vpn.bas.co'], notAfter: '2027-01-28T00:00:00Z' }, error: null, stale: false,
    });
  });

  it('PUT saves the key, never returns it, gives keyHint', async () => {
    const r = await call('PUT', '/admin/netbird', { setupKey: KEY, hostname: 'axon', enabled: true });
    expect(r.status).toBe(200);
    expect(r.text).not.toContain(KEY);
    expect(r.json.hasKey).toBe(true);
    expect(r.json.keyHint).toBe('wxyz');
    expect(r.json.enabled).toBe(true);

    const g = await call('GET', '/admin/netbird');
    expect(g.text).not.toContain(KEY);
    expect(g.json.keyHint).toBe('wxyz');

    const file = path.join(ctl, 'config.json');
    const saved = JSON.parse(fs.readFileSync(file, 'utf-8'));
    expect(saved).toMatchObject({ setupKey: KEY, hostname: 'axon', managementUrl: DEFAULT_MANAGEMENT_URL, enabled: true });
    expect(typeof saved.updatedAt).toBe('string');
    if (process.platform !== 'win32') expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it('PUT without setupKey keeps the old key and changes updatedAt', async () => {
    await call('PUT', '/admin/netbird', { setupKey: KEY, enabled: true });
    const before = JSON.parse(fs.readFileSync(path.join(ctl, 'config.json'), 'utf-8'));
    const r = await call('PUT', '/admin/netbird', { hostname: 'axon2' });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ hostname: 'axon2', hasKey: true, keyHint: 'wxyz' });
    const after = JSON.parse(fs.readFileSync(path.join(ctl, 'config.json'), 'utf-8'));
    expect(after.setupKey).toBe(KEY);
    expect(after.updatedAt).not.toBe(before.updatedAt);
  });

  it('PUT rejects bad input with 400 and writes nothing', async () => {
    for (const body of [{ hostname: 'bad_name' }, { managementUrl: 'http://x' }, { setupKey: '' }]) {
      const r = await call('PUT', '/admin/netbird', body);
      expect(r.status).toBe(400);
    }
    expect(fs.existsSync(path.join(ctl, 'config.json'))).toBe(false);
  });

  it('PUT enabled=true without a key is refused', async () => {
    const r = await call('PUT', '/admin/netbird', { enabled: true });
    expect(r.status).toBe(400);
  });

  it('DELETE /key removes the key and disables', async () => {
    await call('PUT', '/admin/netbird', { setupKey: KEY, enabled: true });
    const r = await call('DELETE', '/admin/netbird/key');
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ hasKey: false, keyHint: null, enabled: false });
    const saved = JSON.parse(fs.readFileSync(path.join(ctl, 'config.json'), 'utf-8'));
    expect(saved.setupKey).toBe('');
    expect(saved.enabled).toBe(false);
  });

  it('needs the admin role', async () => {
    role = 'viewer';
    expect((await call('GET', '/admin/netbird')).status).toBe(403);
    expect((await call('PUT', '/admin/netbird', { setupKey: KEY })).status).toBe(403);
    expect((await call('DELETE', '/admin/netbird/key')).status).toBe(403);
    expect((await call('DELETE', '/admin/netbird/https-token')).status).toBe(403);
  });

  it('GET reads status.json from the container', async () => {
    fs.writeFileSync(path.join(ctl, 'status.json'), JSON.stringify({
      netbirdIp: '100.92.1.5/16', fqdn: 'axon.vpn.bas.co',
      management: { connected: true }, peers: { connected: 2, total: 5 },
    }));
    const r = await call('GET', '/admin/netbird');
    expect(r.json.status).toMatchObject({ connected: true, fqdn: 'axon.vpn.bas.co', ip: '100.92.1.5', peersConnected: 2, peersTotal: 5, stale: false });
  });

  it('reports configured=false and saves under the cache dir when the ctl folder is missing', async () => {
    process.env.NETBIRD_CTL_DIR = path.join(tmp, 'missing');
    try {
      const r = await call('PUT', '/admin/netbird', { setupKey: KEY });
      expect(r.status).toBe(200);
      expect(r.json.configured).toBe(false);
      expect(r.json.status).toBeNull();
      expect(fs.existsSync(path.join(tmp, 'cache', 'netbird-ctl', 'config.json'))).toBe(true);
    } finally {
      process.env.NETBIRD_CTL_DIR = ctl;
    }
  });
});

describe('readNetbirdStatus', () => {
  it('marks old status as stale and not connected', () => {
    const f = path.join(ctl, 'status.json');
    fs.writeFileSync(f, JSON.stringify({ netbirdIp: '100.92.1.5/16', management: { connected: true } }));
    const s = readNetbirdStatus(ctl, Date.now() + 5 * 60_000);
    expect(s).toMatchObject({ connected: false, stale: true });
  });
  it('returns null for a bad file', () => {
    fs.writeFileSync(path.join(ctl, 'status.json'), 'not json');
    expect(readNetbirdStatus(ctl)).toBeNull();
  });
});

describe('readCaddyStatus and validWireguardPort', () => {
  it('marks old caddy status as stale and not running', () => {
    fs.writeFileSync(path.join(ctl, 'caddy-status.json'), JSON.stringify({ running: true, certificate: null }));
    expect(readCaddyStatus(ctl, Date.now() + 5 * 60_000)).toMatchObject({ running: false, stale: true, certificate: null });
  });
  it('returns null for a bad file', () => {
    fs.writeFileSync(path.join(ctl, 'caddy-status.json'), 'not json');
    expect(readCaddyStatus(ctl)).toBeNull();
  });
  it('checks the port range', () => {
    expect(validWireguardPort(0)).toBe(true);
    expect(validWireguardPort(65535)).toBe(true);
    expect(validWireguardPort(65536)).toBe(false);
    expect(validWireguardPort(-1)).toBe(false);
    expect(validWireguardPort('1')).toBe(false);
  });
});
