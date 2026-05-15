// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { OverviewGridDensity } from "@shared/overviewGridDensity";
import type { Worktree } from "@shared/ipc";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type LiveJob = {
  id: string;
  status: "queued" | "running" | "cleaning" | "failed" | "completed";
};

let activeRepoId: number | null = 1;
let density: OverviewGridDensity = "2x2";
let worktrees: Worktree[] = [];
let activeId: string | null = null;
let openCards: string[] = [];
let liveJobs: LiveJob[] = [];
const setActive = vi.fn();
const getOpenCardsMock = vi.fn((repoId: number) => (repoId === activeRepoId ? openCards : []));

function mainWorktree(): Worktree {
  return { path: "/repo", branch: "main", head: "abc", isMain: true };
}

function featureWorktree(): Worktree {
  return { path: "/repo/wt-a", branch: "feature/a", head: "def", isMain: false };
}

async function mountGrid(): Promise<{ container: HTMLElement; unmount: () => void }> {
  vi.resetModules();
  vi.doMock("@renderer/state/repos", () => ({
    useRepos: () => ({ activeRepoId }),
  }));
  vi.doMock("@renderer/state/worktrees", () => ({
    worktreeId: (wt: Worktree) => wt.path,
    useWorktrees: () => ({
      worktrees,
      activeId,
      setActive,
    }),
  }));
  vi.doMock("@renderer/state/terminalSessions", () => ({
    useTerminalSessionCards: () => ({
      getOpenCards: getOpenCardsMock,
      openOrFocus: vi.fn(),
      closeCard: vi.fn(),
      isOpen: vi.fn(),
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
    ProvisioningCard: ({ job }: { job: LiveJob }) => createElement("section", null, job.id),
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
    activeRepoId = 1;
    density = "2x2";
    worktrees = [mainWorktree(), featureWorktree()];
    activeId = "/repo";
    openCards = ["/repo"];
    liveJobs = [];
    setActive.mockClear();
    getOpenCardsMock.mockClear();
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
    expect(getOpenCardsMock).toHaveBeenCalledWith(1);
  });

  it("shows the open repository state without reading open cards when no repo is active", async () => {
    activeRepoId = null;
    const mounted = await mountGrid();
    cleanup = mounted.unmount;

    expect(mounted.container.textContent).toContain("Open a repository to start.");
    expect(getOpenCardsMock).not.toHaveBeenCalled();
  });

  it("shows the terminal empty state when worktrees exist but no terminals are open", async () => {
    openCards = [];
    const mounted = await mountGrid();
    cleanup = mounted.unmount;

    expect(mounted.container.textContent).toContain("No terminals open");
    expect(mounted.container.textContent).toContain(
      "Select a worktree in the rail to open a terminal."
    );
  });

  it("still renders live provisioning cards when no terminals are open", async () => {
    openCards = [];
    liveJobs = [{ id: "job-1", status: "running" }];
    const mounted = await mountGrid();
    cleanup = mounted.unmount;

    expect(mounted.container.textContent).toContain("job-1");
    expect(mounted.container.textContent).not.toContain("No terminals open");
  });

  it("keeps cleanup provisioning cards visible", async () => {
    openCards = [];
    liveJobs = [{ id: "job-cleaning", status: "cleaning" }];
    const mounted = await mountGrid();
    cleanup = mounted.unmount;

    expect(mounted.container.textContent).toContain("job-cleaning");
    expect(mounted.container.textContent).not.toContain("No terminals open");
  });

  it("shows repository empty state when no worktrees and no jobs exist", async () => {
    worktrees = [];
    openCards = [];
    liveJobs = [];
    const mounted = await mountGrid();
    cleanup = mounted.unmount;

    expect(mounted.container.textContent).toContain("No worktrees in this repository yet.");
  });
});
