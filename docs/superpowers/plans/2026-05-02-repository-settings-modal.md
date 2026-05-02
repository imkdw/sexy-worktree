# Repository Settings Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current Jira-only Settings modal into a Radix Dialog repository settings editor that can update `.sexyworktree/config.json` worktree and Jira settings through the GUI.

**Architecture:** Keep Settings as a renderer-owned Radix Dialog with a fixed large modal, left section tree, and right editor panel. Add a main-process whole-config save primitive that validates `RepoConfig` with `repoConfigSchema` and writes atomically; Jira API tokens remain in Keychain through the existing `secrets:*` IPC channels.

**Tech Stack:** Electron 41, React 19, TypeScript 6, Radix Dialog, Tailwind v4 design tokens, zod, Vitest/jsdom, `node:fs/promises`, existing IPC bridge, existing Keychain abstraction.

---

## Scope

This plan covers repository-local config editing for:

- `worktree.baseDir`
- `worktree.defaultBaseBranch`
- `worktree.filesToCopy`
- `worktree.installCommand`
- `worktree.initCommands`
- `worktree.defaultStartupCommand`
- `jira.enabled`
- `jira.workspaceUrl`
- `jira.email`
- `jira.tokenKeychainKey`
- Jira token storage and clearing through Keychain only

This plan does not add `branchValidation` UI. It also does not validate Jira credentials against Atlassian during save.

## File Structure

- Modify `src/shared/ipc.ts`: add `config:saveRepository` input/output types.
- Modify `src/preload/index.ts`: expose `api.config.saveRepository`.
- Modify `src/renderer/ipc/api.ts`: add renderer API type for `saveRepository`.
- Create `src/main/config/saveRepository.ts`: whole-config validation and atomic write.
- Modify `src/main/config/saveJira.ts`: optionally delegate to the new whole-config save helper after merging Jira.
- Modify `src/main/ipc/config.ts`: validate `config:saveRepository` payload and register the IPC handler.
- Test `test/main/config/saveRepository.test.ts`: main-process config save behavior.
- Modify `src/renderer/ui/Dialog.tsx`: add a settings-size dialog option or allow settings-specific className override without breaking existing modals.
- Replace or split `src/renderer/settings/Settings.tsx`: repository settings shell, left nav, panels, save flow, token flow.
- Optional create `src/renderer/settings/settingsForm.ts`: pure helpers for line-array conversion, config normalization, and field defaults.
- Test `test/renderer/settings/Settings.test.tsx`: update existing Jira-focused tests to repository-settings behavior.

## Task 1: Add Whole-Config Save In Main Process

**Files:**

- Create: `src/main/config/saveRepository.ts`
- Modify: `src/main/config/saveJira.ts`
- Test: `test/main/config/saveRepository.test.ts`

- [ ] **Step 1: Write failing tests for repository config save**

Create `test/main/config/saveRepository.test.ts`:

