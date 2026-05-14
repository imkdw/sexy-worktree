// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { RepoRow, Worktree } from "@shared/ipc";
import { findLeafIds } from "@shared/paneOps";
import { ok } from "@shared/result";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type TerminalSessionsModule = typeof import("@renderer/state/terminalSessions");
type ApiMock = typeof window.api;

const repo: RepoRow = {
  id: 1,
  path: "/repo",
  name: "repo",
  lastActiveAt: 1,
};

const mainWorktree: Worktree = {
  path: "/repo",
  branch: "main",
  head: "abc",
  isMain: true,
};

const featureWorktree: Worktree = {
  path: "/repo/worktrees/feature-a",
  branch: "feature/a",
  head: "def",
  isMain: false,
};

const otherWorktree: Worktree = {
  path: "/repo/worktrees/feature-b",
  branch: "feature/b",
  head: "fed",
  isMain: false,
};

const reposRef = { current: [repo] as RepoRow[] };
const worktreesByRepoRef = {
  current: new Map<number, Worktree[]>([[1, [mainWorktree, featureWorktree, otherWorktree]]]),
};
const activeIdRef = { current: null as string | null };
const setActiveMock = vi.fn((id: string) => {
  activeIdRef.current = id;
});
const spawnPtyForEntryMock = vi.fn(async (entry: { ptyId: string | null }, cwd: string) => {
  entry.ptyId = `pty:${cwd}`;
  return { ok: true as const, id: entry.ptyId };
});
const disposeLeafEntryMock = vi.fn();
const disposePtyForEntryMock = vi.fn();

function makeApi(): ApiMock {
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
      getState: vi.fn(),
      check: vi.fn(),
      download: vi.fn(),
      openDownloaded: vi.fn(),
      onEvent: vi.fn().mockReturnValue(() => {}),
    },
    worktree: {
      list: vi.fn(),
      files: vi.fn().mockResolvedValue(ok({ entries: [] })),
      status: vi.fn().mockResolvedValue(ok({ changes: [] })),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      fileDiff: vi.fn(),
      remove: vi.fn(),
    },
    config: {
      get: vi.fn(),
      saveJira: vi.fn(),
      saveRepository: vi.fn(),
    },
    pty: {
      spawn: vi.fn().mockResolvedValue(ok({ id: "pty-1" })),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn().mockReturnValue(() => {}),
      onExit: vi.fn().mockReturnValue(() => {}),
    },
    pane: {
      load: vi.fn().mockResolvedValue(ok({ tree: null })),
      save: vi.fn().mockResolvedValue(ok(undefined)),
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
  } satisfies ApiMock;
}

const apiMock = makeApi();
let terminalSessionsModulePromise: Promise<TerminalSessionsModule> | null = null;

function loadTerminalSessionsModule(): Promise<TerminalSessionsModule> {
  terminalSessionsModulePromise ??= import("@renderer/state/terminalSessions");
  return terminalSessionsModulePromise;
}

vi.doMock("@renderer/state/repos", () => ({
  useRepos: () => ({
    repos: reposRef.current,
    activeRepoId: 1,
  }),
}));

vi.doMock("@renderer/state/worktrees", () => ({
  useWorktrees: () => ({
    worktreesByRepo: worktreesByRepoRef.current,
    worktrees: worktreesByRepoRef.current.get(1) ?? [],
    activeId: activeIdRef.current,
    setActive: setActiveMock,
    refresh: vi.fn(),
    refreshRepo: vi.fn(),
  }),
}));

