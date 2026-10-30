/**
 * Folder picker API: allowlist enforcement, listing, hints.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { createFsBrowserRouter, listDirs, parseRootsEnv, resolveRoots, detectHint, FsBrowseError } from '../admin/fsBrowser';

let tmp: string;
let mirror: string;
let proj: string;
let outside: string;
let cfgDir: string;
let server: Server;
let base: string;
let role = 'admin';
const oldEnv = process.env.AXON_BROWSE_ROOTS;

function mk(...parts: string[]) {
  const p = path.join(...parts);
  fs.mkdirSync(p, { recursive: true });
  return p;
}
function touch(file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'x');
}

async function get(url: string) {
  const res = await fetch(base + url);
  return { status: res.status, json: await res.json() as any };
}

beforeAll(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fsbrowse-test-')));
  mirror = mk(tmp, 'mirror');
  proj = mk(tmp, 'proj');
  outside = mk(tmp, 'outside');
  cfgDir = mk(mirror, 'config');
  touch(path.join(mirror, 'lib', 'docs', 'docSkySpark', 'index.html'));
  touch(path.join(mirror, 'lib', 'docs', 'lib-axon', 'index.html'));
  touch(path.join(proj, 'demo', 'site1', 'func', 'a.axon'));
  touch(path.join(proj, 'demo', 'site2', 'b.trio'));
  mk(mirror, '.hidden');
  mk(mirror, 'zeta');
  mk(mirror, 'Alpha');
  touch(path.join(mirror, 'file.txt'));
  touch(path.join(outside, 'secret', 'x.txt'));
  fs.symlinkSync(outside, path.join(mirror, 'escape'));
  fs.symlinkSync(path.join(proj, 'demo'), path.join(mirror, 'projlink'));

  const app = express();
  const requireAdmin = (_req: Request, res: Response, next: NextFunction) =>
    role === 'admin' ? next() : res.status(403).json({ error: 'Admin access required' });
  app.use('/admin/fs', createFsBrowserRouter({
    requireAdmin,
    deny: () => [cfgDir],
    defaultRoots: () => [mirror, proj, path.join(tmp, 'missing')],
  }));
  server = await new Promise<Server>(r => { const s = app.listen(0, () => r(s)); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise(r => server.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
  if (oldEnv === undefined) delete process.env.AXON_BROWSE_ROOTS;
  else process.env.AXON_BROWSE_ROOTS = oldEnv;
});

beforeEach(() => {
  role = 'admin';
  delete process.env.AXON_BROWSE_ROOTS;
});

describe('roots', () => {
  test('parseRootsEnv splits on comma and colon', () => {
    expect(parseRootsEnv(undefined)).toBeUndefined();
    expect(parseRootsEnv(' ')).toBeUndefined();
    expect(parseRootsEnv('/a,/b:/c')).toEqual(['/a', '/b', '/c']);
  });

  test('resolveRoots drops missing, relative, repeated and denied folders', () => {
    expect(resolveRoots([mirror, mirror, 'rel', path.join(tmp, 'nope'), cfgDir, proj], [cfgDir])).toEqual([mirror, proj]);
  });
});

describe('GET /admin/fs/dirs', () => {
  test('no path lists the first root', async () => {
    const r = await get('/admin/fs/dirs');
    expect(r.status).toBe(200);
    expect(r.json.path).toBe(mirror);
    expect(r.json.parent).toBeNull();
    expect(r.json.roots).toEqual([mirror, proj]);
    expect(r.json.truncated).toBe(false);
  });

  test('lists folders only, sorted, no dotfiles, no denied folder, no symlink escape', async () => {
    const r = await get('/admin/fs/dirs?path=' + encodeURIComponent(mirror));
    const names = r.json.entries.map((e: any) => e.name);
    expect(names).toEqual(['Alpha', 'lib', 'projlink', 'zeta']);
    expect(r.json.entries.every((e: any) => e.isDir === true)).toBe(true);
    expect(r.json.entries[0].path).toBe(path.join(mirror, 'Alpha'));
  });

  test('sub-folder has parent inside the root', async () => {
    const r = await get('/admin/fs/dirs?path=' + encodeURIComponent(path.join(mirror, 'lib')));
    expect(r.status).toBe(200);
    expect(r.json.parent).toBe(mirror);
  });

  test('outside the roots is refused', async () => {
    expect((await get('/admin/fs/dirs?path=' + encodeURIComponent(outside))).status).toBe(403);
    expect((await get('/admin/fs/dirs?path=/')).status).toBe(403);
  });

  test('".." and relative paths are refused', async () => {
    expect((await get('/admin/fs/dirs?path=' + encodeURIComponent(mirror + '/../outside'))).status).toBe(400);
    expect((await get('/admin/fs/dirs?path=mirror')).status).toBe(400);
  });

  test('symlink that leaves the roots is refused', async () => {
    const r = await get('/admin/fs/dirs?path=' + encodeURIComponent(path.join(mirror, 'escape')));
    expect(r.status).toBe(403);
  });

  test('denied folder (config) is refused', async () => {
    expect((await get('/admin/fs/dirs?path=' + encodeURIComponent(cfgDir))).status).toBe(403);
  });

  test('missing folder is 404, a file is 400', async () => {
    expect((await get('/admin/fs/dirs?path=' + encodeURIComponent(path.join(mirror, 'nope')))).status).toBe(404);
    expect((await get('/admin/fs/dirs?path=' + encodeURIComponent(path.join(mirror, 'file.txt')))).status).toBe(400);
  });

  test('AXON_BROWSE_ROOTS overrides the defaults', async () => {
    process.env.AXON_BROWSE_ROOTS = proj;
    const r = await get('/admin/fs/dirs');
    expect(r.json.roots).toEqual([proj]);
    expect((await get('/admin/fs/dirs?path=' + encodeURIComponent(mirror))).status).toBe(403);
  });

  test('non-admin gets 403', async () => {
    role = 'viewer';
    expect((await get('/admin/fs/dirs')).status).toBe(403);
  });
});

describe('hints', () => {
  test('doc root, doc library, instance, project', async () => {
    expect(detectHint(path.join(mirror, 'lib', 'docs'))).toBe('skysparkDocRoot');
    expect(detectHint(path.join(mirror, 'lib', 'docs', 'docSkySpark'))).toBe('docLibrary');
    expect(detectHint(path.join(proj, 'demo'))).toBe('skysparkInstance');
    expect(detectHint(path.join(proj, 'demo', 'site1'))).toBe('axonProject');
    expect(detectHint(path.join(proj, 'demo', 'site2'))).toBe('axonProject');
    expect(detectHint(path.join(mirror, 'zeta'))).toBeUndefined();

    const r = await get('/admin/fs/dirs?path=' + encodeURIComponent(path.join(mirror, 'lib')));
    expect(r.json.entries).toEqual([{ name: 'docs', path: path.join(mirror, 'lib', 'docs'), isDir: true, hint: 'skysparkDocRoot' }]);
  });
});

describe('listDirs cap', () => {
  test('truncates at maxEntries', () => {
    const many = mk(tmp, 'many');
    for (let i = 0; i < 5; i++) mk(many, `d${i}`);
    const out = listDirs(many, { roots: [many], maxEntries: 3 });
    expect(out.entries).toHaveLength(3);
    expect(out.truncated).toBe(true);
  });

  test('no roots gives 404', () => {
    expect(() => listDirs(undefined, { roots: [] })).toThrow(FsBrowseError);
  });
});
