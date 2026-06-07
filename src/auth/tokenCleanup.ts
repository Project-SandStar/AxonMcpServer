/**
 * Token cleanup job for OAuth 2.1 implementation
 * Periodically removes expired tokens and authorization codes
 */

import { PrismaClient } from '../generated/prisma/client.js';

export interface TokenCleanupConfig {
  intervalMs?: number; // How often to run cleanup (default: 1 hour)
}

export class TokenCleanupJob {
  private prisma: PrismaClient;
  private intervalMs: number;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(prisma: PrismaClient, config: TokenCleanupConfig = {}) {
    this.prisma = prisma;
    this.intervalMs = config.intervalMs || 60 * 60 * 1000; // 1 hour default
  }

  /**
   * Start the cleanup job
   */
  start(): void {
    if (this.intervalId) {
      return; // Already running
    }

    console.error('[TokenCleanup] Starting cleanup job');

    // Run immediately on start
    this.cleanup().catch(console.error);

    // Schedule periodic cleanup
    this.intervalId = setInterval(() => {
      this.cleanup().catch(console.error);
    }, this.intervalMs);
  }

  /**
   * Stop the cleanup job
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.error('[TokenCleanup] Stopped cleanup job');
    }
  }

  /**
   * Run cleanup manually
   */
  async cleanup(): Promise<{
    authCodesDeleted: number;
    accessTokensDeleted: number;
    refreshTokensDeleted: number;
    sessionsDeleted: number;
  }> {
    if (this.isRunning) {
      console.error('[TokenCleanup] Cleanup already in progress, skipping');
      return {
        authCodesDeleted: 0,
        accessTokensDeleted: 0,
        refreshTokensDeleted: 0,
        sessionsDeleted: 0,
      };
    }

    this.isRunning = true;
    const now = new Date();

    try {
      // Delete expired authorization codes (also delete used ones older than 1 hour)
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const authCodesResult = await this.prisma.authorizationCode.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { used: true, createdAt: { lt: oneHourAgo } },
          ],
        },
      });

      // Delete expired access tokens (keep revoked ones for audit, but delete truly expired)
      const accessTokensResult = await this.prisma.accessToken.deleteMany({
        where: {
          AND: [
            { expiresAt: { lt: now } },
            // Only delete if expired more than 7 days ago (for audit trail)
            { expiresAt: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } },
          ],
        },
      });

      // Delete expired refresh tokens (keep revoked ones for audit)
      const refreshTokensResult = await this.prisma.refreshToken.deleteMany({
        where: {
          AND: [
            { expiresAt: { lt: now } },
            // Only delete if expired more than 7 days ago (for audit trail)
            { expiresAt: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } },
          ],
        },
      });

      // Delete orphaned sessions (where the access token no longer exists or is revoked)
      // First, get all session IDs
      const sessions = await this.prisma.oAuthSession.findMany({
        select: { sessionId: true },
      });

      let sessionsDeleted = 0;
      for (const session of sessions) {
        const tokenExists = await this.prisma.accessToken.findFirst({
          where: {
            token: session.sessionId,
            revokedAt: null,
            expiresAt: { gt: now },
          },
        });

        if (!tokenExists) {
          await this.prisma.oAuthSession.delete({
            where: { sessionId: session.sessionId },
          }).catch(() => {
            // Ignore errors (e.g., already deleted)
          });
          sessionsDeleted++;
        }
      }

      const result = {
        authCodesDeleted: authCodesResult.count,
        accessTokensDeleted: accessTokensResult.count,
        refreshTokensDeleted: refreshTokensResult.count,
        sessionsDeleted,
      };

      const total = Object.values(result).reduce((a, b) => a + b, 0);
      if (total > 0) {
        console.error(`[TokenCleanup] Cleaned up ${total} expired items:`, result);
      }

      return result;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get statistics about tokens in the database
   */
  async getStats(): Promise<{
    totalAuthCodes: number;
    activeAuthCodes: number;
    totalAccessTokens: number;
    activeAccessTokens: number;
    totalRefreshTokens: number;
    activeRefreshTokens: number;
    totalSessions: number;
  }> {
    const now = new Date();

    const [
      totalAuthCodes,
      activeAuthCodes,
      totalAccessTokens,
      activeAccessTokens,
      totalRefreshTokens,
      activeRefreshTokens,
      totalSessions,
    ] = await Promise.all([
      this.prisma.authorizationCode.count(),
      this.prisma.authorizationCode.count({
        where: { used: false, expiresAt: { gt: now } },
      }),
      this.prisma.accessToken.count(),
      this.prisma.accessToken.count({
        where: { revokedAt: null, expiresAt: { gt: now } },
      }),
      this.prisma.refreshToken.count(),
      this.prisma.refreshToken.count({
        where: { revokedAt: null, expiresAt: { gt: now } },
      }),
      this.prisma.oAuthSession.count(),
    ]);

    return {
      totalAuthCodes,
      activeAuthCodes,
      totalAccessTokens,
      activeAccessTokens,
      totalRefreshTokens,
      activeRefreshTokens,
      totalSessions,
    };
  }
}
