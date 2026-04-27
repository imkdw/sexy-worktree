import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitExec } from "./exec";

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
});
