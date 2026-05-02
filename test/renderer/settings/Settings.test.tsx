// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, type ComponentType, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { RepoConfigDto, RepoRow } from "@shared/ipc";
import type { Ok } from "@shared/result";
import { ok, err } from "@shared/result";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type ApiMock = typeof window.api;
type SaveRepositoryResult = Ok<{ config: RepoConfigDto; configPath: string }>;

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
    defaultStartupCommand: "",
  },
  branchValidation: { requireJiraPattern: true },
};

const jiraConfig: RepoConfigDto = {
  ...repoConfig,
  jira: {
    enabled: true,
    workspaceUrl: "https://pgmworks.atlassian.net",
    email: "imkdw@pgmworks.com",
    tokenKeychainKey: "jira.repo",
  },
};

function makeApi(overrides: Partial<ApiMock> = {}): ApiMock {
  return {
    repo: {
      openDialog: vi.fn(),
      validate: vi.fn(),
      add: vi.fn(),
      list: vi.fn().mockResolvedValue(ok({ repos: [repo], activeRepoId: repo.id })),
      setActive: vi.fn(),
      close: vi.fn(),
    },
    worktree: {
      list: vi.fn(),
      remove: vi.fn(),
    },
    config: {
      get: vi.fn().mockResolvedValue(ok({ config: jiraConfig, source: "file" as const })),
      saveJira: vi.fn(),
      saveRepository: vi.fn().mockResolvedValue(
        ok({
          config: jiraConfig,
          configPath: "/repo/.sexyworktree/config.json",
        })
      ),
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
      create: vi.fn(),
      retry: vi.fn(),
      cancel: vi.fn(),
      list: vi.fn(),
      onEvent: vi.fn(),
    },
    secrets: {
      get: vi.fn().mockResolvedValue(ok({ value: null })),
      set: vi.fn().mockResolvedValue(ok(undefined)),
      remove: vi.fn().mockResolvedValue(ok(undefined)),
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

function byTextButton(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll("button")].find(
    (el) => el.textContent?.trim() === label
  );
  if (!button) throw new Error(`button not found: ${label}`);
  return button;
}

async function clickButton(label: string): Promise<void> {
  const button = byTextButton(label);

  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function setControl(selector: string, value: string): Promise<void> {
  const control = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  if (!control) throw new Error(`control not found: ${selector}`);

  await act(async () => {
    const proto = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set;
    if (!valueSetter) throw new Error("value setter not found");
    valueSetter.call(control, value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function clickCheckbox(selector: string): Promise<void> {
  const checkbox = document.querySelector<HTMLInputElement>(selector);
  if (!checkbox) throw new Error(`checkbox not found: ${selector}`);

  await act(async () => {
    checkbox.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function expectInlineError(...messages: string[]): void {
  const alert = document.querySelector('[role="alert"]');
  expect(alert).toBeTruthy();
  const text = alert?.textContent ?? "";
  for (const message of messages) expect(text).toContain(message);
}

async function mountSettings(
  api: ApiMock,
  onClose = vi.fn()
): Promise<{ onClose: typeof onClose; unmount: () => void }> {
  vi.resetModules();
  window.api = api;

  const [{ ToastProvider }, { ReposProvider }, { Settings }, { ToastLayer }] = await Promise.all([
    import("@renderer/state/toast"),
    import("@renderer/state/repos"),
    import("@renderer/settings/Settings"),
    import("@renderer/toast/Toast"),
  ]);

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  function App(): React.JSX.Element {
    return createElement(
      ToastProvider as ComponentType<{ children: ReactNode }>,
      null,
      createElement(ToastLayer),
      createElement(
        ReposProvider as ComponentType<{ children: ReactNode }>,
        null,
        createElement(Settings, { open: true, onClose })
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

describe("Settings repository modal", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    cleanup = null;
  });

  afterEach(() => {
    cleanup?.();
    vi.restoreAllMocks();
  });

  it("shows repository navigation and saves worktree fields as full config", async () => {
    const api = makeApi({
      secrets: {
        get: vi.fn().mockResolvedValue(ok({ value: "stored-token" })),
        set: vi.fn().mockResolvedValue(ok(undefined)),
        remove: vi.fn().mockResolvedValue(ok(undefined)),
      },
    });
    const mounted = await mountSettings(api);
    cleanup = mounted.unmount;

    expect(document.body.textContent).toContain("Settings · Repository");
    expect(document.querySelector('nav[aria-label="Settings sections"]')).toBeTruthy();
    expect(byTextButton("Paths").getAttribute("aria-current")).toBe("page");

    await clickButton("Bootstrap");
    expect(byTextButton("Bootstrap").getAttribute("aria-current")).toBe("page");
    await setControl("#settings-worktree-files-to-copy", ".env.local\n.npmrc");
    await setControl("#settings-worktree-init-commands", "pnpm install\npnpm build");
    await clickButton("Save");
    await flush();

    expect(api.config.saveRepository).toHaveBeenCalledWith({
      repoPath: "/repo",
      config: expect.objectContaining({
        version: 1,
        branchValidation: { requireJiraPattern: true },
        worktree: expect.objectContaining({
          filesToCopy: [".env.local", ".npmrc"],
          initCommands: ["pnpm install", "pnpm build"],
        }),
      }),
    });
    expect(api.config.saveJira).not.toHaveBeenCalled();
    expect(mounted.onClose).toHaveBeenCalledTimes(1);
  });

  it("disables Jira fields when Enable Jira is off but preserves connection values in config", async () => {
    const api = makeApi();
    await mountSettings(api).then((mounted) => {
      cleanup = mounted.unmount;
    });

    await clickButton("Connection");
    await clickCheckbox("#settings-jira-enabled");

    expect(document.querySelector<HTMLInputElement>("#settings-jira-workspace-url")?.disabled).toBe(
      true
    );

    await clickButton("Save");
    await flush();

    expect(api.config.saveRepository).toHaveBeenCalledWith({
      repoPath: "/repo",
      config: expect.objectContaining({
        jira: expect.objectContaining({
          enabled: false,
          workspaceUrl: "https://pgmworks.atlassian.net",
          email: "imkdw@pgmworks.com",
          tokenKeychainKey: "jira.repo",
        }),
      }),
    });
  });

  it("saves disabled Jira when a connection field was cleared before disabling", async () => {
    const api = makeApi();
    const mounted = await mountSettings(api);
    cleanup = mounted.unmount;

    await clickButton("Connection");
    await setControl("#settings-jira-workspace-url", "");
    await clickCheckbox("#settings-jira-enabled");
    await clickButton("Save");
    await flush();

    expect(api.config.saveRepository).toHaveBeenCalledWith({
      repoPath: "/repo",
      config: expect.objectContaining({
        jira: {
          enabled: false,
          workspaceUrl: "",
          email: "imkdw@pgmworks.com",
          tokenKeychainKey: "jira.repo",
        },
      }),
    });
    expect(mounted.onClose).toHaveBeenCalledTimes(1);
  });

  it("saves disabled Jira from a partial new Jira form without requiring connection validation", async () => {
    const api = makeApi({
      config: {
        get: vi.fn().mockResolvedValue(ok({ config: repoConfig, source: "defaults" as const })),
        saveJira: vi.fn(),
        saveRepository: vi.fn().mockResolvedValue(
          ok({
            config: repoConfig,
            configPath: "/repo/.sexyworktree/config.json",
          })
        ),
      },
    });
    const mounted = await mountSettings(api);
    cleanup = mounted.unmount;

    await clickButton("Connection");
    await clickCheckbox("#settings-jira-enabled");
    await setControl("#settings-jira-workspace-url", "https://example.atlassian.net");
    await clickCheckbox("#settings-jira-enabled");
    await clickButton("Save");
    await flush();

    expect(api.config.saveRepository).toHaveBeenCalledWith({
      repoPath: "/repo",
      config: expect.objectContaining({
        jira: {
          enabled: false,
          workspaceUrl: "https://example.atlassian.net",
          email: "",
          tokenKeychainKey: "jira.repo",
        },
      }),
    });
    expect(mounted.onClose).toHaveBeenCalledTimes(1);
  });

  it("does not read Keychain when loading disabled Jira with a blank token key", async () => {
    const disabledBlankJiraConfig: RepoConfigDto = {
      ...repoConfig,
      jira: {
        enabled: false,
        workspaceUrl: "",
        email: "",
        tokenKeychainKey: "",
      },
    };
    const api = makeApi({
      config: {
        get: vi
          .fn()
          .mockResolvedValue(ok({ config: disabledBlankJiraConfig, source: "file" as const })),
        saveJira: vi.fn(),
        saveRepository: vi.fn(),
      },
      secrets: {
        get: vi.fn().mockResolvedValue(err({ message: "should not read token status" })),
        set: vi.fn().mockResolvedValue(ok(undefined)),
        remove: vi.fn().mockResolvedValue(ok(undefined)),
      },
    });

    const mounted = await mountSettings(api);
    cleanup = mounted.unmount;

    expect(api.secrets.get).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Cannot read Jira token status");
  });

  it("creates repo config, stores a fresh token, and closes Settings after save", async () => {
    let resolveConfigSave!: (value: SaveRepositoryResult) => void;
    const saveConfigPromise = new Promise<SaveRepositoryResult>((resolve) => {
      resolveConfigSave = resolve;
    });

    let resolveTokenSave!: (value: Ok<void>) => void;
    const saveTokenPromise = new Promise<Ok<void>>((resolve) => {
      resolveTokenSave = resolve;
    });

    const api = makeApi({
      config: {
        get: vi.fn().mockResolvedValue(ok({ config: repoConfig, source: "defaults" as const })),
        saveJira: vi.fn(),
        saveRepository: vi.fn().mockReturnValue(saveConfigPromise),
      },
      secrets: {
        get: vi.fn().mockResolvedValue(ok({ value: null })),
        set: vi.fn().mockReturnValue(saveTokenPromise),
        remove: vi.fn().mockResolvedValue(ok(undefined)),
      },
    });

    const mounted = await mountSettings(api);
    cleanup = mounted.unmount;

    await clickButton("Connection");
    await clickCheckbox("#settings-jira-enabled");
    await setControl("#settings-jira-workspace-url", "https://example.atlassian.net");
    await setControl("#settings-jira-email", "dev@example.com");
    await setControl("#settings-jira-token-key", "jira.example");
    await clickButton("Token");
    await setControl("#settings-token", "ATATT-token");
    await clickButton("Save");

    expect(document.body.textContent).toContain("Saving...");
    expect(api.config.saveRepository).toHaveBeenCalledWith({
      repoPath: "/repo",
      config: expect.objectContaining({
        jira: {
          enabled: true,
          workspaceUrl: "https://example.atlassian.net",
          email: "dev@example.com",
          tokenKeychainKey: "jira.example",
        },
      }),
    });
    expect(api.secrets.set).not.toHaveBeenCalled();
    expect(mounted.onClose).not.toHaveBeenCalled();

    resolveConfigSave(ok({ config: jiraConfig, configPath: "/repo/.sexyworktree/config.json" }));
    await flush();

    expect(api.secrets.set).toHaveBeenCalledWith({ key: "jira.example", value: "ATATT-token" });
    expect(mounted.onClose).not.toHaveBeenCalled();

    resolveTokenSave(ok(undefined));
    await flush();

    expect(mounted.onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps Settings open and explains when config saved but token storage failed", async () => {
    const api = makeApi({
      secrets: {
        get: vi.fn().mockResolvedValue(ok({ value: null })),
        set: vi.fn().mockResolvedValue(err({ message: "safeStorage encryption is not available" })),
        remove: vi.fn().mockResolvedValue(ok(undefined)),
      },
    });

    const mounted = await mountSettings(api);
    cleanup = mounted.unmount;

    await clickButton("Token");
    await setControl("#settings-token", "ATATT-token");
    await clickButton("Save");
    await flush();

    expect(mounted.onClose).not.toHaveBeenCalled();
    expect(api.config.saveRepository).toHaveBeenCalled();
    expect(api.secrets.set).toHaveBeenCalledWith({ key: "jira.repo", value: "ATATT-token" });
    expectInlineError(
      "Cannot save repository settings",
      "Repository config was saved, but the Jira token could not be stored.",
      "safeStorage encryption is not available"
    );
  });

  it("disables controls, Save, and Close while initial config is loading", async () => {
    let resolveConfigGet!: (value: Ok<{ config: RepoConfigDto; source: "file" }>) => void;
    const configGetPromise = new Promise<Ok<{ config: RepoConfigDto; source: "file" }>>(
      (resolve) => {
        resolveConfigGet = resolve;
      }
    );
    const api = makeApi({
      config: {
        get: vi.fn().mockReturnValue(configGetPromise),
        saveJira: vi.fn(),
        saveRepository: vi.fn(),
      },
    });

    const mounted = await mountSettings(api);
    cleanup = mounted.unmount;

    expect(byTextButton("Save").disabled).toBe(true);
    expect(
      document.querySelector<HTMLButtonElement>('button[aria-label="Close settings"]')?.disabled
    ).toBe(true);

    await clickButton("Save");
    expect(api.config.saveRepository).not.toHaveBeenCalled();
    expect(mounted.onClose).not.toHaveBeenCalled();

    resolveConfigGet(ok({ config: jiraConfig, source: "file" }));
    await flush();
  });

  it("keeps Save and Close disabled while clearing a stored token", async () => {
    let resolveRemove!: (value: Ok<void>) => void;
    const removePromise = new Promise<Ok<void>>((resolve) => {
      resolveRemove = resolve;
    });
    const api = makeApi({
      secrets: {
        get: vi.fn().mockResolvedValue(ok({ value: "stored" })),
        set: vi.fn().mockResolvedValue(ok(undefined)),
        remove: vi.fn().mockReturnValue(removePromise),
      },
    });

    const mounted = await mountSettings(api);
    cleanup = mounted.unmount;

    await clickButton("Token");
    await clickButton("Clear");

    expect(api.secrets.remove).toHaveBeenCalledWith({ key: "jira.repo" });
    expect(byTextButton("Save").disabled).toBe(true);
    expect(byTextButton("Clear").disabled).toBe(true);
    expect(
      document.querySelector<HTMLButtonElement>('button[aria-label="Close settings"]')?.disabled
    ).toBe(true);

    await clickButton("Save");
    expect(api.config.saveRepository).not.toHaveBeenCalled();
    expect(mounted.onClose).not.toHaveBeenCalled();

    resolveRemove(ok(undefined));
    await flush();
  });

  it("allows saving with a fresh token after token status lookup fails", async () => {
    const api = makeApi({
      secrets: {
        get: vi.fn().mockResolvedValue(err({ message: "keychain status failed" })),
        set: vi.fn().mockResolvedValue(ok(undefined)),
        remove: vi.fn().mockResolvedValue(ok(undefined)),
      },
    });

    const mounted = await mountSettings(api);
    cleanup = mounted.unmount;

    expectInlineError("Cannot save repository settings", "keychain status failed");

    await clickButton("Token");
    await setControl("#settings-token", "ATATT-token");
    await clickButton("Save");
    await flush();

    expect(api.config.saveRepository).toHaveBeenCalled();
    expect(api.secrets.set).toHaveBeenCalledWith({ key: "jira.repo", value: "ATATT-token" });
    expect(mounted.onClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      selector: "#settings-worktree-base-dir",
      section: "Paths",
      message: "Enter a worktree base directory.",
    },
    {
      selector: "#settings-worktree-default-base-branch",
      section: "Paths",
      message: "Enter a default base branch.",
    },
    {
      selector: "#settings-worktree-install-command",
      section: "Bootstrap",
      message: "Enter an install command.",
    },
  ])(
    "shows a specific inline error when required $selector is missing",
    async ({ selector, section, message }) => {
      const api = makeApi();
      const mounted = await mountSettings(api);
      cleanup = mounted.unmount;

      await clickButton(section);
      await setControl(selector, "");
      await clickButton("Save");
      await flush();

      expect(api.config.saveRepository).not.toHaveBeenCalled();
      expect(mounted.onClose).not.toHaveBeenCalled();
      expectInlineError(
        "Cannot save repository settings",
        message,
        "/repo/.sexyworktree/config.json"
      );
    }
  );

  it.each([
    {
      selector: "#settings-jira-workspace-url",
      message: "Enter a Jira workspace URL.",
    },
    {
      selector: "#settings-jira-email",
      message: "Enter the Jira account email.",
    },
    {
      selector: "#settings-jira-token-key",
      message: "Enter a Keychain token key.",
    },
  ])(
    "shows a specific inline error when required Jira $selector is missing",
    async ({ selector, message }) => {
      const api = makeApi({
        secrets: {
          get: vi.fn().mockResolvedValue(ok({ value: "stored-token" })),
          set: vi.fn().mockResolvedValue(ok(undefined)),
          remove: vi.fn().mockResolvedValue(ok(undefined)),
        },
      });
      const mounted = await mountSettings(api);
      cleanup = mounted.unmount;

      await clickButton("Connection");
      await setControl(selector, "");
      await clickButton("Save");
      await flush();

      expect(api.config.saveRepository).not.toHaveBeenCalled();
      expect(api.secrets.set).not.toHaveBeenCalled();
      expect(mounted.onClose).not.toHaveBeenCalled();
      expectInlineError(
        "Cannot save repository settings",
        message,
        "/repo/.sexyworktree/config.json"
      );
    }
  );

  it("keeps Settings open and shows a config write error before storing the token", async () => {
    const api = makeApi({
      config: {
        get: vi.fn().mockResolvedValue(ok({ config: jiraConfig, source: "file" as const })),
        saveJira: vi.fn(),
        saveRepository: vi
          .fn()
          .mockResolvedValue(err({ kind: "write-failed", message: "permission denied" })),
      },
    });

    const mounted = await mountSettings(api);
    cleanup = mounted.unmount;

    await clickButton("Token");
    await setControl("#settings-token", "ATATT-token");
    await clickButton("Save");
    await flush();

    expect(mounted.onClose).not.toHaveBeenCalled();
    expect(api.secrets.set).not.toHaveBeenCalled();
    expectInlineError("Cannot save repository settings", "permission denied");
  });

  it("keeps token status and shows an error toast when Clear fails", async () => {
    const api = makeApi({
      secrets: {
        get: vi.fn().mockResolvedValue(ok({ value: "stored" })),
        set: vi.fn().mockResolvedValue(ok(undefined)),
        remove: vi.fn().mockResolvedValue(err({ message: "keychain remove failed" })),
      },
    });

    const mounted = await mountSettings(api);
    cleanup = mounted.unmount;

    await clickButton("Token");
    expect(document.body.textContent).toContain("Token stored in Keychain");

    await clickButton("Clear");
    await flush();

    expect(api.secrets.remove).toHaveBeenCalledWith({ key: "jira.repo" });
    expect(document.body.textContent).toContain("Token stored in Keychain");
    expect(document.body.textContent).toContain("Failed to clear token");
    expect(document.body.textContent).toContain("keychain remove failed");
  });

  it("requires a new token when the token key changes away from the stored key while Jira is enabled", async () => {
    const api = makeApi({
      secrets: {
        get: vi.fn().mockResolvedValue(ok({ value: "stored-token" })),
        set: vi.fn().mockResolvedValue(ok(undefined)),
        remove: vi.fn().mockResolvedValue(ok(undefined)),
      },
    });

    const mounted = await mountSettings(api);
    cleanup = mounted.unmount;

    await clickButton("Token");
    expect(document.body.textContent).toContain("Token stored in Keychain");

    await clickButton("Connection");
    await setControl("#settings-jira-token-key", "jira.changed");
    await clickButton("Token");
    expect(document.body.textContent).toContain("No token stored");

    await clickButton("Save");
    await flush();

    expect(api.config.saveRepository).not.toHaveBeenCalled();
    expect(api.secrets.set).not.toHaveBeenCalled();
    expect(mounted.onClose).not.toHaveBeenCalled();
    expectInlineError(
      "Cannot save repository settings",
      "/repo/.sexyworktree/config.json",
      "Enter a Jira API token before saving."
    );
  });
});
