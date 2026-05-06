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

async function mountGrid(): Promise<{ container: HTMLElement; unmount: () => void }> {
  vi.resetModules();
  vi.doMock("@renderer/state/repos", () => ({
    useRepos: () => ({ activeRepoId: 1 }),
  }));
  vi.doMock("@renderer/state/worktrees", () => ({
    worktreeId: (wt: { path: string }) => wt.path,
    useWorktrees: () => ({
      worktrees: [
        { path: "/repo", branch: "main", head: "abc", isMain: true },
        { path: "/repo/wt-a", branch: "feature/a", head: "def", isMain: false },
      ],
      activeId: "/repo",
      setActive: vi.fn(),
    }),
  }));
  vi.doMock("@renderer/state/newWorktree", () => ({
    useNewWorktreeJobs: () => ({ jobs: [] }),
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

describe("Grid density layout", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    density = "2x2";
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
});
