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
          overviewGridDensity: "2x2",
          onToggleOverviewGridDensity: vi.fn(),
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

async function mountToolbarWithProps(
  props: Partial<{
    mode: "overview" | "focus";
    overviewGridDensity: "2x2" | "3x3";
    onToggleOverviewGridDensity: () => void;
  }>
): Promise<{ unmount: () => void }> {
  vi.resetModules();
  vi.doMock("@renderer/state/selectMode", () => ({
    useSelectMode: () => ({
      enabled: false,
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
          mode: props.mode ?? "overview",
          overviewGridDensity: props.overviewGridDensity ?? "2x2",
          onToggleOverviewGridDensity: props.onToggleOverviewGridDensity ?? vi.fn(),
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

  it("shows an overview density toggle in overview mode", async () => {
    const onToggle = vi.fn();
    const mounted = await mountToolbarWithProps({
      mode: "overview",
      overviewGridDensity: "2x2",
      onToggleOverviewGridDensity: onToggle,
    });
    cleanup = mounted.unmount;

    const button = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Switch overview grid to 3x3"]'
    );
    expect(button).toBeTruthy();

    await act(async () => {
      button?.click();
    });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("hides the overview density toggle in focus mode", async () => {
    const mounted = await mountToolbarWithProps({
      mode: "focus",
      overviewGridDensity: "3x3",
      onToggleOverviewGridDensity: vi.fn(),
    });
    cleanup = mounted.unmount;

    expect(document.querySelector('button[aria-label="Switch overview grid to 2x2"]')).toBeNull();
    expect(document.querySelector('button[aria-label="Switch overview grid to 3x3"]')).toBeNull();
  });
});
