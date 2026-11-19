/**
 * A backup never holds usage.db and a restore never writes it, so a restore
 * cannot bring back a revoked key. No network, no SkySpark. Names are made up.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import archiver from 'archiver';
import { BackupManager, isLiveOnlyCacheFile } from '../admin/backupManager.js';

function fakePrisma() {
  const empty = { findMany: async () => [], deleteMany: async () => ({ count: 0 }), create: async () => ({}) };
  return { oAuthClient: empty, oAuthSession: empty, accessToken: empty, refreshToken: empty, authorizationCode: empty } as any;
}

async function zip(file: string, entries: Record<string, string>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(file);
    const archive = archiver('zip');
    out.on('close', () => resolve());
    archive.on('error', reject);
    archive.pipe(out);
    for (const [name, text] of Object.entries(entries)) archive.append(text, { name });
    archive.finalize();
  });
}

describe('backup: live-only cache files', () => {
  let tmp: string;
  let configDir: string;
  let cacheDir: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'axon-backup-'));
    configDir = path.join(tmp, 'config');
    cacheDir = path.join(tmp, 'cache');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  test('usage.db and its side files are live-only; other caches are not', () => {
    for (const f of ['usage.db', 'usage.db-journal', 'usage.db-wal', 'usage.db-shm']) expect(isLiveOnlyCacheFile(f)).toBe(true);
    for (const f of ['axon.db', 'index.json', 'usage.json']) expect(isLiveOnlyCacheFile(f)).toBe(false);
  });

  test('a new backup does not hold usage.db but holds the other cache files', async () => {
    fs.writeFileSync(path.join(cacheDir, 'usage.db'), 'LIVE-KEYS');
    fs.writeFileSync(path.join(cacheDir, 'graph.db'), 'GRAPH');
    const manager = new BackupManager(fakePrisma(), configDir, cacheDir);
    const made = await manager.createBackup('test');
    const file = (made as any).filepath ?? path.join(configDir, 'backups', (made as any).filename);
    const unzipper = (await import('unzipper')).default;
    const dir = await unzipper.Open.file(file);
    const names = dir.files.map((f: any) => f.path);
    expect(names).toContain('cache/graph.db');
    expect(names).not.toContain('cache/usage.db');
  });

  test('a restore of an old backup that holds usage.db keeps the live usage.db', async () => {
    fs.writeFileSync(path.join(cacheDir, 'usage.db'), 'LIVE-KEYS');
    fs.mkdirSync(path.join(configDir, 'backups'), { recursive: true });
    await zip(path.join(configDir, 'backups', 'old.zip'), {
      'metadata.json': JSON.stringify({ version: '1', createdAt: '2026-01-01T00:00:00Z', serverVersion: 'x', contents: {} }),
      'users.json': JSON.stringify({ users: [] }),
      'oauth.json': JSON.stringify({ clients: [] }),
      'config-files.json': JSON.stringify({}),
      'settings.json': JSON.stringify({}),
      'cache/usage.db': 'OLD-KEYS-WITH-A-REVOKED-ONE',
      'cache/graph.db': 'OLD-GRAPH',
    });
    const manager = new BackupManager(fakePrisma(), configDir, cacheDir);
    const result = await manager.restoreBackup('old.zip');
    expect(result.success).toBe(true);
    expect(fs.readFileSync(path.join(cacheDir, 'usage.db'), 'utf8')).toBe('LIVE-KEYS');
    expect(fs.readFileSync(path.join(cacheDir, 'graph.db'), 'utf8')).toBe('OLD-GRAPH');
  });
});
