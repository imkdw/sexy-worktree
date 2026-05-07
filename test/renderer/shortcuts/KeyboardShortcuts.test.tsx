// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Worktree } from "@shared/ipc";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const toggleMock = vi.fn();
const openRepoMock = vi.fn();
const setActiveMock = vi.fn();
const openOrFocusMock = vi.fn();

const worktrees: Worktree[] = [
  { path: "/repo", branch: "main", head: "abc", isMain: true },
  { path: "/repo/wt-a", branch: "feature/a", head: "def", isMain: false },
];

async function mountKeyboardShortcuts(): Promise<{ unmount: () => void }> {
  vi.resetModules();
  vi.doMock("@renderer/state/mode", () => ({
    useMode: () => ({ toggle: toggleMock }),
  }));
  vi.doMock("@renderer/state/repos", () => ({
    useRepos: () => ({ activeRepoId: 1, openRepo: openRepoMock }),
  }));
  vi.doMock("@renderer/state/worktrees", () => ({
    worktreeId: (wt: Pick<Worktree, "path">) => wt.path,
    useWorktrees: () => ({
      worktrees,
      activeId: "/repo",
      setActive: setActiveMock,
    }),
  }));
  vi.doMock("@renderer/state/terminalSessions", () => ({
    useTerminalSessionCards: () => ({
      openOrFocus: openOrFocusMock,
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

function dispatchShortcut(key: "[" | "]"): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, metaKey: true, shiftKey: true }));
}

describe("KeyboardShortcuts", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    toggleMock.mockReset();
    openRepoMock.mockReset();
    setActiveMock.mockReset();
    openOrFocusMock.mockReset();
    cleanup = null;
  });

  afterEach(() => {
    cleanup?.();
    vi.restoreAllMocks();
  });

  it("opens and focuses the next worktree terminal card", async () => {
    const mounted = await mountKeyboardShortcuts();
    cleanup = mounted.unmount;

    dispatchShortcut("]");

    expect(setActiveMock).toHaveBeenCalledWith("/repo/wt-a");
    expect(openOrFocusMock).toHaveBeenCalledWith(1, "/repo/wt-a");
  });

  it("opens and focuses the previous worktree terminal card with two-item wraparound", async () => {
    const mounted = await mountKeyboardShortcuts();
    cleanup = mounted.unmount;

    dispatchShortcut("[");

    expect(setActiveMock).toHaveBeenCalledWith("/repo/wt-a");
    expect(openOrFocusMock).toHaveBeenCalledWith(1, "/repo/wt-a");
  });
});
