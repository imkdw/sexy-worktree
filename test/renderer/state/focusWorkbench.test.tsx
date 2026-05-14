// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, useRef, type MouseEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ok } from "@shared/result";
import { OPEN_MARKDOWN_PATH_EVENT } from "@renderer/terminal/markdownPathLinks";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const statusMock = vi.fn().mockResolvedValue(ok({ changes: [] }));
let mode: "overview" | "focus" = "focus";
let activeId = "/repo";
const setModeMock = vi.fn((next: "overview" | "focus") => {
  mode = next;
});
const setActiveMock = vi.fn((next: string) => {
  activeId = next;
});

function installApiMock(): void {
  window.api = {
    worktree: {
      status: statusMock,
    },
  } as unknown as typeof window.api;
}

async function mountProvider(): Promise<{
  container: HTMLElement;
  unmount: () => void;
}> {
  vi.resetModules();
  installApiMock();
  vi.doMock("@renderer/state/mode", () => ({
    useMode: () => ({ mode, setMode: setModeMock, toggle: vi.fn() }),
  }));
  vi.doMock("@renderer/state/repos", () => ({
    useRepos: () => ({ activeRepoId: 1 }),
  }));
  vi.doMock("@renderer/state/worktrees", () => ({
    useWorktrees: () => ({
      activeId,
      worktrees: [{ path: "/repo", branch: "main", head: "abc", isMain: true }],
      setActive: setActiveMock,
    }),
  }));

  const { FocusWorkbenchProvider, useFocusWorkbench } =
    await import("@renderer/state/focusWorkbench");

  function Consumer(): React.JSX.Element {
    const splitHostRef = useRef<HTMLDivElement>(null);
    const state = useFocusWorkbench();

    return (
      <div ref={splitHostRef} data-testid="split-host">
        <output data-testid="split-value">{Math.round(state.terminalPanePercent)}</output>
        <output data-testid="resizing-value">{state.isResizingFocusPanes ? "yes" : "no"}</output>
        <output data-testid="selected-view">{state.selected?.view ?? "none"}</output>
        <output data-testid="selected-path">{state.selected?.relativePath ?? "none"}</output>
        <button
          onMouseDown={(event: MouseEvent) => {
            if (splitHostRef.current) state.startFocusPaneResize(event, splitHostRef.current);
          }}
        >
          Resize
        </button>
        <button data-testid="select-markdown" onClick={() => state.selectDiff("README.md")}>
          Select Markdown
        </button>
        <button data-testid="select-code" onClick={() => state.selectDiff("src/App.tsx")}>
          Select Code
        </button>
      </div>
    );
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(createElement(FocusWorkbenchProvider, null, createElement(Consumer)));
  });

  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("FocusWorkbenchProvider", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    mode = "focus";
    activeId = "/repo";
    statusMock.mockClear();
    setModeMock.mockClear();
    setActiveMock.mockClear();
    cleanup = null;
  });

  afterEach(() => {
    cleanup?.();
    vi.restoreAllMocks();
  });

  it("updates and persists the focus terminal/workbench split while dragging", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;
    const host = mounted.container.querySelector<HTMLElement>('[data-testid="split-host"]');
    const button = mounted.container.querySelector<HTMLButtonElement>("button");

    expect(mounted.container.querySelector('[data-testid="split-value"]')?.textContent).toBe("50");

    if (host) {
      host.getBoundingClientRect = () =>
        ({
          left: 0,
          right: 1000,
          top: 0,
          bottom: 600,
          width: 1000,
          height: 600,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect;
    }

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 500 }));
    });
    expect(mounted.container.querySelector('[data-testid="resizing-value"]')?.textContent).toBe(
      "yes"
    );

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 700 }));
    });
    expect(mounted.container.querySelector('[data-testid="split-value"]')?.textContent).toBe("70");

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });
    expect(mounted.container.querySelector('[data-testid="resizing-value"]')?.textContent).toBe(
      "no"
    );
    expect(localStorage.getItem("sexy-worktree:focus-terminal-pane-percent")).toBe("70");
  });

  it("selects changed markdown files as markdown previews and code files as diffs", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;
    const selectedView = mounted.container.querySelector('[data-testid="selected-view"]');
    const markdownButton = mounted.container.querySelector<HTMLButtonElement>(
      '[data-testid="select-markdown"]'
    );
    const codeButton = mounted.container.querySelector<HTMLButtonElement>(
      '[data-testid="select-code"]'
    );

    await act(async () => {
      markdownButton?.click();
    });
    expect(selectedView?.textContent).toBe("markdown");

    await act(async () => {
      codeButton?.click();
    });
    expect(selectedView?.textContent).toBe("diff");
  });

  it("opens terminal markdown path events in the markdown preview", async () => {
    const mounted = await mountProvider();
    cleanup = mounted.unmount;

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(OPEN_MARKDOWN_PATH_EVENT, {
          detail: {
            worktreePath: "/repo",
            relativePath: "docs/superpowers/plans/ci-plan.md",
          },
        })
      );
    });

    expect(setActiveMock).toHaveBeenCalledWith("/repo");
    expect(setModeMock).toHaveBeenCalledWith("focus");
    expect(mounted.container.querySelector('[data-testid="selected-view"]')?.textContent).toBe(
      "markdown"
    );
    expect(mounted.container.querySelector('[data-testid="selected-path"]')?.textContent).toBe(
      "docs/superpowers/plans/ci-plan.md"
    );
  });
});
