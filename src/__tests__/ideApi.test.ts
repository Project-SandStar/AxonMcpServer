/**
 * IDE API (/api/ide) and the shared function commit.
 *
 * No network and no SkySpark: FakeSkySpark stands in for the client. It reads
 * the Axon text that commitFunction() builds, so the tests also check that
 * text (names, escaped literals, the stale-write check, doc kept).
 */
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { HDateTime, HDict, HGrid, HMarker, HStr } from 'haystack-core';
import { createIdeRouter, ideToken, IDE_TOKEN_ENV } from '../ide/ideRouter.js';
import { buildCommitAxon, commitFunction, CommitArgError, type CommitArgs } from '../ide/commitFunction.js';
import { axonStr, isFunctionName, isSafeSegment } from '../ide/names.js';
import { modToIso, sha256Hex } from '../ide/mod.js';
import { docFromTrio, FunctionSyncManagerEnhanced } from '../sync/functionSyncManagerEnhanced.js';

const TOKEN = 'test-token-0123456789';

/** Reads an Axon string literal (with its quotes) back to the value. */
function unAxon(literal: string): string {
  expect(literal.startsWith('"') && literal.endsWith('"')).toBe(true);
  const body = literal.slice(1, -1);
  let out = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch !== '\\') {
      // A raw quote, dollar or newline would end or break the literal in Axon.
      expect(['"', '$', '\n', '\r']).not.toContain(ch);
      out += ch;
      continue;
    }
    const next = body[++i];
    if (next === 'u') { out += String.fromCharCode(parseInt(body.slice(i + 1, i + 5), 16)); i += 4; continue; }
    const map: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '\\': '\\', '"': '"', $: '$' };
    expect(Object.keys(map)).toContain(next);
    out += map[next];
  }
  return out;
}

interface FakeRec { src: string; doc: string | null; mod: Date; tags: string }

/** A SkySpark project in memory. It answers the two evals the server sends. */
class FakeSkySpark {
  recs = new Map<string, FakeRec>();
  evals: string[] = [];
  switched: string[] = [];
  private clock = Date.parse('2026-03-01T00:00:00.000Z');
  failNext: string | null = null;

  put(name: string, src: string, doc: string | null, modIso: string) {
    this.recs.set(name, { src, doc, mod: new Date(modIso), tags: '' });
  }

  switchTo(instance: string, project: string) { this.switched.push(`${instance}/${project}`); }

  private rec(name: string, r: FakeRec, more: Record<string, any> = {}) {
    const tags: Record<string, any> = { name: HStr.make(name), mod: HDateTime.make(r.mod.toISOString()), ...more };
    if (r.doc !== null) tags.doc = HStr.make(r.doc);
    return tags;
  }

  async evalAxon(code: string): Promise<unknown> {
    this.evals.push(code);
    if (this.failNext) { const m = this.failNext; this.failNext = null; throw new Error(m); }
    if (code === 'readAll(func)') {
      return HGrid.make({
        rows: [...this.recs].map(([name, r]) => HDict.make(this.rec(name, r, { func: HMarker.make(), src: HStr.make(r.src) }))),
      });
    }
    if (code.startsWith('do\n  ideName: ')) return this.commit(code);
    throw new Error('unexpected eval: ' + code.slice(0, 40));
  }

  private commit(code: string): HDict {
    const lines = code.split('\n');
    const lit = (prefix: string) => {
      const line = lines.find(l => l.startsWith(prefix));
      return line === undefined ? undefined : unAxon(line.slice(prefix.length));
    };
    const name = lit('  ideName: ')!;
    const src = lit('  ideSrc: ')!;
    const doc = lit('  ideDoc: ');
    const stale = lines.find(l => l.startsWith('  stale: '))!.slice('  stale: '.length);
    const changes = lines.find(l => l.startsWith('  changes: '))!;
    expect(changes.includes('doc: ideDoc')).toBe(doc !== undefined);
    expect(lines).toContain('  existing: read(func and name==ideName, false)');

    const existing = this.recs.get(name);
    let isStale: boolean;
    if (stale === 'false') isStale = false;
    else if (stale === 'existing != null') isStale = existing !== undefined;
    else {
      const m = /^curMs != (\d+)ms$/.exec(stale);
      expect(m).not.toBeNull();
      isStale = !existing || existing.mod.getTime() !== Number(m![1]);
    }
    if (isStale) {
      if (!existing) return HDict.make({ ideStatus: HStr.make('conflict') });
      return HDict.make({ ideStatus: HStr.make('conflict'), mod: HDateTime.make(existing.mod.toISOString()), ideCurSrc: HStr.make(existing.src) });
    }
    this.clock += 1234;
    const next: FakeRec = {
      src,
      doc: doc !== undefined ? doc : existing ? existing.doc : null,
      mod: new Date(this.clock),
      tags: changes,
    };
    this.recs.set(name, next);
    const out = this.rec(name, next, { ideStatus: HStr.make('ok'), ideOp: HStr.make(existing ? 'updated' : 'added') });
    if (existing) out.idePrevSrc = HStr.make(existing.src);
    return HDict.make(out);
  }

  get commits() { return this.evals.filter(e => e.startsWith('do\n  ideName: ')); }
  get syncs() { return this.evals.filter(e => e === 'readAll(func)'); }
}

