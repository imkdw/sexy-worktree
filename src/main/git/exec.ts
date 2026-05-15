import { spawn } from "node:child_process";
import { ok, err, type Result } from "@shared/result";

export type GitError = { code: number; stderr: string; stdout: string };

export async function gitExecBuffer(
  args: string[],
  opts: { cwd: string; timeoutMs?: number }
): Promise<Result<Buffer, GitError>> {
  return await new Promise((resolve) => {
    const child = spawn("git", args, { cwd: opts.cwd, detached: true });
    const out: Buffer[] = [];
    const errs: Buffer[] = [];
    let timer: NodeJS.Timeout | null = null;
    let timedOut = false;
    if (opts.timeoutMs) {
      timer = setTimeout(() => {
        timedOut = true;
        killProcessGroup(child.pid);
      }, opts.timeoutMs);
    }
    child.stdout.on("data", (b: Buffer) => out.push(b));
    child.stderr.on("data", (b: Buffer) => errs.push(b));
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      resolve(err({ code: -1, stderr: e.message, stdout: "" }));
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      const stdout = Buffer.concat(out);
      const stderr = Buffer.concat(errs).toString("utf8");
      if (code === 0) resolve(ok(stdout));
      else
        resolve({
          ok: false,
          error: {
            code: code ?? -1,
            stderr: timedOut ? timeoutMessage(["git", ...args], opts.timeoutMs, stderr) : stderr,
            stdout: stdout.toString("utf8"),
          },
        });
    });
  });
}

export async function gitExec(
  args: string[],
  opts: { cwd: string; timeoutMs?: number }
): Promise<Result<string, GitError>> {
  const r = await gitExecBuffer(args, opts);
  if (!r.ok) return r;
  return ok(r.value.toString("utf8").trimEnd());
}

function killProcessGroup(pid: number | undefined): void {
  if (!pid) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Process already exited.
    }
  }
}

function timeoutMessage(command: string[], timeoutMs: number | undefined, stderr: string): string {
  const timeout = timeoutMs ? formatDuration(timeoutMs) : "the configured timeout";
  const detail = stderr.trim();
  return detail
    ? `Command timed out after ${timeout}: ${command.join(" ")}\n${detail}`
    : `Command timed out after ${timeout}: ${command.join(" ")}`;
}

function formatDuration(timeoutMs: number): string {
  if (timeoutMs % 60_000 === 0) return `${timeoutMs / 60_000}m`;
  if (timeoutMs % 1_000 === 0) return `${timeoutMs / 1_000}s`;
  return `${timeoutMs}ms`;
}
