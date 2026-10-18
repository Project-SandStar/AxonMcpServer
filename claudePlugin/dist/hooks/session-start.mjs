#!/usr/bin/env node
// SessionStart hook: check the Axon MCP server and, in a directory that holds
// Axon code, tell the model the server state and the one routing rule that
// matters most (check the active SkySpark project before running or
// committing Axon).
//
// One GET to /health (no auth, 2.5 s cap). The result is cached under
// CLAUDE_PLUGIN_DATA for the prompt-hint hook, which uses no network.
// Silent in directories without Axon code: the routing skill covers those.

import { emit, http, looksLikeAxonDir, pruneSessions, readStdinJson, serverUrl, sessionFile, writeJson } from './_lib.mjs';

const input = (await readStdinJson()) || {};
const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
const sessionId = input.session_id || process.env.CLAUDE_SESSION_ID || 'unknown';
const srv = serverUrl();

const h = await http('GET', `${srv}/health`, { timeoutMs: 2500 });
const up = h.status === 200 && !!h.json;
const initialized = up && h.json.initialized !== false;
const functions = up && Number.isFinite(h.json.functionsIndexed) ? h.json.functionsIndexed : null;
const axonDir = looksLikeAxonDir(cwd);

pruneSessions();
writeJson(sessionFile(sessionId), { cwd, at: new Date().toISOString(), up, initialized, functions, axonDir });

if (!axonDir) process.exit(0);

const lines = [];
if (!up) {
  lines.push(`Axon MCP plugin: the server at ${srv} did not answer (${h.error || 'HTTP ' + h.status}). Axon tools will fail until it is back; run /axon-mcp:doctor. Do not guess SkySpark/Axon functions from memory meanwhile; say the server is unavailable.`);
} else if (!initialized) {
  lines.push(`Axon MCP plugin: the server at ${srv} is still loading its index. Search and graph tools may return partial results for a few minutes.`);
} else {
  lines.push(`Axon MCP plugin: server up${functions != null ? ` (${functions} Axon functions indexed)` : ''}. Tools are deferred: ToolSearch("axon", 30) once. Before executeAxonCode or commitAxonFunction, call getPrimaryProject and pass "project" explicitly: they act on the session's active SkySpark project.`);
}
emit('SessionStart', lines.join('\n'));
