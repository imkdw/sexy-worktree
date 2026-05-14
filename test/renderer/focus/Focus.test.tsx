// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Worktree } from "@shared/ipc";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let activeRepoId: number | null = 1;
let activeId: string | null = "/repo";
let openPaths = new Set<string>(["/repo"]);
let terminalPanePercent = 50;
let isResizingFocusPanes = false;
const setActive = vi.fn();
const openOrFocus = vi.fn();
const startFocusPaneResize = vi.fn();

const worktrees: Worktree[] = [
  { path: "/repo", branch: "main", head: "abc", isMain: true },
  { path: "/repo/wt-a", branch: "feature/a", head: "def", isMain: false },
];

async function mountFocus(): Promise<{ container: HTMLElement; unmount: () => void }> {
  vi.resetModules();
  vi.doMock("@renderer/state/repos", () => ({
    useRepos: () => ({ activeRepoId }),
  }));
  vi.doMock("@renderer/state/worktrees", () => ({
    useWorktrees: () => ({
      worktrees,
      activeId,
      setActive,
    }),
  }));
  vi.doMock("@renderer/state/terminalSessions", () => ({
    useTerminalSessionCards: () => ({
      isOpen: (_repoId: number, worktreePath: string) => openPaths.has(worktreePath),
      getOpenCards: vi.fn(),
      openOrFocus,
      closeCard: vi.fn(),
    }),
  }));
  vi.doMock("@renderer/state/focusWorkbench", () => ({
    useFocusWorkbench: () => ({
      terminalPanePercent,
      isResizingFocusPanes,
      startFocusPaneResize,
    }),
  }));
  vi.doMock("@renderer/card/Card", () => ({
    Card: ({ branch }: { branch: string }) => createElement("section", null, branch),
  }));
  vi.doMock("@renderer/focus/FocusWorkbench", () => ({
    FocusWorkbench: () => createElement("section", null, "focus workbench"),
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
    activeId = "/repo";
    openPaths = new Set(["/repo"]);
    terminalPanePercent = 50;
    isResizingFocusPanes = false;
    setActive.mockClear();
    openOrFocus.mockClear();
    startFocusPaneResize.mockClear();
    cleanup = null;
  });

  afterEach(() => {
    cleanup?.();
    vi.restoreAllMocks();
  });

  it("renders the active open terminal card", async () => {
    const mounted = await mountFocus();
    cleanup = mounted.unmount;

    const root = mounted.container.firstElementChild as HTMLElement | null;
    expect(root?.className).toContain("flex-row");

    const panes = Array.from(mounted.container.querySelectorAll("section")).map(
      (section) => section.textContent
    );
    expect(panes).toEqual(["main", "focus workbench"]);
    expect(mounted.container.querySelector('[aria-label="Resize focus panes"]')).toBeTruthy();
    expect(mounted.container.textContent).toContain("main");
    expect(mounted.container.textContent).toContain("focus workbench");
    expect(mounted.container.textContent).not.toContain("No terminal selected");
  });

  it("keeps the workbench visible and offers to open a terminal when active worktree is not open", async () => {
    openPaths = new Set(["/repo/wt-a"]);
    const mounted = await mountFocus();
    cleanup = mounted.unmount;

    expect(mounted.container.textContent).toContain("focus workbench");
    expect(mounted.container.textContent).toContain("Terminal is closed");
    expect(mounted.container.textContent).toContain("Open Terminal");
    expect(mounted.container.textContent).not.toContain("main");

    const button = mounted.container.querySelector("button");
    await act(async () => {
      button?.click();
    });
    expect(openOrFocus).toHaveBeenCalledWith(1, "/repo");
  });

  it("shows worktree empty state when there is no active worktree", async () => {
    activeId = "/repo/missing";
    const mounted = await mountFocus();
    cleanup = mounted.unmount;

    expect(mounted.container.textContent).toContain("No worktree selected.");
    expect(mounted.container.textContent).not.toContain("main");
    expect(mounted.container.textContent).not.toContain("feature/a");
  });

  it("sizes the focus panes from focus workbench state and starts split dragging", async () => {
    terminalPanePercent = 62;
    const mounted = await mountFocus();
    cleanup = mounted.unmount;

    const terminalPane = mounted.container.querySelector<HTMLElement>(
      '[data-focus-pane="terminal"]'
    );
    const workbenchPane = mounted.container.querySelector<HTMLElement>(
      '[data-focus-pane="workbench"]'
    );
    const separator = mounted.container.querySelector<HTMLElement>(
      '[aria-label="Resize focus panes"]'
    );

    expect(terminalPane?.style.flexBasis).toBe("62%");
    expect(workbenchPane?.style.flexBasis).toBe("38%");
    expect(separator?.getAttribute("aria-valuenow")).toBe("62");

    await act(async () => {
      separator?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 400 }));
    });
    expect(startFocusPaneResize).toHaveBeenCalledTimes(1);
  });
});