```ts
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveRepositoryConfig } from "../../src/main/config/saveRepository";
import { DEFAULT_CONFIG } from "../../src/main/config/defaults";
import type { RepoConfig } from "../../src/main/config/schema";

function tmpRepo(): string {
  return mkdtempSync(join(tmpdir(), "sexy-worktree-config-"));
}

function readConfig(repoPath: string): RepoConfig {
  return JSON.parse(readFileSync(join(repoPath, ".sexyworktree/config.json"), "utf8"));
}

describe("saveRepositoryConfig", () => {
  afterEach(() => vi.restoreAllMocks());

  it("creates .sexyworktree/config.json from a full valid config", async () => {
    const repoPath = tmpRepo();
    const config: RepoConfig = {
      ...DEFAULT_CONFIG,
      worktree: {
        ...DEFAULT_CONFIG.worktree,
        baseDir: "../custom-worktrees",
        defaultBaseBranch: "develop",
        filesToCopy: [".env.local"],
        installCommand: "pnpm install",
        initCommands: ["pnpm build"],
        defaultStartupCommand: "pnpm dev",
      },
      jira: {
        enabled: true,
        workspaceUrl: "https://pgmworks.atlassian.net",
        email: "imkdw@pgmworks.com",
        tokenKeychainKey: "jira.ppl-monorepo",
      },
    };

    const result = await saveRepositoryConfig({ repoPath, config });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.configPath).toBe(join(repoPath, ".sexyworktree/config.json"));
    expect(readConfig(repoPath)).toEqual(config);
  });

  it("stores disabled Jira without deleting the Jira connection fields", async () => {
    const repoPath = tmpRepo();
    const config: RepoConfig = {
      ...DEFAULT_CONFIG,
      jira: {
        enabled: false,
        workspaceUrl: "https://pgmworks.atlassian.net",
        email: "imkdw@pgmworks.com",
        tokenKeychainKey: "jira.ppl-monorepo",
      },
    };

    const result = await saveRepositoryConfig({ repoPath, config });

    expect(result.ok).toBe(true);
    expect(readConfig(repoPath).jira).toEqual(config.jira);
  });

  it("returns invalid issues and does not write when config fails schema validation", async () => {
    const repoPath = tmpRepo();
    const result = await saveRepositoryConfig({
      repoPath,
      config: {
        ...DEFAULT_CONFIG,
        worktree: { ...DEFAULT_CONFIG.worktree, baseDir: "" },
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalid");
    expect(result.error.issues.join(" ")).toContain("worktree.baseDir");
  });

  it("replaces an existing config atomically", async () => {
    const repoPath = tmpRepo();
    const configPath = join(repoPath, ".sexyworktree/config.json");
    writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG), { flag: "wx" });

    const nextConfig: RepoConfig = {
      ...DEFAULT_CONFIG,
      worktree: { ...DEFAULT_CONFIG.worktree, defaultBaseBranch: "release" },
    };

    const result = await saveRepositoryConfig({ repoPath, config: nextConfig });

    expect(result.ok).toBe(true);
    expect(readConfig(repoPath).worktree.defaultBaseBranch).toBe("release");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
pnpm vitest run test/main/config/saveRepository.test.ts
```

Expected: fail because `src/main/config/saveRepository.ts` does not exist.

- [ ] **Step 3: Implement `saveRepositoryConfig`**

Create `src/main/config/saveRepository.ts`:

```ts
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { ok, err, type Result } from "@shared/result";
import { repoConfigSchema, type RepoConfig } from "./schema";
import { repoConfigPath } from "./path";

export type SaveRepositoryConfigError =
  | { kind: "invalid"; issues: string[] }
  | { kind: "write-failed"; message: string };

export type SaveRepositoryConfigInput = {
  repoPath: string;
  config: RepoConfig;
};

export async function saveRepositoryConfig(
  args: SaveRepositoryConfigInput
): Promise<Result<{ config: RepoConfig; configPath: string }, SaveRepositoryConfigError>> {
  const parsed = repoConfigSchema.safeParse(args.config);
  if (!parsed.success) {
    return err({
      kind: "invalid",
      issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    });
  }

  const configPath = repoConfigPath(args.repoPath);
  const configDir = dirname(configPath);
  let tempPath: string | undefined;

  try {
    await mkdir(configDir, { recursive: true });
    tempPath = `${configPath}.${randomUUID()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(parsed.data, null, 2)}\n`, "utf8");
    await rename(tempPath, configPath);
  } catch (error) {
    if (tempPath !== undefined) {
      await rm(tempPath, { force: true }).catch(() => undefined);
    }
    return err({ kind: "write-failed", message: (error as Error).message });
  }

  return ok({ config: parsed.data, configPath });
}
```

- [ ] **Step 4: Update `saveJiraConfig` to reuse the writer**

In `src/main/config/saveJira.ts`, keep the existing load-and-merge behavior, but replace the direct write block with:

```ts
import { saveRepositoryConfig } from "./saveRepository";
```

Then after constructing `nextConfig`, call:

```ts
const saved = await saveRepositoryConfig({ repoPath: args.repoPath, config: nextConfig });
if (!saved.ok) return err(saved.error);
return ok(saved.value);
```

Remove duplicated `randomUUID`, `mkdir`, `rename`, `rm`, `writeFile`, and `dirname` imports from `saveJira.ts` after delegation.

- [ ] **Step 5: Run main config tests**

Run:

```bash
pnpm vitest run test/main/config/saveRepository.test.ts test/main/config/saveJira.test.ts test/main/config/load.test.ts
```

Expected: PASS.

## Task 2: Add IPC Contract For Whole-Config Save

**Files:**

- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/ipc/api.ts`
- Modify: `src/main/ipc/config.ts`
- Test: extend `test/main/config/saveRepository.test.ts` only if pure handler tests are not present

- [ ] **Step 1: Add shared IPC type**

In `src/shared/ipc.ts`, add this channel next to `config:saveJira`:

```ts
"config:saveRepository": {
  in: {
    repoPath: string;
    config: RepoConfigDto;
  };
  out: Result<{ config: RepoConfigDto; configPath: string }, ConfigSaveError>;
};
```

- [ ] **Step 2: Expose the invoker in preload and renderer API**

In `src/preload/index.ts`:

```ts
config: {
  get: makeInvoker("config:get"),
  saveJira: makeInvoker("config:saveJira"),
  saveRepository: makeInvoker("config:saveRepository"),
},
```

In `src/renderer/ipc/api.ts`:

```ts
config: {
  get: Invoker<"config:get">;
  saveJira: Invoker<"config:saveJira">;
  saveRepository: Invoker<"config:saveRepository">;
}
```

- [ ] **Step 3: Register the IPC handler**

In `src/main/ipc/config.ts`, import `repoConfigSchema` and `saveRepositoryConfig`:

```ts
import { repoConfigSchema } from "../config/schema";
import { saveRepositoryConfig } from "../config/saveRepository";
```

Add payload guard:

```ts
function isSaveRepositoryArgs(value: unknown): value is IpcIn<"config:saveRepository"> {
  if (!isRecord(value)) return false;
  if (typeof value.repoPath !== "string") return false;
  return repoConfigSchema.safeParse(value.config).success;
}
```

Register:

```ts
ipcMain.handle(
  "config:saveRepository",
  async (_e, args: unknown): Promise<IpcOut<"config:saveRepository">> => {
    if (!isSaveRepositoryArgs(args)) {
      return err({
        kind: "invalid",
        issues: ["config:saveRepository payload is malformed"],
      });
    }

    const r = await saveRepositoryConfig({
      repoPath: args.repoPath,
      config: args.config,
    });

    if (!r.ok) return err(r.error);
    return ok({ config: r.value.config as RepoConfigDto, configPath: r.value.configPath });
  }
);
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

## Task 3: Add Settings Form Helpers

**Files:**

- Create: `src/renderer/settings/settingsForm.ts`
- Test: `test/renderer/settings/settingsForm.test.ts`

- [ ] **Step 1: Write helper tests**

Create `test/renderer/settings/settingsForm.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  linesToArray,
  arrayToLines,
  normalizeRepositorySettingsForm,
  type RepositorySettingsForm,
} from "../../../src/renderer/settings/settingsForm";

describe("settingsForm", () => {
  it("converts arrays to newline text and back while dropping empty lines", () => {
    expect(arrayToLines([".env.local", ".npmrc"])).toBe(".env.local\n.npmrc");
    expect(linesToArray(" .env.local \n\n .npmrc \n")).toEqual([".env.local", ".npmrc"]);
  });

  it("normalizes worktree and enabled Jira form values", () => {
    const form: RepositorySettingsForm = {
      worktree: {
        baseDir: " ../worktrees ",
        defaultBaseBranch: " main ",
        filesToCopyText: ".env.local\n",
        installCommand: " yarn install ",
        initCommandsText: "yarn build\n\n",
        defaultStartupCommand: " yarn dev ",
      },
      jira: {
        enabled: true,
        workspaceUrl: " https://pgmworks.atlassian.net ",
        email: " imkdw@pgmworks.com ",
        tokenKeychainKey: " jira.ppl-monorepo ",
      },
    };

    expect(normalizeRepositorySettingsForm(form)).toEqual({
      version: 1,
      worktree: {
        baseDir: "../worktrees",
        defaultBaseBranch: "main",
        filesToCopy: [".env.local"],
        installCommand: "yarn install",
        initCommands: ["yarn build"],
        defaultStartupCommand: "yarn dev",
      },
      jira: {
        enabled: true,
        workspaceUrl: "https://pgmworks.atlassian.net",
        email: "imkdw@pgmworks.com",
        tokenKeychainKey: "jira.ppl-monorepo",
      },
    });
  });
});
```

- [ ] **Step 2: Implement helpers**

Create `src/renderer/settings/settingsForm.ts`:

