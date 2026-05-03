# Background Worktree Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run bulk worktree deletion as a background main-process job and show per-worktree progress while the user keeps working.

**Architecture:** Add a dedicated delete job manager in the main process, separate from the new-worktree `Bootstrapper`. The renderer starts one delete job through IPC, closes the confirmation dialog immediately, subscribes to delete job events through a provider, and renders those jobs in a right-side Background Jobs panel.

**Tech Stack:** Electron main/preload IPC, React 19 context providers, TypeScript strict mode, Vitest Node/jsdom tests, Tailwind v4 tokens, lucide-react icons.

---

## Project Guardrail

Do not create branches or commits while executing this plan unless the user explicitly asks for that exact git operation. This repository's local `AGENTS.md` rule overrides the generic writing-plans "frequent commits" convention.

## File Structure

- Create: `src/shared/deleteWorktree.ts`
  - Shared job, item, target, and event types for background delete jobs.
- Modify: `src/shared/ipc.ts`
  - Add typed `worktreeDelete:*` channels and export `WorktreeDeleteJobEvent`.
- Modify: `src/preload/index.ts`
  - Expose `window.api.worktreeDelete` invokers and event subscription.
- Modify: `src/renderer/ipc/api.ts`
  - Add renderer API typings for `worktreeDelete`.
- Create: `src/main/worktreeDelete/manager.ts`
  - Own in-memory delete job snapshots, sequential processing, cancellation, dismissal, and event emission.
- Create: `src/main/worktreeDelete/validate.ts`
  - Validate start requests against the current `git worktree list` result and active delete conflicts.
- Modify: `src/main/ipc/worktreeDelete.ts`
  - Keep legacy `worktree:remove`; add background delete IPC handlers and event push.
- Modify: `src/main/ipc/index.ts`
  - Pass `getWindow` to `registerWorktreeDeleteHandlers`.
- Create: `test/main/worktreeDelete/manager.test.ts`
  - Unit-test job state transitions with an injected remover.
- Create: `test/main/worktreeDelete/validate.test.ts`
  - Unit-test request validation without Electron IPC.
- Create: `src/renderer/state/deleteWorktree.tsx`
  - Load, subscribe, merge, refresh, cancel, dismiss, and auto-dismiss delete jobs.
- Create: `test/renderer/state/deleteWorktree.test.tsx`
  - Unit-test provider event handling, repo refresh, and auto-dismiss.
- Create: `src/renderer/backgroundJobs/BackgroundJobsPanel.tsx`
  - Render visible delete jobs in a right-side panel.
- Create: `test/renderer/backgroundJobs/BackgroundJobsPanel.test.tsx`
  - Unit-test panel summary, item statuses, cancel, and dismiss actions.
- Modify: `src/renderer/selectMode/ConfirmDeleteModal.tsx`
  - Start a background delete job instead of awaiting per-worktree deletes.
- Create: `test/renderer/selectMode/ConfirmDeleteModal.test.tsx`
  - Unit-test successful start, start failure, and disabled empty-target behavior.
- Modify: `src/renderer/App.tsx`
  - Add `DeleteWorktreeProvider` and render `BackgroundJobsPanel` next to the main content.
- Modify test API mocks in:
  - `test/renderer/newWorktree/NewWorktreeModal.test.ts`
  - `test/renderer/chrome/Rail.test.tsx`
  - `test/renderer/chrome/Toolbar.test.tsx`
  - `test/renderer/card/Card.test.tsx`
  - `test/renderer/settings/Settings.test.tsx`

## Task 1: Add Shared Delete Job Contracts

**Files:**

- Create: `src/shared/deleteWorktree.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/ipc/api.ts`
- Modify renderer test mocks listed in File Structure

- [ ] **Step 1: Create shared delete job types**

Create `src/shared/deleteWorktree.ts` with this content:

```ts
export type DeleteWorktreeTarget = {
  worktreePath: string;
  branch: string | null;
};

export type DeleteWorktreeItemStatus =
  | "pending"
  | "deleting"
  | "deleted"
  | "failed"
  | "cancelled";

export type DeleteWorktreeJobStatus = "running" | "done" | "failed" | "cancelled";

export type DeleteWorktreeJobItem = DeleteWorktreeTarget & {
  status: DeleteWorktreeItemStatus;
  errorMessage: string | null;
  startedAt: number | null;
  finishedAt: number | null;
};

export type DeleteWorktreeJobSnapshot = {
  id: string;
  repoId: number;
  repoPath: string;
  status: DeleteWorktreeJobStatus;
  items: DeleteWorktreeJobItem[];
  cancelRequested: boolean;
  createdAt: number;
  finishedAt: number | null;
};

export type DeleteWorktreeJobEvent =
  | { kind: "created"; job: DeleteWorktreeJobSnapshot }
  | { kind: "updated"; job: DeleteWorktreeJobSnapshot }
  | { kind: "completed"; job: DeleteWorktreeJobSnapshot }
  | { kind: "dismissed"; jobId: string };

export function isDeleteWorktreeJobTerminal(status: DeleteWorktreeJobStatus): boolean {
  return status === "done" || status === "failed" || status === "cancelled";
}
```

- [ ] **Step 2: Extend the IPC type map**

In `src/shared/ipc.ts`, add this import near the existing `newWorktree` import:

```ts
import type { DeleteWorktreeJobEvent, DeleteWorktreeJobSnapshot } from "./deleteWorktree";
```

Add these channels to `IpcChannels` immediately after the legacy `"worktree:remove"` channel:

```ts
  "worktreeDelete:start": {
    in: {
      repoId: number;
      targets: { worktreePath: string; branch: string | null }[];
    };
    out: Result<{ jobId: string }, { message: string }>;
  };
  "worktreeDelete:cancel": {
    in: { jobId: string };
    out: Result<void, { message: string }>;
  };
  "worktreeDelete:dismiss": {
    in: { jobId: string };
    out: Result<void, { message: string }>;
  };
  "worktreeDelete:list": {
    in: { repoId: number };
    out: Result<{ jobs: DeleteWorktreeJobSnapshot[] }, never>;
  };
```

At the bottom of `src/shared/ipc.ts`, keep the existing `NewWorktreeJobEvent` export and add:

```ts
export type WorktreeDeleteJobEvent = DeleteWorktreeJobEvent;
```

- [ ] **Step 3: Expose the preload API**

In `src/preload/index.ts`, extend the import from `@shared/ipc`:

```ts
  WorktreeDeleteJobEvent,
```

Add this object next to the existing `newWorktree` API object:

```ts
  worktreeDelete: {
    start: makeInvoker("worktreeDelete:start"),
    cancel: makeInvoker("worktreeDelete:cancel"),
    dismiss: makeInvoker("worktreeDelete:dismiss"),
    list: makeInvoker("worktreeDelete:list"),
    onEvent: (cb: (e: WorktreeDeleteJobEvent) => void) => {
      const fn = (_e: IpcRendererEvent, data: WorktreeDeleteJobEvent): void => cb(data);
      ipcRenderer.on("worktreeDelete:event", fn);
      return () => ipcRenderer.off("worktreeDelete:event", fn);
    },
  },
```

- [ ] **Step 4: Type the renderer API**

In `src/renderer/ipc/api.ts`, extend the import from `@shared/ipc`:

```ts
  WorktreeDeleteJobEvent,
```

Add this field to the `Api` type next to `newWorktree`:

```ts
  worktreeDelete: {
    start: Invoker<"worktreeDelete:start">;
    cancel: Invoker<"worktreeDelete:cancel">;
    dismiss: Invoker<"worktreeDelete:dismiss">;
    list: Invoker<"worktreeDelete:list">;
    onEvent: (cb: (e: WorktreeDeleteJobEvent) => void) => () => void;
  };
```

- [ ] **Step 5: Update existing renderer API mocks**

In every renderer test `makeApi()` object listed in File Structure, add this property next to `newWorktree`:

```ts
    worktreeDelete: {
      start: vi.fn(),
      cancel: vi.fn(),
      dismiss: vi.fn(),
      list: vi.fn(),
      onEvent: vi.fn().mockReturnValue(() => {}),
    },
```

For override objects inside `test/renderer/newWorktree/NewWorktreeModal.test.ts`, add the same `worktreeDelete` object if the override uses `satisfies ApiMock` or fully replaces `window.api`.

- [ ] **Step 6: Run typecheck for contract drift**

Run:

```bash
pnpm typecheck
```

Expected: PASS after every renderer `ApiMock` includes the new `worktreeDelete` property. If TypeScript reports a missing `worktreeDelete` mock field, add the exact mock object from Step 5 and rerun this command before moving to Task 2.

