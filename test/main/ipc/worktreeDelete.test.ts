import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import type { DeleteWorktreeJobEvent, DeleteWorktreeJobSnapshot } from "@shared/deleteWorktree";

type IpcHandler = (_event: unknown, args: unknown) => Promise<unknown>;
type Listener = (event: DeleteWorktreeJobEvent) => void;
type StartSuccess = { ok: true; value: { jobId: string } };

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, IpcHandler>(),
  listRepos: vi.fn(),
  listWorktrees: vi.fn(),
  removeWorktree: vi.fn(),
  managers: [] as Array<{
    listeners: Listener[];
    onEvent: ReturnType<typeof vi.fn>;
    enqueue: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    dismiss: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    findActiveConflict: ReturnType<typeof vi.fn>;
    emit: (event: DeleteWorktreeJobEvent) => void;
  }>,
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      mocks.handlers.set(channel, handler);
    }),
  },
}));

vi.mock("@main/db", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("@main/db/repos", () => ({
  listRepos: mocks.listRepos,
}));

vi.mock("@main/git/worktrees", () => ({
  listWorktrees: mocks.listWorktrees,
}));

vi.mock("@main/git/removeWorktree", () => ({
  removeWorktree: mocks.removeWorktree,
}));

vi.mock("@main/worktreeDelete/manager", () => ({
  DeleteWorktreeManager: class {
    listeners: Listener[] = [];
    onEvent = vi.fn((listener: Listener) => {
      this.listeners.push(listener);
      return () => {
        this.listeners = this.listeners.filter((current) => current !== listener);
      };
    });
    enqueue = vi.fn();
    cancel = vi.fn();
    dismiss = vi.fn();
    list = vi.fn();
    findActiveConflict = vi.fn();

    constructor() {
      mocks.managers.push(this);
    }

    emit(event: DeleteWorktreeJobEvent): void {
      for (const listener of this.listeners) listener(event);
    }
  },
}));

async function setup(getWindow: () => BrowserWindow | null = () => null) {
  vi.resetModules();
  mocks.handlers.clear();
  mocks.managers.length = 0;
  const module = await import("@main/ipc/worktreeDelete");
  module.registerWorktreeDeleteHandlers(getWindow);
  const manager = mocks.managers[0];
  if (!manager) throw new Error("Expected delete worktree manager to be created");
  return { manager, module };
}

function handler(channel: string): IpcHandler {
  const registered = mocks.handlers.get(channel);
  if (!registered) throw new Error(`Missing IPC handler: ${channel}`);
  return registered;
}

describe("worktree delete IPC handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listRepos.mockReturnValue([{ id: 7, path: "/repo", name: "repo", lastActiveAt: 1 }]);
    mocks.listWorktrees.mockResolvedValue({
      ok: true,
      value: [
        { path: "/repo", branch: "main", head: "abc", isMain: true },
        { path: "/repo/wt-a", branch: "current-a", head: "def", isMain: false },
      ],
    });
  });

  it("worktreeDelete:start returns repository-not-found when repo is missing", async () => {
    await setup();
    mocks.listRepos.mockReturnValue([]);

    const result = await handler("worktreeDelete:start")(null, {
      repoId: 404,
      targets: [{ worktreePath: "/repo/wt-a", branch: "stale-a" }],
    });

    expect(result).toEqual({ ok: false, error: { message: "Repository not found" } });
    expect(mocks.listWorktrees).not.toHaveBeenCalled();
    expect(mocks.managers[0]?.enqueue).not.toHaveBeenCalled();
  });

  it("worktreeDelete:start returns listWorktrees stderr when listing fails", async () => {
    await setup();
    mocks.listWorktrees.mockResolvedValue({
      ok: false,
      error: { stderr: "fatal: not a git repository" },
    });

    const result = await handler("worktreeDelete:start")(null, {
      repoId: 7,
      targets: [{ worktreePath: "/repo/wt-a", branch: "stale-a" }],
    });

    expect(result).toEqual({ ok: false, error: { message: "fatal: not a git repository" } });
    expect(mocks.managers[0]?.enqueue).not.toHaveBeenCalled();
  });

  it("worktreeDelete:start falls back when listWorktrees fails without stderr", async () => {
    await setup();
    mocks.listWorktrees.mockResolvedValue({
      ok: false,
      error: { stderr: "" },
    });

    const result = await handler("worktreeDelete:start")(null, {
      repoId: 7,
      targets: [{ worktreePath: "/repo/wt-a", branch: "stale-a" }],
    });

    expect(result).toEqual({ ok: false, error: { message: "Failed to list worktrees" } });
    expect(mocks.managers[0]?.enqueue).not.toHaveBeenCalled();
  });

  it("worktreeDelete:start rejects malformed input before repo or target processing", async () => {
    await setup();

    const badRepo = await handler("worktreeDelete:start")(null, {
      repoId: Number.NaN,
      targets: [{ worktreePath: "/repo/wt-a", branch: "stale-a" }],
    });
    const badTargets = await handler("worktreeDelete:start")(null, {
      repoId: 7,
      targets: "not-an-array",
    });

    expect(badRepo).toEqual({ ok: false, error: { message: "Invalid delete request" } });
    expect(badTargets).toEqual({ ok: false, error: { message: "Invalid delete request" } });
    expect(mocks.listRepos).not.toHaveBeenCalled();
  });

  it("worktreeDelete:start enqueues normalized targets from current worktrees", async () => {
    const { manager } = await setup();
    manager.findActiveConflict.mockReturnValue(null);

    const result = await handler("worktreeDelete:start")(null, {
      repoId: 7,
      targets: [{ worktreePath: "/repo/wt-a", branch: "stale-a" }],
    });

    if (!(typeof result === "object" && result && "ok" in result && result.ok === true)) {
      throw new Error("Expected successful start result");
    }
    const started = result as StartSuccess;
    expect(started).toMatchObject({ ok: true, value: { jobId: expect.any(String) } });
    expect(manager.findActiveConflict).toHaveBeenCalledWith({
      repoId: 7,
      worktreePaths: ["/repo/wt-a"],
    });
    expect(manager.enqueue).toHaveBeenCalledWith({
      jobId: started.value.jobId,
      repoId: 7,
      repoPath: "/repo",
      targets: [{ worktreePath: "/repo/wt-a", branch: "current-a" }],
    });
  });

  it("worktreeDelete:start blocks active manager conflicts before enqueue", async () => {
    const { manager } = await setup();
    manager.findActiveConflict.mockReturnValue({ existingPath: "/repo/wt-a" });

    const result = await handler("worktreeDelete:start")(null, {
      repoId: 7,
      targets: [{ worktreePath: "/repo/wt-a", branch: "stale-a" }],
    });

    expect(result).toEqual({
      ok: false,
      error: { message: "Worktree is already being deleted: /repo/wt-a" },
    });
    expect(manager.enqueue).not.toHaveBeenCalled();
  });

  it("worktreeDelete:cancel returns manager cancel result", async () => {
    const { manager } = await setup();
    manager.cancel.mockReturnValueOnce(true).mockReturnValueOnce(false);

    await expect(handler("worktreeDelete:cancel")(null, { jobId: "job-a" })).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    await expect(handler("worktreeDelete:cancel")(null, { jobId: "job-a" })).resolves.toEqual({
      ok: false,
      error: { message: "Delete job is not running" },
    });
    expect(manager.cancel).toHaveBeenCalledWith("job-a");
  });

  it("worktreeDelete:dismiss returns manager dismiss result", async () => {
    const { manager } = await setup();
    manager.dismiss.mockReturnValueOnce(true).mockReturnValueOnce(false);

    await expect(handler("worktreeDelete:dismiss")(null, { jobId: "job-a" })).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    await expect(handler("worktreeDelete:dismiss")(null, { jobId: "job-a" })).resolves.toEqual({
      ok: false,
      error: { message: "Delete job cannot be dismissed" },
    });
    expect(manager.dismiss).toHaveBeenCalledWith("job-a");
  });

  it("worktreeDelete:list returns manager jobs", async () => {
    const { manager } = await setup();
    const jobs = [
      {
        id: "job-a",
        repoId: 7,
        repoPath: "/repo",
        status: "done",
        items: [],
        cancelRequested: false,
        createdAt: 1,
        finishedAt: 2,
      } satisfies DeleteWorktreeJobSnapshot,
    ];
    manager.list.mockReturnValue(jobs);

    await expect(handler("worktreeDelete:list")(null, { repoId: 7 })).resolves.toEqual({
      ok: true,
      value: { jobs },
    });
    expect(manager.list).toHaveBeenCalledWith(7);
  });

  it("forwards manager events to the current window", async () => {
    const send = vi.fn();
    const win = { webContents: { send } } as unknown as BrowserWindow;
    const { manager } = await setup(() => win);
    const event: DeleteWorktreeJobEvent = {
      kind: "dismissed",
      jobId: "job-a",
    };

    manager.emit(event);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("worktreeDelete:event", event);
  });

  it("does not register duplicate manager event listeners when handlers are registered repeatedly", async () => {
    const send = vi.fn();
    const win = { webContents: { send } } as unknown as BrowserWindow;
    const { manager, module } = await setup(() => win);
    module.registerWorktreeDeleteHandlers(() => win);
    const event: DeleteWorktreeJobEvent = {
      kind: "dismissed",
      jobId: "job-a",
    };

    manager.emit(event);

    expect(manager.onEvent).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