```ts
import type { RepoConfigDto } from "@shared/ipc";

export type RepositorySettingsForm = {
  worktree: {
    baseDir: string;
    defaultBaseBranch: string;
    filesToCopyText: string;
    installCommand: string;
    initCommandsText: string;
    defaultStartupCommand: string;
  };
  jira: {
    enabled: boolean;
    workspaceUrl: string;
    email: string;
    tokenKeychainKey: string;
  };
};

export function arrayToLines(values: string[]): string {
  return values.join("\n");
}

export function linesToArray(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function formFromConfig(
  config: RepoConfigDto,
  defaultTokenKey: string
): RepositorySettingsForm {
  return {
    worktree: {
      baseDir: config.worktree.baseDir,
      defaultBaseBranch: config.worktree.defaultBaseBranch,
      filesToCopyText: arrayToLines(config.worktree.filesToCopy),
      installCommand: config.worktree.installCommand,
      initCommandsText: arrayToLines(config.worktree.initCommands),
      defaultStartupCommand: config.worktree.defaultStartupCommand,
    },
    jira: {
      enabled: config.jira?.enabled ?? false,
      workspaceUrl: config.jira?.workspaceUrl ?? "",
      email: config.jira?.email ?? "",
      tokenKeychainKey: config.jira?.tokenKeychainKey ?? defaultTokenKey,
    },
  };
}

export function normalizeRepositorySettingsForm(form: RepositorySettingsForm): RepoConfigDto {
  return {
    version: 1,
    worktree: {
      baseDir: form.worktree.baseDir.trim(),
      defaultBaseBranch: form.worktree.defaultBaseBranch.trim(),
      filesToCopy: linesToArray(form.worktree.filesToCopyText),
      installCommand: form.worktree.installCommand.trim(),
      initCommands: linesToArray(form.worktree.initCommandsText),
      defaultStartupCommand: form.worktree.defaultStartupCommand.trim(),
    },
    jira: {
      enabled: form.jira.enabled,
      workspaceUrl: form.jira.workspaceUrl.trim(),
      email: form.jira.email.trim(),
      tokenKeychainKey: form.jira.tokenKeychainKey.trim(),
    },
  };
}
```

- [ ] **Step 3: Run helper tests**

Run:

```bash
pnpm vitest run test/renderer/settings/settingsForm.test.ts
```

Expected: PASS.

## Task 4: Rebuild Settings As Repository Dialog

**Files:**

- Modify: `src/renderer/ui/Dialog.tsx`
- Modify: `src/renderer/settings/Settings.tsx`
- Test: `test/renderer/settings/Settings.test.tsx`

- [ ] **Step 1: Extend Dialog sizing**

In `src/renderer/ui/Dialog.tsx`, change:

```ts
size?: "normal" | "wide";
```

to:

```ts
size?: "normal" | "wide" | "settings";
```

Change the size class expression to include:

```ts
size === "normal"
  ? "w-modal"
  : size === "wide"
    ? "w-modal-wide"
    : "h-[min(680px,90vh)] w-[min(980px,95vw)] p-0";
```

Keep the existing overlay, border, radius, and `bg-surface` tokens.

- [ ] **Step 2: Update Settings test harness API mock**

In `test/renderer/settings/Settings.test.tsx`, update mock API config shape to include:

```ts
config: {
  get: vi.fn().mockResolvedValue(ok({ config: jiraConfig, source: "file" as const })),
  saveJira: vi.fn(),
  saveRepository: vi.fn().mockResolvedValue(
    ok({ config: jiraConfig, configPath: "/repo/.sexyworktree/config.json" })
  ),
},
```

- [ ] **Step 3: Add renderer tests for nav and full-config save**

Add tests to `test/renderer/settings/Settings.test.tsx`:

