/**
 * Persists each user's current SkySpark project so it survives a server
 * restart. MCP session ids change on restart, so rows are keyed by
 * (userId, clientId) instead. clientId '' is a per-user fallback row.
 */

import type { PrismaClient } from '../generated/prisma/index.js';

export interface ProjectScope {
  instance: string;
  project: string;
}

let prisma: PrismaClient | null = null;

export function initScopeStore(client: PrismaClient | null): void {
  prisma = client;
}

export async function loadScope(userId: string, clientId?: string): Promise<ProjectScope | null> {
  if (!prisma) return null;
  try {
    const exact = await prisma.userProjectScope.findUnique({
      where: { userId_clientId: { userId, clientId: clientId ?? '' } },
    });
    const row =
      exact ??
      (await prisma.userProjectScope.findFirst({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
      }));
    return row ? { instance: row.instance, project: row.project } : null;
  } catch (error) {
    console.error('[scopeStore] loadScope failed:', error);
    return null;
  }
}

export async function saveScope(
  userId: string,
  clientId: string | undefined,
  instance: string,
  project: string
): Promise<void> {
  if (!prisma) return;
  const keys = new Set([clientId ?? '', '']);
  try {
    for (const key of keys) {
      await prisma.userProjectScope.upsert({
        where: { userId_clientId: { userId, clientId: key } },
        create: { userId, clientId: key, instance, project },
        update: { instance, project },
      });
    }
  } catch (error) {
    console.error('[scopeStore] saveScope failed:', error);
  }
}
