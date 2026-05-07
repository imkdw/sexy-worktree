// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, type ComponentType, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { RepoRow, Worktree } from "@shared/ipc";
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

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mountRail(): Promise<{ unmount: () => void }> {
  vi.resetModules();
  window.api = makeApi();

  const [
    { TooltipProvider },
    { ToastProvider },
    { ReposProvider },
    { WorktreesProvider },
    { SelectModeProvider },
    { Rail },
  ] = await Promise.all([
    import("@renderer/ui"),
    import("@renderer/state/toast"),
    import("@renderer/state/repos"),
    import("@renderer/state/worktrees"),
    import("@renderer/state/selectMode"),
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
              SelectModeProvider as ComponentType<{ children: ReactNode }>,
              null,
              createElement(Rail)
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

describe("Rail", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    installLocalStorage();
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
});
