// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  createElement,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import type {} from "@renderer/ipc/api";
import type { RepoRow, Worktree } from "@shared/ipc";
import { err, ok } from "@shared/result";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type ApiMock = typeof window.api;
type SelectModeSnapshot = {
  enabled: boolean;
  selected: Set<string>;
};
type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

const repo: RepoRow = {
  id: 1,
  path: "/repo",
  name: "repo",
  lastActiveAt: 1,
};

const mainWorktree = "/repo";
const selectedWorktree = "/repo/worktrees/delete-me";
const secondSelectedWorktree = "/repo/worktrees/delete-two";

const worktrees: Worktree[] = [
  {
    path: mainWorktree,
    branch: "main",
    head: "abc",
    isMain: true,
  },
  {
    path: selectedWorktree,
    branch: "feature/delete-me",
    head: "def",
    isMain: false,
  },
  {
    path: secondSelectedWorktree,
    branch: null,
    head: "789",
    isMain: false,
  },
];

function makeApi(overrides: Partial<ApiMock> = {}): ApiMock {
  return {
    dialog: {
      selectDirectory: vi.fn(),
    },
    repo: {
      openDialog: vi.fn(),
      validate: vi.fn(),
      add: vi.fn(),
      list: vi.fn().mockResolvedValue(ok({ repos: [repo], activeRepoId: repo.id })),
      setActive: vi.fn(),
      close: vi.fn(),
    },
    worktree: {
      list: vi.fn().mockResolvedValue(ok({ worktrees })),
      remove: vi.fn(),
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
      list: vi.fn().mockResolvedValue(ok({ jobs: [] })),
      onEvent: vi.fn().mockReturnValue(() => {}),
    },
    worktreeDelete: {
      start: vi.fn().mockResolvedValue(ok({ jobId: "delete-job-1" })),
      cancel: vi.fn(),
      dismiss: vi.fn(),
      list: vi.fn().mockResolvedValue(ok({ jobs: [] })),
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
    ...overrides,
  } satisfies ApiMock;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function findButton(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.replace(/\s+/g, " ").trim() === label
  );
  if (!button) throw new Error(`button not found: ${label}`);
  return button as HTMLButtonElement;
}

async function clickButton(label: string): Promise<void> {
  const button = findButton(label);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

async function mountModal(args: {
  api: ApiMock;
  selectedIds: string[];
  onClose?: () => void;
}): Promise<{
  latestSelection: () => SelectModeSnapshot;
  onClose: () => void;
  unmount: () => void;
}> {
  vi.resetModules();
  window.api = args.api;

  const [
    { TooltipProvider },
    { ToastProvider },
    { ReposProvider },
    { WorktreesProvider },
    { SelectModeProvider, useSelectMode },
    { ConfirmDeleteModal },
    { ToastLayer },
  ] = await Promise.all([
    import("@renderer/ui"),
    import("@renderer/state/toast"),
    import("@renderer/state/repos"),
    import("@renderer/state/worktrees"),
    import("@renderer/state/selectMode"),
    import("@renderer/selectMode/ConfirmDeleteModal"),
    import("@renderer/toast/Toast"),
  ]);

  let selection: SelectModeSnapshot | null = null;
  const onClose = args.onClose ?? vi.fn();

  function SelectionSeed(): null {
    const sm = useSelectMode();
    const seededRef = useRef(false);
    selection = { enabled: sm.enabled, selected: new Set(sm.selected) };

    useEffect(() => {
      if (seededRef.current) return;
      seededRef.current = true;
      sm.enter();
      sm.selectAll(args.selectedIds);
    }, [sm]);

    return null;
  }

  function ModalHost(): React.JSX.Element {
    const [open, setOpen] = useState(true);

    return createElement(ConfirmDeleteModal, {
      open,
      onClose: () => {
        onClose();
        setOpen(false);
      },
    });
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(
      createElement(
        TooltipProvider as ComponentType<{ children: ReactNode }>,
        null,
        createElement(
          ToastProvider as ComponentType<{ children: ReactNode }>,
          null,
          createElement(ToastLayer),
          createElement(
            ReposProvider as ComponentType<{ children: ReactNode }>,
            null,
            createElement(
              WorktreesProvider as ComponentType<{ children: ReactNode }>,
              null,
              createElement(
                SelectModeProvider as ComponentType<{ children: ReactNode }>,
                null,
                createElement(SelectionSeed),
                createElement(ModalHost)
              )
            )
          )
        )
      )
    );
  });
  await flush();

  return {
    latestSelection: () => {
      if (!selection) throw new Error("selection state was not captured");
      return selection;
    },
    onClose,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("ConfirmDeleteModal background delete start", () => {
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

  it("starts a delete job with selected non-main targets", async () => {
    const api = makeApi();
    const mounted = await mountModal({
      api,
      selectedIds: [mainWorktree, selectedWorktree, secondSelectedWorktree],
    });
    cleanup = mounted.unmount;

    await clickButton("Force Delete");
    await flush();

    expect(api.worktreeDelete.start).toHaveBeenCalledTimes(1);
    expect(api.worktreeDelete.start).toHaveBeenCalledWith({
      repoId: repo.id,
      targets: [
        { worktreePath: selectedWorktree, branch: "feature/delete-me" },
        { worktreePath: secondSelectedWorktree, branch: null },
      ],
    });
  });

  it("closes and exits selection mode immediately after starting successfully", async () => {
    const api = makeApi();
    const mounted = await mountModal({ api, selectedIds: [selectedWorktree] });
    cleanup = mounted.unmount;

    await clickButton("Force Delete");
    await flush();

    expect(mounted.onClose).toHaveBeenCalledTimes(1);
    expect(mounted.latestSelection().enabled).toBe(false);
    expect(mounted.latestSelection().selected.size).toBe(0);
    expect(document.body.textContent).not.toContain("Force delete");
    expect(document.body.textContent).toContain("Deleting 1 worktree");
    expect(document.body.textContent).toContain("Progress is shown in Background Jobs.");
  });

  it("uses plural copy in the success toast when starting multiple deletes", async () => {
    const api = makeApi();
    const mounted = await mountModal({
      api,
      selectedIds: [selectedWorktree, secondSelectedWorktree],
    });
    cleanup = mounted.unmount;

    await clickButton("Force Delete");
    await flush();

    expect(document.body.textContent).toContain("Deleting 2 worktrees");
    expect(document.body.textContent).toContain("Progress is shown in Background Jobs.");
  });

  it("does not call the legacy worktree remove IPC after starting successfully", async () => {
    const api = makeApi();
    const mounted = await mountModal({ api, selectedIds: [selectedWorktree] });
    cleanup = mounted.unmount;

    await clickButton("Force Delete");
    await flush();

    expect(api.worktree.remove).not.toHaveBeenCalled();
  });

  it("does not directly refresh worktrees after confirmation", async () => {
    const api = makeApi();
    const mounted = await mountModal({ api, selectedIds: [selectedWorktree] });
    cleanup = mounted.unmount;
    const baselineListCalls = vi.mocked(api.worktree.list).mock.calls.length;

    await clickButton("Force Delete");
    await flush();

    expect(api.worktree.list).toHaveBeenCalledTimes(baselineListCalls);
  });

  it("keeps the modal open and shows a toast when starting returns an error", async () => {
    const api = makeApi({
      worktreeDelete: {
        start: vi.fn().mockResolvedValue(err({ message: "Cannot start delete" })),
        cancel: vi.fn(),
        dismiss: vi.fn(),
        list: vi.fn().mockResolvedValue(ok({ jobs: [] })),
        onEvent: vi.fn().mockReturnValue(() => {}),
      },
    });
    const mounted = await mountModal({ api, selectedIds: [selectedWorktree] });
    cleanup = mounted.unmount;

    await clickButton("Force Delete");
    await flush();

    expect(mounted.onClose).not.toHaveBeenCalled();
    expect(mounted.latestSelection().enabled).toBe(true);
    expect(mounted.latestSelection().selected.has(selectedWorktree)).toBe(true);
    expect(document.body.textContent).toContain("Force delete 1 worktree?");
    expect(document.body.textContent).toContain("Failed to start delete job");
    expect(document.body.textContent).toContain("Cannot start delete");
  });

  it("keeps the modal open and shows a useful toast when starting throws", async () => {
    const api = makeApi({
      worktreeDelete: {
        start: vi.fn().mockRejectedValue(new Error("IPC unavailable")),
        cancel: vi.fn(),
        dismiss: vi.fn(),
        list: vi.fn().mockResolvedValue(ok({ jobs: [] })),
        onEvent: vi.fn().mockReturnValue(() => {}),
      },
    });
    const mounted = await mountModal({ api, selectedIds: [selectedWorktree] });
    cleanup = mounted.unmount;

    await clickButton("Force Delete");
    await flush();

    expect(mounted.onClose).not.toHaveBeenCalled();
    expect(mounted.latestSelection().enabled).toBe(true);
    expect(mounted.latestSelection().selected.has(selectedWorktree)).toBe(true);
    expect(document.body.textContent).toContain("Force delete 1 worktree?");
    expect(document.body.textContent).toContain("Failed to start delete job");
    expect(document.body.textContent).toContain("IPC unavailable");
  });

  it("disables confirm when there are no selected non-main targets", async () => {
    const api = makeApi();
    const mounted = await mountModal({ api, selectedIds: [mainWorktree] });
    cleanup = mounted.unmount;

    const button = findButton("Force Delete");

    expect(button.disabled).toBe(true);
    expect(api.worktreeDelete.start).not.toHaveBeenCalled();
  });

  it("shows pending state while start IPC is in flight", async () => {
    const start = deferred<Awaited<ReturnType<ApiMock["worktreeDelete"]["start"]>>>();
    const api = makeApi({
      worktreeDelete: {
        start: vi.fn().mockReturnValue(start.promise),
        cancel: vi.fn(),
        dismiss: vi.fn(),
        list: vi.fn().mockResolvedValue(ok({ jobs: [] })),
        onEvent: vi.fn().mockReturnValue(() => {}),
      },
    });
    const mounted = await mountModal({ api, selectedIds: [selectedWorktree] });
    cleanup = mounted.unmount;

    await clickButton("Force Delete");

    const pendingButton = findButton("Starting...");
    expect(pendingButton.disabled).toBe(true);
    expect(pendingButton.getAttribute("aria-busy")).toBe("true");

    await act(async () => {
      start.resolve(ok({ jobId: "delete-job-1" }));
      await start.promise;
    });
    await flush();
  });
});
