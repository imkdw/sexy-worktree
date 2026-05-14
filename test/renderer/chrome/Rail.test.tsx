// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, type ComponentType, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { RepoRow, Worktree, WorktreeFileChange } from "@shared/ipc";
import { ok } from "@shared/result";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type ApiMock = typeof window.api;
type LocalStorageStub = Pick<Storage, "clear" | "getItem" | "removeItem" | "setItem">;

const repo: RepoRow = {
  id: 1,
  path: "/repo",
  name: "repo",
  lastActiveAt: 1,
};

const worktrees: Worktree[] = [
  {
    path: "/repo",
    branch: "develop",
    head: "abc123",
    isMain: true,
  },
  {
    path: "/repo/worktrees/feature",
    branch: "feature/visible-rail-handle",
    head: "def456",
    isMain: false,
  },
];

const openOrFocusMock = vi.fn();
const setActiveMock = vi.fn();
const toggleMock = vi.fn();
const toggleRangeToMock = vi.fn();
const selectDiffMock = vi.fn();
const refreshFocusFilesMock = vi.fn();
let selectionEnabled = false;

function makeApi(): ApiMock {
  return {
    dialog: {
      selectDirectory: vi.fn(),
    },
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
      files: vi.fn().mockResolvedValue(ok({ entries: [] })),
      status: vi.fn().mockResolvedValue(ok({ changes: [] })),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      fileDiff: vi.fn(),
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
      onData: vi.fn(),
      onExit: vi.fn(),
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
      onEvent: vi.fn(),
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

function installLocalStorage(): void {
  const store = new Map<string, string>();
  const localStorageStub: LocalStorageStub = {
    clear: vi.fn(() => {
      store.clear();
    }),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
  };

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: localStorageStub,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: localStorageStub,
  });
}

