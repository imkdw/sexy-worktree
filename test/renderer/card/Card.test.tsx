// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, type ComponentType, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PaneNode } from "@shared/pane";
import { ok } from "@shared/result";
import type { WorktreeOps } from "@renderer/state/terminalSessions";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type ApiMock = typeof window.api;

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
    worktree: {
      list: vi.fn(),
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
      spawn: vi.fn().mockResolvedValue(ok({ id: "pty-1" })),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn().mockReturnValue(() => {}),
      onExit: vi.fn().mockReturnValue(() => {}),
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

function makeOps(tree: PaneNode): WorktreeOps {
  return {
    tree,
    getEntry: vi.fn().mockReturnValue(null),
    getExit: vi.fn().mockReturnValue(null),
    split: vi.fn().mockReturnValue(null),
    closePane: vi.fn(),
    resize: vi.fn(),
    newPane: vi.fn().mockReturnValue("leaf-1"),
    updateLeafCommand: vi.fn(),
    restart: vi.fn(),
    getFirstPtyId: vi.fn().mockReturnValue(null),
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mountCard(
  active: boolean
): Promise<{ container: HTMLElement; unmount: () => void }> {
  vi.resetModules();
  window.api = makeApi();

  const ops = makeOps({ kind: "leaf", id: "leaf-1", lastCommand: "" });
  vi.doMock("@renderer/state/terminalSessions", () => ({
    useTerminalSessions: () => ops,
  }));

  const [{ TooltipProvider }, { Card }] = await Promise.all([
    import("@renderer/ui"),
    import("@renderer/card/Card"),
  ]);

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(
      createElement(
        TooltipProvider as ComponentType<{ children: ReactNode }>,
        null,
        createElement(Card, {
          repoId: 1,
          branch: "feature/focus",
          cwd: "/repo/worktrees/focus",
          active,
          onActivate: vi.fn(),
        })
      )
    );
  });
  await flush();

  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function terminalPane(container: HTMLElement): HTMLElement {
  const pane = container.querySelector<HTMLElement>(".bg-terminal-bg > div");
  if (!pane) throw new Error("terminal pane not found");
  return pane;
}

describe("Card terminal focus", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    cleanup = null;
  });

  afterEach(() => {
    cleanup?.();
    vi.doUnmock("@renderer/state/terminalSessions");
    vi.restoreAllMocks();
  });

  it("active card renders a border-based terminal focus indicator", async () => {
    const mounted = await mountCard(true);
    cleanup = mounted.unmount;

    const pane = terminalPane(mounted.container);
    expect(pane.className).toContain("border-accent");
    expect(pane.className).toContain("terminal-pane-focus-ring");
    expect(pane.className).not.toContain("outline-accent-soft");
  });

  it("inactive card does not render a terminal focus indicator", async () => {
    const mounted = await mountCard(false);
    cleanup = mounted.unmount;

    const pane = terminalPane(mounted.container);
    expect(pane.className).not.toContain("border-accent");
    expect(pane.className).not.toContain("terminal-pane-focus-ring");
    expect(pane.className).not.toContain("outline-accent-soft");
  });
});
