import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateRepo } from "./validate";

let tempBase: string;
let mainRepo: string;
let worktreePath: string;
let nonGitDir: string;

beforeAll(() => {
  tempBase = mkdtempSync(join(tmpdir(), "sw-validate-"));
  mainRepo = join(tempBase, "main");
  mkdirSync(mainRepo, { recursive: true });
  execSync("git init -b main", { cwd: mainRepo });
  writeFileSync(join(mainRepo, "README.md"), "# x\n");
  execSync(
    "git -c user.email=t@x -c user.name=t add . && git -c user.email=t@x -c user.name=t commit -m init",
    {
      cwd: mainRepo,
      shell: "/bin/bash",
    }
  );
  worktreePath = join(tempBase, "wt");
  execSync(`git worktree add -b feature ${worktreePath}`, { cwd: mainRepo });
  nonGitDir = join(tempBase, "plain");
  mkdirSync(nonGitDir);
});

describe("validateRepo", () => {
  it("accepts a main-repo path", async () => {
    const r = await validateRepo(mainRepo);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.canonicalPath).toBe(mainRepo);
  });

  it("rejects a worktree path with the main repo path attached", async () => {
    const r = await validateRepo(worktreePath);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("is-a-worktree");
    if (!r.ok && r.error.kind === "is-a-worktree") {
      expect(r.error.mainRepoPath).toBe(mainRepo);
    }
  });

  it("rejects a non-git directory", async () => {
    const r = await validateRepo(nonGitDir);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("not-a-git-repo");
  });
});
