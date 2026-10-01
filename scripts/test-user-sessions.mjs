#!/usr/bin/env node
// End-to-end check that MCP sessions know their logged-in user (HTTP mode, OAuth).
// Creates two test users, gets an access token for each through the real OAuth flow
// (dynamic client registration -> /authorize -> login form -> /token, with PKCE),
// then checks per-user project scope, /admin/sessions, MCP_REQUIRE_AUTH, and that
// the scope survives a server restart. Test users and the OAuth client are deleted at the end.
// Usage: npm run build && node scripts/test-user-sessions.mjs
// Env overrides: TEST_PORT, TEST_INSTANCE, TEST_PROJECT_A, TEST_PROJECT_B
// Never prints passwords or tokens.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = parseInt(process.env.TEST_PORT || '3998', 10);
const BASE = `http://localhost:${PORT}`;
const INSTANCE = process.env.TEST_INSTANCE || 'local';
const A = process.env.TEST_PROJECT_A || 'demo';
const B = process.env.TEST_PROJECT_B || 'poppy';
const ADMIN_AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');
const REDIRECT_URI = 'http://localhost:1/callback';
const SCOPE = 'mcp:read mcp:write';

const suffix = crypto.randomBytes(3).toString('hex');
const USERS = [
  { username: `test-u1-${suffix}`, password: crypto.randomBytes(12).toString('hex') },
  { username: `test-u2-${suffix}`, password: crypto.randomBytes(12).toString('hex') },
];

const logTail = [];
let child;
let failures = 0;
let clients = [];
let oauthClientId = null;
const createdUsers = [];

function check(name, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
}

