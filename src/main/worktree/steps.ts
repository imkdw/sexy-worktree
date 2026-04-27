import { spawn } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { ok, err, type Result } from "@shared/result";
import { gitExec } from "../git/exec";

export type StepError = { stderr: string; code: number };

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
  // macOS APFS의 Copy-on-Write 활용: cp -c
  return await runShell("cp", ["-c", "-R", src, dst]);
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

function runShell(
  cmd: string,
  argv: string[],
  cwd?: string,
  timeoutMs = 60_000
): Promise<Result<void, StepError>> {
  return new Promise((resolve) => {
    const child = spawn(cmd, argv, { cwd, env: process.env });
    const errs: Buffer[] = [];
    let timer: NodeJS.Timeout | null = null;
    if (timeoutMs) timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
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
      else resolve(err({ stderr, code: code ?? -1 }));
    });
  });
}
