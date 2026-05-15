import { spawn } from "node:child_process";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { ok, err, type Result } from "@shared/result";
import { gitExec } from "../git/exec";

export type StepError = { stderr: string; code: number };

const DEFAULT_SHELL = "/bin/zsh";
const SHELL_PATH_TIMEOUT_MS = 5_000;
const CLONEFILE_TIMEOUT_MS = 600_000;

let userShellPathCache: { key: string; value: Promise<string | null> } | null = null;

/**
 * `git fetch origin`을 실행해 원격 브랜치 정보를 갱신한다.
 */
export async function stepFetch(args: { repoPath: string }): Promise<Result<void, StepError>> {
  const r = await gitExec(["fetch", "origin"], { cwd: args.repoPath, timeoutMs: 60_000 });
  return r.ok ? ok(undefined) : err({ stderr: r.error.stderr, code: r.error.code });
}

/**
 * `origin/<base>`를 기준으로 새 브랜치를 만들면서 워크트리를 추가한다.
 */
export async function stepWorktreeAdd(args: {
  repoPath: string;
  branchName: string;
  baseBranch: string;
  worktreePath: string;
}): Promise<Result<void, StepError>> {
  const r = await gitExec(
    ["worktree", "add", args.worktreePath, "-b", args.branchName, `origin/${args.baseBranch}`],
    {
      cwd: args.repoPath,
      timeoutMs: 30_000,
    }
  );
  return r.ok ? ok(undefined) : err({ stderr: r.error.stderr, code: r.error.code });
}

/**
 * 메인 저장소에서 워크트리로 지정된 파일 목록을 복사한다.
 * 원본이 없는 항목은 오류 없이 건너뛴다.
 */
export async function stepFilesCopy(args: {
  mainRepoPath: string;
  worktreePath: string;
  files: string[];
}): Promise<Result<void, StepError>> {
  for (const rel of args.files) {
    const src = join(args.mainRepoPath, rel);
    if (!existsSync(src)) continue; // 누락된 선택 파일은 조용히 건너뜀
    const dst = join(args.worktreePath, rel);
    try {
      await mkdir(dirname(dst), { recursive: true });
      await copyFile(src, dst);
    } catch (e) {
      return err({ stderr: (e as Error).message, code: -1 });
    }
  }
  return ok(undefined);
}

/**
 * APFS Copy-on-Write를 이용해 `node_modules`를 빠르게 복제한다.
 * 메인 저장소에 `node_modules`가 없으면 아무 작업도 하지 않는다.
 */
export async function stepClonefileNodeModules(args: {
  mainRepoPath: string;
  worktreePath: string;
}): Promise<Result<void, StepError>> {
  const src = join(args.mainRepoPath, "node_modules");
  if (!existsSync(src)) return ok(undefined); // 복제할 대상이 없음
  const dst = join(args.worktreePath, "node_modules");

  try {
    await rm(dst, { recursive: true, force: true });
  } catch (e) {
    return err({ stderr: (e as Error).message, code: -1 });
  }

  // macOS APFS의 Copy-on-Write 활용: cp -c
  const result = await runShell("cp", ["-c", "-R", src, dst], undefined, CLONEFILE_TIMEOUT_MS);
  if (result.ok) return result;

  try {
    await rm(dst, { recursive: true, force: true });
  } catch (e) {
    return err({
      stderr: `${result.error.stderr}\nFailed to clean partial node_modules clone: ${(e as Error).message}`,
      code: result.error.code,
    });
  }

  return result;
}

/**
 * 사용자가 정의한 의존성 설치 명령을 워크트리 디렉터리에서 실행한다.
 */
export async function stepInstall(args: {
  worktreePath: string;
  installCommand: string;
}): Promise<Result<void, StepError>> {
  return await runShell("/bin/sh", ["-c", args.installCommand], args.worktreePath, 600_000);
}

/**
 * 초기화 명령들을 순차 실행한다. 하나라도 실패하면 즉시 중단한다.
 */
export async function stepInitCommands(args: {
  worktreePath: string;
  initCommands: string[];
}): Promise<Result<void, StepError>> {
  for (const cmd of args.initCommands) {
    const r = await runShell("/bin/sh", ["-c", cmd], args.worktreePath, 600_000);
    if (!r.ok) return r;
  }
  return ok(undefined);
}

