/**
 * Pinned fetch for the receiver's self-signed HTTPS.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as https from 'https';
import * as crypto from 'crypto';
import { execFileSync } from 'child_process';
import type { AddressInfo } from 'net';
import { createReceiverFetch, normalizeFingerprint } from '../admin/receiverFetch.js';

let tmp: string;
let server: https.Server;
let base: string;
let pin: string;
let gotAuth: string[] = [];
let haveOpenssl = true;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'axon-tls-'));
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes',
      '-keyout', path.join(tmp, 'k.pem'), '-out', path.join(tmp, 'c.pem'), '-days', '1', '-subj', '/CN=axon-receiver'], { stdio: 'ignore' });
  } catch {
    haveOpenssl = false;
    return;
  }
  const cert = fs.readFileSync(path.join(tmp, 'c.pem'));
  pin = 'SHA256:' + new crypto.X509Certificate(cert).fingerprint256;
  server = https.createServer({ key: fs.readFileSync(path.join(tmp, 'k.pem')), cert }, (req, res) => {
    gotAuth.push(String(req.headers.authorization));
    let b = '';
    req.on('data', c => { b += c; });
    req.on('end', () => {
      res.writeHead(req.url === '/v1/missing' ? 404 : 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ method: req.method, url: req.url, body: b ? JSON.parse(b) : null }));
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  base = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  if (server) await new Promise(r => server.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => { gotAuth = []; });

test('normalizeFingerprint takes the receiver and sidecar forms', () => {
  const hex = 'AB'.repeat(32);
  expect(normalizeFingerprint('SHA256:' + 'ab:'.repeat(31) + 'ab')).toBe(hex);
  expect(normalizeFingerprint(hex.toLowerCase())).toBe(hex);
  expect(normalizeFingerprint('nope')).toBeNull();
  expect(normalizeFingerprint(undefined)).toBeNull();
});

test('right pin: GET and POST work on a self-signed certificate', async () => {
  if (!haveOpenssl) return;
  const f = createReceiverFetch(() => pin);
  const r = await f(`${base}/v1/accounts`, { headers: { Authorization: 'Bearer t1' } });
  expect(r.status).toBe(200);
  expect(((await r.json()) as any).url).toBe('/v1/accounts');
  const p = await f(`${base}/v1/accounts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'x' }) });
  expect((await p.json()) as any).toMatchObject({ method: 'POST', body: { username: 'x' } });
  const m = await f(`${base}/v1/missing`);
  expect(m.status).toBe(404);
});

test('wrong pin: refused before the token is sent', async () => {
  if (!haveOpenssl) return;
  const f = createReceiverFetch(() => 'SHA256:' + '00:'.repeat(31) + '00');
  await expect(f(`${base}/v1/status`, { headers: { Authorization: 'Bearer secret-token' } })).rejects.toThrow(/does not match/);
  expect(gotAuth).toEqual([]);
});

test('bad pin text and no pin', async () => {
  if (!haveOpenssl) return;
  await expect(createReceiverFetch(() => 'garbage')(`${base}/v1/status`)).rejects.toThrow(/not a SHA-256/);
  // No pin: normal fetch, which rejects the self-signed certificate
  await expect(createReceiverFetch(() => undefined)(`${base}/v1/status`)).rejects.toThrow();
});

test('timeout signal aborts', async () => {
  if (!haveOpenssl) return;
  const f = createReceiverFetch(() => pin);
  await expect(f(`${base}/v1/status`, { signal: AbortSignal.timeout(0) })).rejects.toThrow();
});
