#!/usr/bin/env node
// Axon MCP plugin doctor: server, proxy, plugin install, legacy duplicates.
//   node doctor.mjs [--json] [--cwd <dir>]
// Exit 0 when the plugin can work, 1 otherwise.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { dataDir, http, looksLikeAxonDir, mcpUrl, serverUrl } from '../hooks/_lib.mjs';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const cwdIdx = args.indexOf('--cwd');
const cwd = cwdIdx >= 0 && args[cwdIdx + 1] ? path.resolve(args[cwdIdx + 1]) : process.cwd();

const checks = [];
const add = (ok, name, detail, level = ok ? 'ok' : 'fail') => checks.push({ ok, level, name, detail });
const warn = (name, detail) => checks.push({ ok: true, level: 'warn', name, detail });

const srv = serverUrl();
const mcp = mcpUrl();

// 1. server
const health = await http('GET', `${srv}/health`, { timeoutMs: 6000 });
const up = health.status === 200;
const hj = health.json || {};
add(up, 'server', up
  ? `${srv} up, initialized=${hj.initialized}, ${hj.functionsIndexed ?? '?'} functions indexed, ${hj.activeSessions ?? '?'} sessions`
  : /timeout|aborted/i.test(health.error || '')
    ? `${srv} did not answer within 6 s: busy or hung. Restart it in the axon-mcp-server repo: npm run daemon:restart (PM2) or npm run start:http.`
    : `${srv} not reachable (${health.error || 'HTTP ' + health.status}). Start it in the axon-mcp-server repo: npm run daemon:start (PM2) or npm run start:http.`);
if (up && hj.initialized === false) warn('index', 'server still loading: search and graph tools may return partial results for a few minutes.');

// 2. proxy / MCP endpoint: any HTTP answer means the listener is there.
const m = await http('GET', mcp, { timeoutMs: 2500, headers: { Accept: 'application/json, text/event-stream' } });
add(m.status > 0, 'mcp endpoint', m.status > 0
  ? `${mcp} answers (HTTP ${m.status})`
  : `${mcp} not reachable (${m.error}). Start mcp-proxy on :9191 (pm2 start mcp-proxy), or set the plugin option mcp_url to ${srv}/mcp.`);

// 3. plugin installed and enabled
let plugins = null;
const skipCli = !!process.env.AXON_PLUGIN_NO_CLI; // tests: no claude CLI round trip
if (!skipCli) {
  try {
    plugins = JSON.parse(execFileSync('claude', ['plugin', 'list', '--json'], { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch { /* claude not on PATH or no JSON */ }
}
if (skipCli) {
  /* nothing to report */
} else if (Array.isArray(plugins)) {
  const mine = plugins.find(p => typeof p.id === 'string' && p.id.startsWith('axon-mcp@'));
  add(!!mine && mine.enabled !== false, 'plugin', mine
    ? `${mine.id} v${mine.version} ${mine.enabled === false ? 'DISABLED' : 'enabled'} (${mine.scope}) at ${mine.installPath}`
    : 'axon-mcp is not installed. Run claudePlugin/scripts/install-local.sh in the axon-mcp-server repo.');
} else {
  warn('plugin', 'could not run "claude plugin list --json" (claude not on PATH?); skipped.');
}

// 4. legacy duplicates: a manual "axon-mcp" entry makes Claude Code suppress
// the plugin's own server.
const home = os.homedir();
try {
  const cj = JSON.parse(fs.readFileSync(path.join(home, '.claude.json'), 'utf8'));
  const fixes = [];
  if (cj.mcpServers && cj.mcpServers['axon-mcp']) fixes.push('claude mcp remove axon-mcp -s user');
  const locals = Object.entries(cj.projects || {})
    .filter(([, v]) => v && v.mcpServers && v.mcpServers['axon-mcp'])
    .map(([p]) => p);
  if (locals.length) fixes.push(`in each of ${locals.length} director${locals.length === 1 ? 'y' : 'ies'} (${locals.slice(0, 5).join(', ')}${locals.length > 5 ? ', ...' : ''}): claude mcp remove axon-mcp -s local`);
  if (fixes.length) warn('legacy MCP entry', `"axon-mcp" from claude mcp add is still configured. Claude Code then keeps it and suppresses the plugin's own server ("plugin:axon-mcp:axon"), so plugin option mcp_url has no effect. Fix all at once: node ${path.join(path.dirname(new URL(import.meta.url).pathname), 'axon-mcp.mjs')} clean-legacy. By hand: ${fixes.join('; ')}.`);
} catch { /* no ~/.claude.json */ }
try {
  const mcpJson = path.join(cwd, '.mcp.json');
  if (fs.existsSync(mcpJson)) {
    const pj = JSON.parse(fs.readFileSync(mcpJson, 'utf8'));
    if (pj.mcpServers && pj.mcpServers['axon-mcp']) warn('legacy MCP entry', `${mcpJson} also declares "axon-mcp" (project scope).`);
  }
} catch { /* ignore */ }

// 5. directory
if (!looksLikeAxonDir(cwd)) warn('directory', `${cwd} has no .axon / .trio files at the top: the SessionStart note stays silent here (the tools still work).`);

// 6. data dir
const dd = dataDir();
let writable = false;
try { fs.accessSync(dd, fs.constants.W_OK); writable = true; } catch { /* not writable */ }
add(writable, 'data dir', writable ? dd : `${dd} not writable: the hint hook cannot read the session cache.`);

const failed = checks.filter(c => !c.ok);
if (asJson) {
  process.stdout.write(JSON.stringify({ ok: failed.length === 0, cwd, serverUrl: srv, mcpUrl: mcp, checks }, null, 2) + '\n');
} else {
  const mark = c => c.level === 'ok' ? '✔' : c.level === 'warn' ? '!' : '✖';
  for (const c of checks) process.stdout.write(`${mark(c)} ${c.name}: ${c.detail}\n`);
  process.stdout.write(failed.length ? `\n${failed.length} problem${failed.length === 1 ? '' : 's'}.\n` : '\nReady.\n');
}
process.exit(failed.length ? 1 : 0);
