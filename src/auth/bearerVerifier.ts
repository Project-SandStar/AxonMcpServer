/**
 * One bearer check for /api/ide and /mcp.
 *
 * It accepts a user access key ("axk_...") or an OAuth login token. On every
 * call it loads the user by id, so a deleted or disabled user loses access at
 * once. The role comes from the user store, not from the key or the token.
 *
 * Every refusal throws the same InvalidTokenError text: the MCP SDK sends that
 * text to the client. The true reason goes to the log, with the key prefix
 * only (never the key or the token).
 */
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { UserPublic, UserRole } from '../admin/userStore.js';
import { keyClientId, looksLikeUserKey, type KeyInfo, type KeyUse } from './userKeys.js';

export const REFUSED_TEXT = 'Invalid access token';
/** A key with no expiry still needs a number for the SDK (bearerAuth.js checks it). */
export const NO_EXPIRY_SECONDS = 10 * 365 * 24 * 60 * 60;

export interface BearerVerifierOptions {
  keys: {
    findByKey(plainKey: string): Promise<KeyInfo | null>;
    touch(id: string, from: KeyUse): void;
  };
  users: { getUserById(id: string): UserPublic | null };
  /** The OAuth provider, or undefined when OAuth is off. */
  oauth: () => { verifyAccessToken(token: string): Promise<AuthInfo> } | undefined;
  /** Which door this verifier guards; kept as the key's "used from". */
  from: KeyUse;
  log?: (line: string) => void;
  now?: () => number;
}

/** Who makes a call, as read from AuthInfo.extra. */
export interface AccessCaller {
  userId: string;
  username: string;
  role: UserRole;
  keyId?: string;
  keyPrefix?: string;
  kind: 'key' | 'oauth';
}

export function scopesForRole(role: UserRole): string[] {
  if (role === 'readonly') return ['mcp:read'];
  if (role === 'admin') return ['mcp:read', 'mcp:write', 'mcp:admin'];
  return ['mcp:read', 'mcp:write'];
}

export function createBearerVerifier(opts: BearerVerifierOptions): { verifyAccessToken(token: string): Promise<AuthInfo> } {
  const log = opts.log ?? ((line: string) => console.error(line));
  const now = opts.now ?? Date.now;

  const refuse = (reason: string): never => {
    log(`[auth] ${opts.from}: refused: ${reason}`);
    throw new InvalidTokenError(REFUSED_TEXT);
  };

  const liveUser = (userId: string | undefined, who: string): UserPublic => {
    if (!userId) return refuse(`${who} has no user`);
    const user = opts.users.getUserById(userId);
    if (!user) return refuse(`the user of ${who} does not exist`);
    if (user.disabled) return refuse(`the user of ${who} is disabled`);
    return user;
  };

  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      if (typeof token !== 'string' || token.length === 0) return refuse('no token');

      // Path A: a user access key
      if (looksLikeUserKey(token)) {
        const key = await opts.keys.findByKey(token);
        if (!key) return refuse('unknown key');
        const who = `key ${key.prefix}`;
        if (key.status === 'revoked') return refuse(`${who} is revoked`);
        if (key.status === 'expired') return refuse(`${who} is expired`);
        const user = liveUser(key.userId, who);
        opts.keys.touch(key.id, opts.from);
        const caller: AccessCaller = {
          userId: user.id, username: user.username, role: user.role,
          keyId: key.id, keyPrefix: key.prefix, kind: 'key',
        };
        return {
          token,
          clientId: keyClientId(key.id),
          scopes: scopesForRole(user.role),
          expiresAt: key.expiresAt
            ? Math.floor(key.expiresAt.getTime() / 1000)
            : Math.floor(now() / 1000) + NO_EXPIRY_SECONDS,
          extra: { ...caller },
        };
      }

      // Path B: an OAuth login token
      const oauth = opts.oauth();
      if (!oauth) return refuse('not a user key, and OAuth is off');
      let info: AuthInfo;
      try {
        info = await oauth.verifyAccessToken(token);
      } catch (error) {
        if (error instanceof InvalidTokenError) return refuse(`OAuth token: ${error.message}`);
        throw error;
      }
      const user = liveUser(info.extra?.userId as string | undefined, 'the OAuth token');
      const caller: AccessCaller = { userId: user.id, username: user.username, role: user.role, kind: 'oauth' };
      return { ...info, extra: { ...info.extra, ...caller } };
    },
  };
}

/** The caller of a verified request, or null when AuthInfo holds no user. */
export function callerFromAuthInfo(info: AuthInfo | undefined): AccessCaller | null {
  const extra = info?.extra as Partial<AccessCaller> | undefined;
  if (!extra || typeof extra.userId !== 'string' || typeof extra.username !== 'string') return null;
  const role: UserRole = extra.role === 'admin' || extra.role === 'readonly' ? extra.role : 'user';
  return {
    userId: extra.userId,
    username: extra.username,
    role,
    keyId: typeof extra.keyId === 'string' ? extra.keyId : undefined,
    keyPrefix: typeof extra.keyPrefix === 'string' ? extra.keyPrefix : undefined,
    kind: extra.kind === 'key' ? 'key' : 'oauth',
  };
}

/**
 * Verifies a bearer text for a route that is not behind the SDK middleware.
 * Null = refused (answer 401). Any other error is thrown (the store is down).
 */
export async function verifyCaller(
  verifier: { verifyAccessToken(token: string): Promise<AuthInfo> },
  token: string,
  now: () => number = Date.now
): Promise<AccessCaller | null> {
  try {
    const info = await verifier.verifyAccessToken(token);
    if (typeof info.expiresAt !== 'number' || info.expiresAt < now() / 1000) return null;
    return callerFromAuthInfo(info);
  } catch (error) {
    if (error instanceof InvalidTokenError) return null;
    throw error;
  }
}
