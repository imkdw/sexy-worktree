import {
  isDeleteWorktreeJobTerminal,
  type DeleteWorktreeItemStatus,
  type DeleteWorktreeJobEvent,
  type DeleteWorktreeJobSnapshot,
  type DeleteWorktreeJobStatus,
  type DeleteWorktreeTarget,
} from "@shared/deleteWorktree";
import type { Result } from "@shared/result";
import { removeWorktree } from "../git/removeWorktree";

export type RemoveWorktreeFn = (args: {
  repoPath: string;
  worktreePath: string;
}) => Promise<Result<void, { stderr: string }>>;

export type DeleteWorktreeJobInput = {
  jobId: string;
  repoId: number;
  repoPath: string;
  targets: DeleteWorktreeTarget[];
};

export type DeleteWorktreeEventListener = (event: DeleteWorktreeJobEvent) => void;

type Waiter = () => void;
type StatusWaiter = {
  status: DeleteWorktreeJobStatus | DeleteWorktreeItemStatus;
  resolve: Waiter;
};

export class DeleteWorktreeManager {
  private snapshots = new Map<string, DeleteWorktreeJobSnapshot>();
  private listeners = new Set<DeleteWorktreeEventListener>();
  private runningJobs = new Set<string>();
  private waiters = new Map<string, Waiter[]>();
  private statusWaiters = new Map<string, StatusWaiter[]>();

  constructor(private readonly remover: RemoveWorktreeFn = removeWorktree) {}

