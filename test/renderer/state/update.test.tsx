// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, type ComponentType, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { err, ok } from "@shared/result";
import type { UpdateEvent, UpdateInfo, UpdateState } from "@shared/update";
import type { Toast } from "@renderer/state/toast";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type ToastInput = Omit<Toast, "id">;

const pushedToasts: ToastInput[] = [];
const updatedToasts: Array<{ id: string; patch: Partial<ToastInput> }> = [];
const dismissedToasts: string[] = [];
let nextToastId = 1;
let updateListener: ((e: UpdateEvent) => void) | null = null;

const pushToast = vi.fn((toast: ToastInput) => {
  pushedToasts.push(toast);
  return `toast-${nextToastId++}`;
});
const updateToast = vi.fn((id: string, patch: Partial<ToastInput>) =>
  updatedToasts.push({ id, patch })
);
const dismissToast = vi.fn((id: string) => dismissedToasts.push(id));

function updateInfo(tagName = "v1.2.3"): UpdateInfo {
  return {
    version: tagName.replace(/^v/, ""),
    tagName,
    releaseName: `Release ${tagName}`,
    htmlUrl: `https://github.com/imkdw/sexy-worktree/releases/tag/${tagName}`,
    publishedAt: "2026-05-07T00:00:00.000Z",
    asset: {
      name: "Sexy.Worktree.dmg",
      browserDownloadUrl: "https://github.com/imkdw/sexy-worktree/releases/download/app.dmg",
      size: 1024,
      contentType: "application/x-apple-diskimage",
    },
  };
}

function availableState(tagName = "v1.2.3"): UpdateState {
  return {
    phase: "available",
    currentVersion: "1.0.0",
    checkedAt: 1,
    update: updateInfo(tagName),
  };
}

function downloadingState(percent: number | null): UpdateState {
  return {
    phase: "downloading",
    currentVersion: "1.0.0",
    update: updateInfo(),
    progress: {
      downloadedBytes: 8 * 1024 * 1024,
      totalBytes: 10 * 1024 * 1024,
      percent,
    },
  };
}

function downloadedState(filePath = "/tmp/Sexy.Worktree.dmg"): UpdateState {
  return {
    phase: "downloaded",
    currentVersion: "1.0.0",
    update: updateInfo(),
    filePath,
  };
}

