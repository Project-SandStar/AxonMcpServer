// Shared helpers for the Axon MCP plugin hooks, doctor and CLI.
// Node 20+, built-ins only. Nothing here throws: every hook must fail open.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_SERVER_URL = 'http://localhost:3847';
export const DEFAULT_MCP_URL = 'http://localhost:9191/axon/mcp';

function opt(key) {
  const v = process.env['CLAUDE_PLUGIN_OPTION_' + key];
  return v && v.trim() ? v.trim() : '';
}

/** Server base URL (health). */
export function serverUrl() {
  return (opt('SERVER_URL') || process.env.AXON_URL || DEFAULT_SERVER_URL).replace(/\/+$/, '');
}

/** MCP endpoint (through the proxy by default). */
export function mcpUrl() {
  return opt('MCP_URL') || process.env.AXON_MCP_URL || DEFAULT_MCP_URL;
}

/** Per-plugin data directory (Claude Code sets CLAUDE_PLUGIN_DATA). */
export function dataDir() {
  const d = process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.axon-mcp', 'plugin-data');
  try { fs.mkdirSync(d, { recursive: true }); } catch { /* read-only: caches are optional */ }
  return d;
}

export function safeId(s) {
  return String(s || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
}

export function sessionFile(sessionId) {
  return path.join(dataDir(), 'session-' + safeId(sessionId) + '.json');
}

/** Read the hook JSON from stdin; null when there is none or it is not JSON. */
export function readStdinJson(maxMs = 1500) {
  return new Promise(resolve => {
    if (process.stdin.isTTY) return resolve(null);
    let s = '';
    let done = false;
    const parse = () => { try { return s.trim() ? JSON.parse(s) : null; } catch { return null; } };
    const finish = v => { if (!done) { done = true; resolve(v); } };
    const t = setTimeout(() => finish(parse()), maxMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', d => { s += d; });
    process.stdin.on('end', () => { clearTimeout(t); finish(parse()); });
    process.stdin.on('error', () => { clearTimeout(t); finish(null); });
  });
}

/** fetch wrapper: never throws; `status` 0 means no HTTP answer. */
export async function http(method, url, { headers = {}, body, timeoutMs = 2000 } = {}) {
  try {
    const r = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json', ...headers } : headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    return { status: r.status, json, text };
  } catch (e) {
    return { status: 0, json: null, text: '', error: e && e.message ? e.message : String(e) };
  }
}

export function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

export function writeJson(file, obj) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(obj));
    fs.renameSync(tmp, file);
    return true;
  } catch { return false; }
}

/** Print a hook result with additionalContext. Empty text prints nothing. */
export function emit(hookEventName, additionalContext) {
  if (!additionalContext) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext } }) + '\n');
}

/** Cheap guess: does the top level of `dir` hold Axon / SkySpark sources? */
export function looksLikeAxonDir(dir) {
  try {
    const names = fs.readdirSync(dir);
    return names.some(n => /\.(axon|trio)$/i.test(n) || (n === 'lib' && fs.existsSync(path.join(dir, 'lib', 'lib.trio'))));
  } catch { return false; }
}

/** Drop session caches older than `maxAgeMs` (default 7 days). Best effort. */
export function pruneSessions(maxAgeMs = 7 * 24 * 3600 * 1000) {
  try {
    const dir = dataDir();
    const cutoff = Date.now() - maxAgeMs;
    for (const n of fs.readdirSync(dir)) {
      if (!n.startsWith('session-') || !n.endsWith('.json')) continue;
      const f = path.join(dir, n);
      try { if (fs.statSync(f).mtimeMs < cutoff) fs.unlinkSync(f); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}