async function runShell(
  cmd: string,
  argv: string[],
  cwd?: string,
  timeoutMs = 60_000
): Promise<Result<void, StepError>> {
  const env = await commandEnvironment();

  return new Promise((resolve) => {
    const child = spawn(cmd, argv, { cwd, env, detached: true });
    const errs: Buffer[] = [];
    let timer: NodeJS.Timeout | null = null;
    let timedOut = false;
    if (timeoutMs)
      timer = setTimeout(() => {
        timedOut = true;
        killProcessGroup(child.pid);
      }, timeoutMs);
    child.stderr.on("data", (b) => errs.push(b));
    child.stdout.on("data", () => {
      /* 버퍼만 비우고 사용하지 않음 */
    });
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      resolve(err({ stderr: e.message, code: -1 }));
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      const stderr = Buffer.concat(errs).toString("utf8");
      if (code === 0) resolve(ok(undefined));
      else
        resolve(
          err({
            stderr: timedOut ? timeoutMessage(cmd, argv, timeoutMs, stderr) : stderr,
            code: code ?? -1,
          })
        );
    });
  });
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

function timeoutMessage(cmd: string, argv: string[], timeoutMs: number, stderr: string): string {
  const command = [cmd, ...argv].join(" ");
  const timeout = formatDuration(timeoutMs);
  const detail = stderr.trim();
  return detail
    ? `Command timed out after ${timeout}: ${command}\n${detail}`
    : `Command timed out after ${timeout}: ${command}`;
}

function formatDuration(timeoutMs: number): string {
  if (timeoutMs % 60_000 === 0) return `${timeoutMs / 60_000}m`;
  if (timeoutMs % 1_000 === 0) return `${timeoutMs / 1_000}s`;
  return `${timeoutMs}ms`;
}

async function commandEnvironment(): Promise<NodeJS.ProcessEnv> {
  const userShellPath = await resolveUserShellPath(process.env);
  return {
    ...process.env,
    PATH: mergePathValues(
      userShellPath,
      process.env.PATH,
      ...fallbackDeveloperPathEntries(process.env.HOME)
    ),
  };
}

async function resolveUserShellPath(env: NodeJS.ProcessEnv): Promise<string | null> {
  const shell = env.SHELL && existsSync(env.SHELL) ? env.SHELL : DEFAULT_SHELL;
  if (!existsSync(shell)) return null;

  const key = [shell, env.HOME ?? "", env.PATH ?? ""].join("\0");
  if (!userShellPathCache || userShellPathCache.key !== key) {
    userShellPathCache = { key, value: readPathFromShell(shell, env) };
  }

  return await userShellPathCache.value;
}

function readPathFromShell(shell: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  return new Promise((resolve) => {
    const marker = `__SEXY_WORKTREE_PATH_${process.pid}_${Date.now()}__`;
    const child = spawn(shell, ["-ilc", `printf '\\n${marker}\\n%s\\n${marker}\\n' "$PATH"`], {
      env,
    });
    const out: Buffer[] = [];
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      child.kill("SIGKILL");
      resolve(null);
    }, SHELL_PATH_TIMEOUT_MS);

    child.stdout.on("data", (b: Buffer) => out.push(b));
    child.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(null);
    });
    child.on("close", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(extractMarkedValue(Buffer.concat(out).toString("utf8"), marker));
    });
  });
}

function extractMarkedValue(stdout: string, marker: string): string | null {
  const markerLine = `\n${marker}\n`;
  const start = stdout.indexOf(markerLine);
  if (start === -1) return null;
  const valueStart = start + markerLine.length;
  const end = stdout.indexOf(markerLine, valueStart);
  if (end === -1) return null;
  const value = stdout.slice(valueStart, end).trim();
  return value ? value : null;
}

function fallbackDeveloperPathEntries(home?: string): string[] {
  const homeEntries = home
    ? [
        join(home, ".volta", "bin"),
        join(home, ".asdf", "shims"),
        join(home, ".local", "bin"),
        join(home, "Library", "pnpm"),
        join(home, ".bun", "bin"),
        join(home, ".yarn", "bin"),
        join(home, "bin"),
      ]
    : [];

  return [
    ...homeEntries,
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ];
}

function mergePathValues(...values: Array<string | undefined | null>): string {
  const entries = values.flatMap((value) => value?.split(":") ?? []);
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    merged.push(trimmed);
  }

  return merged.join(":");
}