vi.doMock("@renderer/terminal/Terminal", () => ({
  createLeafEntry: vi.fn(() => ({
    term: {
      write: vi.fn(),
      dispose: vi.fn(),
    },
    fit: {
      fit: vi.fn(),
    },
    ptyId: null,
    inputBuf: "",
    unsubData: null,
    unsubExit: null,
    onCommandRun: null,
    onExit: null,
    onSpawnError: null,
  })),
  disposeLeafEntry: disposeLeafEntryMock,
  disposePtyForEntry: disposePtyForEntryMock,
  spawnPtyForEntry: spawnPtyForEntryMock,
}));

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mountProvider(): Promise<{
  latest: {
    cards: ReturnType<TerminalSessionsModule["useTerminalSessionCards"]> | null;
    featureOps: ReturnType<TerminalSessionsModule["useTerminalSessions"]> | null;
  };
  rerender: () => Promise<void>;
  unmount: () => void;
}> {
  window.api = apiMock;
  const module = await loadTerminalSessionsModule();
  const latest: {
    cards: ReturnType<typeof module.useTerminalSessionCards> | null;
    featureOps: ReturnType<typeof module.useTerminalSessions> | null;
  } = {
    cards: null,
    featureOps: null,
  };

  function Probe(): null {
    latest.cards = module.useTerminalSessionCards();
    latest.featureOps = module.useTerminalSessions(1, featureWorktree.path);
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  async function render(): Promise<void> {
    await act(async () => {
      root.render(createElement(module.TerminalSessionsProvider, null, createElement(Probe)));
    });
    await flush();
  }

  try {
    await render();
  } catch (error) {
    act(() => root.unmount());
    container.remove();
    throw error;
  }

  return {
    latest,
    rerender: render,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function requireCards(latest: {
  cards: ReturnType<TerminalSessionsModule["useTerminalSessionCards"]> | null;
}): ReturnType<TerminalSessionsModule["useTerminalSessionCards"]> {
  if (!latest.cards) throw new Error("expected terminal session cards API");
  return latest.cards;
}

function requireFeatureOps(latest: {
  featureOps: ReturnType<TerminalSessionsModule["useTerminalSessions"]> | null;
}): ReturnType<TerminalSessionsModule["useTerminalSessions"]> {
  if (!latest.featureOps) throw new Error("expected feature worktree ops");
  return latest.featureOps;
}

describe("TerminalSessionsProvider on-demand cards", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    cleanup = null;
    reposRef.current = [repo];
    worktreesByRepoRef.current = new Map<number, Worktree[]>([
      [1, [mainWorktree, featureWorktree, otherWorktree]],
    ]);
    activeIdRef.current = null;
    window.api = apiMock;
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup?.();
  });

  it("does not create terminals just because worktrees exist", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;
    const cards = requireCards(mounted.latest);

    expect(cards.getOpenCards(1)).toEqual([]);
    expect(spawnPtyForEntryMock).not.toHaveBeenCalled();
    expect(window.api.pane.load).not.toHaveBeenCalled();
  });

  it("opens a closed worktree with one new terminal and focuses it", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;
    const cards = requireCards(mounted.latest);

    await act(async () => {
      cards.openOrFocus(1, featureWorktree.path);
    });
    await flush();

    expect(cards.getOpenCards(1)).toEqual([featureWorktree.path]);
    expect(cards.isOpen(1, featureWorktree.path)).toBe(true);
    expect(requireFeatureOps(mounted.latest).tree?.kind).toBe("leaf");
    expect(spawnPtyForEntryMock).toHaveBeenCalledTimes(1);
    expect(setActiveMock).toHaveBeenCalledWith(featureWorktree.path);
    expect(window.api.pane.load).not.toHaveBeenCalled();
  });

  it("focuses an already-open worktree without creating a duplicate card", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;
    const cards = requireCards(mounted.latest);

    await act(async () => {
      cards.openOrFocus(1, featureWorktree.path);
      cards.openOrFocus(1, featureWorktree.path);
    });
    await flush();

    expect(cards.getOpenCards(1)).toEqual([featureWorktree.path]);
    expect(cards.isOpen(1, featureWorktree.path)).toBe(true);
    expect(spawnPtyForEntryMock).toHaveBeenCalledTimes(1);
    expect(setActiveMock).toHaveBeenCalledWith(featureWorktree.path);
    expect(window.api.pane.load).not.toHaveBeenCalled();
  });

  it("does not open a terminal for a stale worktree path", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;
    const cards = requireCards(mounted.latest);

    await act(async () => {
      cards.openOrFocus(1, "/repo/worktrees/missing");
    });
    await flush();

    expect(cards.getOpenCards(1)).toEqual([]);
    expect(cards.isOpen(1, "/repo/worktrees/missing")).toBe(false);
    expect(spawnPtyForEntryMock).not.toHaveBeenCalled();
    expect(setActiveMock).not.toHaveBeenCalled();
    expect(window.api.pane.load).not.toHaveBeenCalled();
  });

  it("focuses a neighboring card when the active card closes", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;
    const cards = requireCards(mounted.latest);

    await act(async () => {
      cards.openOrFocus(1, featureWorktree.path);
      cards.openOrFocus(1, otherWorktree.path);
    });
    await flush();
    setActiveMock.mockClear();

    await act(async () => {
      cards.closeCard(1, otherWorktree.path);
    });
    await flush();

    expect(cards.getOpenCards(1)).toEqual([featureWorktree.path]);
    expect(cards.isOpen(1, otherWorktree.path)).toBe(false);
    expect(setActiveMock).toHaveBeenCalledWith(featureWorktree.path);
    expect(disposeLeafEntryMock).toHaveBeenCalledTimes(1);
  });

  it("closes only the focused leaf when the card has multiple leaves", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;
    const cards = requireCards(mounted.latest);

    await act(async () => {
      cards.openOrFocus(1, featureWorktree.path);
    });
    await flush();

    const featureOps = requireFeatureOps(mounted.latest);
    const firstTree = featureOps.tree;
    if (!firstTree) throw new Error("expected open tree");
    const firstId = findLeafIds(firstTree)[0]!;
    let secondId: string | null = null;

    await act(async () => {
      secondId = featureOps.split(firstId, "vertical");
    });
    await flush();
    if (!secondId) throw new Error("expected split id");

    await act(async () => {
      requireFeatureOps(mounted.latest).closeCurrent(secondId);
    });
    await flush();

    expect(cards.getOpenCards(1)).toEqual([featureWorktree.path]);
    expect(cards.isOpen(1, featureWorktree.path)).toBe(true);
    expect(findLeafIds(requireFeatureOps(mounted.latest).tree!)).toHaveLength(1);
    expect(disposeLeafEntryMock).toHaveBeenCalledTimes(1);
  });

  it("closes the whole card when closeCurrent is called with one leaf", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;
    const cards = requireCards(mounted.latest);

    await act(async () => {
      cards.openOrFocus(1, featureWorktree.path);
    });
    await flush();

    const tree = requireFeatureOps(mounted.latest).tree;
    if (!tree) throw new Error("expected open tree");
    const leafId = findLeafIds(tree)[0]!;

    await act(async () => {
      requireFeatureOps(mounted.latest).closeCurrent(leafId);
    });
    await flush();

    expect(cards.getOpenCards(1)).toEqual([]);
    expect(cards.isOpen(1, featureWorktree.path)).toBe(false);
    expect(requireFeatureOps(mounted.latest).tree).toBeNull();
    expect(disposeLeafEntryMock).toHaveBeenCalledTimes(1);
  });

  it("cleans up a delayed spawn when the card closes before spawn resolves", async () => {
    let resolveSpawn: ((value: { ok: true; id: string }) => void) | null = null;
    let spawnedEntry: { ptyId: string | null } | null = null;
    spawnPtyForEntryMock.mockImplementationOnce(
      async (entry: { ptyId: string | null }, _cwd: string) => {
        spawnedEntry = entry;
        return await new Promise<{ ok: true; id: string }>((resolve) => {
          resolveSpawn = (value) => {
            entry.ptyId = value.id;
            resolve(value);
          };
        });
      }
    );

    const mounted = await mountProvider();
    cleanup = mounted.unmount;
    const cards = requireCards(mounted.latest);

    await act(async () => {
      cards.openOrFocus(1, featureWorktree.path);
    });
    await flush();

    await act(async () => {
      cards.closeCard(1, featureWorktree.path);
    });
    await flush();

    expect(disposeLeafEntryMock).toHaveBeenCalledTimes(1);
    expect(disposePtyForEntryMock).not.toHaveBeenCalled();
    if (!resolveSpawn) throw new Error("expected pending spawn");
    if (!spawnedEntry) throw new Error("expected spawned entry");
    const finishSpawn = resolveSpawn as (value: { ok: true; id: string }) => void;
    const entry = spawnedEntry as { ptyId: string | null };

    await act(async () => {
      finishSpawn({ ok: true, id: "pty-delayed" });
    });
    await flush();

    expect(disposePtyForEntryMock).toHaveBeenCalledTimes(1);
    expect(disposePtyForEntryMock).toHaveBeenCalledWith(entry);
  });

  it("disposes an open card when its worktree disappears", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;
    const cards = requireCards(mounted.latest);

    await act(async () => {
      cards.openOrFocus(1, featureWorktree.path);
    });
    await flush();

    worktreesByRepoRef.current = new Map<number, Worktree[]>([[1, [mainWorktree, otherWorktree]]]);
    await mounted.rerender();

    expect(cards.getOpenCards(1)).toEqual([]);
    expect(cards.isOpen(1, featureWorktree.path)).toBe(false);
    expect(requireFeatureOps(mounted.latest).tree).toBeNull();
    expect(disposeLeafEntryMock).toHaveBeenCalledTimes(1);
  });

  it("skips disappearing cards when focusing a neighbor during stale cleanup", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;
    const cards = requireCards(mounted.latest);

    await act(async () => {
      cards.openOrFocus(1, featureWorktree.path);
      cards.openOrFocus(1, otherWorktree.path);
      cards.openOrFocus(1, mainWorktree.path);
      cards.openOrFocus(1, featureWorktree.path);
    });
    await flush();

    expect(cards.getOpenCards(1)).toEqual([
      featureWorktree.path,
      otherWorktree.path,
      mainWorktree.path,
    ]);
    setActiveMock.mockClear();

    worktreesByRepoRef.current = new Map<number, Worktree[]>([[1, [mainWorktree]]]);
    await mounted.rerender();

    expect(cards.getOpenCards(1)).toEqual([mainWorktree.path]);
    expect(setActiveMock).toHaveBeenCalledTimes(1);
    expect(setActiveMock).toHaveBeenCalledWith(mainWorktree.path);
    expect(disposeLeafEntryMock).toHaveBeenCalledTimes(2);
  });
});
