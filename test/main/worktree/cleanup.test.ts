import { beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupGeneratedWorktree } from "@main/worktree/cleanup";

let tmp: string;
let upstream: string;
let mainRepo: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "sw-cleanup-"));
  upstream = join(tmp, "upstream");
  mainRepo = join(tmp, "main");
  execSync(`git init --bare ${upstream}`);
  execSync(`git clone ${upstream} ${mainRepo}`, { stdio: "ignore" });
  writeFileSync(join(mainRepo, "README.md"), "# x");
  execSync(
    "git -c user.email=t@x -c user.name=t add . && git -c user.email=t@x -c user.name=t commit -m init && git push origin HEAD:main",
    {
      cwd: mainRepo,
      shell: "/bin/bash",
      stdio: "ignore",
    }
  );
});

describe("cleanupGeneratedWorktree", () => {
  it("removes the generated worktree and branch", async () => {
    const worktreePath = join(tmp, "wt-cleanup");
    execSync(`git fetch origin && git worktree add ${worktreePath} -b feat-cleanup origin/main`, {
      cwd: mainRepo,
      shell: "/bin/bash",
      stdio: "ignore",
    });

    const result = await cleanupGeneratedWorktree({
      repoPath: mainRepo,
      worktreePath,
      branchName: "feat-cleanup",
      removeBranch: true,
    });

    expect(result.ok).toBe(true);
    expect(existsSync(worktreePath)).toBe(false);
    expect(() =>
      execSync("git rev-parse --verify refs/heads/feat-cleanup", {
        cwd: mainRepo,
        stdio: "ignore",
      })
    ).toThrow();
  });

  it("does not delete an unrelated existing branch when worktree add never completed", async () => {
    execSync("git branch preexisting-branch", { cwd: mainRepo });

    const result = await cleanupGeneratedWorktree({
      repoPath: mainRepo,
      worktreePath: join(tmp, "missing-wt"),
      branchName: "preexisting-branch",
      removeBranch: false,
    });

    expect(result.ok).toBe(true);
    expect(
      execSync("git rev-parse --verify refs/heads/preexisting-branch", { cwd: mainRepo })
    ).toBeTruthy();
  });
});
