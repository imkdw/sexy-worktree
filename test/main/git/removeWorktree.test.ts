import { describe, it, expect, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeWorktree } from "@main/git/removeWorktree";

let tmp: string;
let repo: string;
let wt: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "sw-rm-"));
  repo = join(tmp, "main");
  execSync(`git init -b main ${repo}`, { stdio: "ignore" });
  writeFileSync(join(repo, "r.md"), "x");
  execSync(
    "git -c user.email=t@x -c user.name=t add . && git -c user.email=t@x -c user.name=t commit -m init",
    {
      cwd: repo,
      shell: "/bin/bash",
      stdio: "ignore",
    }
  );
  wt = join(tmp, "wt");
  execSync(`git worktree add -b feat ${wt}`, { cwd: repo, stdio: "ignore" });
});

describe("removeWorktree", () => {
  it("force-removes the worktree and deletes the directory", async () => {
    writeFileSync(join(wt, "dirty.txt"), "wip");
    const r = await removeWorktree({ repoPath: repo, worktreePath: wt });
    expect(r.ok).toBe(true);
    expect(existsSync(wt)).toBe(false);
  });
});
