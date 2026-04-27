import { spawn } from "node:child_process";
import { ok, err, type Result } from "@shared/result";

export type GitError = { code: number; stderr: string; stdout: string };

export async function gitExec(
  args: string[],
  opts: { cwd: string; timeoutMs?: number }
): Promise<Result<string, GitError>> {
  return await new Promise((resolve) => {
    const child = spawn("git", args, { cwd: opts.cwd });
    const out: Buffer[] = [];
    const errs: Buffer[] = [];
    let timer: NodeJS.Timeout | null = null;
    if (opts.timeoutMs) {
      timer = setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs);
    }
    child.stdout.on("data", (b: Buffer) => out.push(b));
    child.stderr.on("data", (b: Buffer) => errs.push(b));
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      resolve(err({ code: -1, stderr: e.message, stdout: "" }));
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      const stdout = Buffer.concat(out).toString("utf8");
      const stderr = Buffer.concat(errs).toString("utf8");
      if (code === 0) resolve(ok(stdout.trimEnd()));
      else resolve(err({ code: code ?? -1, stderr, stdout }));
    });
  });
}
