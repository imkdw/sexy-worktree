# On-Demand Terminal Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change terminal cards from automatic per-worktree cards to on-demand cards opened from the left rail.

**Architecture:** Keep `WorktreesProvider` as the source of truth for actual git worktrees and add renderer-only open-card state to `TerminalSessionsProvider`. `Grid`, `Focus`, `Rail`, `Card`, and keyboard shortcuts use this open-card API so unopened worktrees do not create pane trees, xterm instances, or PTYs.

**Tech Stack:** Electron renderer, React 19 context, TypeScript strict mode, xterm.js lifecycle wrappers, Tailwind v4 design tokens, lucide-react, Vitest jsdom renderer tests.

**Project Rule:** Do not create branches or commits unless the user explicitly asks. This plan intentionally has verification checkpoints instead of commit steps.

---

## File Structure

- Modify `src/renderer/state/terminalSessions.tsx`
  - Adds open terminal card state and API.
  - Removes automatic pane tree load/spawn for every worktree.
  - Adds `closeCurrent` so `Cmd+W` and the header `X` close one pane or the whole card according to leaf count.
- Create `test/renderer/state/terminalSessions.test.tsx`
  - Covers open-or-focus, no auto-spawn, duplicate prevention, close-current behavior, and stale worktree cleanup.
- Create `src/renderer/empty/NoTerminal.tsx`
  - Terminal-specific empty state for overview and focus.
- Modify `src/renderer/grid/Grid.tsx`
  - Renders open terminal cards instead of all worktrees.
  - Keeps provisioning cards.
  - Shows `NoTerminal` when worktrees exist but no terminals are open.
- Modify `test/renderer/grid/Grid.test.tsx`
  - Updates density tests to use open cards.
  - Adds open-card and terminal-empty coverage.
- Modify `src/renderer/focus/Focus.tsx`
  - Renders only the active open terminal card.
  - Shows `NoTerminal` when the active worktree is closed.
- Create `test/renderer/focus/Focus.test.tsx`
  - Covers active open card and terminal-empty states.
- Modify `src/renderer/chrome/Rail.tsx`
  - Normal rail clicks set active worktree and call `openOrFocus`.
  - Selection-mode clicks keep delete-selection behavior and do not open terminals.
- Modify `test/renderer/chrome/Rail.test.tsx`
  - Adds rail click coverage for open-or-focus and selection mode.
- Modify `src/renderer/card/Card.tsx`
  - Uses `WorktreeOps.closeCurrent(focusedId)` for the header `X` and `Cmd+W` path.
- Modify `test/renderer/card/Card.test.tsx`
  - Updates `WorktreeOps` test mocks and asserts close action dispatches through `closeCurrent`.
- Modify `src/renderer/shortcuts/KeyboardShortcuts.tsx`
  - Previous/next worktree shortcuts open or focus the selected target terminal card.
- Create `test/renderer/shortcuts/KeyboardShortcuts.test.tsx`
  - Covers previous/next worktree shortcuts calling the terminal open API.

---

### Task 1: TerminalSessions Open-Card API Tests

**Files:**

- Create: `test/renderer/state/terminalSessions.test.tsx`

- [ ] **Step 1: Write failing provider tests**

Create `test/renderer/state/terminalSessions.test.tsx`:

