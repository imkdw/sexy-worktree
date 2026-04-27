import { ALL_STEPS, type JobSnapshot, type StepKey, type StepStatus } from "@shared/newWorktree";
import { SerialQueue } from "./queue";
import {
  stepFetch,
  stepWorktreeAdd,
  stepFilesCopy,
  stepClonefileNodeModules,
  stepInstall,
  stepInitCommands,
} from "./steps";

export type JobInput = {
  jobId: string;
  repoId: number;
  mainRepoPath: string;
  branch: string;
  baseBranch: string;
  worktreePath: string;
  filesToCopy: string[];
  installCommand: string;
  initCommands: string[];
};

export type EventListener = (e: {
  kind: "created" | "updated" | "completed";
  job: JobSnapshot;
}) => void;

export class Bootstrapper {
  private queue = new SerialQueue();
  private snapshots = new Map<string, JobSnapshot>();
  private listeners = new Set<EventListener>();
  private waiters = new Map<string, Array<() => void>>();
  private inputs = new Map<string, JobInput>();

  onEvent(fn: EventListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  snapshot(jobId: string): JobSnapshot | null {
    return this.snapshots.get(jobId) ?? null;
  }

  list(repoId: number): JobSnapshot[] {
    return [...this.snapshots.values()].filter((s) => s.repoId === repoId);
  }

  waitFor(jobId: string): Promise<void> {
    const cur = this.snapshots.get(jobId);
    if (cur && (cur.status === "done" || cur.status === "failed" || cur.status === "cancelled")) {
      return Promise.resolve();
    }
    return new Promise((res) => {
      const arr = this.waiters.get(jobId) ?? [];
      arr.push(res);
      this.waiters.set(jobId, arr);
    });
  }

  enqueue(input: JobInput): string {
    this.inputs.set(input.jobId, input);
    const initial: JobSnapshot = {
      id: input.jobId,
      repoId: input.repoId,
      branch: input.branch,
      worktreePath: input.worktreePath,
      status: "queued",
      steps: ALL_STEPS.map((k) => ({ key: k, status: "pending" as StepStatus })),
      failedStep: null,
      failureMessage: null,
      createdAt: Date.now(),
    };
    this.snapshots.set(input.jobId, initial);
    this.emit("created", initial);

    this.queue.enqueue(async () => {
      const cur = this.snapshots.get(input.jobId);
      if (!cur || cur.status === "cancelled") return;
      this.update(input.jobId, (s) => ({ ...s, status: "running" }));

      for (const key of ALL_STEPS) {
        this.markStep(input.jobId, key, "in-progress");
        const r = await this.runStep(key, input);
        if (!r.ok) {
          this.markStep(input.jobId, key, "failed", r.error.stderr);
          this.update(input.jobId, (s) => ({
            ...s,
            status: "failed",
            failedStep: key,
            failureMessage: r.error.stderr,
          }));
          this.complete(input.jobId);
          return;
        }
        this.markStep(input.jobId, key, "done");
      }
      this.update(input.jobId, (s) => ({ ...s, status: "done" }));
      this.complete(input.jobId);
    });

    return input.jobId;
  }

  retry(jobId: string): void {
    const snap = this.snapshots.get(jobId);
    const input = this.inputs.get(jobId);
    if (!snap || !input || snap.status !== "failed") return;
    const failed = snap.failedStep;
    if (!failed) return;
    const idx = ALL_STEPS.indexOf(failed);
    this.update(jobId, (s) => ({
      ...s,
      status: "queued",
      failedStep: null,
      failureMessage: null,
      steps: s.steps.map((st, i) =>
        i < idx ? st : { key: st.key, status: "pending" as StepStatus }
      ),
    }));
    this.queue.enqueue(async () => {
      const cur = this.snapshots.get(jobId);
      if (!cur || cur.status === "cancelled") return;
      this.update(jobId, (s) => ({ ...s, status: "running" }));
      for (const key of ALL_STEPS.slice(idx)) {
        this.markStep(jobId, key, "in-progress");
        const r = await this.runStep(key, input);
        if (!r.ok) {
          this.markStep(jobId, key, "failed", r.error.stderr);
          this.update(jobId, (s) => ({
            ...s,
            status: "failed",
            failedStep: key,
            failureMessage: r.error.stderr,
          }));
          this.complete(jobId);
          return;
        }
        this.markStep(jobId, key, "done");
      }
      this.update(jobId, (s) => ({ ...s, status: "done" }));
      this.complete(jobId);
    });
  }

  cancel(jobId: string): void {
    const snap = this.snapshots.get(jobId);
    if (!snap) return;
    if (snap.status !== "failed" && snap.status !== "queued") return;
    this.update(jobId, (s) => ({ ...s, status: "cancelled" }));
    this.complete(jobId);
  }

  private async runStep(
    key: StepKey,
    input: JobInput
  ): Promise<{ ok: true } | { ok: false; error: { stderr: string } }> {
    const map: Record<
      StepKey,
      () => Promise<{ ok: true } | { ok: false; error: { stderr: string; code: number } }>
    > = {
      fetch: () => stepFetch({ repoPath: input.mainRepoPath }),
      "worktree-add": () =>
        stepWorktreeAdd({
          repoPath: input.mainRepoPath,
          branchName: input.branch,
          baseBranch: input.baseBranch,
          worktreePath: input.worktreePath,
        }),
      "files-copy": () =>
        stepFilesCopy({
          mainRepoPath: input.mainRepoPath,
          worktreePath: input.worktreePath,
          files: input.filesToCopy,
        }),
      clonefile: () =>
        stepClonefileNodeModules({
          mainRepoPath: input.mainRepoPath,
          worktreePath: input.worktreePath,
        }),
      install: () =>
        stepInstall({ worktreePath: input.worktreePath, installCommand: input.installCommand }),
      "init-commands": () =>
        stepInitCommands({ worktreePath: input.worktreePath, initCommands: input.initCommands }),
    };
    const r = await map[key]();
    return r.ok ? { ok: true } : { ok: false, error: { stderr: r.error.stderr } };
  }

  private markStep(jobId: string, key: StepKey, status: StepStatus, message?: string): void {
    this.update(jobId, (s) => ({
      ...s,
      steps: s.steps.map((st) =>
        st.key === key
          ? message !== undefined
            ? { ...st, status, message }
            : { ...st, status }
          : st
      ),
    }));
  }

  private update(jobId: string, fn: (s: JobSnapshot) => JobSnapshot): void {
    const cur = this.snapshots.get(jobId);
    if (!cur) return;
    const next = fn(cur);
    this.snapshots.set(jobId, next);
    this.emit("updated", next);
  }

  private complete(jobId: string): void {
    const snap = this.snapshots.get(jobId);
    if (snap) this.emit("completed", snap);
    const arr = this.waiters.get(jobId) ?? [];
    for (const r of arr) r();
    this.waiters.delete(jobId);
  }

  private emit(kind: "created" | "updated" | "completed", job: JobSnapshot): void {
    for (const fn of this.listeners) fn({ kind, job });
  }
}