function startServer(extraEnv = {}) {
  child = spawn(process.execPath, ['--max-old-space-size=8192', 'dist/index.js'], {
    cwd: ROOT,
    env: { ...process.env, MCP_TRANSPORT: 'http', MCP_PORT: String(PORT), ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const onData = (buf) => {
    for (const line of buf.toString().split('\n')) {
      if (!line) continue;
      logTail.push(line);
      if (logTail.length > 40) logTail.shift();
    }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('exit', (code) => { child.exited = true; child.exitCode = code; });
}

async function waitForHealth(timeoutMs = 120_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (child.exited) throw new Error(`server exited early with code ${child.exitCode}`);
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.status === 200 && (await r.json()).initialized) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('timed out waiting for /health');
}

async function stopServer() {
  if (!child || child.exited) return;
  const done = new Promise((r) => child.once('exit', r));
  child.kill('SIGTERM');
  await Promise.race([done, new Promise((r) => setTimeout(r, 10_000))]);
  if (!child.exited) child.kill('SIGKILL');
}

async function closeClients() {
  for (const { client } of clients) { try { await client.close(); } catch { /* ignore */ } }
  clients = [];
}

function admin(method, p, body) {
  return fetch(`${BASE}/admin${p}`, {
    method,
    headers: { Authorization: ADMIN_AUTH, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function short(s) {
  s = String(s ?? '');
  return s.length > 300 ? s.slice(0, 300) + '...' : s;
}

// --- OAuth ---------------------------------------------------------------

async function registerClient() {
  const r = await fetch(`${BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: `test-user-sessions-${suffix}`,
      redirect_uris: [REDIRECT_URI],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: SCOPE,
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.client_id) throw new Error(`client registration failed: ${r.status} ${short(JSON.stringify(j))}`);
  return { client_id: j.client_id, client_secret: j.client_secret };
}

// Drive the browser flow headlessly: GET /authorize (login page), POST the login form, read the code from the redirect.
async function getAccessToken(oauthClient, user) {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(8).toString('hex');

  const authUrl = new URL(`${BASE}/authorize`);
  for (const [k, v] of Object.entries({
    response_type: 'code', client_id: oauthClient.client_id, redirect_uri: REDIRECT_URI,
    code_challenge: challenge, code_challenge_method: 'S256', scope: SCOPE, state,
  })) authUrl.searchParams.set(k, v);
  const page = await fetch(authUrl, { redirect: 'manual' });
  const html = await page.text();
  if (page.status !== 200 || !html.includes('/oauth/login')) {
    throw new Error(`GET /authorize did not return the login page: ${page.status} ${short(html)}`);
  }

  const login = await fetch(`${BASE}/oauth/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: oauthClient.client_id, redirect_uri: REDIRECT_URI, code_challenge: challenge,
      scope: SCOPE, state, username: user.username, password: user.password,
    }),
  });
  const location = login.headers.get('location');
  if (login.status !== 302 || !location) throw new Error(`login for ${user.username} did not redirect: ${login.status}`);
  const redirected = new URL(location);
  const code = redirected.searchParams.get('code');
  if (!code || redirected.searchParams.get('state') !== state) throw new Error(`login redirect for ${user.username} has no code or wrong state`);

  const form = new URLSearchParams({
    grant_type: 'authorization_code', code, code_verifier: verifier,
    redirect_uri: REDIRECT_URI, client_id: oauthClient.client_id,
  });
  if (oauthClient.client_secret) form.set('client_secret', oauthClient.client_secret);
  const tr = await fetch(`${BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const tj = await tr.json().catch(() => ({}));
  if (!tr.ok || !tj.access_token) throw new Error(`token exchange for ${user.username} failed: ${tr.status} ${tj.error || ''}`);
  return tj.access_token;
}

// --- MCP -----------------------------------------------------------------

async function openSession(label, token) {
  const client = new Client({ name: `user-sessions-${label}`, version: '1.0.0' });
  const opts = token ? { requestInit: { headers: { Authorization: `Bearer ${token}` } } } : undefined;
  const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), opts);
  await client.connect(transport);
  clients.push({ client, transport });
  return { client, transport, label };
}

function toolText(result) {
  return (result.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
}

async function call(s, name, args) {
  const result = await s.client.callTool({ name, arguments: args }, undefined, { timeout: 300_000 });
  return { text: toolText(result), isError: !!result.isError };
}

function primaryOf(text) {
  try {
    const j = JSON.parse(text);
    const p = j.primaryProject ?? j;
    return { instance: p.instance ?? p.instanceName ?? null, project: p.project ?? p.projectName ?? null };
  } catch { return { instance: null, project: null }; }
}

async function listSessions() {
  const res = await admin('GET', '/sessions');
  const body = await res.text();
  let list = [];
  try {
    const j = JSON.parse(body);
    list = Array.isArray(j) ? j : (j.sessions || []);
  } catch { /* leave empty */ }
  return { status: res.status, list, body };
}

// --- Test ----------------------------------------------------------------

async function phase1() {
  startServer();
  await waitForHealth();
  console.log('Server healthy (MCP_REQUIRE_AUTH off)');

  for (const u of USERS) {
    const r = await admin('POST', '/users', { username: u.username, password: u.password, role: 'user' });
    if (r.status === 201) createdUsers.push(u.username);
    check(`create test user ${u.username}`, r.status === 201, `status ${r.status}`);
  }

  const oauthClient = await registerClient();
  oauthClientId = oauthClient.client_id;
  check('dynamic client registration', true, `client ${oauthClientId.slice(0, 8)}`);

  const tokens = [];
  for (const u of USERS) {
    try {
      tokens.push(await getAccessToken(oauthClient, u));
      check(`access token for ${u.username}`, true);
    } catch (err) {
      tokens.push(null);
      check(`access token for ${u.username}`, false, err.message);
    }
  }
  if (!tokens[0] || !tokens[1]) throw new Error('cannot continue without both tokens');

  const [s1, s2] = await Promise.all([openSession('U1', tokens[0]), openSession('U2', tokens[1])]);
  check('two distinct session ids', s1.transport.sessionId && s2.transport.sessionId && s1.transport.sessionId !== s2.transport.sessionId);

  const [sw1, sw2] = await Promise.all([
    call(s1, 'switchSkySparkProject', { instanceName: INSTANCE, projectName: A }),
    call(s2, 'switchSkySparkProject', { instanceName: INSTANCE, projectName: B }),
  ]);
  check(`U1 switch to ${INSTANCE}/${A}`, !sw1.isError, sw1.isError ? short(sw1.text) : '');
  check(`U2 switch to ${INSTANCE}/${B}`, !sw2.isError, sw2.isError ? short(sw2.text) : '');

  const [p1, p2] = await Promise.all([call(s1, 'getPrimaryProject', {}), call(s2, 'getPrimaryProject', {})]);
  const pp1 = primaryOf(p1.text);
  const pp2 = primaryOf(p2.text);
  check(`getPrimaryProject U1 == ${INSTANCE}/${A}`, pp1.instance === INSTANCE && pp1.project === A, `got ${pp1.instance}/${pp1.project}`);
  check(`getPrimaryProject U2 == ${INSTANCE}/${B}`, pp2.instance === INSTANCE && pp2.project === B, `got ${pp2.instance}/${pp2.project}`);

  const anon = await openSession('anon');
  check('anonymous connect allowed with flag off', !!anon.transport.sessionId);

  const { status, list, body } = await listSessions();
  check('GET /admin/sessions returns 200', status === 200, `status ${status}`);
  const expected = [[s1, USERS[0].username, A], [s2, USERS[1].username, B]];
  for (const [s, username, project] of expected) {
    const e = list.find((x) => x.sessionId === s.transport.sessionId);
    check(`/admin/sessions lists ${s.label}`, !!e, e ? '' : short(body));
    if (!e) continue;
    check(`/admin/sessions ${s.label} username == ${username}`, e.username === username, `got ${e.username}`);
    check(`/admin/sessions ${s.label} has userId`, !!e.userId, `got ${e.userId}`);
    check(`/admin/sessions ${s.label} clientId == registered client`, e.clientId === oauthClientId, `got ${e.clientId ? e.clientId.slice(0, 8) : e.clientId}`);
    check(`/admin/sessions ${s.label} project == ${INSTANCE}/${project}`, e.instance === INSTANCE && e.project === project, `got ${e.instance}/${e.project}`);
  }
  const a = list.find((x) => x.sessionId === anon.transport.sessionId);
  check('/admin/sessions anonymous session has no userId', !!a && !a.userId, a ? `got ${a.userId}` : 'missing');

  await closeClients();
  await stopServer();
  return tokens;
}

async function phase2(tokens) {
  startServer({ MCP_REQUIRE_AUTH: 'true' });
  await waitForHealth();
  console.log('Server restarted (MCP_REQUIRE_AUTH=true)');

  const r = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'no-token', version: '1.0.0' } },
    }),
  });
  check('no-token request gets 401 with MCP_REQUIRE_AUTH=true', r.status === 401, `status ${r.status}`);

  const s1 = await openSession('U1-again', tokens[0]);
  check('U1 reconnects with the same token after restart', !!s1.transport.sessionId);
  const p = primaryOf((await call(s1, 'getPrimaryProject', {})).text);
  check(`U1 scope survived restart: ${INSTANCE}/${A}`, p.instance === INSTANCE && p.project === A, `got ${p.instance}/${p.project}`);

  const { list } = await listSessions();
  const e = list.find((x) => x.sessionId === s1.transport.sessionId);
  check(`/admin/sessions after restart shows ${USERS[0].username}`, e?.username === USERS[0].username, `got ${e?.username}`);
}

async function cleanup() {
  // Needs a running server; start one if the run died between phases.
  if (!child || child.exited) {
    if (!createdUsers.length && !oauthClientId) return;
    startServer();
    await waitForHealth();
  }
  for (const u of createdUsers) {
    const r = await admin('DELETE', `/users/${encodeURIComponent(u)}`);
    check(`delete test user ${u}`, r.ok, `status ${r.status}`);
  }
  if (oauthClientId) {
    const r = await admin('DELETE', `/oauth/clients/${encodeURIComponent(oauthClientId)}`);
    check('delete test OAuth client', r.ok, `status ${r.status}`);
  }
}

console.log(`Projects: U1=${INSTANCE}/${A}  U2=${INSTANCE}/${B}  port=${PORT}`);
try {
  const tokens = await phase1();
  await phase2(tokens);
} catch (err) {
  failures++;
  console.log(`FAIL  harness error -- ${err?.message || err}`);
  console.log('--- last 40 server log lines ---');
  console.log(logTail.join('\n'));
} finally {
  await closeClients();
  try { await cleanup(); } catch (err) { failures++; console.log(`FAIL  cleanup -- ${err?.message || err}`); }
  await stopServer();
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nALL CHECKS PASSED');
}
process.exit(failures ? 1 : 0);
