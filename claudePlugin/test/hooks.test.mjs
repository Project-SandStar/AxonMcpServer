// Hook, doctor and build tests against a fake Axon MCP server. No real
// server, no claude CLI needed:  node --test claudePlugin/test/*.test.mjs  (after build)
//
// The fake server lives in this process, so hooks run with async spawn:
// spawnSync would block the event loop and the server could never answer.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, '..', 'dist');
const HOOKS = path.join(DIST, 'hooks');
const DOCTOR = path.join(DIST, 'bin', 'doctor.mjs');
const CLI = path.join(DIST, 'bin', 'axon-mcp.mjs');

let server; let base; let health;
let data; let axonDir; let plainDir;

before(async () => {
  assert.ok(fs.existsSync(path.join(HOOKS, 'session-start.mjs')), 'run scripts/build.mjs first');
  health = { status: 'ok', initialized: true, uptime: 42, functionsIndexed: 1234, activeSessions: 2, mcpRequireAuth: false };
  server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const json = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (u.pathname === '/health') return json(200, health);
    if (u.pathname === '/mcp') return json(400, { error: 'no session' });
    json(404, { error: 'nope' });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  data = fs.mkdtempSync(path.join(os.tmpdir(), 'axon-plugin-test-'));
  axonDir = path.join(data, 'proj');
  plainDir = path.join(data, 'plain');
  fs.mkdirSync(axonDir); fs.writeFileSync(path.join(axonDir, 'myFunc.axon'), '() => 1');
  fs.mkdirSync(plainDir); fs.writeFileSync(path.join(plainDir, 'README.md'), '# hi');
});

after(async () => {
  await new Promise(r => server.close(r));
  fs.rmSync(data, { recursive: true, force: true });
});

/** Run a hook or a bin script as Claude Code would; resolves with its output. */
function run(script, { input, args = [], env: envExtra = {} } = {}) {
  const env = {
    ...process.env,
    HOME: data,
    CLAUDE_PLUGIN_ROOT: DIST,
    CLAUDE_PLUGIN_DATA: path.join(data, 'plugin-data'),
    CLAUDE_PLUGIN_OPTION_SERVER_URL: base,
    CLAUDE_PLUGIN_OPTION_MCP_URL: `${base}/mcp`,
    AXON_PLUGIN_NO_CLI: '1',
    ...envExtra,
  };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  return new Promise(resolve => {
    const p = spawn(process.execPath, [script, ...args], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    p.stdout.on('data', d => { stdout += d; });
    p.stderr.on('data', d => { stderr += d; });
    p.on('close', code => resolve({ code, stdout, stderr }));
    p.stdin.end(input === undefined ? '' : JSON.stringify(input));
  });
}

const ctxOf = r => (r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : '');

test('session-start: Axon directory, server up -> routing note with function count', async () => {
  const r = await run(path.join(HOOKS, 'session-start.mjs'), { input: { session_id: 's1', cwd: axonDir } });
  assert.equal(r.code, 0);
  const c = ctxOf(r);
  assert.match(c, /server up \(1234 Axon functions indexed\)/);
  assert.match(c, /getPrimaryProject/);
  assert.match(c, /ToolSearch\("axon", 30\)/);
});

test('session-start: directory without Axon code -> silent, but session cached', async () => {
  const r = await run(path.join(HOOKS, 'session-start.mjs'), { input: { session_id: 's2', cwd: plainDir } });
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), '');
  const sess = JSON.parse(fs.readFileSync(path.join(data, 'plugin-data', 'session-s2.json'), 'utf8'));
  assert.equal(sess.up, true);
  assert.equal(sess.axonDir, false);
});

test('session-start: server down -> says so, exit 0', async () => {
  const r = await run(path.join(HOOKS, 'session-start.mjs'), {
    input: { session_id: 's3', cwd: axonDir },
    env: { CLAUDE_PLUGIN_OPTION_SERVER_URL: 'http://127.0.0.1:9' },
  });
  assert.equal(r.code, 0);
  assert.match(ctxOf(r), /did not answer/);
  assert.match(ctxOf(r), /\/axon-mcp:doctor/);
});

test('session-start: server still loading -> partial-results note', async () => {
  health.initialized = false;
  try {
    const r = await run(path.join(HOOKS, 'session-start.mjs'), { input: { session_id: 's4', cwd: axonDir } });
    assert.match(ctxOf(r), /still loading/);
  } finally { health.initialized = true; }
});

test('prompt-hint: commit prompt -> getPrimaryProject + commitAxonFunction + workflow skill', async () => {
  const r = await run(path.join(HOOKS, 'prompt-hint.mjs'), { input: { session_id: 's2', prompt: 'commit this axon function to the demo project' } });
  const c = ctxOf(r);
  assert.match(c, /getPrimaryProject, then commitAxonFunction/);
  assert.match(c, /\/axon-mcp:wf-axon-func-update/);
});

test('prompt-hint: camelCase workflow file maps to a kebab-case skill', async () => {
  const r = await run(path.join(HOOKS, 'prompt-hint.mjs'), { input: { session_id: 's2', prompt: 'make a cur rule that writes a computed point' } });
  assert.match(ctxOf(r), /\/axon-mcp:wf-cur-rule-computed-points/);
});

