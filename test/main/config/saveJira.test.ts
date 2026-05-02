import { beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { DEFAULT_CONFIG } from "@main/config/defaults";
import { saveJiraConfig } from "@main/config/saveJira";

let tmp: string;

const jira = {
  enabled: true,
  workspaceUrl: "https://example.atlassian.net",
  email: "dev@example.com",
  tokenKeychainKey: "jira.example",
} as const;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "sw-save-jira-"));
});

describe("saveJiraConfig", () => {
  it("creates .sexyworktree/config.json from defaults when the file is missing", async () => {
    const r = await saveJiraConfig({ repoPath: tmp, jira });

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const file = join(tmp, ".sexyworktree", "config.json");
    expect(r.value.configPath).toBe(file);
    expect(existsSync(file)).toBe(true);

    const expected = { ...DEFAULT_CONFIG, jira };
    const saved = JSON.parse(readFileSync(file, "utf8")) as typeof expected;

    expect(r.value.config).toEqual(expected);
    expect(saved).toEqual(expected);
  });

  it("preserves existing worktree and branch validation config while replacing jira", async () => {
    const existingWorktree = {
      baseDir: "../custom-wt",
      defaultBaseBranch: "develop",
      filesToCopy: [".env.local"],
      installCommand: "pnpm install",
      initCommands: ["pnpm build"],
      defaultStartupCommand: "pnpm dev",
    };
    const branchValidation = { requireJiraPattern: true };

    mkdirSync(join(tmp, ".sexyworktree"));
    writeFileSync(
      join(tmp, ".sexyworktree", "config.json"),
      JSON.stringify(
        {
          version: 1,
          worktree: existingWorktree,
          jira: {
            enabled: true,
            workspaceUrl: "https://old.atlassian.net",
            email: "old@example.com",
            tokenKeychainKey: "jira.old",
          },
          branchValidation,
        },
        null,
        2
      )
    );

    const r = await saveJiraConfig({ repoPath: tmp, jira });

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.value.config.worktree).toEqual(existingWorktree);
    expect(r.value.config.branchValidation).toEqual(branchValidation);
    expect(r.value.config.jira).toEqual(jira);

    const saved = JSON.parse(
      readFileSync(join(tmp, ".sexyworktree", "config.json"), "utf8")
    ) as {
      jira: typeof jira;
      worktree: typeof existingWorktree;
      branchValidation: typeof branchValidation;
    };

    expect(saved.jira).toEqual(jira);
    expect(saved.worktree).toEqual(existingWorktree);
    expect(saved.branchValidation).toEqual(branchValidation);
  });

  it("returns invalid when the existing config cannot be parsed by the schema", async () => {
    mkdirSync(join(tmp, ".sexyworktree"));
    const file = join(tmp, ".sexyworktree", "config.json");
    const invalidConfig = JSON.stringify({ version: 99 });
    writeFileSync(file, invalidConfig);

    const r = await saveJiraConfig({ repoPath: tmp, jira });

    expect(r.ok).toBe(false);
    if (r.ok) return;

    expect(r.error.kind).toBe("invalid");
    if (r.error.kind !== "invalid") return;
    expect(r.error.issues.join("\n")).toContain("version");
    expect(readFileSync(file, "utf8")).toBe(invalidConfig);
  });

  it("returns unreadable when the existing config path is a directory", async () => {
    mkdirSync(join(tmp, ".sexyworktree"));
    mkdirSync(join(tmp, ".sexyworktree", "config.json"));

    const r = await saveJiraConfig({ repoPath: tmp, jira });

    expect(r.ok).toBe(false);
    if (r.ok) return;

    expect(r.error.kind).toBe("unreadable");
  });

  it("returns write-failed when the config directory path is blocked by a file", async () => {
    writeFileSync(join(tmp, ".sexyworktree"), "not a directory");

    const r = await saveJiraConfig({ repoPath: tmp, jira });

    expect(r.ok).toBe(false);
    if (r.ok) return;

    expect(r.error.kind).toBe("write-failed");
    if (r.error.kind !== "write-failed") return;
    expect(r.error.message).toContain(".sexyworktree");
  });
});
