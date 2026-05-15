import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitExec } from "@main/git/exec";

let repo: string;
beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "sw-exec-"));
  execSync("git init -b main", { cwd: repo });
  writeFileSync(join(repo, "README.md"), "x");
  execSync(
    "git -c user.email=t@x -c user.name=t add . && git -c user.email=t@x -c user.name=t commit -m init",
    {
      cwd: repo,
      shell: "/bin/bash",
    }
  );
});

describe("gitExec", () => {
  it("returns trimmed stdout for a successful command", async () => {
    const r = await gitExec(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repo });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("main");
  });

  it("returns stderr in the error envelope on non-zero exit", async () => {
    const r = await gitExec(["status", "--unknown-flag"], { cwd: repo });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.stderr).toMatch(/usage|unknown/i);
  });

  it("reports a clear timeout message", async () => {
    const r = await gitExec(["-c", "alias.pause=!sleep 1", "pause"], {
      cwd: repo,
      timeoutMs: 10,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.stderr).toContain("Command timed out after 10ms: git -c");
  });
});