```tsx
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
  vi.resetModules();
  window.api = makeApi();

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

  const module = await import("@renderer/state/terminalSessions");
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
      root.render(
        createElement(module.TerminalSessionsProvider, null, createElement(Probe))
      );
    });
    await flush();
  }

  await render();

  return {
    latest,
    rerender: render,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
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
    setActiveMock.mockClear();
    spawnPtyForEntryMock.mockClear();
    disposeLeafEntryMock.mockClear();
    disposePtyForEntryMock.mockClear();
  });

  afterEach(() => {
    cleanup?.();
    vi.doUnmock("@renderer/state/repos");
    vi.doUnmock("@renderer/state/worktrees");
    vi.doUnmock("@renderer/terminal/Terminal");
    vi.restoreAllMocks();
  });

  it("does not create terminals just because worktrees exist", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    expect(mounted.latest.cards?.getOpenCards(1)).toEqual([]);
    expect(spawnPtyForEntryMock).not.toHaveBeenCalled();
    expect(window.api.pane.load).not.toHaveBeenCalled();
  });

  it("opens a closed worktree with one new terminal and focuses it", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    await act(async () => {
      mounted.latest.cards?.openOrFocus(1, featureWorktree.path);
    });
    await flush();

    expect(mounted.latest.cards?.getOpenCards(1)).toEqual([featureWorktree.path]);
    expect(mounted.latest.featureOps?.tree?.kind).toBe("leaf");
    expect(spawnPtyForEntryMock).toHaveBeenCalledTimes(1);
    expect(setActiveMock).toHaveBeenCalledWith(featureWorktree.path);
  });

  it("focuses an already-open worktree without creating a duplicate card", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    await act(async () => {
      mounted.latest.cards?.openOrFocus(1, featureWorktree.path);
      mounted.latest.cards?.openOrFocus(1, featureWorktree.path);
    });
    await flush();

    expect(mounted.latest.cards?.getOpenCards(1)).toEqual([featureWorktree.path]);
    expect(spawnPtyForEntryMock).toHaveBeenCalledTimes(1);
    expect(setActiveMock).toHaveBeenCalledWith(featureWorktree.path);
  });

  it("does not open a terminal for a stale worktree path", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    await act(async () => {
      mounted.latest.cards?.openOrFocus(1, "/repo/worktrees/missing");
    });
    await flush();

    expect(mounted.latest.cards?.getOpenCards(1)).toEqual([]);
    expect(spawnPtyForEntryMock).not.toHaveBeenCalled();
    expect(setActiveMock).not.toHaveBeenCalled();
  });

  it("focuses a neighboring card when the active card closes", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    await act(async () => {
      mounted.latest.cards?.openOrFocus(1, featureWorktree.path);
      mounted.latest.cards?.openOrFocus(1, otherWorktree.path);
    });
    await flush();
    setActiveMock.mockClear();

    await act(async () => {
      mounted.latest.cards?.closeCard(1, otherWorktree.path);
    });
    await flush();

    expect(mounted.latest.cards?.getOpenCards(1)).toEqual([featureWorktree.path]);
    expect(setActiveMock).toHaveBeenCalledWith(featureWorktree.path);
  });

  it("closes only the focused leaf when the card has multiple leaves", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    await act(async () => {
      mounted.latest.cards?.openOrFocus(1, featureWorktree.path);
    });
    await flush();

    const firstTree = mounted.latest.featureOps?.tree;
    if (!firstTree) throw new Error("expected open tree");
    const firstId = findLeafIds(firstTree)[0]!;
    let secondId: string | null = null;

    await act(async () => {
      secondId = mounted.latest.featureOps?.split(firstId, "vertical") ?? null;
    });
    await flush();
    if (!secondId) throw new Error("expected split id");

    await act(async () => {
      mounted.latest.featureOps?.closeCurrent(secondId);
    });
    await flush();

    expect(mounted.latest.cards?.getOpenCards(1)).toEqual([featureWorktree.path]);
    expect(findLeafIds(mounted.latest.featureOps!.tree!)).toHaveLength(1);
    expect(disposeLeafEntryMock).toHaveBeenCalledTimes(1);
  });

  it("closes the whole card when closeCurrent is called with one leaf", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    await act(async () => {
      mounted.latest.cards?.openOrFocus(1, featureWorktree.path);
    });
    await flush();

    const tree = mounted.latest.featureOps?.tree;
    if (!tree) throw new Error("expected open tree");
    const leafId = findLeafIds(tree)[0]!;

    await act(async () => {
      mounted.latest.featureOps?.closeCurrent(leafId);
    });
    await flush();

    expect(mounted.latest.cards?.getOpenCards(1)).toEqual([]);
    expect(mounted.latest.featureOps?.tree).toBeNull();
    expect(disposeLeafEntryMock).toHaveBeenCalledTimes(1);
  });

  it("disposes an open card when its worktree disappears", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    await act(async () => {
      mounted.latest.cards?.openOrFocus(1, featureWorktree.path);
    });
    await flush();

    worktreesByRepoRef.current = new Map<number, Worktree[]>([[1, [mainWorktree, otherWorktree]]]);
    await mounted.rerender();

    expect(mounted.latest.cards?.getOpenCards(1)).toEqual([]);
    expect(mounted.latest.featureOps?.tree).toBeNull();
    expect(disposeLeafEntryMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the new provider tests and confirm they fail**

Run:

```bash
pnpm vitest run test/renderer/state/terminalSessions.test.tsx
```

Expected: FAIL because `useTerminalSessionCards` and `WorktreeOps.closeCurrent` do not exist, and existing provider behavior auto-loads pane trees for all worktrees.

---

### Task 2: Implement TerminalSessions Open-Card State

**Files:**

- Modify: `src/renderer/state/terminalSessions.tsx`
- Test: `test/renderer/state/terminalSessions.test.tsx`

- [ ] **Step 1: Add the public open-card API types**

In `src/renderer/state/terminalSessions.tsx`, change `WorktreeOps` and `SessionsCtxValue` to this shape:

```ts
export type WorktreeOps = {
  tree: PaneNode | null;
  getEntry: (leafId: string) => LeafEntry | null;
  getExit: (leafId: string) => LeafExit | null;
  split: (focusedId: string, orientation: "horizontal" | "vertical") => string | null;
  closePane: (leafId: string) => void;
  closeCurrent: (leafId: string | null) => void;
  resize: (path: number[], sizes: [number, number]) => void;
  newPane: () => string;
  updateLeafCommand: (leafId: string, cmd: string) => void;
  restart: (leafId: string) => void;
  getFirstPtyId: () => string | null;
};

export type TerminalCardsOps = {
  openOrFocus: (repoId: number, worktreePath: string) => void;
  closeCard: (repoId: number, worktreePath: string) => void;
  isOpen: (repoId: number, worktreePath: string) => boolean;
  getOpenCards: (repoId: number) => string[];
};

type SessionsCtxValue = TerminalCardsOps & {
  getOps: (repoId: number, worktreePath: string) => WorktreeOps;
};
```

- [ ] **Step 2: Read active worktree setter and add open-card refs**

Replace the current worktree hook line:

```ts
  const { worktreesByRepo } = useWorktrees();
```

with:

```ts
  const { worktreesByRepo, activeId, setActive } = useWorktrees();
```

Replace the current `isWorktreeAlive` helper with this stable callback:

```ts
  const isWorktreeAlive = useCallback((repoId: number, worktreePath: string): boolean => {
    const list = worktreesByRepoRef.current.get(repoId);
    return !!list?.some((w) => w.path === worktreePath);
  }, []);
```

After `const worktreesByRepoRef = useRef(worktreesByRepo);`, add:

```ts
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
```

After `const loadingTreesRef = useRef<Set<WorktreeKey>>(new Set());`, add:

```ts
  const openCardsByRepoRef = useRef<Map<number, string[]>>(new Map());