function makeApi(): typeof window.api {
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
    update: {
      getState: vi.fn().mockResolvedValue(ok({ state: { phase: "idle" } as UpdateState })),
      check: vi.fn().mockResolvedValue(ok({ state: { phase: "idle" } as UpdateState })),
      download: vi.fn().mockResolvedValue(ok({ state: downloadedState() })),
      openDownloaded: vi.fn().mockResolvedValue(ok({ state: downloadedState() })),
      onEvent: vi.fn((cb: (e: UpdateEvent) => void) => {
        updateListener = cb;
        return vi.fn(() => {
          if (updateListener === cb) updateListener = null;
        });
      }),
    },
    worktree: {
      list: vi.fn(),
      remove: vi.fn(),
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
      cancel: vi.fn(),
      dismiss: vi.fn(),
      list: vi.fn(),
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
  } satisfies typeof window.api;
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mountProvider(configureApi?: (api: typeof window.api) => void) {
  vi.resetModules();
  window.api = makeApi();
  configureApi?.(window.api);

  vi.doMock("@renderer/state/toast", () => ({
    useToast: () => ({
      push: pushToast,
      update: updateToast,
      dismiss: dismissToast,
    }),
  }));

  const module = await import("@renderer/state/update");
  const latest: { value: ReturnType<typeof module.useUpdate> | null } = { value: null };

  function Probe(): null {
    latest.value = module.useUpdate();
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(
      createElement(
        module.UpdateProvider as ComponentType<{ children: ReactNode }>,
        null,
        createElement(Probe)
      )
    );
  });
  await flush();

  return {
    api: window.api,
    latest,
    emit: async (state: UpdateState) => {
      await act(async () => {
        updateListener?.({ state });
      });
      await flush();
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("UpdateProvider", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    pushedToasts.length = 0;
    updatedToasts.length = 0;
    dismissedToasts.length = 0;
    nextToastId = 1;
    updateListener = null;
    pushToast.mockClear();
    updateToast.mockClear();
    dismissToast.mockClear();
    cleanup = null;
  });

  afterEach(() => {
    cleanup?.();
    vi.doUnmock("@renderer/state/toast");
    vi.restoreAllMocks();
  });

  it("loads initial state and subscribes to update events", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    expect(mounted.api.update.getState).toHaveBeenCalledTimes(1);
    expect(mounted.api.update.onEvent).toHaveBeenCalledTimes(1);
    expect(mounted.latest.value?.state.phase).toBe("idle");
  });

  it("subscribes to update events before requesting initial state", async () => {
    const calls: string[] = [];
    const mounted = await mountProvider((api) => {
      api.update.onEvent = vi.fn((cb: (e: UpdateEvent) => void) => {
        calls.push("onEvent");
        updateListener = cb;
        return vi.fn(() => {
          if (updateListener === cb) updateListener = null;
        });
      });
      api.update.getState = vi.fn(() => {
        calls.push("getState");
        return Promise.resolve(ok({ state: { phase: "idle" } as UpdateState }));
      });
    });
    cleanup = mounted.unmount;

    expect(calls).toEqual(["onEvent", "getState"]);
  });

  it("updates state and pushes an actionable warning toast when an update is available", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    await mounted.emit(availableState("v2.0.0"));

    expect(mounted.latest.value?.state.phase).toBe("available");
    expect(pushedToasts).toHaveLength(1);
    expect(pushedToasts[0]).toMatchObject({
      kind: "warning",
      title: "Sexy Worktree v2.0.0 available",
      description: "Download the DMG to install it.",
      action: { label: "Download update" },
    });
    expect(pushedToasts[0]?.action?.onClick).toEqual(expect.any(Function));
  });

  it("does not push another warning for the same tag but does for a different tag", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    await mounted.emit(availableState("v2.0.0"));
    await mounted.emit(availableState("v2.0.0"));
    await mounted.emit(availableState("v2.1.0"));

    const warnings = pushedToasts.filter((toast) => toast.kind === "warning");
    expect(warnings).toHaveLength(2);
    expect(warnings.map((toast) => toast.title)).toEqual([
      "Sexy Worktree v2.0.0 available",
      "Sexy Worktree v2.1.0 available",
    ]);
  });

  it("calls the update download API when the warning toast action is clicked", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;
    await mounted.emit(availableState("v2.0.0"));

    await act(async () => {
      await pushedToasts[0]?.action?.onClick();
    });

    expect(mounted.api.update.download).toHaveBeenCalledTimes(1);
  });

  it("pushes a progress toast with percent when a download is in progress", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    await mounted.emit(downloadingState(80));

    expect(pushedToasts).toContainEqual({
      kind: "progress",
      title: "Downloading update",
      description: "80%",
    });
  });

  it("updates the existing progress toast for a second downloading event", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    await mounted.emit(downloadingState(40));
    await mounted.emit(downloadingState(80));

    expect(pushedToasts.filter((toast) => toast.kind === "progress")).toHaveLength(1);
    expect(updateToast).toHaveBeenCalledWith("toast-1", {
      kind: "progress",
      title: "Downloading update",
      description: "80%",
    });
  });

  it("dismisses progress when downloading transitions to an error state", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;
    await mounted.emit(downloadingState(80));

    await mounted.emit({
      phase: "error",
      currentVersion: "1.0.0",
      checkedAt: 2,
      error: {
        kind: "download-failed",
        message: "network down",
      },
    });

    expect(dismissToast).toHaveBeenCalledWith("toast-1");
  });

  it("dismisses progress and pushes a success toast when the update is downloaded", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;
    await mounted.emit(downloadingState(80));

    await mounted.emit(downloadedState("/tmp/Sexy.Worktree-v1.2.3.dmg"));

    expect(dismissedToasts).toContain("toast-1");
    expect(pushedToasts).toContainEqual({
      kind: "success",
      title: "Update DMG opened",
      description: "Finish installing from the opened DMG.",
      durationMs: 5000,
    });
  });

  it("does not push another success toast for the same downloaded file path", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    await mounted.emit(downloadedState("/tmp/Sexy.Worktree-v1.2.3.dmg"));
    await mounted.emit(downloadedState("/tmp/Sexy.Worktree-v1.2.3.dmg"));

    expect(pushedToasts).toContainEqual({
      kind: "success",
      title: "Update DMG opened",
      description: "Finish installing from the opened DMG.",
      durationMs: 5000,
    });
    expect(pushedToasts.filter((toast) => toast.kind === "success")).toHaveLength(1);
  });

  it("pushes the expected error toast when download fails", async () => {
    const mounted = await mountProvider((api) => {
      api.update.download = vi.fn().mockResolvedValue(
        err({
          kind: "download-failed",
          message: "network down",
        })
      );
    });
    cleanup = mounted.unmount;

    await act(async () => {
      await mounted.latest.value?.download();
    });

    expect(pushedToasts).toContainEqual({
      kind: "error",
      title: "Update download failed",
      description: "network down",
      durationMs: 5000,
    });
  });
});