```ts
it("shows repository settings navigation and saves worktree fields as full config", async () => {
  const api = makeApi({
    config: {
      get: vi.fn().mockResolvedValue(ok({ config: jiraConfig, source: "file" as const })),
      saveJira: vi.fn(),
      saveRepository: vi
        .fn()
        .mockResolvedValue(
          ok({ config: jiraConfig, configPath: "/repo/.sexyworktree/config.json" })
        ),
    },
  });
  const mounted = await mountSettings(api);

  await screen.findByText("Settings · Repository");
  await userEvent.click(screen.getByRole("button", { name: "Bootstrap" }));
  await userEvent.clear(screen.getByLabelText("Files to Copy"));
  await userEvent.type(screen.getByLabelText("Files to Copy"), ".env.local\n.npmrc");
  await userEvent.clear(screen.getByLabelText("Init Commands"));
  await userEvent.type(screen.getByLabelText("Init Commands"), "pnpm install\npnpm build");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(api.config.saveRepository).toHaveBeenCalledWith({
    repoPath: "/repo",
    config: expect.objectContaining({
      version: 1,
      worktree: expect.objectContaining({
        filesToCopy: [".env.local", ".npmrc"],
        initCommands: ["pnpm install", "pnpm build"],
      }),
    }),
  });
  expect(api.config.saveJira).not.toHaveBeenCalled();
  expect(mounted.onClose).toHaveBeenCalled();
});

it("disables Jira fields when Enable Jira is off but preserves connection values in config", async () => {
  const api = makeApi();
  await mountSettings(api);

  await screen.findByText("Settings · Repository");
  await userEvent.click(screen.getByRole("button", { name: "Jira" }));
  await userEvent.click(screen.getByRole("button", { name: "Connection" }));
  await userEvent.click(screen.getByRole("checkbox", { name: "Enable Jira" }));

  expect(screen.getByLabelText("Workspace URL")).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

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
```

Adjust labels to match the final component text exactly.

- [ ] **Step 4: Implement Settings shell state**

In `src/renderer/settings/Settings.tsx`, replace Jira-only field state with:

```ts
type SettingsSection =
  | "worktree-paths"
  | "worktree-bootstrap"
  | "worktree-startup"
  | "jira-connection"
  | "jira-token";

const [section, setSection] = useState<SettingsSection>("worktree-paths");
const [form, setForm] = useState<RepositorySettingsForm | null>(null);
const [token, setToken] = useState("");
const [tokenPresent, setTokenPresent] = useState(false);
const [storedTokenKey, setStoredTokenKey] = useState<string | null>(null);
const [loading, setLoading] = useState(false);
const [saving, setSaving] = useState(false);
const [clearing, setClearing] = useState(false);
const [loadingError, setLoadingError] = useState<string | null>(null);
const [saveError, setSaveError] = useState<string | null>(null);
const [supportingError, setSupportingError] = useState<string | null>(null);
```

Use `formFromConfig(config, defaultTokenKey(repo.name))` inside the existing load effect. Keep `secrets:get` only for the current token key when Jira config exists.

- [ ] **Step 5: Implement left nav**

Use buttons, not text-only divs, so tests and keyboard users can select sections:

```tsx
<nav className="bg-background border-border-subtle w-[232px] shrink-0 border-r py-4">
  <SettingsNavGroup title="Worktree">
    <SettingsNavButton
      active={section === "worktree-paths"}
      onClick={() => setSection("worktree-paths")}
    >
      Paths
    </SettingsNavButton>
    <SettingsNavButton
      active={section === "worktree-bootstrap"}
      onClick={() => setSection("worktree-bootstrap")}
    >
      Bootstrap
    </SettingsNavButton>
    <SettingsNavButton
      active={section === "worktree-startup"}
      onClick={() => setSection("worktree-startup")}
    >
      Startup
    </SettingsNavButton>
  </SettingsNavGroup>
  <SettingsNavGroup title="Jira">
    <SettingsNavButton
      active={section === "jira-connection"}
      onClick={() => setSection("jira-connection")}
    >
      Connection
    </SettingsNavButton>
    <SettingsNavButton active={section === "jira-token"} onClick={() => setSection("jira-token")}>
      Token
    </SettingsNavButton>
  </SettingsNavGroup>
</nav>
```

Use only `lucide-react` icons if icons are added. Do not use emoji or Unicode symbols.

- [ ] **Step 6: Implement right panels**

Use tokenized inputs and textareas:

```tsx
const INPUT_CLASS =
  "border-border-strong bg-elevated text-text-primary focus:border-accent focus:outline-accent-soft rounded-md border px-3 py-2 font-mono text-base focus:outline-2 disabled:cursor-not-allowed disabled:opacity-40";

const TEXTAREA_CLASS = cn(
  INPUT_CLASS,
  "scrollbar-hidden min-h-[112px] resize-none overflow-y-auto"
);
```

