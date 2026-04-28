import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listWorktrees, parseWorktreePorcelain } from "@main/git/worktrees";

describe("parseWorktreePorcelain", () => {
  it("parses two entries", () => {
    const input = [
      "worktree /a",
      "HEAD abc",
      "branch refs/heads/main",
      "",
      "worktree /b",
      "HEAD def",
      "branch refs/heads/feature",
      "",
    ].join("\n");
    const out = parseWorktreePorcelain(input);
    expect(out).toEqual([
      { path: "/a", branch: "main", head: "abc", isMain: true },
      { path: "/b", branch: "feature", head: "def", isMain: false },
    ]);
  });

  it("handles detached HEAD entries", () => {
    const input = ["worktree /a", "HEAD abc", "detached", ""].join("\n");
    const out = parseWorktreePorcelain(input);
    expect(out).toEqual([{ path: "/a", branch: null, head: "abc", isMain: true }]);
  });

  it("filters out prunable worktrees (디렉터리 사라진 고아)", () => {
    const input = [
      "worktree /a",
      "HEAD abc",
      "branch refs/heads/main",
      "",
      "worktree /gone",
      "HEAD def",
      "branch refs/heads/orphan",
      "prunable gitdir file points to non-existent location",
      "",
    ].join("\n");
    const out = parseWorktreePorcelain(input);
    expect(out).toEqual([{ path: "/a", branch: "main", head: "abc", isMain: true }]);
  });
});

let repo: string;
beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "sw-wt-"));
  execSync("git init -b main", { cwd: repo });
  writeFileSync(join(repo, "r.md"), "x");
  execSync(
    "git -c user.email=t@x -c user.name=t add . && git -c user.email=t@x -c user.name=t commit -m init",
    {
      cwd: repo,
      shell: "/bin/bash",
    }
  );
  execSync(`git worktree add -b feat ${repo}-feat`, { cwd: repo });
});

describe("listWorktrees", () => {
  it("returns main + added worktree", async () => {
    const r = await listWorktrees(repo);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toHaveLength(2);
      expect(r.value[0]!.isMain).toBe(true);
      expect(r.value[1]!.branch).toBe("feat");
    }
  });
});
