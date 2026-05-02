import { describe, expect, it } from "vitest";
import {
  arrayToLines,
  formFromConfig,
  linesToArray,
  normalizeRepositorySettingsForm,
  type RepositorySettingsForm,
} from "../../../src/renderer/settings/settingsForm";
import type { RepoConfigDto } from "@shared/ipc";

describe("settingsForm", () => {
  it("converts arrays to newline text and back while dropping empty lines", () => {
    expect(arrayToLines([".env.local", ".npmrc"])).toBe(".env.local\n.npmrc");
    expect(linesToArray(" .env.local \n\n .npmrc \n")).toEqual([".env.local", ".npmrc"]);
  });

  it("creates editable form text from repository config values", () => {
    const config: RepoConfigDto = {
      version: 1,
      worktree: {
        baseDir: "../worktrees",
        defaultBaseBranch: "main",
        filesToCopy: [".env.local", ".npmrc"],
        installCommand: "pnpm install",
        initCommands: ["pnpm build", "pnpm test"],
      },
      jira: {
        enabled: true,
        workspaceUrl: "https://pgmworks.atlassian.net",
        email: "imkdw@pgmworks.com",
        tokenKeychainKey: "jira.ppl-monorepo",
      },
    };

    expect(formFromConfig(config, "jira.default")).toEqual({
      worktree: {
        baseDir: "../worktrees",
        defaultBaseBranch: "main",
        filesToCopyText: ".env.local\n.npmrc",
        installCommand: "pnpm install",
        initCommandsText: "pnpm build\npnpm test",
      },
      jira: {
        enabled: true,
        workspaceUrl: "https://pgmworks.atlassian.net",
        email: "imkdw@pgmworks.com",
        tokenKeychainKey: "jira.ppl-monorepo",
      },
    });
  });

  it("uses defaults for missing Jira config when creating editable form values", () => {
    const config: RepoConfigDto = {
      version: 1,
      worktree: {
        baseDir: "../worktrees",
        defaultBaseBranch: "main",
        filesToCopy: [],
        installCommand: "pnpm install",
        initCommands: [],
      },
    };

    expect(formFromConfig(config, "jira.default")).toEqual({
      worktree: {
        baseDir: "../worktrees",
        defaultBaseBranch: "main",
        filesToCopyText: "",
        installCommand: "pnpm install",
        initCommandsText: "",
      },
      jira: {
        enabled: false,
        workspaceUrl: "",
        email: "",
        tokenKeychainKey: "jira.default",
      },
    });
  });

  it("omits missing disabled Jira values when normalizing a default config form", () => {
    const config: RepoConfigDto = {
      version: 1,
      worktree: {
        baseDir: "../worktrees",
        defaultBaseBranch: "main",
        filesToCopy: [],
        installCommand: "pnpm install",
        initCommands: [],
      },
      branchValidation: { requireJiraPattern: true },
    };

    expect(normalizeRepositorySettingsForm(formFromConfig(config, "jira.default"), config)).toEqual(
      config
    );
  });

  it("normalizes worktree and enabled Jira form values", () => {
    const form: RepositorySettingsForm = {
      worktree: {
        baseDir: " ../worktrees ",
        defaultBaseBranch: " main ",
        filesToCopyText: ".env.local\n",
        installCommand: " yarn install ",
        initCommandsText: "yarn build\n\n",
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
