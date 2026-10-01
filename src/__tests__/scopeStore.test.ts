import { initScopeStore, loadScope, saveScope } from '../skyspark/scopeStore';

interface Row {
  userId: string;
  clientId: string;
  instance: string;
  project: string;
  updatedAt: Date;
}

// In-memory stand-in for the slice of PrismaClient that scopeStore uses.
function fakePrisma() {
  const rows: Row[] = [];
  let tick = 0;
  const find = (userId: string, clientId: string) =>
    rows.find((r) => r.userId === userId && r.clientId === clientId) ?? null;
  const client = {
    rows,
    userProjectScope: {
      findUnique: async ({ where }: any) =>
        find(where.userId_clientId.userId, where.userId_clientId.clientId),
      findFirst: async ({ where }: any) =>
        rows
          .filter((r) => r.userId === where.userId)
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ?? null,
      upsert: async ({ where, create, update }: any) => {
        const { userId, clientId } = where.userId_clientId;
        const existing = find(userId, clientId);
        const updatedAt = new Date(++tick);
        if (existing) Object.assign(existing, update, { updatedAt });
        else rows.push({ ...create, updatedAt });
      },
    },
  };
  return client;
}

describe('scopeStore', () => {
  afterEach(() => initScopeStore(null));

  it('returns the exact (userId, clientId) row', async () => {
    const db = fakePrisma();
    initScopeStore(db as any);
    await saveScope('u1', 'claude-code', 'inst1', 'projA');
    await saveScope('u1', 'other-app', 'inst2', 'projB');

    expect(await loadScope('u1', 'claude-code')).toEqual({ instance: 'inst1', project: 'projA' });
    expect(await loadScope('u1', 'other-app')).toEqual({ instance: 'inst2', project: 'projB' });
  });

  it('also writes the per-user fallback row', async () => {
    const db = fakePrisma();
    initScopeStore(db as any);
    await saveScope('u1', 'claude-code', 'inst1', 'projA');

    expect(db.rows.map((r) => r.clientId).sort()).toEqual(['', 'claude-code']);
    expect(await loadScope('u1')).toEqual({ instance: 'inst1', project: 'projA' });
  });

  it('falls back to the most recently updated row for an unknown client', async () => {
    const db = fakePrisma();
    initScopeStore(db as any);
    db.rows.push(
      { userId: 'u1', clientId: 'a', instance: 'old', project: 'p1', updatedAt: new Date(100) },
      { userId: 'u1', clientId: 'b', instance: 'new', project: 'p2', updatedAt: new Date(200) },
      { userId: 'u2', clientId: 'c', instance: 'other', project: 'p3', updatedAt: new Date(300) }
    );

    expect(await loadScope('u1', 'unknown')).toEqual({ instance: 'new', project: 'p2' });
    expect(await loadScope('nobody', 'x')).toBeNull();
  });

  it('is a no-op without a database', async () => {
    initScopeStore(null);
    await expect(saveScope('u1', 'c', 'i', 'p')).resolves.toBeUndefined();
    expect(await loadScope('u1', 'c')).toBeNull();
  });

  it('swallows DB errors', async () => {
    const boom = async () => {
      throw new Error('db down');
    };
    initScopeStore({ userProjectScope: { findUnique: boom, findFirst: boom, upsert: boom } } as any);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(await loadScope('u1', 'c')).toBeNull();
    await expect(saveScope('u1', 'c', 'i', 'p')).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