const TRICKY_SRC = '(a, b) => do\n  // "quoted" $notAVar \\ back\tslash\r\n  x: "cost: $5"\n  a + b\nend';

let tmp: string;
let manager: FunctionSyncManagerEnhanced;
let sky: FakeSkySpark;
let server: Server;
let base: string;
let port: number;
let configured: Array<{ instance: string; project: string }>;
let currentToken: string | undefined;
let syncCalls: string[];
let commitCalls: string[];
const logs: string[] = [];

async function call(method: string, url: string, body?: unknown, token: string | null = TOKEN) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + url, {
    method, headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, headers: res.headers };
}

/** A request with the path sent as it is (fetch would fold "%2e%2e"). */
function rawGet(rawPath: string, postBody?: string): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { Authorization: `Bearer ${TOKEN}` };
    if (postBody !== undefined) headers['Content-Type'] = 'application/json';
    const req = http.request({ host: '127.0.0.1', port, path: rawPath, method: postBody === undefined ? 'GET' : 'POST', headers }, res => {
      let text = '';
      res.on('data', c => { text += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { /* */ } resolve({ status: res.statusCode!, json }); });
    });
    req.on('error', reject);
    req.end(postBody);
  });
}

const fnUrl = (instance: string, project: string, name?: string) =>
  `/projects/${encodeURIComponent(instance)}/${encodeURIComponent(project)}/functions` + (name ? `/${encodeURIComponent(name)}` : '');
