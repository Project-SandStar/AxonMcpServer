#!/usr/bin/env node
// UserPromptSubmit hook: one short hint naming the right Axon MCP tool or
// workflow skill for the prompt. No network: reads the session cache written
// by session-start. Fires only when the prompt is about Axon / SkySpark, or
// the session runs in a directory with Axon code, so it stays quiet next to
// the Fantom MCP plugin's own hints.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emit, readJson, readStdinJson, sessionFile } from './_lib.mjs';

const ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const input = (await readStdinJson()) || {};
const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
if (prompt.length < 12 || prompt.startsWith('/') || prompt.startsWith('!')) process.exit(0);

const AXON_WORDS = /\b(axon|skyspark|folio|haystack|trio|defcomp|spark ?rules?|cur ?rules?|mobilytik|visualytik|recform|opc ?ua|opcconn|evalaxon)\b/i;
const sess = readJson(sessionFile(input.session_id || process.env.CLAUDE_SESSION_ID || 'unknown'));
if (!AXON_WORDS.test(prompt) && !(sess && sess.axonDir)) process.exit(0);

const wf = name => fs.existsSync(path.join(ROOT, 'skills', `wf-${name}`)) ? `/axon-mcp:wf-${name}` : '';

// [pattern, tools, workflow skill or ''] - first match wins.
const RULES = [
  [/\b(commit|save|upsert|update|deploy)\b.*\b(func|function)s?\b|\bcommitAxonFunction\b/i,
    'getPrimaryProject, then commitAxonFunction with "project" set (never pre-delete the func)', wf('axon-func-update')],
  [/\b(run|execute|eval(uate)?|try)\b.*\b(axon|expr|expression|code|query)\b/i,
    'getPrimaryProject, then executeAxonCode (pass "project" to pin the target)', ''],
  [/\bspark ?rules?\b/i, 'searchAxonExamples, then validateAxonCode', wf('spark-rule-creation')],
  [/\b(cur ?rules?|computed (curVal )?points?)\b/i, 'searchAxonExamples and getAxonPattern', wf('cur-rule-computed-points')],
  [/\bmobilytik\b.*\b(release|pod|podRepo|version)\b/i, '', wf('mobilytik-pod-release')],
  [/\bmobilytik\b/i, 'queryHaystack for mDashboard / mWidget records', wf('mobilytik-dashboard-generation')],
  [/\bvisualytik\b/i, 'queryHaystack and executeAxonCode', wf('visualytik-mcp-authoring')],
  [/\b(recform|define\w*template|create\/edit form)\b/i, 'searchAxonExamples', wf('recform-template-design')],
  [/\b(e-?mail|emailSend)\b/i, 'searchAxonExamples', wf('html-email-skyspark')],
  [/\b(job status|jobs?\b.*\b(running|progress|log)|jobStatus)\b/i, 'executeAxonCode', wf('job-status-check')],
  [/\b(opc ?ua|opcconn)\b/i, 'queryHaystack for opcConn records', wf('opc-connector-workflow')],
  [/\b(task subscribers?|obsCurVals|userAllow|task user)\b/i, '', wf('task-subscriber-permissions')],
  [/\b(new app|create (an? )?app|view records?|subview)\b/i, '', wf('app-creation')],
  [/\b(who calls|callers?|call ?sites?|blast radius|impact of|what breaks|usages? of|used by)\b/i,
    'getCallers, then getCodeImpact (Axon graph of the active project)', ''],
  [/\b(points?|equips?|sites?|records?|recs?|filter|histor(y|ies)|tags?)\b.*\b(find|list|query|show|count|which)\b|\b(find|list|query|show|count|which)\b.*\b(points?|equips?|sites?|records?|recs?|histor(y|ies))\b/i,
    'queryHaystack (filter), or getProjectSchema to browse', ''],
  [/\b(write|generate|create|example|pattern|how (do|to))\b/i,
    'searchAxonExamples / getAxonPattern / searchAxonDocs, then validateAxonCode before running it', wf('axon-lang-information')],
  [/\b(find|search|look ?up|locate|where)\b/i, 'semanticCodeSearch, searchAxonRegex or findFunctionUsage', ''],
];

for (const [re, tools, skill] of RULES) {
  if (!re.test(prompt)) continue;
  const parts = [];
  if (tools) parts.push(`start with ${tools}`);
  if (skill) parts.push(`read ${skill} first`);
  if (!parts.length) continue;
  emit('UserPromptSubmit', `Axon MCP hint: ${parts.join('; ')}. Tools are deferred: ToolSearch("axon", 30) first.`);
  break;
}
process.exit(0);
