// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {} from "@renderer/ipc/api";
import type { DeleteWorktreeJobEvent, DeleteWorktreeJobSnapshot } from "@shared/deleteWorktree";
import { ok } from "@shared/result";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type ApiMock = typeof window.api;
type DeleteWorktreeState = {
  jobs: DeleteWorktreeJobSnapshot[];
  cancel: (jobId: string) => Promise<void>;
  dismiss: (jobId: string) => Promise<void>;
};
type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};
type MountOptions = {
  initialJobs?: DeleteWorktreeJobSnapshot[];
  activeRepoId?: { current: number | null };
  list?: ApiMock["worktreeDelete"]["list"];
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function item(
  worktreePath: string,
  status: DeleteWorktreeJobSnapshot["items"][number]["status"]
): DeleteWorktreeJobSnapshot["items"][number] {
  return {
    worktreePath,
    branch: "feature/test",
    status,
    errorMessage: status === "failed" ? "remove failed" : null,
    startedAt: status === "pending" ? null : 10,
    finishedAt:
      status === "deleted" || status === "failed" || status === "cancelled" ? 20 : null,
  };
}

function job(
  id: string,
  overrides: Partial<DeleteWorktreeJobSnapshot> = {}
): DeleteWorktreeJobSnapshot {
  const status = overrides.status ?? "running";
  return {
    id,
    repoId: 1,
    repoPath: "/repo",
    status,
    items: [item(`/repo/${id}`, "pending")],
    cancelRequested: false,
    createdAt: 1,
    finishedAt: status === "running" ? null : 30,
    ...overrides,
  };
}

function makeApi(events: {
  handler: ((event: DeleteWorktreeJobEvent) => void) | null;
  unsubscribes: ReturnType<typeof vi.fn>[];
}): ApiMock {
  return {
    dialog: {
      selectDirectory: vi.fn(),
    },
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
    update: {
      getState: vi.fn(),
      check: vi.fn(),
      download: vi.fn(),
      openDownloaded: vi.fn(),
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
      onData: vi.fn().mockReturnValue(() => {}),
      onExit: vi.fn().mockReturnValue(() => {}),
    },
    pane: {
      load: vi.fn(),
      save: vi.fn(),
    },
    overviewGridDensity: {
      get: vi.fn(),
      set: vi.fn(),
    },
    newWorktree: {
      create: vi.fn(),
      retry: vi.fn(),
      cancel: vi.fn(),
      list: vi.fn(),
      onEvent: vi.fn().mockReturnValue(() => {}),
    },
    worktreeDelete: {
      start: vi.fn(),
      cancel: vi.fn().mockResolvedValue(ok(undefined)),
      dismiss: vi.fn().mockResolvedValue(ok(undefined)),
      list: vi.fn().mockResolvedValue(ok({ jobs: [] })),
      onEvent: vi.fn((handler: (event: DeleteWorktreeJobEvent) => void) => {
        events.handler = handler;
        const unsubscribe = vi.fn(() => {
          if (events.handler === handler) {
            events.handler = null;
          }
        });
        events.unsubscribes.push(unsubscribe);
        return unsubscribe;
      }),
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

async function mountProvider(options: MountOptions = {}): Promise<{
  api: ApiMock;
  emit: (event: DeleteWorktreeJobEvent) => Promise<void>;
  latest: () => DeleteWorktreeState;
  refreshRepo: ReturnType<typeof vi.fn>;
  rerender: () => Promise<void>;
  unsubscribes: ReturnType<typeof vi.fn>[];
  unmount: () => void;
}> {
  vi.resetModules();

  const events: {
    handler: ((event: DeleteWorktreeJobEvent) => void) | null;
    unsubscribes: ReturnType<typeof vi.fn>[];
  } = { handler: null, unsubscribes: [] };
  const api = makeApi(events);
  if (options.list) {
    vi.mocked(api.worktreeDelete.list).mockImplementation(options.list);
  } else {
    vi.mocked(api.worktreeDelete.list).mockResolvedValue(ok({ jobs: options.initialJobs ?? [] }));
  }
  const refreshRepo = vi.fn().mockResolvedValue(undefined);
  let state: DeleteWorktreeState | null = null;
  const activeRepoId = options.activeRepoId ?? { current: 1 };

  window.api = api;
  vi.doMock("@renderer/state/repos", () => ({
    useRepos: () => ({ activeRepoId: activeRepoId.current }),
  }));
  vi.doMock("@renderer/state/worktrees", () => ({
    useWorktrees: () => ({ refreshRepo }),
  }));

  const { DeleteWorktreeProvider, useDeleteWorktreeJobs } = await import(
    "@renderer/state/deleteWorktree"
  );

  function Probe(): null {
    state = useDeleteWorktreeJobs();
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  const render = async (): Promise<void> => {
    await act(async () => {
      root.render(createElement(DeleteWorktreeProvider, null, createElement(Probe, null)));
    });
    await flush();
  };

  await render();

  return {
    api,
    emit: async (event: DeleteWorktreeJobEvent) => {
      if (!events.handler) throw new Error("delete event handler was not registered");
      await act(async () => {
        events.handler?.(event);
      });
      await flush();
    },
    latest: () => {
      if (!state) throw new Error("provider state was not captured");
      return state;
    },
    refreshRepo,
    rerender: render,
    unsubscribes: events.unsubscribes,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

async function resolveList<T>(deferredList: Deferred<T>, value: T): Promise<void> {
  await act(async () => {
    deferredList.resolve(value);
    await Promise.resolve();
  });
  await flush();
}

describe("DeleteWorktreeProvider", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    cleanup = null;
  });

  afterEach(() => {
    cleanup?.();
    vi.useRealTimers();
    vi.doUnmock("@renderer/state/repos");
    vi.doUnmock("@renderer/state/worktrees");
    vi.restoreAllMocks();
  });

  it("loads initial delete jobs for the active repo", async () => {
    const initialJob = job("job-initial");
    const mounted = await mountProvider({ initialJobs: [initialJob] });
    cleanup = mounted.unmount;

    expect(mounted.api.worktreeDelete.list).toHaveBeenCalledWith({ repoId: 1 });
    expect(mounted.latest().jobs).toEqual([initialJob]);
  });

  it("merges created, updated, and completed events into provider state", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    const created = job("job-a", { items: [item("/repo/a", "pending")] });
    const updated = job("job-a", { items: [item("/repo/a", "deleting")] });
    const completed = job("job-a", { status: "done", items: [item("/repo/a", "deleted")] });

    await mounted.emit({ kind: "created", job: created });
    expect(mounted.latest().jobs).toEqual([created]);

    await mounted.emit({ kind: "updated", job: updated });
    expect(mounted.latest().jobs).toEqual([updated]);

    await mounted.emit({ kind: "completed", job: completed });
    expect(mounted.latest().jobs).toEqual([completed]);
  });

  it("removes jobs on dismissed events", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    await mounted.emit({ kind: "created", job: job("job-a") });
    await mounted.emit({ kind: "dismissed", jobId: "job-a" });

    expect(mounted.latest().jobs).toEqual([]);
  });

  it("ignores job events for other repos, except dismissed events remove by job id", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    await mounted.emit({ kind: "created", job: job("job-a") });
    await mounted.emit({ kind: "created", job: job("job-b", { repoId: 2, repoPath: "/other" }) });
    await mounted.emit({ kind: "updated", job: job("job-a", { repoId: 2, repoPath: "/other" }) });
    expect(mounted.latest().jobs.map((current) => current.id)).toEqual(["job-a"]);
    expect(mounted.latest().jobs[0]?.repoId).toBe(1);

    await mounted.emit({ kind: "dismissed", jobId: "job-a" });
    expect(mounted.latest().jobs).toEqual([]);
  });

  it("refreshes the repo when an item newly transitions to deleted", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    await mounted.emit({
      kind: "created",
      job: job("job-a", { items: [item("/repo/a", "deleting")] }),
    });
    expect(mounted.refreshRepo).not.toHaveBeenCalled();

    await mounted.emit({
      kind: "updated",
      job: job("job-a", { items: [item("/repo/a", "deleted")] }),
    });

    expect(mounted.refreshRepo).toHaveBeenCalledTimes(1);
    expect(mounted.refreshRepo).toHaveBeenCalledWith(1);
  });

  it("does not refresh repeatedly for the same deleted item status", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    const deleted = job("job-a", { items: [item("/repo/a", "deleted")] });

    await mounted.emit({ kind: "updated", job: deleted });
    await mounted.emit({ kind: "completed", job: { ...deleted, status: "done", finishedAt: 30 } });

    expect(mounted.refreshRepo).toHaveBeenCalledTimes(1);
  });

  it("auto-dismisses successful completed jobs after about 3 seconds", async () => {
    vi.useFakeTimers();
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    const completed = job("job-a", {
      status: "done",
      items: [item("/repo/a", "deleted")],
      finishedAt: 30,
    });

    await mounted.emit({ kind: "completed", job: completed });
    expect(mounted.latest().jobs).toEqual([completed]);
    expect(mounted.api.worktreeDelete.dismiss).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(2999);
    });
    expect(mounted.api.worktreeDelete.dismiss).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    await flush();

    expect(mounted.api.worktreeDelete.dismiss).toHaveBeenCalledWith({ jobId: "job-a" });
    expect(mounted.latest().jobs).toEqual([]);
  });

  it("keeps failed and cancelled jobs visible until dismissed", async () => {
    vi.useFakeTimers();
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    const failed = job("job-failed", { status: "failed", items: [item("/repo/failed", "failed")] });
    const cancelled = job("job-cancelled", {
      status: "cancelled",
      items: [item("/repo/cancelled", "cancelled")],
    });

    await mounted.emit({ kind: "completed", job: failed });
    await mounted.emit({ kind: "completed", job: cancelled });

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });
    await flush();

    expect(mounted.api.worktreeDelete.dismiss).not.toHaveBeenCalled();
    expect(mounted.latest().jobs.map((current) => current.id)).toEqual([
      "job-failed",
      "job-cancelled",
    ]);

    await mounted.emit({ kind: "dismissed", jobId: "job-failed" });
    expect(mounted.latest().jobs.map((current) => current.id)).toEqual(["job-cancelled"]);
  });

  it("exposes cancel and dismiss actions that call the API", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    await mounted.latest().cancel("job-a");
    await mounted.latest().dismiss("job-a");

    expect(mounted.api.worktreeDelete.cancel).toHaveBeenCalledWith({ jobId: "job-a" });
    expect(mounted.api.worktreeDelete.dismiss).toHaveBeenCalledWith({ jobId: "job-a" });
  });

  it("does not let a stale list response erase newer event state", async () => {
    const list = deferred<Awaited<ReturnType<ApiMock["worktreeDelete"]["list"]>>>();
    const mounted = await mountProvider({
      list: vi.fn().mockReturnValue(list.promise),
    });
    cleanup = mounted.unmount;

    const created = job("job-a", { items: [item("/repo/a", "deleting")] });
    const completed = job("job-a", {
      status: "done",
      items: [item("/repo/a", "deleted")],
      finishedAt: 30,
    });

    await mounted.emit({ kind: "created", job: created });
    await mounted.emit({ kind: "completed", job: completed });
    await resolveList(list, ok({ jobs: [] }));

    expect(mounted.latest().jobs).toEqual([completed]);
  });

  it("keeps list-only jobs when an unrelated job event arrives before the list resolves", async () => {
    const list = deferred<Awaited<ReturnType<ApiMock["worktreeDelete"]["list"]>>>();
    const mounted = await mountProvider({
      list: vi.fn().mockReturnValue(list.promise),
    });
    cleanup = mounted.unmount;

    const listOnly = job("job-a");
    const eventOnly = job("job-b", { items: [item("/repo/b", "deleting")] });

    await mounted.emit({ kind: "created", job: eventOnly });
    await resolveList(list, ok({ jobs: [listOnly] }));

    expect(mounted.latest().jobs).toEqual([eventOnly, listOnly]);
  });

  it("keeps a newer event snapshot when the list resolves with the same stale job id", async () => {
    const list = deferred<Awaited<ReturnType<ApiMock["worktreeDelete"]["list"]>>>();
    const mounted = await mountProvider({
      list: vi.fn().mockReturnValue(list.promise),
    });
    cleanup = mounted.unmount;

    const stale = job("job-a", { items: [item("/repo/a", "pending")] });
    const newer = job("job-a", { items: [item("/repo/a", "deleting")] });

    await mounted.emit({ kind: "updated", job: newer });
    await resolveList(list, ok({ jobs: [stale] }));

    expect(mounted.latest().jobs).toEqual([newer]);
  });

  it("does not let a stale list response resurrect a dismissed job", async () => {
    const staleJob = job("job-a");
    const list = deferred<Awaited<ReturnType<ApiMock["worktreeDelete"]["list"]>>>();
    const mounted = await mountProvider({
      list: vi.fn().mockReturnValue(list.promise),
    });
    cleanup = mounted.unmount;

    await mounted.emit({ kind: "dismissed", jobId: staleJob.id });
    await resolveList(list, ok({ jobs: [staleJob] }));

    expect(mounted.latest().jobs).toEqual([]);
  });

  it("clears visible jobs and done-job auto-dismiss timers immediately on repo switch", async () => {
    vi.useFakeTimers();
    const activeRepoId = { current: 1 as number | null };
    const repoTwoList = deferred<Awaited<ReturnType<ApiMock["worktreeDelete"]["list"]>>>();
    const doneJob = job("job-a", {
      repoId: 1,
      status: "done",
      items: [item("/repo/a", "deleted")],
      finishedAt: 30,
    });
    const list = vi.fn((input: { repoId: number }) =>
      input.repoId === 1 ? Promise.resolve(ok({ jobs: [doneJob] })) : repoTwoList.promise
    );
    const mounted = await mountProvider({ activeRepoId, list });
    cleanup = mounted.unmount;
    expect(mounted.latest().jobs).toEqual([doneJob]);

    activeRepoId.current = 2;
    await mounted.rerender();

    expect(mounted.latest().jobs).toEqual([]);
    expect(mounted.unsubscribes[0]).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });
    await flush();

    expect(mounted.api.worktreeDelete.dismiss).not.toHaveBeenCalled();
  });

  it("unsubscribes from delete job events on unmount", async () => {
    const mounted = await mountProvider();

    expect(mounted.unsubscribes).toHaveLength(1);
    mounted.unmount();
    cleanup = null;

    expect(mounted.unsubscribes[0]).toHaveBeenCalledTimes(1);
  });
});
