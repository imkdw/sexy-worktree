// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ok, err } from "@shared/result";
import type { OverviewGridDensity } from "@shared/overviewGridDensity";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const activeRepoId = { current: 1 as number | null };
const toasts: Array<{ kind: string; title: string; description?: string; durationMs?: number }> =
  [];

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
      get: vi.fn().mockResolvedValue(ok({ density: "3x3" as OverviewGridDensity })),
      set: vi.fn().mockResolvedValue(ok(undefined)),
    },
    update: {
      getState: vi.fn(),
      check: vi.fn(),
      download: vi.fn(),
      openDownloaded: vi.fn(),
      onEvent: vi.fn().mockReturnValue(() => {}),
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

type MockApi = ReturnType<typeof makeApi>;

async function mountProvider(configureApi?: (api: MockApi) => void) {
  vi.resetModules();
  window.api = makeApi();
  configureApi?.(window.api);
  toasts.length = 0;

  vi.doMock("@renderer/state/repos", () => ({
    useRepos: () => ({ activeRepoId: activeRepoId.current }),
  }));

  vi.doMock("@renderer/state/toast", () => ({
    useToast: () => ({
      push: (toast: { kind: string; title: string; description?: string; durationMs?: number }) => {
        toasts.push(toast);
        return "toast-1";
      },
    }),
  }));

  const module = await import("@renderer/state/overviewGridDensity");
  const latest: { value: ReturnType<typeof module.useOverviewGridDensity> | null } = {
    value: null,
  };

  function Probe(): null {
    latest.value = module.useOverviewGridDensity();
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(createElement(module.OverviewGridDensityProvider, null, createElement(Probe)));
  });
  await flush();

  return {
    latest,
    api: window.api,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("OverviewGridDensityProvider", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    activeRepoId.current = 1;
    cleanup = null;
  });

  afterEach(() => {
    cleanup?.();
    vi.doUnmock("@renderer/state/repos");
    vi.doUnmock("@renderer/state/toast");
    vi.restoreAllMocks();
  });

  it("loads density for the active repository", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    expect(mounted.api.overviewGridDensity.get).toHaveBeenCalledWith({ repoId: 1 });
    expect(mounted.latest.value?.density).toBe("3x3");
  });

  it("defaults to 2x2 when there is no active repository", async () => {
    activeRepoId.current = null;
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    expect(mounted.api.overviewGridDensity.get).not.toHaveBeenCalled();
    expect(mounted.latest.value?.density).toBe("2x2");
  });

  it("defaults to 2x2 when loading rejects", async () => {
    const mounted = await mountProvider((api) => {
      vi.mocked(api.overviewGridDensity.get).mockRejectedValueOnce(new Error("load failed"));
    });
    cleanup = mounted.unmount;

    expect(mounted.api.overviewGridDensity.get).toHaveBeenCalledWith({ repoId: 1 });
    expect(mounted.latest.value?.density).toBe("2x2");
  });

  it("optimistically toggles and persists density", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;
    let resolveSave!: (
      value: Awaited<ReturnType<typeof mounted.api.overviewGridDensity.set>>
    ) => void;
    const savePromise = new Promise<Awaited<ReturnType<typeof mounted.api.overviewGridDensity.set>>>(
      (resolve) => {
        resolveSave = resolve;
      }
    );
    vi.mocked(mounted.api.overviewGridDensity.set).mockReturnValueOnce(savePromise);

    let togglePromise: Promise<void> | undefined;
    act(() => {
      togglePromise = mounted.latest.value?.toggleDensity();
    });

    expect(mounted.latest.value?.density).toBe("2x2");
    await flush();
    expect(mounted.api.overviewGridDensity.set).toHaveBeenCalledWith({
      repoId: 1,
      density: "2x2",
    });

    await act(async () => {
      resolveSave(ok(undefined));
      await togglePromise;
    });
    await flush();
  });

  it("reverts and shows a toast when saving fails", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;
    vi.mocked(mounted.api.overviewGridDensity.set).mockResolvedValueOnce(
      err({ message: "database is locked" })
    );

    await act(async () => {
      await mounted.latest.value?.setDensity("2x2");
    });

    expect(mounted.latest.value?.density).toBe("3x3");
    expect(toasts).toEqual([
      {
        kind: "error",
        title: "Failed to save overview layout",
        description: "database is locked",
        durationMs: 5000,
      },
    ]);
  });

  it("reverts and shows a toast when saving rejects", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;
    vi.mocked(mounted.api.overviewGridDensity.set).mockRejectedValueOnce(
      new Error("database is locked")
    );

    await act(async () => {
      await mounted.latest.value?.setDensity("2x2");
    });

    expect(mounted.latest.value?.density).toBe("3x3");
    expect(toasts).toEqual([
      {
        kind: "error",
        title: "Failed to save overview layout",
        description: "database is locked",
        durationMs: 5000,
      },
    ]);
  });

  it("does not let a stale load overwrite an optimistic update", async () => {
    let resolveLoad!: (
      value: Awaited<ReturnType<typeof window.api.overviewGridDensity.get>>
    ) => void;
    const loadPromise = new Promise<Awaited<ReturnType<typeof window.api.overviewGridDensity.get>>>(
      (resolve) => {
        resolveLoad = resolve;
      }
    );
    const mounted = await mountProvider((api) => {
      vi.mocked(api.overviewGridDensity.get).mockReturnValueOnce(loadPromise);
    });
    cleanup = mounted.unmount;

    await act(async () => {
      await mounted.latest.value?.setDensity("3x3");
    });
    expect(mounted.latest.value?.density).toBe("3x3");

    await act(async () => {
      resolveLoad(ok({ density: "2x2" as OverviewGridDensity }));
      await loadPromise;
    });
    await flush();

    expect(mounted.latest.value?.density).toBe("3x3");
  });

  it("does not let an older save failure overwrite a newer intent", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;
    let rejectOlderSave!: (reason: Error) => void;
    const olderSavePromise = new Promise<
      Awaited<ReturnType<typeof mounted.api.overviewGridDensity.set>>
    >((_resolve, reject) => {
      rejectOlderSave = reject;
    });
    vi.mocked(mounted.api.overviewGridDensity.set)
      .mockReturnValueOnce(olderSavePromise)
      .mockResolvedValueOnce(ok(undefined));

    let olderSetPromise: Promise<void> | undefined;
    act(() => {
      olderSetPromise = mounted.latest.value?.setDensity("2x2");
    });
    expect(mounted.latest.value?.density).toBe("2x2");

    let newerSetPromise: Promise<void> | undefined;
    act(() => {
      newerSetPromise = mounted.latest.value?.setDensity("3x3");
    });
    expect(mounted.latest.value?.density).toBe("3x3");
    await flush();
    expect(mounted.api.overviewGridDensity.set).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectOlderSave(new Error("older save failed"));
      await olderSetPromise;
    });
    await flush();
    expect(mounted.latest.value?.density).toBe("3x3");
    expect(mounted.api.overviewGridDensity.set).toHaveBeenCalledTimes(2);

    await act(async () => {
      await newerSetPromise;
    });
    await flush();

    expect(mounted.latest.value?.density).toBe("3x3");
  });

  it("serializes failed saves and rolls the latest failure back to confirmed density", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;
    let rejectFirstSave!: (reason: Error) => void;
    let rejectSecondSave!: (reason: Error) => void;
    const firstSavePromise = new Promise<
      Awaited<ReturnType<typeof mounted.api.overviewGridDensity.set>>
    >((_resolve, reject) => {
      rejectFirstSave = reject;
    });
    const secondSavePromise = new Promise<
      Awaited<ReturnType<typeof mounted.api.overviewGridDensity.set>>
    >((_resolve, reject) => {
      rejectSecondSave = reject;
    });
    vi.mocked(mounted.api.overviewGridDensity.set)
      .mockReturnValueOnce(firstSavePromise)
      .mockReturnValueOnce(secondSavePromise);

    let firstSetPromise: Promise<void> | undefined;
    act(() => {
      firstSetPromise = mounted.latest.value?.setDensity("2x2");
    });
    expect(mounted.latest.value?.density).toBe("2x2");

    let secondSetPromise: Promise<void> | undefined;
    act(() => {
      secondSetPromise = mounted.latest.value?.setDensity("3x3");
    });
    expect(mounted.latest.value?.density).toBe("3x3");
    await flush();
    expect(mounted.api.overviewGridDensity.set).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectFirstSave(new Error("first save failed"));
      await firstSetPromise;
    });
    await flush();
    expect(mounted.latest.value?.density).toBe("3x3");
    expect(mounted.api.overviewGridDensity.set).toHaveBeenCalledTimes(2);

    await act(async () => {
      rejectSecondSave(new Error("second save failed"));
      await secondSetPromise;
    });
    await flush();

    expect(mounted.latest.value?.density).toBe("3x3");
    expect(toasts).toEqual([
      {
        kind: "error",
        title: "Failed to save overview layout",
        description: "first save failed",
        durationMs: 5000,
      },
      {
        kind: "error",
        title: "Failed to save overview layout",
        description: "second save failed",
        durationMs: 5000,
      },
    ]);
  });

  it("serializes saves so a later failure rolls back to an earlier successful write", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;
    let resolveFirstSave!: (
      value: Awaited<ReturnType<typeof mounted.api.overviewGridDensity.set>>
    ) => void;
    let rejectSecondSave!: (reason: Error) => void;
    const firstSavePromise = new Promise<
      Awaited<ReturnType<typeof mounted.api.overviewGridDensity.set>>
    >((resolve) => {
      resolveFirstSave = resolve;
    });
    const secondSavePromise = new Promise<
      Awaited<ReturnType<typeof mounted.api.overviewGridDensity.set>>
    >((_resolve, reject) => {
      rejectSecondSave = reject;
    });
    vi.mocked(mounted.api.overviewGridDensity.set)
      .mockReturnValueOnce(firstSavePromise)
      .mockReturnValueOnce(secondSavePromise);

    let firstSetPromise: Promise<void> | undefined;
    act(() => {
      firstSetPromise = mounted.latest.value?.setDensity("2x2");
    });
    expect(mounted.latest.value?.density).toBe("2x2");

    let secondSetPromise: Promise<void> | undefined;
    act(() => {
      secondSetPromise = mounted.latest.value?.setDensity("3x3");
    });
    expect(mounted.latest.value?.density).toBe("3x3");
    await flush();
    expect(mounted.api.overviewGridDensity.set).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirstSave(ok(undefined));
      await firstSetPromise;
    });
    await flush();
    expect(mounted.latest.value?.density).toBe("3x3");
    expect(mounted.api.overviewGridDensity.set).toHaveBeenCalledTimes(2);

    await act(async () => {
      rejectSecondSave(new Error("second save failed"));
      await secondSetPromise;
    });
    await flush();

    expect(mounted.latest.value?.density).toBe("2x2");
    expect(toasts).toEqual([
      {
        kind: "error",
        title: "Failed to save overview layout",
        description: "second save failed",
        durationMs: 5000,
      },
    ]);
  });

  it("reloads persisted density when a latest save fails before any confirmed density loads", async () => {
    let resolveInitialLoad!: (
      value: Awaited<ReturnType<typeof window.api.overviewGridDensity.get>>
    ) => void;
    let resolveRecoveryLoad!: (
      value: Awaited<ReturnType<typeof window.api.overviewGridDensity.get>>
    ) => void;
    const initialLoadPromise = new Promise<
      Awaited<ReturnType<typeof window.api.overviewGridDensity.get>>
    >((resolve) => {
      resolveInitialLoad = resolve;
    });
    const recoveryLoadPromise = new Promise<
      Awaited<ReturnType<typeof window.api.overviewGridDensity.get>>
    >((resolve) => {
      resolveRecoveryLoad = resolve;
    });
    const mounted = await mountProvider((api) => {
      vi.mocked(api.overviewGridDensity.get)
        .mockReturnValueOnce(initialLoadPromise)
        .mockReturnValueOnce(recoveryLoadPromise);
      vi.mocked(api.overviewGridDensity.set).mockRejectedValueOnce(new Error("save failed"));
    });
    cleanup = mounted.unmount;

    expect(mounted.latest.value?.density).toBe("2x2");

    await act(async () => {
      await mounted.latest.value?.setDensity("3x3");
    });
    expect(mounted.api.overviewGridDensity.get).toHaveBeenCalledTimes(2);
    expect(mounted.latest.value?.density).toBe("2x2");

    await act(async () => {
      resolveRecoveryLoad(ok({ density: "3x3" as OverviewGridDensity }));
      await recoveryLoadPromise;
    });
    await flush();
    expect(mounted.latest.value?.density).toBe("3x3");

    await act(async () => {
      resolveInitialLoad(ok({ density: "3x3" as OverviewGridDensity }));
      await initialLoadPromise;
    });
    await flush();

    expect(mounted.latest.value?.density).toBe("3x3");
    expect(toasts).toEqual([
      {
        kind: "error",
        title: "Failed to save overview layout",
        description: "save failed",
        durationMs: 5000,
      },
    ]);
  });
});