test('prompt-hint: haystack query prompt -> queryHaystack', async () => {
  const r = await run(path.join(HOOKS, 'prompt-hint.mjs'), { input: { session_id: 's2', prompt: 'list all skyspark points with a curVal over 50' } });
  assert.match(ctxOf(r), /queryHaystack/);
});

test('prompt-hint: non-Axon prompt outside an Axon directory -> silent', async () => {
  const r = await run(path.join(HOOKS, 'prompt-hint.mjs'), { input: { session_id: 's2', prompt: 'who calls reportChanges in the indexer?' } });
  assert.equal(r.stdout.trim(), '');
});

test('prompt-hint: Axon directory -> generic prompt still gets a hint', async () => {
  const r = await run(path.join(HOOKS, 'prompt-hint.mjs'), { input: { session_id: 's1', prompt: 'who calls this function and what breaks?' } });
  assert.match(ctxOf(r), /getCallers, then getCodeImpact/);
});

test('prompt-hint: slash command and short prompt -> silent', async () => {
  for (const prompt of ['/axon-mcp:doctor please', 'axon?']) {
    const r = await run(path.join(HOOKS, 'prompt-hint.mjs'), { input: { session_id: 's1', prompt } });
    assert.equal(r.stdout.trim(), '', prompt);
  }
});

test('doctor: server and endpoint up -> exit 0, Ready', async () => {
  const r = await run(DOCTOR, { args: ['--cwd', axonDir] });
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /✔ server: .* 1234 functions indexed/);
  assert.match(r.stdout, /✔ mcp endpoint/);
  assert.match(r.stdout, /Ready\./);
});

test('doctor: server down -> exit 1 with the start command', async () => {
  const r = await run(DOCTOR, { args: ['--json'], env: { CLAUDE_PLUGIN_OPTION_SERVER_URL: 'http://127.0.0.1:9', CLAUDE_PLUGIN_OPTION_MCP_URL: 'http://127.0.0.1:9/mcp' } });
  assert.equal(r.code, 1);
  const j = JSON.parse(r.stdout);
  assert.equal(j.ok, false);
  assert.match(j.checks.find(c => c.name === 'server').detail, /npm run daemon:start/);
});

test('doctor: manual axon-mcp entry in ~/.claude.json -> legacy warning', async () => {
  const cj = path.join(data, '.claude.json');
  fs.writeFileSync(cj, JSON.stringify({ mcpServers: { 'axon-mcp': { type: 'http', url: 'x' } }, projects: { '/gone/dir': { mcpServers: { 'axon-mcp': {} } } } }));
  try {
    const r = await run(DOCTOR, { args: ['--json', '--cwd', axonDir] });
    const legacy = JSON.parse(r.stdout).checks.find(c => c.name === 'legacy MCP entry');
    assert.ok(legacy, 'legacy check present');
    assert.match(legacy.detail, /claude mcp remove axon-mcp -s user/);
    assert.match(legacy.detail, /1 directory/);
  } finally { fs.rmSync(cj, { force: true }); }
});

test('cli status --json -> server facts', async () => {
  const r = await run(CLI, { args: ['status', '--json'] });
  assert.equal(r.code, 0);
  const j = JSON.parse(r.stdout);
  assert.equal(j.up, true);
  assert.equal(j.functionsIndexed, 1234);
});

test('cli clean-legacy --dry-run lists without editing', async () => {
  const cj = path.join(data, '.claude.json');
  const before = JSON.stringify({ projects: { '/gone/dir': { mcpServers: { 'axon-mcp': {} } } } });
  fs.writeFileSync(cj, before);
  try {
    const r = await run(CLI, { args: ['clean-legacy', '--dry-run'] });
    assert.match(r.stdout, /would remove local-scope MCP server axon-mcp for \/gone\/dir/);
    assert.equal(fs.readFileSync(cj, 'utf8'), before);
  } finally { fs.rmSync(cj, { force: true }); }
});

test('build: one wf- skill per workflow, frontmatter carried over, single frontmatter block', () => {
  const build = JSON.parse(fs.readFileSync(path.join(DIST, 'BUILD.json'), 'utf8'));
  assert.ok(build.workflows.length > 0);
  for (const name of build.workflows) {
    assert.match(name, /^wf-[a-z0-9-]+$/);
    const text = fs.readFileSync(path.join(DIST, 'skills', name, 'SKILL.md'), 'utf8');
    const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    assert.ok(m, `${name}: skill frontmatter`);
    assert.doesNotMatch(m[1], /^(title|category|tags):/m, `${name}: workflow keys in the skill frontmatter`);
    assert.doesNotMatch(m[2].replace(/^\s*<!--.*-->\s*/, ''), /^---\n/, `${name}: workflow frontmatter leaked into the body`);
    const desc = text.match(/^description: (.*)$/m)[1];
    assert.ok(JSON.parse(desc).length > 10, `${name}: description`);
    assert.ok(JSON.parse(desc).length <= 120, `${name}: description over 120 chars`);
  }
  assert.ok(build.workflows.includes('wf-cur-rule-computed-points'));
});