## Task 2: Build The Delete Job Manager With TDD

**Files:**

- Create: `test/main/worktreeDelete/manager.test.ts`
- Create: `src/main/worktreeDelete/manager.ts`

- [ ] **Step 1: Write manager tests**

Create `test/main/worktreeDelete/manager.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ok, err, type Result } from "@shared/result";
import type { DeleteWorktreeJobEvent } from "@shared/deleteWorktree";
import { DeleteWorktreeManager, type RemoveWorktreeFn } from "@main/worktreeDelete/manager";

function makeTarget(name: string): { worktreePath: string; branch: string } {
  return {
    worktreePath: `/repo/worktrees/${name}`,
    branch: `feature/${name}`,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("DeleteWorktreeManager", () => {
  it("deletes every target sequentially and completes with done", async () => {
    const calls: string[] = [];
    const events: DeleteWorktreeJobEvent[] = [];
    const remover: RemoveWorktreeFn = async ({ worktreePath }) => {
      calls.push(worktreePath);
      return ok(undefined);
    };
    const manager = new DeleteWorktreeManager(remover);
    manager.onEvent((event) => events.push(event));

    const jobId = manager.enqueue({
      jobId: "delete-success",
      repoId: 1,
      repoPath: "/repo",
      targets: [makeTarget("a"), makeTarget("b")],
    });

    await manager.waitFor(jobId);

    const snap = manager.snapshot(jobId);
    expect(snap?.status).toBe("done");
    expect(snap?.items.map((item) => item.status)).toEqual(["deleted", "deleted"]);
    expect(calls).toEqual(["/repo/worktrees/a", "/repo/worktrees/b"]);
    expect(events[0]).toMatchObject({ kind: "created" });
    expect(events.at(-1)).toMatchObject({ kind: "completed", job: { status: "done" } });
  });

  it("marks one item failed and continues with later pending items", async () => {
    const calls: string[] = [];
    const remover: RemoveWorktreeFn = async ({ worktreePath }) => {
      calls.push(worktreePath);
      if (worktreePath.endsWith("/b")) return err({ stderr: "remove failed" });
      return ok(undefined);
    };
    const manager = new DeleteWorktreeManager(remover);

    const jobId = manager.enqueue({
      jobId: "delete-partial-fail",
      repoId: 1,
      repoPath: "/repo",
      targets: [makeTarget("a"), makeTarget("b"), makeTarget("c")],
    });

    await manager.waitFor(jobId);

    const snap = manager.snapshot(jobId);
    expect(snap?.status).toBe("failed");
    expect(snap?.items.map((item) => item.status)).toEqual(["deleted", "failed", "deleted"]);
    expect(snap?.items[1]?.errorMessage).toBe("remove failed");
    expect(calls).toEqual(["/repo/worktrees/a", "/repo/worktrees/b", "/repo/worktrees/c"]);
  });

  it("turns thrown remover errors into failed items and keeps processing", async () => {
    const remover: RemoveWorktreeFn = async ({ worktreePath }) => {
      if (worktreePath.endsWith("/a")) throw new Error("unexpected failure");
      return ok(undefined);
    };
    const manager = new DeleteWorktreeManager(remover);

    const jobId = manager.enqueue({
      jobId: "delete-throw",
      repoId: 1,
      repoPath: "/repo",
      targets: [makeTarget("a"), makeTarget("b")],
    });

    await manager.waitFor(jobId);

    const snap = manager.snapshot(jobId);
    expect(snap?.status).toBe("failed");
    expect(snap?.items.map((item) => item.status)).toEqual(["failed", "deleted"]);
    expect(snap?.items[0]?.errorMessage).toBe("unexpected failure");
  });

  it("cancels only pending items after the current deleting item finishes", async () => {
    const gate = deferred<Result<void, { stderr: string }>>();
    let calls = 0;
    const remover: RemoveWorktreeFn = async () => {
      calls += 1;
      if (calls === 1) return gate.promise;
      return ok(undefined);
    };
    const manager = new DeleteWorktreeManager(remover);

    const jobId = manager.enqueue({
      jobId: "delete-cancel",
      repoId: 1,
      repoPath: "/repo",
      targets: [makeTarget("a"), makeTarget("b"), makeTarget("c")],
    });

    await manager.waitForStatus(jobId, "deleting");
    const cancelled = manager.cancel(jobId);
    expect(cancelled).toBe(true);
    gate.resolve(ok(undefined));
    await manager.waitFor(jobId);

    const snap = manager.snapshot(jobId);
    expect(snap?.status).toBe("cancelled");
    expect(snap?.cancelRequested).toBe(true);
    expect(snap?.items.map((item) => item.status)).toEqual(["deleted", "cancelled", "cancelled"]);
    expect(calls).toBe(1);
  });

  it("prefers failed final status when cancellation and item failure both happen", async () => {
    const gate = deferred<Result<void, { stderr: string }>>();
    const remover: RemoveWorktreeFn = async () => gate.promise;
    const manager = new DeleteWorktreeManager(remover);

    const jobId = manager.enqueue({
      jobId: "delete-fail-after-cancel",
      repoId: 1,
      repoPath: "/repo",
      targets: [makeTarget("a"), makeTarget("b")],
    });

    await manager.waitForStatus(jobId, "deleting");
    manager.cancel(jobId);
    gate.resolve(err({ stderr: "still failed" }));
    await manager.waitFor(jobId);

    const snap = manager.snapshot(jobId);
    expect(snap?.status).toBe("failed");
    expect(snap?.items.map((item) => item.status)).toEqual(["failed", "cancelled"]);
  });

  it("dismisses terminal jobs and emits dismissed", async () => {
    const events: DeleteWorktreeJobEvent[] = [];
    const manager = new DeleteWorktreeManager(async () => ok(undefined));
    manager.onEvent((event) => events.push(event));

    const jobId = manager.enqueue({
      jobId: "delete-dismiss",
      repoId: 1,
      repoPath: "/repo",
      targets: [makeTarget("a")],
    });

    await manager.waitFor(jobId);
    expect(manager.dismiss(jobId)).toBe(true);
    expect(manager.snapshot(jobId)).toBeNull();
    expect(events.at(-1)).toEqual({ kind: "dismissed", jobId });
  });

  it("does not dismiss running jobs", async () => {
    const gate = deferred<Result<void, { stderr: string }>>();
    const manager = new DeleteWorktreeManager(async () => gate.promise);

    const jobId = manager.enqueue({
      jobId: "delete-running-dismiss",
      repoId: 1,
      repoPath: "/repo",
      targets: [makeTarget("a")],
    });

    await manager.waitForStatus(jobId, "deleting");
    expect(manager.dismiss(jobId)).toBe(false);
    gate.resolve(ok(undefined));
    await manager.waitFor(jobId);
  });

  it("finds active conflicts only in running delete jobs", async () => {
    const gate = deferred<Result<void, { stderr: string }>>();
    const manager = new DeleteWorktreeManager(async () => gate.promise);

    const runningJobId = manager.enqueue({
      jobId: "delete-running-conflict",
      repoId: 1,
      repoPath: "/repo",
      targets: [makeTarget("a")],
    });
    await manager.waitForStatus(runningJobId, "deleting");

    expect(
      manager.findActiveConflict({
        repoId: 1,
        worktreePaths: ["/repo/worktrees/a"],
      })
    ).toEqual({ existingPath: "/repo/worktrees/a" });

    expect(
      manager.findActiveConflict({
        repoId: 2,
        worktreePaths: ["/repo/worktrees/a"],
      })
    ).toBeNull();

    gate.resolve(ok(undefined));
    await manager.waitFor(runningJobId);

    expect(
      manager.findActiveConflict({
        repoId: 1,
        worktreePaths: ["/repo/worktrees/a"],
      })
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run manager tests and verify they fail**

Run:

```bash
pnpm vitest run test/main/worktreeDelete/manager.test.ts
```

Expected: FAIL with a module resolution error for `@main/worktreeDelete/manager`.

- [ ] **Step 3: Implement the manager**

Create `src/main/worktreeDelete/manager.ts`:

```ts
import type {
  DeleteWorktreeJobEvent,
  DeleteWorktreeJobItem,
  DeleteWorktreeJobSnapshot,
  DeleteWorktreeJobStatus,
  DeleteWorktreeTarget,
  DeleteWorktreeItemStatus,
} from "@shared/deleteWorktree";
import { isDeleteWorktreeJobTerminal } from "@shared/deleteWorktree";
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

export type EventListener = (event: DeleteWorktreeJobEvent) => void;

