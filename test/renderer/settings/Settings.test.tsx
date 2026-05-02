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
type SaveJiraResult = Ok<{ config: RepoConfigDto; configPath: string }>;

const repo: RepoRow = {
  id: 1,
  path: "/repo",
  name: "repo",
  lastActiveAt: 1,
};

const jiraConfig: RepoConfigDto = {
  version: 1,
  worktree: {
    baseDir: "../worktrees",
    defaultBaseBranch: "main",
    filesToCopy: [],
    installCommand: "true",
    initCommands: [],
    defaultStartupCommand: "",
  },
  jira: {
    enabled: true,
    workspaceUrl: "https://example.atlassian.net",
    email: "dev@example.com",
    tokenKeychainKey: "jira.repo",
  },
};

function makeConfigWithoutJira(): RepoConfigDto {
  return {
    version: jiraConfig.version,
    worktree: {
      ...jiraConfig.worktree,
      filesToCopy: [...jiraConfig.worktree.filesToCopy],
      initCommands: [...jiraConfig.worktree.initCommands],
    },
  };
}

function makeApi(overrides: Partial<ApiMock> = {}): ApiMock {
  const api = {
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
      saveJira: vi.fn().mockResolvedValue(
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

  return api;
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

async function typeToken(value: string): Promise<void> {
  await setInput("#settings-token", value);
}

async function clickButton(label: string): Promise<void> {
  const button = [...document.querySelectorAll("button")].find(
    (el) => el.textContent?.trim() === label
  );
  if (!button) throw new Error(`button not found: ${label}`);

  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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

describe("Settings Jira token save UX", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    cleanup = null;
  });

  afterEach(() => {
    cleanup?.();
    vi.restoreAllMocks();
  });

  it("creates repo Jira config, stores the token, and closes Settings after save", async () => {
    let resolveConfigSave!: (value: SaveJiraResult) => void;
    const saveConfigPromise = new Promise<SaveJiraResult>((resolve) => {
      resolveConfigSave = resolve;
    });

    let resolveTokenSave!: (value: Ok<void>) => void;
    const saveTokenPromise = new Promise<Ok<void>>((resolve) => {
      resolveTokenSave = resolve;
    });

    const api = makeApi({
      config: {
        get: vi
          .fn()
          .mockResolvedValue(ok({ config: makeConfigWithoutJira(), source: "defaults" as const })),
        saveJira: vi.fn().mockReturnValue(saveConfigPromise),
      },
      secrets: {
        get: vi.fn().mockResolvedValue(ok({ value: null })),
        set: vi.fn().mockReturnValue(saveTokenPromise),
        remove: vi.fn().mockResolvedValue(ok(undefined)),
      },
    });

    const mounted = await mountSettings(api);
    cleanup = mounted.unmount;

    await setInput("#settings-jira-workspace-url", "https://example.atlassian.net");
    await setInput("#settings-jira-email", "dev@example.com");
    await setInput("#settings-jira-token-key", "jira.example");
    await typeToken("ATATT-token");
    await clickButton("Save");

    expect(document.body.textContent).toContain("Saving...");
    expect(api.config.saveJira).toHaveBeenCalledWith({
      repoPath: "/repo",
      jira: {
        enabled: true,
        workspaceUrl: "https://example.atlassian.net",
        email: "dev@example.com",
        tokenKeychainKey: "jira.example",
      },
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
      config: {
        get: vi.fn().mockResolvedValue(ok({ config: jiraConfig, source: "file" as const })),
        saveJira: vi.fn().mockResolvedValue(
          ok({
            config: jiraConfig,
            configPath: "/repo/.sexyworktree/config.json",
          })
        ),
      },
      secrets: {
        get: vi.fn().mockResolvedValue(ok({ value: null })),
        set: vi.fn().mockResolvedValue(err({ message: "safeStorage encryption is not available" })),
        remove: vi.fn().mockResolvedValue(ok(undefined)),
      },
    });

    const mounted = await mountSettings(api);
    cleanup = mounted.unmount;

    await typeToken("ATATT-token");
    await clickButton("Save");
    await flush();

    expect(mounted.onClose).not.toHaveBeenCalled();
    expect(api.config.saveJira).toHaveBeenCalled();
    expect(api.secrets.set).toHaveBeenCalledWith({ key: "jira.repo", value: "ATATT-token" });
    expect(document.body.textContent).toContain("Cannot save Jira settings");
    expect(document.body.textContent).toContain(
      "Jira config was saved, but the token could not be stored."
    );
    expect(document.body.textContent).toContain("safeStorage encryption is not available");
  });

  it("disables Settings fields, Save, and Close while initial Jira config is loading", async () => {
    let resolveConfigGet!: (value: Ok<{ config: RepoConfigDto; source: "file" }>) => void;
    const configGetPromise = new Promise<Ok<{ config: RepoConfigDto; source: "file" }>>(
      (resolve) => {
        resolveConfigGet = resolve;
      }
    );
    const api = makeApi({
      config: {
        get: vi.fn().mockReturnValue(configGetPromise),
        saveJira: vi.fn().mockResolvedValue(
          ok({
            config: jiraConfig,
            configPath: "/repo/.sexyworktree/config.json",
          })
        ),
      },
    });

    const mounted = await mountSettings(api);
    cleanup = mounted.unmount;

    for (const selector of [
      "#settings-jira-workspace-url",
      "#settings-jira-email",
      "#settings-jira-token-key",
      "#settings-token",
    ]) {
      expect(document.querySelector<HTMLInputElement>(selector)?.disabled).toBe(true);
    }

    const saveButton = [...document.querySelectorAll("button")].find(
      (el) => el.textContent?.trim() === "Save"
    );
    const closeButton = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Close settings"]'
    );

    expect(saveButton?.disabled).toBe(true);
    expect(closeButton?.disabled).toBe(true);

    await clickButton("Save");
    closeButton?.click();

    expect(api.config.saveJira).not.toHaveBeenCalled();
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

    await clickButton("Clear");

    const saveButton = [...document.querySelectorAll("button")].find(
      (el) => el.textContent?.trim() === "Save"
    );
    const clearButton = [...document.querySelectorAll("button")].find(
      (el) => el.textContent?.trim() === "Clear"
    );
    const closeButton = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Close settings"]'
    );

    expect(api.secrets.remove).toHaveBeenCalledWith({ key: "jira.repo" });
    expect(saveButton?.disabled).toBe(true);
    expect(clearButton?.disabled).toBe(true);
    expect(closeButton?.disabled).toBe(true);

    await clickButton("Save");
    closeButton?.click();

    expect(api.config.saveJira).not.toHaveBeenCalled();
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

    expectInlineError("Cannot save Jira settings", "keychain status failed");

    await typeToken("ATATT-token");
    await clickButton("Save");
    await flush();

    expect(api.config.saveJira).toHaveBeenCalledWith({
      repoPath: "/repo",
      jira: {
        enabled: true,
        workspaceUrl: "https://example.atlassian.net",
        email: "dev@example.com",
        tokenKeychainKey: "jira.repo",
      },
    });
    expect(api.secrets.set).toHaveBeenCalledWith({ key: "jira.repo", value: "ATATT-token" });
    expect(mounted.onClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      name: "workspace URL",
      inputs: {
        token: "ATATT-token",
        email: "dev@example.com",
        tokenKey: "jira.example",
      },
      message: "Enter a Jira workspace URL.",
    },
    {
      name: "email",
      inputs: {
        workspaceUrl: "https://example.atlassian.net",
        token: "ATATT-token",
        tokenKey: "jira.example",
      },
      message: "Enter the Jira account email.",
    },
    {
      name: "token key",
      inputs: {
        workspaceUrl: "https://example.atlassian.net",
        email: "dev@example.com",
        token: "ATATT-token",
      },
      message: "Enter a Keychain token key.",
    },
  ])(
    "shows a specific inline error when required Jira $name is missing",
    async ({ inputs, message }) => {
      const api = makeApi({
        config: {
          get: vi.fn().mockResolvedValue(
            ok({
              config: makeConfigWithoutJira(),
              source: "defaults" as const,
            })
          ),
          saveJira: vi.fn().mockResolvedValue(
            ok({
              config: jiraConfig,
              configPath: "/repo/.sexyworktree/config.json",
            })
          ),
        },
      });

      const mounted = await mountSettings(api);
      cleanup = mounted.unmount;

      const tokenKeyInput = document.querySelector<HTMLInputElement>("#settings-jira-token-key");
      expect(tokenKeyInput?.value).toBe("jira.repo");

      if (inputs.workspaceUrl) {
        await setInput("#settings-jira-workspace-url", inputs.workspaceUrl);
      }
      if (inputs.email) {
        await setInput("#settings-jira-email", inputs.email);
      }
      if (inputs.tokenKey) {
        await setInput("#settings-jira-token-key", inputs.tokenKey);
      } else if (message === "Enter a Keychain token key.") {
        await setInput("#settings-jira-token-key", "");
      }
      await typeToken(inputs.token);
      await clickButton("Save");
      await flush();

      expect(api.config.saveJira).not.toHaveBeenCalled();
      expect(api.secrets.set).not.toHaveBeenCalled();
      expect(mounted.onClose).not.toHaveBeenCalled();
      expectInlineError("Cannot save Jira settings", message, "/repo/.sexyworktree/config.json");
    }
  );

  it("keeps Settings open and shows a config write error before storing the token", async () => {
    const api = makeApi({
      config: {
        get: vi.fn().mockResolvedValue(ok({ config: jiraConfig, source: "file" as const })),
        saveJira: vi
          .fn()
          .mockResolvedValue(err({ kind: "write-failed", message: "permission denied" })),
      },
    });

    const mounted = await mountSettings(api);
    cleanup = mounted.unmount;

    await typeToken("ATATT-token");
    await clickButton("Save");
    await flush();

    expect(mounted.onClose).not.toHaveBeenCalled();
    expect(api.secrets.set).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Cannot save Jira settings");
    expect(document.body.textContent).toContain("permission denied");
  });

  it("disables the close button while saving", async () => {
    const savePromise = new Promise<Ok<void>>(() => {});
    const api = makeApi({
      secrets: {
        get: vi.fn().mockResolvedValue(ok({ value: null })),
        set: vi.fn().mockReturnValue(savePromise),
        remove: vi.fn().mockResolvedValue(ok(undefined)),
      },
    });

    const mounted = await mountSettings(api);
    cleanup = mounted.unmount;

    await typeToken("ATATT-token");
    await clickButton("Save");

    const closeButton = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Close settings"]'
    );

    expect(closeButton).toBeDefined();
    expect(closeButton!.disabled).toBe(true);
    closeButton!.click();
    expect(mounted.onClose).not.toHaveBeenCalled();
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

    expect(document.body.textContent).toContain("Token stored in Keychain");

    await clickButton("Clear");
    await flush();

    expect(api.secrets.remove).toHaveBeenCalledWith({ key: "jira.repo" });
    expect(document.body.textContent).toContain("Token stored in Keychain");
    expect(document.body.textContent).toContain("Failed to clear token");
    expect(document.body.textContent).toContain("keychain remove failed");
  });

  it("requires a new token when the token key changes away from the stored key", async () => {
    const api = makeApi({
      secrets: {
        get: vi.fn().mockResolvedValue(ok({ value: "stored-token" })),
        set: vi.fn().mockResolvedValue(ok(undefined)),
        remove: vi.fn().mockResolvedValue(ok(undefined)),
      },
    });

    const mounted = await mountSettings(api);
    cleanup = mounted.unmount;

    expect(document.body.textContent).toContain("Token stored in Keychain");

    await setInput("#settings-jira-token-key", "jira.changed");
    expect(document.body.textContent).toContain("No token stored");
    expect(document.body.textContent).not.toContain("Token stored in Keychain");

    await clickButton("Save");
    await flush();

    expect(api.config.saveJira).not.toHaveBeenCalled();
    expect(api.secrets.set).not.toHaveBeenCalled();
    expect(mounted.onClose).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("No token stored");
    expectInlineError(
      "Cannot save Jira settings",
      "/repo/.sexyworktree/config.json",
      "Enter a Jira API token before saving."
    );
  });
});
