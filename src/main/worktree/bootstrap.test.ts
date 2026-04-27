import { describe, it, expect, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Bootstrapper } from "./bootstrap";

let tmp: string;
let upstream: string;
let mainRepo: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "sw-boot-"));
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

describe("Bootstrapper", () => {
  it("runs all steps to completion when commands succeed", async () => {
    const b = new Bootstrapper();
    const events: any[] = [];
    b.onEvent((e) => events.push(e));
    const job = b.enqueue({
      jobId: "j1",
      repoId: 1,
      mainRepoPath: mainRepo,
      branch: "feat-success",
      baseBranch: "main",
      worktreePath: join(tmp, "wt-success"),
      filesToCopy: [],
      installCommand: "true",
      initCommands: ["true"],
    });
    await b.waitFor(job);
    expect(b.snapshot("j1")!.status).toBe("done");
    expect(existsSync(join(tmp, "wt-success"))).toBe(true);
  });

  it("halts at the failing step", async () => {
    const b = new Bootstrapper();
    const job = b.enqueue({
      jobId: "j2",
      repoId: 1,
      mainRepoPath: mainRepo,
      branch: "feat-fail",
      baseBranch: "main",
      worktreePath: join(tmp, "wt-fail"),
      filesToCopy: [],
      installCommand: "false", // 5번째 단계(install)에서 실패
      initCommands: [],
    });
    await b.waitFor(job);
    const snap = b.snapshot("j2")!;
    expect(snap.status).toBe("failed");
    expect(snap.failedStep).toBe("install");
  });
});
