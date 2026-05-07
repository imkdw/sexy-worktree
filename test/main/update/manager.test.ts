import { describe, expect, it, vi } from "vitest";
import { UpdateManager, type UpdateManagerDeps } from "@main/update/manager";
import type { GitHubRelease } from "@main/update/githubRelease";
import { err, ok } from "@shared/result";
import type { Result } from "@shared/result";
import type { UpdateEvent } from "@shared/update";

vi.mock("electron", () => ({
  app: {
    getVersion: vi.fn(() => "1.0.0"),
    getPath: vi.fn(() => "/Users/test/Downloads"),
  },
  shell: {
    openPath: vi.fn().mockResolvedValue(""),
  },
}));

function release(): GitHubRelease {
  return {
    tagName: "v1.0.1",
    name: "Sexy Worktree v1.0.1",
    htmlUrl: "https://github.com/imkdw/sexy-worktree/releases/tag/v1.0.1",
    draft: false,
    prerelease: false,
    publishedAt: "2026-05-07T00:00:00Z",
    assets: [
      {
        name: "Sexy Worktree-1.0.1-arm64.dmg",
        browserDownloadUrl:
          "https://github.com/imkdw/sexy-worktree/releases/download/v1.0.1/app.dmg",
        size: 5,
        contentType: "application/x-apple-diskimage",
      },
    ],
  };
}

function createManager(overrides: Partial<UpdateManagerDeps> = {}): UpdateManager {
  return new UpdateManager({
    getCurrentVersion: () => "1.0.0",
    getDownloadsPath: () => "/Users/test/Downloads",
    fetchReleases: vi.fn().mockResolvedValue(ok([release()])),
    downloadAsset: vi
      .fn()
      .mockResolvedValue({ filePath: "/Users/test/Downloads/app.dmg", reused: false }),
    openPath: vi.fn().mockResolvedValue(""),
    now: () => 100,
    ...overrides,
  });
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((error: unknown) => void) | undefined;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  if (!resolve || !reject) {
    throw new Error("Deferred promise callbacks were not initialized");
  }

  return { promise, resolve, reject };
}

