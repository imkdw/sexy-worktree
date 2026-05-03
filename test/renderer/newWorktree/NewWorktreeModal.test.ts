// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, type ComponentType, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { RepoConfigDto, RepoRow } from "@shared/ipc";
import { ok, err } from "@shared/result";

type ApiMock = typeof window.api;

const repo: RepoRow = {
  id: 1,
  path: "/repo",
  name: "repo",
  lastActiveAt: 1,
};

const repoConfig: RepoConfigDto = {
  version: 1,
  worktree: {
    baseDir: "../worktrees",
    defaultBaseBranch: "main",
    filesToCopy: [],
    installCommand: "true",
    initCommands: [],
  },
};

const jiraConfig: RepoConfigDto = {
  ...repoConfig,
  jira: {
    enabled: true,
    workspaceUrl: "https://example.atlassian.net",
    email: "dev@example.com",
    tokenKeychainKey: "jira.repo",
  },
};

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
      list: vi.fn().mockResolvedValue(ok({ worktrees: [] })),
      remove: vi.fn(),
    },
    config: {
      get: vi.fn().mockResolvedValue(ok({ config: repoConfig, source: "file" as const })),
      saveJira: vi.fn(),
      saveRepository: vi.fn(),
    },
    pty: {
      spawn: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn(),
      onExit: vi.fn(),
    },
    pane: {
      load: vi.fn(),
      save: vi.fn(),
    },
    newWorktree: {
      create: vi.fn().mockResolvedValue(ok({ jobId: "job-1" })),
      retry: vi.fn(),
      cancel: vi.fn(),
      list: vi.fn().mockResolvedValue(ok({ jobs: [] })),
      onEvent: vi.fn().mockReturnValue(() => {}),
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
    ...overrides,
  } satisfies ApiMock;
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function setInput(selector: string, value: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`input not found: ${selector}`);

  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!valueSetter) throw new Error("HTMLInputElement value setter not found");
    valueSetter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function clickButton(label: string): Promise<void> {
  const button = [...document.querySelectorAll("button")].find(
    (el) => el.getAttribute("aria-label") === label || el.textContent?.trim() === label
  );
  if (!button) throw new Error(`button not found: ${label}`);

  await act(async () => {
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function clickButtonByLabel(label: string): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`button not found by aria-label: ${label}`);

  await act(async () => {
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function waitForInput(selector: string): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    if (document.querySelector(selector)) return;
    await flush();
  }
  throw new Error(`input not found: ${selector}`);
}

async function waitForText(text: string): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    if (document.body.textContent?.includes(text)) return;
    await flush();
  }
  throw new Error(`text not found: ${text}`);
}

