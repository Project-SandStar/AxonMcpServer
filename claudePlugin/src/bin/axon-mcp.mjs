#!/usr/bin/env node
// Axon MCP plugin CLI. Node 20+, built-ins only.
//
//   axon-mcp setup [--marketplace <dir|owner/repo|url>] [--scope user|project|local]
//                  [--server-url <url>] [--mcp-url <url>] [--remove-legacy] [--no-doctor]
//   axon-mcp doctor [--json] [--cwd <dir>]
//   axon-mcp status [--json]
//   axon-mcp clean-legacy [--dry-run]
//   axon-mcp disconnect
//
// setup: health check, marketplace add, plugin install, plugin options,
// legacy cleanup, doctor. Every step prints one line. Nothing is deleted
// without a backup.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { http, mcpUrl, serverUrl } from '../hooks/_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, '..');              // dist/
const MARKET = 'axon-mcp';
const PLUGIN = `axon-mcp@${MARKET}`;
const LEGACY = 'axon-mcp';                                 // name used with `claude mcp add`
const NO_CLI = !!process.env.AXON_PLUGIN_NO_CLI;

const argv = process.argv.slice(2);
const cmd = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'help';
const flags = parseFlags(argv.slice(cmd === 'help' ? 0 : 1));

const out = s => process.stdout.write(s + '\n');
const step = s => out(`\n== ${s}`);
const ok = s => out(`   ok  ${s}`);
const warn = s => out(`   !   ${s}`);
const fail = s => out(`   ✖   ${s}`);

function parseFlags(a) {
  const f = { _: [] };
  for (let i = 0; i < a.length; i++) {
    const t = a[i];
    if (!t.startsWith('--')) { f._.push(t); continue; }
    const k = t.slice(2);
    const next = a[i + 1];
    if (next !== undefined && !next.startsWith('--')) { f[k] = next; i++; } else f[k] = true;
  }
  return f;
}

