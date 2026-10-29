/**
 * Per-project change queue.
 *
 * One job runs per project at a time. Paths that arrive while a job runs are
 * merged into one follow-up job for that project.
 */

export type ChangeJob = (projectId: number, paths: string[]) => Promise<unknown>;

interface ProjectSlot {
  running: boolean;
  pending: Set<string>;
  idle: Array<() => void>;
}

export interface QueueStatus {
  projectId: number;
  running: boolean;
  pending: number;
}

export class ChangeQueue {
  private slots = new Map<number, ProjectSlot>();
  private lastResult = new Map<number, unknown>();

  constructor(private job: ChangeJob) {}

  enqueue(projectId: number, paths: string[]): QueueStatus {
    let slot = this.slots.get(projectId);
    if (!slot) {
      slot = { running: false, pending: new Set(), idle: [] };
      this.slots.set(projectId, slot);
    }
    paths.forEach(p => slot!.pending.add(p));
    if (!slot.running) void this.run(projectId, slot);
    return this.status(projectId);
  }

  status(projectId: number): QueueStatus {
    const slot = this.slots.get(projectId);
    return { projectId, running: slot?.running ?? false, pending: slot?.pending.size ?? 0 };
  }

  result(projectId: number): unknown {
    return this.lastResult.get(projectId);
  }

  /** Resolves when the project has no running or pending job. */
  whenIdle(projectId: number): Promise<void> {
    const slot = this.slots.get(projectId);
    if (!slot || (!slot.running && slot.pending.size === 0)) return Promise.resolve();
    return new Promise(resolve => slot.idle.push(resolve));
  }

  private async run(projectId: number, slot: ProjectSlot): Promise<void> {
    slot.running = true;
    try {
      while (slot.pending.size > 0) {
        const batch = [...slot.pending];
        slot.pending.clear();
        try {
          this.lastResult.set(projectId, await this.job(projectId, batch));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[changes] project ${projectId} job failed: ${msg}`);
          this.lastResult.set(projectId, { error: msg });
        }
      }
    } finally {
      slot.running = false;
      const waiters = slot.idle.splice(0);
      waiters.forEach(w => w());
    }
  }
}