```

- [ ] **Step 3: Make worktree disposal resource-only**

Keep the existing `disposeWorktree` name, but ensure it only disposes resources for a worktree and does not try to update active selection. Replace the body with:

```ts
    (repoId: number, worktreePath: string): void => {
      const wk = wkey(repoId, worktreePath);
      const tree = paneTreesRef.current.get(wk);
      if (tree) {
        for (const leafId of findLeafIds(tree)) {
          const lk = lkey(repoId, worktreePath, leafId);
          const entry = entriesRef.current.get(lk);
          if (entry) disposeLeafEntry(entry);
          entriesRef.current.delete(lk);
          exitInfoRef.current.delete(lk);
        }
      }
      paneTreesRef.current.delete(wk);
      firstLeafIdsRef.current.delete(wk);
      const t = saveTimersRef.current.get(wk);
      if (t) clearTimeout(t);
      saveTimersRef.current.delete(wk);
      loadingTreesRef.current.delete(wk);
      triggerRender();
    },
```

In `disposeRepo`, add `openCardsByRepoRef.current.delete(repoId);` before the loop exits:

```ts
    (repoId: number): void => {
      for (const key of [...paneTreesRef.current.keys()]) {
        if (key.startsWith(`${repoId}:`)) {
          const wtPath = key.slice(`${repoId}:`.length);
          disposeWorktree(repoId, wtPath);
        }
      }
      openCardsByRepoRef.current.delete(repoId);
      triggerRender();
    },
```

Set the `disposeRepo` dependency array to:

```ts
    [disposeWorktree, triggerRender]
```

- [ ] **Step 4: Add open-card operations**

Add these callbacks after `disposeRepo` and before `setTreeAndDiff`:

```ts
  const closeCardImpl = useCallback(
    (repoId: number, worktreePath: string): void => {
      const current = openCardsByRepoRef.current.get(repoId) ?? [];
      const removedIndex = current.indexOf(worktreePath);
      const next = current.filter((path) => path !== worktreePath);

      if (next.length > 0) openCardsByRepoRef.current.set(repoId, next);
      else openCardsByRepoRef.current.delete(repoId);

      disposeWorktree(repoId, worktreePath);

      if (removedIndex >= 0 && activeIdRef.current === worktreePath) {
        const nextActive = next[removedIndex] ?? next[removedIndex - 1] ?? null;
        if (nextActive) setActive(nextActive);
      }

      triggerRender();
    },
    [disposeWorktree, setActive, triggerRender]
  );
```

Add this callback after `setTreeAndDiff`:

```ts
  const openOrFocusImpl = useCallback(
    (repoId: number, worktreePath: string): void => {
      if (!isWorktreeAlive(repoId, worktreePath)) return;

      const current = openCardsByRepoRef.current.get(repoId) ?? [];
      if (!current.includes(worktreePath)) {
        openCardsByRepoRef.current.set(repoId, [...current, worktreePath]);
        setTreeAndDiff(repoId, worktreePath, newLeaf(newLeafId()));
      } else if (!paneTreesRef.current.get(wkey(repoId, worktreePath))) {
        setTreeAndDiff(repoId, worktreePath, newLeaf(newLeafId()));
      }

      setActive(worktreePath);
      triggerRender();
    },
    [isWorktreeAlive, setActive, setTreeAndDiff, triggerRender]
  );

  const isOpenImpl = useCallback((repoId: number, worktreePath: string): boolean => {
    return (openCardsByRepoRef.current.get(repoId) ?? []).includes(worktreePath);
  }, []);

  const getOpenCardsImpl = useCallback((repoId: number): string[] => {
    return [...(openCardsByRepoRef.current.get(repoId) ?? [])];
  }, []);
```

- [ ] **Step 5: Add closeCurrent behavior**

Add this callback after `closePaneImpl`:

```ts
  const closeCurrentImpl = useCallback(
    (repoId: number, worktreePath: string, leafId: string | null): void => {
      const wk = wkey(repoId, worktreePath);
      const tree = paneTreesRef.current.get(wk);
      if (!tree) return;

      const leafIds = findLeafIds(tree);
      if (leafIds.length <= 1) {
        closeCardImpl(repoId, worktreePath);
        return;
      }

      const targetId = leafId && leafIds.includes(leafId) ? leafId : leafIds[0]!;
      const next = closeLeaf(tree, targetId);
      if (!next) {
        closeCardImpl(repoId, worktreePath);
        return;
      }

      setTreeAndDiff(repoId, worktreePath, next);
      scheduleSave(repoId, worktreePath);
    },
    [closeCardImpl, setTreeAndDiff, scheduleSave]
  );
```

- [ ] **Step 6: Replace automatic worktree spawning with cleanup-only diffing**

Replace the existing `worktreesByRepo diff` effect with this cleanup-only effect:

```ts
  // 2) worktreesByRepo diff: dispose terminal cards for worktrees that disappeared.
  const prevWtKeysRef = useRef<Set<WorktreeKey>>(new Set());
  useEffect(() => {
    const currKeys = new Set<WorktreeKey>();
    for (const [repoId, list] of worktreesByRepo.entries()) {
      for (const wt of list) currKeys.add(wkey(repoId, wt.path));
    }

    for (const key of prevWtKeysRef.current) {
      if (!currKeys.has(key)) {
        const [repoIdStr, ...rest] = key.split(":");
        const repoId = Number(repoIdStr);
        const worktreePath = rest.join(":");
        closeCardImpl(repoId, worktreePath);
      }
    }

    prevWtKeysRef.current = currKeys;
  }, [worktreesByRepo, closeCardImpl]);
