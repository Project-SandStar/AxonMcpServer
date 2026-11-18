/**
 * Access record: who called the IDE API and who committed a function.
 *
 * One row per /api/ide call and per commit on /mcp, with the user and the
 * prefix of the key. It has its own table (access_audit_events), not
 * tool_events: "Clear usage data" on the dashboard empties tool_events.
 * A row never holds a key, a token or Axon source.
 */

export type AuditSource = 'ide' | 'mcp';

export interface AccessAuditInput {
  source: AuditSource;
  /** 'projects.list', 'functions.export', 'function.commit', 'write.denied', 'other' */
  action: string;
  /** 'ok', 'conflict', 'error', 'denied' */
  status: string;
  userId?: string | null;
  username?: string | null;
  keyId?: string | null;
  keyPrefix?: string | null;
  instance?: string | null;
  project?: string | null;
  name?: string | null;
}

export interface AccessAuditRow {
  id: number;
  at: Date;
  source: string;
  action: string;
  status: string;
  userId: string | null;
  username: string | null;
  keyId: string | null;
  keyPrefix: string | null;
  instance: string | null;
  project: string | null;
  name: string | null;
}

/** The slice of PrismaClient this store uses (a test passes a fake). */
export interface AccessAuditDb {
  accessAuditEvent: {
    create(args: { data: Omit<AccessAuditRow, 'id' | 'at'> }): Promise<unknown>;
    findMany(args: { orderBy: { id: 'desc' }; take: number }): Promise<AccessAuditRow[]>;
    deleteMany(args: { where: { at: { lt: Date } } }): Promise<{ count: number }>;
  };
}

const clip = (value: string | null | undefined, max = 200): string | null =>
  typeof value === 'string' && value.length > 0 ? value.slice(0, max) : null;

export class AccessAudit {
  private readonly log: (line: string) => void;

  constructor(private readonly db: AccessAuditDb, log?: (line: string) => void) {
    this.log = log ?? ((line: string) => console.error(line));
  }

  /** Writes one row. Fire and forget: it never throws and never delays the caller. */
  record(event: AccessAuditInput): void {
    try {
      Promise.resolve()
        .then(() => this.db.accessAuditEvent.create({
          data: {
            source: event.source,
            action: clip(event.action, 60) ?? 'other',
            status: clip(event.status, 20) ?? 'ok',
            userId: clip(event.userId),
            username: clip(event.username),
            keyId: clip(event.keyId),
            keyPrefix: clip(event.keyPrefix, 20),
            instance: clip(event.instance),
            project: clip(event.project),
            name: clip(event.name),
          },
        }))
        .catch((e: any) => this.log(`[audit] Could not write an access record: ${e?.message ?? e}`));
    } catch (e: any) {
      this.log(`[audit] Could not write an access record: ${e?.message ?? e}`);
    }
  }

  /** The newest rows first. */
  async list(limit = 100): Promise<AccessAuditRow[]> {
    const take = Math.min(Math.max(Math.trunc(Number(limit)) || 100, 1), 500);
    return this.db.accessAuditEvent.findMany({ orderBy: { id: 'desc' }, take });
  }

  /** Deletes rows older than `before`. */
  async purge(before: Date): Promise<number> {
    return (await this.db.accessAuditEvent.deleteMany({ where: { at: { lt: before } } })).count;
  }
}
