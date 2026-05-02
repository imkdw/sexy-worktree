import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "@main/config/defaults";
import { saveRepositoryConfig } from "@main/config/saveRepository";
import type { RepoConfig } from "@main/config/schema";

function tmpRepo(): string {
  return mkdtempSync(join(tmpdir(), "sexy-worktree-config-"));
}

function configPath(repoPath: string): string {
  return join(repoPath, ".sexyworktree/config.json");
}

function readConfig(repoPath: string): RepoConfig {
  return JSON.parse(readFileSync(configPath(repoPath), "utf8")) as RepoConfig;
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
    expect(result.value.configPath).toBe(configPath(repoPath));
    expect(result.value.config).toEqual(config);
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

  it("stores disabled Jira even when connection fields are blank", async () => {
    const repoPath = tmpRepo();
    const config: RepoConfig = {
      ...DEFAULT_CONFIG,
      jira: {
        enabled: false,
        workspaceUrl: "",
        email: "",
        tokenKeychainKey: "",
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
    if (result.error.kind !== "invalid") return;
    expect(result.error.issues.join(" ")).toContain("worktree.baseDir");
    expect(existsSync(configPath(repoPath))).toBe(false);
  });

  it("replaces an existing config atomically", async () => {
    const repoPath = tmpRepo();
    mkdirSync(join(repoPath, ".sexyworktree"));
    writeFileSync(configPath(repoPath), JSON.stringify(DEFAULT_CONFIG), { flag: "wx" });

    const nextConfig: RepoConfig = {
      ...DEFAULT_CONFIG,
      worktree: { ...DEFAULT_CONFIG.worktree, defaultBaseBranch: "release" },
    };

    const result = await saveRepositoryConfig({ repoPath, config: nextConfig });

    expect(result.ok).toBe(true);
    expect(readConfig(repoPath).worktree.defaultBaseBranch).toBe("release");
  });
});