  onEvent(fn: DeleteWorktreeEventListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  enqueue(input: DeleteWorktreeJobInput): string {
    const now = Date.now();
    const snapshot: DeleteWorktreeJobSnapshot = {
      id: input.jobId,
      repoId: input.repoId,
      repoPath: input.repoPath,
      status: "running",
      items: input.targets.map((target) => ({
        ...target,
        status: "pending",
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
      })),
      cancelRequested: false,
      createdAt: now,
      finishedAt: null,
    };

    this.snapshots.set(input.jobId, snapshot);
    this.runningJobs.add(input.jobId);
    this.emit({ kind: "created", job: this.cloneSnapshot(snapshot) });
    this.resolveStatusWaiters(input.jobId);
    void this.process(input.jobId);

    return input.jobId;
  }

  snapshot(jobId: string): DeleteWorktreeJobSnapshot | null {
    const snapshot = this.snapshots.get(jobId);
    return snapshot ? this.cloneSnapshot(snapshot) : null;
  }

  list(repoId: number): DeleteWorktreeJobSnapshot[] {
    return [...this.snapshots.values()]
      .filter((snapshot) => snapshot.repoId === repoId)
      .map((snapshot) => this.cloneSnapshot(snapshot));
  }

  cancel(jobId: string): boolean {
    const snapshot = this.snapshots.get(jobId);
    if (!snapshot || isDeleteWorktreeJobTerminal(snapshot.status) || snapshot.cancelRequested)
      return false;

    this.update(jobId, (current) => ({
      ...current,
      cancelRequested: true,
    }));
    return true;
  }

  dismiss(jobId: string): boolean {
    const snapshot = this.snapshots.get(jobId);
    if (!snapshot || !isDeleteWorktreeJobTerminal(snapshot.status)) return false;

    this.snapshots.delete(jobId);
    this.emit({ kind: "dismissed", jobId });
    return true;
  }

  findActiveConflict(args: {
    repoId: number;
    worktreePaths: string[];
  }): { existingPath: string } | null {
    const requestedPaths = new Set(args.worktreePaths);
    for (const snapshot of this.snapshots.values()) {
      if (snapshot.repoId !== args.repoId) continue;
      if (snapshot.status !== "running") continue;
      if (!this.runningJobs.has(snapshot.id)) continue;

      const existing = snapshot.items.find((item) => requestedPaths.has(item.worktreePath));
      if (existing) return { existingPath: existing.worktreePath };
    }
    return null;
  }

  waitFor(jobId: string): Promise<void> {
    const snapshot = this.snapshots.get(jobId);
    if (snapshot && isDeleteWorktreeJobTerminal(snapshot.status)) return Promise.resolve();

    return new Promise((resolve) => {
      const waiters = this.waiters.get(jobId) ?? [];
      waiters.push(resolve);
      this.waiters.set(jobId, waiters);
    });
  }

  waitForStatus(
    jobId: string,
    status: DeleteWorktreeJobStatus | DeleteWorktreeItemStatus
  ): Promise<void> {
    const snapshot = this.snapshots.get(jobId);
    if (snapshot && this.hasStatus(snapshot, status)) return Promise.resolve();

    return new Promise((resolve) => {
      const waiters = this.statusWaiters.get(jobId) ?? [];
      waiters.push({ status, resolve });
      this.statusWaiters.set(jobId, waiters);
    });
  }

  private async process(jobId: string): Promise<void> {
    try {
      while (true) {
        const snapshot = this.snapshots.get(jobId);
        if (!snapshot) return;

        if (snapshot.cancelRequested) {
          this.cancelPendingItems(jobId);
          break;
        }

        const nextIndex = snapshot.items.findIndex((item) => item.status === "pending");
        if (nextIndex === -1) break;

        this.markItem(jobId, nextIndex, {
          status: "deleting",
          errorMessage: null,
          startedAt: Date.now(),
          finishedAt: null,
        });

        const deletingSnapshot = this.snapshots.get(jobId);
        const deletingItem = deletingSnapshot?.items[nextIndex];
        if (!deletingSnapshot || !deletingItem) return;

        const result = await this.removeItem(deletingSnapshot.repoPath, deletingItem.worktreePath);
        if (result.ok) {
          this.markItem(jobId, nextIndex, {
            status: "deleted",
            finishedAt: Date.now(),
          });
        } else {
          this.markItem(jobId, nextIndex, {
            status: "failed",
            errorMessage: result.error.stderr,
            finishedAt: Date.now(),
          });
        }
      }

      this.finalize(jobId);
    } finally {
      this.runningJobs.delete(jobId);
    }
  }

  private async removeItem(
    repoPath: string,
    worktreePath: string
  ): Promise<Result<void, { stderr: string }>> {
    try {
      return await this.remover({ repoPath, worktreePath });
    } catch (error) {
      return {
        ok: false,
        error: {
          stderr: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  private cancelPendingItems(jobId: string): void {
    this.update(jobId, (snapshot) => ({
      ...snapshot,
      items: snapshot.items.map((item) =>
        item.status === "pending"
          ? {
              ...item,
              status: "cancelled",
              finishedAt: Date.now(),
            }
          : item
      ),
    }));
  }

  private markItem(
    jobId: string,
    itemIndex: number,
    patch: Partial<DeleteWorktreeJobSnapshot["items"][number]>
  ): void {
    this.update(jobId, (snapshot) => ({
      ...snapshot,
      items: snapshot.items.map((item, index) =>
        index === itemIndex
          ? {
              ...item,
              ...patch,
            }
          : item
      ),
    }));
  }

  private finalize(jobId: string): void {
    this.update(jobId, (snapshot) => {
      const hasFailed = snapshot.items.some((item) => item.status === "failed");
      const hasCancelled = snapshot.items.some((item) => item.status === "cancelled");
      const status: DeleteWorktreeJobStatus = hasFailed
        ? "failed"
        : hasCancelled
          ? "cancelled"
          : "done";

      return {
        ...snapshot,
        status,
        finishedAt: Date.now(),
      };
    });

    const snapshot = this.snapshots.get(jobId);
    if (snapshot) {
      this.emit({ kind: "completed", job: this.cloneSnapshot(snapshot) });
    }

    const waiters = this.waiters.get(jobId) ?? [];
    for (const resolve of waiters) resolve();
    this.waiters.delete(jobId);
    this.statusWaiters.delete(jobId);
  }

  private update(
    jobId: string,
    fn: (snapshot: DeleteWorktreeJobSnapshot) => DeleteWorktreeJobSnapshot
  ): void {
    const snapshot = this.snapshots.get(jobId);
    if (!snapshot) return;

    const updated = fn(snapshot);
    this.snapshots.set(jobId, updated);
    this.emit({ kind: "updated", job: this.cloneSnapshot(updated) });
    this.resolveStatusWaiters(jobId);
  }

  private emit(event: DeleteWorktreeJobEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("DeleteWorktreeManager listener failed", error);
      }
    }
  }

  private resolveStatusWaiters(jobId: string): void {
    const snapshot = this.snapshots.get(jobId);
    const waiters = this.statusWaiters.get(jobId);
    if (!snapshot || !waiters) return;

    const pending: StatusWaiter[] = [];
    for (const waiter of waiters) {
      if (this.hasStatus(snapshot, waiter.status)) {
        waiter.resolve();
      } else {
        pending.push(waiter);
      }
    }

    if (pending.length > 0) this.statusWaiters.set(jobId, pending);
    else this.statusWaiters.delete(jobId);
  }

  private hasStatus(
    snapshot: DeleteWorktreeJobSnapshot,
    status: DeleteWorktreeJobStatus | DeleteWorktreeItemStatus
  ): boolean {
    return snapshot.status === status || snapshot.items.some((item) => item.status === status);
  }

  private cloneSnapshot(snapshot: DeleteWorktreeJobSnapshot): DeleteWorktreeJobSnapshot {
    return {
      ...snapshot,
      items: snapshot.items.map((item) => ({ ...item })),
    };
  }
}
