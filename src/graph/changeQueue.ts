/**
 * Per-project change queue.
 *
 * One job runs per project at a time. Paths that arrive while a job runs are
 * merged into one follow-up job for that project. A full rebuild request
 * (enqueueFull) covers all pending paths: the next job is one full build.
 */

export interface ChangeJobOptions {
  /** Full rebuild of the whole project (graph + embeddings). */
  full?: boolean;
}

export type ChangeJob = (projectId: number, paths: string[], opts: ChangeJobOptions) => Promise<unknown>;

interface ProjectSlot {
  running: boolean;
  runningFull: boolean;
  pending: Set<string>;
  fullPending: boolean;
  idle: Array<() => void>;
  lastStartedAt?: string;
  lastFinishedAt?: string;
}

export interface QueueStatus {
  projectId: number;
  running: boolean;
  pending: number;
}

export interface QueueInfo extends QueueStatus {
  runningFull: boolean;
  fullPending: boolean;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
}

export class ChangeQueue {
  private slots = new Map<number, ProjectSlot>();
  private lastResult = new Map<number, unknown>();

  constructor(private job: ChangeJob) {}

  private slot(projectId: number): ProjectSlot {
    let slot = this.slots.get(projectId);
    if (!slot) {
      slot = { running: false, runningFull: false, pending: new Set(), fullPending: false, idle: [] };
      this.slots.set(projectId, slot);
    }
    return slot;
  }

  enqueue(projectId: number, paths: string[]): QueueStatus {
    const slot = this.slot(projectId);
    paths.forEach(p => slot.pending.add(p));
    if (!slot.running) void this.run(projectId, slot);
    return this.status(projectId);
  }

  /** Queues one full rebuild. Pending paths are folded into it. */
  enqueueFull(projectId: number): QueueStatus {
    const slot = this.slot(projectId);
    slot.fullPending = true;
    if (!slot.running) void this.run(projectId, slot);
    return this.status(projectId);
  }

  status(projectId: number): QueueStatus {
    const slot = this.slots.get(projectId);
    return { projectId, running: slot?.running ?? false, pending: slot?.pending.size ?? 0 };
  }

  info(projectId: number): QueueInfo {
    const slot = this.slots.get(projectId);
    return {
      ...this.status(projectId),
      runningFull: slot?.runningFull ?? false,
      fullPending: slot?.fullPending ?? false,
      lastStartedAt: slot?.lastStartedAt ?? null,
      lastFinishedAt: slot?.lastFinishedAt ?? null,
    };
  }

  result(projectId: number): unknown {
    return this.lastResult.get(projectId);
  }

  /** Resolves when the project has no running or pending job. */
  whenIdle(projectId: number): Promise<void> {
    const slot = this.slots.get(projectId);
    if (!slot || (!slot.running && slot.pending.size === 0 && !slot.fullPending)) return Promise.resolve();
    return new Promise(resolve => slot.idle.push(resolve));
  }

  private async run(projectId: number, slot: ProjectSlot): Promise<void> {
    slot.running = true;
    try {
      while (slot.pending.size > 0 || slot.fullPending) {
        const full = slot.fullPending;
        const batch = [...slot.pending];
        slot.pending.clear();
        slot.fullPending = false;
        slot.runningFull = full;
        slot.lastStartedAt = new Date().toISOString();
        try {
          this.lastResult.set(projectId, await this.job(projectId, full ? [] : batch, { full }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[changes] project ${projectId} job failed: ${msg}`);
          this.lastResult.set(projectId, { error: msg });
        } finally {
          slot.runningFull = false;
          slot.lastFinishedAt = new Date().toISOString();
        }
      }
    } finally {
      slot.running = false;
      const waiters = slot.idle.splice(0);
      waiters.forEach(w => w());
    }
  }
}
