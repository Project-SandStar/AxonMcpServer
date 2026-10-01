#!/usr/bin/env node
// End-to-end check that SkySpark project scope is per MCP session (HTTP mode).
// Usage: npm run build && node scripts/test-session-scope.mjs
// Env overrides: TEST_PORT, TEST_INSTANCE, TEST_PROJECT_A, TEST_PROJECT_B, TEST_CODE
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = parseInt(process.env.TEST_PORT || '3999', 10);
const BASE = `http://localhost:${PORT}`;
const INSTANCE = process.env.TEST_INSTANCE || 'local';
const A = process.env.TEST_PROJECT_A || 'demo';
const B = process.env.TEST_PROJECT_B || 'poppy';
// projName() is not defined on this SkySpark build; about()->projName is.
const NAME_CODE = process.env.TEST_CODE || 'about()->projName';
const ADMIN_AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');

const logTail = [];
let child;
let failures = 0;
const clients = [];

function check(name, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
}

function startServer() {
  child = spawn(process.execPath, ['--max-old-space-size=8192', 'dist/index.js'], {
    cwd: ROOT,
    env: { ...process.env, MCP_TRANSPORT: 'http', MCP_PORT: String(PORT) },
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
      // Wait for background indexing too, so tool calls are not starved by startup work.
      if (r.status === 200 && (await r.json()).initialized) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('timed out waiting for /health');
}

function stopServer() {
  if (child && !child.exited) child.kill('SIGTERM');
}

async function openSession(label) {
  const client = new Client({ name: `session-scope-${label}`, version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`));
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

// Pull the projName() value out of an executeAxonCode response.
// Looks for a JSON grid first, then falls back to a quoted/bare project name.
function extractProjName(text) {
  const candidates = [A, B];
  try {
    const json = JSON.parse(text);
    const found = [];
    const walk = (v, key) => {
      if (typeof v === 'string') {
        if (candidates.includes(v) && !/project|url|instance/i.test(key || '')) found.push(v);
      } else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k);
    };
    for (const k of ['result', 'data', 'rows', 'grid', 'value', 'val']) if (json[k] !== undefined) walk(json[k], k);
    if (found.length === 0) walk(json, '');
    if (found.length) return found[0];
  } catch { /* not JSON */ }
  const m = text.match(new RegExp(`"(${candidates.join('|')})"`));
  return m ? m[1] : null;
}

async function projName(s, project) {
  const args = { code: NAME_CODE };
  if (project) args.project = project;
  const r = await call(s, 'executeAxonCode', args);
  return { name: extractProjName(r.text), raw: r.text };
}

function short(s) {
  return s.length > 300 ? s.slice(0, 300) + '...' : s;
}

async function main() {
  console.log(`Projects: A=${INSTANCE}/${A}  B=${INSTANCE}/${B}  port=${PORT}  code=${NAME_CODE}`);
  startServer();
  await waitForHealth();
  console.log('Server healthy');

  const [s1, s2] = await Promise.all([openSession('S1'), openSession('S2')]);
  check('two distinct session ids', s1.transport.sessionId && s2.transport.sessionId && s1.transport.sessionId !== s2.transport.sessionId,
    `${s1.transport.sessionId} / ${s2.transport.sessionId}`);

  const [sw1, sw2] = await Promise.all([
    call(s1, 'switchSkySparkProject', { instanceName: INSTANCE, projectName: A }),
    call(s2, 'switchSkySparkProject', { instanceName: INSTANCE, projectName: B }),
  ]);
  check('S1 switch to A succeeds', !sw1.isError, sw1.isError ? short(sw1.text) : '');
  check('S2 switch to B succeeds', !sw2.isError, sw2.isError ? short(sw2.text) : '');

  // Interleaved parallel calls: S1, S2, S1, S2, ...
  const jobs = [];
  for (let i = 0; i < 3; i++) {
    jobs.push(projName(s1).then((r) => ({ who: 'S1', want: A, i, ...r })));
    jobs.push(projName(s2).then((r) => ({ who: 'S2', want: B, i, ...r })));
  }
  for (const r of await Promise.all(jobs)) {
    check(`${r.who} projName() #${r.i + 1} == ${r.want}`, r.name === r.want, `got ${r.name}${r.name ? '' : ': ' + short(r.raw)}`);
  }

  const over = await projName(s1, `${INSTANCE}/${B}`);
  check(`S1 per-call override ${INSTANCE}/${B} returns ${B}`, over.name === B, `got ${over.name}${over.name ? '' : ': ' + short(over.raw)}`);
  const after = await projName(s1);
  check(`S1 plain projName() after override still ${A}`, after.name === A, `got ${after.name}${after.name ? '' : ': ' + short(after.raw)}`);

  const [p1, p2] = await Promise.all([call(s1, 'getPrimaryProject', {}), call(s2, 'getPrimaryProject', {})]);
  const primaryProject = (text) => {
    try {
      const j = JSON.parse(text);
      return j.project ?? j.projectName ?? j.primaryProject?.project ?? null;
    } catch { return null; }
  };
  check(`getPrimaryProject on S1 == ${A}`, primaryProject(p1.text) === A, `got ${primaryProject(p1.text)}: ${short(p1.text)}`);
  check(`getPrimaryProject on S2 == ${B}`, primaryProject(p2.text) === B, `got ${primaryProject(p2.text)}: ${short(p2.text)}`);

  const res = await fetch(`${BASE}/admin/sessions`, { headers: { Authorization: ADMIN_AUTH } });
  const body = await res.text();
  check('GET /admin/sessions returns 200', res.status === 200, `status ${res.status}`);
  let list = [];
  try {
    const j = JSON.parse(body);
    list = Array.isArray(j) ? j : (j.sessions || []);
  } catch { /* leave empty */ }
  const findSession = (sid) => list.find((e) => Object.values(e || {}).includes(sid));
  for (const [s, want] of [[s1, A], [s2, B]]) {
    const e = findSession(s.transport.sessionId);
    check(`/admin/sessions lists ${s.label} (${s.transport.sessionId})`, !!e, e ? '' : short(body));
    if (e) {
      const proj = e.project ?? e.projectName ?? e.scope?.project ?? null;
      const inst = e.instance ?? e.instanceName ?? e.scope?.instance ?? null;
      check(`/admin/sessions ${s.label} has ${INSTANCE}/${want}`, proj === want && inst === INSTANCE, `got ${inst}/${proj}`);
    }
  }
}

let exitCode = 0;
try {
  await main();
} catch (err) {
  failures++;
  console.log(`FAIL  harness error -- ${err?.stack || err}`);
  console.log('--- last 40 server log lines ---');
  console.log(logTail.join('\n'));
} finally {
  for (const { client } of clients) { try { await client.close(); } catch { /* ignore */ } }
  stopServer();
  exitCode = failures ? 1 : 0;
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nALL CHECKS PASSED');
}
process.exit(exitCode);