```

This removes `api.pane.load` from the open path. `pane:save` can remain for split, resize, close-pane, and command tracking.

- [ ] **Step 7: Add the new operations to `getOps` and provider value**

In the object returned by `getOps`, add:

```ts
        closeCurrent: (leafId) => closeCurrentImpl(repoId, worktreePath, leafId),
```

Add `closeCurrentImpl` to the `getOps` dependency array:

```ts
    [
      splitImpl,
      closePaneImpl,
      closeCurrentImpl,
      resizeImpl,
      newPaneImpl,
      updateLeafCommandInternal,
      restartImpl,
    ]
```

Replace the provider return with:

```tsx
  return (
    <SessionsCtx.Provider
      value={{
        getOps,
        openOrFocus: openOrFocusImpl,
        closeCard: closeCardImpl,
        isOpen: isOpenImpl,
        getOpenCards: getOpenCardsImpl,
      }}
    >
      {children}
    </SessionsCtx.Provider>
  );
```

Add the new hook after `useTerminalSessions`:

```ts
export function useTerminalSessionCards(): TerminalCardsOps {
  const v = useContext(SessionsCtx);
  if (!v) throw new Error("useTerminalSessionCards must be inside <TerminalSessionsProvider>");
  return {
    openOrFocus: v.openOrFocus,
    closeCard: v.closeCard,
    isOpen: v.isOpen,
    getOpenCards: v.getOpenCards,
  };
}
```

- [ ] **Step 8: Run provider tests**

Run:

```bash
pnpm vitest run test/renderer/state/terminalSessions.test.tsx
```

Expected: PASS.

---

### Task 3: Overview Grid Uses Open Cards

**Files:**

- Create: `src/renderer/empty/NoTerminal.tsx`
- Modify: `src/renderer/grid/Grid.tsx`
- Modify: `test/renderer/grid/Grid.test.tsx`

- [ ] **Step 1: Create terminal empty state component**

Create `src/renderer/empty/NoTerminal.tsx`:

```tsx
import { Terminal as TerminalIcon } from "lucide-react";
import { Icon } from "../icons/Icon";

type NoTerminalProps = {
  mode: "overview" | "focus";
};

export function NoTerminal({ mode }: NoTerminalProps): React.JSX.Element {
  const copy =
    mode === "overview"
      ? {
          title: "No terminals open",
          body: "Select a worktree in the rail to open a terminal.",
        }
      : {
          title: "No terminal selected",
          body: "Select a worktree in the rail to open it here.",
        };

  return (
    <div className="mx-auto flex h-full max-w-sm flex-col items-center justify-center gap-3 text-center">
      <Icon icon={TerminalIcon} size={24} />
      <div className="text-xl font-semibold">{copy.title}</div>
      <div className="text-text-secondary text-base">{copy.body}</div>
    </div>
  );
}
```

- [ ] **Step 2: Replace grid test setup**

Replace `test/renderer/grid/Grid.test.tsx` with:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { OverviewGridDensity } from "@shared/overviewGridDensity";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let density: OverviewGridDensity = "2x2";
let activeRepoId: number | null = 1;
let openCards: string[] = ["/repo", "/repo/wt-a"];
let liveJobs: Array<{ id: string; status: string }> = [];
let worktrees = [
  { path: "/repo", branch: "main", head: "abc", isMain: true },
  { path: "/repo/wt-a", branch: "feature/a", head: "def", isMain: false },
];

async function mountGrid(): Promise<{ container: HTMLElement; unmount: () => void }> {
  vi.resetModules();
  vi.doMock("@renderer/state/repos", () => ({
    useRepos: () => ({ activeRepoId }),
  }));
  vi.doMock("@renderer/state/worktrees", () => ({
    worktreeId: (wt: { path: string }) => wt.path,
    useWorktrees: () => ({
      worktrees,
      activeId: "/repo",
      setActive: vi.fn(),
    }),
  }));
  vi.doMock("@renderer/state/terminalSessions", () => ({
    useTerminalSessionCards: () => ({
      getOpenCards: () => openCards,
      openOrFocus: vi.fn(),
      closeCard: vi.fn(),
      isOpen: (_repoId: number, path: string) => openCards.includes(path),
    }),
  }));
  vi.doMock("@renderer/state/newWorktree", () => ({
    useNewWorktreeJobs: () => ({ jobs: liveJobs }),
  }));
  vi.doMock("@renderer/state/overviewGridDensity", () => ({
    useOverviewGridDensity: () => ({ density }),
  }));
  vi.doMock("@renderer/card/Card", () => ({
    Card: ({ branch }: { branch: string }) => createElement("section", null, branch),
  }));
  vi.doMock("@renderer/card/ProvisioningCard", () => ({
    ProvisioningCard: () => createElement("section", null, "job"),
  }));

  const { Grid } = await import("@renderer/grid/Grid");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(createElement(Grid));
  });

  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("Grid", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    density = "2x2";
    activeRepoId = 1;
    openCards = ["/repo", "/repo/wt-a"];
    liveJobs = [];
    worktrees = [
      { path: "/repo", branch: "main", head: "abc", isMain: true },
      { path: "/repo/wt-a", branch: "feature/a", head: "def", isMain: false },
    ];
    cleanup = null;
  });

  afterEach(() => {
    cleanup?.();
    vi.restoreAllMocks();
  });

  it("uses 2-column classes for 2x2 density", async () => {
    const mounted = await mountGrid();
    cleanup = mounted.unmount;

    const grid = mounted.container.firstElementChild as HTMLElement;
    expect(grid.className).toContain("grid-cols-2");
    expect(grid.className).toContain("grid-card-rows-2");
    expect(grid.className).not.toContain("grid-cols-3");
    expect(grid.className).not.toContain("grid-card-rows-3");
  });

  it("uses 3-column classes for 3x3 density", async () => {
    density = "3x3";
    const mounted = await mountGrid();
    cleanup = mounted.unmount;

    const grid = mounted.container.firstElementChild as HTMLElement;
    expect(grid.className).toContain("grid-cols-3");
    expect(grid.className).toContain("grid-card-rows-3");
    expect(grid.className).not.toContain("grid-cols-2");
    expect(grid.className).not.toContain("grid-card-rows-2");
  });

  it("renders only open terminal cards", async () => {
    openCards = ["/repo/wt-a"];
    const mounted = await mountGrid();
    cleanup = mounted.unmount;

    expect(mounted.container.textContent).toContain("feature/a");
    expect(mounted.container.textContent).not.toContain("main");
  });

  it("shows terminal empty state when worktrees exist but no terminal cards are open", async () => {
    openCards = [];
    const mounted = await mountGrid();
    cleanup = mounted.unmount;

    expect(mounted.container.textContent).toContain("No terminals open");
    expect(mounted.container.textContent).toContain(
      "Select a worktree in the rail to open a terminal."
    );
  });

  it("still renders live provisioning cards with no open terminals", async () => {
    openCards = [];
    liveJobs = [{ id: "job-1", status: "running" }];
    const mounted = await mountGrid();
    cleanup = mounted.unmount;

    expect(mounted.container.textContent).toContain("job");
    expect(mounted.container.textContent).not.toContain("No terminals open");
  });

  it("shows repository empty state when there are no worktrees and no jobs", async () => {
    worktrees = [];
    openCards = [];

    const mounted = await mountGrid();
    cleanup = mounted.unmount;

    expect(mounted.container.textContent).toContain("No worktrees in this repository yet.");
  });
});
```