Panels:

- `worktree-paths`: `Base Directory`, `Default Base Branch`
- `worktree-bootstrap`: `Files to Copy`, `Install Command`, `Init Commands`
- `worktree-startup`: `Default Startup Command`
- `jira-connection`: `Enable Jira`, `Workspace URL`, `Email`, `Keychain Token Key`
- `jira-token`: `Status`, `API Token`, `Clear`

The Enable Jira control should be a checkbox-style button or native checkbox with a label:

```tsx
<input
  id="settings-jira-enabled"
  type="checkbox"
  checked={form.jira.enabled}
  onChange={(e) => updateJira({ enabled: e.target.checked })}
  disabled={busy}
/>
<Label htmlFor="settings-jira-enabled">Enable Jira</Label>
```

- [ ] **Step 7: Implement full save flow**

Replace `api.config.saveJira` in `save()` with:

```ts
const nextConfig = normalizeRepositorySettingsForm(form);
const configResult = await api.config.saveRepository({
  repoPath: selectedRepo.path,
  config: nextConfig,
});
```

Validation before calling IPC:

```ts
if (!nextConfig.worktree.baseDir) return showError("Enter a worktree base directory.");
if (!nextConfig.worktree.defaultBaseBranch) return showError("Enter a default base branch.");
if (!nextConfig.worktree.installCommand) return showError("Enter an install command.");
if (nextConfig.jira?.enabled) {
  if (!nextConfig.jira.workspaceUrl) return showError("Enter a Jira workspace URL.");
  if (!nextConfig.jira.email) return showError("Enter the Jira account email.");
  if (!nextConfig.jira.tokenKeychainKey) return showError("Enter a Keychain token key.");
}
```

After a successful config save, store token only when `token.trim()` is non-empty:

```ts
if (nextToken) {
  const tokenResult = await api.secrets.set({
    key: nextConfig.jira.tokenKeychainKey,
    value: nextToken,
  });
  if (!tokenResult.ok) {
    setSaveError("Repository config was saved, but the Jira token could not be stored.");
    setSupportingError(tokenResult.error.message);
    return;
  }
}
onClose();
```

- [ ] **Step 8: Run Settings tests**

Run:

```bash
pnpm vitest run test/renderer/settings/settingsForm.test.ts test/renderer/settings/Settings.test.tsx
```

Expected: PASS.

## Task 5: Final Verification

**Files:**

- Verify only unless tests expose needed changes.

- [ ] **Step 1: Run focused automated checks**

Run:

```bash
pnpm vitest run test/main/config/saveRepository.test.ts test/main/config/saveJira.test.ts test/main/config/load.test.ts test/renderer/settings/settingsForm.test.ts test/renderer/settings/Settings.test.tsx
pnpm typecheck
pnpm lint
```

Expected: PASS.

- [ ] **Step 2: Launch Electron through the required MCP**

Because this is a UI change, use `playwright-electron` MCP, not just Vitest.

Manual verification path:

1. Start the app from the main repo path, not a worktree path.
2. Open a repository.
3. Open Settings.
4. Confirm Radix modal opens with left nav and right panel.
5. Change `baseDir`, `defaultBaseBranch`, `filesToCopy`, and `initCommands`.
6. Switch to Jira, toggle `Enable Jira` off and on.
7. Save, reopen Settings, and confirm values persisted.
8. Enter a Jira token and confirm token status uses Keychain.
9. Confirm no renderer console errors or warnings.

- [ ] **Step 3: Adjacent flow check**

Create or start a new worktree flow after saving settings and verify:

- `newWorktree:create` uses the saved `worktree.baseDir`.
- `defaultBaseBranch` is passed to git worktree creation.
- bootstrap commands still read `filesToCopy`, `installCommand`, and `initCommands`.
- Jira disabled state causes the existing From Jira preflight notice to appear.

## Self-Review

- Spec coverage: Worktree editing, Jira enable toggle, Keychain-only token handling, Radix modal, left nav, full-config save, textarea array editing, and Electron verification are covered.
- Placeholder scan: No placeholder steps remain; every task names files, expected behavior, and commands.
- Type consistency: Plan uses `RepoConfigDto`, `RepoConfig`, `config:saveRepository`, `saveRepositoryConfig`, `RepositorySettingsForm`, and `SettingsSection` consistently.