async function mountModal(
  api: ApiMock,
  onClose = vi.fn()
): Promise<{
  onClose: typeof onClose;
  unmount: () => void;
}> {
  vi.resetModules();
  window.api = api;

  const [
    { ToastProvider },
    { ReposProvider },
    { NewWorktreeModal },
    { ToastLayer },
    { TooltipProvider },
  ] = await Promise.all([
    import("@renderer/state/toast"),
    import("@renderer/state/repos"),
    import("@renderer/newWorktree/NewWorktreeModal"),
    import("@renderer/toast/Toast"),
    import("@renderer/ui"),
  ]);

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  function App(): React.JSX.Element {
    return createElement(
      TooltipProvider as ComponentType<{ children: ReactNode }>,
      null,
      createElement(
        ToastProvider as ComponentType<{ children: ReactNode }>,
        null,
        createElement(ToastLayer),
        createElement(
          ReposProvider as ComponentType<{ children: ReactNode }>,
          null,
          createElement(NewWorktreeModal, { open: true, onClose })
        )
      )
    );
  }

  await act(async () => {
    root.render(createElement(App));
  });
  await flush();

  return {
    onClose,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("NewWorktreeModal", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    cleanup = null;
  });

  afterEach(() => {
    cleanup?.();
    vi.restoreAllMocks();
  });

  it("shows compact direct actions and closes after create is accepted", async () => {
    const api = makeApi();
    const mounted = await mountModal(api);
    cleanup = mounted.unmount;

    expect(document.body.textContent).toContain("New Worktree");
    expect(document.body.textContent).toContain("Cancel");
    expect(document.body.textContent).toContain("Create Worktree");
    expect(document.body.textContent).not.toContain("Confirm");

    await setInput("#direct-branch", "feat-add-search");
    await clickButton("Create Worktree");
    await flush();

    expect(api.newWorktree.create).toHaveBeenCalledWith({
      repoId: repo.id,
      branch: "feat-add-search",
    });
    expect(mounted.onClose).toHaveBeenCalledTimes(1);
  });

  it("disables direct create and shows inline validation for an invalid direct branch", async () => {
    const api = makeApi();
    const mounted = await mountModal(api);
    cleanup = mounted.unmount;

    await setInput("#direct-branch", "feat add search");
    await flush();

    const createButton = [...document.querySelectorAll("button")].find(
      (el): el is HTMLButtonElement => el.textContent?.trim() === "Create Worktree"
    );

    expect(createButton?.disabled).toBe(true);
    expect(document.body.textContent).toContain("Branch name cannot contain spaces.");
    expect(api.newWorktree.create).not.toHaveBeenCalled();
  });

  it("renders method cards with selected state instead of document tabs", async () => {
    const api = makeApi();
    const mounted = await mountModal(api);
    cleanup = mounted.unmount;

    const direct = [...document.querySelectorAll("button")].find(
      (el): el is HTMLButtonElement => el.textContent?.includes("Direct") ?? false
    );
    const jira = [...document.querySelectorAll("button")].find(
      (el): el is HTMLButtonElement => el.textContent?.includes("From Jira") ?? false
    );

    expect(direct).toBeTruthy();
    expect(jira).toBeTruthy();
    expect(direct?.getAttribute("aria-pressed")).toBe("true");
    expect(jira?.getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector('[role="tablist"]')).toBeNull();

    await clickButton("From Jira");

    expect(direct?.getAttribute("aria-pressed")).toBe("false");
    expect(jira?.getAttribute("aria-pressed")).toBe("true");
  });

  it("renders the new worktree dialog with roomy modal sizing", async () => {
    const api = makeApi();
    const mounted = await mountModal(api);
    cleanup = mounted.unmount;

    const dialog = document.querySelector<HTMLDivElement>('[role="dialog"]');
    const body = dialog?.firstElementChild;
    const selector = document.querySelector<HTMLDivElement>(
      '[aria-label="Worktree creation method"]'
    );
    const direct = document.querySelector<HTMLButtonElement>('button[aria-label="Direct"]');
    const jira = document.querySelector<HTMLButtonElement>('button[aria-label="From Jira"]');
    const methodTitle = direct?.querySelector("span");
    const methodDescription = [...(direct?.querySelectorAll("span") ?? [])].find((el) =>
      el.textContent?.includes("Type an exact branch name.")
    );
    const createButton = [...document.querySelectorAll("button")].find(
      (el): el is HTMLButtonElement => el.textContent?.trim() === "Create Worktree"
    );

    expect(dialog?.classList.contains("w-modal-wide")).toBe(true);
    expect(body?.classList.contains("gap-6")).toBe(true);
    expect(selector?.classList.contains("bg-background")).toBe(true);
    expect(selector?.classList.contains("p-3")).toBe(true);
    expect(selector?.classList.contains("gap-3")).toBe(true);
    expect(direct?.classList.contains("p-6")).toBe(true);
    expect(jira?.classList.contains("p-6")).toBe(true);
    expect(methodTitle?.classList.contains("text-base")).toBe(true);
    expect(methodDescription?.classList.contains("text-sm")).toBe(true);
    expect(createButton?.classList.contains("px-4")).toBe(true);
    expect(createButton?.classList.contains("py-3")).toBe(true);
    expect(createButton?.classList.contains("text-base")).toBe(true);
  });

  it("shows create summary and updates target path from Direct branch input", async () => {
    const api = makeApi();
    const mounted = await mountModal(api);
    cleanup = mounted.unmount;

    expect(document.body.textContent).toContain("Base branch");
    expect(document.body.textContent).toContain("main");
    expect(document.body.textContent).toContain("Worktree directory");
    expect(document.body.textContent).toContain("../worktrees");
    expect(document.body.textContent).not.toContain("../worktrees/feat-add-search");

    await setInput("#direct-branch", "feat-add-search");
    await flush();

    expect(document.body.textContent).toContain("Target path");
    expect(document.body.textContent).toContain("../worktrees/feat-add-search");
  });

  it("keeps direct create state when the selected Direct method is clicked again", async () => {
    const api = makeApi();
    const mounted = await mountModal(api);
    cleanup = mounted.unmount;

    await setInput("#direct-branch", "feat-add-search");
    await flush();

    let createButton = [...document.querySelectorAll("button")].find(
      (el): el is HTMLButtonElement => el.textContent?.trim() === "Create Worktree"
    );
    expect(document.body.textContent).toContain("../worktrees/feat-add-search");
    expect(createButton?.disabled).toBe(false);

    await clickButton("Direct");
    await flush();

    createButton = [...document.querySelectorAll("button")].find(
      (el): el is HTMLButtonElement => el.textContent?.trim() === "Create Worktree"
    );
    expect(document.body.textContent).toContain("../worktrees/feat-add-search");
    expect(createButton?.disabled).toBe(false);
  });

  it("updates the summary target path from Jira resolved and edited branch previews", async () => {
    const api = makeApi({
      config: {
        get: vi.fn().mockResolvedValue(ok({ config: jiraConfig, source: "file" as const })),
        saveJira: vi.fn(),
        saveRepository: vi.fn(),
      },
      secrets: {
        get: vi.fn().mockResolvedValue(ok({ value: "token" })),
        set: vi.fn(),
        remove: vi.fn(),
      },
      jira: {
        resolve: vi.fn().mockResolvedValue(
          ok({
            ticketKey: "PROJ-123",
            summary: "Add search",
            suggestedBranch: "PROJ-123-feat-add-search",
          })
        ),
      },
    });
    const mounted = await mountModal(api);
    cleanup = mounted.unmount;

    await clickButton("From Jira");
    await waitForInput("#jira-ticket");
    await setInput("#jira-ticket", "PROJ-123");
    await clickButton("Resolve");
    await flush();

    expect(document.body.textContent).toContain("../worktrees/PROJ-123-feat-add-search");

    await clickButtonByLabel("Edit branch name");
    await setInput("#jira-branch", "PROJ-123-feat-add-search-v2");
    await flush();

    expect(document.body.textContent).toContain("../worktrees/PROJ-123-feat-add-search-v2");
  });

  it("keeps the modal open and shows inline error when create is rejected", async () => {
    const api = makeApi({
      newWorktree: {
        create: vi.fn().mockResolvedValue(err({ kind: "duplicate", existingPath: "/repo/wt" })),
        retry: vi.fn(),
        cancel: vi.fn(),
        list: vi.fn().mockResolvedValue(ok({ jobs: [] })),
        onEvent: vi.fn().mockReturnValue(() => {}),
      },
    });
    const mounted = await mountModal(api);
    cleanup = mounted.unmount;

    await setInput("#direct-branch", "feat-add-search");
    await clickButton("Create Worktree");
    await flush();

    expect(mounted.onClose).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Cannot create worktree");
    expect(document.body.textContent).toContain("/repo/wt");
  });

  it("keeps Jira preflight inside the shared cancel/create rhythm", async () => {
    const api = makeApi();
    const mounted = await mountModal(api);
    cleanup = mounted.unmount;

    await clickButton("From Jira");
    await waitForText("Setup Jira to enable");

    expect(document.body.textContent).toContain("Settings");
    expect(document.body.textContent).toContain("Cancel");
    expect(document.body.textContent).toContain("Create Worktree");

    const createButton = [...document.querySelectorAll("button")].find(
      (el): el is HTMLButtonElement => el.textContent?.trim() === "Create Worktree"
    );
    expect(createButton?.disabled).toBe(true);

    await clickButton("Cancel");

    expect(mounted.onClose).toHaveBeenCalledTimes(1);
  });

  it("enables Jira create after resolve succeeds with a valid branch preview", async () => {
    const api = makeApi({
      config: {
        get: vi.fn().mockResolvedValue(ok({ config: jiraConfig, source: "file" as const })),
        saveJira: vi.fn(),
        saveRepository: vi.fn(),
      },
      secrets: {
        get: vi.fn().mockResolvedValue(ok({ value: "token" })),
        set: vi.fn(),
        remove: vi.fn(),
      },
      jira: {
        resolve: vi.fn().mockResolvedValue(
          ok({
            ticketKey: "PROJ-123",
            summary: "Add search",
            suggestedBranch: "PROJ-123-feat-add-search",
          })
        ),
      },
    });
    const mounted = await mountModal(api);
    cleanup = mounted.unmount;

    await clickButton("From Jira");
    await waitForInput("#jira-ticket");

    let createButton = [...document.querySelectorAll("button")].find(
      (el): el is HTMLButtonElement => el.textContent?.trim() === "Create Worktree"
    );
    expect(createButton?.disabled).toBe(true);

    await setInput("#jira-ticket", "PROJ-123");
    await clickButton("Resolve");
    await flush();

    createButton = [...document.querySelectorAll("button")].find(
      (el): el is HTMLButtonElement => el.textContent?.trim() === "Create Worktree"
    );
    expect(document.querySelector<HTMLInputElement>("#jira-branch")?.value).toBe(
      "PROJ-123-feat-add-search"
    );
    expect(createButton?.disabled).toBe(false);
  });

  it("shows Jira create failures inline without leaking into Direct inline errors", async () => {
    const api = makeApi({
      config: {
        get: vi.fn().mockResolvedValue(ok({ config: jiraConfig, source: "file" as const })),
        saveJira: vi.fn(),
        saveRepository: vi.fn(),
      },
      secrets: {
        get: vi.fn().mockResolvedValue(ok({ value: "token" })),
        set: vi.fn(),
        remove: vi.fn(),
      },
      jira: {
        resolve: vi.fn().mockResolvedValue(
          ok({
            ticketKey: "PROJ-123",
            summary: "Add search",
            suggestedBranch: "PROJ-123-feat-add-search",
          })
        ),
      },
      newWorktree: {
        create: vi.fn().mockResolvedValue(err({ kind: "duplicate", existingPath: "/repo/wt" })),
        retry: vi.fn(),
        cancel: vi.fn(),
        list: vi.fn().mockResolvedValue(ok({ jobs: [] })),
        onEvent: vi.fn().mockReturnValue(() => {}),
      },
    });
    const mounted = await mountModal(api);
    cleanup = mounted.unmount;

    await clickButton("From Jira");
    await waitForInput("#jira-ticket");

    await setInput("#jira-ticket", "PROJ-123");
    await clickButton("Resolve");
    await flush();
    await clickButton("Create Worktree");
    await flush();

    expect(mounted.onClose).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Cannot create worktree");
    expect(document.body.textContent).toContain("/repo/wt");

    await clickButton("Direct");
    await flush();

    expect(document.body.textContent).not.toContain("Cannot create worktree");
  });

  it("clears stale Jira create errors when the ticket or branch preview changes", async () => {
    const api = makeApi({
      config: {
        get: vi.fn().mockResolvedValue(ok({ config: jiraConfig, source: "file" as const })),
        saveJira: vi.fn(),
        saveRepository: vi.fn(),
      },
      secrets: {
        get: vi.fn().mockResolvedValue(ok({ value: "token" })),
        set: vi.fn(),
        remove: vi.fn(),
      },
      jira: {
        resolve: vi
          .fn()
          .mockResolvedValueOnce(
            ok({
              ticketKey: "PROJ-123",
              summary: "Add search",
              suggestedBranch: "PROJ-123-feat-add-search",
            })
          )
          .mockResolvedValueOnce(
            ok({
              ticketKey: "PROJ-456",
              summary: "Add filters",
              suggestedBranch: "PROJ-456-feat-add-filters",
            })
          ),
      },
      newWorktree: {
        create: vi.fn().mockResolvedValue(err({ kind: "duplicate", existingPath: "/repo/wt" })),
        retry: vi.fn(),
        cancel: vi.fn(),
        list: vi.fn().mockResolvedValue(ok({ jobs: [] })),
        onEvent: vi.fn().mockReturnValue(() => {}),
      },
    });
    const mounted = await mountModal(api);
    cleanup = mounted.unmount;

    await clickButton("From Jira");
    await waitForInput("#jira-ticket");

    await setInput("#jira-ticket", "PROJ-123");
    await clickButton("Resolve");
    await flush();
    await clickButton("Create Worktree");
    await flush();

    expect(mounted.onClose).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Cannot create worktree");

    await clickButtonByLabel("Edit branch name");
    await setInput("#jira-branch", "PROJ-123-feat-add-search-v2");
    await flush();

    expect(document.body.textContent).not.toContain("Cannot create worktree");

    await clickButton("Create Worktree");
    await flush();

    expect(document.body.textContent).toContain("Cannot create worktree");

    await setInput("#jira-ticket", "PROJ-456");
    await flush();

    expect(document.body.textContent).not.toContain("Cannot create worktree");

    await clickButton("Resolve");
    await flush();

    expect(document.querySelector<HTMLInputElement>("#jira-branch")?.value).toBe(
      "PROJ-456-feat-add-filters"
    );
    expect(document.body.textContent).not.toContain("Cannot create worktree");
  });
});