- [ ] **Step 3: Run grid tests and confirm they fail**

Run:

```bash
pnpm vitest run test/renderer/grid/Grid.test.tsx
```

Expected: FAIL because `Grid` still maps over every worktree and `NoTerminal` is not used.

- [ ] **Step 4: Update Grid implementation**

Replace `src/renderer/grid/Grid.tsx` with:

```tsx
import { Card } from "../card/Card";
import { ProvisioningCard } from "../card/ProvisioningCard";
import type { Worktree } from "@shared/ipc";
import { cn } from "../lib/cn";
import { useRepos } from "../state/repos";
import { useWorktrees } from "../state/worktrees";
import { useTerminalSessionCards } from "../state/terminalSessions";
import { useNewWorktreeJobs } from "../state/newWorktree";
import { NoWorktree } from "../empty/NoWorktree";
import { NoTerminal } from "../empty/NoTerminal";
import { useOverviewGridDensity } from "../state/overviewGridDensity";

export function Grid(): React.JSX.Element {
  const { worktrees, activeId, setActive } = useWorktrees();
  const { activeRepoId } = useRepos();
  const { getOpenCards } = useTerminalSessionCards();
  const { jobs } = useNewWorktreeJobs();
  const { density } = useOverviewGridDensity();
  const liveJobs = jobs.filter(
    (j) => j.status === "queued" || j.status === "running" || j.status === "failed"
  );
  if (!activeRepoId)
    return (
      <div className="text-text-faint flex h-full items-center justify-center text-base">
        Open a repository to start.
      </div>
    );

  if (worktrees.length === 0 && liveJobs.length === 0) return <NoWorktree />;

  const worktreeByPath = new Map(worktrees.map((wt) => [wt.path, wt]));
  const openWorktrees = getOpenCards(activeRepoId)
    .map((path) => worktreeByPath.get(path) ?? null)
    .filter((wt): wt is Worktree => wt !== null);

  if (openWorktrees.length === 0 && liveJobs.length === 0) {
    return <NoTerminal mode="overview" />;
  }

  const gridClass = cn(
    "grid gap-3 p-3",
    density === "2x2" ? "grid-card-rows-2 grid-cols-2" : "grid-card-rows-3 grid-cols-3"
  );

  return (
    <div className={gridClass}>
      {openWorktrees.map((wt) => (
        <Card
          key={wt.path}
          repoId={activeRepoId}
          branch={wt.branch ?? "(detached)"}
          cwd={wt.path}
          active={wt.path === activeId}
          onActivate={() => setActive(wt.path)}
        />
      ))}
      {liveJobs.map((job) => (
        <ProvisioningCard key={job.id} job={job} />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run grid tests**

Run:

```bash
pnpm vitest run test/renderer/grid/Grid.test.tsx
```

Expected: PASS.

---

### Task 4: Focus Mode Uses Open Cards

**Files:**

- Modify: `src/renderer/focus/Focus.tsx`
- Create: `test/renderer/focus/Focus.test.tsx`

- [ ] **Step 1: Add focus tests**

Create `test/renderer/focus/Focus.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let activeRepoId: number | null = 1;
let activeId: string | null = "/repo/wt-a";
let openPaths = new Set<string>(["/repo/wt-a"]);

