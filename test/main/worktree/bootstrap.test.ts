import { describe, it, expect, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Bootstrapper, type EventListener } from "@main/worktree/bootstrap";

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
    const events: Parameters<EventListener>[0][] = [];
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

  it("runs jobs through an injected step runner", async () => {
    const seen: string[] = [];
    const b = new Bootstrapper(async (key, input) => {
      seen.push(`${input.branch}:${key}`);
      return { ok: true };
    });

    const job = b.enqueue({
      jobId: "fake-runner-job",
      repoId: 1,
      mainRepoPath: mainRepo,
      branch: "feat-fake-runner",
      baseBranch: "main",
      worktreePath: join(tmp, "wt-fake-runner"),
      filesToCopy: [],
      installCommand: "true",
      initCommands: [],
    });

    await b.waitFor(job);

    expect(b.snapshot(job)!.status).toBe("done");
    expect(seen).toEqual([
      "feat-fake-runner:fetch",
      "feat-fake-runner:worktree-add",
      "feat-fake-runner:files-copy",
      "feat-fake-runner:clonefile",
      "feat-fake-runner:install",
      "feat-fake-runner:init-commands",
    ]);
  });

  it("runs multiple jobs in parallel", async () => {
    let active = 0;
    let maxActive = 0;
    let installEntries = 0;
    let releaseInstall!: () => void;
    let resolveBothInstalling!: () => void;
    const installGate = new Promise<void>((resolve) => {
      releaseInstall = resolve;
    });
    const bothInstalling = new Promise<void>((resolve) => {
      resolveBothInstalling = resolve;
    });

    const b = new Bootstrapper(async (key) => {
      if (key !== "install") return { ok: true };

      active += 1;
      installEntries += 1;
      maxActive = Math.max(maxActive, active);
      if (installEntries === 2) {
        resolveBothInstalling();
      }
      await installGate;
      active -= 1;
      return { ok: true };
    });

    const jobA = b.enqueue({
      jobId: "parallel-a",
      repoId: 1,
      mainRepoPath: mainRepo,
      branch: "feat-parallel-a",
      baseBranch: "main",
      worktreePath: join(tmp, "wt-parallel-a"),
      filesToCopy: [],
      installCommand: "true",
      initCommands: [],
    });
    const jobB = b.enqueue({
      jobId: "parallel-b",
      repoId: 1,
      mainRepoPath: mainRepo,
      branch: "feat-parallel-b",
      baseBranch: "main",
      worktreePath: join(tmp, "wt-parallel-b"),
      filesToCopy: [],
      installCommand: "true",
      initCommands: [],
    });

    await Promise.race([
      bothInstalling,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timed out waiting for both install steps")), 500)
      ),
    ]);

    expect(b.snapshot(jobA)!.status).toBe("running");
    expect(b.snapshot(jobB)!.status).toBe("running");
    expect(maxActive).toBe(2);

    releaseInstall();
    await Promise.all([b.waitFor(jobA), b.waitFor(jobB)]);

    expect(b.snapshot(jobA)!.status).toBe("done");
    expect(b.snapshot(jobB)!.status).toBe("done");
  });

  it("allows retry from a completed listener after a failed job", async () => {
    let installAttempts = 0;
    let retried = false;
    const b = new Bootstrapper(async (key) => {
      if (key !== "install") return { ok: true };

      installAttempts += 1;
      if (installAttempts === 1) {
        return { ok: false, error: { stderr: "install failed" } };
      }
      return { ok: true };
    });

    b.onEvent((event) => {
      if (event.kind !== "completed" || event.job.status !== "failed" || retried) return;
      retried = true;
      b.retry(event.job.id);
    });

    const job = b.enqueue({
      jobId: "retry-from-completed",
      repoId: 1,
      mainRepoPath: mainRepo,
      branch: "feat-retry-from-completed",
      baseBranch: "main",
      worktreePath: join(tmp, "wt-retry-from-completed"),
      filesToCopy: [],
      installCommand: "true",
      initCommands: [],
    });

    await b.waitFor(job);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(retried).toBe(true);
    expect(installAttempts).toBe(2);
    expect(b.snapshot(job)!.status).toBe("done");
  });

  it("allows retry from a failed updated listener", async () => {
    let installAttempts = 0;
    let retried = false;
    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });
    const b = new Bootstrapper(async (key) => {
      if (key !== "install") return { ok: true };

      installAttempts += 1;
      if (installAttempts === 1) {
        return { ok: false, error: { stderr: "install failed" } };
      }
      return { ok: true };
    });

    b.onEvent((event) => {
      if (event.kind === "updated" && event.job.status === "failed" && !retried) {
        retried = true;
        b.retry(event.job.id);
      }
      if (event.job.status === "done") {
        resolveDone();
      }
    });

    const job = b.enqueue({
      jobId: "retry-from-failed-update",
      repoId: 1,
      mainRepoPath: mainRepo,
      branch: "feat-retry-from-failed-update",
      baseBranch: "main",
      worktreePath: join(tmp, "wt-retry-from-failed-update"),
      filesToCopy: [],
      installCommand: "true",
      initCommands: [],
    });

    await Promise.race([
      done,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timed out waiting for retry to finish")), 500)
      ),
    ]);

    expect(retried).toBe(true);
    expect(installAttempts).toBe(2);
    expect(b.snapshot(job)!.status).toBe("done");
  });

  it("marks the active step failed when the step runner throws", async () => {
    const b = new Bootstrapper(async (key) => {
      if (key === "clonefile") {
        throw new Error("runner exploded");
      }
      return { ok: true };
    });

    const job = b.enqueue({
      jobId: "throwing-runner",
      repoId: 1,
      mainRepoPath: mainRepo,
      branch: "feat-throwing-runner",
      baseBranch: "main",
      worktreePath: join(tmp, "wt-throwing-runner"),
      filesToCopy: [],
      installCommand: "true",
      initCommands: [],
    });

    await b.waitFor(job);

    const snap = b.snapshot(job)!;
    expect(snap.status).toBe("failed");
    expect(snap.failedStep).toBe("clonefile");
    expect(snap.failureMessage).toBe("runner exploded");
    expect(snap.steps.find((step) => step.key === "clonefile")!.status).toBe("failed");
    expect(snap.steps.find((step) => step.key === "clonefile")!.message).toBe("runner exploded");
  });

  it("reports active conflicts for running and failed jobs", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const b = new Bootstrapper(async (key) => {
      if (key === "install") await gate;
      return { ok: true };
    });

    const runningJob = b.enqueue({
      jobId: "conflict-running",
      repoId: 1,
      mainRepoPath: mainRepo,
      branch: "feat-conflict",
      baseBranch: "main",
      worktreePath: join(tmp, "wt-conflict"),
      filesToCopy: [],
      installCommand: "true",
      initCommands: [],
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      b.findActiveConflict({
        repoId: 1,
        branch: "feat-conflict",
        worktreePath: join(tmp, "wt-conflict"),
      })
    ).toEqual({ existingPath: join(tmp, "wt-conflict") });

    release();
    await b.waitFor(runningJob);

    expect(
      b.findActiveConflict({
        repoId: 1,
        branch: "feat-conflict",
        worktreePath: join(tmp, "wt-conflict"),
      })
    ).toBeNull();
  });

  it("keeps a failed job as an active conflict until cancelled", async () => {
    const b = new Bootstrapper(async (key) =>
      key === "install" ? { ok: false, error: { stderr: "install failed" } } : { ok: true }
    );

    const failedJob = b.enqueue({
      jobId: "conflict-failed",
      repoId: 1,
      mainRepoPath: mainRepo,
      branch: "feat-failed-conflict",
      baseBranch: "main",
      worktreePath: join(tmp, "wt-failed-conflict"),
      filesToCopy: [],
      installCommand: "false",
      initCommands: [],
    });

    await b.waitFor(failedJob);

    expect(
      b.findActiveConflict({
        repoId: 1,
        branch: "feat-failed-conflict",
        worktreePath: join(tmp, "wt-failed-conflict"),
      })
    ).toEqual({ existingPath: join(tmp, "wt-failed-conflict") });

    b.cancel(failedJob);

    expect(
      b.findActiveConflict({
        repoId: 1,
        branch: "feat-failed-conflict",
        worktreePath: join(tmp, "wt-failed-conflict"),
      })
    ).toBeNull();
  });
});
