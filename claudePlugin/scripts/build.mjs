#!/usr/bin/env node
// Build claudePlugin/dist from claudePlugin/src plus the workflow skills
// generated from ../workflows/*.md. No dependencies, Node 20+.
//
//   node scripts/build.mjs            build
//   node scripts/build.mjs --check    build, then `claude plugin validate`
//
// dist/ is the plugin root Claude Code loads (marketplace.json source "./dist").

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.resolve(HERE, '..');
const REPO = path.resolve(PLUGIN, '..');
const SRC = path.join(PLUGIN, 'src');
const DIST = path.join(PLUGIN, 'dist');
const WORKFLOWS = path.join(REPO, 'workflows');

const check = process.argv.includes('--check');
const log = s => process.stdout.write(s + '\n');

// 1. version from the server package.json: one number for server and plugin.
const rootPkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const version = rootPkg.version;

// 2. clean copy of src/
fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(SRC, DIST, { recursive: true });

// 3. stamp the version
const manifestPath = path.join(DIST, '.claude-plugin', 'plugin.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.version = version;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

// Two marketplaces: claudePlugin/ (local installs, source ./dist) and the
// repo root (git installs, source ./claudePlugin/dist).
for (const marketPath of [
  path.join(PLUGIN, '.claude-plugin', 'marketplace.json'),
  path.join(REPO, '.claude-plugin', 'marketplace.json'),
]) {
  if (!fs.existsSync(marketPath)) continue;
  const market = JSON.parse(fs.readFileSync(marketPath, 'utf8'));
  market.metadata = { ...(market.metadata || {}), version };
  for (const p of market.plugins) if (p.name === manifest.name) p.version = version;
  fs.writeFileSync(marketPath, JSON.stringify(market, null, 2) + '\n');
}

// 4. LICENSE
fs.copyFileSync(path.join(REPO, 'LICENSE'), path.join(DIST, 'LICENSE'));

// 5. workflow skills: one per workflows/*.md, name wf-<kebab-case file name>.
// The workflow's own frontmatter (title, description) becomes the skill's;
// the rest of it is dropped so the skill has one frontmatter block.

/** "curRule-computed-points" -> "cur-rule-computed-points" */
const kebab = s => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase().replace(/^-|-$/g, '');

function splitFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return { meta, body: text.slice(m[0].length) };
}

function stripMd(s) {
  return s.replace(/[`*_>#]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();
}

// Skill descriptions load in every session; keep them short (same cap as
// the Fantom MCP plugin). The full workflow loads only when the skill runs.
const MAX_DESC = 120;

function describe(slug, meta, body) {
  let d = meta.description ? stripMd(meta.description) : '';
  if (!d) {
    const lines = body.split('\n');
    const title = stripMd((lines.find(l => l.startsWith('# ')) || slug).replace(/^#\s*/, ''));
    const first = lines.find(l => l.trim() && !l.startsWith('#') && !l.startsWith('>') && !l.startsWith('```'));
    d = first ? `${title}: ${stripMd(first)}` : title;
  } else if (meta.title && stripMd(meta.title).length + d.length + 2 <= MAX_DESC) d = `${stripMd(meta.title)}: ${d}`;
  return d.length > MAX_DESC ? d.slice(0, MAX_DESC - 3).replace(/[\s,;:—-]+\S*$/, '') + '...' : d;
}

const yamlStr = s => JSON.stringify(s);

const skillsDir = path.join(DIST, 'skills');
const files = fs.existsSync(WORKFLOWS) ? fs.readdirSync(WORKFLOWS).filter(f => f.endsWith('.md')).sort() : [];
const made = [];
for (const f of files) {
  const slug = kebab(f.replace(/\.md$/, ''));
  const { meta, body } = splitFrontmatter(fs.readFileSync(path.join(WORKFLOWS, f), 'utf8'));
  const name = `wf-${slug}`;
  const dir = path.join(skillsDir, name);
  fs.mkdirSync(dir, { recursive: true });
  // `$` followed by a digit or ARGUMENTS would be expanded by Claude Code.
  const text = body.replace(/\$(?=\d|ARGUMENTS)/g, '\\$');
  const skill = [
    '---',
    `name: ${name}`,
    `description: ${yamlStr(describe(slug, meta, body))}`,
    '---',
    '',
    `<!-- generated from workflows/${f} by claudePlugin/scripts/build.mjs; edit the source, not this file -->`,
    '',
    text.trim(),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'SKILL.md'), skill);
  made.push(name);
}

// 6. build info and a package.json so `npx`/`npm pack` work on dist/
fs.writeFileSync(path.join(DIST, 'BUILD.json'), JSON.stringify({ version, workflows: made }, null, 2) + '\n');
fs.writeFileSync(path.join(DIST, 'package.json'), JSON.stringify({
  name: 'axon-mcp-plugin',
  version,
  description: manifest.description,
  license: 'SEE LICENSE IN LICENSE',
  type: 'module',
  bin: { 'axon-mcp': 'bin/axon-mcp.mjs' },
  engines: { node: '>=20' },
}, null, 2) + '\n');

const skillCount = fs.readdirSync(skillsDir).length;
log(`built ${path.relative(process.cwd(), DIST) || DIST}: v${version}, ${skillCount} skills (${made.length} workflows), hooks ${fs.readdirSync(path.join(DIST, 'hooks')).filter(f => f.endsWith('.mjs') && !f.startsWith('_')).length}`);

if (check) {
  try {
    const out = execFileSync('claude', ['plugin', 'validate', DIST], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    log(out.trim().split('\n').pop());
  } catch (e) {
    process.stdout.write(String(e.stdout || '') + String(e.stderr || ''));
    process.exit(1);
  }
}
