import { describe, it, expect, vi } from "vitest";
import { DeleteWorktreeManager, type RemoveWorktreeFn } from "@main/worktreeDelete/manager";
import type { DeleteWorktreeJobEvent } from "@shared/deleteWorktree";
import { err, ok } from "@shared/result";

type TestTarget = { worktreePath: string; branch: string };

function target(worktreePath: string, branch = worktreePath.slice(1)): TestTarget {
  return { worktreePath, branch };
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

function enqueue(
  manager: DeleteWorktreeManager,
  targets: TestTarget[],
  overrides: Partial<Parameters<DeleteWorktreeManager["enqueue"]>[0]> = {}
): string {
  return manager.enqueue({
    jobId: "delete-job",
    repoId: 1,
    repoPath: "/repo",
    targets,
    ...overrides,
  });
}

describe("DeleteWorktreeManager", () => {
  it("successful sequential deletion completes with done", async () => {
    const calls: string[] = [];
    const remover: RemoveWorktreeFn = vi.fn(async ({ worktreePath }) => {
      calls.push(worktreePath);
      return ok(undefined);
    });
    const manager = new DeleteWorktreeManager(remover);
    const events: DeleteWorktreeJobEvent[] = [];
    manager.onEvent((event) => events.push(event));

    const jobId = enqueue(manager, [target("/wt-a"), target("/wt-b"), target("/wt-c")]);

    await manager.waitFor(jobId);

    const snapshot = manager.snapshot(jobId);
    expect(snapshot?.status).toBe("done");
    expect(snapshot?.items.map((item) => item.status)).toEqual(["deleted", "deleted", "deleted"]);
    expect(calls).toEqual(["/wt-a", "/wt-b", "/wt-c"]);

    const firstEvent = events[0];
    const lastEvent = events.at(-1);
    expect(firstEvent?.kind).toBe("created");
    expect(lastEvent?.kind).toBe("completed");
    if (firstEvent?.kind !== "created" || lastEvent?.kind !== "completed") {
      throw new Error("Expected created and completed delete job events");
    }
    expect(firstEvent.job.items.map((item) => item.status)).toEqual([
      "pending",
      "pending",
      "pending",
    ]);
    expect(lastEvent.job.status).toBe("done");

    firstEvent.job.items[0]!.status = "failed";
    expect(manager.snapshot(jobId)?.items[0]?.status).toBe("deleted");
  });

  it("one item failure marks only that item failed and continues later items", async () => {
    const calls: string[] = [];
    const remover: RemoveWorktreeFn = vi.fn(async ({ worktreePath }) => {
      calls.push(worktreePath);
      if (worktreePath === "/wt-b") return err({ stderr: "remove failed" });
      return ok(undefined);
    });
    const manager = new DeleteWorktreeManager(remover);

    const jobId = enqueue(manager, [target("/wt-a"), target("/wt-b"), target("/wt-c")]);

    await manager.waitFor(jobId);

    const snapshot = manager.snapshot(jobId);
    expect(snapshot?.status).toBe("failed");
    expect(snapshot?.items.map((item) => item.status)).toEqual(["deleted", "failed", "deleted"]);
    expect(snapshot?.items[1]?.errorMessage).toBe("remove failed");
    expect(calls).toEqual(["/wt-a", "/wt-b", "/wt-c"]);
  });

  it("thrown remover errors turn into failed items and processing continues", async () => {
    const calls: string[] = [];
    const remover: RemoveWorktreeFn = vi.fn(async ({ worktreePath }) => {
      calls.push(worktreePath);
      if (worktreePath === "/wt-b") throw new Error("boom");
      return ok(undefined);
    });
    const manager = new DeleteWorktreeManager(remover);

    const jobId = enqueue(manager, [target("/wt-a"), target("/wt-b"), target("/wt-c")]);

    await manager.waitFor(jobId);

    const snapshot = manager.snapshot(jobId);
    expect(snapshot?.status).toBe("failed");
    expect(snapshot?.items.map((item) => item.status)).toEqual(["deleted", "failed", "deleted"]);
    expect(snapshot?.items[1]?.errorMessage).toBe("boom");
    expect(calls).toEqual(["/wt-a", "/wt-b", "/wt-c"]);
  });

  it("cancel request lets current deleting item finish and marks remaining pending as cancelled", async () => {
    const firstRemoval = deferred<Awaited<ReturnType<RemoveWorktreeFn>>>();
    const remover: RemoveWorktreeFn = vi.fn(async ({ worktreePath }) => {
      if (worktreePath === "/wt-a") return firstRemoval.promise;
      return ok(undefined);
    });
    const manager = new DeleteWorktreeManager(remover);

    const jobId = enqueue(manager, [target("/wt-a"), target("/wt-b"), target("/wt-c")]);
    await manager.waitForStatus(jobId, "deleting");

    expect(manager.cancel("missing-job")).toBe(false);
    expect(manager.cancel(jobId)).toBe(true);
    expect(manager.cancel(jobId)).toBe(false);
    expect(manager.snapshot(jobId)?.cancelRequested).toBe(true);
    firstRemoval.resolve(ok(undefined));
    await manager.waitFor(jobId);

    const snapshot = manager.snapshot(jobId);
    expect(snapshot?.status).toBe("cancelled");
    expect(snapshot?.items.map((item) => item.status)).toEqual([
      "deleted",
      "cancelled",
      "cancelled",
    ]);
    expect(remover).toHaveBeenCalledTimes(1);
  });

  it("final status is failed when cancellation and item failure both happen", async () => {
    const firstRemoval = deferred<Awaited<ReturnType<RemoveWorktreeFn>>>();
    const remover: RemoveWorktreeFn = vi.fn(async () => firstRemoval.promise);
    const manager = new DeleteWorktreeManager(remover);

    const jobId = enqueue(manager, [target("/wt-a"), target("/wt-b")]);
    await manager.waitForStatus(jobId, "deleting");

    expect(manager.cancel(jobId)).toBe(true);
    firstRemoval.resolve(err({ stderr: "remove failed during cancel" }));
    await manager.waitFor(jobId);

    const snapshot = manager.snapshot(jobId);
    expect(snapshot?.status).toBe("failed");
    expect(snapshot?.items.map((item) => item.status)).toEqual(["failed", "cancelled"]);
    expect(snapshot?.items[0]?.errorMessage).toBe("remove failed during cancel");
    expect(manager.cancel(jobId)).toBe(false);
  });

  it("dismisses terminal jobs and emits dismissed", async () => {
    const manager = new DeleteWorktreeManager(async () => ok(undefined));
    const events: DeleteWorktreeJobEvent[] = [];
    manager.onEvent((event) => events.push(event));

    expect(manager.dismiss("missing-job")).toBe(false);
    const jobId = enqueue(manager, [target("/wt-a")]);
    await manager.waitFor(jobId);
    expect(manager.dismiss(jobId)).toBe(true);

    expect(manager.snapshot(jobId)).toBeNull();
    expect(events).toContainEqual({ kind: "dismissed", jobId });
    expect(manager.dismiss(jobId)).toBe(false);
  });

  it("continues processing when an event listener throws", async () => {
    const manager = new DeleteWorktreeManager(async () => ok(undefined));
    const events: DeleteWorktreeJobEvent[] = [];
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    manager.onEvent(() => {
      throw new Error("listener failed");
    });
    manager.onEvent((event) => events.push(event));

    try {
      const jobId = enqueue(manager, [target("/wt-a")]);
      await manager.waitFor(jobId);

      expect(manager.snapshot(jobId)?.status).toBe("done");
      expect(events.at(-1)?.kind).toBe("completed");
    } finally {
      consoleError.mockRestore();
    }
  });

  it("does not dismiss running jobs", async () => {
    const firstRemoval = deferred<Awaited<ReturnType<RemoveWorktreeFn>>>();
    const manager = new DeleteWorktreeManager(async () => firstRemoval.promise);
    const events: DeleteWorktreeJobEvent[] = [];
    manager.onEvent((event) => events.push(event));

    const jobId = enqueue(manager, [target("/wt-a")]);
    await manager.waitForStatus(jobId, "deleting");
    expect(manager.dismiss(jobId)).toBe(false);

    expect(manager.snapshot(jobId)).not.toBeNull();
    expect(events.some((event) => event.kind === "dismissed")).toBe(false);

    firstRemoval.resolve(ok(undefined));
    await manager.waitFor(jobId);
  });

  it("active conflict detection only catches paths in running delete jobs for the same repo", async () => {
    const firstRemoval = deferred<Awaited<ReturnType<RemoveWorktreeFn>>>();
    const manager = new DeleteWorktreeManager(async () => firstRemoval.promise);

    const jobId = enqueue(manager, [target("/wt-a"), target("/wt-b")], {
      jobId: "running-delete",
      repoId: 1,
    });
    await manager.waitForStatus(jobId, "deleting");

    expect(manager.findActiveConflict({ repoId: 1, worktreePaths: ["/wt-b"] })).toEqual({
      existingPath: "/wt-b",
    });
    expect(manager.findActiveConflict({ repoId: 1, worktreePaths: ["/wt-c"] })).toBeNull();
    expect(manager.findActiveConflict({ repoId: 2, worktreePaths: ["/wt-a"] })).toBeNull();

    firstRemoval.resolve(ok(undefined));
    await manager.waitFor(jobId);
    expect(manager.findActiveConflict({ repoId: 1, worktreePaths: ["/wt-a"] })).toBeNull();
  });

  it("does not report a terminal job as active during completed event callbacks", async () => {
    const manager = new DeleteWorktreeManager(async () => ok(undefined));
    const conflicts: Array<{ existingPath: string } | null> = [];
    manager.onEvent((event) => {
      if (event.kind !== "completed") return;
      conflicts.push(manager.findActiveConflict({ repoId: 1, worktreePaths: ["/wt-a"] }));
    });

    const jobId = enqueue(manager, [target("/wt-a")]);
    await manager.waitFor(jobId);

    expect(conflicts).toEqual([null]);
  });

  it("lists only jobs for the requested repo and returns clones", async () => {
    const manager = new DeleteWorktreeManager(async () => ok(undefined));
    const repoOneJob = enqueue(manager, [target("/wt-a")], {
      jobId: "repo-one-delete",
      repoId: 1,
    });
    enqueue(manager, [target("/wt-b")], {
      jobId: "repo-two-delete",
      repoId: 2,
    });
    await Promise.all([manager.waitFor("repo-one-delete"), manager.waitFor("repo-two-delete")]);

    const repoOneJobs = manager.list(1);

    expect(repoOneJobs.map((job) => job.id)).toEqual([repoOneJob]);
    repoOneJobs[0]!.items[0]!.status = "failed";
    expect(manager.snapshot(repoOneJob)?.items[0]?.status).toBe("deleted");
  });
});