async function mountFocus(): Promise<{ container: HTMLElement; unmount: () => void }> {
  vi.resetModules();
  vi.doMock("@renderer/state/repos", () => ({
    useRepos: () => ({ activeRepoId }),
  }));
  vi.doMock("@renderer/state/worktrees", () => ({
    useWorktrees: () => ({
      worktrees: [
        { path: "/repo", branch: "main", head: "abc", isMain: true },
        { path: "/repo/wt-a", branch: "feature/a", head: "def", isMain: false },
      ],
      activeId,
      setActive: vi.fn(),
    }),
  }));
  vi.doMock("@renderer/state/terminalSessions", () => ({
    useTerminalSessionCards: () => ({
      isOpen: (_repoId: number, path: string) => openPaths.has(path),
      getOpenCards: () => [...openPaths],
      openOrFocus: vi.fn(),
      closeCard: vi.fn(),
    }),
  }));
  vi.doMock("@renderer/card/Card", () => ({
    Card: ({ branch }: { branch: string }) => createElement("section", null, branch),
  }));

  const { Focus } = await import("@renderer/focus/Focus");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(createElement(Focus));
  });

  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("Focus", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    activeRepoId = 1;
    activeId = "/repo/wt-a";
    openPaths = new Set<string>(["/repo/wt-a"]);
    cleanup = null;
  });

  afterEach(() => {
    cleanup?.();
    vi.restoreAllMocks();
  });

  it("renders the active open terminal card", async () => {
    const mounted = await mountFocus();
    cleanup = mounted.unmount;

    expect(mounted.container.textContent).toContain("feature/a");
    expect(mounted.container.textContent).not.toContain("No terminal selected");
  });

  it("shows terminal empty state when the active worktree is not open", async () => {
    openPaths = new Set<string>();
    const mounted = await mountFocus();
    cleanup = mounted.unmount;

    expect(mounted.container.textContent).toContain("No terminal selected");
    expect(mounted.container.textContent).toContain("Select a worktree in the rail to open it here.");
  });

  it("shows terminal empty state when there is no active worktree", async () => {
    activeId = null;
    openPaths = new Set<string>();
    const mounted = await mountFocus();
    cleanup = mounted.unmount;

    expect(mounted.container.textContent).toContain("No terminal selected");
  });
});
```

- [ ] **Step 2: Run focus tests and confirm they fail**

Run:

```bash
pnpm vitest run test/renderer/focus/Focus.test.tsx
```

Expected: FAIL because `Focus` does not check terminal open state.

- [ ] **Step 3: Update Focus implementation**

Replace `src/renderer/focus/Focus.tsx` with:

```tsx
import { Card } from "../card/Card";
import { NoTerminal } from "../empty/NoTerminal";
import { useRepos } from "../state/repos";
import { useTerminalSessionCards } from "../state/terminalSessions";
import { useWorktrees } from "../state/worktrees";

