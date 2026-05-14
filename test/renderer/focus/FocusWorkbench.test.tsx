// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, type ComponentType, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ok } from "@shared/result";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type ApiMock = typeof window.api;

const refreshMock = vi.fn();
const selectFileMock = vi.fn();
const toastPushMock = vi.fn();
let readFileContent = 'const color = "blue";\n';

let selected: { relativePath: string; view: "diff" | "editor" | "markdown" } | null = {
  relativePath: "src/App.tsx",
  view: "editor",
};

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
      files: vi.fn().mockResolvedValue(ok({ entries: [] })),
      status: vi.fn().mockResolvedValue(ok({ changes: [] })),
      readFile: vi
        .fn()
        .mockImplementation(({ relativePath }: { relativePath: string }) =>
          Promise.resolve(ok({ relativePath, content: readFileContent }))
        ),
      writeFile: vi
        .fn()
        .mockResolvedValue(ok({ relativePath: "src/App.tsx", content: "new text\n" })),
      fileDiff: vi.fn().mockResolvedValue(
        ok({
          relativePath: "src/App.tsx",
          originalPath: null,
          status: "modified" as const,
          oldContent: "old text\n",
          newContent: "new text\n",
        })
      ),
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

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mountWorkbench(): Promise<{
  api: ApiMock;
  container: HTMLElement;
  unmount: () => void;
}> {
  vi.resetModules();
  const api = makeApi();
  window.api = api;

  vi.doMock("@renderer/state/focusWorkbench", () => ({
    useFocusWorkbench: () => ({
      activeWorktreePath: "/repo",
      changes: [],
      loading: false,
      error: null,
      selected,
      selectFile: selectFileMock,
      selectDiff: vi.fn(),
      refresh: refreshMock,
    }),
  }));
  vi.doMock("@renderer/state/toast", () => ({
    useToast: () => ({ push: toastPushMock }),
  }));
  vi.doMock("@pierre/diffs/react", () => ({
    Virtualizer: ({
      children,
      className,
      contentClassName,
    }: {
      children: ReactNode;
      className?: string;
      contentClassName?: string;
    }) =>
      createElement(
        "div",
        { className },
        createElement(
          "div",
          { className: contentClassName, "data-testid": "diff-content" },
          children
        )
      ),
    MultiFileDiff: ({
      oldFile,
      newFile,
    }: {
      oldFile: { contents: string };
      newFile: { contents: string };
    }) => createElement("div", { "data-testid": "diff" }, `${oldFile.contents}${newFile.contents}`),
  }));

  const [{ FocusWorkbench }, { TooltipProvider }] = await Promise.all([
    import("@renderer/focus/FocusWorkbench"),
    import("@renderer/ui"),
  ]);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(
      createElement(
        TooltipProvider as ComponentType<{ children: ReactNode }>,
        null,
        createElement(FocusWorkbench)
      )
    );
  });
  await flush();

  return {
    api,
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("FocusWorkbench", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    readFileContent = 'const color = "blue";\n';
    selected = { relativePath: "src/App.tsx", view: "editor" };
    refreshMock.mockReset();
    selectFileMock.mockReset();
    toastPushMock.mockReset();
    cleanup = null;
  });

  afterEach(() => {
    cleanup?.();
    vi.restoreAllMocks();
  });

  it("loads, edits, and saves a selected file", async () => {
    const mounted = await mountWorkbench();
    cleanup = mounted.unmount;

    const textarea = mounted.container.querySelector("textarea");
    expect(textarea?.value).toBe('const color = "blue";\n');

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      setter?.call(textarea, "new text\n");
      textarea!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const saveButton = mounted.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Save file"]'
    );
    await act(async () => {
      saveButton?.click();
      await Promise.resolve();
    });

    expect(mounted.api.worktree.writeFile).toHaveBeenCalledWith({
      worktreePath: "/repo",
      relativePath: "src/App.tsx",
      content: "new text\n",
    });
    expect(refreshMock).toHaveBeenCalled();
    expect(toastPushMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "success", title: "File saved" })
    );
  });

  it("renders syntax highlighting over the editable text surface", async () => {
    const mounted = await mountWorkbench();
    cleanup = mounted.unmount;

    const keyword = mounted.container.querySelector<HTMLElement>('[data-token-kind="keyword"]');
    const string = mounted.container.querySelector<HTMLElement>('[data-token-kind="string"]');
    const editor = mounted.container.querySelector("pre");

    expect(editor?.textContent).toContain('const color = "blue";');
    expect(keyword?.textContent).toBe("const");
    expect(keyword?.className).toContain("text-accent");
    expect(string?.textContent).toBe('"blue"');
    expect(string?.className).toContain("text-success");
  });

  it("renders a diffs.com diff for a selected changed file", async () => {
    selected = { relativePath: "src/App.tsx", view: "diff" };
    const mounted = await mountWorkbench();
    cleanup = mounted.unmount;

    expect(mounted.api.worktree.fileDiff).toHaveBeenCalledWith({
      worktreePath: "/repo",
      relativePath: "src/App.tsx",
    });
    expect(mounted.container.textContent).toContain("old text");
    expect(mounted.container.textContent).toContain("new text");

    const editButton = mounted.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Open file editor"]'
    );
    await act(async () => {
      editButton?.click();
    });
    expect(selectFileMock).toHaveBeenCalledWith("src/App.tsx");
  });

  it("renders a selected markdown file through the markdown preview", async () => {
    selected = { relativePath: "docs/notes.md", view: "markdown" };
    readFileContent = "# Release notes\n\n- [x] Ship markdown preview\n";
    const mounted = await mountWorkbench();
    cleanup = mounted.unmount;

    expect(mounted.api.worktree.readFile).toHaveBeenCalledWith({
      worktreePath: "/repo",
      relativePath: "docs/notes.md",
    });
    expect(mounted.container.querySelector("textarea")).toBeNull();
    expect(mounted.container.querySelector("h1")?.textContent).toBe("Release notes");
    expect(mounted.container.textContent).toContain("Ship markdown preview");

    const editButton = mounted.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Open file editor"]'
    );
    await act(async () => {
      editButton?.click();
    });
    expect(selectFileMock).toHaveBeenCalledWith("docs/notes.md");
  });

  it("renders diffs without workbench content padding", async () => {
    selected = { relativePath: "src/App.tsx", view: "diff" };
    const mounted = await mountWorkbench();
    cleanup = mounted.unmount;

    const diffContent = mounted.container.querySelector<HTMLElement>(
      '[data-testid="diff-content"]'
    );
    expect(diffContent?.className).not.toContain("py-3");
    expect(diffContent?.className).not.toContain("p-3");
  });
});
