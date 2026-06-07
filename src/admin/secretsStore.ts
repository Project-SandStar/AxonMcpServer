/**
 * SecretsStore — admin-managed encrypted key/value store backed by Prisma.
 *
 * Used for things like the Anthropic API key entered through the dashboard.
 * Values are AES-256-GCM encrypted with a key persisted at .cache/.secret-key
 * (mode 0600). Read paths transparently fall back to environment variables
 * (e.g. ANTHROPIC_API_KEY) when no DB row exists.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const SECRET_KEY_FILE = '.secret-key';
const ALGO = 'aes-256-gcm';

let cachedKey: Buffer | null = null;

function loadOrCreateMasterKey(cacheDir: string): Buffer {
  if (cachedKey) return cachedKey;

  if (process.env.AXON_SECRET_KEY) {
    const buf = Buffer.from(process.env.AXON_SECRET_KEY, 'base64');
    if (buf.length === 32) {
      cachedKey = buf;
      return cachedKey;
    }
    console.error('[secrets] AXON_SECRET_KEY is set but not a 32-byte base64 value; ignoring.');
  }

  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  const keyPath = path.join(cacheDir, SECRET_KEY_FILE);

  if (fs.existsSync(keyPath)) {
    const raw = fs.readFileSync(keyPath, 'utf8').trim();
    const buf = Buffer.from(raw, 'base64');
    if (buf.length !== 32) {
      throw new Error(`[secrets] ${keyPath} is corrupted (expected 32 raw bytes after base64 decode, got ${buf.length}).`);
    }
    cachedKey = buf;
    return cachedKey;
  }

  const fresh = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, fresh.toString('base64'), { mode: 0o600 });
  try { fs.chmodSync(keyPath, 0o600); } catch { /* ignore on platforms that don't honor */ }
  console.error(`[secrets] Generated new master key at ${keyPath}`);
  cachedKey = fresh;
  return cachedKey;
}

function encrypt(plaintext: string, masterKey: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, masterKey, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64')}.${ct.toString('base64')}.${tag.toString('base64')}`;
}

function decrypt(encoded: string, masterKey: Buffer): string {
  if (!encoded.startsWith('v1.')) {
    throw new Error('Unknown secret format');
  }
  const [, ivB64, ctB64, tagB64] = encoded.split('.');
  const iv = Buffer.from(ivB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGO, masterKey, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

export interface SecretInfo {
  name: string;
  present: boolean;
  source: 'db' | 'env' | null;
  last4: string | null;
  updatedAt: Date | null;
}

const ENV_FALLBACK: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
};

export class SecretsStore {
  constructor(
    private getPrisma: () => Promise<any>,
    private cacheDir: string,
  ) {}

  private masterKey(): Buffer {
    return loadOrCreateMasterKey(this.cacheDir);
  }

  async getSecret(name: string): Promise<{ value: string; source: 'db' | 'env' } | null> {
    try {
      const prisma = await this.getPrisma();
      if (prisma?.appSecret?.findUnique) {
        const row = await prisma.appSecret.findUnique({ where: { name } });
        if (row) {
          try {
            return { value: decrypt(row.value, this.masterKey()), source: 'db' };
          } catch (err: any) {
            console.error(`[secrets] Failed to decrypt '${name}': ${err?.message || err}`);
          }
        }
      } else {
        console.error(`[secrets] Prisma client missing AppSecret model — falling back to env. Run \`npx prisma generate\` and restart.`);
      }
    } catch (err: any) {
      console.error(`[secrets] DB lookup for '${name}' failed: ${err?.message || err}`);
    }
    const envKey = ENV_FALLBACK[name];
    if (envKey && process.env[envKey]) {
      return { value: process.env[envKey] as string, source: 'env' };
    }
    return null;
  }

  async setSecret(name: string, value: string): Promise<void> {
    const prisma = await this.getPrisma();
    if (!prisma?.appSecret?.upsert) {
      throw new Error('Prisma client missing AppSecret model. Run `npx prisma generate` and restart the server.');
    }
    const enc = encrypt(value, this.masterKey());
    await prisma.appSecret.upsert({
      where: { name },
      create: { name, value: enc },
      update: { value: enc },
    });
  }

  async deleteSecret(name: string): Promise<boolean> {
    try {
      const prisma = await this.getPrisma();
      if (!prisma?.appSecret?.delete) return false;
      await prisma.appSecret.delete({ where: { name } });
      return true;
    } catch {
      return false;
    }
  }

  async listSecrets(): Promise<SecretInfo[]> {
    let rows: Array<{ name: string; value: string; updatedAt: Date }> = [];
    try {
      const prisma = await this.getPrisma();
      if (prisma?.appSecret?.findMany) {
        rows = await prisma.appSecret.findMany();
      } else {
        console.error('[secrets] Prisma client missing AppSecret model — listing env-only. Run `npx prisma generate` and restart.');
      }
    } catch (err: any) {
      console.error(`[secrets] listSecrets DB query failed: ${err?.message || err}`);
    }
    const byName = new Map(rows.map(r => [r.name, r]));

    const known = new Set<string>([...Object.keys(ENV_FALLBACK), ...byName.keys()]);
    const out: SecretInfo[] = [];
    for (const name of known) {
      const dbRow = byName.get(name);
      const envKey = ENV_FALLBACK[name];
      const envPresent = envKey ? Boolean(process.env[envKey]) : false;

      let last4: string | null = null;
      let source: 'db' | 'env' | null = null;
      if (dbRow) {
        source = 'db';
        try {
          const plain = decrypt(dbRow.value, this.masterKey());
          last4 = plain.length >= 4 ? plain.slice(-4) : '****';
        } catch {
          last4 = '????';
        }
      } else if (envPresent) {
        source = 'env';
        const v = process.env[envKey!] as string;
        last4 = v.length >= 4 ? v.slice(-4) : '****';
      }

      out.push({
        name,
        present: source !== null,
        source,
        last4,
        updatedAt: dbRow?.updatedAt ?? null,
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }
}

let singleton: SecretsStore | null = null;

export function initSecretsStore(getPrisma: () => Promise<any>, cacheDir: string): SecretsStore {
  singleton = new SecretsStore(getPrisma, cacheDir);
  return singleton;
}

export function getSecretsStore(): SecretsStore {
  if (!singleton) {
    throw new Error('SecretsStore not initialized; call initSecretsStore() first.');
  }
  return singleton;
}

/**
 * Convenience accessor used by AI summary generation. Returns the resolved
 * Anthropic key (from DB or env) or null if neither source has one.
 */
export async function getAnthropicApiKey(): Promise<string | null> {
  if (!singleton) return process.env.ANTHROPIC_API_KEY ?? null;
  const hit = await singleton.getSecret('anthropic');
  return hit?.value ?? null;
}