function claude(args, { quiet = false, cwd } = {}) {
  if (NO_CLI) return { ok: false, out: '', err: 'claude CLI disabled (AXON_PLUGIN_NO_CLI)' };
  const r = spawnSync('claude', args, { encoding: 'utf8', cwd, stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
  if (r.error) return { ok: false, out: '', err: r.error.message };
  if (!quiet && r.status !== 0) return { ok: false, out: r.stdout || '', err: (r.stderr || r.stdout || '').trim() };
  return { ok: r.status === 0, out: r.stdout || '', err: (r.stderr || '').trim() };
}

function claudeJson(args) {
  const r = claude(args, { quiet: true });
  if (!r.ok) return null;
  const lines = r.out.trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) { try { return JSON.parse(lines.slice(i).join('\n')); } catch { /* keep looking */ } }
  return null;
}

function backup(file) {
  const b = `${file}.bak.${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;
  fs.copyFileSync(file, b);
  return b;
}

function marketplaceDefault() {
  // dist/ sits inside the marketplace directory of a checkout.
  const dir = path.resolve(PLUGIN_ROOT, '..');
  return fs.existsSync(path.join(dir, '.claude-plugin', 'marketplace.json')) ? dir : '';
}

function configurePlugin(values) {
  if (NO_CLI) return { ok: false, err: 'claude CLI disabled' };
  const r = spawnSync('claude', ['plugin', 'configure', PLUGIN, '--values-stdin'], { input: JSON.stringify(values), encoding: 'utf8', timeout: 60000 });
  return { ok: r.status === 0, err: (r.stderr || r.stdout || '').trim() };
}

/** Manual "axon-mcp" MCP entries on this machine (user scope and local scopes). */
function findLegacy() {
  const res = { userMcp: false, localMcp: [], claudeJson: path.join(os.homedir(), '.claude.json') };
  try {
    const cj = JSON.parse(fs.readFileSync(res.claudeJson, 'utf8'));
    res.userMcp = !!(cj.mcpServers && cj.mcpServers[LEGACY]);
    res.localMcp = Object.entries(cj.projects || {}).filter(([, v]) => v && v.mcpServers && v.mcpServers[LEGACY]).map(([p]) => p);
  } catch { /* none */ }
  return res;
}

function cleanLegacy({ dryRun }) {
  const l = findLegacy();
  if (!l.userMcp && !l.localMcp.length) { ok('no legacy setup found'); return true; }
  const say = dryRun ? (s => out(`   would ${s}`)) : null;
  if (l.userMcp) {
    if (say) say(`remove user-scope MCP server ${LEGACY} (claude mcp remove ${LEGACY} -s user)`);
    else {
      const r = claude(['mcp', 'remove', LEGACY, '-s', 'user']);
      r.ok ? ok(`removed user-scope MCP server ${LEGACY} (restore: claude mcp add --transport http -s user ${LEGACY} http://localhost:9191/axon/mcp)`) : warn(`could not remove user-scope entry: ${r.err}`);
    }
  }
  // Direct edit of ~/.claude.json, with a backup, when `claude mcp remove`
  // cannot see the entry (directory gone, or mapped to another project key).
  const editClaudeJson = (dir, why) => {
    try {
      const b = backup(l.claudeJson);
      const cj = JSON.parse(fs.readFileSync(l.claudeJson, 'utf8'));
      delete cj.projects[dir].mcpServers[LEGACY];
      fs.writeFileSync(l.claudeJson, JSON.stringify(cj, null, 2) + '\n');
      ok(`removed local-scope entry for ${dir} by editing ${l.claudeJson} (${why}; backup ${path.basename(b)})`);
    } catch (e) { warn(`could not edit ${l.claudeJson} for ${dir}: ${e.message}`); }
  };
  for (const dir of l.localMcp) {
    if (say) { say(`remove local-scope MCP server ${LEGACY} for ${dir}`); continue; }
    if (!fs.existsSync(dir)) { editClaudeJson(dir, 'directory missing'); continue; }
    const r = claude(['mcp', 'remove', LEGACY, '-s', 'local'], { cwd: dir });
    if (r.ok) ok(`removed local-scope MCP server ${LEGACY} for ${dir}`);
    else editClaudeJson(dir, `claude mcp remove said: ${r.err.split('\n')[0]}`);
  }
  return true;
}

function runDoctor(extra = []) {
  const r = spawnSync(process.execPath, [path.join(HERE, 'doctor.mjs'), ...extra], { stdio: 'inherit' });
  return r.status === 0;
}

// ---------------------------------------------------------------- commands