export function Focus(): React.JSX.Element {
  const { activeRepoId } = useRepos();
  const { worktrees, activeId, setActive } = useWorktrees();
  const { isOpen } = useTerminalSessionCards();
  const wt = worktrees.find((w) => w.path === activeId) ?? null;

  if (!activeRepoId) {
    return (
      <div className="text-text-faint flex flex-1 items-center justify-center">
        No worktree selected.
      </div>
    );
  }

  if (!wt || !isOpen(activeRepoId, wt.path)) return <NoTerminal mode="focus" />;

  return (
    <div className="flex h-full p-3">
      <Card
        repoId={activeRepoId}
        branch={wt.branch ?? "(detached)"}
        cwd={wt.path}
        active={true}
        onActivate={() => setActive(wt.path)}
      />
      <div className="border-border-subtle bg-surface/70 text-text-muted pointer-events-none absolute top-[calc(var(--titlebar-h)+var(--tabbar-h)+var(--toolbar-h)+var(--spacing-3))] right-4 rounded-sm border px-2 py-1 text-xs">
        <kbd>⌘.</kbd> Overview
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run focus tests**

Run:

```bash
pnpm vitest run test/renderer/focus/Focus.test.tsx
```

Expected: PASS.

---

### Task 5: Rail Opens Or Focuses Terminal Cards

**Files:**

- Modify: `src/renderer/chrome/Rail.tsx`
- Modify: `test/renderer/chrome/Rail.test.tsx`

- [ ] **Step 1: Add rail open-or-focus tests**

In `test/renderer/chrome/Rail.test.tsx`, add these variables near the existing `worktrees` constant:

```ts
const openOrFocusMock = vi.fn();
const setActiveMock = vi.fn();
let selectionEnabled = false;
```

Add this helper after `mountRail`:

```tsx
async function mountRailWithMocks(): Promise<{ unmount: () => void }> {
  vi.resetModules();
  vi.doMock("@renderer/state/worktrees", () => ({
    worktreeId: (wt: { path: string }) => wt.path,
    useWorktrees: () => ({
      worktrees,
      activeId: worktrees[0]!.path,
      setActive: setActiveMock,
      worktreesByRepo: new Map([[1, worktrees]]),
      refresh: vi.fn(),
      refreshRepo: vi.fn(),
    }),
  }));
  vi.doMock("@renderer/state/repos", () => ({
    useRepos: () => ({ activeRepoId: 1 }),
  }));
  vi.doMock("@renderer/state/selectMode", () => ({
    useSelectMode: () => ({
      enabled: selectionEnabled,
      selected: new Set<string>(),
      lastToggledId: null,
      enter: vi.fn(),
      exit: vi.fn(),
      toggle: vi.fn(),
      toggleRangeTo: vi.fn(),
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
      getOpenCards: vi.fn().mockReturnValue([]),
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
```

Add these tests inside the existing `describe("Rail", () => {` block:

```ts
  it("opens or focuses a terminal card on normal worktree click", async () => {
    selectionEnabled = false;
    const mounted = await mountRailWithMocks();
    cleanup = mounted.unmount;

    const row = [...document.querySelectorAll("div")].find(
      (el) => el.textContent?.trim() === "feature/visible-rail-handle"
    ) as HTMLElement | undefined;
    expect(row).toBeTruthy();

    await act(async () => {
      row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(setActiveMock).toHaveBeenCalledWith("/repo/worktrees/feature");
    expect(openOrFocusMock).toHaveBeenCalledWith(1, "/repo/worktrees/feature");
  });

  it("does not open a terminal card while selection mode is active", async () => {
    selectionEnabled = true;
    const mounted = await mountRailWithMocks();
    cleanup = mounted.unmount;

    const row = [...document.querySelectorAll("div")].find(
      (el) => el.textContent?.trim() === "feature/visible-rail-handle"
    ) as HTMLElement | undefined;
    expect(row).toBeTruthy();

    await act(async () => {
      row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(openOrFocusMock).not.toHaveBeenCalled();
  });
```

Update the existing `beforeEach` in this file to reset new variables:

```ts
    selectionEnabled = false;
    openOrFocusMock.mockClear();
    setActiveMock.mockClear();
```

- [ ] **Step 2: Run rail tests and confirm they fail**

Run:

```bash
pnpm vitest run test/renderer/chrome/Rail.test.tsx
```

Expected: FAIL because `Rail` does not call `openOrFocus`.

- [ ] **Step 3: Update Rail implementation**

In `src/renderer/chrome/Rail.tsx`, add imports:

```ts
import { useRepos } from "../state/repos";
import { useTerminalSessionCards } from "../state/terminalSessions";
```

Inside `Rail`, after the existing state hooks, add:

```ts
  const { activeRepoId } = useRepos();
  const { openOrFocus } = useTerminalSessionCards();
```

Replace the normal click branch:

```ts
                if (!sm.enabled) {
                  setActive(id);
                  return;
                }
```

with:

```ts
                if (!sm.enabled) {
                  setActive(id);
                  if (activeRepoId) openOrFocus(activeRepoId, id);
                  return;
                }
```

- [ ] **Step 4: Run rail tests**

Run:

```bash
pnpm vitest run test/renderer/chrome/Rail.test.tsx
```

Expected: PASS.

---

### Task 6: Card Close Uses closeCurrent

**Files:**

- Modify: `src/renderer/card/Card.tsx`
- Modify: `test/renderer/card/Card.test.tsx`

- [ ] **Step 1: Update Card test mock shape**

In `test/renderer/card/Card.test.tsx`, update `makeOps` so the returned `WorktreeOps` includes `closeCurrent`:

```ts
function makeOps(tree: PaneNode): WorktreeOps {
  return {
    tree,
    getEntry: vi.fn().mockReturnValue(null),
    getExit: vi.fn().mockReturnValue(null),
    split: vi.fn().mockReturnValue(null),
    closePane: vi.fn(),
    closeCurrent: vi.fn(),
    resize: vi.fn(),
    newPane: vi.fn().mockReturnValue("leaf-1"),
    updateLeafCommand: vi.fn(),
    restart: vi.fn(),
    getFirstPtyId: vi.fn().mockReturnValue(null),
  };
}
```

Change `mountCard` to return `ops`:

```ts
async function mountCard(
  active: boolean
): Promise<{ container: HTMLElement; ops: WorktreeOps; unmount: () => void }> {
```

and include it in the returned object:

```ts
    ops,
```

Add this test inside the existing `describe("Card terminal focus", () => {` block:

```ts
  it("routes the header close action through closeCurrent", async () => {
    const mounted = await mountCard(true);
    cleanup = mounted.unmount;

    const closeButton = mounted.container.querySelector<HTMLButtonElement>("header button");
    expect(closeButton).toBeTruthy();

    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mounted.ops.closeCurrent).toHaveBeenCalledWith("leaf-1");
    expect(mounted.ops.closePane).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run Card tests and confirm they fail**

Run:

```bash
pnpm vitest run test/renderer/card/Card.test.tsx
```

Expected: FAIL because `Card` still calls `closePane`.

- [ ] **Step 3: Update Card close handler**

In `src/renderer/card/Card.tsx`, replace:

```ts
  const handleClose = useCallback(() => {
    if (!focusedId) return;
    ops.closePane(focusedId);
  }, [ops, focusedId]);
```

with:

```ts
  const handleClose = useCallback(() => {
    ops.closeCurrent(focusedId);
  }, [ops, focusedId]);
```

Change the tooltip label from:

```tsx
          <Tooltip label="Close pane (⌘W)">
```

to:

```tsx
          <Tooltip label="Close terminal or pane (⌘W)">
```

- [ ] **Step 4: Run Card and provider tests**

Run:

```bash
pnpm vitest run test/renderer/card/Card.test.tsx test/renderer/state/terminalSessions.test.tsx
```

Expected: PASS.

---

### Task 7: Keyboard Worktree Navigation Opens Terminals

**Files:**

- Modify: `src/renderer/shortcuts/KeyboardShortcuts.tsx`
- Create: `test/renderer/shortcuts/KeyboardShortcuts.test.tsx`

- [ ] **Step 1: Add keyboard routing tests**

Create `test/renderer/shortcuts/KeyboardShortcuts.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const openOrFocusMock = vi.fn();
const setActiveMock = vi.fn();

async function mountKeyboardShortcuts(): Promise<{ unmount: () => void }> {
  vi.resetModules();
  vi.doMock("@renderer/state/mode", () => ({
    useMode: () => ({ toggle: vi.fn() }),
  }));
  vi.doMock("@renderer/state/repos", () => ({
    useRepos: () => ({
      activeRepoId: 1,
      openRepo: vi.fn(),
    }),
  }));
  vi.doMock("@renderer/state/worktrees", () => ({
    worktreeId: (wt: { path: string }) => wt.path,
    useWorktrees: () => ({
      worktrees: [
        { path: "/repo", branch: "main", head: "abc", isMain: true },
        { path: "/repo/wt-a", branch: "feature/a", head: "def", isMain: false },
      ],
      activeId: "/repo",
      setActive: setActiveMock,
    }),
  }));
  vi.doMock("@renderer/state/terminalSessions", () => ({
    useTerminalSessionCards: () => ({
      openOrFocus: openOrFocusMock,
      closeCard: vi.fn(),
      isOpen: vi.fn(),
      getOpenCards: vi.fn().mockReturnValue([]),
    }),
  }));

  const { KeyboardShortcuts } = await import("@renderer/shortcuts/KeyboardShortcuts");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(createElement(KeyboardShortcuts));
  });

  return {
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function dispatchShortcut(key: string): void {
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      metaKey: true,
      shiftKey: true,
      bubbles: true,
    })
  );
}