describe("UpdateManager", () => {
  it("emits checking then available when a newer release exists", async () => {
    const manager = createManager();
    const events: UpdateEvent[] = [];
    manager.onEvent((event) => events.push(event));

    const result = await manager.check({ silent: false });

    expect(result.ok).toBe(true);
    expect(manager.getState().phase).toBe("available");
    expect(events.map((event) => event.state.phase)).toEqual(["checking", "available"]);
  });

  it("does not emit startup noise for silent checks with no update", async () => {
    const manager = createManager({
      getCurrentVersion: () => "1.0.1",
    });
    const listener = vi.fn();
    manager.onEvent(listener);
    const expectedState = {
      phase: "not-available" as const,
      currentVersion: "1.0.1",
      checkedAt: 100,
    };

    const result = await manager.check({ silent: true });

    expect(result).toEqual(
      ok({
        state: expectedState,
      })
    );
    expect(manager.getState()).toEqual(expectedState);
    expect(listener).not.toHaveBeenCalled();
  });

  it("returns a typed error and stores error state when fetching releases fails", async () => {
    const fetchError = { kind: "request-failed" as const, message: "network down" };
    const manager = createManager({
      fetchReleases: vi.fn().mockResolvedValue(err(fetchError)),
    });

    const result = await manager.check({ silent: false });

    expect(result).toEqual(err(fetchError));
    expect(manager.getState()).toEqual({
      phase: "error",
      currentVersion: "1.0.0",
      checkedAt: 100,
      error: fetchError,
    });
  });

  it("downloads an available update, reports progress, opens the DMG, and stores downloaded state", async () => {
    const downloadAsset = vi.fn().mockImplementation(async ({ onProgress }) => {
      onProgress({ downloadedBytes: 5, totalBytes: 5 });
      return { filePath: "/Users/test/Downloads/app.dmg", reused: false };
    });
    const openPath = vi.fn().mockResolvedValue("");
    const manager = createManager({ downloadAsset, openPath });
    const events: UpdateEvent[] = [];
    manager.onEvent((event) => events.push(event));
    await manager.check({ silent: false });
    events.length = 0;

    const result = await manager.download();

    expect(result.ok).toBe(true);
    expect(downloadAsset).toHaveBeenCalledWith({
      downloadsDir: "/Users/test/Downloads",
      asset: expect.objectContaining({ name: "Sexy Worktree-1.0.1-arm64.dmg" }),
      onProgress: expect.any(Function),
    });
    expect(openPath).toHaveBeenCalledWith("/Users/test/Downloads/app.dmg");
    expect(manager.getState()).toEqual({
      phase: "downloaded",
      currentVersion: "1.0.0",
      update: expect.objectContaining({ version: "1.0.1" }),
      filePath: "/Users/test/Downloads/app.dmg",
    });
    expect(events).toContainEqual({
      state: expect.objectContaining({
        phase: "downloading",
        progress: {
          downloadedBytes: 5,
          totalBytes: 5,
          percent: 100,
        },
      }),
    });
    expect(events.at(-1)?.state.phase).toBe("downloaded");
  });

  it("returns not-available when download is called before an available update exists", async () => {
    const manager = createManager();

    const result = await manager.download();

    expect(result).toEqual(
      err({
        kind: "not-available",
        message: "No update is available to download",
      })
    );
  });

  it("opens an already downloaded update again", async () => {
    const openPath = vi.fn().mockResolvedValue("");
    const manager = createManager({ openPath });
    await manager.check({ silent: false });
    await manager.download();

    const result = await manager.openDownloaded();

    expect(openPath).toHaveBeenCalledTimes(2);
    expect(openPath).toHaveBeenLastCalledWith("/Users/test/Downloads/app.dmg");
    expect(result).toEqual(ok({ state: manager.getState() }));
  });

  it("returns open-failed and stores error state when opening the DMG fails during download", async () => {
    const openError = "could not open dmg";
    const manager = createManager({
      openPath: vi.fn().mockResolvedValue(openError),
    });
    await manager.check({ silent: false });

    const result = await manager.download();

    expect(result).toEqual(err({ kind: "open-failed", message: openError }));
    expect(manager.getState()).toEqual({
      phase: "error",
      currentVersion: "1.0.0",
      checkedAt: 100,
      error: { kind: "open-failed", message: openError },
    });
  });

  it("does not let an older silent check overwrite a newer manual check", async () => {
    const slowFetch =
      deferred<Result<GitHubRelease[], { kind: "request-failed"; message: string }>>();
    const fetchReleases = vi
      .fn()
      .mockReturnValueOnce(slowFetch.promise)
      .mockResolvedValue(ok([release()]));
    const manager = createManager({
      getCurrentVersion: vi.fn().mockReturnValueOnce("1.0.1").mockReturnValue("1.0.0"),
      fetchReleases,
    });

    const olderCheck = manager.check({ silent: true });
    const newerCheck = await manager.check({ silent: false });
    expect(newerCheck.ok).toBe(true);
    expect(manager.getState().phase).toBe("available");

    slowFetch.resolve(ok([release()]));
    const staleResult = await olderCheck;

    expect(staleResult).toEqual(ok({ state: manager.getState() }));
    expect(manager.getState().phase).toBe("available");
  });

  it("ignores stale download progress and completion after a newer check", async () => {
    const download = deferred<{ filePath: string; reused: boolean }>();
    let onProgress:
      | ((progress: { downloadedBytes: number; totalBytes: number | null }) => void)
      | undefined;
    const downloadAsset = vi.fn().mockImplementation(async (params) => {
      onProgress = params.onProgress;
      return download.promise;
    });
    const openPath = vi.fn().mockResolvedValue("");
    const manager = createManager({ downloadAsset, openPath });
    await manager.check({ silent: false });

    const staleDownload = manager.download();
    expect(manager.getState().phase).toBe("downloading");
    await manager.check({ silent: false });
    expect(manager.getState().phase).toBe("available");

    onProgress?.({ downloadedBytes: 5, totalBytes: 5 });
    download.resolve({ filePath: "/Users/test/Downloads/stale.dmg", reused: false });
    const staleResult = await staleDownload;

    expect(staleResult).toEqual(ok({ state: manager.getState() }));
    expect(manager.getState().phase).toBe("available");
    expect(openPath).not.toHaveBeenCalled();
  });

  it("can retry opening a downloaded DMG after an initial open failure", async () => {
    const openPath = vi.fn().mockResolvedValueOnce("could not open dmg").mockResolvedValueOnce("");
    const manager = createManager({ openPath });
    await manager.check({ silent: false });

    const failedDownload = await manager.download();
    const retry = await manager.openDownloaded();

    expect(failedDownload).toEqual(err({ kind: "open-failed", message: "could not open dmg" }));
    expect(retry).toEqual(ok({ state: manager.getState() }));
    expect(openPath).toHaveBeenCalledTimes(2);
    expect(manager.getState()).toEqual({
      phase: "downloaded",
      currentVersion: "1.0.0",
      update: expect.objectContaining({ version: "1.0.1" }),
      filePath: "/Users/test/Downloads/app.dmg",
    });
  });

  it("does not let a stale openDownloaded overwrite a newer check result", async () => {
    const pendingOpen = deferred<string>();
    const openPath = vi.fn().mockResolvedValueOnce("").mockReturnValueOnce(pendingOpen.promise);
    const manager = createManager({ openPath });
    await manager.check({ silent: false });
    await manager.download();

    const staleOpen = manager.openDownloaded();
    await manager.check({ silent: false });
    expect(manager.getState().phase).toBe("available");

    pendingOpen.resolve("");
    const staleResult = await staleOpen;

    expect(staleResult).toEqual(ok({ state: manager.getState() }));
    expect(manager.getState().phase).toBe("available");
  });

  it("isolates listener failures so check still resolves and other listeners receive events", async () => {
    const manager = createManager();
    const received: UpdateEvent[] = [];
    manager.onEvent(() => {
      throw new Error("listener failed");
    });
    manager.onEvent((event) => received.push(event));

    const result = await manager.check({ silent: false });

    expect(result.ok).toBe(true);
    expect(received.map((event) => event.state.phase)).toEqual(["checking", "available"]);
  });
});