const funcDir = (instance = 'demo', project = 'site') => path.join(tmp, instance, project, 'func');
const axonFiles = (dir: string) => fs.readdirSync(dir).filter(f => f.endsWith('.axon'));
const readMeta = (instance = 'demo', project = 'site') =>
  JSON.parse(fs.readFileSync(path.join(tmp, instance, project, '.sync-metadata.json'), 'utf8'));

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ide-api-'));
  manager = new FunctionSyncManagerEnhanced(tmp, { enableVersioning: false });
  sky = new FakeSkySpark();
  sky.put('calcDailyAvg', '(pt) => pt.hisRead(yesterday).avg', 'Daily average of a point', '2026-01-02T03:04:05.678Z');
  sky.put('roundTo', '(v, n: 2) => v.format("#." + "0" * n)', null, '2026-01-03T00:00:00.000Z');
  sky.put('trickyOne', TRICKY_SRC, 'Line one\nLine "two"', '2026-01-04T10:20:30.004Z');
  configured = [{ instance: 'demo', project: 'site' }, { instance: 'demo', project: 'empty' }];
  currentToken = TOKEN;
  syncCalls = [];
  commitCalls = [];
  logs.length = 0;

  const app = express();
  app.use('/api/ide', createIdeRouter({
    token: () => currentToken,
    store: manager,
    configuredProjects: () => configured,
    sync: async (instance, project) => {
      syncCalls.push(`${instance}/${project}`);
      return manager.syncFunctions(sky as any, instance, project, { silent: true });
    },
    commit: async (instance, project, args) => {
      commitCalls.push(`${instance}/${project}/${args.name}`);
      return commitFunction({ client: sky, instance, project }, args, { baseDir: tmp, store: manager });
    },
    log: line => { logs.push(line); },
  }));
  // The same parser the server mounts after the IDE router.
  app.use(express.json());
  await new Promise<void>(ok => { server = app.listen(0, '127.0.0.1', () => ok()); });
  port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}/api/ide`;

  // The local copy of demo/site, as a sync leaves it.
  await manager.syncFunctions(sky as any, 'demo', 'site', { silent: true });
  sky.evals.length = 0;
});

afterEach(async () => {
  await new Promise<void>(ok => server.close(() => ok()));
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('auth', () => {
  test('401 without a token, with a wrong token and with another scheme; nothing leaks', async () => {
    for (const url of ['/projects', fnUrl('demo', 'site'), fnUrl('nope', 'nope'), '/anything']) {
      const none = await call('GET', url, undefined, null);
      expect(none.status).toBe(401);
      expect(none.json).toEqual({ error: 'unauthorized' });
      expect(none.headers.get('www-authenticate')).toBe('Bearer');
      expect((await call('GET', url, undefined, 'wrong-token-0123456789')).status).toBe(401);
    }
    const basic = await fetch(base + '/projects', { headers: { Authorization: 'Basic ' + Buffer.from('a:' + TOKEN).toString('base64') } });
    expect(basic.status).toBe(401);
    const post = await call('POST', fnUrl('demo', 'site', 'calcDailyAvg'), { src: '() => 1', expectedMod: null }, null);
    expect(post.status).toBe(401);
    expect(sky.evals).toEqual([]);
    expect(commitCalls).toEqual([]);
  });

  test('401 comes before the body is read', async () => {
    const res = await call('POST', fnUrl('demo', 'site', 'calcDailyAvg'), '{not json', null);
    expect(res.status).toBe(401);
  });

  test('503 for every request when the token is not set', async () => {
    currentToken = undefined;
    expect((await call('GET', '/projects')).status).toBe(503);
    expect((await call('GET', '/projects', undefined, '')).status).toBe(503);
  });

  test('ideToken: the routes stay off without a token or with a short one', () => {
    expect(ideToken({})).toEqual({ token: null, reason: `${IDE_TOKEN_ENV} is not set` });
    expect(ideToken({ [IDE_TOKEN_ENV]: '   ' }).token).toBeNull();
    expect(ideToken({ [IDE_TOKEN_ENV]: 'short' }).token).toBeNull();
    expect(ideToken({ [IDE_TOKEN_ENV]: 'short' }).reason).toMatch(/shorter than 16/);
    expect(ideToken({ [IDE_TOKEN_ENV]: ` ${TOKEN} ` })).toEqual({ token: TOKEN });
  });
});

describe('GET /projects', () => {
  test('lists the local copies and the configured projects', async () => {
    fs.mkdirSync(funcDir('other one', 'Site A.1'), { recursive: true });
    fs.writeFileSync(path.join(funcDir('other one', 'Site A.1'), 'loneFunc.axon'), '() => 1');
    const res = await call('GET', '/projects');
    expect(res.status).toBe(200);
    expect(Object.keys(res.json)).toEqual(['projects']);
    expect(res.json.projects.map((p: any) => p.key)).toEqual(['demo/empty', 'demo/site', 'other one/Site A.1']);
    const site = res.json.projects.find((p: any) => p.key === 'demo/site');
    expect(Object.keys(site).sort()).toEqual(['functionCount', 'instance', 'key', 'lastSync', 'project']);
    expect(site).toMatchObject({ instance: 'demo', project: 'site', functionCount: 3 });
    expect(site.lastSync).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    expect(res.json.projects[0]).toEqual({ key: 'demo/empty', instance: 'demo', project: 'empty', functionCount: 0, lastSync: null });
    expect(res.json.projects[2]).toEqual({ key: 'other one/Site A.1', instance: 'other one', project: 'Site A.1', functionCount: 1, lastSync: null });
    expect(sky.evals).toEqual([]);
  });
});

describe('GET functions (export)', () => {
  test('one entry for each file, with src, doc, mod and the sha256 of src', async () => {
    const res = await call('GET', fnUrl('demo', 'site') + '?sync=false');
    expect(res.status).toBe(200);
    expect(res.json.key).toBe('demo/site');
    expect(res.json.syncedAt).toMatch(/Z$/);
    expect(res.json.functions.length).toBe(axonFiles(funcDir()).length);
    expect(res.json.functions.length).toBe(3);
    const list = await call('GET', '/projects');
    expect(list.json.projects.find((p: any) => p.key === 'demo/site').functionCount).toBe(res.json.functions.length);

    const byName = Object.fromEntries(res.json.functions.map((f: any) => [f.name, f]));
    expect(Object.keys(byName.calcDailyAvg).sort()).toEqual(['doc', 'hash', 'mod', 'name', 'src']);
    expect(byName.calcDailyAvg).toEqual({
      name: 'calcDailyAvg',
      src: '(pt) => pt.hisRead(yesterday).avg',
      doc: 'Daily average of a point',
      mod: '2026-01-02T03:04:05.678Z',
      hash: sha256Hex('(pt) => pt.hisRead(yesterday).avg'),
    });
    expect(byName.calcDailyAvg.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(byName.roundTo.doc).toBeNull();
    expect(byName.trickyOne.src).toBe(TRICKY_SRC);
    expect(byName.trickyOne.doc).toBe('Line one\nLine "two"');
    expect(syncCalls).toEqual([]);
    expect(sky.evals).toEqual([]);
  });

  test('no sync without the flag; sync=true runs the project sync first', async () => {
    sky.put('addedLater', '() => 42', 'New on the server', '2026-02-01T00:00:00.000Z');
    sky.put('calcDailyAvg', '(pt) => pt.hisRead(today).avg', 'Daily average of a point', '2026-02-02T00:00:00.500Z');
    sky.recs.delete('roundTo');

    const stale = await call('GET', fnUrl('demo', 'site'));
    expect(stale.json.functions.map((f: any) => f.name)).toEqual(['calcDailyAvg', 'roundTo', 'trickyOne']);
    expect(syncCalls).toEqual([]);
    expect((await call('GET', fnUrl('demo', 'site') + '?sync=1')).json.functions.length).toBe(3);
    expect(syncCalls).toEqual([]);

    const fresh = await call('GET', fnUrl('demo', 'site') + '?sync=true');
    expect(fresh.status).toBe(200);
    expect(syncCalls).toEqual(['demo/site']);
    expect(sky.syncs.length).toBe(1);
    expect(fresh.json.functions.map((f: any) => f.name)).toEqual(['addedLater', 'calcDailyAvg', 'trickyOne']);
    const avg = fresh.json.functions.find((f: any) => f.name === 'calcDailyAvg');
    expect(avg.src).toBe('(pt) => pt.hisRead(today).avg');
    expect(avg.mod).toBe('2026-02-02T00:00:00.500Z');
    expect(fresh.json.functions.length).toBe(axonFiles(funcDir()).length);
    expect(fs.existsSync(path.join(funcDir(), 'roundTo.trio'))).toBe(false);
  });

  test('a sync sees a new source also when the old copy holds no mod', async () => {
    // A copy from an older server version: the metadata has no mod at all.
    const meta = readMeta();
    for (const f of Object.values<any>(meta.functions)) { delete f.modIso; delete f.lastModified; delete f.doc; }
    fs.writeFileSync(path.join(tmp, 'demo', 'site', '.sync-metadata.json'), JSON.stringify(meta));
    const old = await call('GET', fnUrl('demo', 'site'));
    const oldAvg = old.json.functions.find((f: any) => f.name === 'calcDailyAvg');
    expect(oldAvg.mod).toBeNull();
    expect(oldAvg.doc).toBe('Daily average of a point'); // read from the .trio file
    expect(old.json.functions.find((f: any) => f.name === 'trickyOne').doc).toBe('Line one\nLine "two"');

    sky.put('roundTo', '(v) => v.round', null, '2026-02-03T00:00:00.000Z');
    const fresh = await call('GET', fnUrl('demo', 'site') + '?sync=true');
    const byName = Object.fromEntries(fresh.json.functions.map((f: any) => [f.name, f]));
    expect(byName.roundTo.src).toBe('(v) => v.round');
    expect(byName.roundTo.mod).toBe('2026-02-03T00:00:00.000Z');
    expect(byName.calcDailyAvg.mod).toBe('2026-01-02T03:04:05.678Z'); // unchanged source: the mod is filled in
  });

  test('a configured project with no copy is empty, not an error; sync failure is a 502 with no URL', async () => {
    const empty = await call('GET', fnUrl('demo', 'empty'));
    expect(empty.status).toBe(200);
    expect(empty.json).toEqual({ key: 'demo/empty', syncedAt: null, functions: [] });

    sky.failNext = 'Network error: fetch failed (URL: http://skyspark.invalid:8080/api/site/evalAll)';
    const res = await call('GET', fnUrl('demo', 'site') + '?sync=true');
    expect(res.status).toBe(502);
    expect(res.text).not.toContain('skyspark.invalid');
    expect(res.json.error).toMatch(/^sync failed: Network error/);
  });

  test('names with spaces and dots work as encoded path segments', async () => {
    fs.mkdirSync(funcDir('other one', 'Site A.1'), { recursive: true });
    fs.writeFileSync(path.join(funcDir('other one', 'Site A.1'), 'loneFunc.axon'), '() => 1');
    const res = await call('GET', fnUrl('other one', 'Site A.1'));
    expect(res.status).toBe(200);
    expect(res.json.key).toBe('other one/Site A.1');
    expect(res.json.functions).toEqual([{ name: 'loneFunc', src: '() => 1', doc: null, mod: null, hash: sha256Hex('() => 1') }]);
    // It has a copy but is not in the config: it cannot sync or commit.
    expect((await call('GET', fnUrl('other one', 'Site A.1') + '?sync=true')).status).toBe(503);
    expect((await call('POST', fnUrl('other one', 'Site A.1', 'loneFunc'), { src: '() => 2', expectedMod: null })).status).toBe(503);
    expect(sky.evals).toEqual([]);
  });
});

describe('unknown project and bad names', () => {
  test('404 for an unknown project; never another project', async () => {
    for (const [instance, project] of [['demo', 'nope'], ['nope', 'site'], ['Demo', 'site'], ['demo', 'Site'], ['demo', 'site ']]) {
      const get = await call('GET', fnUrl(instance, project) + '?sync=true');
      expect([404, 400]).toContain(get.status);
      if (get.status === 404) expect(get.json).toEqual({ error: 'unknown project' });
      const post = await call('POST', fnUrl(instance, project, 'calcDailyAvg'), { src: '() => 1', expectedMod: null });
      expect([404, 400]).toContain(post.status);
    }
    expect((await call('GET', fnUrl('demo', 'nope'))).json).toEqual({ error: 'unknown project' });
    expect((await call('POST', fnUrl('demo', 'nope', 'calcDailyAvg'), { src: '() => 1', expectedMod: null })).json).toEqual({ error: 'unknown project' });
    expect(syncCalls).toEqual([]);
    expect(commitCalls).toEqual([]);
    expect(sky.evals).toEqual([]);
  });

  test('path traversal in instance, project and function name is rejected', async () => {
    // A file outside the store that a traversal would reach.
    fs.mkdirSync(path.join(tmp, '..', path.basename(tmp) + '-outside', 'x', 'func'), { recursive: true });
    const outside = path.join(tmp, '..', path.basename(tmp) + '-outside');
    try {
      fs.writeFileSync(path.join(outside, 'x', 'func', 'secret.axon'), 'SECRET');
      for (const [instance, project] of [
        ['../' + path.basename(outside), 'x'], ['demo/site', 'x'],
        ['demo', 'site/../site'], ['demo\\site', 'x'], ['demo', 'si\u0000te'], [' demo', 'site'],
      ]) {
        const res = await call('GET', fnUrl(instance, project));
        expect(res.status).toBe(400);
        expect(res.json).toEqual({ error: 'invalid project name' });
        expect(res.text).not.toContain('SECRET');
      }
      // Dot segments sent as they are (fetch would fold them away).
      for (const raw of ['/api/ide/projects/../site/functions', '/api/ide/projects/demo/../functions', '/api/ide/projects/./site/functions',
        '/api/ide/projects/%2e%2e/site/functions', '/api/ide/projects/demo/%2E%2E/functions',
        '/api/ide/projects/..%2F..%2Fetc/passwd/functions', '/api/ide/projects/demo/site%2F..%2F..%2Fx/functions']) {
        const res = await rawGet(raw);
        expect(res.status).toBe(400);
      }
      expect((await rawGet('/api/ide/projects/%zz/site/functions')).status).toBe(400);

      for (const name of ['../evil', 'a/b', 'a\\b', 'has space', 'a.b', '1abc', 'x'.repeat(129), 'a"b', 'a$b', 'näme']) {
        const res = await call('POST', fnUrl('demo', 'site', name), { src: '() => 1', expectedMod: null });
        expect(res.status).toBe(400);
        expect(res.json).toEqual({ error: 'invalid function name' });
      }
      // A name of ".." sent as it is (fetch would fold it away).
      const body = JSON.stringify({ src: '() => 1', expectedMod: null });
      for (const raw of ['/api/ide/projects/demo/site/functions/..', '/api/ide/projects/demo/site/functions/%2e%2e', '/api/ide/projects/demo/site/functions/.']) {
        const res = await rawGet(raw, body);
        expect(res.status).toBe(400);
        expect(res.json).toEqual({ error: 'invalid function name' });
      }
      expect(commitCalls).toEqual([]);
      expect(sky.evals).toEqual([]);
      expect(fs.readdirSync(tmp).sort()).toEqual(['demo']);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  test('files with odd names and folders are not exported', async () => {
    fs.writeFileSync(path.join(funcDir(), 'bad name.axon'), 'x');
    fs.writeFileSync(path.join(funcDir(), 'rule.spark.axon'), 'x');
    fs.mkdirSync(path.join(funcDir(), 'folder.axon'));
    const res = await call('GET', fnUrl('demo', 'site'));
    expect(res.json.functions.map((f: any) => f.name)).toEqual(['calcDailyAvg', 'roundTo', 'trickyOne']);
  });

  test('bad bodies are a 400', async () => {
    const url = fnUrl('demo', 'site', 'calcDailyAvg');
    for (const body of [{}, { src: '', expectedMod: null }, { src: 5, expectedMod: null }, { src: '() => 1' },
      { src: '() => 1', expectedMod: 5 }, { src: '() => 1', expectedMod: 'yesterday' }, { src: '() => 1', expectedMod: null, doc: 7 }, [1]]) {
      expect((await call('POST', url, body)).status).toBe(400);
    }
    expect((await call('POST', url, '{not json')).status).toBe(400);
    expect((await call('POST', url, { src: 'x'.repeat(3 * 1024 * 1024), expectedMod: null })).status).toBe(413);
    expect(sky.commits).toEqual([]);
  });

  test('a body over the old 100 kB default is accepted', async () => {
    const big = '() => "' + 'a'.repeat(300 * 1024) + '"';
    const res = await call('POST', fnUrl('demo', 'site', 'bigOne'), { src: big, expectedMod: null });
    expect(res.status).toBe(200);
    expect(sky.recs.get('bigOne')!.src).toBe(big);
  });
});

describe('POST function (commit)', () => {
  test('export, then commit with that mod: ok, and the local copy is updated', async () => {
    const before = (await call('GET', fnUrl('demo', 'site'))).json.functions.find((f: any) => f.name === 'calcDailyAvg');
    const newSrc = '(pt) => pt.hisRead(lastWeek).avg';
    const res = await call('POST', fnUrl('demo', 'site', 'calcDailyAvg'), { src: newSrc, expectedMod: before.mod });
    expect(res.status).toBe(200);
    expect(Object.keys(res.json).sort()).toEqual(['hash', 'mod', 'status']);
    expect(res.json.status).toBe('ok');
    expect(res.json.hash).toBe(sha256Hex(newSrc));
    expect(res.json.mod).toBe(sky.recs.get('calcDailyAvg')!.mod.toISOString());
    expect(res.json.mod).not.toBe(before.mod);
    expect(commitCalls).toEqual(['demo/site/calcDailyAvg']);
    expect(sky.recs.get('calcDailyAvg')!.src).toBe(newSrc);

    // Local copy: file, trio and metadata.
    expect(fs.readFileSync(path.join(funcDir(), 'calcDailyAvg.axon'), 'utf8')).toBe(newSrc);
    const trio = fs.readFileSync(path.join(funcDir(), 'calcDailyAvg.trio'), 'utf8');
    expect(trio).toContain('name:"calcDailyAvg"');
    expect(trio).toContain('doc:"Daily average of a point"');
    expect(trio.endsWith('src:\n  ' + newSrc)).toBe(true);
    expect(trio).not.toContain('ideStatus');
    const meta = readMeta();
    expect(meta.functions.calcDailyAvg.hash).toBe(sha256Hex(newSrc).slice(0, 16));
    expect(meta.functions.calcDailyAvg.modIso).toBe(res.json.mod);
    expect(meta.functions.calcDailyAvg.doc).toBe('Daily average of a point');
    expect(meta.functionCount).toBe(3);
    expect(Object.keys(meta.functions).sort()).toEqual(['calcDailyAvg', 'roundTo', 'trickyOne']);

    // The export shows the new state with no sync, and a second commit with the new mod is ok.
    const after = (await call('GET', fnUrl('demo', 'site'))).json.functions.find((f: any) => f.name === 'calcDailyAvg');
    expect(after).toEqual({ name: 'calcDailyAvg', src: newSrc, doc: 'Daily average of a point', mod: res.json.mod, hash: res.json.hash });
    expect(syncCalls).toEqual([]);
    const again = await call('POST', fnUrl('demo', 'site', 'calcDailyAvg'), { src: newSrc + ' // v3', expectedMod: after.mod });
    expect(again.status).toBe(200);

    // The replaced source is in a backup.
    const backups = fs.readdirSync(path.join(tmp, 'demo', 'site', '.backups', 'calcDailyAvg'));
    expect(backups.length).toBe(2);
    expect(backups.every(f => /^backup-.*\.axon$/.test(f))).toBe(true);
  });

  test('a stale expectedMod is a 409 and nothing changes', async () => {
    const filesBefore = fs.readFileSync(path.join(funcDir(), 'calcDailyAvg.axon'), 'utf8');
    const metaBefore = fs.readFileSync(path.join(tmp, 'demo', 'site', '.sync-metadata.json'), 'utf8');
    // Another editor changed the function on the server.
    sky.put('calcDailyAvg', '() => "theirs"', 'Daily average of a point', '2026-02-09T08:07:06.005Z');

    const res = await call('POST', fnUrl('demo', 'site', 'calcDailyAvg'), { src: '() => "mine"', expectedMod: '2026-01-02T03:04:05.678Z' });
    expect(res.status).toBe(409);
    expect(res.json).toEqual({ status: 'conflict', mod: '2026-02-09T08:07:06.005Z', hash: sha256Hex('() => "theirs"') });
    expect(sky.recs.get('calcDailyAvg')!.src).toBe('() => "theirs"');
    expect(fs.readFileSync(path.join(funcDir(), 'calcDailyAvg.axon'), 'utf8')).toBe(filesBefore);
    expect(fs.readFileSync(path.join(tmp, 'demo', 'site', '.sync-metadata.json'), 'utf8')).toBe(metaBefore);
    expect(fs.existsSync(path.join(tmp, 'demo', 'site', '.backups'))).toBe(false);

    // One millisecond off is stale too; the same instant in another notation is not.
    expect((await call('POST', fnUrl('demo', 'site', 'calcDailyAvg'), { src: '() => "mine"', expectedMod: '2026-02-09T08:07:06.006Z' })).status).toBe(409);
    expect((await call('POST', fnUrl('demo', 'site', 'calcDailyAvg'), { src: '() => "mine"', expectedMod: '2026-02-09T09:07:06.005+01:00' })).status).toBe(200);
  });

  test('expectedMod null adds a new function and refuses one that exists; a deleted one is a conflict', async () => {
    const exists = await call('POST', fnUrl('demo', 'site', 'roundTo'), { src: '() => 1', expectedMod: null });
    expect(exists.status).toBe(409);
    expect(exists.json).toEqual({ status: 'conflict', mod: '2026-01-03T00:00:00.000Z', hash: sha256Hex(sky.recs.get('roundTo')!.src) });

    const added = await call('POST', fnUrl('demo', 'site', 'brandNew'), { src: '() => "new"', doc: 'A new one', expectedMod: null });
    expect(added.status).toBe(200);
    expect(sky.recs.get('brandNew')).toMatchObject({ src: '() => "new"', doc: 'A new one' });
    expect(sky.commits[1]).toContain('commit(diff(null, merge({func, name: ideName}, changes), {add}))');
    expect(readMeta().functionCount).toBe(4);
    const list = (await call('GET', fnUrl('demo', 'site'))).json.functions;
    expect(list.length).toBe(4);
    expect(list.find((f: any) => f.name === 'brandNew')).toEqual({ name: 'brandNew', src: '() => "new"', doc: 'A new one', mod: added.json.mod, hash: added.json.hash });

    sky.recs.delete('trickyOne');
    const gone = await call('POST', fnUrl('demo', 'site', 'trickyOne'), { src: '() => 1', expectedMod: '2026-01-04T10:20:30.004Z' });
    expect(gone.status).toBe(409);
    expect(gone.json).toEqual({ status: 'conflict', mod: null, hash: null });
    expect(sky.recs.has('trickyOne')).toBe(false);
  });

  test('doc is kept when absent or null, set when given, cleared with ""', async () => {
    const url = fnUrl('demo', 'site', 'calcDailyAvg');
    let mod = '2026-01-02T03:04:05.678Z';
    const post = async (body: any) => {
      const res = await call('POST', url, { ...body, expectedMod: mod });
      expect(res.status).toBe(200);
      mod = res.json.mod;
      return (await call('GET', fnUrl('demo', 'site'))).json.functions.find((f: any) => f.name === 'calcDailyAvg');
    };

    expect((await post({ src: '() => 2' })).doc).toBe('Daily average of a point');
    expect(sky.commits[0]).not.toContain('ideDoc');
    expect(sky.commits[0]).toContain('  changes: {src: ideSrc}');
    expect(sky.recs.get('calcDailyAvg')!.doc).toBe('Daily average of a point');

    expect((await post({ src: '() => 3', doc: null })).doc).toBe('Daily average of a point');
    expect(sky.commits[1]).not.toContain('ideDoc');

    expect((await post({ src: '() => 4', doc: 'New "doc"\nwith $two lines' })).doc).toBe('New "doc"\nwith $two lines');
    expect(sky.commits[2]).toContain('  changes: {src: ideSrc, doc: ideDoc}');
    expect(sky.recs.get('calcDailyAvg')!.doc).toBe('New "doc"\nwith $two lines');

    expect((await post({ src: '() => 5', doc: '' })).doc).toBe('');
    expect(sky.recs.get('calcDailyAvg')!.doc).toBe('');
  });

  test('source with quotes, dollars, backslashes, tabs and CRLF arrives unchanged', async () => {
    const src = TRICKY_SRC + '\n// "$x" \\n \u0007 \u00e9 \u{1F600}';
    const res = await call('POST', fnUrl('demo', 'site', 'roundTo'), { src, expectedMod: '2026-01-03T00:00:00.000Z' });
    expect(res.status).toBe(200);
    expect(sky.recs.get('roundTo')!.src).toBe(src);
    expect(fs.readFileSync(path.join(funcDir(), 'roundTo.axon'), 'utf8')).toBe(src);
    expect(res.json.hash).toBe(sha256Hex(src));
  });

  test('a SkySpark error is a 502 with no URL; the local copy stays', async () => {
    sky.failNext = 'Permission denied (URL: http://skyspark.invalid:8080/api/site/evalAll)';
    const res = await call('POST', fnUrl('demo', 'site', 'roundTo'), { src: '() => 1', expectedMod: '2026-01-03T00:00:00.000Z' });
    expect(res.status).toBe(502);
    expect(res.json.error).toBe('commit failed: Permission denied');
    expect(res.text).not.toContain('skyspark.invalid');
    expect(fs.readFileSync(path.join(funcDir(), 'roundTo.axon'), 'utf8')).toBe(sky.recs.get('roundTo')!.src);
  });

  test('a commit to a project with no local copy writes no lone file', async () => {
    const res = await call('POST', fnUrl('demo', 'empty', 'firstOne'), { src: '() => 1', expectedMod: null });
    expect(res.status).toBe(200);
    expect(fs.existsSync(funcDir('demo', 'empty'))).toBe(false);
    expect((await call('GET', fnUrl('demo', 'empty'))).json.functions).toEqual([]);
  });
});

describe('commitFunction (the MCP tool path)', () => {
  const target = () => ({ client: sky, instance: 'demo', project: 'site' });
  const deps = () => ({ baseDir: tmp, store: manager });

  test('callers that pass no expectedMod commit with no check', async () => {
    sky.put('calcDailyAvg', '() => "theirs"', 'Their doc', '2026-02-09T08:07:06.005Z');
    const res = await commitFunction(target(), { name: 'calcDailyAvg', src: '() => "mine"' }, deps());
    expect(res).toMatchObject({ status: 'ok', operation: 'updated', hash: sha256Hex('() => "mine"'), doc: 'Their doc', backedUp: true, localCopy: 'updated' });
    expect(sky.commits[0]).toContain('  stale: false');
    expect(sky.recs.get('calcDailyAvg')).toMatchObject({ src: '() => "mine"', doc: 'Their doc' });
    expect(fs.readFileSync((res as any).backupPath, 'utf8')).toBe('() => "theirs"');
    expect(fs.readFileSync(path.join(funcDir(), 'calcDailyAvg.axon'), 'utf8')).toBe('() => "mine"');

    const added = await commitFunction(target(), { name: 'newByTool', src: '() => 1' }, deps());
    expect(added).toMatchObject({ status: 'ok', operation: 'added', backedUp: false, backupPath: null, doc: null });
  });

  test('expectedMod gives a conflict result, not an exception', async () => {
    const res = await commitFunction(target(), { name: 'roundTo', src: '() => 1', expectedMod: '2020-01-01T00:00:00Z' }, deps());
    expect(res).toEqual({ status: 'conflict', mod: '2026-01-03T00:00:00.000Z', hash: sha256Hex(sky.recs.get('roundTo')!.src), exists: true });
  });

  test('bad names, tags and values are refused before any eval', async () => {
    const bad: CommitArgs[] = [
      { name: '../x', src: '() => 1' },
      { name: 'a") or read(point', src: '() => 1' },
      { name: 'ok', src: '' },
      { name: 'ok', src: '() => 1', expectedMod: 'not a date' },
      { name: 'ok', src: '() => 1', extraTags: { 'x, src:"y"': 1 } },
      { name: 'ok', src: '() => 1', extraTags: { src: 'other' } },
      { name: 'ok', src: '() => 1', extraTags: { order: Number.NaN } },
    ];
    for (const args of bad) await expect(commitFunction(target(), args, deps())).rejects.toBeInstanceOf(CommitArgError);
    await expect(commitFunction({ client: sky, instance: '..', project: 'site' }, { name: 'ok', src: '() => 1' }, deps())).rejects.toBeInstanceOf(CommitArgError);
    expect(sky.evals).toEqual([]);
  });

  test('extra tags become Axon literals; a failed local update is a warning, the commit stands', async () => {
    const code = buildCommitAxon({ name: 'calcDailyAvg', src: '() => 1', extraTags: { dis: 'Avg "daily" $', order: 3, ruleOn: true, off: false, skip: null, obj: { a: 1 } } });
    expect(code).toContain('  changes: {src: ideSrc, dis:"Avg \\"daily\\" \\$", order:3, ruleOn, off:false, obj:"{\\"a\\":1}"}');
    expect(code).toContain('  stale: false');
    expect(buildCommitAxon({ name: 'a', src: 'b', expectedMod: null })).toContain('  stale: existing != null');
    expect(buildCommitAxon({ name: 'a', src: 'b', expectedMod: '2026-01-02T03:04:05.678Z' })).toContain('  stale: curMs != 1767323045678ms');

    const broken = { recordCommittedFunction: async () => { throw new Error('disk full'); } };
    const res = await commitFunction(target(), { name: 'roundTo', src: '() => 9' }, { baseDir: tmp, store: broken });
    expect(res).toMatchObject({ status: 'ok', localCopy: 'failed' });
    expect((res as any).warning).toContain('disk full');
    expect(sky.recs.get('roundTo')!.src).toBe('() => 9');
  });

  test('a commit and a sync at the same time leave the copy whole', async () => {
    const jobs = [
      manager.syncFunctions(sky as any, 'demo', 'site', { silent: true }),
      commitFunction(target(), { name: 'roundTo', src: '() => "a"' }, deps()),
      manager.syncFunctions(sky as any, 'demo', 'site', { silent: true }),
      commitFunction(target(), { name: 'trickyOne', src: '() => "b"' }, deps()),
    ];
    await Promise.all(jobs);
    await manager.syncFunctions(sky as any, 'demo', 'site', { silent: true });
    const copy = await manager.readStoredFunctions('demo', 'site');
    for (const f of copy!.functions) {
      expect(f.src).toBe(sky.recs.get(f.name)!.src);
      expect(f.mod).toBe(sky.recs.get(f.name)!.mod.toISOString());
    }
    expect(copy!.functions.length).toBe(sky.recs.size);
    expect(fs.readdirSync(path.join(tmp, 'demo', 'site')).filter(f => f.endsWith('.tmp'))).toEqual([]);
  });
});

describe('helpers', () => {
  test('names', () => {
    for (const ok of ['a', 'calcDailyAvg', 'Upper_1']) expect(isFunctionName(ok)).toBe(true);
    for (const bad of ['', '1a', 'a-b', 'a.b', 'a b', '../a', 'a/b', undefined, 5]) expect(isFunctionName(bad)).toBe(false);
    for (const ok of ['demo', 'My Site', 'v1.2', 'a-b_c']) expect(isSafeSegment(ok)).toBe(true);
    for (const bad of ['', '.', '..', 'a/b', 'a\\b', ' a', 'a ', 'a\u0000b', 'a\nb', 'x'.repeat(256), null]) expect(isSafeSegment(bad)).toBe(false);
  });

  test('axonStr round trip', () => {
    for (const s of ['', 'plain', '"', '\\', '$x', 'a\nb', '\r\n\t', '\\n', '\\"', '\u0001\u007f', '\u00e9\u{1F600}', TRICKY_SRC]) {
      const lit = axonStr(s);
      expect(lit.includes('\n')).toBe(false);
      expect(unAxon(lit)).toBe(s);
    }
    expect(axonStr('a"b$c\\d\n')).toBe('"a\\"b\\$c\\\\d\\n"');
  });

  test('modToIso: one form for dates, Haystack date-times and ISO text', () => {
    expect(modToIso(HDateTime.make('2026-01-02T03:04:05.678Z'))).toBe('2026-01-02T03:04:05.678Z');
    expect(modToIso('2026-01-02T03:04:05Z')).toBe('2026-01-02T03:04:05.000Z');
    expect(modToIso('2026-01-02T03:04:05.678912345Z UTC')).toBe('2026-01-02T03:04:05.678Z');
    expect(modToIso('2026-01-01T22:04:05.678-05:00 New_York')).toBe('2026-01-02T03:04:05.678Z');
    expect(modToIso(new Date(0))).toBe('1970-01-01T00:00:00.000Z');
    for (const bad of [null, undefined, '', 'yesterday', '1/1/2026, 9:04:05 PM UTC', 5, {}]) expect(modToIso(bad)).toBeNull();
  });

  test('docFromTrio', () => {
    expect(docFromTrio('name:"a"\ndoc:"One \\"q\\"\nTwo"\nmod:"x"\nsrc:\n  () => 1')).toBe('One "q"\nTwo');
    expect(docFromTrio('name:"a"\nsrc:\n  doc:"not a tag"')).toBeNull();
    expect(docFromTrio('src:\n  x')).toBeNull();
  });
});

/**
 * The reader on a real local copy, when this machine has one. It is read in
 * place and never written; nothing from it is printed.
 */
describe('a real local copy (skipped when there is none)', () => {
  const candidates = [process.env.AXON_TEST_PROJ_DIR, path.resolve('proj'), path.join(os.homedir(), 'Code', 'axon-mcp-server', 'proj')];
  const real = candidates.find(d => d && fs.existsSync(d) && fs.statSync(d).isDirectory());
  (real ? test : test.skip)('export count equals the files for each project', async () => {
    const store = new FunctionSyncManagerEnhanced(real!, { enableVersioning: false });
    const projects = await store.listStoredProjects();
    expect(projects.length).toBeGreaterThan(0);
    let functions = 0;
    for (const p of projects.slice(0, 25)) {
      const copy = await store.readStoredFunctions(p.instance, p.project);
      expect(copy).not.toBeNull();
      const dir = path.join(real!, p.instance, p.project, 'func');
      const files = fs.existsSync(dir)
        ? fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile() && e.name.endsWith('.axon') && isFunctionName(e.name.slice(0, -5)))
        : [];
      expect(copy!.functions.length).toBe(files.length);
      expect(p.functionCount).toBe(files.length);
      for (const f of copy!.functions) {
        expect(f.hash).toBe(sha256Hex(f.src));
        expect(f.mod === null || /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(f.mod)).toBe(true);
        expect(f.doc === null || typeof f.doc === 'string').toBe(true);
      }
      functions += copy!.functions.length;
    }
    expect(functions).toBeGreaterThan(0);
  }, 60000);
});
