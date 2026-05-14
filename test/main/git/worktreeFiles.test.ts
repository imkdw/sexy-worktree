import { beforeAll, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getWorktreeFileDiff,
  getWorktreeStatus,
  listWorktreeFiles,
  parseGitStatusPorcelain,
  readWorktreeFile,
  writeWorktreeFile,
} from "@main/git/worktreeFiles";

let repo: string;

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "sw-files-"));
  execSync("git init -b main", { cwd: repo });
  mkdirSync(join(repo, "src"));
  writeFileSync(join(repo, "src/App.tsx"), "export const value = 1;\n");
  writeFileSync(join(repo, "README.md"), "# demo\n");
  writeFileSync(join(repo, ".gitignore"), "ignored.log\nbuild/\n");
  execSync(
    "git -c user.email=t@x -c user.name=t add . && git -c user.email=t@x -c user.name=t commit -m init",
    {
      cwd: repo,
      shell: "/bin/bash",
    }
  );
  writeFileSync(join(repo, "src/App.tsx"), "export const value = 2;\n");
  writeFileSync(join(repo, "scratch.txt"), "draft\n");
  mkdirSync(join(repo, "build"));
  writeFileSync(join(repo, "build/output.js"), "compiled\n");
  writeFileSync(join(repo, "ignored.log"), "debug\n");
});

describe("parseGitStatusPorcelain", () => {
  it("parses modified, untracked, and renamed records", () => {
    const changes = parseGitStatusPorcelain(
      [" M src/App.tsx", "?? scratch.txt", "R  src/New.ts", "src/Old.ts", ""].join("\0")
    );

    expect(changes).toEqual([
      {
        relativePath: "src/App.tsx",
        originalPath: null,
        status: "modified",
        indexStatus: " ",
        workingTreeStatus: "M",
      },
      {
        relativePath: "scratch.txt",
        originalPath: null,
        status: "untracked",
        indexStatus: "?",
        workingTreeStatus: "?",
      },
      {
        relativePath: "src/New.ts",
        originalPath: "src/Old.ts",
        status: "renamed",
        indexStatus: "R",
        workingTreeStatus: " ",
      },
    ]);
  });
});

describe("worktree file helpers", () => {
  it("lists tracked and untracked files as a depth-aware file tree", async () => {
    const result = await listWorktreeFiles(repo);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toContainEqual({
      relativePath: "src",
      name: "src",
      kind: "directory",
      depth: 0,
    });
    expect(result.value).toContainEqual({
      relativePath: "src/App.tsx",
      name: "App.tsx",
      kind: "file",
      depth: 1,
    });
    expect(result.value).toContainEqual({
      relativePath: "scratch.txt",
      name: "scratch.txt",
      kind: "file",
      depth: 0,
    });
    expect(result.value.map((entry) => entry.relativePath)).not.toContain("build");
    expect(result.value.map((entry) => entry.relativePath)).not.toContain("build/output.js");
    expect(result.value.map((entry) => entry.relativePath)).not.toContain("ignored.log");
  });

  it("returns git status changes for the worktree", async () => {
    const result = await getWorktreeStatus(repo);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((change) => [change.relativePath, change.status])).toEqual([
      ["src/App.tsx", "modified"],
      ["scratch.txt", "untracked"],
    ]);
  });

  it("reads, writes, and diffs text files inside the worktree", async () => {
    const read = await readWorktreeFile(repo, "src/App.tsx");
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.value.content).toBe("export const value = 2;\n");

    const written = await writeWorktreeFile(repo, "scratch.txt", "draft saved\n");
    expect(written.ok).toBe(true);
    if (written.ok) expect(written.value.content).toBe("draft saved\n");

    const diff = await getWorktreeFileDiff(repo, "src/App.tsx");
    expect(diff.ok).toBe(true);
    if (!diff.ok) return;
    expect(diff.value.status).toBe("modified");
    expect(diff.value.oldContent).toBe("export const value = 1;\n");
    expect(diff.value.newContent).toBe("export const value = 2;\n");
  });

  it("rejects path traversal outside the worktree", async () => {
    const result = await readWorktreeFile(repo, "../outside.txt");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("outside-worktree");
  });
});
