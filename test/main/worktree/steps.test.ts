import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stepFetch, stepWorktreeAdd, stepFilesCopy, stepInitCommands } from "@main/worktree/steps";

const originalEnv = { ...process.env };

let tmp: string;
let upstream: string;
let mainRepo: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "sw-steps-"));
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
  execSync("git checkout main 2>/dev/null || git checkout -b main", {
    cwd: mainRepo,
    stdio: "ignore",
    shell: "/bin/bash",
  });
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("stepFetch", () => {
  it("succeeds against a reachable remote", async () => {
    const r = await stepFetch({ repoPath: mainRepo });
    expect(r.ok).toBe(true);
  });
});

describe("stepWorktreeAdd", () => {
  it("creates a new branch from origin/<base>", async () => {
    await stepFetch({ repoPath: mainRepo });
    const wtPath = join(tmp, "wt");
    const r = await stepWorktreeAdd({
      repoPath: mainRepo,
      branchName: "feat-x",
      baseBranch: "main",
      worktreePath: wtPath,
    });
    expect(r.ok).toBe(true);
    expect(existsSync(wtPath)).toBe(true);
  });
});

describe("stepFilesCopy", () => {
  it("copies listed files from main into new worktree", async () => {
    await stepFetch({ repoPath: mainRepo });
    const wtPath = join(tmp, "wt2");
    await stepWorktreeAdd({
      repoPath: mainRepo,
      branchName: "feat-y",
      baseBranch: "main",
      worktreePath: wtPath,
    });
    writeFileSync(join(mainRepo, ".env.local"), "SECRET=1");
    const r = await stepFilesCopy({
      mainRepoPath: mainRepo,
      worktreePath: wtPath,
      files: [".env.local"],
    });
    expect(r.ok).toBe(true);
    expect(readFileSync(join(wtPath, ".env.local"), "utf8")).toBe("SECRET=1");
  });

  it("skips missing files silently (does not fail the job)", async () => {
    const wtPath = join(tmp, "wt3");
    mkdirSync(wtPath, { recursive: true });
    const r = await stepFilesCopy({
      mainRepoPath: mainRepo,
      worktreePath: wtPath,
      files: [".does-not-exist"],
    });
    expect(r.ok).toBe(true);
  });
});

describe("stepInitCommands", () => {
  it("runs commands with PATH resolved from the user's shell", async () => {
    const binDir = join(tmp, "bin");
    const yarnPath = join(binDir, "yarn");
    const shellPath = join(tmp, "fake-shell");
    const markerPath = join(tmp, "init-command-ran");

    mkdirSync(binDir);
    writeFileSync(
      yarnPath,
      `#!/bin/sh
touch "$1"
`
    );
    chmodSync(yarnPath, 0o755);

    writeFileSync(
      shellPath,
      `#!/bin/sh
PATH="${binDir}:$PATH" /bin/sh -c "$2"
`
    );
    chmodSync(shellPath, 0o755);

    process.env = {
      ...originalEnv,
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
      SHELL: shellPath,
    };

    const result = await stepInitCommands({
      worktreePath: tmp,
      initCommands: [`yarn "${markerPath}"`],
    });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(existsSync(markerPath)).toBe(true);
  });
});