describe("KeyboardShortcuts terminal opening", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    cleanup = null;
    openOrFocusMock.mockClear();
    setActiveMock.mockClear();
  });

  afterEach(() => {
    cleanup?.();
    vi.restoreAllMocks();
  });

  it("opens or focuses the next worktree terminal", async () => {
    const mounted = await mountKeyboardShortcuts();
    cleanup = mounted.unmount;

    await act(async () => {
      dispatchShortcut("]");
    });

    expect(setActiveMock).toHaveBeenCalledWith("/repo/wt-a");
    expect(openOrFocusMock).toHaveBeenCalledWith(1, "/repo/wt-a");
  });

  it("opens or focuses the previous worktree terminal", async () => {
    const mounted = await mountKeyboardShortcuts();
    cleanup = mounted.unmount;

    await act(async () => {
      dispatchShortcut("[");
    });

    expect(setActiveMock).toHaveBeenCalledWith("/repo/wt-a");
    expect(openOrFocusMock).toHaveBeenCalledWith(1, "/repo/wt-a");
  });
});
```

- [ ] **Step 2: Run keyboard tests and confirm they fail**

Run:

```bash
pnpm vitest run test/renderer/shortcuts/KeyboardShortcuts.test.tsx
```

Expected: FAIL because previous/next only update `activeId` and do not call `openOrFocus`.

- [ ] **Step 3: Update keyboard shortcut routing**

In `src/renderer/shortcuts/KeyboardShortcuts.tsx`, add:

```ts
import { useTerminalSessionCards } from "../state/terminalSessions";
```

Inside `KeyboardShortcuts`, add:

```ts
  const { openOrFocus } = useTerminalSessionCards();
```

Replace this block:

```ts
          const target = worktrees[next];
          if (target) setActive(worktreeId(target));
          break;
```

with:

```ts
          const target = worktrees[next];
          if (target) {
            const id = worktreeId(target);
            setActive(id);
            if (activeRepoId) openOrFocus(activeRepoId, id);
          }
          break;
```

Add `openOrFocus` to the effect dependency array:

```ts
  }, [toggleMode, openRepo, activeRepoId, worktrees, activeId, setActive, openOrFocus]);
```

- [ ] **Step 4: Run keyboard tests**

Run:

```bash
pnpm vitest run test/renderer/shortcuts/KeyboardShortcuts.test.tsx test/renderer/shortcuts/shortcutMap.test.ts
```

Expected: PASS.

---

### Task 8: Integrated Renderer Verification

**Files:**

- Verify: all modified renderer files and tests

- [ ] **Step 1: Run focused renderer tests**

Run:

```bash
pnpm vitest run test/renderer/state/terminalSessions.test.tsx test/renderer/grid/Grid.test.tsx test/renderer/focus/Focus.test.tsx test/renderer/chrome/Rail.test.tsx test/renderer/card/Card.test.tsx test/renderer/shortcuts/KeyboardShortcuts.test.tsx test/renderer/shortcuts/shortcutMap.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run all renderer tests**

Run:

```bash
pnpm vitest run test/renderer
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Run full project tests**

Run:

```bash
pnpm test
```

Expected: PASS. This command rebuilds native dependencies for Node, runs Vitest, then rebuilds native dependencies for Electron.

- [ ] **Step 5: Run Electron smoke check**

Run the app:

```bash
pnpm dev
```

Manual behavior to verify in the Electron window:

1. Open a repository with multiple worktrees.
2. Confirm overview starts with no terminal cards open.
3. Click one rail worktree and confirm exactly one terminal card appears.
4. Click the same rail worktree again and confirm no duplicate card appears.
5. Click a second rail worktree and confirm a second card appears in overview.
6. Use `Cmd+W` or the header `X` on a single-pane card and confirm that card disappears.
7. Split a card with `Cmd+D`, then use `Cmd+W` and confirm only the focused pane closes.
8. Switch to focus mode, click rail worktrees, and confirm the current mode does not change.
9. Enter rail selection mode and click worktrees, then confirm no terminal cards open during selection.

Expected: Behavior matches all nine checks.