export class DeleteWorktreeManager {
  private snapshots = new Map<string, DeleteWorktreeJobSnapshot>();
  private listeners = new Set<EventListener>();
  private runningJobs = new Set<string>();
  private waiters = new Map<string, Array<() => void>>();
  private statusWaiters = new Map<string, Array<{ status: DeleteWorktreeItemStatus; resolve: () => void }>>();

  constructor(private readonly remover: RemoveWorktreeFn = removeWorktree) {}

  onEvent(fn: EventListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  snapshot(jobId: string): DeleteWorktreeJobSnapshot | null {
    return this.snapshots.get(jobId) ?? null;
  }

  list(repoId: number): DeleteWorktreeJobSnapshot[] {
    return [...this.snapshots.values()].filter((snapshot) => snapshot.repoId === repoId);
  }

  findActiveConflict(args: {
    repoId: number;
    worktreePaths: string[];
  }): { existingPath: string } | null {
    const targetSet = new Set(args.worktreePaths);
    for (const snapshot of this.snapshots.values()) {
      if (snapshot.repoId !== args.repoId) continue;
      if (snapshot.status !== "running") continue;
      const conflict = snapshot.items.find((item) => targetSet.has(item.worktreePath));
      if (conflict) return { existingPath: conflict.worktreePath };
    }
    return null;
  }

  waitFor(jobId: string): Promise<void> {
    const current = this.snapshots.get(jobId);
    if (current && isDeleteWorktreeJobTerminal(current.status)) return Promise.resolve();
    return new Promise((resolve) => {
      const waiters = this.waiters.get(jobId) ?? [];
      waiters.push(resolve);
      this.waiters.set(jobId, waiters);
    });
  }

  waitForStatus(jobId: string, status: DeleteWorktreeItemStatus): Promise<void> {
    const current = this.snapshots.get(jobId);
    if (current?.items.some((item) => item.status === status)) return Promise.resolve();
    return new Promise((resolve) => {
      const waiters = this.statusWaiters.get(jobId) ?? [];
      waiters.push({ status, resolve });
      this.statusWaiters.set(jobId, waiters);
    });
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
    this.emit({ kind: "created", job: snapshot });
    void this.runJob(input.jobId);
    return input.jobId;
  }

  cancel(jobId: string): boolean {
    const snapshot = this.snapshots.get(jobId);
    if (!snapshot || snapshot.status !== "running") return false;
    this.update(jobId, (current) => ({ ...current, cancelRequested: true }));
    return true;
  }

  dismiss(jobId: string): boolean {
    const snapshot = this.snapshots.get(jobId);
    if (!snapshot || !isDeleteWorktreeJobTerminal(snapshot.status)) return false;
    this.snapshots.delete(jobId);
    this.emit({ kind: "dismissed", jobId });
    return true;
  }

  private async runJob(jobId: string): Promise<void> {
    if (this.runningJobs.has(jobId)) return;
    this.runningJobs.add(jobId);
    try {
      while (true) {
        const current = this.snapshots.get(jobId);
        if (!current) return;
        if (current.cancelRequested) {
          this.cancelPending(jobId);
          this.finalize(jobId);
          return;
        }

        const nextItem = current.items.find((item) => item.status === "pending");
        if (!nextItem) {
          this.finalize(jobId);
          return;
        }

        this.markItem(jobId, nextItem.worktreePath, {
          status: "deleting",
          startedAt: Date.now(),
        });

        let errorMessage: string | null = null;
        try {
          const result = await this.remover({
            repoPath: current.repoPath,
            worktreePath: nextItem.worktreePath,
          });
          if (!result.ok) errorMessage = result.error.stderr;
        } catch (error) {
          errorMessage = error instanceof Error ? error.message : String(error);
        }

        if (errorMessage) {
          this.markItem(jobId, nextItem.worktreePath, {
            status: "failed",
            errorMessage,
            finishedAt: Date.now(),
          });
        } else {
          this.markItem(jobId, nextItem.worktreePath, {
            status: "deleted",
            errorMessage: null,
            finishedAt: Date.now(),
          });
        }
      }
    } finally {
      this.runningJobs.delete(jobId);
    }
  }

  private markItem(
    jobId: string,
    worktreePath: string,
    patch: Partial<DeleteWorktreeJobItem>
  ): void {
    this.update(jobId, (snapshot) => ({
      ...snapshot,
      items: snapshot.items.map((item) =>
        item.worktreePath === worktreePath ? { ...item, ...patch } : item
      ),
    }));
  }

  private cancelPending(jobId: string): void {
    const now = Date.now();
    this.update(jobId, (snapshot) => ({
      ...snapshot,
      items: snapshot.items.map((item) =>
        item.status === "pending" ? { ...item, status: "cancelled", finishedAt: now } : item
      ),
    }));
  }

  private finalize(jobId: string): void {
    this.update(jobId, (snapshot) => ({
      ...snapshot,
      status: computeFinalStatus(snapshot.items),
      finishedAt: Date.now(),
    }));
    const snapshot = this.snapshots.get(jobId);
    if (snapshot) this.emit({ kind: "completed", job: snapshot });
    for (const waiter of this.waiters.get(jobId) ?? []) waiter();
    this.waiters.delete(jobId);
    this.statusWaiters.delete(jobId);
  }

  private update(
    jobId: string,
    updater: (snapshot: DeleteWorktreeJobSnapshot) => DeleteWorktreeJobSnapshot
  ): void {
    const current = this.snapshots.get(jobId);
    if (!current) return;
    const next = updater(current);
    this.snapshots.set(jobId, next);
    this.emit({ kind: "updated", job: next });
    this.resolveStatusWaiters(jobId, next);
  }

  private resolveStatusWaiters(jobId: string, snapshot: DeleteWorktreeJobSnapshot): void {
    const waiters = this.statusWaiters.get(jobId);
    if (!waiters) return;
    const remaining: Array<{ status: DeleteWorktreeItemStatus; resolve: () => void }> = [];
    for (const waiter of waiters) {
      if (snapshot.items.some((item) => item.status === waiter.status)) waiter.resolve();
      else remaining.push(waiter);
    }
    if (remaining.length > 0) this.statusWaiters.set(jobId, remaining);
    else this.statusWaiters.delete(jobId);
  }

  private emit(event: DeleteWorktreeJobEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function computeFinalStatus(items: DeleteWorktreeJobItem[]): DeleteWorktreeJobStatus {
  if (items.some((item) => item.status === "failed")) return "failed";
  if (items.some((item) => item.status === "cancelled")) return "cancelled";
  return "done";
}
```

- [ ] **Step 4: Run manager tests and verify they pass**

Run:

```bash
pnpm vitest run test/main/worktreeDelete/manager.test.ts
```

Expected: PASS.

## Task 3: Validate Start Requests And Wire Main IPC

**Files:**

- Create: `test/main/worktreeDelete/validate.test.ts`
- Create: `src/main/worktreeDelete/validate.ts`
- Modify: `src/main/ipc/worktreeDelete.ts`
- Modify: `src/main/ipc/index.ts`

- [ ] **Step 1: Write validation tests**

Create `test/main/worktreeDelete/validate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { WorktreeInfo } from "@main/git/worktrees";
import { validateDeleteTargets } from "@main/worktreeDelete/validate";

const currentWorktrees: WorktreeInfo[] = [
  {
    path: "/repo",
    branch: "main",
    head: "abc",
    isMain: true,
  },
  {
    path: "/repo/worktrees/a",
    branch: "feature/a",
    head: "def",
    isMain: false,
  },
  {
    path: "/repo/worktrees/b",
    branch: null,
    head: "ghi",
    isMain: false,
  },
];

describe("validateDeleteTargets", () => {
  it("returns normalized targets with current branch values", () => {
    const result = validateDeleteTargets({
      targets: [
        { worktreePath: "/repo/worktrees/a", branch: "stale-branch" },
        { worktreePath: "/repo/worktrees/b", branch: "stale-detached" },
      ],
      currentWorktrees,
      activeConflict: null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([
      { worktreePath: "/repo/worktrees/a", branch: "feature/a" },
      { worktreePath: "/repo/worktrees/b", branch: null },
    ]);
  });

  it("rejects empty target lists", () => {
    const result = validateDeleteTargets({
      targets: [],
      currentWorktrees,
      activeConflict: null,
    });

    expect(result).toEqual({ ok: false, error: { message: "No worktrees selected for deletion" } });
  });

  it("rejects duplicate target paths", () => {
    const result = validateDeleteTargets({
      targets: [
        { worktreePath: "/repo/worktrees/a", branch: "feature/a" },
        { worktreePath: "/repo/worktrees/a", branch: "feature/a" },
      ],
      currentWorktrees,
      activeConflict: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe("Duplicate delete target: /repo/worktrees/a");
  });

  it("rejects missing worktrees", () => {
    const result = validateDeleteTargets({
      targets: [{ worktreePath: "/repo/worktrees/missing", branch: "feature/missing" }],
      currentWorktrees,
      activeConflict: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe("Worktree is no longer available: /repo/worktrees/missing");
  });

  it("rejects the main worktree", () => {
    const result = validateDeleteTargets({
      targets: [{ worktreePath: "/repo", branch: "main" }],
      currentWorktrees,
      activeConflict: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe("Main worktree cannot be deleted: /repo");
  });

  it("rejects paths already included in a running delete job", () => {
    const result = validateDeleteTargets({
      targets: [{ worktreePath: "/repo/worktrees/a", branch: "feature/a" }],
      currentWorktrees,
      activeConflict: { existingPath: "/repo/worktrees/a" },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe(
      "Worktree is already being deleted: /repo/worktrees/a"
    );
  });
});
```

- [ ] **Step 2: Run validation tests and verify they fail**

Run:

```bash
pnpm vitest run test/main/worktreeDelete/validate.test.ts
```

Expected: FAIL with a module resolution error for `@main/worktreeDelete/validate`.

- [ ] **Step 3: Implement validation**

Create `src/main/worktreeDelete/validate.ts`:

```ts
import { err, ok, type Result } from "@shared/result";
import type { DeleteWorktreeTarget } from "@shared/deleteWorktree";
import type { WorktreeInfo } from "../git/worktrees";

export function validateDeleteTargets(args: {
  targets: DeleteWorktreeTarget[];
  currentWorktrees: WorktreeInfo[];
  activeConflict: { existingPath: string } | null;
}): Result<DeleteWorktreeTarget[], { message: string }> {
  if (args.targets.length === 0) {
    return err({ message: "No worktrees selected for deletion" });
  }

  if (args.activeConflict) {
    return err({
      message: `Worktree is already being deleted: ${args.activeConflict.existingPath}`,
    });
  }

  const seen = new Set<string>();
  const currentByPath = new Map(args.currentWorktrees.map((worktree) => [worktree.path, worktree]));
  const normalized: DeleteWorktreeTarget[] = [];

  for (const target of args.targets) {
    if (seen.has(target.worktreePath)) {
      return err({ message: `Duplicate delete target: ${target.worktreePath}` });
    }
    seen.add(target.worktreePath);

    const current = currentByPath.get(target.worktreePath);
    if (!current) {
      return err({ message: `Worktree is no longer available: ${target.worktreePath}` });
    }

    if (current.isMain) {
      return err({ message: `Main worktree cannot be deleted: ${target.worktreePath}` });
    }

    normalized.push({ worktreePath: current.path, branch: current.branch });
  }

  return ok(normalized);
}
```

- [ ] **Step 4: Run validation tests and verify they pass**

Run:

```bash
pnpm vitest run test/main/worktreeDelete/validate.test.ts
```

Expected: PASS.

- [ ] **Step 5: Register background delete IPC handlers**

Replace `src/main/ipc/worktreeDelete.ts` with this content:

```ts
import { randomUUID } from "node:crypto";
import { ipcMain, type BrowserWindow } from "electron";
import { ok, err } from "@shared/result";
import type { IpcIn, IpcOut, WorktreeDeleteJobEvent } from "@shared/ipc";
import { removeWorktree } from "../git/removeWorktree";
import { listWorktrees } from "../git/worktrees";
import { listRepos } from "../db/repos";
import { getDb } from "../db";
import { DeleteWorktreeManager } from "../worktreeDelete/manager";
import { validateDeleteTargets } from "../worktreeDelete/validate";

export const deleteWorktreeManager = new DeleteWorktreeManager();

export function registerWorktreeDeleteHandlers(getWindow: () => BrowserWindow | null): void {
  deleteWorktreeManager.onEvent((event) => {
    const win = getWindow();
    if (!win) return;
    const evt: WorktreeDeleteJobEvent = event;
    win.webContents.send("worktreeDelete:event", evt);
  });

  ipcMain.handle(
    "worktree:remove",
    async (_e, args: IpcIn<"worktree:remove">): Promise<IpcOut<"worktree:remove">> => {
      const result = await removeWorktree(args);
      if (!result.ok) return err({ message: result.error.stderr });
      return ok(undefined);
    }
  );

  ipcMain.handle(
    "worktreeDelete:start",
    async (
      _e,
      args: IpcIn<"worktreeDelete:start">
    ): Promise<IpcOut<"worktreeDelete:start">> => {
      const repos = listRepos(getDb());
      const repo = repos.find((row) => row.id === args.repoId);
      if (!repo) return err({ message: "Repository not found" });

      const listed = await listWorktrees(repo.path);
      if (!listed.ok) return err({ message: listed.error.stderr });

      const activeConflict = deleteWorktreeManager.findActiveConflict({
        repoId: repo.id,
        worktreePaths: args.targets.map((target) => target.worktreePath),
      });
      const validated = validateDeleteTargets({
        targets: args.targets,
        currentWorktrees: listed.value,
        activeConflict,
      });
      if (!validated.ok) return err(validated.error);

      const jobId = randomUUID();
      deleteWorktreeManager.enqueue({
        jobId,
        repoId: repo.id,
        repoPath: repo.path,
        targets: validated.value,
      });

      return ok({ jobId });
    }
  );

  ipcMain.handle(
    "worktreeDelete:cancel",
    async (
      _e,
      args: IpcIn<"worktreeDelete:cancel">
    ): Promise<IpcOut<"worktreeDelete:cancel">> => {
      const cancelled = deleteWorktreeManager.cancel(args.jobId);
      if (!cancelled) return err({ message: "Delete job is not running" });
      return ok(undefined);
    }
  );

  ipcMain.handle(
    "worktreeDelete:dismiss",
    async (
      _e,
      args: IpcIn<"worktreeDelete:dismiss">
    ): Promise<IpcOut<"worktreeDelete:dismiss">> => {
      const dismissed = deleteWorktreeManager.dismiss(args.jobId);
      if (!dismissed) return err({ message: "Delete job cannot be dismissed" });
      return ok(undefined);
    }
  );

  ipcMain.handle(
    "worktreeDelete:list",
    async (
      _e,
      args: IpcIn<"worktreeDelete:list">
    ): Promise<IpcOut<"worktreeDelete:list">> => {
      return ok({ jobs: deleteWorktreeManager.list(args.repoId) });
    }
  );
}
```

- [ ] **Step 6: Pass `getWindow` when registering delete handlers**

In `src/main/ipc/index.ts`, change:

```ts
  registerWorktreeDeleteHandlers();
```

to:

```ts
  registerWorktreeDeleteHandlers(getWindow);
```

- [ ] **Step 7: Run focused main tests**

Run:

```bash
pnpm vitest run test/main/worktreeDelete/manager.test.ts test/main/worktreeDelete/validate.test.ts
```

Expected: PASS.

## Task 4: Add Renderer Delete Job Provider

**Files:**

- Create: `src/renderer/state/deleteWorktree.tsx`
- Create: `test/renderer/state/deleteWorktree.test.tsx`

- [ ] **Step 1: Write provider tests**

Create `test/renderer/state/deleteWorktree.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ok } from "@shared/result";
import type { DeleteWorktreeJobEvent, DeleteWorktreeJobSnapshot } from "@shared/deleteWorktree";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type ApiMock = typeof window.api;
type State = {
  jobs: DeleteWorktreeJobSnapshot[];
  cancel: (jobId: string) => Promise<void>;
  dismiss: (jobId: string) => Promise<void>;
};

const refreshRepo = vi.fn();

function makeJob(
  status: DeleteWorktreeJobSnapshot["status"],
  itemStatus: DeleteWorktreeJobSnapshot["items"][number]["status"]
): DeleteWorktreeJobSnapshot {
  return {
    id: "delete-job-1",
    repoId: 1,
    repoPath: "/repo",
    status,
    cancelRequested: false,
    createdAt: 1,
    finishedAt: status === "running" ? null : 2,
    items: [
      {
        worktreePath: "/repo/worktrees/a",
        branch: "feature/a",
        status: itemStatus,
        errorMessage: itemStatus === "failed" ? "remove failed" : null,
        startedAt: itemStatus === "pending" ? null : 1,
        finishedAt: itemStatus === "pending" || itemStatus === "deleting" ? null : 2,
      },
    ],
  };
}

function makeApi(): ApiMock {
  return {
    dialog: { selectDirectory: vi.fn() },
    repo: {
      openDialog: vi.fn(),
      validate: vi.fn(),
      add: vi.fn(),
      list: vi.fn(),
      setActive: vi.fn(),
      close: vi.fn(),
    },
    worktree: {
      list: vi.fn(),
      remove: vi.fn(),
    },
    worktreeDelete: {
      start: vi.fn(),
      cancel: vi.fn().mockResolvedValue(ok(undefined)),
      dismiss: vi.fn().mockResolvedValue(ok(undefined)),
      list: vi.fn().mockResolvedValue(ok({ jobs: [] })),
      onEvent: vi.fn(),
    },
    config: {
      get: vi.fn(),
      saveJira: vi.fn(),
      saveRepository: vi.fn(),
    },
    pty: {
      spawn: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn(),
      onExit: vi.fn(),
    },
    pane: {
      load: vi.fn(),
      save: vi.fn(),
    },
    newWorktree: {
      create: vi.fn(),
      retry: vi.fn(),
      cancel: vi.fn(),
      list: vi.fn().mockResolvedValue(ok({ jobs: [] })),
      onEvent: vi.fn().mockReturnValue(() => {}),
    },
    secrets: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    },
    jira: {
      resolve: vi.fn(),
    },
    recents: {
      list: vi.fn(),
    },
  } satisfies ApiMock;
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mountProvider(api: ApiMock): Promise<{
  hook: { current: State };
  emit: (event: DeleteWorktreeJobEvent) => void;
  unmount: () => void;
}> {
  vi.resetModules();
  refreshRepo.mockClear();
  let eventHandler: ((event: DeleteWorktreeJobEvent) => void) | null = null;
  api.worktreeDelete.onEvent = vi.fn((handler) => {
    eventHandler = handler;
    return () => {
      eventHandler = null;
    };
  });
  window.api = api;

  vi.doMock("@renderer/state/repos", () => ({
    useRepos: () => ({ activeRepoId: 1 }),
  }));
  vi.doMock("@renderer/state/worktrees", () => ({
    useWorktrees: () => ({ refreshRepo }),
  }));

  const { DeleteWorktreeProvider, useDeleteWorktreeJobs } = await import(
    "@renderer/state/deleteWorktree"
  );
  const hook = { current: undefined as unknown as State };

  function HookHost(): null {
    hook.current = useDeleteWorktreeJobs();
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(createElement(DeleteWorktreeProvider, null, createElement(HookHost)));
  });
  await flush();

  return {
    hook,
    emit: (event) => {
      if (!eventHandler) throw new Error("event handler was not registered");
      act(() => eventHandler?.(event));
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("DeleteWorktreeProvider", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
    cleanup = null;
  });

  afterEach(() => {
    cleanup?.();
    vi.useRealTimers();
    vi.doUnmock("@renderer/state/repos");
    vi.doUnmock("@renderer/state/worktrees");
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("loads current jobs for the active repo", async () => {
    const api = makeApi();
    const running = makeJob("running", "deleting");
    api.worktreeDelete.list = vi.fn().mockResolvedValue(ok({ jobs: [running] }));
    const mounted = await mountProvider(api);
    cleanup = mounted.unmount;

    expect(api.worktreeDelete.list).toHaveBeenCalledWith({ repoId: 1 });
    expect(mounted.hook.current.jobs).toEqual([running]);
  });

  it("merges events and refreshes the repo when an item newly becomes deleted", async () => {
    const api = makeApi();
    const mounted = await mountProvider(api);
    cleanup = mounted.unmount;

    mounted.emit({ kind: "created", job: makeJob("running", "deleting") });
    expect(refreshRepo).not.toHaveBeenCalled();

    mounted.emit({ kind: "updated", job: makeJob("running", "deleted") });
    expect(refreshRepo).toHaveBeenCalledWith(1);
    expect(mounted.hook.current.jobs[0]?.items[0]?.status).toBe("deleted");

    mounted.emit({ kind: "updated", job: makeJob("running", "deleted") });
    expect(refreshRepo).toHaveBeenCalledTimes(1);
  });

  it("removes dismissed jobs", async () => {
    const api = makeApi();
    const mounted = await mountProvider(api);
    cleanup = mounted.unmount;

    mounted.emit({ kind: "created", job: makeJob("running", "deleting") });
    expect(mounted.hook.current.jobs).toHaveLength(1);
    mounted.emit({ kind: "dismissed", jobId: "delete-job-1" });
    expect(mounted.hook.current.jobs).toHaveLength(0);
  });

  it("auto-dismisses successful completed jobs after a short delay", async () => {
    vi.useFakeTimers();
    const api = makeApi();
    const mounted = await mountProvider(api);
    cleanup = mounted.unmount;

    mounted.emit({ kind: "completed", job: makeJob("done", "deleted") });
    expect(mounted.hook.current.jobs).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(api.worktreeDelete.dismiss).toHaveBeenCalledWith({ jobId: "delete-job-1" });
    expect(mounted.hook.current.jobs).toHaveLength(0);
  });

  it("keeps failed jobs visible until dismissed", async () => {
    vi.useFakeTimers();
    const api = makeApi();
    const mounted = await mountProvider(api);
    cleanup = mounted.unmount;

    mounted.emit({ kind: "completed", job: makeJob("failed", "failed") });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(api.worktreeDelete.dismiss).not.toHaveBeenCalled();
    expect(mounted.hook.current.jobs).toHaveLength(1);
  });

  it("exposes cancel and dismiss actions", async () => {
    const api = makeApi();
    const mounted = await mountProvider(api);
    cleanup = mounted.unmount;

    await act(async () => {
      await mounted.hook.current.cancel("delete-job-1");
      await mounted.hook.current.dismiss("delete-job-1");
    });

    expect(api.worktreeDelete.cancel).toHaveBeenCalledWith({ jobId: "delete-job-1" });
    expect(api.worktreeDelete.dismiss).toHaveBeenCalledWith({ jobId: "delete-job-1" });
  });
});
```

- [ ] **Step 2: Run provider tests and verify they fail**

Run:

```bash
pnpm vitest run test/renderer/state/deleteWorktree.test.tsx
```

Expected: FAIL with a module resolution error for `@renderer/state/deleteWorktree`.

- [ ] **Step 3: Implement the provider**

Create `src/renderer/state/deleteWorktree.tsx`:

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { DeleteWorktreeJobEvent, DeleteWorktreeJobSnapshot } from "@shared/deleteWorktree";
import { api } from "../ipc/api";
import { useRepos } from "./repos";
import { useWorktrees } from "./worktrees";

type State = {
  jobs: DeleteWorktreeJobSnapshot[];
  cancel: (jobId: string) => Promise<void>;
  dismiss: (jobId: string) => Promise<void>;
};

const Ctx = createContext<State | null>(null);

function upsertJob(
  jobs: DeleteWorktreeJobSnapshot[],
  job: DeleteWorktreeJobSnapshot
): DeleteWorktreeJobSnapshot[] {
  const index = jobs.findIndex((current) => current.id === job.id);
  if (index < 0) return [...jobs, job];
  const next = [...jobs];
  next[index] = job;
  return next;
}

function hasNewDeletedItem(
  previous: DeleteWorktreeJobSnapshot | undefined,
  next: DeleteWorktreeJobSnapshot
): boolean {
  if (!previous) return next.items.some((item) => item.status === "deleted");
  const previousStatus = new Map(
    previous.items.map((item) => [item.worktreePath, item.status])
  );
  return next.items.some(
    (item) => item.status === "deleted" && previousStatus.get(item.worktreePath) !== "deleted"
  );
}

export function DeleteWorktreeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { activeRepoId } = useRepos();
  const { refreshRepo } = useWorktrees();
  const [jobs, setJobs] = useState<DeleteWorktreeJobSnapshot[]>([]);
  const jobsRef = useRef<DeleteWorktreeJobSnapshot[]>([]);
  const dismissTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const setJobsAndRef = useCallback((next: DeleteWorktreeJobSnapshot[]) => {
    jobsRef.current = next;
    setJobs(next);
  }, []);

  const removeJob = useCallback(
    (jobId: string) => {
      setJobsAndRef(jobsRef.current.filter((job) => job.id !== jobId));
      const timer = dismissTimersRef.current.get(jobId);
      if (timer) clearTimeout(timer);
      dismissTimersRef.current.delete(jobId);
    },
    [setJobsAndRef]
  );

  const dismiss = useCallback(
    async (jobId: string): Promise<void> => {
      const result = await api.worktreeDelete.dismiss({ jobId });
      if (result.ok) removeJob(jobId);
    },
    [removeJob]
  );

  const scheduleAutoDismiss = useCallback(
    (job: DeleteWorktreeJobSnapshot) => {
      if (job.status !== "done") return;
      if (dismissTimersRef.current.has(job.id)) return;
      const timer = setTimeout(() => {
        dismissTimersRef.current.delete(job.id);
        void dismiss(job.id);
      }, 3000);
      dismissTimersRef.current.set(job.id, timer);
    },
    [dismiss]
  );

  const applyJob = useCallback(
    (job: DeleteWorktreeJobSnapshot) => {
      const previous = jobsRef.current.find((current) => current.id === job.id);
      if (hasNewDeletedItem(previous, job)) void refreshRepo(job.repoId);
      const next = upsertJob(jobsRef.current, job);
      setJobsAndRef(next);
      scheduleAutoDismiss(job);
    },
    [refreshRepo, scheduleAutoDismiss, setJobsAndRef]
  );

  const cancel = useCallback(async (jobId: string): Promise<void> => {
    await api.worktreeDelete.cancel({ jobId });
  }, []);

  useEffect(() => {
    if (activeRepoId == null) {
      setJobsAndRef([]);
      return;
    }

    void (async () => {
      const result = await api.worktreeDelete.list({ repoId: activeRepoId });
      if (!result.ok) return;
      setJobsAndRef(result.value.jobs);
      for (const job of result.value.jobs) scheduleAutoDismiss(job);
    })();

    const off = api.worktreeDelete.onEvent((event: DeleteWorktreeJobEvent) => {
      if (event.kind === "dismissed") {
        removeJob(event.jobId);
        return;
      }
      if (event.job.repoId !== activeRepoId) return;
      applyJob(event.job);
    });

    return () => {
      off();
    };
  }, [activeRepoId, applyJob, removeJob, scheduleAutoDismiss, setJobsAndRef]);

  useEffect(() => {
    const timers = dismissTimersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const value = useMemo(() => ({ jobs, cancel, dismiss }), [jobs, cancel, dismiss]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDeleteWorktreeJobs(): State {
  const value = useContext(Ctx);
  if (!value) throw new Error("useDeleteWorktreeJobs must be inside <DeleteWorktreeProvider>");
  return value;
}
```

- [ ] **Step 4: Run provider tests and verify they pass**

Run:

```bash
pnpm vitest run test/renderer/state/deleteWorktree.test.tsx
```

Expected: PASS.

## Task 5: Add The Background Jobs Panel

**Files:**

- Create: `src/renderer/backgroundJobs/BackgroundJobsPanel.tsx`
- Create: `test/renderer/backgroundJobs/BackgroundJobsPanel.test.tsx`

- [ ] **Step 1: Write panel tests**

Create `test/renderer/backgroundJobs/BackgroundJobsPanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { DeleteWorktreeJobSnapshot } from "@shared/deleteWorktree";

function makeJob(status: DeleteWorktreeJobSnapshot["status"]): DeleteWorktreeJobSnapshot {
  return {
    id: "delete-job-1",
    repoId: 1,
    repoPath: "/repo",
    status,
    cancelRequested: status === "cancelled",
    createdAt: 1,
    finishedAt: status === "running" ? null : 2,
    items: [
      {
        worktreePath: "/repo/worktrees/a",
        branch: "feature/a",
        status: "deleted",
        errorMessage: null,
        startedAt: 1,
        finishedAt: 2,
      },
      {
        worktreePath: "/repo/worktrees/b",
        branch: "feature/b",
        status: status === "running" ? "deleting" : "failed",
        errorMessage: status === "running" ? null : "remove failed",
        startedAt: 2,
        finishedAt: status === "running" ? null : 3,
      },
      {
        worktreePath: "/repo/worktrees/c",
        branch: null,
        status: status === "running" ? "pending" : "cancelled",
        errorMessage: null,
        startedAt: null,
        finishedAt: status === "running" ? null : 3,
      },
    ],
  };
}

async function mountPanel(args: {
  jobs: DeleteWorktreeJobSnapshot[];
  cancel?: (jobId: string) => Promise<void>;
  dismiss?: (jobId: string) => Promise<void>;
}): Promise<{ unmount: () => void }> {
  vi.resetModules();
  const cancel = args.cancel ?? vi.fn();
  const dismiss = args.dismiss ?? vi.fn();
  vi.doMock("@renderer/state/deleteWorktree", () => ({
    useDeleteWorktreeJobs: () => ({
      jobs: args.jobs,
      cancel,
      dismiss,
    }),
  }));

  const { BackgroundJobsPanel } = await import("@renderer/backgroundJobs/BackgroundJobsPanel");

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(createElement(BackgroundJobsPanel));
  });

  return {
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

async function clickButton(text: string): Promise<void> {
  const button = [...document.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === text
  );
  if (!button) throw new Error(`button not found: ${text}`);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("BackgroundJobsPanel", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    cleanup = null;
  });

  afterEach(() => {
    cleanup?.();
    vi.doUnmock("@renderer/state/deleteWorktree");
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("renders nothing when there are no jobs", async () => {
    const mounted = await mountPanel({ jobs: [] });
    cleanup = mounted.unmount;

    expect(document.body.textContent).not.toContain("Background Jobs");
  });

  it("renders running delete job progress and cancel action", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const mounted = await mountPanel({ jobs: [makeJob("running")], cancel });
    cleanup = mounted.unmount;

    expect(document.body.textContent).toContain("Background Jobs");
    expect(document.body.textContent).toContain("Deleting worktrees");
    expect(document.body.textContent).toContain("1 / 3 deleted");
    expect(document.body.textContent).toContain("feature/a");
    expect(document.body.textContent).toContain("feature/b");
    expect(document.body.textContent).toContain("(detached)");

    await clickButton("Cancel Pending");
    expect(cancel).toHaveBeenCalledWith("delete-job-1");
  });

  it("renders failed jobs with errors and dismiss action", async () => {
    const dismiss = vi.fn().mockResolvedValue(undefined);
    const mounted = await mountPanel({ jobs: [makeJob("failed")], dismiss });
    cleanup = mounted.unmount;

    expect(document.body.textContent).toContain("1 failed");
    expect(document.body.textContent).toContain("1 cancelled");
    expect(document.body.textContent).toContain("remove failed");

    await clickButton("Dismiss");
    expect(dismiss).toHaveBeenCalledWith("delete-job-1");
  });
});
```

- [ ] **Step 2: Run panel tests and verify they fail**

Run:

```bash
pnpm vitest run test/renderer/backgroundJobs/BackgroundJobsPanel.test.tsx
```

Expected: FAIL with a module resolution error for `@renderer/backgroundJobs/BackgroundJobsPanel`.

- [ ] **Step 3: Implement the panel**

Create `src/renderer/backgroundJobs/BackgroundJobsPanel.tsx`:

```tsx
import { AlertCircle, Check, Circle, Loader2, X } from "lucide-react";
import type {
  DeleteWorktreeItemStatus,
  DeleteWorktreeJobItem,
  DeleteWorktreeJobSnapshot,
} from "@shared/deleteWorktree";
import { Icon, type LucideIcon } from "../icons/Icon";
import { cn } from "../lib/cn";
import { useDeleteWorktreeJobs } from "../state/deleteWorktree";

const ICON_BY_STATUS: Record<DeleteWorktreeItemStatus, LucideIcon> = {
  pending: Circle,
  deleting: Loader2,
  deleted: Check,
  failed: AlertCircle,
  cancelled: X,
};

const ICON_CLASS_BY_STATUS: Record<DeleteWorktreeItemStatus, string> = {
  pending: "text-text-faint",
  deleting: "text-in-progress animate-spin",
  deleted: "text-success",
  failed: "text-destructive",
  cancelled: "text-text-muted",
};

function itemLabel(item: DeleteWorktreeJobItem): string {
  return item.branch ?? "(detached)";
}

function summary(job: DeleteWorktreeJobSnapshot): string {
  const deleted = job.items.filter((item) => item.status === "deleted").length;
  const failed = job.items.filter((item) => item.status === "failed").length;
  const cancelled = job.items.filter((item) => item.status === "cancelled").length;
  const parts = [`${deleted} / ${job.items.length} deleted`];
  if (failed > 0) parts.push(`${failed} failed`);
  if (cancelled > 0) parts.push(`${cancelled} cancelled`);
  return parts.join(" · ");
}

function JobItem({ item }: { item: DeleteWorktreeJobItem }): React.JSX.Element {
  const icon = ICON_BY_STATUS[item.status];
  return (
    <li className="border-border-subtle border-b py-2 last:border-b-0">
      <div className="flex min-w-0 items-start gap-2">
        <span className="mt-0.5 shrink-0">
          <Icon icon={icon} size={14} className={ICON_CLASS_BY_STATUS[item.status]} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-text-secondary truncate text-xs">{itemLabel(item)}</div>
          <div className="text-text-muted truncate text-xs">{item.status}</div>
          {item.errorMessage && (
            <div className="text-destructive mt-1 line-clamp-3 text-xs">{item.errorMessage}</div>
          )}
        </div>
      </div>
    </li>
  );
}

function DeleteJob({ job }: { job: DeleteWorktreeJobSnapshot }): React.JSX.Element {
  const { cancel, dismiss } = useDeleteWorktreeJobs();
  const running = job.status === "running";
  const terminalWithManualDismiss = job.status === "failed" || job.status === "cancelled";

  return (
    <section className="border-border-subtle rounded-md border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-text-primary text-sm font-medium">Deleting worktrees</h3>
          <div className="text-text-muted mt-1 text-xs">{summary(job)}</div>
        </div>
        <span
          className={cn(
            "text-xs",
            job.status === "failed"
              ? "text-destructive"
              : job.status === "running"
                ? "text-in-progress"
                : "text-text-muted"
          )}
        >
          {job.status}
        </span>
      </div>

      <ul className="mt-3 list-none p-0">
        {job.items.map((item) => (
          <JobItem key={item.worktreePath} item={item} />
        ))}
      </ul>

      {running && (
        <button
          className="text-text-secondary hover:bg-elevated mt-3 rounded-sm px-2 py-1 text-xs transition-colors duration-150"
          onClick={() => void cancel(job.id)}
        >
          Cancel Pending
        </button>
      )}
      {terminalWithManualDismiss && (
        <button
          className="text-text-secondary hover:bg-elevated mt-3 rounded-sm px-2 py-1 text-xs transition-colors duration-150"
          onClick={() => void dismiss(job.id)}
        >
          Dismiss
        </button>
      )}
    </section>
  );
}

export function BackgroundJobsPanel(): React.JSX.Element | null {
  const { jobs } = useDeleteWorktreeJobs();
  if (jobs.length === 0) return null;

  return (
    <aside className="border-border-subtle bg-surface flex w-80 shrink-0 flex-col border-l">
      <header className="border-border-subtle border-b p-3">
        <h2 className="text-text-primary text-sm font-medium">Background Jobs</h2>
      </header>
      <div className="scrollbar-hidden flex-1 space-y-3 overflow-y-auto p-3">
        {jobs.map((job) => (
          <DeleteJob key={job.id} job={job} />
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Run panel tests and verify they pass**

Run:

```bash
pnpm vitest run test/renderer/backgroundJobs/BackgroundJobsPanel.test.tsx
```

Expected: PASS.

## Task 6: Convert Confirm Delete Modal To Start Background Jobs

**Files:**

- Modify: `src/renderer/selectMode/ConfirmDeleteModal.tsx`
- Create: `test/renderer/selectMode/ConfirmDeleteModal.test.tsx`

- [ ] **Step 1: Write modal tests**

Create `test/renderer/selectMode/ConfirmDeleteModal.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  createElement,
  useEffect,
  useRef,
  type ComponentType,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import type { RepoRow, Worktree } from "@shared/ipc";
import { ok, err } from "@shared/result";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type ApiMock = typeof window.api;

const repo: RepoRow = {
  id: 1,
  path: "/repo",
  name: "repo",
  lastActiveAt: 1,
};

const selectedWorktree = "/repo/worktrees/delete-me";

const worktrees: Worktree[] = [
  {
    path: "/repo",
    branch: "main",
    head: "abc",
    isMain: true,
  },
  {
    path: selectedWorktree,
    branch: "feature/delete-me",
    head: "def",
    isMain: false,
  },
];

function makeApi(): ApiMock {
  return {
    dialog: { selectDirectory: vi.fn() },
    repo: {
      openDialog: vi.fn(),
      validate: vi.fn(),
      add: vi.fn(),
      list: vi.fn().mockResolvedValue(ok({ repos: [repo], activeRepoId: repo.id })),
      setActive: vi.fn(),
      close: vi.fn(),
    },
    worktree: {
      list: vi.fn().mockResolvedValue(ok({ worktrees })),
      remove: vi.fn(),
    },
    worktreeDelete: {
      start: vi.fn().mockResolvedValue(ok({ jobId: "delete-job-1" })),
      cancel: vi.fn(),
      dismiss: vi.fn(),
      list: vi.fn().mockResolvedValue(ok({ jobs: [] })),
      onEvent: vi.fn().mockReturnValue(() => {}),
    },
    config: {
      get: vi.fn(),
      saveJira: vi.fn(),
      saveRepository: vi.fn(),
    },
    pty: {
      spawn: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn(),
      onExit: vi.fn(),
    },
    pane: {
      load: vi.fn(),
      save: vi.fn(),
    },
    newWorktree: {
      create: vi.fn(),
      retry: vi.fn(),
      cancel: vi.fn(),
      list: vi.fn().mockResolvedValue(ok({ jobs: [] })),
      onEvent: vi.fn().mockReturnValue(() => {}),
    },
    secrets: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    },
    jira: {
      resolve: vi.fn(),
    },
    recents: {
      list: vi.fn(),
    },
  } satisfies ApiMock;
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function clickButton(text: string): Promise<void> {
  const button = [...document.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === text
  );
  if (!button) throw new Error(`button not found: ${text}`);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function mountModal(args: {
  api: ApiMock;
  selectedIds: string[];
  onClose?: () => void;
}): Promise<{ unmount: () => void }> {
  vi.resetModules();
  window.api = args.api;

  const [
    { TooltipProvider },
    { ToastProvider },
    { ReposProvider },
    { WorktreesProvider },
    { SelectModeProvider, useSelectMode },
    { ConfirmDeleteModal },
    { ToastLayer },
  ] = await Promise.all([
    import("@renderer/ui"),
    import("@renderer/state/toast"),
    import("@renderer/state/repos"),
    import("@renderer/state/worktrees"),
    import("@renderer/state/selectMode"),
    import("@renderer/selectMode/ConfirmDeleteModal"),
    import("@renderer/toast/Toast"),
  ]);

  function SelectionSeed(): null {
    const sm = useSelectMode();
    const seededRef = useRef(false);
    useEffect(() => {
      if (seededRef.current) return;
      seededRef.current = true;
      sm.enter();
      sm.selectAll(args.selectedIds);
    }, [sm]);
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(
      createElement(
        TooltipProvider as ComponentType<{ children: ReactNode }>,
        null,
        createElement(
          ToastProvider as ComponentType<{ children: ReactNode }>,
          null,
          createElement(ToastLayer),
          createElement(
            ReposProvider as ComponentType<{ children: ReactNode }>,
            null,
            createElement(
              WorktreesProvider as ComponentType<{ children: ReactNode }>,
              null,
              createElement(
                SelectModeProvider as ComponentType<{ children: ReactNode }>,
                null,
                createElement(SelectionSeed),
                createElement(ConfirmDeleteModal, {
                  open: true,
                  onClose: args.onClose ?? vi.fn(),
                })
              )
            )
          )
        )
      )
    );
  });
  await flush();

  return {
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("ConfirmDeleteModal background delete start", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    cleanup = null;
  });

  afterEach(() => {
    cleanup?.();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("starts a delete job and closes immediately on success", async () => {
    const api = makeApi();
    const onClose = vi.fn();
    const mounted = await mountModal({ api, selectedIds: [selectedWorktree], onClose });
    cleanup = mounted.unmount;

    await clickButton("Force Delete");
    await flush();

    expect(api.worktreeDelete.start).toHaveBeenCalledWith({
      repoId: 1,
      targets: [{ worktreePath: selectedWorktree, branch: "feature/delete-me" }],
    });
    expect(api.worktree.remove).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps the modal open and shows a toast when job start fails", async () => {
    const api = makeApi();
    api.worktreeDelete.start = vi.fn().mockResolvedValue(err({ message: "Cannot start delete" }));
    const onClose = vi.fn();
    const mounted = await mountModal({ api, selectedIds: [selectedWorktree], onClose });
    cleanup = mounted.unmount;

    await clickButton("Force Delete");
    await flush();

    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Cannot start delete");
  });

  it("disables confirm when no selected non-main targets exist", async () => {
    const api = makeApi();
    const mounted = await mountModal({ api, selectedIds: [] });
    cleanup = mounted.unmount;

    const button = [...document.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.trim() === "Force Delete"
    ) as HTMLButtonElement | undefined;

    expect(button?.disabled).toBe(true);
    expect(api.worktreeDelete.start).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run modal tests and verify they fail against current behavior**

Run:

```bash
pnpm vitest run test/renderer/selectMode/ConfirmDeleteModal.test.tsx
```

Expected: FAIL because the modal still calls `worktree.remove` and awaits deletion.

- [ ] **Step 3: Update the modal implementation**

In `src/renderer/selectMode/ConfirmDeleteModal.tsx`:

- Rename `deleting` state to `starting`.
- Remove the local sequential delete loop.
- Start a background delete job with `api.worktreeDelete.start`.
- Close immediately and call `sm.exit()` on successful start.
- Keep the modal open and toast the start error on failure.

Use this `confirm()` body:

```ts
  async function confirm(): Promise<void> {
    if (targets.length === 0) return;
    if (starting) return;
    if (!repo) return;

    setStarting(true);
    try {
      const result = await api.worktreeDelete.start({
        repoId: repo.id,
        targets: targets.map((target) => ({
          worktreePath: target.path,
          branch: target.branch,
        })),
      });
      if (!result.ok) {
        toast.push({
          kind: "error",
          title: "Failed to start delete job",
          description: result.error.message,
          durationMs: 5000,
        });
        return;
      }

      sm.exit();
      onClose();
      toast.push({
        kind: "progress",
        title: `Deleting ${targets.length} worktree(s)`,
        description: "Progress is shown in Background Jobs.",
        durationMs: 3000,
      });
    } catch (error) {
      toast.push({
        kind: "error",
        title: "Failed to start delete job",
        description: error instanceof Error ? error.message : "Unexpected delete start failure",
        durationMs: 5000,
      });
    } finally {
      setStarting(false);
    }
  }
```

Update the dialog root and buttons:

```tsx
    <Dialog.Root open={open} onOpenChange={(openNext) => !openNext && !starting && onClose()}>
```

```tsx
          <button
            disabled={starting}
            className="text-text-secondary hover:bg-elevated rounded-sm px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            disabled={targets.length === 0 || starting}
            aria-busy={starting}
            className="bg-destructive text-background rounded-sm px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => void confirm()}
          >
            {starting ? "Starting..." : "Force Delete"}
          </button>
```

Remove the now-unused `refresh` destructuring from `useWorktrees()`.

- [ ] **Step 4: Run modal tests and verify they pass**

Run:

```bash
pnpm vitest run test/renderer/selectMode/ConfirmDeleteModal.test.tsx
```

Expected: PASS.

## Task 7: Integrate Provider And Panel In The App Shell

**Files:**

- Modify: `src/renderer/App.tsx`
- Modify: `test/renderer/chrome/Toolbar.test.tsx`
- Modify: `test/renderer/chrome/Rail.test.tsx`
- Modify: `test/renderer/card/Card.test.tsx`
- Modify: `test/renderer/settings/Settings.test.tsx`
- Modify: `test/renderer/newWorktree/NewWorktreeModal.test.ts`

- [ ] **Step 1: Wire the provider and panel**

In `src/renderer/App.tsx`, add imports:

```ts
import { DeleteWorktreeProvider } from "./state/deleteWorktree";
import { BackgroundJobsPanel } from "./backgroundJobs/BackgroundJobsPanel";
```

Change the main content row from:

```tsx
      <div className="flex min-h-0 flex-1">
        <Rail />
        <main className="bg-background scrollbar-hidden flex-1 overflow-auto">
          {!activeRepoId ? <NoRepo /> : mode === "overview" ? <Grid /> : <Focus />}
        </main>
      </div>
```

to:

```tsx
      <div className="flex min-h-0 flex-1">
        <Rail />
        <main className="bg-background scrollbar-hidden min-w-0 flex-1 overflow-auto">
          {!activeRepoId ? <NoRepo /> : mode === "overview" ? <Grid /> : <Focus />}
        </main>
        <BackgroundJobsPanel />
      </div>
```

Wrap the existing provider tree so `DeleteWorktreeProvider` is inside `WorktreesProvider` and outside `Shell`:

```tsx
          <WorktreesProvider>
            <DeleteWorktreeProvider>
              <TerminalSessionsProvider>
                <NewWorktreeProvider>
                  <SelectModeProvider>
                    <ModeProvider>
                      <Shell />
                    </ModeProvider>
                  </SelectModeProvider>
                </NewWorktreeProvider>
              </TerminalSessionsProvider>
            </DeleteWorktreeProvider>
          </WorktreesProvider>
```

- [ ] **Step 2: Ensure all existing API mocks compile**

Run:

```bash
pnpm typecheck
```

Expected: TypeScript may report remaining `ApiMock` objects missing `worktreeDelete`. Add the exact mock object from Task 1 Step 5 to each reported test mock.

- [ ] **Step 3: Run existing renderer smoke tests**

Run:

```bash
pnpm vitest run test/renderer/chrome/Toolbar.test.tsx test/renderer/chrome/Rail.test.tsx test/renderer/card/Card.test.tsx
```

Expected: PASS.

## Task 8: Verify Terminal Session Cleanup On Deleted Worktrees

**Files:**

- Inspect: `src/renderer/state/terminalSessions.tsx`
- No source edit expected unless the focused test reveals a cleanup gap

- [ ] **Step 1: Confirm existing cleanup path in code**

Read the worktree diff effect in `src/renderer/state/terminalSessions.tsx`. It already computes current worktree keys from `worktreesByRepo` and calls `disposeWorktree(repoId, worktreePath)` for keys that disappear.

The expected path after a delete item becomes `deleted` is:

```text
DeleteWorktreeProvider receives item deleted event
-> refreshRepo(repoId)
-> WorktreesProvider removes that worktree from worktreesByRepo
-> TerminalSessionsProvider worktreesByRepo diff sees the missing key
-> disposeWorktree(repoId, deletedPath)
```

- [ ] **Step 2: Run terminal/card tests that exercise provider assumptions**

Run:

```bash
pnpm vitest run test/renderer/card/Card.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Keep terminal cleanup out of this implementation**

Do not add a new terminal cleanup test in this task. The current provider already has the cleanup path, and this feature triggers it by refreshing the repo. If manual verification later proves that a PTY remains alive after the deleted worktree disappears from `worktreesByRepo`, stop this plan and write a separate bugfix plan for terminal cleanup.

## Task 9: Final Verification

**Files:**

- No source edits expected

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm vitest run test/main/worktreeDelete/manager.test.ts test/main/worktreeDelete/validate.test.ts test/renderer/state/deleteWorktree.test.tsx test/renderer/backgroundJobs/BackgroundJobsPanel.test.tsx test/renderer/selectMode/ConfirmDeleteModal.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run broader impacted renderer tests**

Run:

```bash
pnpm vitest run test/renderer/chrome/Toolbar.test.tsx test/renderer/chrome/Rail.test.tsx test/renderer/card/Card.test.tsx test/renderer/settings/Settings.test.tsx test/renderer/newWorktree/NewWorktreeModal.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Run lint**

Run:

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 5: Launch the app for manual verification**

Run:

```bash
pnpm dev
```

Expected: Electron dev app starts without build errors.

- [ ] **Step 6: Verify runtime behavior with playwright-electron**

Use `playwright-electron` to verify:

- Select multiple non-main worktrees.
- Click `Force Delete`.
- The confirmation modal closes immediately after `Force Delete`.
- The app remains interactive while deletion continues.
- The right-side `Background Jobs` panel appears.
- Each selected worktree shows a per-item status.
- Deleted worktrees disappear from Rail/Grid as they complete.
- `Cancel Pending` leaves the current deleting item to finish and marks pending items cancelled.
- Failed items stay visible with their error message and do not block later deletes.
- Successful jobs disappear after the auto-dismiss delay.
- Failed or cancelled jobs remain until `Dismiss`.

## Self-Review

- Spec coverage: The plan covers shared contracts, main job ownership, request validation, sequential delete processing, continue-on-failure behavior, cancel-pending behavior, renderer event state, repo refresh on item deletion, right-side Background Jobs panel, modal immediate close, test coverage, and manual runtime verification.
- Red flag scan: The plan avoids unresolved markers, unspecified edge handling, and vague test instructions. Commands and expected outcomes are explicit.
- Type consistency: The plan consistently uses `DeleteWorktreeJobSnapshot`, `DeleteWorktreeJobEvent`, `DeleteWorktreeTarget`, `worktreeDelete:*` IPC names, item status `cancelled`, and job status `cancelled`.
- Repository rule check: The plan intentionally omits branch and commit steps because this repository forbids branch or commit creation without an explicit user request.