async function setup() {
  const srv = (flags['server-url'] || serverUrl()).replace(/\/+$/, '');
  const scope = flags.scope || 'user';
  const market = flags.marketplace || marketplaceDefault();
  if (!market) { fail('no marketplace given. Use --marketplace <dir|owner/repo|url>.'); return 2; }
  if (claude(['--version'], { quiet: true }).ok === false && !NO_CLI) { fail('claude CLI not found on PATH'); return 1; }

  step(`server ${srv}`);
  const h = await http('GET', `${srv}/health`, { timeoutMs: 6000 });
  h.status === 200 ? ok(`up (initialized=${h.json && h.json.initialized})`) : warn(`not reachable (${h.error || 'HTTP ' + h.status}); install continues`);

  step(`marketplace ${MARKET} -> ${market}`);
  const markets = claudeJson(['plugin', 'marketplace', 'list', '--json']);
  if (Array.isArray(markets) && markets.some(m => m.name === MARKET)) ok('already added');
  else {
    const r = claude(['plugin', 'marketplace', 'add', market]);
    if (!r.ok) { fail(`marketplace add failed: ${r.err}`); return 1; }
    ok('added');
  }

  step(`install ${PLUGIN} (scope ${scope})`);
  const plugins = claudeJson(['plugin', 'list', '--json']);
  if (Array.isArray(plugins) && plugins.some(p => p.id === PLUGIN)) ok('already installed (a directory marketplace is read in place; /reload-plugins picks up a new build)');
  else {
    const r = claude(['plugin', 'install', PLUGIN, '--scope', scope]);
    if (!r.ok) { fail(`install failed: ${r.err}`); return 1; }
    ok('installed');
  }

  const values = {};
  if (flags['server-url']) values.server_url = srv;
  if (flags['mcp-url']) values.mcp_url = flags['mcp-url'];
  if (Object.keys(values).length) {
    const r = configurePlugin(values);
    r.ok ? ok(`plugin options set: ${Object.keys(values).join(', ')}`) : warn(`claude plugin configure failed (${r.err}); the defaults stay`);
  }

  step('legacy setup');
  const l = findLegacy();
  if (flags['remove-legacy']) cleanLegacy({ dryRun: false });
  else if (l.userMcp || l.localMcp.length) {
    if (l.userMcp) warn(`user-scope MCP server "${LEGACY}" (claude mcp add) exists: Claude Code keeps it and suppresses the plugin server.`);
    if (l.localMcp.length) warn(`local-scope MCP server "${LEGACY}" in ${l.localMcp.length} director${l.localMcp.length === 1 ? 'y' : 'ies'}.`);
    warn('fix all of it: axon-mcp clean-legacy   (or re-run setup with --remove-legacy)');
  } else ok('none found');

  if (flags['no-doctor']) return 0;
  step(`doctor (${process.cwd()})`);
  const good = runDoctor();
  out('\nNext: start a new Claude Code session, or /reload-plugins in an open one. /mcp shows the server as "axon".');
  return good ? 0 : 1;
}

async function status() {
  const srv = serverUrl();
  const h = await http('GET', `${srv}/health`, { timeoutMs: 6000 });
  const j = h.json || {};
  const res = { serverUrl: srv, mcpUrl: mcpUrl(), up: h.status === 200 };
  if (res.up) Object.assign(res, { initialized: j.initialized, functionsIndexed: j.functionsIndexed, activeSessions: j.activeSessions, uptimeSec: Math.round(j.uptime || 0), requireAuth: j.mcpRequireAuth });
  else res.error = h.error || `HTTP ${h.status}`;
  if (flags.json) { out(JSON.stringify(res, null, 2)); return res.up ? 0 : 1; }
  out(`server    ${srv}  ${res.up ? `up (initialized=${res.initialized}, uptime ${res.uptimeSec} s)` : `DOWN (${res.error})`}`);
  out(`mcp       ${res.mcpUrl}`);
  if (res.up) {
    out(`index     ${res.functionsIndexed ?? '?'} Axon functions`);
    out(`sessions  ${res.activeSessions ?? '?'} active MCP sessions${res.requireAuth ? ', OAuth required on /mcp' : ''}`);
  }
  return res.up ? 0 : 1;
}

function disconnect() {
  step('uninstall');
  const r1 = claude(['plugin', 'uninstall', PLUGIN]);
  r1.ok ? ok(`uninstalled ${PLUGIN}`) : warn(`uninstall: ${r1.err}`);
  const r2 = claude(['plugin', 'marketplace', 'remove', MARKET]);
  r2.ok ? ok(`removed marketplace ${MARKET}`) : warn(`marketplace remove: ${r2.err}`);
  return 0;
}

function help() {
  out(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 14).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
  return cmd === 'help' ? 0 : 2;
}

const run = { setup, status, disconnect, help,
  doctor: () => (runDoctor(flags.json ? ['--json'] : []) ? 0 : 1),
  'clean-legacy': () => (cleanLegacy({ dryRun: !!flags['dry-run'] }) ? 0 : 1),
};
try {
  process.exit(await (run[cmd] || help)());
} catch (e) {
  fail(e && e.message ? e.message : String(e));
  process.exit(1);
}
