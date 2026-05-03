// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, type ComponentType, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Worktree } from "@shared/ipc";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const selectedWorktree = "/repo/worktrees/feature";

const worktrees: Worktree[] = [
  {
    path: "/repo",
    branch: "develop",
    head: "abc123",
    isMain: true,
  },
  {
    path: selectedWorktree,
    branch: "feature/delete-me",
    head: "def456",
    isMain: false,
  },
];

async function mountToolbar(): Promise<{ unmount: () => void }> {
  vi.resetModules();
  vi.doMock("@renderer/state/selectMode", () => ({
    useSelectMode: () => ({
      enabled: true,
      selected: new Set([selectedWorktree]),
      lastToggledId: selectedWorktree,
      enter: vi.fn(),
      exit: vi.fn(),
      toggle: vi.fn(),
      toggleRangeTo: vi.fn(),
      clearSelected: vi.fn(),
      selectAll: vi.fn(),
      toggleAll: vi.fn(),
    }),
  }));
  vi.doMock("@renderer/state/worktrees", () => ({
    useWorktrees: () => ({
      worktreesByRepo: new Map(),
      worktrees,
      activeId: selectedWorktree,
      setActive: vi.fn(),
      refresh: vi.fn(),
      refreshRepo: vi.fn(),
    }),
  }));

  const [{ TooltipProvider }, { Toolbar }] = await Promise.all([
    import("@renderer/ui"),
    import("@renderer/chrome/Toolbar"),
  ]);

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(
      createElement(
        TooltipProvider as ComponentType<{ children: ReactNode }>,
        null,
        createElement(Toolbar, {
          repoPath: "/repo",
          worktreeCount: worktrees.length,
          mode: "overview",
        })
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

describe("Toolbar", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    cleanup = null;
  });

  afterEach(() => {
    cleanup?.();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("renders the force delete action with destructive red treatment", async () => {
    const mounted = await mountToolbar();
    cleanup = mounted.unmount;

    const forceDelete = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Force delete selected worktrees"]'
    );

    expect(forceDelete).toBeTruthy();
    expect(forceDelete?.className).toContain("border-destructive");
    expect(forceDelete?.className).toContain("text-destructive");
    expect(forceDelete?.className).toContain("hover:bg-destructive");
    expect(forceDelete?.className).toContain("hover:text-background");
  });
});