function installCanvasGetContext(): void {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mountRail(): Promise<{ unmount: () => void }> {
  vi.resetModules();
  vi.doUnmock("@renderer/state/repos");
  vi.doUnmock("@renderer/state/worktrees");
  vi.doUnmock("@renderer/state/selectMode");
  vi.doUnmock("@renderer/state/terminalSessions");
  window.api = makeApi();

  const [
    { TooltipProvider },
    { ToastProvider },
    { ReposProvider },
    { WorktreesProvider },
    { TerminalSessionsProvider },
    { SelectModeProvider },
    { ModeProvider },
    { Rail },
  ] = await Promise.all([
    import("@renderer/ui"),
    import("@renderer/state/toast"),
    import("@renderer/state/repos"),
    import("@renderer/state/worktrees"),
    import("@renderer/state/terminalSessions"),
    import("@renderer/state/selectMode"),
    import("@renderer/state/mode"),
    import("@renderer/chrome/Rail"),
  ]);

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  function App(): React.JSX.Element {
    return createElement(
      TooltipProvider as ComponentType<{ children: ReactNode }>,
      null,
      createElement(
        ToastProvider as ComponentType<{ children: ReactNode }>,
        null,
        createElement(
          ReposProvider as ComponentType<{ children: ReactNode }>,
          null,
          createElement(
            WorktreesProvider as ComponentType<{ children: ReactNode }>,
            null,
            createElement(
              TerminalSessionsProvider as ComponentType<{ children: ReactNode }>,
              null,
              createElement(
                SelectModeProvider as ComponentType<{ children: ReactNode }>,
                null,
                createElement(
                  ModeProvider as ComponentType<{ children: ReactNode }>,
                  null,
                  createElement(Rail)
                )
              )
            )
          )
        )
      )
    );
  }

  await act(async () => {
    root.render(createElement(App));
  });
  await flush();

  return {
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

async function mountRailWithMocks(): Promise<{ unmount: () => void }> {
  vi.resetModules();
  vi.doMock("@renderer/state/repos", () => ({
    useRepos: () => ({
      repos: [repo],
      activeRepoId: repo.id,
      refresh: vi.fn(),
      openRepo: vi.fn(),
      selectRepo: vi.fn(),
      closeRepo: vi.fn(),
    }),
  }));
  vi.doMock("@renderer/state/worktrees", () => ({
    worktreeId: (wt: Worktree) => wt.path,
    useWorktrees: () => ({
      worktreesByRepo: new Map([[repo.id, worktrees]]),
      worktrees,
      activeId: "/repo",
      setActive: setActiveMock,
      refresh: vi.fn(),
      refreshRepo: vi.fn(),
    }),
  }));
  vi.doMock("@renderer/state/selectMode", () => ({
    useSelectMode: () => ({
      enabled: selectionEnabled,
      selected: new Set<string>(),
      lastToggledId: null,
      enter: vi.fn(),
      exit: vi.fn(),
      toggle: toggleMock,
      toggleRangeTo: toggleRangeToMock,
      clearSelected: vi.fn(),
      selectAll: vi.fn(),
      toggleAll: vi.fn(),
    }),
  }));
  vi.doMock("@renderer/state/terminalSessions", () => ({
    useTerminalSessionCards: () => ({
      openOrFocus: openOrFocusMock,
      closeCard: vi.fn(),
      isOpen: vi.fn(),
      getOpenCards: vi.fn(),
    }),
  }));
  vi.doMock("@renderer/state/mode", () => ({
    useMode: () => ({
      mode: "overview",
      setMode: vi.fn(),
      toggle: vi.fn(),
    }),
  }));

  const [{ TooltipProvider }, { Rail }] = await Promise.all([
    import("@renderer/ui"),
    import("@renderer/chrome/Rail"),
  ]);

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(
      createElement(
        TooltipProvider as ComponentType<{ children: ReactNode }>,
        null,
        createElement(Rail)
      )
    );
  });

  return {
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

async function mountFocusRailWithMocks({
  changes = [
    {
      relativePath: "src/App.tsx",
      originalPath: null,
      status: "modified",
      indexStatus: " ",
      workingTreeStatus: "M",
    },
  ],
}: {
  changes?: WorktreeFileChange[];
} = {}): Promise<{ unmount: () => void }> {
  vi.resetModules();
  vi.doMock("@renderer/state/mode", () => ({
    useMode: () => ({
      mode: "focus",
      setMode: vi.fn(),
      toggle: vi.fn(),
    }),
  }));
  vi.doMock("@renderer/state/focusWorkbench", () => ({
    useFocusWorkbench: () => ({
      activeWorktreePath: "/repo",
      changes,
      loading: false,
      error: null,
      selected: null,
      selectDiff: selectDiffMock,
      refresh: refreshFocusFilesMock,
    }),
  }));

  const [{ TooltipProvider }, { Rail }] = await Promise.all([
    import("@renderer/ui"),
    import("@renderer/chrome/Rail"),
  ]);

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(
      createElement(
        TooltipProvider as ComponentType<{ children: ReactNode }>,
        null,
        createElement(Rail)
      )
    );
  });

  return {
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function focusTreeNodeContent(key: string): HTMLElement | null {
  return (
    document
      .querySelector<HTMLElement>(`[data-focus-tree-key="${key}"]`)
      ?.closest<HTMLElement>(".focus-file-tree-node-content-wrapper") ?? null
  );
}

describe("Rail", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    installLocalStorage();
    installCanvasGetContext();
    openOrFocusMock.mockReset();
    setActiveMock.mockReset();
    toggleMock.mockReset();
    toggleRangeToMock.mockReset();
    selectDiffMock.mockReset();
    refreshFocusFilesMock.mockReset();
    selectionEnabled = false;
    cleanup = null;
  });

  afterEach(() => {
    cleanup?.();
    vi.restoreAllMocks();
  });

  it("renders a visible token-based resize affordance at the rail edge", async () => {
    const mounted = await mountRail();
    cleanup = mounted.unmount;

    const separator = document.querySelector<HTMLElement>(
      '[role="separator"][aria-orientation="vertical"]'
    );
    expect(separator).toBeTruthy();
    expect(separator?.getAttribute("aria-label")).toBe("Resize rail");
    expect(separator?.className).toContain("w-2");
    expect(separator?.className).toContain("group");

    const affordanceParts = separator?.querySelectorAll<HTMLElement>('span[aria-hidden="true"]');
    expect(affordanceParts).toHaveLength(2);
    const affordanceClasses = [...(affordanceParts ?? [])].map((part) => part.className);
    expect(affordanceClasses.some((className) => className.includes("bg-border-strong"))).toBe(
      true
    );
    expect(
      affordanceClasses.some((className) => className.includes("group-hover:bg-elevated"))
    ).toBe(true);
  });

  it("opens or focuses the clicked worktree terminal card in normal mode", async () => {
    const mounted = await mountRailWithMocks();
    cleanup = mounted.unmount;

    const featureLabel = [...document.querySelectorAll<HTMLElement>("span")].find(
      (el) => el.textContent === "feature/visible-rail-handle"
    );
    const feature = featureLabel?.closest("div");

    expect(feature).toBeTruthy();
    expect(feature?.textContent).toContain("feature/visible-rail-handle");

    await act(async () => {
      feature?.click();
    });

    expect(setActiveMock).toHaveBeenCalledWith("/repo/worktrees/feature");
    expect(openOrFocusMock).toHaveBeenCalledWith(1, "/repo/worktrees/feature");
  });

  it("does not open terminal cards from selection-mode worktree clicks", async () => {
    selectionEnabled = true;
    const mounted = await mountRailWithMocks();
    cleanup = mounted.unmount;

    const checkbox = document.querySelector<HTMLElement>(
      '[aria-label="Select feature/visible-rail-handle"]'
    );
    const feature = checkbox?.parentElement;

    expect(feature?.textContent).toContain("feature/visible-rail-handle");

    await act(async () => {
      feature?.click();
    });

    expect(toggleMock).toHaveBeenCalledWith("/repo/worktrees/feature");
    expect(openOrFocusMock).not.toHaveBeenCalled();
  });

  it("shows only focus-mode changes instead of worktrees", async () => {
    const mounted = await mountFocusRailWithMocks();
    cleanup = mounted.unmount;

    expect(document.body.textContent).toContain("Changed Code");
    expect(document.body.textContent).toContain("Changes");
    expect(document.body.textContent).toContain("1 changed");
    expect(document.querySelector('[data-focus-tree-key="change-dir:src"]')).toBeTruthy();
    expect(document.querySelector('[data-focus-tree-key="change:src/App.tsx"]')).toBeNull();
    expect(document.querySelector('[data-focus-tree-key="dir:src"]')).toBeNull();
    expect(document.body.textContent).not.toContain("Files");
    expect(document.body.textContent).not.toContain("feature/visible-rail-handle");

    await act(async () => {
      focusTreeNodeContent("change-dir:src")?.click();
    });
    expect(document.querySelector('[data-focus-tree-key="change:src/App.tsx"]')).toBeTruthy();

    await act(async () => {
      focusTreeNodeContent("change:src/App.tsx")?.click();
    });
    expect(selectDiffMock).toHaveBeenCalledWith("src/App.tsx");
  });

  it("virtualizes large focus-mode change lists", async () => {
    const changes: WorktreeFileChange[] = Array.from({ length: 200 }, (_, index) => ({
      relativePath: `src/file-${index}.ts`,
      originalPath: null,
      status: "modified",
      indexStatus: " ",
      workingTreeStatus: "M",
    }));
    const mounted = await mountFocusRailWithMocks({ changes });
    cleanup = mounted.unmount;

    expect(document.body.textContent).toContain("Changes");
    expect(document.querySelector('[data-focus-tree-key="change-dir:src"]')).toBeTruthy();
    expect(document.body.textContent).not.toContain("file-0.ts");

    await act(async () => {
      focusTreeNodeContent("change-dir:src")?.click();
    });

    expect(document.body.textContent).toContain("file-0.ts");
    expect(document.body.textContent).not.toContain("file-199.ts");
    expect(
      document.querySelectorAll('[data-focus-tree-key^="change:src/file-"]').length
    ).toBeLessThan(80);
  });
});
